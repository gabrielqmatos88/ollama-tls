# keep_alive Parameter + Sidepanel Config Button

## 1. keep_alive Parameter

**Goal**: Allow users to configure how long Ollama keeps a model loaded in memory after a request.

### Storage

Add `keepAlive` field to settings (`src/storage/settings.js`):
- Default: `"-1"` (keep model loaded permanently)
- Stored as a string in `chrome.storage.sync`

### API Client (`src/api/client.js`)

- Add optional `keepAlive` parameter to `callProvider()`
- If provided and non-empty, include `keep_alive` in the JSON body sent to the chat completions endpoint
- Ollama's OpenAI-compatible endpoint accepts this field

### Callers

- `src/sidepanel/App.jsx` — `sendToAI()` reads `keepAlive` from settings and passes to `callProvider`
- `src/content/textareaCompose.jsx` — reads settings and passes `keepAlive` to `callProvider`

### Options UI (`src/options/SettingsTab.jsx`)

- Add text input for `keepAlive` below the native language field
- Helper text explains valid formats: duration string ("10m", "24h"), seconds number, -1 (permanent), 0 (immediate unload)

## 2. Config Button in Sidepanel

**Goal**: Provide access to the options page from the sidepanel since the action popup was removed.

### UI (`src/sidepanel/App.jsx`)

- Add a gear icon button (⚙) in the header's button group (next to Stop/New)
- On click: calls `chrome.tabs.openOptionsPage()`

### CSS (`src/sidepanel/App.css`)

- `.config-btn` styles matching existing button patterns (transparent bg, no border, icon-size)
