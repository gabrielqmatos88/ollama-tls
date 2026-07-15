# Fix: Built-in Provider Default Flag

## Problem

Built-in providers (currently only "Ollama (Local)") have `isDefault: true` hardcoded in the `BUILT_IN_PROVIDERS` constant in `src/storage/providers.js`. Since `saveProviders()` strips built-in providers before writing to `chrome.storage.sync`, any change to a built-in's `isDefault` flag is lost on the next `getProviders()` call. This means:

1. Users cannot change the default provider away from the built-in — the radio button in the options UI appears to work but the change is silently reverted
2. Two providers can simultaneously have `isDefault: true` (the built-in always reappears with `true`)
3. `getDefaultProvider()` uses `find()` which returns the built-in first due to array ordering

Additionally, the options UI currently allows editing all fields of built-in providers (name, baseUrl, apiKey, model, keepAlive). Saving a built-in creates a duplicate user provider rather than modifying the original. Built-in fields should be disabled, with only the default flag being user-configurable.

## Solution

Decouple the default provider concept from provider objects. Use the existing but unused `settings.defaultProviderId` field to track which provider is the default. This is a user preference, not a provider property.

## Design

### Storage Layer

**`src/storage/settings.js`:**
- Change default `defaultProviderId: null` → `defaultProviderId: 'ollama-local'`
- Add `setDefaultProviderId(id)` export — updates just the `defaultProviderId` field in settings

**`src/storage/providers.js`:**
- Remove `isDefault: true` from `BUILT_IN_PROVIDERS` constant (keep `id`, `name`, `baseUrl`, `apiKey`, `model`, `keepAlive`, `builtIn`)
- Remove `isDefault` logic from `addProvider()` (lines 32-34 — the `forEach` that clears defaults)
- Rewrite `getDefaultProvider()` to:
  1. Read `settings.defaultProviderId`
  2. Find matching provider by ID
  3. Fall back to first provider if ID not found or null
- Remove `isDefault` from the data model — no provider object carries this flag anymore

### Options UI (`src/options/ProvidersTab.jsx`)

**Provider form (edit mode for built-in providers):**
- All inputs disabled when `form.builtIn` is true: `disabled={!!form.builtIn}`
- Load Models button also disabled for built-ins
- Remove the "Set as default provider" checkbox from the edit form entirely (for all providers)
- Save button hidden when editing a built-in provider (nothing to save)
- Test Connection button remains available for built-ins (read-only test)

**Provider list:**
- Radio button `checked` state: compare `provider.id === settings.defaultProviderId`
- Radio button `onChange`: call `handleSetDefault(id)` which writes to `settings.defaultProviderId` via `setDefaultProviderId()`
- Remove `isDefault` from `EMPTY_PROVIDER`
- Remove `isDefault` badge span — the "default" badge now shows when `provider.id === settings.defaultProviderId`
- Edit button: remains for all providers (shows read-only form for built-ins)
- Duplicate button: remains for all providers (creates editable user copy)
- Delete button: hidden for built-ins (unchanged)

**`handleSetDefault(id)` rewrite:**
- Instead of iterating providers and calling `updateProvider`, simply call `await setDefaultProviderId(id)`
- Then `await loadProviders()` (to refresh UI, though providers data hasn't changed — the default indicator comes from settings now)

**State management:**
- Add `settings` state to ProvidersTab: `const [settings, setSettings] = useState(null)`
- Load settings on mount alongside providers
- Reload settings when `chrome.storage.onChanged` fires for the `settings` key

### Side Panel (`src/sidepanel/App.jsx`)

**Initial load (lines 45-48):**
- Read settings to get `defaultProviderId`
- Use it to find the default provider instead of scanning `isDefault`

**Storage change listener (lines 65-74):**
- Add listener for `changes.settings` alongside `changes.providers`
- When `settings` changes: read new `defaultProviderId`, update `activeProviderId` to match
- When `providers` changes: if current `activeProviderId` no longer exists in the provider list, fall back to the default from settings
- This means if a user manually selects a provider via PromptBar and then changes the default in options, the side panel follows the new default. This matches current behavior (the `find(p.isDefault)` fallback always ran on provider changes).

### No Changes Required

These files call `getDefaultProvider()` which handles the logic internally — no changes needed:
- `src/sidepanel/NotesTab.jsx`
- `src/content/textareaCompose.jsx`
- `src/options/App.jsx`
- `src/options/OllamaInstancesTab.jsx`

## Files to Modify

| File | Changes |
|------|---------|
| `src/storage/settings.js` | Change default, add `setDefaultProviderId()` |
| `src/storage/providers.js` | Remove `isDefault` from constant and CRUD, rewrite `getDefaultProvider()` |
| `src/options/ProvidersTab.jsx` | Disable built-in fields, remove isDefault checkbox, add settings state, rewrite `handleSetDefault` |
| `src/sidepanel/App.jsx` | Read settings for default, listen for settings changes |
