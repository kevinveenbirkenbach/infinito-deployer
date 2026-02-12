from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from api.schemas.workspace import (
    WorkspaceCreateOut,
    WorkspaceCredentialsIn,
    WorkspaceCredentialsOut,
    WorkspaceVaultEntryIn,
    WorkspaceVaultEntryOut,
    WorkspaceVaultChangeIn,
    WorkspaceMasterPasswordIn,
    WorkspaceVaultPasswordResetIn,
    WorkspaceVaultPasswordResetOut,
    WorkspaceVaultDecryptIn,
    WorkspaceVaultDecryptOut,
    WorkspaceVaultEncryptIn,
    WorkspaceVaultEncryptOut,
    WorkspaceSshKeygenIn,
    WorkspaceSshKeygenOut,
    WorkspaceKeyPassphraseIn,
    WorkspaceConnectionTestIn,
    WorkspaceConnectionTestOut,
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


@router.get("/{workspace_id}/download/{path:path}")
def download_file(workspace_id: str, path: str) -> StreamingResponse:
    data = _svc().read_file_bytes(workspace_id, path)
    filename = Path(path).name or "file"
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return StreamingResponse(
        iter([data]),
        media_type="application/octet-stream",
        headers=headers,
    )


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
        master_password=payload.master_password,
        selected_roles=payload.selected_roles,
        allow_empty_plain=payload.allow_empty_plain,
        set_values=payload.set_values,
        force=payload.force,
        alias=payload.alias,
    )
    return WorkspaceCredentialsOut(ok=True)


@router.post("/{workspace_id}/vault/entries", response_model=WorkspaceVaultEntryOut)
def set_vault_entries(
    workspace_id: str, payload: WorkspaceVaultEntryIn
) -> WorkspaceVaultEntryOut:
    _svc().set_vault_entries(
        workspace_id=workspace_id,
        master_password=payload.master_password,
        master_password_confirm=payload.master_password_confirm,
        create_if_missing=payload.create_if_missing,
        alias=payload.alias,
        server_password=payload.server_password,
        vault_password=payload.vault_password,
        key_passphrase=payload.key_passphrase,
    )
    return WorkspaceVaultEntryOut(ok=True)


@router.post(
    "/{workspace_id}/vault/change-master", response_model=WorkspaceVaultEntryOut
)
def change_vault_master(
    workspace_id: str, payload: WorkspaceVaultChangeIn
) -> WorkspaceVaultEntryOut:
    _svc().set_or_reset_vault_master_password(
        workspace_id=workspace_id,
        current_master_password=payload.master_password,
        new_master_password=payload.new_master_password,
        new_master_password_confirm=payload.new_master_password_confirm,
    )
    return WorkspaceVaultEntryOut(ok=True)


@router.post(
    "/{workspace_id}/vault/master-password", response_model=WorkspaceVaultEntryOut
)
def set_or_reset_vault_master(
    workspace_id: str, payload: WorkspaceMasterPasswordIn
) -> WorkspaceVaultEntryOut:
    _svc().set_or_reset_vault_master_password(
        workspace_id=workspace_id,
        current_master_password=payload.current_master_password,
        new_master_password=payload.new_master_password,
        new_master_password_confirm=payload.new_master_password_confirm,
    )
    return WorkspaceVaultEntryOut(ok=True)


@router.post(
    "/{workspace_id}/vault/reset-password",
    response_model=WorkspaceVaultPasswordResetOut,
)
def reset_vault_password(
    workspace_id: str, payload: WorkspaceVaultPasswordResetIn
) -> WorkspaceVaultPasswordResetOut:
    result = _svc().reset_vault_password(
        workspace_id=workspace_id,
        master_password=payload.master_password,
        new_vault_password=payload.new_vault_password,
    )
    return WorkspaceVaultPasswordResetOut(ok=True, **result)


@router.post("/{workspace_id}/vault/decrypt", response_model=WorkspaceVaultDecryptOut)
def decrypt_vault(
    workspace_id: str, payload: WorkspaceVaultDecryptIn
) -> WorkspaceVaultDecryptOut:
    plaintext = _svc().vault_decrypt(
        workspace_id=workspace_id,
        master_password=payload.master_password,
        vault_text=payload.vault_text,
    )
    return WorkspaceVaultDecryptOut(plaintext=plaintext)


@router.post("/{workspace_id}/vault/encrypt", response_model=WorkspaceVaultEncryptOut)
def encrypt_vault(
    workspace_id: str, payload: WorkspaceVaultEncryptIn
) -> WorkspaceVaultEncryptOut:
    vault_text = _svc().vault_encrypt(
        workspace_id=workspace_id,
        master_password=payload.master_password,
        plaintext=payload.plaintext,
    )
    return WorkspaceVaultEncryptOut(vault_text=vault_text)


@router.post("/{workspace_id}/ssh-keys", response_model=WorkspaceSshKeygenOut)
def generate_ssh_keys(
    workspace_id: str, payload: WorkspaceSshKeygenIn
) -> WorkspaceSshKeygenOut:
    data = _svc().generate_ssh_keypair(
        workspace_id=workspace_id,
        alias=payload.alias,
        algorithm=payload.algorithm,
        with_passphrase=payload.with_passphrase,
        master_password=payload.master_password,
        master_password_confirm=payload.master_password_confirm,
        return_passphrase=payload.return_passphrase,
    )
    return WorkspaceSshKeygenOut(**data)


@router.post(
    "/{workspace_id}/ssh-keys/change-passphrase",
    response_model=WorkspaceVaultEntryOut,
)
def change_key_passphrase(
    workspace_id: str, payload: WorkspaceKeyPassphraseIn
) -> WorkspaceVaultEntryOut:
    _svc().change_key_passphrase(
        workspace_id=workspace_id,
        alias=payload.alias,
        master_password=payload.master_password,
        new_passphrase=payload.new_passphrase,
        new_passphrase_confirm=payload.new_passphrase_confirm,
    )
    return WorkspaceVaultEntryOut(ok=True)


@router.post(
    "/{workspace_id}/test-connection", response_model=WorkspaceConnectionTestOut
)
def test_connection(
    workspace_id: str, payload: WorkspaceConnectionTestIn
) -> WorkspaceConnectionTestOut:
    _svc().ensure(workspace_id)
    data = _svc().test_connection(
        host=payload.host,
        port=payload.port,
        user=payload.user,
        auth_method=payload.auth_method,
        password=payload.password,
        private_key=payload.private_key,
        key_passphrase=payload.key_passphrase,
    )
    return WorkspaceConnectionTestOut(**data)


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
