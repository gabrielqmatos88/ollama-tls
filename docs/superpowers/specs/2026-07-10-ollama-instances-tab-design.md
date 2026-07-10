# Ollama Instances Tab Design Spec

## Overview

Move the `keepAlive` setting from global Settings to per-provider config, and add a new "Ollama" tab for managing loaded models on local Ollama instances.

## Changes

### 1. Move `keepAlive` to Provider Config

**Files affected:**
- `src/storage/settings.js` — Remove `keepAlive` from defaults
- `src/options/SettingsTab.jsx` — Remove keepAlive input field and related state
- `src/options/ProvidersTab.jsx` — Add keepAlive input field to provider edit form
- `src/storage/providers.js` — No schema changes needed (plain object, new field persists)

**Provider schema addition:**
```js
{
  // ... existing fields
  keepAlive: '-1'  // optional, default '-1'
}
```

**Behavior:**
- Each provider can have its own `keepAlive` value
- Default to `-1` (keep model loaded permanently) if not set
- `callProvider()` in `client.js` already accepts `keepAlive` param — no API changes needed
- Side panel and textarea compose must pass `provider.keepAlive` instead of `settings.keepAlive`

### 2. New OllamaInstancesTab

**File:** `src/options/OllamaInstancesTab.jsx`

**Visibility conditions:**
- Only shown when the default provider's `baseUrl` contains `localhost` or `127.0.0.1`
- Tab is hidden otherwise

**URL derivation:**
- Extract base Ollama URL from provider's `baseUrl` by stripping `/v1` suffix
- Example: `http://localhost:11434/v1` → `http://localhost:11434`

**On tab load:**
1. Derive Ollama base URL from default provider
2. GET `{baseUrl}/api/ps` to check if Ollama is running
3. If request fails → show "Ollama not available" message
4. If successful → parse response and display loaded models

**Display:**
- List of currently loaded models from `models` array in `/api/ps` response
- Each model shows:
  - Model name
  - Size (from `size` field, format as MB/GB)
  - "Unload" button

**Unload action:**
- POST to `{baseUrl}/api/generate`
- Body: `{ "model": "<model_name>", "keep_alive": 0 }`
- This forces Ollama to unload the model from memory
- After unload, refresh the model list

**Error handling:**
- Network errors → show error message with retry button
- Empty model list → show "No models currently loaded"

### 3. App.jsx Tab Configuration

**File:** `src/options/App.jsx`

```jsx
const TABS = [
  { id: 'providers', label: 'Providers' },
  { id: 'prompts', label: 'Prompts' },
  { id: 'settings', label: 'Settings' },
  // Ollama tab added conditionally
]
```

- Import `OllamaInstancesTab`
- Load default provider on mount
- If default provider baseUrl contains `localhost` or `127.0.0.1`, add Ollama tab to TABS array
- Render `OllamaInstancesTab` when `activeTab === 'ollama'`

### 4. Side Panel / Textarea Compose Updates

**Files affected:**
- `src/sidepanel/` — Pass `provider.keepAlive` to `callProvider()`
- `src/content/textareaCompose.jsx` — Same

Currently these read `settings.keepAlive`. After migration, they should read from the provider object instead.

## Data Flow

```
Options page loads
  → getProviders() → find default provider
  → If baseUrl contains localhost/127.0.0.1 → show Ollama tab
  → User clicks Ollama tab
  → GET http://localhost:PORT/api/ps
  → Display loaded models with unload buttons
  → User clicks "Unload" on a model
  → POST http://localhost:PORT/api/generate {keep_alive: 0}
  → Refresh model list
```

## API Endpoints Used

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/ps` | GET | List currently loaded models |
| `/api/generate` | POST | Unload model (with `keep_alive: 0`) |

## Testing

- Verify keepAlive removed from SettingsTab
- Verify keepAlive appears in provider edit form
- Verify Ollama tab hidden when no localhost provider
- Verify Ollama tab appears when default provider is localhost
- Verify model list loads from /api/ps
- Verify unload button sends correct request
