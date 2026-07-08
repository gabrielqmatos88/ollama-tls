# Side Panel PromptBar & Options Model Loading

Date: 2026-07-07

## Overview

Two features:
1. **PromptBar** — A component in the side panel for selecting prompts, filling variables, overriding providers, and re-running prompts.
2. **Model Loading** — A button in the options page that fetches available models from the provider's `/v1/models` endpoint and shows a dropdown.

## PromptBar Component

**New file:** `src/sidepanel/PromptBar.jsx`

Sits above `ChatInput` in the side panel layout. Contains:

### Prompt Selector
- Dropdown of all prompts where `showInContextMenu === true`
- "None" option hides the form, lets user use freeform ChatInput
- Selecting a prompt shows its variable form inline

### Variable Form
- When a prompt is selected, its variables (from `parseVariables()`) render as input fields
- Input types: text, number, textarea, boolean (checkbox), select (dropdown), radio (radio buttons)
- Pre-filled from the last run of that prompt (stored in React state)
- `{text}` is treated as a regular variable with no pre-fill — the user types or pastes the text into the input field (unlike the content script popup where it's auto-filled from selection)

### Provider Override
- Dropdown of all configured providers (from `getProviders()`)
- Pre-selected to the current default provider
- Changing it sets a per-conversation override (React state only, not persisted to chrome.storage)
- `sendToAI()` in App.jsx accepts an optional provider parameter

### Run Button
- Sends the prompt with filled variables to the AI
- Equivalent to clicking "Send" in the content script popup

## Model Loading (Options Page)

**Modified file:** `src/options/ProvidersTab.jsx`  
**New function:** `src/api/client.js` — `fetchModels({ baseUrl, apiKey })`

### Behavior
1. "Load Models" button next to Model input (only visible when editing a provider)
2. Calls `GET {baseUrl}/models` with same auth header logic as `callProvider`
3. **On success:** Text input replaced by `<select>` dropdown of model IDs. Currently typed model pre-selected if it exists in the list. First item in dropdown is a "— enter manually —" option; selecting it reverts to the text input with the last dropdown value typed in.
4. **On failure:** Red error text inline (same pattern as test connection). Text input unchanged.
5. **Loading state:** Button shows "Loading...", disabled during fetch (10s timeout)

### API Function

```js
export async function fetchModels({ baseUrl, apiKey }) {
  const url = `${baseUrl.replace(/\/+$/, '')}/models`
  const headers = { 'Content-Type': 'application/json' }
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)

  try {
    const response = await fetch(url, { headers, signal: controller.signal })
    clearTimeout(timeout)
    if (!response.ok) throw new Error(`API error ${response.status}`)
    const data = await response.json()
    return data.data || data  // OpenAI: { data: [...] }, Ollama: [...]
  } catch (err) {
    clearTimeout(timeout)
    throw err
  }
}
```

## Integration Changes

### `src/sidepanel/App.jsx`
- Add `activeProviderId` state (null = use default)
- Add `lastRunVariables` state: `Map<promptId, { variables, selectedText }>`
- Add `handlePromptSend(promptId, variables, providerId)` called by PromptBar
- Pass provider override to `sendToAI()` when `activeProviderId` is set
- Render `<PromptBar />` above `<ChatInput />`

### State Management
- **Provider override:** React state only. Resets when side panel reopens. Default provider in settings remains source of truth.
- **Variable pre-fill:** React state only. Each prompt's last-used variables remembered for the session. Not persisted across side panel reopens.

## Files Changed

| File | Change |
|------|--------|
| `src/sidepanel/PromptBar.jsx` | New component |
| `src/sidepanel/App.jsx` | Integrate PromptBar, add provider override and variable pre-fill state |
| `src/sidepanel/App.css` | Styles for PromptBar |
| `src/api/client.js` | Add `fetchModels()` function |
| `src/options/ProvidersTab.jsx` | Add Load Models button, dropdown/text toggle |

## Non-Goals
- Persisting provider override across side panel sessions
- Persisting variable pre-fill across side panel sessions
- Changing the global default provider from the side panel
- Loading models for textarea compose (only options page)
