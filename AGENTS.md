# AGENTS.md

## Project Overview

Chrome Extension (Manifest V3) — React 19 + Vite 8 + CRXJS v2. Ollama Scribe: AI-powered translation/composition assistant with side panel chat, context menu prompts, and textarea compose.

## Commands

```bash
npm run dev      # Start Vite dev server with HMR
npm run build    # Build to dist/
npm run preview  # Preview production build
```

No lint, typecheck, or test commands are configured. No CI/CD or pre-commit hooks.

## Architecture

Five entrypoints (each with its own `index.html` + `main.jsx`/`main.js`):

| Entrypoint | Path | Purpose |
|---|---|---|
| **popup** | `src/popup/` | Browser action popup — launcher |
| **content** | `src/content/main.jsx` | Text selection → prompt popup → opens side panel |
| **textarea compose** | `src/content/textareaCompose.jsx` | Context menu on editable fields → AI compose with diff popup |
| **sidepanel** | `src/sidepanel/` | Chat interface with streaming, conversation persistence |
| **options** | `src/options/` | Settings, providers, prompts management |
| **background** | `src/background/main.js` | Service worker — context menus, side panel lifecycle, message routing |

Manifest generated from `manifest.config.js` by CRXJS — no static `manifest.json`.

## Data Flow

- **Storage**: All state in `chrome.storage` (sync for settings/providers/prompts, local for conversations)
  - `src/storage/settings.js` — native language, default provider
  - `src/storage/providers.js` — LLM provider configs (baseUrl, apiKey, model)
  - `src/storage/prompts.js` — prompt templates with `{variable:type}` syntax
- **MessageBus** (`src/utils/messageBus.js`): Cross-component messaging via `chrome.storage.local` queue. Background writes messages, side panel/content scripts subscribe via `onMessage()`. Auto-checks on visibility change.
- **API** (`src/api/client.js`): `callProvider()` calls OpenAI-compatible chat completions with SSE streaming. Used by both side panel and textarea compose.
- **SidePanelManager** (`src/background/sidePanelManager.js`): Singleton tracking side panel tab lifecycle. Persists tabId/windowId to storage, validates tab existence.

## Key Config

- Path alias: `@` → `src/` (set in `vite.config.js`)
- Extension permissions: `sidePanel`, `contentSettings`, `contextMenus`, `storage`
- Host permissions: `<all_urls>` (needed for LLM API calls)
- Build outputs: `dist/` (extension), `release/` (zip via `vite-plugin-zip-pack`)
- Dev server CORS configured for `chrome-extension://` origins

## Gotchas

- `manifest.config.js` imports `package.json` for name/version — edit there, not in a separate manifest
- No TypeScript — project uses plain JSX
- React 19 + Vite 8 are current major versions — check compatibility if adding dependencies
- Content scripts inject into all `https://*/*` pages — DOM elements use `zIndex: 2147483647` to stay on top
- Background service worker is ES module (`type: 'module'` in manifest) — can use `import` syntax
- Template variables use `{name:type}` syntax: `{text}`, `{language}`, `{style:number}`, `{tone;a;b|c}` (select/radio)
- Messaging between background and side panel goes through storage, not `chrome.tabs.sendMessage` — side panel doesn't have a stable tab ID
- Two separate content scripts: `main.jsx` (text selection popup) and `textareaCompose.jsx` (editable field compose) — they run independently
