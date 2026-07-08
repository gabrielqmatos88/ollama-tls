# Side Panel PromptBar & Options Model Loading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a PromptBar component to the side panel for selecting prompts, filling variables, overriding providers, and re-running prompts. Add model loading via `/v1/models` to the options page.

**Architecture:** PromptBar sits above ChatInput in the side panel, reusing the variable input pattern from `PromptPopup.jsx`. Provider override and variable pre-fill are stored in React state only. Model loading adds a `fetchModels()` function to the API client.

**Tech Stack:** React 19, Vite 8, Chrome Extension APIs

## Global Constraints

- No TypeScript — plain JSX
- Follow existing inline style patterns (no CSS modules)
- Use `@/` path alias for imports from `src/`
- Chrome extension APIs (`chrome.storage`, `chrome.runtime`)
- No new dependencies

---

### Task 1: Add `fetchModels()` to API Client

**Files:**
- Modify: `src/api/client.js`

**Interfaces:**
- Produces: `fetchModels({ baseUrl, apiKey })` → `Promise<Array<{ id: string }>>`

- [ ] **Step 1: Add fetchModels function to client.js**

```js
export async function fetchModels({ baseUrl, apiKey }) {
  const url = `${baseUrl.replace(/\/+$/, '')}/models`

  const headers = {
    'Content-Type': 'application/json',
  }
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)

  try {
    const response = await fetch(url, { headers, signal: controller.signal })
    clearTimeout(timeout)
    if (!response.ok) throw new Error(`API error ${response.status}`)
    const data = await response.json()
    return data.data || data
  } catch (err) {
    clearTimeout(timeout)
    throw err
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/api/client.js
git commit -m "feat: add fetchModels() to API client"
```

---

### Task 2: Create PromptBar Component

**Files:**
- Create: `src/sidepanel/PromptBar.jsx`

**Interfaces:**
- Consumes: `getPrompts()`, `getProviders()`, `parseVariables()`, `getSettings()`
- Produces: `PromptBar({ onSend, disabled })` — calls `onSend(promptId, variables, providerId)`

- [ ] **Step 1: Create PromptBar.jsx**

```jsx
import { useState, useEffect } from 'react'
import { getPrompts } from '@/storage/prompts'
import { getProviders } from '@/storage/providers'
import { getSettings } from '@/storage/settings'
import { parseVariables } from '@/utils/templateParser'

export default function PromptBar({ onSend, disabled }) {
  const [prompts, setPrompts] = useState([])
  const [providers, setProviders] = useState([])
  const [selectedPromptId, setSelectedPromptId] = useState('')
  const [selectedProviderId, setSelectedProviderId] = useState('')
  const [variableValues, setVariableValues] = useState({})
  const [lastRunVariables, setLastRunVariables] = useState({})
  const [settings, setSettings] = useState({})

  useEffect(() => {
    async function load() {
      const [allPrompts, allProviders, s] = await Promise.all([
        getPrompts(),
        getProviders(),
        getSettings(),
      ])
      setPrompts(allPrompts.filter(p => p.showInContextMenu))
      setProviders(allProviders)
      const defaultProvider = allProviders.find(p => p.isDefault) || allProviders[0]
      if (defaultProvider) setSelectedProviderId(defaultProvider.id)
      setSettings(s)
    }
    load()
  }, [])

  const selectedPrompt = prompts.find(p => p.id === selectedPromptId)
  const variables = selectedPrompt ? parseVariables(selectedPrompt.template) : []

  function handlePromptChange(promptId) {
    setSelectedPromptId(promptId)
    if (!promptId) {
      setVariableValues({})
      return
    }
    const previousValues = lastRunVariables[promptId] || {}
    const prompt = prompts.find(p => p.id === promptId)
    if (!prompt) return
    const vars = parseVariables(prompt.template)
    const defaults = { ...previousValues }
    if (settings.nativeLanguage) {
      const langVar = vars.find(v => v.name === 'language')
      if (langVar && !defaults.language) defaults.language = settings.nativeLanguage
    }
    setVariableValues(defaults)
  }

  function handleRun() {
    if (!selectedPromptId || disabled) return
    setLastRunVariables(prev => ({ ...prev, [selectedPromptId]: { ...variableValues } }))
    onSend(selectedPromptId, variableValues, selectedProviderId)
  }

  return (
    <div className="prompt-bar">
      <div className="prompt-bar-row">
        <select
          value={selectedPromptId}
          onChange={e => handlePromptChange(e.target.value)}
          disabled={disabled}
        >
          <option value="">Free text...</option>
          {prompts.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        {providers.length > 1 && (
          <select
            value={selectedProviderId}
            onChange={e => setSelectedProviderId(e.target.value)}
            disabled={disabled}
          >
            {providers.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}
      </div>
      {selectedPrompt && variables.length > 0 && (
        <div className="prompt-bar-variables">
          {variables.map(variable => (
            <label key={variable.name}>
              {variable.name}
              {variable.type === 'text' && (
                <input
                  type="text"
                  value={variableValues[variable.name] || ''}
                  onChange={e => setVariableValues({ ...variableValues, [variable.name]: e.target.value })}
                  disabled={disabled}
                />
              )}
              {variable.type === 'number' && (
                <input
                  type="number"
                  value={variableValues[variable.name] || ''}
                  onChange={e => setVariableValues({ ...variableValues, [variable.name]: e.target.value })}
                  disabled={disabled}
                />
              )}
              {variable.type === 'textarea' && (
                <textarea
                  value={variableValues[variable.name] || ''}
                  onChange={e => setVariableValues({ ...variableValues, [variable.name]: e.target.value })}
                  disabled={disabled}
                  rows={2}
                />
              )}
              {variable.type === 'boolean' && (
                <div className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={variableValues[variable.name] || false}
                    onChange={e => setVariableValues({ ...variableValues, [variable.name]: e.target.checked })}
                    disabled={disabled}
                    style={{ width: 'auto' }}
                  />
                  <span>{variable.name}</span>
                </div>
              )}
              {variable.type === 'select' && (
                <select
                  value={variableValues[variable.name] || ''}
                  onChange={e => setVariableValues({ ...variableValues, [variable.name]: e.target.value })}
                  disabled={disabled}
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
                        disabled={disabled}
                        style={{ width: 'auto' }}
                      />
                      {opt}
                    </label>
                  ))}
                </div>
              )}
            </label>
          ))}
          <button
            className="btn btn-primary"
            onClick={handleRun}
            disabled={disabled}
          >
            Run
          </button>
        </div>
      )}
      {selectedPrompt && variables.length === 0 && (
        <div className="prompt-bar-variables">
          <button
            className="btn btn-primary"
            onClick={handleRun}
            disabled={disabled}
          >
            Run
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/sidepanel/PromptBar.jsx
git commit -m "feat: create PromptBar component for side panel"
```

---

### Task 3: Integrate PromptBar into Side Panel App

**Files:**
- Modify: `src/sidepanel/App.jsx`

**Interfaces:**
- Consumes: `PromptBar`, `getDefaultProvider()` → now optional when provider override passed
- Produces: `handlePromptSend(promptId, variables, providerId)` called by PromptBar

- [ ] **Step 1: Update App.jsx imports and state**

Add import for PromptBar:
```jsx
import PromptBar from './PromptBar.jsx'
```

Add state for provider override after existing state declarations (line 28):
```jsx
const [activeProviderId, setActiveProviderId] = useState(null)
```

- [ ] **Step 2: Add handlePromptSend function**

Add after `handleSend` function (after line 140):
```jsx
async function handlePromptSend(promptId, variables, providerId) {
  setActiveProviderId(providerId || null)
  const prompts = (await getPrompts()) || []
  const prompt = prompts.find(p => p.id === promptId)
  if (!prompt) return

  const content = replaceVariables(prompt.template, '', variables)
  const current = conversationRef.current
  const newMessage = { id: crypto.randomUUID(), role: 'user', content }
  const updated = {
    ...current,
    messages: [...(current?.messages || []), newMessage],
  }
  setConversation(updated)
  await saveConversation(updated)
  await sendToAI(updated.messages, providerId)
}
```

- [ ] **Step 3: Update sendToAI to accept optional providerId**

Change `sendToAI` signature and provider resolution (lines 76-85):
```jsx
async function sendToAI(messages, providerId) {
  let provider = null
  if (providerId) {
    const providers = await getProviders()
    provider = providers.find(p => p.id === providerId)
  }
  if (!provider) {
    provider = await getDefaultProvider()
  }
  if (!provider) {
    const current = conversationRef.current
    const errorMsg = { id: crypto.randomUUID(), role: 'assistant', content: 'Error: No provider configured. Please add a provider in the options page.' }
    const updated = { ...current, messages: [...messages, errorMsg] }
    setConversation(updated)
    await saveConversation(updated)
    return
  }
  // ... rest of sendToAI unchanged
```

Add import for `getProviders`:
```jsx
import { getDefaultProvider, getProviders } from '@/storage/providers'
```

- [ ] **Step 4: Render PromptBar in the JSX**

Add `<PromptBar />` above `<ChatInput />` in the return (before line 184):
```jsx
<PromptBar onSend={handlePromptSend} disabled={isStreaming} />
```

- [ ] **Step 5: Commit**

```bash
git add src/sidepanel/App.jsx
git commit -m "feat: integrate PromptBar into side panel App"
```

---

### Task 4: Add PromptBar Styles

**Files:**
- Modify: `src/sidepanel/App.css`

- [ ] **Step 1: Add PromptBar CSS**

Append to end of `App.css`:
```css
.prompt-bar {
  background: white;
  border-bottom: 1px solid #e5e7eb;
  padding: 8px 16px;
}

.prompt-bar-row {
  display: flex;
  gap: 8px;
}

.prompt-bar-row select {
  flex: 1;
  padding: 6px 8px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 13px;
  background: white;
}

.prompt-bar-row select:focus {
  outline: none;
  border-color: #2563eb;
}

.prompt-bar-variables {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 8px;
}

.prompt-bar-variables > label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: #555;
}

.prompt-bar-variables input[type="text"],
.prompt-bar-variables input[type="number"],
.prompt-bar-variables textarea,
.prompt-bar-variables select {
  padding: 6px 8px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  font-size: 13px;
}

.prompt-bar-variables input:focus,
.prompt-bar-variables textarea:focus,
.prompt-bar-variables select:focus {
  outline: none;
  border-color: #2563eb;
}

.prompt-bar-variables .radio-group {
  display: flex;
  gap: 12px;
}

.prompt-bar-variables .radio-group label {
  flex-direction: row;
  align-items: center;
  gap: 4px;
}

.prompt-bar-variables .checkbox-label {
  flex-direction: row;
  align-items: center;
  gap: 6px;
}

.prompt-bar-variables .btn {
  align-self: flex-end;
  padding: 6px 14px;
  border: none;
  border-radius: 6px;
  background: #2563eb;
  color: white;
  cursor: pointer;
  font-size: 13px;
}

.prompt-bar-variables .btn:hover {
  background: #1d4ed8;
}

.prompt-bar-variables .btn:disabled {
  background: #93c5fd;
  cursor: not-allowed;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/sidepanel/App.css
git commit -m "feat: add PromptBar styles"
```

---

### Task 5: Add Model Loading to Options Page

**Files:**
- Modify: `src/options/ProvidersTab.jsx`

**Interfaces:**
- Consumes: `fetchModels()` from `@/api/client.js`
- Produces: Model dropdown with fallback to text input

- [ ] **Step 1: Add state for model loading**

Add after existing state declarations (after line 16):
```jsx
const [modelList, setModelList] = useState(null)
const [modelLoading, setModelLoading] = useState(false)
const [modelError, setModelError] = useState(null)
```

- [ ] **Step 2: Add handleLoadModels function**

Add after `handleTestConnection` function (after line 94):
```jsx
async function handleLoadModels() {
  if (!form.baseUrl) return
  setModelLoading(true)
  setModelError(null)
  try {
    const { fetchModels } = await import('@/api/client.js')
    const models = await fetchModels({ baseUrl: form.baseUrl, apiKey: form.apiKey })
    setModelList(models.map(m => m.id || m))
  } catch (err) {
    setModelError(`Error: ${err.message}`)
    setModelList(null)
  } finally {
    setModelLoading(false)
  }
}
```

- [ ] **Step 3: Update Model input field to support dropdown**

Replace the Model `<label>` block (lines 132-139) with:
```jsx
<label>
  Model
  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
    {modelList ? (
      <select
        value={form.model}
        onChange={e => {
          if (e.target.value === '__manual__') {
            setModelList(null)
          } else {
            setForm({ ...form, model: e.target.value })
          }
        }}
        style={{ flex: 1 }}
      >
        <option value="__manual__">— enter manually —</option>
        {modelList.map(m => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
    ) : (
      <input
        value={form.model}
        onChange={e => setForm({ ...form, model: e.target.value })}
        placeholder="llama3.2"
        style={{ flex: 1 }}
      />
    )}
    <button
      className="btn btn-secondary"
      onClick={handleLoadModels}
      disabled={modelLoading || !form.baseUrl}
      style={{ whiteSpace: 'nowrap' }}
    >
      {modelLoading ? 'Loading...' : 'Load Models'}
    </button>
  </div>
  {modelError && <span style={{ fontSize: 13, color: '#dc2626' }}>{modelError}</span>}
</label>
```

- [ ] **Step 4: Reset model state when editing changes**

Add to `startAdd` function (after line 29):
```jsx
setModelList(null)
setModelError(null)
```

Add to `startEdit` function (after line 36):
```jsx
setModelList(null)
setModelError(null)
```

Add to `cancelEdit` function (after line 42):
```jsx
setModelList(null)
setModelError(null)
```

- [ ] **Step 5: Commit**

```bash
git add src/options/ProvidersTab.jsx
git commit -m "feat: add model loading with dropdown to options page"
```

---

### Task 6: Verify Build

- [ ] **Step 1: Run build**

```bash
npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 2: Commit any fixes if needed**

```bash
git add -A
git commit -m "fix: resolve build issues"
```
