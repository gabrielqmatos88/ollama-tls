# ollama-tls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Chrome extension that lets users transform text using OpenAI-compatible APIs via context menu popups and a persistent chat side panel.

**Architecture:** Layered modules — storage wrappers, API client, template parser, background service worker for routing, content script for selection popup, side panel for chat, options page for configuration.

**Tech Stack:** React 19, Vite 8, CRXJS v2, Chrome Extension Manifest V3

## Global Constraints

- No TypeScript — project uses plain JSX
- No test framework configured — verify via manual testing in Chrome
- Use `chrome.storage.sync` for settings/prompts/providers, `chrome.storage.local` for conversations
- All API calls use OpenAI-compatible format (`POST {baseUrl}/chat/completions`)
- Content scripts run on `https://*/*` pages
- Path alias: `@` → `src/`

---

### Task 1: Update Manifest Configuration

**Files:**
- Modify: `manifest.config.js`

**Purpose:** Add required permissions and options page to the manifest.

- [ ] **Step 1: Update manifest.config.js**

```js
import { defineManifest } from '@crxjs/vite-plugin'
import pkg from './package.json'

export default defineManifest({
  manifest_version: 3,
  name: pkg.name,
  version: pkg.version,
  icons: {
    48: 'public/logo.png',
  },
  permissions: [
    'sidePanel',
    'contentSettings',
    'contextMenus',
    'storage',
  ],
  host_permissions: [
    '<all_urls>',
  ],
  action: {
    default_icon: {
      48: 'public/logo.png',
    },
    default_popup: 'src/popup/index.html',
  },
  content_scripts: [{
    js: ['src/content/main.jsx'],
    matches: ['https://*/*'],
  }],
  side_panel: {
    default_path: 'src/sidepanel/index.html',
  },
  options_page: 'src/options/index.html',
})
```

- [ ] **Step 2: Verify build still works**

Run: `npm run build`
Expected: Build succeeds with no errors.

---

### Task 2: Storage Layer

**Files:**
- Create: `src/storage/providers.js`
- Create: `src/storage/prompts.js`
- Create: `src/storage/settings.js`

**Purpose:** Thin wrappers around `chrome.storage.sync` for CRUD operations on providers, prompts, and settings.

- [ ] **Step 1: Create providers storage**

```js
// src/storage/providers.js
const STORAGE_KEY = 'providers'

export async function getProviders() {
  const result = await chrome.storage.sync.get(STORAGE_KEY)
  return result[STORAGE_KEY] || []
}

export async function saveProviders(providers) {
  await chrome.storage.sync.set({ [STORAGE_KEY]: providers })
}

export async function addProvider(provider) {
  const providers = await getProviders()
  provider.id = crypto.randomUUID()
  providers.push(provider)
  await saveProviders(providers)
  return provider
}

export async function updateProvider(id, updates) {
  const providers = await getProviders()
  const index = providers.findIndex(p => p.id === id)
  if (index === -1) throw new Error('Provider not found')
  providers[index] = { ...providers[index], ...updates }
  await saveProviders(providers)
  return providers[index]
}

export async function deleteProvider(id) {
  const providers = await getProviders()
  await saveProviders(providers.filter(p => p.id !== id))
}

export async function getDefaultProvider() {
  const providers = await getProviders()
  return providers.find(p => p.isDefault) || providers[0] || null
}
```

- [ ] **Step 2: Create prompts storage**

```js
// src/storage/prompts.js
const STORAGE_KEY = 'prompts'

const DEFAULT_PROMPTS = [
  {
    id: 'default-translate-en',
    name: 'Translate to English',
    template: 'Translate the following text to English:\n\n{text}',
    showInContextMenu: true,
  },
  {
    id: 'default-translate-native',
    name: 'Translate to Native',
    template: 'Translate to {language}:\n\n{text}',
    showInContextMenu: true,
  },
  {
    id: 'default-correct-grammar',
    name: 'Correct Grammar',
    template: 'Correct the grammar and fix typos:\n\n{text}',
    showInContextMenu: true,
  },
  {
    id: 'default-professional-tone',
    name: 'Professional Tone',
    template: 'Rewrite in a professional tone:\n\n{text}',
    showInContextMenu: true,
  },
  {
    id: 'default-simplify',
    name: 'Simplify',
    template: 'Rewrite this in simpler English:\n\n{text}',
    showInContextMenu: true,
  },
]

export async function getPrompts() {
  const result = await chrome.storage.sync.get(STORAGE_KEY)
  return result[STORAGE_KEY] || null
}

export async function initializePrompts() {
  let prompts = await getPrompts()
  if (!prompts) {
    await savePrompts(DEFAULT_PROMPTS)
    return DEFAULT_PROMPTS
  }
  return prompts
}

export async function savePrompts(prompts) {
  await chrome.storage.sync.set({ [STORAGE_KEY]: prompts })
}

export async function addPrompt(prompt) {
  const prompts = await getPrompts() || []
  prompt.id = crypto.randomUUID()
  prompts.push(prompt)
  await savePrompts(prompts)
  return prompt
}

export async function updatePrompt(id, updates) {
  const prompts = await getPrompts() || []
  const index = prompts.findIndex(p => p.id === id)
  if (index === -1) throw new Error('Prompt not found')
  prompts[index] = { ...prompts[index], ...updates }
  await savePrompts(prompts)
  return prompts[index]
}

export async function deletePrompt(id) {
  const prompts = await getPrompts() || []
  await savePrompts(prompts.filter(p => p.id !== id))
}
```

- [ ] **Step 3: Create settings storage**

```js
// src/storage/settings.js
const STORAGE_KEY = 'settings'

export async function getSettings() {
  const result = await chrome.storage.sync.get(STORAGE_KEY)
  return result[STORAGE_KEY] || {
    nativeLanguage: null,
    defaultProviderId: null,
  }
}

export async function saveSettings(settings) {
  await chrome.storage.sync.set({ [STORAGE_KEY]: settings })
}

export async function updateSettings(updates) {
  const settings = await getSettings()
  const updated = { ...settings, ...updates }
  await saveSettings(updated)
  return updated
}
```

---

### Task 3: Template Parser Utility

**Files:**
- Create: `src/utils/templateParser.js`

**Purpose:** Parse `{name:type}` syntax from templates, extract variable metadata, and replace variables with user values.

- [ ] **Step 1: Create template parser**

```js
// src/utils/templateParser.js

/**
 * Parse template variables from {name:type} syntax.
 * Returns array of { name, type, options }
 *
 * Types:
 *   {name}           -> { name, type: 'text' }
 *   {name:number}    -> { name, type: 'number' }
 *   {name:textarea}  -> { name, type: 'textarea' }
 *   {name:boolean}   -> { name, type: 'boolean' }
 *   {name:a;b;c}     -> { name, type: 'select', options: ['a','b','c'] }
 *   {name:a|b|c}     -> { name, type: 'radio', options: ['a','b','c'] }
 */
export function parseVariables(template) {
  const regex = /\{([^}]+)\}/g
  const variables = []
  let match

  while ((match = regex.exec(template)) !== null) {
    const full = match[1]
    const colonIndex = full.indexOf(':')
    const name = colonIndex === -1 ? full : full.substring(0, colonIndex)
    const typeStr = colonIndex === -1 ? null : full.substring(colonIndex + 1)

    if (name === 'text') continue // {text} is special, not user-editable

    let type = 'text'
    let options = null

    if (!typeStr) {
      type = 'text'
    } else if (typeStr === 'number') {
      type = 'number'
    } else if (typeStr === 'textarea') {
      type = 'textarea'
    } else if (typeStr === 'boolean') {
      type = 'boolean'
    } else if (typeStr.includes(';')) {
      type = 'select'
      options = typeStr.split(';')
    } else if (typeStr.includes('|')) {
      type = 'radio'
      options = typeStr.split('|')
    } else {
      type = 'text'
    }

    variables.push({ name, type, options })
  }

  return variables
}

/**
 * Replace all {name} and {name:type} placeholders in template with values.
 * The {text} placeholder is replaced with selectedText.
 */
export function replaceVariables(template, selectedText, variableValues = {}) {
  let result = template

  // Replace {text} or {text:anything} with selected text
  result = result.replace(/\{text[^}]*\}/g, selectedText)

  // Replace other variables
  result = result.replace(/\{([^}]+)\}/g, (match, full) => {
    const colonIndex = full.indexOf(':')
    const name = colonIndex === -1 ? full : full.substring(0, colonIndex)

    if (name === 'text') return selectedText

    const value = variableValues[name]
    if (value === undefined || value === null) return match
    return String(value)
  })

  return result
}
```

---

### Task 4: API Client

**Files:**
- Create: `src/api/client.js`

**Purpose:** Single function to call any OpenAI-compatible endpoint with streaming support.

- [ ] **Step 1: Create API client**

```js
// src/api/client.js

/**
 * Call an OpenAI-compatible chat completions endpoint with streaming.
 *
 * @param {Object} params
 * @param {string} params.baseUrl - e.g. "http://localhost:11434/v1"
 * @param {string} params.apiKey - empty string for local providers
 * @param {string} params.model - model name
 * @param {Array} params.messages - [{ role, content }]
 * @param {AbortSignal} params.signal - for cancellation
 * @param {Function} params.onChunk - called with each content delta
 * @returns {Promise<string>} full response text
 */
export async function callProvider({ baseUrl, apiKey, model, messages, signal, onChunk }) {
  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`

  const headers = {
    'Content-Type': 'application/json',
  }
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages,
      stream: true,
    }),
    signal,
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error')
    throw new Error(`API error ${response.status}: ${errorText}`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let fullText = ''
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() // keep incomplete line in buffer

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || !trimmed.startsWith('data: ')) continue
      const data = trimmed.slice(6)
      if (data === '[DONE]') break

      try {
        const parsed = JSON.parse(data)
        const delta = parsed.choices?.[0]?.delta?.content
        if (delta) {
          fullText += delta
          onChunk?.(delta, fullText)
        }
      } catch {
        // skip malformed JSON chunks
      }
    }
  }

  return fullText
}
```

---

### Task 5: Background Service Worker

**Files:**
- Modify: `src/background/main.js` (create new, replacing any existing)

**Purpose:** Register context menus, route messages between content script and side panel.

- [ ] **Step 1: Create background service worker**

```js
// src/background/main.js
import { getPrompts, initializePrompts } from '@/storage/prompts'
import { getSettings } from '@/storage/settings'

// Initialize on install
chrome.runtime.onInstalled.addListener(async () => {
  await initializePrompts()
  await rebuildContextMenus()
})

// Rebuild context menus when prompts change
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.prompts) {
    rebuildContextMenus()
  }
})

async function rebuildContextMenus() {
  // Remove all existing menu items
  await chrome.contextMenus.removeAll()

  const prompts = await getPrompts()
  const contextPrompts = prompts.filter(p => p.showInContextMenu)

  // Parent menu
  chrome.contextMenus.create({
    id: 'ollama-tls',
    title: 'ollama-tls',
    contexts: ['selection'],
  })

  // One entry per prompt
  for (const prompt of contextPrompts) {
    chrome.contextMenus.create({
      id: `prompt:${prompt.id}`,
      parentId: 'ollama-tls',
      title: prompt.name,
      contexts: ['selection'],
    })
  }
}

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!info.menuItemId.startsWith('prompt:')) return

  const promptId = info.menuItemId.replace('prompt:', '')
  const selectedText = info.selectionText

  // Open side panel and send data
  await chrome.sidePanel.open({ tabId: tab.id })
  await chrome.sidePanel.setOptions({
    tabId: tab.id,
    enabled: true,
  })

  // Small delay to let side panel initialize
  setTimeout(() => {
    chrome.runtime.sendMessage({
      type: 'PROMPT_SELECTED',
      promptId,
      selectedText,
      variables: {},
    }).catch(() => {})
  }, 300)
})

// Handle messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'OPEN_SIDEBAR_WITH_PROMPT') {
    const { promptId, selectedText, variables } = message

    // Open side panel for the tab that sent the message
    chrome.sidePanel.open({ tabId: sender.tab.id })
    chrome.sidePanel.setOptions({
      tabId: sender.tab.id,
      enabled: true,
    })

    // Forward to side panel
    setTimeout(() => {
      chrome.runtime.sendMessage({
        type: 'PROMPT_SELECTED',
        promptId,
        selectedText,
        variables,
      }).catch(() => {})
    }, 300)

    sendResponse({ ok: true })
  }
  return true // keep message channel open for async response
})
```

---

### Task 6: Options Page — Structure & Providers Tab

**Files:**
- Create: `src/options/index.html`
- Create: `src/options/main.jsx`
- Create: `src/options/App.jsx`
- Create: `src/options/App.css`
- Create: `src/options/ProvidersTab.jsx`

**Purpose:** Options page shell with tab navigation and providers management.

- [ ] **Step 1: Create options HTML entry**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ollama-tls Options</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="./main.jsx"></script>
</body>
</html>
```

- [ ] **Step 2: Create options main.jsx**

```jsx
// src/options/main.jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './App.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 3: Create options App.jsx with tabs**

```jsx
// src/options/App.jsx
import { useState } from 'react'
import ProvidersTab from './ProvidersTab.jsx'
import PromptsTab from './PromptsTab.jsx'
import SettingsTab from './SettingsTab.jsx'

const TABS = [
  { id: 'providers', label: 'Providers' },
  { id: 'prompts', label: 'Prompts' },
  { id: 'settings', label: 'Settings' },
]

export default function App() {
  const [activeTab, setActiveTab] = useState('providers')

  return (
    <div className="options-container">
      <h1>ollama-tls</h1>
      <nav className="tabs">
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      <main className="tab-content">
        {activeTab === 'providers' && <ProvidersTab />}
        {activeTab === 'prompts' && <PromptsTab />}
        {activeTab === 'settings' && <SettingsTab />}
      </main>
    </div>
  )
}
```

- [ ] **Step 4: Create options App.css**

```css
/* src/options/App.css */
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #f5f5f5;
  color: #333;
  padding: 24px;
}

.options-container {
  max-width: 720px;
  margin: 0 auto;
}

h1 {
  font-size: 24px;
  margin-bottom: 16px;
}

.tabs {
  display: flex;
  gap: 4px;
  border-bottom: 2px solid #ddd;
  margin-bottom: 24px;
}

.tab {
  padding: 8px 16px;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 14px;
  color: #666;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
}

.tab:hover {
  color: #333;
}

.tab.active {
  color: #2563eb;
  border-bottom-color: #2563eb;
}

.tab-content {
  background: white;
  border-radius: 8px;
  padding: 24px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.btn {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
}

.btn-primary {
  background: #2563eb;
  color: white;
}

.btn-primary:hover {
  background: #1d4ed8;
}

.btn-danger {
  background: #dc2626;
  color: white;
}

.btn-danger:hover {
  background: #b91c1c;
}

.btn-secondary {
  background: #e5e7eb;
  color: #333;
}

.btn-secondary:hover {
  background: #d1d5db;
}

input, textarea, select {
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  width: 100%;
}

input:focus, textarea:focus, select:focus {
  outline: none;
  border-color: #2563eb;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.2);
}
```

- [ ] **Step 5: Create ProvidersTab.jsx**

```jsx
// src/options/ProvidersTab.jsx
import { useState, useEffect } from 'react'
import { getProviders, addProvider, updateProvider, deleteProvider } from '@/storage/providers'

const EMPTY_PROVIDER = {
  name: '',
  baseUrl: '',
  apiKey: '',
  model: '',
  isDefault: false,
}

export default function ProvidersTab() {
  const [providers, setProviders] = useState([])
  const [editing, setEditing] = useState(null) // null | 'new' | provider id
  const [form, setForm] = useState(EMPTY_PROVIDER)
  const [testResult, setTestResult] = useState(null)

  useEffect(() => {
    loadProviders()
  }, [])

  async function loadProviders() {
    const loaded = await getProviders()
    setProviders(loaded)
  }

  function startAdd() {
    setForm({ ...EMPTY_PROVIDER })
    setEditing('new')
    setTestResult(null)
  }

  function startEdit(provider) {
    setForm({ ...provider })
    setEditing(provider.id)
    setTestResult(null)
  }

  function cancelEdit() {
    setEditing(null)
    setForm(EMPTY_PROVIDER)
    setTestResult(null)
  }

  async function handleSave() {
    if (!form.name || !form.baseUrl || !form.model) return

    if (editing === 'new') {
      await addProvider(form)
    } else {
      await updateProvider(editing, form)
    }

    await loadProviders()
    cancelEdit()
  }

  async function handleDelete(id) {
    await deleteProvider(id)
    await loadProviders()
    if (editing === id) cancelEdit()
  }

  async function handleSetDefault(id) {
    // Clear all defaults first
    for (const p of providers) {
      if (p.isDefault) await updateProvider(p.id, { isDefault: false })
    }
    await updateProvider(id, { isDefault: true })
    await loadProviders()
  }

  async function handleTestConnection() {
    setTestResult('testing...')
    try {
      const { callProvider } = await import('@/api/client.js')
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000)

      await callProvider({
        baseUrl: form.baseUrl,
        apiKey: form.apiKey,
        model: form.model,
        messages: [{ role: 'user', content: 'Say "connection ok" in 3 words or less.' }],
        signal: controller.signal,
        onChunk: () => {},
      })

      clearTimeout(timeout)
      setTestResult('Connection successful!')
    } catch (err) {
      setTestResult(`Error: ${err.message}`)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2>Providers</h2>
        <button className="btn btn-primary" onClick={startAdd}>Add Provider</button>
      </div>

      {editing && (
        <div style={{ background: '#f9fafb', padding: 16, borderRadius: 8, marginBottom: 16, border: '1px solid #e5e7eb' }}>
          <h3 style={{ marginBottom: 12 }}>{editing === 'new' ? 'New Provider' : 'Edit Provider'}</h3>
          <div style={{ display: 'grid', gap: 12 }}>
            <label>
              Name
              <input
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="My Provider"
              />
            </label>
            <label>
              Base URL
              <input
                value={form.baseUrl}
                onChange={e => setForm({ ...form, baseUrl: e.target.value })}
                placeholder="http://localhost:11434/v1"
              />
            </label>
            <label>
              API Key (optional for local)
              <input
                type="password"
                value={form.apiKey}
                onChange={e => setForm({ ...form, apiKey: e.target.value })}
                placeholder="sk-..."
              />
            </label>
            <label>
              Model
              <input
                value={form.model}
                onChange={e => setForm({ ...form, model: e.target.value })}
                placeholder="llama3.2"
              />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={form.isDefault}
                onChange={e => setForm({ ...form, isDefault: e.target.checked })}
                style={{ width: 'auto' }}
              />
              Set as default provider
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button className="btn btn-primary" onClick={handleSave}>Save</button>
            <button className="btn btn-secondary" onClick={handleTestConnection}>Test Connection</button>
            <button className="btn btn-secondary" onClick={cancelEdit}>Cancel</button>
            {testResult && <span style={{ alignSelf: 'center', fontSize: 14, color: testResult.includes('Error') ? '#dc2626' : '#16a34a' }}>{testResult}</span>}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gap: 8 }}>
        {providers.map(provider => (
          <div key={provider.id} style={{ display: 'flex', alignItems: 'center', padding: 12, border: '1px solid #e5e7eb', borderRadius: 8, gap: 12 }}>
            <input
              type="radio"
              name="defaultProvider"
              checked={provider.isDefault}
              onChange={() => handleSetDefault(provider.id)}
              style={{ width: 'auto' }}
            />
            <div style={{ flex: 1 }}>
              <strong>{provider.name}</strong>
              {provider.isDefault && <span style={{ marginLeft: 8, fontSize: 12, color: '#2563eb', background: '#eff6ff', padding: '2px 6px', borderRadius: 4 }}>default</span>}
              <div style={{ fontSize: 13, color: '#666' }}>{provider.baseUrl} — {provider.model}</div>
            </div>
            <button className="btn btn-secondary" onClick={() => startEdit(provider)}>Edit</button>
            <button className="btn btn-danger" onClick={() => handleDelete(provider.id)}>Delete</button>
          </div>
        ))}
        {providers.length === 0 && !editing && (
          <p style={{ color: '#666', textAlign: 'center', padding: 24 }}>No providers configured. Click "Add Provider" to get started.</p>
        )}
      </div>
    </div>
  )
}
```

---

### Task 7: Options Page — Prompts Tab

**Files:**
- Create: `src/options/PromptsTab.jsx`

**Purpose:** Manage prompt templates with variable type preview.

- [ ] **Step 1: Create PromptsTab.jsx**

```jsx
// src/options/PromptsTab.jsx
import { useState, useEffect } from 'react'
import { getPrompts, initializePrompts, addPrompt, updatePrompt, deletePrompt } from '@/storage/prompts'
import { parseVariables } from '@/utils/templateParser'

const EMPTY_PROMPT = {
  name: '',
  template: '',
  showInContextMenu: true,
}

export default function PromptsTab() {
  const [prompts, setPrompts] = useState([])
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_PROMPT)

  useEffect(() => {
    loadPrompts()
  }, [])

  async function loadPrompts() {
    const loaded = await initializePrompts()
    setPrompts(loaded)
  }

  function startAdd() {
    setForm({ ...EMPTY_PROMPT })
    setEditing('new')
  }

  function startEdit(prompt) {
    setForm({ ...prompt })
    setEditing(prompt.id)
  }

  function cancelEdit() {
    setEditing(null)
    setForm(EMPTY_PROMPT)
  }

  async function handleSave() {
    if (!form.name || !form.template) return

    if (editing === 'new') {
      await addPrompt(form)
    } else {
      await updatePrompt(editing, form)
    }

    await loadPrompts()
    cancelEdit()
  }

  async function handleDelete(id) {
    await deletePrompt(id)
    await loadPrompts()
    if (editing === id) cancelEdit()
  }

  const detectedVariables = form.template ? parseVariables(form.template) : []

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2>Prompts</h2>
        <button className="btn btn-primary" onClick={startAdd}>Add Prompt</button>
      </div>

      {editing && (
        <div style={{ background: '#f9fafb', padding: 16, borderRadius: 8, marginBottom: 16, border: '1px solid #e5e7eb' }}>
          <h3 style={{ marginBottom: 12 }}>{editing === 'new' ? 'New Prompt' : 'Edit Prompt'}</h3>
          <div style={{ display: 'grid', gap: 12 }}>
            <label>
              Name
              <input
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="Translate to Spanish"
              />
            </label>
            <label>
              Template
              <textarea
                value={form.template}
                onChange={e => setForm({ ...form, template: e.target.value })}
                placeholder="Translate to {language}:\n\n{text}"
                rows={4}
              />
            </label>
            {detectedVariables.length > 0 && (
              <div style={{ fontSize: 13, color: '#666' }}>
                <strong>Variables detected:</strong>
                <ul style={{ marginTop: 4, paddingLeft: 20 }}>
                  {detectedVariables.map(v => (
                    <li key={v.name}>
                      <code>{`{${v.name}}`}</code>
                      {' — '}
                      <span style={{ color: '#2563eb' }}>{v.type}</span>
                      {v.options && ` (options: ${v.options.join(', ')})`}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={form.showInContextMenu}
                onChange={e => setForm({ ...form, showInContextMenu: e.target.checked })}
                style={{ width: 'auto' }}
              />
              Show in context menu
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button className="btn btn-primary" onClick={handleSave}>Save</button>
            <button className="btn btn-secondary" onClick={cancelEdit}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gap: 8 }}>
        {prompts.map(prompt => (
          <div key={prompt.id} style={{ display: 'flex', alignItems: 'center', padding: 12, border: '1px solid #e5e7eb', borderRadius: 8, gap: 12 }}>
            <div style={{ flex: 1 }}>
              <strong>{prompt.name}</strong>
              {!prompt.showInContextMenu && <span style={{ marginLeft: 8, fontSize: 12, color: '#666', background: '#f3f4f6', padding: '2px 6px', borderRadius: 4 }}>hidden</span>}
              <div style={{ fontSize: 13, color: '#666', marginTop: 4, whiteSpace: 'pre-wrap', maxHeight: 40, overflow: 'hidden' }}>{prompt.template}</div>
            </div>
            <button className="btn btn-secondary" onClick={() => startEdit(prompt)}>Edit</button>
            <button className="btn btn-danger" onClick={() => handleDelete(prompt.id)}>Delete</button>
          </div>
        ))}
        {prompts.length === 0 && !editing && (
          <p style={{ color: '#666', textAlign: 'center', padding: 24 }}>No prompts configured.</p>
        )}
      </div>
    </div>
  )
}
```

---

### Task 8: Options Page — Settings Tab

**Files:**
- Create: `src/options/SettingsTab.jsx`

**Purpose:** Manage native language and clear conversation history.

- [ ] **Step 1: Create SettingsTab.jsx**

```jsx
// src/options/SettingsTab.jsx
import { useState, useEffect } from 'react'
import { getSettings, updateSettings } from '@/storage/settings'

export default function SettingsTab() {
  const [settings, setSettings] = useState({ nativeLanguage: '' })
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    loadSettings()
  }, [])

  async function loadSettings() {
    const loaded = await getSettings()
    setSettings({ nativeLanguage: loaded.nativeLanguage || '' })
  }

  async function handleSave() {
    await updateSettings({ nativeLanguage: settings.nativeLanguage || null })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleClearHistory() {
    await chrome.storage.local.remove('conversations')
    alert('Conversation history cleared.')
  }

  const browserLang = navigator.language || ''

  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>Settings</h2>

      <div style={{ display: 'grid', gap: 16, maxWidth: 400 }}>
        <label>
          Native Language
          <input
            value={settings.nativeLanguage}
            onChange={e => setSettings({ ...settings, nativeLanguage: e.target.value })}
            placeholder={browserLang}
          />
          <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
            Used for "Translate to Native" prompt. Browser default: {browserLang}
          </div>
        </label>

        <div>
          <button className="btn btn-primary" onClick={handleSave}>
            Save Settings
          </button>
          {saved && <span style={{ marginLeft: 8, color: '#16a34a', fontSize: 14 }}>Saved!</span>}
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb' }} />

        <div>
          <button className="btn btn-danger" onClick={handleClearHistory}>
            Clear All Conversation History
          </button>
          <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
            This will delete all saved conversations from the side panel.
          </div>
        </div>
      </div>
    </div>
  )
}
```

---

### Task 9: Content Script — Prompt Popup

**Files:**
- Modify: `src/content/main.jsx`
- Create: `src/content/PromptPopup.jsx`
- Create: `src/content/popup.css`

**Purpose:** Detect text selection, show floating popup with prompts and typed variable inputs.

- [ ] **Step 1: Create popup.css**

```css
/* src/content/popup.css */
.crjsx-prompt-popup {
  position: absolute;
  z-index: 2147483647;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  padding: 8px;
  min-width: 200px;
  max-width: 320px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 14px;
  color: #333;
}

.crjsx-prompt-popup .prompt-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.crjsx-prompt-popup .prompt-item {
  padding: 8px 12px;
  border: none;
  background: none;
  cursor: pointer;
  text-align: left;
  border-radius: 6px;
  font-size: 14px;
  color: #333;
}

.crjsx-prompt-popup .prompt-item:hover {
  background: #f3f4f6;
}

.crjsx-prompt-popup .variables-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 0;
}

.crjsx-prompt-popup .variables-form label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: #555;
}

.crjsx-prompt-popup .variables-form input,
.crjsx-prompt-popup .variables-form textarea,
.crjsx-prompt-popup .variables-form select {
  padding: 6px 8px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  font-size: 13px;
}

.crjsx-prompt-popup .variables-form .radio-group {
  display: flex;
  gap: 12px;
}

.crjsx-prompt-popup .variables-form .radio-group label {
  flex-direction: row;
  align-items: center;
  gap: 4px;
}

.crjsx-prompt-popup .variables-form .checkbox-label {
  flex-direction: row;
  align-items: center;
  gap: 6px;
}

.crjsx-prompt-popup .form-actions {
  display: flex;
  gap: 8px;
  padding-top: 4px;
}

.crjsx-prompt-popup .btn-confirm {
  padding: 6px 14px;
  border: none;
  border-radius: 4px;
  background: #2563eb;
  color: white;
  cursor: pointer;
  font-size: 13px;
}

.crjsx-prompt-popup .btn-confirm:hover {
  background: #1d4ed8;
}

.crjsx-prompt-popup .btn-cancel {
  padding: 6px 14px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  background: white;
  cursor: pointer;
  font-size: 13px;
  color: #555;
}
```

- [ ] **Step 2: Create PromptPopup.jsx**

```jsx
// src/content/PromptPopup.jsx
import { useState, useEffect, useRef } from 'react'
import { getPrompts } from '@/storage/prompts'
import { getSettings } from '@/storage/settings'
import { parseVariables } from '@/utils/templateParser'

export default function PromptPopup({ selectedText, position, onSend, onClose }) {
  const [prompts, setPrompts] = useState([])
  const [selectedPrompt, setSelectedPrompt] = useState(null)
  const [variableValues, setVariableValues] = useState({})
  const [settings, setSettings] = useState({})
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

  function handlePromptClick(prompt) {
    const variables = parseVariables(prompt.template)
    if (variables.length === 0) {
      // No variables to fill, send immediately
      onSend(prompt.id, selectedText, {})
      return
    }
    // Pre-fill language variable with native language if available
    const defaults = {}
    if (settings.nativeLanguage) {
      const langVar = variables.find(v => v.name === 'language')
      if (langVar) defaults.language = settings.nativeLanguage
    }
    setVariableValues(defaults)
    setSelectedPrompt(prompt)
  }

  function handleConfirm() {
    onSend(selectedPrompt.id, selectedText, variableValues)
  }

  const variables = selectedPrompt ? parseVariables(selectedPrompt.template) : []

  return (
    <div className="crjsx-prompt-popup" ref={popupRef} style={{ top: position.top, left: position.left }}>
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

- [ ] **Step 3: Update content main.jsx**

```jsx
// src/content/main.jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import PromptPopup from './PromptPopup.jsx'
import './popup.css'

let popupContainer = null
let popupRoot = null

function showPopup(selectedText, rect) {
  // Remove existing popup if any
  hidePopup()

  popupContainer = document.createElement('div')
  popupContainer.id = 'crjsx-prompt-popup-root'
  popupContainer.style.position = 'absolute'
  popupContainer.style.zIndex = '2147483647'
  document.body.appendChild(popupContainer)

  // Position below the selection
  const scrollX = window.scrollX
  const scrollY = window.scrollY
  const top = scrollY + rect.bottom + 8
  const left = scrollX + rect.left

  popupRoot = createRoot(popupContainer)
  popupRoot.render(
    <StrictMode>
      <PromptPopup
        selectedText={selectedText}
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
}

function handleSend(promptId, selectedText, variables) {
  chrome.runtime.sendMessage({
    type: 'OPEN_SIDEBAR_WITH_PROMPT',
    promptId,
    selectedText,
    variables,
  })
  hidePopup()
}

// Listen for text selection
document.addEventListener('mouseup', (e) => {
  // Ignore clicks on our own popup
  if (e.target.closest('#crjsx-prompt-popup-root')) return

  const selection = window.getSelection()
  const selectedText = selection.toString().trim()

  if (!selectedText) return

  const range = selection.getRangeAt(0)
  const rect = range.getBoundingClientRect()

  showPopup(selectedText, rect)
})
```

---

### Task 10: Side Panel — Chat Interface

**Files:**
- Modify: `src/sidepanel/App.jsx`
- Create: `src/sidepanel/ChatMessage.jsx`
- Create: `src/sidepanel/ChatInput.jsx`
- Modify: `src/sidepanel/App.css`

**Purpose:** Chat interface with streaming responses and conversation persistence.

- [ ] **Step 1: Create ChatMessage.jsx**

```jsx
// src/sidepanel/ChatMessage.jsx
export default function ChatMessage({ message, onCopy }) {
  const isUser = message.role === 'user'

  return (
    <div className={`chat-message ${isUser ? 'user' : 'assistant'}`}>
      <div className="message-content">
        <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>{message.content}</pre>
      </div>
      {!isUser && (
        <button className="copy-btn" onClick={() => onCopy(message.content)} title="Copy">
          Copy
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create ChatInput.jsx**

```jsx
// src/sidepanel/ChatInput.jsx
import { useState, useRef, useEffect } from 'react'

export default function ChatInput({ onSend, disabled }) {
  const [text, setText] = useState('')
  const textareaRef = useRef(null)

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleSend() {
    const trimmed = text.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setText('')
  }

  return (
    <div className="chat-input">
      <textarea
        ref={textareaRef}
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type a message... (Enter to send, Shift+Enter for newline)"
        disabled={disabled}
        rows={2}
      />
      <button onClick={handleSend} disabled={disabled || !text.trim()}>
        Send
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Update sidepanel App.css**

```css
/* src/sidepanel/App.css */
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #f9fafb;
  color: #333;
  height: 100vh;
  display: flex;
  flex-direction: column;
}

#root {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: white;
  border-bottom: 1px solid #e5e7eb;
}

.chat-header h2 {
  font-size: 16px;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.chat-message {
  max-width: 90%;
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 14px;
  line-height: 1.5;
}

.chat-message.user {
  align-self: flex-end;
  background: #2563eb;
  color: white;
  border-bottom-right-radius: 4px;
}

.chat-message.assistant {
  align-self: flex-start;
  background: white;
  border: 1px solid #e5e7eb;
  border-bottom-left-radius: 4px;
}

.copy-btn {
  margin-top: 8px;
  padding: 4px 10px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  background: white;
  cursor: pointer;
  font-size: 12px;
  color: #555;
}

.copy-btn:hover {
  background: #f3f4f6;
}

.chat-input {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  background: white;
  border-top: 1px solid #e5e7eb;
}

.chat-input textarea {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 14px;
  resize: none;
  font-family: inherit;
}

.chat-input textarea:focus {
  outline: none;
  border-color: #2563eb;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.2);
}

.chat-input button {
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  background: #2563eb;
  color: white;
  cursor: pointer;
  font-size: 14px;
  align-self: flex-end;
}

.chat-input button:hover {
  background: #1d4ed8;
}

.chat-input button:disabled {
  background: #93c5fd;
  cursor: not-allowed;
}

.stop-btn {
  padding: 4px 12px;
  border: 1px solid #dc2626;
  border-radius: 4px;
  background: white;
  color: #dc2626;
  cursor: pointer;
  font-size: 13px;
}

.stop-btn:hover {
  background: #fef2f2;
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #9ca3af;
  font-size: 14px;
}

.streaming-indicator {
  display: inline-block;
  width: 8px;
  height: 8px;
  background: #2563eb;
  border-radius: 50%;
  animation: pulse 1s infinite;
  margin-left: 4px;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
```

- [ ] **Step 4: Update sidepanel App.jsx**

```jsx
// src/sidepanel/App.jsx
import { useState, useEffect, useRef } from 'react'
import ChatMessage from './ChatMessage.jsx'
import ChatInput from './ChatInput.jsx'
import { getPrompts } from '@/storage/prompts'
import { getDefaultProvider } from '@/storage/providers'
import { replaceVariables } from '@/utils/templateParser'
import { callProvider } from '@/api/client.js'
import './App.css'

const CONVERSATIONS_KEY = 'conversations'

async function loadConversation() {
  const result = await chrome.storage.local.get(CONVERSATIONS_KEY)
  const conversations = result[CONVERSATIONS_KEY] || []
  return conversations[0] || { id: crypto.randomUUID(), messages: [], createdAt: Date.now(), updatedAt: Date.now() }
}

async function saveConversation(conversation) {
  conversation.updatedAt = Date.now()
  await chrome.storage.local.set({ [CONVERSATIONS_KEY]: [conversation] })
}

export default function App() {
  const [conversation, setConversation] = useState(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const abortRef = useRef(null)
  const messagesEndRef = useRef(null)

  useEffect(() => {
    loadConversation().then(setConversation)
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [conversation?.messages, streamingContent])

  // Listen for prompt from content script / background
  useEffect(() => {
    function handleMessage(message) {
      if (message.type === 'PROMPT_SELECTED') {
        handlePromptReceived(message.promptId, message.selectedText, message.variables)
      }
    }
    chrome.runtime.onMessage.addListener(handleMessage)
    return () => chrome.runtime.onMessage.removeListener(handleMessage)
  }, [conversation])

  async function handlePromptReceived(promptId, selectedText, variables) {
    const prompts = await getPrompts()
    const prompt = prompts.find(p => p.id === promptId)
    if (!prompt) return

    const content = replaceVariables(prompt.template, selectedText, variables)

    const newMessage = { role: 'user', content }
    const updated = {
      ...conversation,
      messages: [...(conversation?.messages || []), newMessage],
    }
    setConversation(updated)
    await saveConversation(updated)

    await sendToAI(updated.messages)
  }

  async function sendToAI(messages) {
    const provider = await getDefaultProvider()
    if (!provider) {
      const errorMsg = { role: 'assistant', content: 'Error: No provider configured. Please add a provider in the options page.' }
      const updated = { ...conversation, messages: [...messages, errorMsg] }
      setConversation(updated)
      await saveConversation(updated)
      return
    }

    setIsStreaming(true)
    setStreamingContent('')
    abortRef.current = new AbortController()

    try {
      const aiMessages = messages.map(m => ({ role: m.role, content: m.content }))

      await callProvider({
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey,
        model: provider.model,
        messages: aiMessages,
        signal: abortRef.current.signal,
        onChunk: (delta, full) => setStreamingContent(full),
      })
    } catch (err) {
      if (err.name === 'AbortError') {
        // User stopped generation
      } else {
        setStreamingContent(`Error: ${err.message}`)
      }
    } finally {
      setIsStreaming(false)
      const finalContent = streamingContent || ''
      if (finalContent) {
        const assistantMsg = { role: 'assistant', content: finalContent }
        const updated = { ...conversation, messages: [...messages, assistantMsg] }
        setConversation(updated)
        await saveConversation(updated)
      }
      setStreamingContent('')
      abortRef.current = null
    }
  }

  async function handleSend(text) {
    const newMessage = { role: 'user', content: text }
    const updated = {
      ...conversation,
      messages: [...(conversation?.messages || []), newMessage],
    }
    setConversation(updated)
    await saveConversation(updated)
    await sendToAI(updated.messages)
  }

  function handleStop() {
    abortRef.current?.abort()
  }

  function handleCopy(text) {
    navigator.clipboard.writeText(text)
  }

  async function handleNewConversation() {
    const newConv = { id: crypto.randomUUID(), messages: [], createdAt: Date.now(), updatedAt: Date.now() }
    setConversation(newConv)
    await saveConversation(newConv)
  }

  const messages = conversation?.messages || []

  return (
    <>
      <div className="chat-header">
        <h2>ollama-tls</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          {isStreaming && <button className="stop-btn" onClick={handleStop}>Stop</button>}
          <button className="btn btn-secondary" onClick={handleNewConversation} style={{ padding: '4px 12px', fontSize: 13 }}>New</button>
        </div>
      </div>
      <div className="chat-messages">
        {messages.length === 0 && !isStreaming && (
          <div className="empty-state">Select text on a page and choose a prompt to get started.</div>
        )}
        {messages.map((msg, i) => (
          <ChatMessage key={i} message={msg} onCopy={handleCopy} />
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
      <ChatInput onSend={handleSend} disabled={isStreaming} />
    </>
  )
}
```

---

### Task 11: Update Popup Entry Point

**Files:**
- Modify: `src/popup/App.jsx`
- Modify: `src/popup/App.css`

**Purpose:** Replace the default template popup with a minimal launcher that opens the side panel.

- [ ] **Step 1: Update popup App.jsx**

```jsx
// src/popup/App.jsx
import './App.css'

export default function App() {
  function handleOpenSidePanel() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.sidePanel.open({ tabId: tabs[0].id })
      }
    })
    window.close()
  }

  function handleOpenOptions() {
    chrome.runtime.openOptionsPage()
    window.close()
  }

  return (
    <div className="popup-container">
      <h2>ollama-tls</h2>
      <p className="popup-desc">AI text transformation</p>
      <div className="popup-actions">
        <button className="btn btn-primary" onClick={handleOpenSidePanel}>Open Chat</button>
        <button className="btn btn-secondary" onClick={handleOpenOptions}>Settings</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Update popup App.css**

```css
/* src/popup/App.css */
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  width: 220px;
  padding: 16px;
}

.popup-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.popup-container h2 {
  font-size: 16px;
}

.popup-desc {
  font-size: 13px;
  color: #666;
}

.popup-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.btn {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
}

.btn-primary {
  background: #2563eb;
  color: white;
}

.btn-primary:hover {
  background: #1d4ed8;
}

.btn-secondary {
  background: #e5e7eb;
  color: #333;
}

.btn-secondary:hover {
  background: #d1d5db;
}
```

---

### Task 12: Update Vite Config for Options Page

**Files:**
- Modify: `vite.config.js`

**Purpose:** Ensure Vite builds the options page entry correctly.

- [ ] **Step 1: Update vite.config.js**

The CRXJS plugin should automatically pick up the options page from the manifest. No changes needed to `vite.config.js` — the `options_page` field in `manifest.config.js` is sufficient.

Verify by running `npm run build` and checking that `dist/options/index.html` exists.

---

### Task 13: Build & Verify

**Purpose:** Ensure the extension builds and loads correctly in Chrome.

- [ ] **Step 1: Run the build**

Run: `npm run build`
Expected: Build succeeds with no errors. Check that `dist/` contains:
- `manifest.json`
- `options/index.html`
- `sidepanel/index.html`
- `popup/index.html`
- Content script files
- Background service worker

- [ ] **Step 2: Load in Chrome for testing**

1. Open Chrome → `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" → select the `dist/` folder
4. Verify the extension icon appears in the toolbar

- [ ] **Step 3: Test the full flow**

1. Click extension icon → popup shows "Open Chat" and "Settings"
2. Click "Settings" → options page opens with three tabs
3. Add a provider (e.g., Ollama at `http://localhost:11434/v1`, model `llama3.2`)
4. Test connection → should show success
5. Go to any HTTPS page, select text → floating popup with prompts appears
6. Click a prompt → side panel opens with the prompt sent to AI
7. Verify streaming response appears in side panel
8. Type a follow-up message → AI responds with conversation context
9. Close and reopen side panel → history persists
10. Right-click selected text → context menu shows prompts
