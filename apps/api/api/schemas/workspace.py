from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field

from api.schemas.deployment import AuthMethod, DeployTarget


class WorkspaceCreateOut(BaseModel):
    workspace_id: str
    created_at: Optional[str] = None


class WorkspaceGenerateIn(BaseModel):
    deploy_target: DeployTarget
    alias: Optional[str] = Field(
        default=None, min_length=1, description="Inventory host alias"
    )
    host: str = Field(..., min_length=1, description="localhost / IP / domain")
    user: str = Field(..., min_length=1, description="SSH user")
    auth_method: Optional[AuthMethod] = None
    selected_roles: List[str] = Field(default_factory=list)


class WorkspaceFileEntry(BaseModel):
    path: str
    is_dir: bool
    size: Optional[int] = None
    modified_at: Optional[str] = None


class WorkspaceFileListOut(BaseModel):
    files: List[WorkspaceFileEntry]


class WorkspaceFileOut(BaseModel):
    path: str
    content: str


class WorkspaceFileWriteIn(BaseModel):
    content: str


class WorkspaceFileRenameIn(BaseModel):
    new_path: str = Field(..., min_length=1)


class WorkspaceFileDeleteOut(BaseModel):
    ok: bool


class WorkspaceFileRenameOut(BaseModel):
    path: str


class WorkspaceDirCreateOut(BaseModel):
    path: str


class WorkspaceGenerateOut(BaseModel):
    workspace_id: str
    inventory_path: str
    files: List[WorkspaceFileEntry]
    warnings: List[str] = Field(default_factory=list)


class WorkspaceUploadOut(BaseModel):
    ok: bool
    files: List[WorkspaceFileEntry]


class WorkspaceCredentialsIn(BaseModel):
    vault_password: str = Field(..., min_length=1)
    selected_roles: Optional[List[str]] = None
    allow_empty_plain: bool = False
    set_values: Optional[List[str]] = None
    force: bool = False
    alias: Optional[str] = Field(
        default=None, min_length=1, description="Inventory host alias"
    )


class WorkspaceCredentialsOut(BaseModel):
    ok: bool
