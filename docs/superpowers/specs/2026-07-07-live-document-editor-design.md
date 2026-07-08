# Live Document Editor for Notes

Date: 2026-07-07

## Overview

Enhance the Notes feature's result view to become a live document editor. After generating content from notes, the user can manually edit the markdown document and use the prompt field to ask AI for adjustments. AI rewrites the entire document based on the adjustment prompt and current content.

## Changes to NotesTab Component

**Modified file:** `src/sidepanel/NotesTab.jsx`

### Editor View (replaces current result view)

The result view becomes an editor with three parts:

1. **Textarea** — Full-width editable textarea showing the markdown content. User can freely edit. Replaces the current `<pre>` tag.

2. **Prompt bar** — Textarea + "Apply" button at the bottom. User types adjustment instructions (e.g., "Make it more concise", "Add a conclusion section"). When clicked, AI rewrites the entire document.

3. **Action bar** — Three buttons:
   - "Download .md" — downloads current content (including manual edits)
   - "Back to notes" — returns to note list
   - "New generation" — clears document, returns to notes with selection preserved

### AI Adjustment Flow

1. User types adjustment prompt in the prompt bar
2. Clicks "Apply" (disabled when prompt is empty or streaming)
3. AI receives the prompt + current document content
4. AI response replaces the entire textarea content
5. User can continue editing or apply more adjustments

### Prompt Structure for Adjustments

```
User's adjustment prompt:

--- Current Document ---
[full current textarea content]
```

### State Changes

- `result` renamed to `document` — holds the editable content (string or null)
- `prompt` state reused for the adjustment prompt
- New `handleApply()` function for AI adjustments
- `handleGenerate()` renamed logic but same flow
- `handleDownload()` uses textarea content (includes manual edits)

### Behavior Details

- Document state is session only (not persisted to storage)
- When streaming, textarea is disabled
- "Apply" button disabled when prompt empty or streaming
- After AI adjustment, textarea shows new content immediately
- Manual edits are preserved until next AI adjustment or "Back to notes"

## Files Changed

| File | Change |
|------|--------|
| `src/sidepanel/NotesTab.jsx` | Convert result view to live document editor |

## Non-Goals
- Markdown preview/rendering
- Persisting document across sessions
- Undo/redo for edits
- Multiple documents
