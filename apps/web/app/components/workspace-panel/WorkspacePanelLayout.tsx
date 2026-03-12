import type { ReactNode } from "react";
import WorkspacePanelHeader from "./WorkspacePanelHeader";
import WorkspacePanelCards from "./WorkspacePanelCards";
import WorkspacePanelFileEditor from "./WorkspacePanelFileEditor";
import WorkspacePanelOverlays from "./WorkspacePanelOverlays";
import OrphanCleanupModal from "./OrphanCleanupModal";
import UserEntryModal from "./UserEntryModal";
import HistoryModal from "./HistoryModal";
import LeaveGuardModal from "./LeaveGuardModal";
import ZipImportModeModal from "./ZipImportModeModal";
import styles from "../WorkspacePanel.module.css";

type WorkspacePanelLayoutProps = {
  workspaceSwitcher: ReactNode;
  Wrapper: "div" | "section";
  wrapperClassName: string;
  headerProps: any;
  fileEditorProps: any;
  cardsProps: any;
  zipImportProps: any;
  orphanCleanupProps: any;
  userEntryProps: any;
  historyProps: any;
  leaveGuardProps: any;
  overlayProps: any;
};

export default function WorkspacePanelLayout({
  workspaceSwitcher,
  Wrapper,
  wrapperClassName,
  headerProps,
  fileEditorProps,
  cardsProps,
  zipImportProps,
  orphanCleanupProps,
  userEntryProps,
  historyProps,
  leaveGuardProps,
  overlayProps,
}: WorkspacePanelLayoutProps) {
  return (
    <>
      {workspaceSwitcher}
      <Wrapper className={wrapperClassName}>
        <WorkspacePanelHeader {...headerProps} />
        <div className={styles.editorSection}>
          <WorkspacePanelFileEditor {...fileEditorProps} />
        </div>
        <div className={styles.bottomBar}>
          <WorkspacePanelCards {...cardsProps} />
        </div>
      </Wrapper>
      <ZipImportModeModal {...zipImportProps} />
      <OrphanCleanupModal {...orphanCleanupProps} />
      <UserEntryModal {...userEntryProps} />
      <HistoryModal {...historyProps} />
      <LeaveGuardModal {...leaveGuardProps} />
      <WorkspacePanelOverlays {...overlayProps} />
    </>
  );
}
