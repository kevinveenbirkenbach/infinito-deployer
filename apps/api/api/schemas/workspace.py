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
    port: Optional[int] = Field(default=None, ge=1, le=65535)
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
    master_password: str = Field(..., min_length=1)
    selected_roles: Optional[List[str]] = None
    allow_empty_plain: bool = False
    set_values: Optional[List[str]] = None
    force: bool = False
    alias: Optional[str] = Field(
        default=None, min_length=1, description="Inventory host alias"
    )


class WorkspaceCredentialsOut(BaseModel):
    ok: bool


class WorkspaceVaultEntryIn(BaseModel):
    master_password: str = Field(..., min_length=1)
    master_password_confirm: Optional[str] = None
    create_if_missing: bool = True
    alias: Optional[str] = Field(default=None, min_length=1)
    server_password: Optional[str] = None
    vault_password: Optional[str] = None
    key_passphrase: Optional[str] = None


class WorkspaceVaultEntryOut(BaseModel):
    ok: bool


class WorkspaceVaultChangeIn(BaseModel):
    master_password: str = Field(..., min_length=1)
    new_master_password: str = Field(..., min_length=1)
    new_master_password_confirm: str = Field(..., min_length=1)


class WorkspaceVaultDecryptIn(BaseModel):
    master_password: str = Field(..., min_length=1)
    vault_text: str = Field(..., min_length=1)


class WorkspaceVaultDecryptOut(BaseModel):
    plaintext: str


class WorkspaceVaultEncryptIn(BaseModel):
    master_password: str = Field(..., min_length=1)
    plaintext: str = Field(..., min_length=0)


class WorkspaceVaultEncryptOut(BaseModel):
    vault_text: str


class WorkspaceSshKeygenIn(BaseModel):
    alias: str = Field(..., min_length=1)
    algorithm: str = Field(default="ed25519", min_length=1)
    with_passphrase: bool = False
    master_password: Optional[str] = None
    master_password_confirm: Optional[str] = None
    return_passphrase: bool = False


class WorkspaceSshKeygenOut(BaseModel):
    private_key: str
    public_key: str
    key_path: str
    public_key_path: str
    passphrase: Optional[str] = None


class WorkspaceKeyPassphraseIn(BaseModel):
    alias: str = Field(..., min_length=1)
    master_password: str = Field(..., min_length=1)
    new_passphrase: str = Field(..., min_length=0)
    new_passphrase_confirm: str = Field(..., min_length=0)


class WorkspaceConnectionTestIn(BaseModel):
    host: str = Field(..., min_length=1)
    port: Optional[int] = Field(default=None, ge=1, le=65535)
    user: str = Field(..., min_length=1)
    auth_method: AuthMethod
    password: Optional[str] = None
    private_key: Optional[str] = None
    key_passphrase: Optional[str] = None


class WorkspaceConnectionTestOut(BaseModel):
    ping_ok: bool
    ping_error: Optional[str] = None
    ssh_ok: bool
    ssh_error: Optional[str] = None
