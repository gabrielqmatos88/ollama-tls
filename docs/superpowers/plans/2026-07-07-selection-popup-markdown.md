# Enhanced Selection Popup & Copy as Markdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Copy as Markdown functionality to text selection popup and context menu, convert selection to markdown when sending to side panel.

**Architecture:** New utility converts DOM selection to basic markdown. PromptPopup gets a Copy button. Context menu gets Copy as Markdown item using `chrome.scripting.executeScript`.

**Tech Stack:** React 19, Vite 8, Chrome Extension APIs

## Global Constraints

- No TypeScript — plain JSX
- Follow existing inline style patterns (no CSS modules)
- Use `@/` path alias for imports from `src/`
- Chrome extension APIs (`chrome.storage`, `chrome.runtime`, `chrome.scripting`)
- No new dependencies

---

### Task 1: Create DOM to Markdown Utility

**Files:**
- Create: `src/utils/domToMarkdown.js`

**Interfaces:**
- Produces: `domToMarkdown(range)` — takes DOM Range, returns markdown string
- Produces: `selectionToMarkdown()` — gets current selection, returns markdown

- [ ] **Step 1: Create domToMarkdown.js**

```js
/**
 * Convert a DOM Range to basic markdown.
 * Handles: headings, bold, italic, links, lists, paragraphs, blockquotes, code.
 */
export function domToMarkdown(range) {
  const fragment = range.cloneContents()
  const container = document.createElement('div')
  container.appendChild(fragment)
  return nodeToMarkdown(container).trim()
}

/**
 * Get current selection as markdown.
 */
export function selectionToMarkdown() {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return ''
  return domToMarkdown(selection.getRangeAt(0))
}

function nodeToMarkdown(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return ''

  const tag = node.tagName.toLowerCase()
  const children = Array.from(node.childNodes).map(child => nodeToMarkdown(child)).join('')

  switch (tag) {
    case 'h1': return `# ${children}\n\n`
    case 'h2': return `## ${children}\n\n`
    case 'h3': return `### ${children}\n\n`
    case 'h4': return `#### ${children}\n\n`
    case 'h5': return `##### ${children}\n\n`
    case 'h6': return `###### ${children}\n\n`
    case 'strong':
    case 'b': return `**${children}**`
    case 'em':
    case 'i': return `*${children}*`
    case 'code': return `\`${children}\``
    case 'a': {
      const href = node.getAttribute('href') || ''
      return `[${children}](${href})`
    }
    case 'img': {
      const alt = node.getAttribute('alt') || ''
      const src = node.getAttribute('src') || ''
      return `![${alt}](${src})`
    }
    case 'br': return '\n'
    case 'p': return `${children}\n\n`
    case 'blockquote': return `> ${children}\n\n`
    case 'ul':
      return Array.from(node.children).map(li => `- ${nodeToMarkdown(li)}\n`).join('')
    case 'ol':
      return Array.from(node.children).map((li, i) => `${i + 1}. ${nodeToMarkdown(li)}\n`).join('')
    case 'li': return children
    case 'div': return `${children}\n`
    case 'pre': return `\`\`\`\n${children}\n\`\`\`\n\n`
    default: return children
  }
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/utils/domToMarkdown.js
git commit -m "feat: add DOM to markdown conversion utility"
```

---

### Task 2: Enhance PromptPopup with Copy as Markdown

**Files:**
- Modify: `src/content/PromptPopup.jsx`
- Modify: `src/content/main.jsx`

**Interfaces:**
- Consumes: `selectionToMarkdown()` from `src/utils/domToMarkdown.js`
- Produces: Enhanced PromptPopup with Copy as Markdown button

- [ ] **Step 1: Update main.jsx to pass markdown**

Modify `src/content/main.jsx` to convert selection to markdown:

```jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import PromptPopup from './PromptPopup.jsx'
import { selectionToMarkdown } from '@/utils/domToMarkdown'
import './popup.css'

let popupContainer = null
let popupRoot = null
let cachedMarkdown = null

function showPopup(selectedText, markdownText, rect) {
  hidePopup()

  popupContainer = document.createElement('div')
  popupContainer.id = 'crjsx-prompt-popup-root'
  popupContainer.style.position = 'absolute'
  popupContainer.style.zIndex = '2147483647'
  document.body.appendChild(popupContainer)

  const scrollX = window.scrollX
  const scrollY = window.scrollY
  const top = scrollY + rect.bottom + 8
  const left = scrollX + rect.left

  cachedMarkdown = markdownText

  popupRoot = createRoot(popupContainer)
  popupRoot.render(
    <StrictMode>
      <PromptPopup
        selectedText={selectedText}
        markdownText={markdownText}
        position={{ top, left }}
        onSend={handleSend}
        onClose={hidePopup}
      />
    </StrictMode>,
  )
}

function hidePopup() {
  if (popupRoot) {
    popupRoot.unmount()
    popupRoot = null
  }
  if (popupContainer) {
    popupContainer.remove()
    popupContainer = null
  }
  cachedMarkdown = null
}

async function handleSend(promptId, selectedText, variables) {
  chrome.runtime.sendMessage({
    type: 'OPEN_SIDEBAR_WITH_PROMPT',
    promptId,
    selectedText,
    variables,
  })

  hidePopup()
}

document.addEventListener('mouseup', (e) => {
  if (e.target.closest('#crjsx-prompt-popup-root')) return

  const selection = window.getSelection()
  const selectedText = selection.toString().trim()

  if (!selectedText) return

  const range = selection.getRangeAt(0)
  const rect = range.getBoundingClientRect()
  const markdownText = selectionToMarkdown()

  showPopup(selectedText, markdownText, rect)
})
```

- [ ] **Step 2: Update PromptPopup.jsx with Copy button**

Modify `src/content/PromptPopup.jsx` to add Copy as Markdown button and use markdown text:

```jsx
import { useState, useEffect, useRef } from 'react'
import { getPrompts } from '@/storage/prompts'
import { getSettings } from '@/storage/settings'
import { parseVariables } from '@/utils/templateParser'

export default function PromptPopup({ selectedText, markdownText, position, onSend, onClose }) {
  const [prompts, setPrompts] = useState([])
  const [selectedPrompt, setSelectedPrompt] = useState(null)
  const [variableValues, setVariableValues] = useState({})
  const [settings, setSettings] = useState({})
  const [copied, setCopied] = useState(false)
  const popupRef = useRef(null)

  useEffect(() => {
    async function load() {
      const allPrompts = await getPrompts()
      setPrompts(allPrompts.filter(p => p.showInContextMenu))
      const s = await getSettings()
      setSettings(s)
    }
    load()
  }, [])

  useEffect(() => {
    function handleClickOutside(e) {
      if (popupRef.current && !popupRef.current.contains(e.target)) {
        onClose()
      }
    }
    function handleEscape(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose])

  async function handleCopyMarkdown() {
    try {
      await navigator.clipboard.writeText(markdownText || selectedText)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  function handlePromptClick(prompt) {
    const variables = parseVariables(prompt.template)
    if (variables.length === 0) {
      onSend(prompt.id, markdownText || selectedText, {})
      return
    }
    const defaults = {}
    if (settings.nativeLanguage) {
      const langVar = variables.find(v => v.name === 'language')
      if (langVar) defaults.language = settings.nativeLanguage
    }
    setVariableValues(defaults)
    setSelectedPrompt(prompt)
  }

  function handleConfirm() {
    onSend(selectedPrompt.id, markdownText || selectedText, variableValues)
  }

  const variables = selectedPrompt ? parseVariables(selectedPrompt.template) : []

  return (
    <div className="crjsx-prompt-popup" ref={popupRef} style={{ top: position.top, left: position.left }}>
      <button
        className="copy-markdown-btn"
        onClick={handleCopyMarkdown}
      >
        {copied ? 'Copied!' : 'Copy as Markdown'}
      </button>
      {!selectedPrompt ? (
        <div className="prompt-list">
          {prompts.map(prompt => (
            <button key={prompt.id} className="prompt-item" onClick={() => handlePromptClick(prompt)}>
              {prompt.name}
            </button>
          ))}
        </div>
      ) : (
        <div>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>{selectedPrompt.name}</div>
          <div className="variables-form">
            {variables.map(variable => (
              <label key={variable.name}>
                {variable.name}
                {variable.type === 'text' && (
                  <input
                    type="text"
                    value={variableValues[variable.name] || ''}
                    onChange={e => setVariableValues({ ...variableValues, [variable.name]: e.target.value })}
                  />
                )}
                {variable.type === 'number' && (
                  <input
                    type="number"
                    value={variableValues[variable.name] || ''}
                    onChange={e => setVariableValues({ ...variableValues, [variable.name]: e.target.value })}
                  />
                )}
                {variable.type === 'textarea' && (
                  <textarea
                    value={variableValues[variable.name] || ''}
                    onChange={e => setVariableValues({ ...variableValues, [variable.name]: e.target.value })}
                    rows={3}
                  />
                )}
                {variable.type === 'boolean' && (
                  <div className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={variableValues[variable.name] || false}
                      onChange={e => setVariableValues({ ...variableValues, [variable.name]: e.target.checked })}
                      style={{ width: 'auto' }}
                    />
                    <span>{variable.name}</span>
                  </div>
                )}
                {variable.type === 'select' && (
                  <select
                    value={variableValues[variable.name] || ''}
                    onChange={e => setVariableValues({ ...variableValues, [variable.name]: e.target.value })}
                  >
                    <option value="">Select...</option>
                    {variable.options.map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                )}
                {variable.type === 'radio' && (
                  <div className="radio-group">
                    {variable.options.map(opt => (
                      <label key={opt}>
                        <input
                          type="radio"
                          name={variable.name}
                          value={opt}
                          checked={variableValues[variable.name] === opt}
                          onChange={e => setVariableValues({ ...variableValues, [variable.name]: e.target.value })}
                          style={{ width: 'auto' }}
                        />
                        {opt}
                      </label>
                    ))}
                  </div>
                )}
              </label>
            ))}
          </div>
          <div className="form-actions">
            <button className="btn-confirm" onClick={handleConfirm}>Send</button>
            <button className="btn-cancel" onClick={() => setSelectedPrompt(null)}>Back</button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Add CSS for Copy button**

Append to `src/content/popup.css`:

```css
.copy-markdown-btn {
  display: block;
  width: 100%;
  padding: 6px 10px;
  margin-bottom: 6px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #f9fafb;
  cursor: pointer;
  font-size: 13px;
  color: #374151;
  text-align: center;
}

.copy-markdown-btn:hover {
  background: #f3f4f6;
}
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add src/content/main.jsx src/content/PromptPopup.jsx src/content/popup.css
git commit -m "feat: add Copy as Markdown button to selection popup"
```

---

### Task 3: Add Copy as Markdown Context Menu

**Files:**
- Modify: `src/background/main.js`

**Interfaces:**
- Consumes: `chrome.scripting.executeScript`

- [ ] **Step 1: Add context menu item and handler**

In `src/background/main.js`, add after the "Save as Note" item in `rebuildContextMenus()`:

```js
// Add "Copy as Markdown" item
chrome.contextMenus.create({
  id: 'copy-as-markdown',
  parentId: 'ollama-scribe',
  title: 'Copy as Markdown',
  contexts: ['selection'],
})
```

Add handler in `chrome.contextMenus.onClicked.addListener`:

```js
// Handle copy as markdown
if (menuItemId === 'copy-as-markdown') {
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: copySelectionAsMarkdown,
    })
  } catch (err) {
    console.error('Failed to copy as markdown:', err)
  }
  return
}
```

Add the injected function (at the end of the file):

```js
function copySelectionAsMarkdown() {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return

  const range = selection.getRangeAt(0)
  const fragment = range.cloneContents()
  const container = document.createElement('div')
  container.appendChild(fragment)

  function nodeToMd(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent
    if (node.nodeType !== Node.ELEMENT_NODE) return ''

    const tag = node.tagName.toLowerCase()
    const children = Array.from(node.childNodes).map(child => nodeToMd(child)).join('')

    switch (tag) {
      case 'h1': return `# ${children}\n\n`
      case 'h2': return `## ${children}\n\n`
      case 'h3': return `### ${children}\n\n`
      case 'h4': return `#### ${children}\n\n`
      case 'h5': return `##### ${children}\n\n`
      case 'h6': return `###### ${children}\n\n`
      case 'strong': case 'b': return `**${children}**`
      case 'em': case 'i': return `*${children}*`
      case 'code': return `\`${children}\``
      case 'a': { const href = node.getAttribute('href') || ''; return `[${children}](${href})` }
      case 'br': return '\n'
      case 'p': return `${children}\n\n`
      case 'blockquote': return `> ${children}\n\n`
      case 'ul': return Array.from(node.children).map(li => `- ${nodeToMd(li)}\n`).join('')
      case 'ol': return Array.from(node.children).map((li, i) => `${i + 1}. ${nodeToMd(li)}\n`).join('')
      case 'li': return children
      case 'div': return `${children}\n`
      case 'pre': return `\`\`\`\n${children}\n\`\`\`\n\n`
      default: return children
    }
  }

  const markdown = nodeToMd(container).trim()
  navigator.clipboard.writeText(markdown).catch(err => {
    console.error('Clipboard write failed:', err)
  })
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/background/main.js
git commit -m "feat: add Copy as Markdown context menu item"
```
