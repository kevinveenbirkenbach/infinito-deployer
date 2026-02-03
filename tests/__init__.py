from __future__ import annotations

# Ensure repo-local apps are importable in tests without installing packages.
import sys
import types
from pathlib import Path

repo_root = Path(__file__).resolve().parents[1]
api_root = repo_root / "apps" / "api"

if str(api_root) not in sys.path:
    sys.path.insert(0, str(api_root))

# Ensure the correct "services" package (from apps/api) is loaded.
try:  # pragma: no cover
    import importlib

    sys.modules.pop("services", None)
    importlib.import_module("services")
except Exception:
    pass

# Provide minimal FastAPI stubs when the dependency is not installed.
try:  # pragma: no cover - fastapi is optional in unit tests
    import fastapi as _fastapi  # noqa: F401
except Exception:  # pragma: no cover
    fastapi_stub = types.ModuleType("fastapi")
    responses_stub = types.ModuleType("fastapi.responses")
    middleware_stub = types.ModuleType("fastapi.middleware")
    cors_stub = types.ModuleType("fastapi.middleware.cors")

    def _route_decorator(*_args, **_kwargs):
        def _wrap(fn):
            return fn

        return _wrap

    class APIRouter:
        def __init__(self, prefix: str = "", tags=None) -> None:
            self.prefix = prefix
            self.tags = tags or []

        def get(self, *_args, **_kwargs):
            return _route_decorator()

        def post(self, *_args, **_kwargs):
            return _route_decorator()

        def include_router(self, *_args, **_kwargs):
            return None

    class Request:
        async def is_disconnected(self) -> bool:  # pragma: no cover
            return False

    class FastAPI:
        def __init__(self, *_, **__) -> None:
            self.title = ""
            self.version = ""

        def add_middleware(self, *_args, **_kwargs):
            return None

        def include_router(self, *_args, **_kwargs):
            return None

        def get(self, *_args, **_kwargs):
            return _route_decorator()

    def Query(*_args, **_kwargs):
        if _args:
            return _args[0]
        return _kwargs.get("default")

    class HTTPException(Exception):
        def __init__(self, status_code: int = 500, detail: str | None = None):
            super().__init__(detail or "")
            self.status_code = status_code
            self.detail = detail

    class StreamingResponse:
        def __init__(self, *_args, **_kwargs) -> None:
            pass

    fastapi_stub.APIRouter = APIRouter
    fastapi_stub.Request = Request
    fastapi_stub.HTTPException = HTTPException
    fastapi_stub.FastAPI = FastAPI
    fastapi_stub.Query = Query
    responses_stub.StreamingResponse = StreamingResponse
    cors_stub.CORSMiddleware = object
    middleware_stub.cors = cors_stub
    fastapi_stub.responses = responses_stub

    sys.modules.setdefault("fastapi", fastapi_stub)
    sys.modules.setdefault("fastapi.responses", responses_stub)
    sys.modules.setdefault("fastapi.middleware", middleware_stub)
    sys.modules.setdefault("fastapi.middleware.cors", cors_stub)

# Provide minimal Pydantic stubs when the dependency is not installed.
try:  # pragma: no cover - pydantic is optional in unit tests
    import pydantic as _pydantic  # noqa: F401
except Exception:  # pragma: no cover
    pydantic_stub = types.ModuleType("pydantic")

    class _Missing:
        pass

    _MISSING = _Missing()

    class _FieldInfo:
        def __init__(self, default=_MISSING, default_factory=None):
            self.default = default
            self.default_factory = default_factory

    def Field(default=_MISSING, *_, default_factory=None, **__):
        return _FieldInfo(default=default, default_factory=default_factory)

    def _noop_decorator(*_args, **_kwargs):
        def _wrap(fn):
            return fn

        return _wrap

    def field_validator(*_args, **_kwargs):
        return _noop_decorator()

    def model_validator(*_args, **_kwargs):
        return _noop_decorator()

    class BaseModel:
        def __init__(self, **data):
            annotations = getattr(self.__class__, "__annotations__", {})
            for name, _ann in annotations.items():
                if name in data:
                    continue
                default = getattr(self.__class__, name, _MISSING)
                if isinstance(default, _FieldInfo):
                    if default.default_factory is not None:
                        setattr(self, name, default.default_factory())
                    elif default.default is not _MISSING:
                        setattr(self, name, default.default)
                elif default is not _MISSING:
                    setattr(self, name, default)

            for key, value in data.items():
                ann = annotations.get(key)
                if isinstance(ann, str):
                    module = sys.modules.get(self.__class__.__module__)
                    if module is not None and hasattr(module, ann):
                        ann = getattr(module, ann)
                if (
                    isinstance(ann, type)
                    and issubclass(ann, BaseModel)
                    and isinstance(value, dict)
                ):
                    value = ann(**value)
                setattr(self, key, value)

        def model_dump(self):
            return _dump(self)

    def _dump(value):
        if isinstance(value, BaseModel):
            return {k: _dump(v) for k, v in value.__dict__.items()}
        if isinstance(value, dict):
            return {k: _dump(v) for k, v in value.items()}
        if isinstance(value, list):
            return [_dump(v) for v in value]
        return value

    pydantic_stub.BaseModel = BaseModel
    pydantic_stub.Field = Field
    pydantic_stub.field_validator = field_validator
    pydantic_stub.model_validator = model_validator

    sys.modules.setdefault("pydantic", pydantic_stub)

# Provide minimal httpx stub for modules that import it during tests.
try:  # pragma: no cover
    import httpx as _httpx  # noqa: F401
except Exception:  # pragma: no cover
    httpx_stub = types.ModuleType("httpx")

    class Response:
        def __init__(self, status_code=404):
            self.status_code = status_code
            self.headers = {}

    def get(*_args, **_kwargs):
        return Response()

    class Client:
        def __init__(self, *_, **__):
            pass

        def get(self, *_args, **_kwargs):
            return Response()

    httpx_stub.get = get
    httpx_stub.Response = Response
    httpx_stub.Client = Client

    sys.modules.setdefault("httpx", httpx_stub)
