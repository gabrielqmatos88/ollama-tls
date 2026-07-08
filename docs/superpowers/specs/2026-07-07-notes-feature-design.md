# Notes Feature — Save, Organize, Download

Date: 2026-07-07

## Overview

Users can save text selections as notes, manage them in a dedicated Notes tab in the side panel, select notes and write a custom prompt for AI to organize them, then download the result as a markdown file.

## Notes Storage

**New file:** `src/storage/notes.js`

Notes stored in `chrome.storage.local` (not sync — avoids size limits). Each note:
```js
{
  id: crypto.randomUUID(),
  text: "selected text content",
  sourceUrl: "https://example.com/page",
  sourceTitle: "Page Title",
  createdAt: Date.now()
}
```

Functions:
- `getNotes()` — returns all notes, sorted by createdAt descending
- `addNote({ text, sourceUrl, sourceTitle })` — saves a new note
- `deleteNote(id)` — removes a note
- `deleteNotes(ids)` — batch delete multiple notes

Notes tab auto-refreshes when a new note is added (listens to `chrome.storage.onChanged` for the notes key).

## Context Menu — Save as Note

**Modified file:** `src/background/main.js`

New context menu item "Save as Note" under the existing "Ollama Scribe" parent menu. Appears alongside existing prompt items:

```
Ollama Scribe
  ├── Translate to English
  ├── Correct Grammar
  ├── ...
  └── Save as Note    ← NEW
```

When clicked:
1. Gets `info.selectionText`, `tab.url`, `tab.title`
2. Calls `addNote({ text: selectionText, sourceUrl: url, sourceTitle: title })`
3. No notification — silent save

## Side Panel — Tab Switcher

**Modified file:** `src/sidepanel/App.jsx`

Header becomes:
```
[Chat] [Notes]          [New]
```

- `activeTab` state: `'chat'` | `'notes'`
- Chat tab renders existing ChatInput + messages
- Notes tab renders NotesTab component
- "New" button only visible on Chat tab

## Notes Tab Component

**New file:** `src/sidepanel/NotesTab.jsx`

### Note List View (default)
- Scrollable list of notes, each with:
  - Checkbox for selection
  - Note text (truncated to 3 lines, click to expand)
  - Source title (small, gray, linked)
  - Delete button (× icon)
- Action bar at bottom:
  - "Select All" / "Deselect All" toggle
  - Prompt textarea: "Tell AI how to organize your notes..."
  - "Generate" button (disabled when no notes selected or prompt empty)
- Empty state: "No notes yet. Select text on a page and use the context menu to save notes."

### Result View (after generation)
- AI-generated content displayed as rendered text
- "Download .md" button
- "Back to notes" button
- "New generation" button (returns to list with same selection)

## AI Generation

### Flow
1. User selects notes via checkboxes
2. Types a prompt (e.g., "Organize these into a structured document")
3. Clicks "Generate"
4. AI receives the prompt + selected note texts
5. Response displayed in result view

### Prompt Structure
```
User's prompt:

--- Note 1 (from: Page Title) ---
[note text]

--- Note 2 (from: Page Title) ---
[note text]
```

Uses existing `callProvider()` with streaming. Provider override from Chat tab does NOT apply — Notes tab always uses default provider.

## Download

Generated content downloads as `notes-summary-{YYYY-MM-DD}.md` using `URL.createObjectURL()` with a Blob. No server needed, works offline.

## Files Changed

| File | Change |
|------|--------|
| `src/storage/notes.js` | New — notes storage functions |
| `src/background/main.js` | Add "Save as Note" context menu item |
| `src/sidepanel/App.jsx` | Add tab switcher (Chat/Notes) |
| `src/sidepanel/NotesTab.jsx` | New — notes list, selection, prompt, generation |
| `src/sidepanel/App.css` | Styles for tabs and NotesTab |

## Non-Goals
- Editing existing notes
- Note categories/tags
- Searching/filtering notes
- Syncing notes across devices
- Rich text notes (plain text only)
