import { useMemo } from "react";
import { json as jsonLang } from "@codemirror/lang-json";
import { yaml as yamlLang } from "@codemirror/lang-yaml";
import { python as pythonLang } from "@codemirror/lang-python";
import TurndownService from "turndown";
import {
  buildTree,
  extensionForPath,
  flattenTree,
  hostVarsAliasesFromFiles,
  normalizeRoles,
  pickHostVarsPath,
} from "./utils";
import type { CredentialsState, FileEntry } from "./types";

type UseWorkspacePanelDerivedStateParams = {
  files: FileEntry[];
  selectedRolesByAlias: Record<string, string[]>;
  credentials: CredentialsState;
  activePath: string | null;
  openDirs: Set<string>;
};

export function useWorkspacePanelDerivedState({
  files,
  selectedRolesByAlias,
  credentials,
  activePath,
  openDirs,
}: UseWorkspacePanelDerivedStateParams) {
  const activeAlias = (credentials.alias || "").trim();

  const inventoryEntry = useMemo(
    () => files.find((entry) => entry.path === "inventory.yml") ?? null,
    [files]
  );
  const inventoryModifiedAt = inventoryEntry?.modified_at ?? null;

  const hostVarsPath = useMemo(
    () => pickHostVarsPath(files, activeAlias),
    [files, activeAlias]
  );

  const hostVarsEntry = useMemo(
    () =>
      hostVarsPath ? files.find((entry) => entry.path === hostVarsPath) ?? null : null,
    [files, hostVarsPath]
  );
  const hostVarsModifiedAt = hostVarsEntry?.modified_at ?? null;

  const hostVarsAliases = useMemo(() => hostVarsAliasesFromFiles(files), [files]);

  const hasCredentialsVault = useMemo(
    () => files.some((entry) => entry.path === "secrets/credentials.kdbx"),
    [files]
  );

  const activeRoles = useMemo(
    () => normalizeRoles(selectedRolesByAlias[activeAlias] ?? []),
    [selectedRolesByAlias, activeAlias]
  );

  const serverRolesByAlias = useMemo(() => {
    const map: Record<string, string[]> = {};
    const aliases = new Set<string>();
    if (activeAlias) aliases.add(activeAlias);
    hostVarsAliases.forEach((alias) => {
      const key = String(alias || "").trim();
      if (key) aliases.add(key);
    });
    Object.keys(selectedRolesByAlias || {}).forEach((alias) => {
      const key = String(alias || "").trim();
      if (key) aliases.add(key);
    });
    aliases.forEach((alias) => {
      map[alias] = normalizeRoles(selectedRolesByAlias[alias] ?? []);
    });
    return map;
  }, [activeAlias, hostVarsAliases, selectedRolesByAlias]);

  const credentialServerAliases = useMemo(
    () => Object.keys(serverRolesByAlias),
    [serverRolesByAlias]
  );

  const tree = useMemo(() => buildTree(files), [files]);
  const treeItems = useMemo(() => flattenTree(tree, openDirs), [tree, openDirs]);

  const activeExtension = useMemo(
    () => (activePath ? extensionForPath(activePath) : "text"),
    [activePath]
  );
  const isKdbx = activeExtension === "kdbx";

  const editorExtensions = useMemo(() => {
    switch (activeExtension) {
      case "json":
        return [jsonLang()];
      case "yaml":
        return [yamlLang()];
      case "python":
        return [pythonLang()];
      default:
        return [];
    }
  }, [activeExtension]);

  const turndown = useMemo(
    () =>
      new TurndownService({
        codeBlockStyle: "fenced",
        emDelimiter: "*",
        strongDelimiter: "**",
      }),
    []
  );

  const quillModules = useMemo(
    () => ({
      toolbar: [
        [{ header: [1, 2, 3, false] }],
        ["bold", "italic", "underline", "strike"],
        [{ list: "ordered" }, { list: "bullet" }],
        ["blockquote", "code-block", "link"],
        ["clean"],
      ],
    }),
    []
  );

  return {
    activeAlias,
    inventoryModifiedAt,
    hostVarsPath,
    hostVarsModifiedAt,
    hostVarsAliases,
    hasCredentialsVault,
    activeRoles,
    serverRolesByAlias,
    credentialServerAliases,
    treeItems,
    activeExtension,
    isKdbx,
    editorExtensions,
    turndown,
    quillModules,
  };
}
