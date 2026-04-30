<img width="1346" height="1194" alt="image" src="https://github.com/user-attachments/assets/b26443a0-85b8-412d-8694-39d2a2a19c16" />



# CodeSnap

CodeSnap is a professional tool for creating aesthetic code screenshots with a modern Glassmorphism UI, live syntax highlighting, and instant export workflows.

---

## Overview

| Item | Details |
| --- | --- |
| Project Type | Web app (single-page workspace) |
| Primary Goal | Create beautiful, share-ready code visuals in seconds |
| Core Experience | Write code on the left, preview stylized output on the right |
| Output | PNG export + image copy to clipboard |

---

## Features

| Feature | Description |
| --- | --- |
| Smart Language Detection | Auto-detects code language on paste (`JavaScript`, `TypeScript`, `Python`) |
| Focus Mode | Click a line to highlight it while dimming other lines |
| Animated Background | Optional slow gradient movement for dynamic visuals |
| Live Typing Animation | Replays erase/type animation directly in preview |
| Watermarks | Add your handle or brand mark (e.g. `@username`) |
| Line Numbers | Toggle line numbers and customize their color |
| Export to PNG | High-quality screenshot export |
| Copy to Clipboard | Copy generated image directly to system clipboard |
| Recent Snaps | Keeps the latest snapshot presets/thumbnails in local storage |

---

## Tech Stack

| Technology | Usage |
| --- | --- |
| Next.js 14+ (App Router) | Application framework and routing |
| Tailwind CSS | UI styling and layout |
| Framer Motion | Animation engine (typing/motion interactions) |
| Shiki | Syntax highlighting and token rendering |
| Lucide Icons | Consistent icon set for actions/controls |

---

## Getting Started

### 1) Install dependencies

```bash
npm install
```

### 2) Start development server

```bash
npm run dev
```

### 3) Open in browser

```text
http://localhost:3000
```

---

## Available Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start local development server |
| `npm run build` | Build production bundle |
| `npm run start` | Start production server |
| `npm run lint` | Run lint checks |

---

## Project Structure

| Path | Purpose |
| --- | --- |
| `app/ui/CodeSnapApp.tsx` | Main interactive workspace UI |
| `app/lib/codesnapConfig.ts` | Central typed config and defaults |
| `app/lib/shikiClient.ts` | Client-side Shiki setup and token rendering |
| `app/lib/gradients.ts` | Gradient presets |
| `app/globals.css` | Global styles and animation utilities |

---

## Notes

- The app stores user preferences and recent snaps in `localStorage`.
- Clipboard/image features depend on browser capabilities and secure context.
- For best export fidelity, use modern Chromium-based browsers.
