"use client";

export type SupportedLang = "javascript" | "typescript" | "python";
export type SupportedTheme = "dracula" | "one-dark-pro";

type Highlighter = {
  codeToHtml: (code: string, options: { lang: string; theme: string }) => string;
  codeToTokens?: (code: string, options: { lang: string; theme: string }) => unknown;
};

let highlighterPromise: Promise<Highlighter> | null = null;

async function getHighlighter(theme: SupportedTheme): Promise<Highlighter> {
  // Shiki is heavy; keep a singleton highlighter in the client.
  if (!highlighterPromise) {
    highlighterPromise = (async () => {
      const shiki = await import("shiki/bundle/web");
      const highlighter = await shiki.createHighlighter({
        themes: ["dracula", "one-dark-pro"],
        langs: ["javascript", "typescript", "python"],
      });
      return highlighter as unknown as Highlighter;
    })();
  }

  const highlighter = await highlighterPromise;
  // Ensure theme is loaded (safe no-op if already present).
  if ("loadTheme" in (highlighter as unknown as Record<string, unknown>)) {
    const maybe = highlighter as unknown as { loadTheme?: (t: string) => Promise<void> };
    await maybe.loadTheme?.(theme);
  }
  return highlighter;
}

export async function renderCodeToHtml(args: {
  code: string;
  lang: SupportedLang;
  theme: SupportedTheme;
}): Promise<string> {
  const { code, lang, theme } = args;
  const highlighter = await getHighlighter(theme);
  return highlighter.codeToHtml(code, { lang, theme });
}

export type ShikiToken = { content: string; color?: string };
export type ShikiLine = ShikiToken[];

function normalizeTokens(tokens: unknown): ShikiLine[] {
  // Shiki's token shape can differ by bundle/version. We normalize to
  // Array<Array<{content,color}>>.
  const maybeArray = Array.isArray(tokens)
    ? tokens
    : tokens && typeof tokens === "object" && Array.isArray((tokens as { tokens?: unknown }).tokens)
      ? ((tokens as { tokens: unknown[] }).tokens ?? [])
      : [];

  const lines: ShikiLine[] = [];
  for (const line of maybeArray) {
    if (!Array.isArray(line)) {
      lines.push([{ content: String(line ?? "") }]);
      continue;
    }
    const out: ShikiToken[] = [];
    for (const t of line) {
      if (t && typeof t === "object") {
        const rec = t as Record<string, unknown>;
        const content = typeof rec.content === "string" ? rec.content : String(rec.content ?? "");
        const color = typeof rec.color === "string" ? rec.color : undefined;
        out.push({ content, color });
      } else {
        out.push({ content: String(t ?? "") });
      }
    }
    lines.push(out);
  }
  return lines;
}

export async function renderCodeToTokens(args: {
  code: string;
  lang: SupportedLang;
  theme: SupportedTheme;
}): Promise<ShikiLine[]> {
  const { code, lang, theme } = args;
  const highlighter = await getHighlighter(theme);
  if (!highlighter.codeToTokens) {
    // Fallback: keep a single line with raw text.
    return [[{ content: code }]];
  }
  const raw = highlighter.codeToTokens(code, { lang, theme });
  return normalizeTokens(raw);
}

