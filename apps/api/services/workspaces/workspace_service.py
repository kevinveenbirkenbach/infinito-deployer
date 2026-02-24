from __future__ import annotations

from .workspace_service_artifacts import WorkspaceServiceArtifactsMixin
from .workspace_service_history import WorkspaceServiceHistoryMixin
from .workspace_service_inventory import WorkspaceServiceInventoryMixin
from .workspace_service_management import WorkspaceServiceManagementMixin
from .workspace_service_security import WorkspaceServiceSecurityMixin


class WorkspaceService(
    WorkspaceServiceHistoryMixin,
    WorkspaceServiceManagementMixin,
    WorkspaceServiceInventoryMixin,
    WorkspaceServiceArtifactsMixin,
    WorkspaceServiceSecurityMixin,
):
    pass
