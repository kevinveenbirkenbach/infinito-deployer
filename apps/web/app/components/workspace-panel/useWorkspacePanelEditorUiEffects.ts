import { useEffect } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { marked } from "marked";
import type { VaultBlock } from "./types";

type UseWorkspacePanelEditorUiEffectsParams = {
  activeExtension: string;
  editorValue: string;
  markdownSyncRef: MutableRefObject<boolean>;
  setMarkdownHtml: Dispatch<SetStateAction<string>>;
  contextMenu: { x: number; y: number; path?: string; isDir: boolean } | null;
  setContextMenu: Dispatch<
    SetStateAction<{ x: number; y: number; path?: string; isDir: boolean } | null>
  >;
  editorMenu: { x: number; y: number; block: VaultBlock } | null;
  setEditorMenu: Dispatch<
    SetStateAction<{ x: number; y: number; block: VaultBlock } | null>
  >;
  credentialsScope: "all" | "single";
  activeRoles: string[];
  setCredentialsRole: Dispatch<SetStateAction<string>>;
};

export function useWorkspacePanelEditorUiEffects({
  activeExtension,
  editorValue,
  markdownSyncRef,
  setMarkdownHtml,
  contextMenu,
  setContextMenu,
  editorMenu,
  setEditorMenu,
  credentialsScope,
  activeRoles,
  setCredentialsRole,
}: UseWorkspacePanelEditorUiEffectsParams) {
  useEffect(() => {
    if (activeExtension !== "markdown") return;
    if (markdownSyncRef.current) {
      markdownSyncRef.current = false;
      return;
    }
    let alive = true;
    const source = editorValue ?? "";
    try {
      const result = marked.parse(source);
      if (typeof result === "string") {
        if (alive) setMarkdownHtml(result);
      } else {
        void result
          .then((html) => {
            if (alive) setMarkdownHtml(html);
          })
          .catch(() => {
            if (alive) setMarkdownHtml(source);
          });
      }
    } catch {
      if (alive) setMarkdownHtml(source);
    }
    return () => {
      alive = false;
    };
  }, [activeExtension, editorValue, markdownSyncRef, setMarkdownHtml]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setContextMenu(null);
      }
    };
    window.addEventListener("click", close);
    window.addEventListener("contextmenu", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("contextmenu", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [contextMenu, setContextMenu]);

  useEffect(() => {
    if (!editorMenu) return;
    const close = () => setEditorMenu(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setEditorMenu(null);
      }
    };
    window.addEventListener("click", close);
    window.addEventListener("contextmenu", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("contextmenu", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [editorMenu, setEditorMenu]);

  useEffect(() => {
    if (credentialsScope !== "single") return;
    setCredentialsRole((prev) =>
      activeRoles.includes(prev) ? prev : activeRoles[0] ?? ""
    );
  }, [activeRoles, credentialsScope, setCredentialsRole]);
}
