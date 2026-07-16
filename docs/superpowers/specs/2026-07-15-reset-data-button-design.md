# Reset Data Button — Design

## Goal

Add a "Reset Data" button in the Settings tab that restores all extension data to factory defaults, with a browser confirmation dialog before executing.

## Scope

- **In scope:** Single button + handler in `SettingsTab.jsx`
- **Out of scope:** Selective reset, undo, export/import

## Behavior

1. User clicks "Reset Data" button (red/danger style, below existing "Clear All Conversation History")
2. `window.confirm()` asks: "This will reset ALL settings, prompts, providers, and conversation history to defaults. This cannot be undone. Continue?"
3. On confirm:
   - `chrome.storage.sync.clear()` — wipes settings, providers, prompts
   - `chrome.storage.local.clear()` — wipes conversations, notes
   - `initializePrompts()` — re-seeds the 5 default prompts
   - `window.location.reload()` — refreshes the page so all tabs reflect the reset state
4. On cancel: nothing happens

## Why reload works

- `getSettings()` returns defaults via `|| { nativeLanguage: null, defaultProviderId: "ollama-local", theme: "light" }` when storage is empty
- `getProviders()` auto-merges `BUILT_IN_PROVIDERS` when no stored providers exist
- `initializePrompts()` writes `DEFAULT_PROMPTS` when storage is empty
- A page reload ensures all React state picks up the clean storage

## Files Changed

| File | Change |
|------|--------|
| `src/options/SettingsTab.jsx` | Add import for `initializePrompts`, add `handleResetData()`, add button in JSX |

## UI Placement

New section after the existing "Clear All Conversation History" block, separated by `<hr className="hr-divider" />`:

```
[Reset Data]  (btn-danger)
This will reset all settings, prompts, and providers to defaults and clear all data.
```
