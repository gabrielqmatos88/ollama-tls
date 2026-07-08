# Enhanced Selection Popup & Copy as Markdown

Date: 2026-07-07

## Overview

Enhance the text selection popup with "Copy as Markdown" functionality and convert selected text to markdown when sending to side panel. Add "Copy as Markdown" to context menu.

## New Utility: DOM to Markdown

**New file:** `src/utils/domToMarkdown.js`

Converts DOM selection to basic markdown. Handles:
- `<h1>`-`<h6>` → `# ` to `###### `
- `<strong>`/`<b>` → `**text**`
- `<em>`/`<i>` → `*text*`
- `<a href="...">` → `[text](url)`
- `<ul>` → `- item` per `<li>`
- `<ol>` → `1. item` per `<li>` (auto-incrementing)
- `<p>` → paragraph with double newline
- `<br>` → single newline
- `<blockquote>` → `> text`
- `<code>` → `` `text` ``
- Strips other tags, preserves text content

**Functions:**
- `domToMarkdown(range)` — takes a DOM Range, returns markdown string
- `selectionToMarkdown()` — gets current selection, calls domToMarkdown

## Enhanced PromptPopup

**Modified file:** `src/content/PromptPopup.jsx`

Changes:
1. Add "Copy as Markdown" button at top of popup (always visible)
2. When clicked: calls `selectionToMarkdown()`, copies to clipboard, shows brief "Copied!" feedback
3. When user selects a prompt: convert selected text to markdown before calling `onSend`
4. Pass markdown-formatted text as `selectedText` to side panel

**Modified file:** `src/content/main.jsx`

Changes:
1. Import `selectionToMarkdown` from utils
2. In `showPopup()`, convert selection to markdown before passing to PromptPopup
3. Pass both raw text and markdown to PromptPopup

## Context Menu: Copy as Markdown

**Modified file:** `src/background/main.js`

Add new context menu item "Copy as Markdown" under existing parent menu.

When clicked:
1. Inject `extractAndCopySelection` function into page via `chrome.scripting.executeScript`
2. Function clones selection range, converts to markdown, copies to clipboard
3. Show brief notification (optional)

**Injected function runs in page context:**
```js
async function extractAndCopySelection() {
  const selection = window.getSelection()
  if (selection.rangeCount === 0) return
  const range = selection.getRangeAt(0)
  // Convert to markdown using DOM traversal
  const markdown = domToMarkdown(range)
  await navigator.clipboard.writeText(markdown)
}
```

## Side Panel Integration

When prompt is sent from popup, the `{text}` variable receives markdown-formatted content instead of raw text. No changes needed to side panel — it already uses `replaceVariables()` which handles `{text}`.

## Files Changed

| File | Change |
|------|--------|
| `src/utils/domToMarkdown.js` | New — DOM-to-markdown conversion |
| `src/content/PromptPopup.jsx` | Add Copy as Markdown button, pass markdown text |
| `src/content/main.jsx` | Convert selection to markdown before passing to popup |
| `src/background/main.js` | Add Copy as Markdown context menu item |
| `src/content/popup.css` | Styles for Copy as Markdown button |

## Non-Goals
- Full HTML-to-markdown with tables, images, code blocks
- Rich text preview in popup
- Markdown-to-HTML reverse conversion
- Saving markdown to files
