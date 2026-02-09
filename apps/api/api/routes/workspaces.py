from __future__ import annotations

from functools import lru_cache

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from api.schemas.workspace import (
    WorkspaceCreateOut,
    WorkspaceCredentialsIn,
    WorkspaceCredentialsOut,
    WorkspaceFileDeleteOut,
    WorkspaceFileListOut,
    WorkspaceFileOut,
    WorkspaceFileRenameIn,
    WorkspaceFileRenameOut,
    WorkspaceDirCreateOut,
    WorkspaceFileWriteIn,
    WorkspaceGenerateIn,
    WorkspaceGenerateOut,
    WorkspaceUploadOut,
)
from services.workspaces import WorkspaceService

router = APIRouter(prefix="/workspaces", tags=["workspaces"])


@lru_cache(maxsize=1)
def _svc() -> WorkspaceService:
    return WorkspaceService()


@router.post("", response_model=WorkspaceCreateOut)
def create_workspace() -> WorkspaceCreateOut:
    meta = _svc().create()
    return WorkspaceCreateOut(
        workspace_id=meta.get("workspace_id"),
        created_at=meta.get("created_at"),
    )


@router.post("/{workspace_id}/generate-inventory", response_model=WorkspaceGenerateOut)
def generate_inventory(
    workspace_id: str, req: WorkspaceGenerateIn
) -> WorkspaceGenerateOut:
    _svc().generate_inventory(workspace_id, req.model_dump())
    files = _svc().list_files(workspace_id)
    return WorkspaceGenerateOut(
        workspace_id=workspace_id,
        inventory_path="inventory.yml",
        files=files,
        warnings=[],
    )


@router.get("/{workspace_id}/files", response_model=WorkspaceFileListOut)
def list_files(workspace_id: str) -> WorkspaceFileListOut:
    return WorkspaceFileListOut(files=_svc().list_files(workspace_id))


@router.get("/{workspace_id}/files/{path:path}", response_model=WorkspaceFileOut)
def read_file(workspace_id: str, path: str) -> WorkspaceFileOut:
    content = _svc().read_file(workspace_id, path)
    return WorkspaceFileOut(path=path, content=content)


@router.put("/{workspace_id}/files/{path:path}", response_model=WorkspaceFileOut)
def write_file(
    workspace_id: str, path: str, payload: WorkspaceFileWriteIn
) -> WorkspaceFileOut:
    _svc().write_file(workspace_id, path, payload.content)
    return WorkspaceFileOut(path=path, content=payload.content)


@router.post(
    "/{workspace_id}/files/{path:path}/rename",
    response_model=WorkspaceFileRenameOut,
)
def rename_file(
    workspace_id: str, path: str, payload: WorkspaceFileRenameIn
) -> WorkspaceFileRenameOut:
    new_path = _svc().rename_file(workspace_id, path, payload.new_path)
    return WorkspaceFileRenameOut(path=new_path)


@router.post(
    "/{workspace_id}/files/{path:path}/mkdir",
    response_model=WorkspaceDirCreateOut,
)
def create_dir(workspace_id: str, path: str) -> WorkspaceDirCreateOut:
    new_path = _svc().create_dir(workspace_id, path)
    return WorkspaceDirCreateOut(path=new_path)


@router.delete(
    "/{workspace_id}/files/{path:path}", response_model=WorkspaceFileDeleteOut
)
def delete_file(workspace_id: str, path: str) -> WorkspaceFileDeleteOut:
    _svc().delete_file(workspace_id, path)
    return WorkspaceFileDeleteOut(ok=True)


@router.post("/{workspace_id}/credentials", response_model=WorkspaceCredentialsOut)
def generate_credentials(
    workspace_id: str, payload: WorkspaceCredentialsIn
) -> WorkspaceCredentialsOut:
    _svc().generate_credentials(
        workspace_id=workspace_id,
        vault_password=payload.vault_password,
        selected_roles=payload.selected_roles,
        allow_empty_plain=payload.allow_empty_plain,
        set_values=payload.set_values,
        force=payload.force,
        alias=payload.alias,
    )
    return WorkspaceCredentialsOut(ok=True)


@router.get("/{workspace_id}/download.zip")
def download_zip(workspace_id: str) -> StreamingResponse:
    data = _svc().build_zip(workspace_id)
    headers = {
        "Content-Disposition": f'attachment; filename="workspace-{workspace_id}.zip"'
    }
    return StreamingResponse(
        iter([data]),
        media_type="application/zip",
        headers=headers,
    )


@router.post("/{workspace_id}/upload.zip", response_model=WorkspaceUploadOut)
async def upload_zip(
    workspace_id: str, file: UploadFile = File(...)
) -> WorkspaceUploadOut:
    filename = (file.filename or "").lower()
    if not filename.endswith(".zip"):
        raise HTTPException(status_code=400, detail="zip file required")
    data = await file.read()
    _svc().load_zip(workspace_id, data)
    return WorkspaceUploadOut(ok=True, files=_svc().list_files(workspace_id))
