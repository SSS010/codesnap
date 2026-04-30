import type { GradientOption } from "./gradients";

export type SupportedLang = "javascript" | "typescript" | "python";
export type SupportedTheme = "dracula" | "one-dark-pro";

export type LangMode = "auto" | "manual";

export type ExportFormat = "png" | "jpeg";
export type ExportResolution = "standard" | "high";

export type CodeFontId =
  | "geist-mono"
  | "jetbrains-mono"
  | "fira-code"
  | "roboto-mono"
  | "source-code-pro"
  | "space-mono";

export type CanvasPresetId = "auto" | "instagram-1-1" | "twitter-16-9";

export type UiState = {
  lang: SupportedLang;
  langMode: LangMode;
  theme: SupportedTheme;
  paddingPx: number;
  gradientId: GradientOption["id"];
  codeFont: CodeFontId;
  canvasPreset: CanvasPresetId;
  showWindowDots: boolean;
  showWindowTitle: boolean;
  windowTitle: string;
  showLineNumbers: boolean;
  lineNumberColor: string;
  watermark: string;
  animatedBackground: boolean;
  animationSpeed: number;
  exportFormat: ExportFormat;
  exportResolution: ExportResolution;
};

export const CODESNAP_LOCALSTORAGE_KEY = "codesnap:v1";
export const CODESNAP_RECENTS_KEY = "codesnap:recents:v1";

export type RecentSnap = {
  id: string;
  createdAt: number;
  thumbnailDataUrl: string;
  ui: UiState;
};

export const DEFAULT_CODE = `// CodeSnap — красивый скриншот кода
function greet(name: string) {
  return \`Hello, \${name}!\`;
}

console.log(greet("World"));
`;

export const DEFAULT_UI_STATE: UiState = {
  lang: "typescript",
  langMode: "auto",
  theme: "dracula",
  paddingPx: 48,
  gradientId: "slate",
  codeFont: "geist-mono",
  canvasPreset: "auto",
  showWindowDots: true,
  showWindowTitle: true,
  windowTitle: "snippet.ts",
  showLineNumbers: true,
  lineNumberColor: "rgba(255,255,255,0.35)",
  watermark: "",
  animatedBackground: false,
  animationSpeed: 1,
  exportFormat: "png",
  exportResolution: "high",
};

export const LIMITS = {
  minPaddingPx: 16,
  maxPaddingPx: 80,
  // Prevent pathological cases that often break DOM-to-image.
  maxCodeCharsForExport: 30_000,
} as const;

export const EXPORT_PRESETS = {
  standard: { pixelRatio: 1 },
  high: { pixelRatio: 2 },
} as const;

export const CODE_FONTS: Array<{ id: CodeFontId; name: string; cssVar: string }> =
  [
    { id: "geist-mono", name: "Geist Mono", cssVar: "--font-geist-mono" },
    { id: "jetbrains-mono", name: "JetBrains Mono", cssVar: "--font-jetbrains-mono" },
    { id: "fira-code", name: "Fira Code", cssVar: "--font-fira-code" },
    { id: "roboto-mono", name: "Roboto Mono", cssVar: "--font-roboto-mono" },
    { id: "source-code-pro", name: "Source Code Pro", cssVar: "--font-source-code-pro" },
    { id: "space-mono", name: "Space Mono", cssVar: "--font-space-mono" },
  ];

export const CANVAS_PRESETS: Array<{
  id: CanvasPresetId;
  name: string;
  // If set, we apply a fixed aspect ratio for export/preview.
  aspectRatio?: string;
}> = [
  { id: "auto", name: "Auto" },
  { id: "instagram-1-1", name: "Instagram (1:1)", aspectRatio: "1 / 1" },
  { id: "twitter-16-9", name: "Twitter (16:9)", aspectRatio: "16 / 9" },
];

