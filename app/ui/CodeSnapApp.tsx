"use client";

import { Copy, Download, Image as ImageIcon, Settings } from "lucide-react";
import * as htmlToImage from "html-to-image";
import { animate } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { getGradientById, GRADIENTS, type GradientOption } from "../lib/gradients";
import { renderCodeToTokens, type ShikiLine } from "../lib/shikiClient";
import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import python from "highlight.js/lib/languages/python";
import {
  CANVAS_PRESETS,
  CODE_FONTS,
  CODESNAP_LOCALSTORAGE_KEY,
  CODESNAP_RECENTS_KEY,
  DEFAULT_CODE,
  DEFAULT_UI_STATE,
  EXPORT_PRESETS,
  LIMITS,
  type RecentSnap,
  type ExportFormat,
  type ExportResolution,
  type SupportedLang,
  type SupportedTheme,
  type UiState,
} from "../lib/codesnapConfig";
import { useLocalStorageJsonState } from "../lib/useLocalStorageJson";

hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("python", python);

type PersistedState = { code: string; ui: UiState; showSettings: boolean };

function isGradientId(x: unknown): x is GradientOption["id"] {
  return typeof x === "string" && GRADIENTS.some((g) => g.id === x);
}

function isSupportedLang(x: unknown): x is SupportedLang {
  return x === "javascript" || x === "typescript" || x === "python";
}

function isSupportedTheme(x: unknown): x is SupportedTheme {
  return x === "dracula" || x === "one-dark-pro";
}

function isPersistedState(x: unknown): x is PersistedState {
  if (!x || typeof x !== "object") return false;
  const v = x as Partial<PersistedState>;
  if (typeof v.code !== "string") return false;
  if (typeof v.showSettings !== "boolean") return false;
  if (!v.ui || typeof v.ui !== "object") return false;
  const ui = v.ui as Partial<UiState>;
  return (
    typeof ui.paddingPx === "number" &&
    isGradientId(ui.gradientId) &&
    isSupportedLang(ui.lang) &&
    isSupportedTheme(ui.theme)
  );
}

function migratePersistedState(x: unknown): PersistedState | null {
  if (!x || typeof x !== "object") return null;
  const v = x as Partial<PersistedState>;
  const code = typeof v.code === "string" ? v.code : DEFAULT_CODE;
  const showSettings = typeof v.showSettings === "boolean" ? v.showSettings : true;

  const rawUi = v.ui && typeof v.ui === "object" ? (v.ui as Partial<UiState>) : {};
  const ui: UiState = {
    ...DEFAULT_UI_STATE,
    ...rawUi,
    paddingPx:
      typeof rawUi.paddingPx === "number" ? rawUi.paddingPx : DEFAULT_UI_STATE.paddingPx,
    gradientId: isGradientId(rawUi.gradientId) ? rawUi.gradientId : DEFAULT_UI_STATE.gradientId,
    lang: isSupportedLang(rawUi.lang) ? rawUi.lang : DEFAULT_UI_STATE.lang,
    theme: isSupportedTheme(rawUi.theme) ? rawUi.theme : DEFAULT_UI_STATE.theme,
  };

  return { code, ui, showSettings };
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function downloadDataUrl(filename: string, dataUrl: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

function makeId() {
  // short non-crypto id for local usage
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function canvasToThumbnailDataUrl(canvas: HTMLCanvasElement, maxW = 320): string {
  const scale = Math.min(1, maxW / canvas.width);
  if (scale >= 1) return canvas.toDataURL("image/png");
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(canvas.width * scale));
  out.height = Math.max(1, Math.round(canvas.height * scale));
  const ctx = out.getContext("2d");
  if (!ctx) return canvas.toDataURL("image/png");
  ctx.drawImage(canvas, 0, 0, out.width, out.height);
  return out.toDataURL("image/png");
}

function classNames(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function detectLang(code: string): SupportedLang | null {
  const trimmed = code.trim();
  if (!trimmed) return null;

  try {
    const res = hljs.highlightAuto(trimmed, ["typescript", "javascript", "python"]);
    const lang = res.language;
    if (lang === "typescript" || lang === "javascript" || lang === "python") return lang;
    return null;
  } catch {
    return null;
  }
}

export default function CodeSnapApp() {
  const [persisted, setPersisted] = useLocalStorageJsonState<PersistedState>({
    key: CODESNAP_LOCALSTORAGE_KEY,
    initialValue: { code: DEFAULT_CODE, ui: DEFAULT_UI_STATE, showSettings: true },
    validate: isPersistedState,
    migrate: migratePersistedState,
  });
  const code = persisted.code;
  const ui = persisted.ui;
  const showSettings = persisted.showSettings;

  const setCode = (next: string) => setPersisted((s) => ({ ...s, code: next }));
  const setUi = (updater: (prev: UiState) => UiState) =>
    setPersisted((s) => ({ ...s, ui: updater(s.ui) }));
  const setShowSettings = (next: boolean | ((prev: boolean) => boolean)) =>
    setPersisted((s) => ({
      ...s,
      showSettings: typeof next === "function" ? next(s.showSettings) : next,
    }));
  const [displayCode, setDisplayCode] = useState<string>(code);
  const [lines, setLines] = useState<ShikiLine[]>([]);
  const [focusedLine, setFocusedLine] = useState<number | null>(null);
  const [busy, setBusy] = useState<null | "render" | "export" | "copy-image">(null);
  const [toast, setToast] = useState<string | null>(null);
  const [isPreviewAnimating, setIsPreviewAnimating] = useState(false);

  const [recents, setRecents] = useLocalStorageJsonState<RecentSnap[]>({
    key: CODESNAP_RECENTS_KEY,
    initialValue: [],
    validate: (v: unknown): v is RecentSnap[] => Array.isArray(v),
    migrate: (v: unknown) => (Array.isArray(v) ? (v as RecentSnap[]) : []),
  });

  const previewRef = useRef<HTMLDivElement | null>(null);
  const lastLinesSignatureRef = useRef<string>("");

  const gradient = useMemo(() => getGradientById(ui.gradientId), [ui.gradientId]);
  const codeFont = useMemo(
    () => CODE_FONTS.find((f) => f.id === ui.codeFont) ?? CODE_FONTS[0]!,
    [ui.codeFont],
  );
  const canvasPreset = useMemo(
    () => CANVAS_PRESETS.find((p) => p.id === ui.canvasPreset) ?? CANVAS_PRESETS[0]!,
    [ui.canvasPreset],
  );

  useEffect(() => {
    // Keep preview in sync when not running typing animation.
    if (!isPreviewAnimating) setDisplayCode(code);
  }, [code, isPreviewAnimating]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const tokenLines = await renderCodeToTokens({
          code: displayCode.length ? displayCode : " ",
          lang: ui.lang,
          theme: ui.theme,
        });

        // Avoid render loops when token payload is effectively unchanged.
        const signature = tokenLines
          .map((line) => line.map((t) => `${t.color ?? ""}:${t.content}`).join("|"))
          .join("\n");
        if (!cancelled && signature !== lastLinesSignatureRef.current) {
          lastLinesSignatureRef.current = signature;
          setLines(tokenLines);
        }
      } catch (e) {
        if (!cancelled) {
          const fallback = [[{ content: `Failed to render.\n${String(e)}`, color: "#fb7185" }]];
          const signature = fallback
            .map((line) => line.map((t) => `${t.color ?? ""}:${t.content}`).join("|"))
            .join("\n");
          if (signature !== lastLinesSignatureRef.current) {
            lastLinesSignatureRef.current = signature;
            setLines(fallback);
          }
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [displayCode, ui.lang, ui.theme]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 1400);
    return () => window.clearTimeout(t);
  }, [toast]);

  const onExport = async () => {
    if (!previewRef.current) return;
    try {
      setBusy("export");
      if (code.length > LIMITS.maxCodeCharsForExport) {
        setToast("Code is too long to export. Please shorten it.");
        return;
      }

      const pixelRatio = EXPORT_PRESETS[ui.exportResolution].pixelRatio;
      const common = { pixelRatio, cacheBust: true } as const;
      const format: ExportFormat = ui.exportFormat;

      if (format === "png") {
        const dataUrl = await htmlToImage.toPng(previewRef.current, common);
        downloadDataUrl("codesnap.png", dataUrl);
      } else {
        const dataUrl = await htmlToImage.toJpeg(previewRef.current, {
          ...common,
          quality: 0.92,
        });
        downloadDataUrl("codesnap.jpg", dataUrl);
      }

      // Save a small thumbnail for "Recent Snaps"
      try {
        const canvas = await htmlToImage.toCanvas(previewRef.current, {
          pixelRatio: 1,
          cacheBust: true,
        });
        const thumb = canvasToThumbnailDataUrl(canvas, 320);
        const snap: RecentSnap = {
          id: makeId(),
          createdAt: Date.now(),
          thumbnailDataUrl: thumb,
          ui,
        };
        setRecents((prev) => [snap, ...prev].slice(0, 5));
      } catch {
        // ignore recents failures
      }
    } catch (e) {
      setToast(`Export failed: ${String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const onCopyImage = async () => {
    if (!previewRef.current) return;
    try {
      setBusy("copy-image");
      if (code.length > LIMITS.maxCodeCharsForExport) {
        setToast("Code is too long to copy as image. Please shorten it.");
        return;
      }
      if (!("clipboard" in navigator) || typeof window.ClipboardItem === "undefined") {
        setToast("Clipboard image is not supported in this browser.");
        return;
      }

      const pixelRatio = EXPORT_PRESETS[ui.exportResolution].pixelRatio;
      const canvas = await htmlToImage.toCanvas(previewRef.current, {
        pixelRatio,
        cacheBust: true,
      });
      const blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/png"),
      );
      if (!blob) {
        setToast("Copy failed: could not generate image.");
        return;
      }

      const item = new ClipboardItem({ [blob.type]: blob });
      await navigator.clipboard.write([item]);
      setToast("Image copied");

      // Save a thumbnail for "Recent Snaps"
      try {
        const canvas = await htmlToImage.toCanvas(previewRef.current, {
          pixelRatio: 1,
          cacheBust: true,
        });
        const thumb = canvasToThumbnailDataUrl(canvas, 320);
        const snap: RecentSnap = {
          id: makeId(),
          createdAt: Date.now(),
          thumbnailDataUrl: thumb,
          ui,
        };
        setRecents((prev) => [snap, ...prev].slice(0, 5));
      } catch {
        // ignore
      }
    } catch (e) {
      setToast(`Copy image failed: ${String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const onCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setToast("Code copied");
    } catch (e) {
      setToast(`Copy failed: ${String(e)}`);
    }
  };

  const onPreviewAnimation = async () => {
    if (isPreviewAnimating) return;
    const full = code;
    const len = full.length;
    if (!len) return;

    const eraseDuration = Math.max(0.18, 0.5 / Math.max(0.2, ui.animationSpeed));
    const typeDuration = Math.max(0.4, 2.0 / Math.max(0.2, ui.animationSpeed));

    setFocusedLine(null);
    setIsPreviewAnimating(true);
    try {
      // Erase quickly, then type back in.
      await new Promise<void>((resolve) => {
        const controls = animate(len, 0, {
          duration: eraseDuration,
          ease: "easeInOut",
          onUpdate: (v) => setDisplayCode(full.slice(0, Math.round(v))),
          onComplete: () => resolve(),
        });
        return () => controls.stop();
      });

      await new Promise<void>((resolve) => {
        const controls = animate(0, len, {
          duration: typeDuration,
          ease: "linear",
          onUpdate: (v) => setDisplayCode(full.slice(0, Math.round(v))),
          onComplete: () => resolve(),
        });
        return () => controls.stop();
      });
    } finally {
      setIsPreviewAnimating(false);
    }
  };

  const onEditorPaste = (incoming: string) => {
    if (ui.langMode !== "auto") return;
    const detected = detectLang(incoming);
    if (detected && detected !== ui.lang) {
      setUi((s) => ({ ...s, lang: detected }));
      setToast(`Detected: ${detected}`);
    }
  };

  return (
    <div
      className={classNames(
        "min-h-screen w-full text-zinc-100",
        "bg-black",
      )}
    >
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
        <header className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:gap-6">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">CodeSnap</h1>
            <p className="max-w-2xl text-sm leading-6 text-white/70">
              Введите код слева — справа сразу появится превью с подсветкой синтаксиса.
              Экспортируйте результат в PNG и MP4.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onCopyCode}
              className="inline-flex items-center gap-2 rounded-xl border border-white/5 bg-white/5 px-3 py-2 text-sm text-white/90 backdrop-blur-md transition-colors duration-200 hover:bg-white/10"
              aria-label="Copy code"
            >
              <Copy className="h-4 w-4" suppressHydrationWarning />
              Copy
            </button>
            <button
              type="button"
              onClick={onCopyImage}
              disabled={busy === "copy-image"}
              className="inline-flex items-center gap-2 rounded-xl border border-white/5 bg-white/5 px-3 py-2 text-sm text-white/90 backdrop-blur-md transition-colors duration-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
              aria-label="Copy image"
            >
              <ImageIcon className="h-4 w-4" suppressHydrationWarning />
              Copy Image
            </button>
            <button
              type="button"
              onClick={onPreviewAnimation}
              disabled={isPreviewAnimating}
              className="inline-flex items-center gap-2 rounded-xl border border-white/5 bg-white/5 px-3 py-2 text-sm text-white/90 backdrop-blur-md transition-colors duration-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
              aria-label="Preview animation"
            >
              Animation
            </button>
            <button
              type="button"
              onClick={() => setShowSettings((v) => !v)}
              className={classNames(
                "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm backdrop-blur-md transition-colors duration-200",
                showSettings
                  ? "border-white/20 bg-white/10 text-white"
                  : "border-white/5 bg-white/5 text-white/90 hover:bg-white/10",
              )}
              aria-label="Toggle settings"
            >
              <Settings className="h-4 w-4" suppressHydrationWarning />
              Settings
            </button>
            <button
              type="button"
              onClick={onExport}
              disabled={busy === "export"}
              className="inline-flex items-center gap-2 rounded-xl border border-white/5 bg-white/5 px-3 py-2 text-sm text-white/90 backdrop-blur-md transition-colors duration-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
              aria-label="Export PNG"
            >
              <Download className="h-4 w-4" suppressHydrationWarning />
              Export
            </button>
          </div>
        </header>

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-12">
          <section className="lg:col-span-5">
            <div className="codesnap-appear rounded-2xl border border-white/5 bg-white/5 p-4 backdrop-blur-md">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium text-white/90">Editor</div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-white/60">Language</label>
                  <select
                    className="rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-sm text-white/90 outline-none focus:border-white/20"
                    value={ui.lang}
                    onChange={(e) =>
                      setUi((s) => ({ ...s, lang: e.target.value as SupportedLang }))
                    }
                  >
                    <option value="javascript">JavaScript</option>
                    <option value="typescript">TypeScript</option>
                    <option value="python">Python</option>
                  </select>
                  <label className="ml-1 inline-flex items-center gap-2 text-xs text-white/60">
                    <input
                      type="checkbox"
                      checked={ui.langMode === "auto"}
                      onChange={(e) =>
                        setUi((s) => ({
                          ...s,
                          langMode: e.target.checked ? "auto" : "manual",
                        }))
                      }
                      className="h-4 w-4 rounded border-white/10 bg-black/30 accent-white/80"
                    />
                    Auto
                  </label>
                </div>
              </div>

              <textarea
                value={code}
                onPaste={(e) => {
                  const text = e.clipboardData.getData("text");
                  onEditorPaste(text);
                }}
                onChange={(e) => setCode(e.target.value)}
                spellCheck={false}
                className="mt-3 h-[360px] w-full resize-none rounded-xl border border-white/5 bg-black/30 p-3 text-sm leading-6 text-white/90 outline-none focus:border-white/20 sm:h-[520px]"
                style={{
                  fontFamily: `var(${codeFont.cssVar}), var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`,
                }}
                placeholder="Paste your code here…"
              />
            </div>

            {showSettings && (
              <div className="codesnap-appear mt-6 rounded-2xl border border-white/5 bg-white/5 p-4 backdrop-blur-md">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-white/90">Environment</div>
                  <div className="text-xs text-white/60">
                    {busy === "render" ? "Rendering…" : "Live"}
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  <details open className="rounded-xl border border-white/5 bg-black/20 p-3">
                    <summary className="cursor-pointer select-none text-sm text-white/85">
                      Basics
                    </summary>
                    <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-xs text-white/60">Padding</label>
                          <span className="text-xs tabular-nums text-white/70">
                            {ui.paddingPx}px
                          </span>
                        </div>
                        <input
                          type="range"
                          min={16}
                          max={80}
                          step={1}
                          value={ui.paddingPx}
                          onChange={(e) =>
                            setUi((s) => ({
                              ...s,
                              paddingPx: clamp(Number(e.target.value), 16, 80),
                            }))
                          }
                          className="w-full accent-white/80"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs text-white/60">Theme</label>
                        <select
                          className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-sm text-white/90 outline-none focus:border-white/20"
                          value={ui.theme}
                          onChange={(e) =>
                            setUi((s) => ({
                              ...s,
                              theme: e.target.value as SupportedTheme,
                            }))
                          }
                        >
                          <option value="dracula">Dracula</option>
                          <option value="one-dark-pro">One Dark Pro</option>
                        </select>
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs text-white/60">Code font</label>
                        <select
                          className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-sm text-white/90 outline-none focus:border-white/20"
                          value={ui.codeFont}
                          onChange={(e) =>
                            setUi((s) => ({
                              ...s,
                              codeFont: e.target.value as UiState["codeFont"],
                            }))
                          }
                        >
                          {CODE_FONTS.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs text-white/60">Canvas</label>
                        <select
                          className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-sm text-white/90 outline-none focus:border-white/20"
                          value={ui.canvasPreset}
                          onChange={(e) =>
                            setUi((s) => ({
                              ...s,
                              canvasPreset: e.target.value as UiState["canvasPreset"],
                            }))
                          }
                        >
                          {CANVAS_PRESETS.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-2 sm:col-span-2">
                        <label className="text-xs text-white/60">Watermark</label>
                        <input
                          value={ui.watermark}
                          onChange={(e) =>
                            setUi((s) => ({ ...s, watermark: e.target.value }))
                          }
                          placeholder="@username"
                          className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90 outline-none focus:border-white/20"
                          aria-label="Watermark"
                        />
                        <label className="mt-2 inline-flex items-center gap-2 text-xs text-white/70">
                          <input
                            type="checkbox"
                            checked={ui.animatedBackground}
                            onChange={(e) =>
                              setUi((s) => ({ ...s, animatedBackground: e.target.checked }))
                            }
                            className="h-4 w-4 rounded border-white/10 bg-black/30 accent-white/80"
                          />
                          Animated background
                        </label>
                      </div>

                      <div className="space-y-2 sm:col-span-2">
                        <div className="flex items-center justify-between">
                          <label className="text-xs text-white/60">Animation speed</label>
                          <span className="text-xs tabular-nums text-white/70">
                            {ui.animationSpeed.toFixed(1)}x
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0.5}
                          max={3}
                          step={0.1}
                          value={ui.animationSpeed}
                          onChange={(e) =>
                            setUi((s) => ({
                              ...s,
                              animationSpeed: Number(e.target.value),
                            }))
                          }
                          className="w-full accent-white/80"
                        />
                      </div>

                      <div className="space-y-2 sm:col-span-2">
                        <label className="text-xs text-white/60">Background</label>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          {GRADIENTS.map((g) => (
                            <button
                              key={g.id}
                              type="button"
                              onClick={() => setUi((s) => ({ ...s, gradientId: g.id }))}
                              className={classNames(
                                "group relative h-11 rounded-xl border p-1 text-left transition",
                                ui.gradientId === g.id
                                  ? "border-white/30"
                                  : "border-white/10 hover:border-white/20",
                              )}
                              aria-label={`Select background ${g.name}`}
                            >
                              <div
                                className={classNames("h-full w-full rounded-lg", g.className)}
                              />
                              <div className="pointer-events-none absolute inset-0 rounded-xl ring-0 ring-white/20 group-focus-visible:ring-2" />
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </details>

                  <details className="rounded-xl border border-white/5 bg-black/20 p-3">
                    <summary className="cursor-pointer select-none text-sm text-white/85">
                      Annotations
                    </summary>
                    <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-2 sm:col-span-2">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                          <label className="inline-flex items-center gap-2 text-xs text-white/70">
                            <input
                              type="checkbox"
                              checked={ui.showLineNumbers}
                              onChange={(e) =>
                                setUi((s) => ({ ...s, showLineNumbers: e.target.checked }))
                              }
                              className="h-4 w-4 rounded border-white/10 bg-black/30 accent-white/80"
                            />
                            Line numbers
                          </label>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-white/60">Color</span>
                            <input
                              value={ui.lineNumberColor}
                              onChange={(e) =>
                                setUi((s) => ({ ...s, lineNumberColor: e.target.value }))
                              }
                              className="w-[180px] rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-xs text-white/90 outline-none focus:border-white/20"
                              placeholder="rgba(255,255,255,0.35)"
                              aria-label="Line number color"
                            />
                            <button
                              type="button"
                              className="h-6 w-6 rounded-md border border-white/10"
                              style={{ background: ui.lineNumberColor }}
                              aria-label="Line number color preview"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2 sm:col-span-2">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                          <label className="inline-flex items-center gap-2 text-xs text-white/70">
                            <input
                              type="checkbox"
                              checked={ui.showWindowDots}
                              onChange={(e) =>
                                setUi((s) => ({ ...s, showWindowDots: e.target.checked }))
                              }
                              className="h-4 w-4 rounded border-white/10 bg-black/30 accent-white/80"
                            />
                            Window dots
                          </label>
                          <label className="inline-flex items-center gap-2 text-xs text-white/70">
                            <input
                              type="checkbox"
                              checked={ui.showWindowTitle}
                              onChange={(e) =>
                                setUi((s) => ({ ...s, showWindowTitle: e.target.checked }))
                              }
                              className="h-4 w-4 rounded border-white/10 bg-black/30 accent-white/80"
                            />
                            Title
                          </label>
                        </div>

                        <input
                          value={ui.windowTitle}
                          onChange={(e) =>
                            setUi((s) => ({ ...s, windowTitle: e.target.value }))
                          }
                          placeholder="snippet.ts"
                          className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90 outline-none focus:border-white/20 disabled:opacity-50"
                          disabled={!ui.showWindowTitle}
                          aria-label="Window title"
                        />
                      </div>
                    </div>
                  </details>

                  <details className="rounded-xl border border-white/5 bg-black/20 p-3">
                    <summary className="cursor-pointer select-none text-sm text-white/85">
                      Export
                    </summary>
                    <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-xs text-white/60">Export format</label>
                        <select
                          className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-sm text-white/90 outline-none focus:border-white/20"
                          value={ui.exportFormat}
                          onChange={(e) =>
                            setUi((s) => ({
                              ...s,
                              exportFormat: e.target.value as ExportFormat,
                            }))
                          }
                        >
                          <option value="png">PNG</option>
                          <option value="jpeg">JPEG</option>
                        </select>
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs text-white/60">Resolution</label>
                        <select
                          className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-sm text-white/90 outline-none focus:border-white/20"
                          value={ui.exportResolution}
                          onChange={(e) =>
                            setUi((s) => ({
                              ...s,
                              exportResolution: e.target.value as ExportResolution,
                            }))
                          }
                        >
                          <option value="high">High</option>
                          <option value="standard">Standard</option>
                        </select>
                      </div>
                    </div>
                  </details>
                </div>
              </div>
            )}
          </section>

          <section className="lg:col-span-7">
            <div className="codesnap-appear rounded-2xl border border-white/5 bg-white/5 p-4 backdrop-blur-md">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium text-white/90">Preview</div>
                <div className="text-xs text-white/60">PNG export uses this area</div>
              </div>

              <div className="mt-3 overflow-hidden rounded-2xl border border-white/5">
                <div
                  ref={previewRef}
                  className={classNames(
                    "w-full",
                    gradient.className,
                    ui.animatedBackground ? "codesnap-animated-bg" : "",
                  )}
                  style={{ padding: ui.paddingPx }}
                >
                  <div
                    className="w-full"
                    style={{
                      aspectRatio: canvasPreset.aspectRatio ?? undefined,
                    }}
                  >
                    <div className="flex h-full w-full items-center justify-center">
                      <div className="w-full max-w-[860px]">
                        <div className="overflow-hidden rounded-2xl shadow-2xl">
                          <div className="relative border border-white/10 bg-black/40 backdrop-blur-lg">
                            <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
                              {ui.showWindowDots ? (
                                <div className="flex items-center gap-2">
                                  <span className="h-3 w-3 rounded-full bg-red-400/90" />
                                  <span className="h-3 w-3 rounded-full bg-yellow-300/90" />
                                  <span className="h-3 w-3 rounded-full bg-green-400/90" />
                                </div>
                              ) : (
                                <div className="h-3 w-3" />
                              )}

                              <div className="ml-2 flex min-w-0 items-center gap-2 text-xs text-white/60">
                                {ui.showWindowTitle ? (
                                  <span className="truncate">{ui.windowTitle || "snippet"}</span>
                                ) : null}
                                <span className="text-white/40">·</span>
                                <span className="truncate">
                                  {ui.lang}
                                  {" · "}
                                  {ui.theme}
                                </span>
                              </div>
                            </div>

                            <div className="p-4">
                              <pre
                                className="text-sm leading-6"
                                style={{
                                  margin: 0,
                                  fontFamily: `var(${codeFont.cssVar}), var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`,
                                }}
                              >
                                {lines.map((line, idx) => {
                                  const lineNo = idx + 1;
                                  const isFocused = focusedLine === lineNo;
                                  const isDimmed =
                                    focusedLine !== null && focusedLine !== lineNo;
                                  return (
                                    <div
                                      key={idx}
                                      role="button"
                                      tabIndex={0}
                                      onClick={() =>
                                        setFocusedLine((cur) =>
                                          cur === lineNo ? null : lineNo,
                                        )
                                      }
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter" || e.key === " ") {
                                          e.preventDefault();
                                          setFocusedLine((cur) =>
                                            cur === lineNo ? null : lineNo,
                                          );
                                        }
                                      }}
                                      className={classNames(
                                        "group flex cursor-default rounded-md px-1 transition-opacity duration-200",
                                        isFocused ? "opacity-100" : "",
                                        isDimmed ? "opacity-40" : "opacity-100",
                                        "hover:opacity-100",
                                      )}
                                      style={{
                                        filter: isFocused ? "brightness(1.06)" : undefined,
                                      }}
                                    >
                                      {ui.showLineNumbers ? (
                                        <span
                                          className="select-none pr-3 text-right tabular-nums"
                                          style={{
                                            width: 44,
                                            color: ui.lineNumberColor,
                                          }}
                                        >
                                          {lineNo}
                                        </span>
                                      ) : null}
                                      <code
                                        className="whitespace-pre"
                                        style={{ fontFamily: "inherit" }}
                                      >
                                        {line.map((t, tIdx) => (
                                          <span
                                            key={tIdx}
                                            style={{ color: t.color ?? "inherit" }}
                                          >
                                            {t.content}
                                          </span>
                                        ))}
                                      </code>
                                    </div>
                                  );
                                })}
                              </pre>
                            </div>

                            {ui.watermark.trim().length ? (
                              <div className="pointer-events-none absolute bottom-3 right-4 select-none text-xs text-white/50">
                                {ui.watermark}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="codesnap-appear mt-6 rounded-2xl border border-white/5 bg-white/5 p-4 backdrop-blur-md">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium text-white/90">Recent Snaps</div>
                <button
                  type="button"
                  onClick={() => setRecents([])}
                  className="text-xs text-white/60 transition hover:text-white/80"
                >
                  Clear
                </button>
              </div>

              {recents.length ? (
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  {recents.slice(0, 5).map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setUi(() => s.ui);
                        setFocusedLine(null);
                      }}
                      className="group overflow-hidden rounded-xl border border-white/5 bg-black/30 transition hover:border-white/10"
                      aria-label="Apply recent snap settings"
                    >
                      <img
                        src={s.thumbnailDataUrl}
                        alt="Recent snap thumbnail"
                        className="h-20 w-full object-cover"
                      />
                      <div className="px-2 py-2 text-left text-[11px] text-white/60">
                        <div className="truncate">{s.ui.windowTitle || "snippet"}</div>
                        <div className="truncate">{s.ui.theme}</div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-3 text-sm text-white/60">
                  Export or Copy Image to populate this list.
                </div>
              )}
            </div>
          </section>
        </div>

        {toast && (
          <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
            <div className="rounded-xl border border-white/10 bg-black/60 px-4 py-2 text-sm text-white/90 backdrop-blur-lg">
              {toast}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

