# Live Document Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the Notes result view into a live document editor with manual editing and AI adjustments.

**Architecture:** Modify `NotesTab.jsx` to replace the `<pre>` result view with an editable textarea, add a prompt bar for AI adjustments, and implement the adjustment flow where AI rewrites the entire document.

**Tech Stack:** React 19, Vite 8, Chrome Extension APIs

## Global Constraints

- No TypeScript — plain JSX
- Follow existing inline style patterns (no CSS modules)
- Use `@/` path alias for imports from `src/`
- No new dependencies

---

### Task 1: Convert Result View to Live Document Editor

**Files:**
- Modify: `src/sidepanel/NotesTab.jsx`

**Interfaces:**
- Consumes: `getDefaultProvider()`, `callProvider()` (existing)
- Produces: Same component interface, enhanced editor view

- [ ] **Step 1: Update NotesTab.jsx**

Replace the entire `src/sidepanel/NotesTab.jsx` with:

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
  const [document, setDocument] = useState(null)
  const [adjustPrompt, setAdjustPrompt] = useState('')
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
      setDocument('Error: No provider configured. Please add a provider in the options page.')
      return
    }

    setIsStreaming(true)
    setStreamingContent('')
    setDocument(null)
    setAdjustPrompt('')
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
      setDocument(full)
    } catch (err) {
      if (err.name !== 'AbortError') {
        setDocument(`Error: ${err.message}`)
      }
    } finally {
      setIsStreaming(false)
      setStreamingContent('')
      abortRef.current = null
    }
  }

  async function handleApply() {
    if (!adjustPrompt.trim() || !document || isStreaming) return

    const fullPrompt = `${adjustPrompt.trim()}\n\n--- Current Document ---\n${document}`

    const provider = await getDefaultProvider()
    if (!provider) {
      setDocument('Error: No provider configured.')
      return
    }

    setIsStreaming(true)
    setStreamingContent('')
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
      setDocument(full)
      setAdjustPrompt('')
    } catch (err) {
      if (err.name !== 'AbortError') {
        setDocument(`Error: ${err.message}`)
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
    const content = document || streamingContent
    if (!content) return
    const blob = new Blob([content], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `notes-summary-${new Date().toISOString().split('T')[0]}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleNewGeneration() {
    setDocument(null)
    setStreamingContent('')
    setAdjustPrompt('')
  }

  function handleBack() {
    setDocument(null)
    setStreamingContent('')
    setAdjustPrompt('')
  }

  // Editor view
  if (document !== null || isStreaming) {
    const displayContent = document || streamingContent
    return (
      <div className="notes-editor">
        <div className="notes-editor-content">
          <textarea
            className="notes-editor-textarea"
            value={displayContent}
            onChange={e => setDocument(e.target.value)}
            disabled={isStreaming}
            placeholder="Generated content will appear here..."
          />
          {isStreaming && <span className="streaming-indicator" />}
        </div>
        <div className="notes-editor-prompt">
          <textarea
            className="notes-prompt"
            value={adjustPrompt}
            onChange={e => setAdjustPrompt(e.target.value)}
            placeholder="Ask AI to adjust the document..."
            rows={2}
            disabled={isStreaming}
          />
          <button
            className="btn btn-primary"
            onClick={handleApply}
            disabled={!adjustPrompt.trim() || isStreaming}
          >
            {isStreaming ? 'Generating...' : 'Apply'}
          </button>
        </div>
        <div className="notes-editor-actions">
          {!isStreaming && (
            <>
              <button className="btn btn-primary" onClick={handleDownload}>Download .md</button>
              <button className="btn btn-secondary" onClick={handleNewGeneration}>New generation</button>
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
                    {note.sourceUrl && (note.sourceUrl.startsWith('http://') || note.sourceUrl.startsWith('https://')) ? (
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

- [ ] **Step 2: Add editor styles**

Append to `src/sidepanel/App.css`:
```css
.notes-editor {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.notes-editor-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  position: relative;
}

.notes-editor-textarea {
  width: 100%;
  height: 100%;
  min-height: 200px;
  padding: 12px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 14px;
  font-family: inherit;
  line-height: 1.5;
  resize: none;
}

.notes-editor-textarea:focus {
  outline: none;
  border-color: #2563eb;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.2);
}

.notes-editor-textarea:disabled {
  background: #f9fafb;
  color: #6b7280;
}

.notes-editor-prompt {
  display: flex;
  gap: 8px;
  padding: 0 16px;
  align-items: flex-end;
}

.notes-editor-prompt .notes-prompt {
  flex: 1;
}

.notes-editor-actions {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  background: white;
  border-top: 1px solid #e5e7eb;
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/sidepanel/NotesTab.jsx src/sidepanel/App.css
git commit -m "feat: convert notes result view to live document editor"
```
