# AGENTS.md

## Project Overview

Chrome Extension (Manifest V3) using React 19 + Vite 8 + CRXJS v2.

## Commands

```bash
npm run dev      # Start Vite dev server with HMR
npm run build    # Build to dist/
npm run preview  # Preview production build
```

No lint, typecheck, or test commands are configured. No CI/CD or pre-commit hooks.

## Architecture

Three separate React entrypoints (each with its own `index.html` + `main.jsx`):

- **popup** (`src/popup/`) — Browser action popup
- **content** (`src/content/`) — Injected into all HTTPS pages
- **sidepanel** (`src/sidepanel/`) — Chrome side panel UI

Shared component: `src/components/HelloWorld.jsx`

Manifest is generated from `manifest.config.js` by the CRXJS plugin — there is no static `manifest.json`.

## Key Config

- Path alias: `@` → `src/` (set in `vite.config.js`)
- Extension permissions: `sidePanel`, `contentSettings`
- Build outputs: `dist/` (extension), `release/` (zip via `vite-plugin-zip-pack`)
- Content scripts run on all `https://*/*` URLs
- Dev server CORS configured for `chrome-extension://` origins

## Gotchas

- `manifest.config.js` imports `package.json` for name/version — edit there, not in a separate manifest
- Content script entry is `src/content/main.jsx`, which renders into a dynamically created DOM element
- No TypeScript — project uses plain JSX
- React 19 + Vite 8 are current major versions — check compatibility if adding dependencies
