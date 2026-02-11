"use client";

import DeploymentWorkspace from "./DeploymentWorkspace";

export default function DeploymentConsole({ baseUrl }: { baseUrl: string }) {
  return <DeploymentWorkspace baseUrl={baseUrl} />;
}
