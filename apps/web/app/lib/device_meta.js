const HEX_COLOR_PATTERN = /^#?([A-Fa-f0-9]{6})$/;

function normalizeDeviceColor(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const match = raw.match(HEX_COLOR_PATTERN);
  if (!match) return null;
  return `#${match[1].toUpperCase()}`;
}

function normalizeDeviceEmoji(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  return raw;
}

export function createServerPlaceholder(alias) {
  return {
    alias: String(alias || "").trim(),
    description: "",
    primaryDomain: "",
    host: "",
    port: "22",
    user: "root",
    color: "",
    logoEmoji: "",
    authMethod: "password",
    password: "",
    privateKey: "",
    publicKey: "",
    keyAlgorithm: "ed25519",
    keyPassphrase: "",
  };
}

export function normalizePersistedDeviceMeta(servers) {
  return (Array.isArray(servers) ? servers : []).map((server) => {
    const normalizedColor = normalizeDeviceColor(server?.color);
    const normalizedLogo = normalizeDeviceEmoji(server?.logoEmoji);
    return {
      ...server,
      description: String(server?.description || ""),
      color: normalizedColor || "",
      logoEmoji: normalizedLogo || "",
    };
  });
}

function parseHostVarsValues(data) {
  const node =
    data && typeof data === "object" && !Array.isArray(data) ? data : {};
  const nextHost =
    typeof node.ansible_host === "string" ? String(node.ansible_host || "").trim() : "";
  const nextUser =
    typeof node.ansible_user === "string" ? String(node.ansible_user || "").trim() : "";
  const nextDescription =
    typeof node.description === "string" ? String(node.description || "") : "";
  const nextPrimaryDomain =
    typeof node.DOMAIN_PRIMARY === "string" ? String(node.DOMAIN_PRIMARY || "") : "";
  const nextColor =
    typeof node.color === "string" ? normalizeDeviceColor(node.color) || "" : "";
  const nextLogoEmoji =
    node.logo &&
    typeof node.logo === "object" &&
    !Array.isArray(node.logo) &&
    typeof node.logo.emoji === "string"
      ? normalizeDeviceEmoji(String(node.logo.emoji || "")) || ""
      : "";
  let nextPort = "";
  if (typeof node.ansible_port === "number") {
    nextPort = Number.isFinite(node.ansible_port) ? String(node.ansible_port) : "";
  } else if (typeof node.ansible_port === "string") {
    const parsedPort = Number(String(node.ansible_port || "").trim());
    if (Number.isInteger(parsedPort)) {
      nextPort = String(parsedPort);
    }
  }

  return {
    nextHost,
    nextUser,
    nextDescription,
    nextPrimaryDomain,
    nextColor,
    nextLogoEmoji,
    nextPort,
  };
}

export function parseHostVarsServerPatchData(data) {
  const {
    nextHost,
    nextUser,
    nextDescription,
    nextPrimaryDomain,
    nextColor,
    nextLogoEmoji,
    nextPort,
  } = parseHostVarsValues(data);
  const patch = {};
  if (nextHost) patch.host = nextHost;
  if (nextUser) patch.user = nextUser;
  if (nextPort) patch.port = nextPort;
  patch.description = nextDescription;
  patch.primaryDomain = nextPrimaryDomain;
  if (nextColor) patch.color = nextColor;
  if (nextLogoEmoji) patch.logoEmoji = nextLogoEmoji;
  return patch;
}

export function buildCredentialsPatchFromHostVarsData(data, credentials) {
  const {
    nextHost,
    nextUser,
    nextDescription,
    nextPrimaryDomain,
    nextColor,
    nextLogoEmoji,
    nextPort,
  } = parseHostVarsValues(data);
  const patch = {};
  if (nextHost && nextHost !== credentials.host) {
    patch.host = nextHost;
  }
  if (nextUser && nextUser !== credentials.user) {
    patch.user = nextUser;
  }
  if (nextPort && nextPort !== credentials.port) {
    patch.port = nextPort;
  }
  if (nextDescription !== credentials.description) {
    patch.description = nextDescription;
  }
  if (nextPrimaryDomain !== credentials.primaryDomain) {
    patch.primaryDomain = nextPrimaryDomain;
  }
  if (nextColor && nextColor !== credentials.color) {
    patch.color = nextColor;
  }
  if (nextLogoEmoji && nextLogoEmoji !== credentials.logoEmoji) {
    patch.logoEmoji = nextLogoEmoji;
  }
  return patch;
}
