# Reset Data Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Reset Data" button in the Settings tab that clears all extension data and restores defaults, with a confirmation dialog.

**Architecture:** Single function `handleResetData()` in `SettingsTab.jsx` that uses `window.confirm()`, clears both `chrome.storage.sync` and `chrome.storage.local`, re-seeds default prompts, and reloads the page.

**Tech Stack:** React 19, Chrome Extension APIs (`chrome.storage`)

## Global Constraints

- No TypeScript — plain JSX
- Follow existing `btn-danger` pattern used by "Clear All Conversation History"
- Use `window.confirm()` (matches existing `alert()` pattern in the codebase)

---

### Task 1: Add Reset Data button to SettingsTab

**Files:**
- Modify: `src/options/SettingsTab.jsx`

**Interfaces:**
- Consumes: `initializePrompts` from `@/storage/prompts`

- [ ] **Step 1: Add import for `initializePrompts`**

In `src/options/SettingsTab.jsx:2`, add `initializePrompts` to the existing prompts import. Since there is no current prompts import, add a new import line:

```jsx
import { initializePrompts } from "@/storage/prompts";
```

- [ ] **Step 2: Add `handleResetData` function**

After the existing `handleClearHistory` function (line 42), add:

```jsx
async function handleResetData() {
  const confirmed = window.confirm(
    "This will reset ALL settings, prompts, providers, and conversation history to defaults. This cannot be undone. Continue?"
  );
  if (!confirmed) return;
  await chrome.storage.sync.clear();
  await chrome.storage.local.clear();
  await initializePrompts();
  window.location.reload();
}
```

- [ ] **Step 3: Add Reset Data button in JSX**

After the "Clear All Conversation History" `</div>` block (after line 98), add:

```jsx
<hr className="hr-divider" />

<div>
  <button className="btn btn-danger" onClick={handleResetData}>
    Reset Data
  </button>
  <div className="form-hint">
    This will reset all settings, prompts, and providers to defaults and clear all data.
  </div>
</div>
```

- [ ] **Step 4: Verify the build compiles**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/options/SettingsTab.jsx
git commit -m "feat: add Reset Data button to settings"
```
