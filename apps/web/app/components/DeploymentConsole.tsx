"use client";

import { useState } from "react";
import DeploymentWorkspace from "./DeploymentWorkspace";
import LiveDeploymentView from "./LiveDeploymentView";

export default function DeploymentConsole({ baseUrl }: { baseUrl: string }) {
  const [jobId, setJobId] = useState("");

  return (
    <>
      <DeploymentWorkspace baseUrl={baseUrl} onJobCreated={setJobId} />
      <LiveDeploymentView baseUrl={baseUrl} jobId={jobId} autoConnect />
    </>
  );
}
