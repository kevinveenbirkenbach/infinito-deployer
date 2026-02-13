const HEX_COLOR_PATTERN = /^#([0-9a-f]{6})$/i;

const DEVICE_BLUE_DEFAULTS = [
  "#89CFF0",
  "#87CEEB",
  "#7EC8E3",
  "#76BDEB",
  "#6CB4EE",
  "#5DADE2",
  "#4FA6E7",
  "#4A90E2",
  "#9FD3F8",
  "#A7D8FF",
  "#8BCBFF",
  "#B2E4FF",
] as const;

export const DEVICE_DEFAULT_EMOJIS = [
  "💻",
  "🖥️",
  "🖧",
  "🖨️",
  "🗄️",
  "💾",
  "💿",
  "📀",
  "⚙️",
  "🔌",
  "🔋",
  "🛜",
] as const;

const EXTRA_DEVICE_EMOJIS = [
  "🧰",
  "🛰️",
  "📡",
  "🔧",
  "🧯",
  "🧪",
  "🛡️",
  "🧠",
  "🧱",
  "🧲",
  "🌐",
  "☁️",
  "⚡",
  "🛰",
  "🔭",
  "🧭",
  "📦",
  "📁",
  "🧷",
  "🪫",
] as const;

export type DeviceEmojiOption = {
  emoji: string;
  label: string;
  keywords: string[];
};

export const DEVICE_EMOJI_LIBRARY: DeviceEmojiOption[] = [
  { emoji: "💻", label: "Laptop", keywords: ["computer", "device", "notebook"] },
  { emoji: "🖥️", label: "Desktop", keywords: ["computer", "workstation"] },
  { emoji: "🖧", label: "Network", keywords: ["network", "switch", "lan"] },
  { emoji: "🖨️", label: "Printer", keywords: ["printer", "office"] },
  { emoji: "🗄️", label: "Server Cabinet", keywords: ["rack", "cabinet", "server"] },
  { emoji: "💾", label: "Disk", keywords: ["storage", "save", "disk"] },
  { emoji: "💿", label: "CD", keywords: ["media", "disc"] },
  { emoji: "📀", label: "DVD", keywords: ["media", "disc"] },
  { emoji: "⚙️", label: "Gear", keywords: ["settings", "config", "automation"] },
  { emoji: "🔌", label: "Plug", keywords: ["power", "connector", "hardware"] },
  { emoji: "🔋", label: "Battery", keywords: ["power", "energy"] },
  { emoji: "🛜", label: "Wireless", keywords: ["wifi", "wireless", "internet"] },
  { emoji: "🧰", label: "Toolbox", keywords: ["tools", "maintenance"] },
  { emoji: "🛰️", label: "Satellite", keywords: ["satellite", "uplink"] },
  { emoji: "📡", label: "Antenna", keywords: ["signal", "radio", "network"] },
  { emoji: "🔧", label: "Wrench", keywords: ["repair", "ops"] },
  { emoji: "🧯", label: "Extinguisher", keywords: ["safety", "incident"] },
  { emoji: "🛡️", label: "Shield", keywords: ["security", "protection"] },
  { emoji: "🔐", label: "Lock", keywords: ["security", "auth", "vault"] },
  { emoji: "🔒", label: "Closed Lock", keywords: ["security", "encrypted"] },
  { emoji: "🔓", label: "Open Lock", keywords: ["unlock", "auth"] },
  { emoji: "🧠", label: "Brain", keywords: ["ai", "smart", "logic"] },
  { emoji: "🧲", label: "Magnet", keywords: ["hardware", "disk", "io"] },
  { emoji: "🌐", label: "Globe", keywords: ["web", "internet", "dns"] },
  { emoji: "☁️", label: "Cloud", keywords: ["cloud", "saas", "infra"] },
  { emoji: "🌩️", label: "Storm Cloud", keywords: ["cloud", "burst", "load"] },
  { emoji: "⚡", label: "Lightning", keywords: ["performance", "speed"] },
  { emoji: "🔭", label: "Telescope", keywords: ["monitoring", "observe"] },
  { emoji: "🧭", label: "Compass", keywords: ["navigation", "routing"] },
  { emoji: "📦", label: "Package", keywords: ["deployment", "artifact"] },
  { emoji: "📁", label: "Folder", keywords: ["files", "storage"] },
  { emoji: "🗂️", label: "Card Index", keywords: ["index", "catalog"] },
  { emoji: "📂", label: "Open Folder", keywords: ["filesystem", "folder"] },
  { emoji: "🧷", label: "Pin", keywords: ["pin", "dependency"] },
  { emoji: "🪫", label: "Low Battery", keywords: ["battery", "low power"] },
  { emoji: "🧪", label: "Lab", keywords: ["test", "qa", "staging"] },
  { emoji: "🧬", label: "DNA", keywords: ["version", "identity"] },
  { emoji: "📈", label: "Metrics Up", keywords: ["metrics", "monitoring"] },
  { emoji: "📉", label: "Metrics Down", keywords: ["metrics", "alert"] },
  { emoji: "📊", label: "Chart", keywords: ["dashboard", "analytics"] },
  { emoji: "🧱", label: "Brick", keywords: ["foundation", "infrastructure"] },
  { emoji: "🚀", label: "Rocket", keywords: ["deploy", "release", "launch"] },
  { emoji: "🛠️", label: "Hammer Wrench", keywords: ["ops", "maintenance"] },
  { emoji: "🪛", label: "Screwdriver", keywords: ["hardware", "repair"] },
  { emoji: "🪜", label: "Ladder", keywords: ["stack", "upgrade"] },
  { emoji: "📱", label: "Phone", keywords: ["mobile", "device"] },
  { emoji: "⌚", label: "Watch", keywords: ["wearable", "device"] },
  { emoji: "📺", label: "Display", keywords: ["screen", "display"] },
  { emoji: "🎛️", label: "Control Knobs", keywords: ["controls", "panel"] },
  { emoji: "🎚️", label: "Level Slider", keywords: ["slider", "controls"] },
  { emoji: "🕹️", label: "Joystick", keywords: ["control", "input"] },
  { emoji: "🧿", label: "Protection", keywords: ["security", "watch"] },
  { emoji: "🔍", label: "Search", keywords: ["scan", "search", "inspect"] },
  { emoji: "🧾", label: "Receipt", keywords: ["logs", "records"] },
  { emoji: "🗒️", label: "Notes", keywords: ["notes", "config"] },
  { emoji: "🗃️", label: "Archive Box", keywords: ["archive", "backup"] },
  { emoji: "🗜️", label: "Clamp", keywords: ["compress", "pack"] },
  { emoji: "🧵", label: "Thread", keywords: ["thread", "worker"] },
  { emoji: "🧶", label: "Yarn", keywords: ["packages", "node"] },
  { emoji: "🐳", label: "Whale", keywords: ["docker", "containers"] },
  { emoji: "📟", label: "Pager", keywords: ["alerting", "incident"] },
  { emoji: "📻", label: "Radio", keywords: ["broadcast", "signal"] },
  { emoji: "📠", label: "Fax", keywords: ["legacy", "office"] },
  { emoji: "🗺️", label: "Map", keywords: ["topology", "mapping"] },
  { emoji: "🧩", label: "Puzzle", keywords: ["integration", "module"] },
  { emoji: "🔗", label: "Link", keywords: ["connect", "integration"] },
  { emoji: "🧮", label: "Abacus", keywords: ["compute", "math"] },
  { emoji: "🧱", label: "Block", keywords: ["build", "foundation"] },
  { emoji: "🏗️", label: "Construction", keywords: ["build", "provisioning"] },
  { emoji: "🧑‍💻", label: "Developer", keywords: ["dev", "coding"] },
  { emoji: "👩‍💻", label: "Engineer", keywords: ["developer", "ops"] },
  { emoji: "👨‍💻", label: "Coder", keywords: ["developer", "ops"] },
  { emoji: "🤖", label: "Robot", keywords: ["automation", "bot"] },
  { emoji: "🛰", label: "Satellite Legacy", keywords: ["satellite", "signal"] },
  { emoji: "🪐", label: "Orbit", keywords: ["space", "satellite"] },
  { emoji: "💡", label: "Idea", keywords: ["logic", "smart"] },
  { emoji: "📎", label: "Attachment", keywords: ["attach", "link"] },
  { emoji: "📌", label: "Pin", keywords: ["pin", "marker"] },
  { emoji: "🔖", label: "Bookmark", keywords: ["bookmark", "saved"] },
  { emoji: "🧯", label: "Fire Suppression", keywords: ["incident", "safety"] },
];

const EXTENDED_DEVICE_EMOJI_POOL = [
  "⌨️",
  "🖱️",
  "🖲️",
  "🕹️",
  "🎮",
  "📷",
  "📸",
  "📹",
  "🎥",
  "📽️",
  "🎞️",
  "🎙️",
  "🎚️",
  "🎛️",
  "📺",
  "📻",
  "📼",
  "📠",
  "☎️",
  "📞",
  "📟",
  "📱",
  "📲",
  "⌚",
  "⏱️",
  "⏲️",
  "🕰️",
  "⏰",
  "🧭",
  "🗺️",
  "🪜",
  "🛟",
  "⚒️",
  "🔨",
  "⛏️",
  "🪓",
  "🔩",
  "⚗️",
  "🧫",
  "🔬",
  "🛸",
  "🕸️",
  "🌩️",
  "🔥",
  "🔦",
  "🕯️",
  "📫",
  "📬",
  "📭",
  "📮",
  "🗳️",
  "📜",
  "📄",
  "📃",
  "📑",
  "🖇️",
  "📍",
  "🪢",
  "🔑",
  "🗝️",
  "💳",
  "💰",
  "💎",
  "♻️",
  "👾",
  "🦾",
  "🦿",
  "🏷️",
  "📛",
  "✅",
  "☑️",
  "🔘",
  "🟢",
  "🔵",
  "🟡",
  "🟠",
  "🔴",
  "🟣",
  "🟤",
  "⚫",
  "⚪",
  "🧊",
  "🧸",
  "🪄",
  "📶",
  "📳",
  "📴",
  "🔉",
  "🔈",
  "🔊",
  "🔇",
  "🎧",
  "📢",
  "📣",
  "🔔",
  "🔕",
  "🧱",
  "🏭",
  "🏢",
  "🏬",
  "🏣",
  "🏤",
  "🏥",
  "🏦",
  "🏫",
  "🏛️",
  "⛽",
  "🛣️",
  "🚧",
  "🧯",
  "🚦",
  "🛰️",
  "📡",
  "🧵",
  "🧶",
  "🧲",
  "🪫",
  "🔬",
  "🧬",
  "🧪",
  "📁",
  "🗂️",
  "🗃️",
  "🗄️",
  "📚",
  "📒",
  "📓",
  "📔",
  "📕",
  "📗",
  "📘",
  "📙",
  "📖",
  "📋",
  "📌",
  "📎",
  "✂️",
  "🖊️",
  "🖋️",
  "✏️",
  "📝",
  "📐",
  "📏",
  "🧾",
  "🪙",
  "💵",
  "💶",
  "💷",
  "💴",
  "💸",
  "🏁",
  "🚩",
  "🏴",
  "🏳️",
  "🏳️‍🌈",
  "⚠️",
  "🚨",
  "❗",
  "❓",
  "ℹ️",
  "🆗",
  "🆒",
  "🆕",
  "🆙",
  "🅿️",
  "🔁",
  "🔂",
  "🔄",
  "🔃",
  "⏫",
  "⏬",
  "⏩",
  "⏪",
  "⏭️",
  "⏮️",
  "▶️",
  "⏸️",
  "⏹️",
  "⏺️",
  "🔀",
  "🔴",
  "🟩",
  "🟦",
  "🟨",
  "🟥",
  "⬛",
  "⬜",
  "🔷",
  "🔶",
  "🔹",
  "🔸",
  "🔺",
  "🔻",
  "⭐",
  "🌟",
  "✨",
  "💫",
] as const;

export const DEVICE_EMOJI_OPTIONS: DeviceEmojiOption[] = (() => {
  const seen = new Set<string>();
  const options: DeviceEmojiOption[] = [];

  DEVICE_EMOJI_LIBRARY.forEach((option) => {
    const normalized = normalizeDeviceEmoji(option.emoji);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    options.push(option);
  });

  EXTENDED_DEVICE_EMOJI_POOL.forEach((emoji) => {
    const normalized = normalizeDeviceEmoji(emoji);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    options.push({
      emoji: normalized,
      label: `Emoji ${normalized}`,
      keywords: ["emoji", "icon", "logo"],
    });
  });

  return options;
})();

export const DEFAULT_DEVICE_EMOJI = DEVICE_DEFAULT_EMOJIS[0];
export const DEFAULT_DEVICE_COLOR = DEVICE_BLUE_DEFAULTS[0];

function toColorSet(values: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const value of values) {
    const normalized = normalizeDeviceColor(value);
    if (normalized) out.add(normalized);
  }
  return out;
}

function toEmojiSet(values: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const value of values) {
    const normalized = normalizeDeviceEmoji(value);
    if (normalized) out.add(normalized);
  }
  return out;
}

function randomItem<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function randomBlueColor(): string {
  const red = 110 + Math.floor(Math.random() * 85);
  const green = 190 + Math.floor(Math.random() * 55);
  const blue = 225 + Math.floor(Math.random() * 31);
  return `#${red.toString(16).padStart(2, "0")}${green
    .toString(16)
    .padStart(2, "0")}${blue.toString(16).padStart(2, "0")}`.toUpperCase();
}

export function normalizeDeviceColor(value: string | null | undefined): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const match = raw.match(HEX_COLOR_PATTERN);
  if (!match) return null;
  return `#${match[1].toUpperCase()}`;
}

export function normalizeDeviceEmoji(value: string | null | undefined): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  return raw;
}

export function pickUniqueDeviceColor(usedColors: Iterable<string>): string {
  const used = toColorSet(usedColors);
  const available = DEVICE_BLUE_DEFAULTS.filter((color) => !used.has(color));
  if (available.length > 0) {
    return randomItem(available);
  }
  for (let i = 0; i < 64; i += 1) {
    const candidate = randomBlueColor();
    if (!used.has(candidate)) return candidate;
  }
  return randomBlueColor();
}

export function pickUniqueDeviceEmoji(usedEmojis: Iterable<string>): string {
  const used = toEmojiSet(usedEmojis);
  if (!used.has(DEFAULT_DEVICE_EMOJI)) {
    return DEFAULT_DEVICE_EMOJI;
  }
  const available = DEVICE_DEFAULT_EMOJIS.filter((emoji) => !used.has(emoji));
  if (available.length > 0) {
    return randomItem(available);
  }
  const extraAvailable = EXTRA_DEVICE_EMOJIS.filter((emoji) => !used.has(emoji));
  if (extraAvailable.length > 0) {
    return randomItem(extraAvailable);
  }
  return randomItem([...DEVICE_DEFAULT_EMOJIS, ...EXTRA_DEVICE_EMOJIS]);
}

export function hexToRgba(
  value: string | null | undefined,
  alpha: number
): string | null {
  const color = normalizeDeviceColor(value);
  if (!color) return null;
  const a = Number.isFinite(alpha) ? Math.min(1, Math.max(0, alpha)) : 1;
  const rgb = [
    Number.parseInt(color.slice(1, 3), 16),
    Number.parseInt(color.slice(3, 5), 16),
    Number.parseInt(color.slice(5, 7), 16),
  ];
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a})`;
}
