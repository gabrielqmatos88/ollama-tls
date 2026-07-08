# Notes Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add notes feature — save text selections via context menu, manage in Notes tab, generate AI-organized documents, download as markdown.

**Architecture:** Notes stored in `chrome.storage.local`. New context menu item saves selections. Side panel gets tab switcher (Chat/Notes). NotesTab component handles list, selection, prompt, AI generation, and download.

**Tech Stack:** React 19, Vite 8, Chrome Extension APIs

## Global Constraints

- No TypeScript — plain JSX
- Follow existing inline style patterns (no CSS modules)
- Use `@/` path alias for imports from `src/`
- Chrome extension APIs (`chrome.storage`, `chrome.runtime`)
- No new dependencies

---

### Task 1: Create Notes Storage Module

**Files:**
- Create: `src/storage/notes.js`

**Interfaces:**
- Produces: `getNotes()`, `addNote()`, `deleteNote()`, `deleteNotes()`

- [ ] **Step 1: Create notes.js**

```js
const STORAGE_KEY = 'notes'

export async function getNotes() {
  const result = await chrome.storage.local.get(STORAGE_KEY)
  const notes = result[STORAGE_KEY] || []
  return notes.sort((a, b) => b.createdAt - a.createdAt)
}

export async function addNote({ text, sourceUrl, sourceTitle }) {
  const notes = await getNotes()
  const note = {
    id: crypto.randomUUID(),
    text,
    sourceUrl: sourceUrl || '',
    sourceTitle: sourceTitle || '',
    createdAt: Date.now(),
  }
  notes.push(note)
  await chrome.storage.local.set({ [STORAGE_KEY]: notes })
  return note
}

export async function deleteNote(id) {
  const notes = await getNotes()
  await chrome.storage.local.set({ [STORAGE_KEY]: notes.filter(n => n.id !== id) })
}

export async function deleteNotes(ids) {
  const notes = await getNotes()
  const idSet = new Set(ids)
  await chrome.storage.local.set({ [STORAGE_KEY]: notes.filter(n => !idSet.has(n.id)) })
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/storage/notes.js
git commit -m "feat: add notes storage module"
```

---

### Task 2: Add "Save as Note" Context Menu

**Files:**
- Modify: `src/background/main.js`

**Interfaces:**
- Consumes: `addNote()` from `src/storage/notes.js`

- [ ] **Step 1: Import addNote**

Add import at top of `src/background/main.js`:
```js
import { addNote } from '@/storage/notes'
```

- [ ] **Step 2: Add context menu item**

In `rebuildContextMenus()` function, add after the existing prompts loop (after line 54):
```js
// Add "Save as Note" item
chrome.contextMenus.create({
  id: 'save-note',
  parentId: 'ollama-scribe',
  title: 'Save as Note',
  contexts: ['selection'],
})
```

- [ ] **Step 3: Add click handler**

In `chrome.contextMenus.onClicked.addListener`, add a new handler before the closing `}` (after the `compose:` handler):
```js
// Handle save as note
if (menuItemId === 'save-note') {
  const selectedText = info.selectionText
  const sourceUrl = tab.url || ''
  const sourceTitle = tab.title || ''
  await addNote({ text: selectedText, sourceUrl, sourceTitle })
  return
}
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add src/background/main.js
git commit -m "feat: add Save as Note context menu item"
```

---

### Task 3: Create NotesTab Component

**Files:**
- Create: `src/sidepanel/NotesTab.jsx`

**Interfaces:**
- Consumes: `getNotes()`, `deleteNote()`, `deleteNotes()` from `src/storage/notes.js`
- Consumes: `getDefaultProvider()` from `src/storage/providers.js`
- Consumes: `callProvider()` from `src/api/client.js`
- Produces: `NotesTab` component

- [ ] **Step 1: Create NotesTab.jsx**

```jsx
import { useState, useEffect, useRef } from 'react'
import { getNotes, deleteNote, deleteNotes } from '@/storage/notes'
import { getDefaultProvider } from '@/storage/providers'
import { callProvider } from '@/api/client'

export default function NotesTab() {
  const [notes, setNotes] = useState([])
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [expandedIds, setExpandedIds] = useState(new Set())
  const [prompt, setPrompt] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [result, setResult] = useState(null)
  const abortRef = useRef(null)

  useEffect(() => {
    loadNotes()
    const listener = (changes, area) => {
      if (area === 'local' && changes.notes) {
        loadNotes()
      }
    }
    chrome.storage.onChanged.addListener(listener)
    return () => chrome.storage.onChanged.removeListener(listener)
  }, [])

  async function loadNotes() {
    const loaded = await getNotes()
    setNotes(loaded)
  }

  function toggleSelect(id) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleExpand(id) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAll() {
    setSelectedIds(new Set(notes.map(n => n.id)))
  }

  function deselectAll() {
    setSelectedIds(new Set())
  }

  async function handleDelete(id) {
    await deleteNote(id)
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  async function handleDeleteSelected() {
    await deleteNotes([...selectedIds])
    setSelectedIds(new Set())
  }

  async function handleGenerate() {
    if (!prompt.trim() || selectedIds.size === 0) return

    const selectedNotes = notes.filter(n => selectedIds.has(n.id))
    let fullPrompt = prompt.trim() + '\n'
    selectedNotes.forEach((note, i) => {
      fullPrompt += `\n--- Note ${i + 1}${note.sourceTitle ? ` (from: ${note.sourceTitle})` : ''} ---\n${note.text}\n`
    })

    const provider = await getDefaultProvider()
    if (!provider) {
      setResult('Error: No provider configured. Please add a provider in the options page.')
      return
    }

    setIsStreaming(true)
    setStreamingContent('')
    setResult(null)
    abortRef.current = new AbortController()

    try {
      let full = ''
      await callProvider({
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey,
        model: provider.model,
        messages: [{ role: 'user', content: fullPrompt }],
        signal: abortRef.current.signal,
        onChunk: (delta, fullText) => {
          full = fullText
          setStreamingContent(fullText)
        },
      })
      setResult(full)
    } catch (err) {
      if (err.name !== 'AbortError') {
        setResult(`Error: ${err.message}`)
      }
    } finally {
      setIsStreaming(false)
      setStreamingContent('')
      abortRef.current = null
    }
  }

  function handleStop() {
    abortRef.current?.abort()
  }

  function handleDownload() {
    const content = result || streamingContent
    if (!content) return
    const blob = new Blob([content], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `notes-summary-${new Date().toISOString().split('T')[0]}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleBack() {
    setResult(null)
    setStreamingContent('')
  }

  if (result !== null || isStreaming) {
    const displayContent = result || streamingContent
    return (
      <div className="notes-result">
        <div className="notes-result-content">
          <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>{displayContent}</pre>
          {isStreaming && <span className="streaming-indicator" />}
        </div>
        <div className="notes-result-actions">
          {!isStreaming && (
            <>
              <button className="btn btn-primary" onClick={handleDownload}>Download .md</button>
              <button className="btn btn-secondary" onClick={handleBack}>Back to notes</button>
            </>
          )}
          {isStreaming && (
            <button className="stop-btn" onClick={handleStop}>Stop</button>
          )}
        </div>
      </div>
    )
  }

  if (notes.length === 0) {
    return (
      <div className="empty-state">
        No notes yet. Select text on a page and use the context menu to save notes.
      </div>
    )
  }

  return (
    <div className="notes-tab">
      <div className="notes-list">
        {notes.map(note => (
          <div key={note.id} className={`note-item ${selectedIds.has(note.id) ? 'selected' : ''}`}>
            <div className="note-header">
              <input
                type="checkbox"
                checked={selectedIds.has(note.id)}
                onChange={() => toggleSelect(note.id)}
                style={{ width: 'auto' }}
              />
              <div className="note-content" onClick={() => toggleExpand(note.id)}>
                <div className={`note-text ${expandedIds.has(note.id) ? '' : 'truncated'}`}>
                  {note.text}
                </div>
                {note.sourceTitle && (
                  <div className="note-source">
                    {note.sourceUrl ? (
                      <a href={note.sourceUrl} target="_blank" rel="noopener noreferrer">{note.sourceTitle}</a>
                    ) : (
                      <span>{note.sourceTitle}</span>
                    )}
                  </div>
                )}
              </div>
              <button className="note-delete" onClick={() => handleDelete(note.id)} title="Delete note">×</button>
            </div>
          </div>
        ))}
      </div>

      <div className="notes-actions">
        <div className="notes-select-actions">
          <button className="btn btn-secondary" onClick={selectedIds.size === notes.length ? deselectAll : selectAll}>
            {selectedIds.size === notes.length ? 'Deselect All' : 'Select All'}
          </button>
          {selectedIds.size > 0 && (
            <button className="btn btn-danger" onClick={handleDeleteSelected}>
              Delete Selected ({selectedIds.size})
            </button>
          )}
        </div>
        <textarea
          className="notes-prompt"
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="Tell AI how to organize your notes..."
          rows={3}
        />
        <button
          className="btn btn-primary"
          onClick={handleGenerate}
          disabled={selectedIds.size === 0 || !prompt.trim()}
        >
          Generate ({selectedIds.size} notes)
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/sidepanel/NotesTab.jsx
git commit -m "feat: create NotesTab component"
```

---

### Task 4: Add Tab Switcher to Side Panel

**Files:**
- Modify: `src/sidepanel/App.jsx`

**Interfaces:**
- Consumes: `NotesTab` component
- Produces: Tab switcher in header

- [ ] **Step 1: Import NotesTab**

Add import in `src/sidepanel/App.jsx`:
```js
import NotesTab from './NotesTab.jsx'
```

- [ ] **Step 2: Add activeTab state**

Add state after existing state declarations (after line 33):
```js
const [activeTab, setActiveTab] = useState('chat')
```

- [ ] **Step 3: Update header with tab switcher**

Replace the header div (lines 187-193) with:
```jsx
<div className="chat-header">
  <div className="tab-switcher">
    <button
      className={`tab-btn ${activeTab === 'chat' ? 'active' : ''}`}
      onClick={() => setActiveTab('chat')}
    >
      Chat
    </button>
    <button
      className={`tab-btn ${activeTab === 'notes' ? 'active' : ''}`}
      onClick={() => setActiveTab('notes')}
    >
      Notes
    </button>
  </div>
  <div style={{ display: 'flex', gap: 8 }}>
    {activeTab === 'chat' && isStreaming && <button className="stop-btn" onClick={handleStop}>Stop</button>}
    {activeTab === 'chat' && <button className="btn btn-secondary" onClick={handleNewConversation} style={{ padding: '4px 12px', fontSize: 13 }}>New</button>}
  </div>
</div>
```

- [ ] **Step 4: Conditionally render Chat or Notes content**

Replace the main content area (lines 194-213) with:
```jsx
{activeTab === 'chat' ? (
  <>
    <div className="chat-messages">
      {messages.length === 0 && !isStreaming && (
        <div className="empty-state">Select text on a page and choose a prompt to get started.</div>
      )}
      {messages.map((msg, i) => (
        <ChatMessage key={msg.id || i} message={msg} onCopy={handleCopy} />
      ))}
      {isStreaming && streamingContent && (
        <div className="chat-message assistant">
          <div className="message-content">
            <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>{streamingContent}</pre>
          </div>
          <span className="streaming-indicator" />
        </div>
      )}
      <div ref={messagesEndRef} />
    </div>
    <PromptBar onSend={handlePromptSend} disabled={isStreaming} />
    <ChatInput onSend={handleSend} disabled={isStreaming} />
  </>
) : (
  <NotesTab />
)}
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
git add src/sidepanel/App.jsx
git commit -m "feat: add Chat/Notes tab switcher to side panel"
```

---

### Task 5: Add NotesTab Styles

**Files:**
- Modify: `src/sidepanel/App.css`

- [ ] **Step 1: Add styles**

Append to end of `src/sidepanel/App.css`:
```css
.tab-switcher {
  display: flex;
  gap: 4px;
}

.tab-btn {
  padding: 4px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: white;
  cursor: pointer;
  font-size: 13px;
  color: #555;
}

.tab-btn:hover {
  background: #f3f4f6;
}

.tab-btn.active {
  background: #2563eb;
  color: white;
  border-color: #2563eb;
}

.notes-tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.notes-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.note-item {
  padding: 10px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: white;
}

.note-item.selected {
  border-color: #2563eb;
  background: #eff6ff;
}

.note-header {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.note-content {
  flex: 1;
  cursor: pointer;
  min-width: 0;
}

.note-text {
  font-size: 14px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.note-text.truncated {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.note-source {
  font-size: 12px;
  color: #6b7280;
  margin-top: 4px;
}

.note-source a {
  color: #2563eb;
  text-decoration: none;
}

.note-source a:hover {
  text-decoration: underline;
}

.note-delete {
  padding: 2px 6px;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 18px;
  color: #9ca3af;
  line-height: 1;
}

.note-delete:hover {
  color: #dc2626;
}

.notes-actions {
  padding: 12px 16px;
  background: white;
  border-top: 1px solid #e5e7eb;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.notes-select-actions {
  display: flex;
  gap: 8px;
}

.notes-prompt {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 14px;
  resize: none;
  font-family: inherit;
}

.notes-prompt:focus {
  outline: none;
  border-color: #2563eb;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.2);
}

.notes-result {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.notes-result-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  font-size: 14px;
  line-height: 1.5;
}

.notes-result-actions {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  background: white;
  border-top: 1px solid #e5e7eb;
}

.btn-danger {
  padding: 4px 12px;
  border: 1px solid #dc2626;
  border-radius: 6px;
  background: white;
  color: #dc2626;
  cursor: pointer;
  font-size: 13px;
}

.btn-danger:hover {
  background: #fef2f2;
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/sidepanel/App.css
git commit -m "feat: add NotesTab and tab switcher styles"
```

---

### Task 6: Verify Full Build

- [ ] **Step 1: Run build**

Run: `npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 2: Commit any fixes if needed**

```bash
git add -A
git commit -m "fix: resolve build issues"
```
