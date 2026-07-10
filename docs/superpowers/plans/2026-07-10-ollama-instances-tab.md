# Ollama Instances Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move keepAlive from global settings to per-provider config, and add an Ollama instances management tab.

**Architecture:** Remove keepAlive from settings storage, add it to provider objects, update consumers. Add new OllamaInstancesTab that calls Ollama's native API to list/unload loaded models.

**Tech Stack:** React 19, Vite 8, Chrome Extension APIs

## Global Constraints

- No TypeScript — plain JSX
- Follow existing code style (inline styles, no CSS modules)
- Use `@/` path alias for imports
- No lint/typecheck commands available

---

### Task 1: Remove keepAlive from Settings

**Files:**
- Modify: `src/storage/settings.js:5-9`
- Modify: `src/options/SettingsTab.jsx:14,20,50-60`

**Interfaces:**
- Produces: `getSettings()` no longer returns `keepAlive`

- [ ] **Step 1: Update settings storage defaults**

In `src/storage/settings.js`, remove `keepAlive` from the default object:

```js
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

- [ ] **Step 2: Remove keepAlive from SettingsTab**

In `src/options/SettingsTab.jsx`, remove keepAlive state and UI:

```jsx
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
    await updateSettings({
      nativeLanguage: settings.nativeLanguage || null,
    })
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

- [ ] **Step 3: Verify SettingsTab renders correctly**

Run: `npm run dev` and open options page
Expected: Settings tab shows Native Language and Clear History only, no keepAlive field

- [ ] **Step 4: Commit**

```bash
git add src/storage/settings.js src/options/SettingsTab.jsx
git commit -m "feat: remove keepAlive from global settings"
```

---

### Task 2: Add keepAlive to Provider Config

**Files:**
- Modify: `src/options/ProvidersTab.jsx:4-10,131-205`

**Interfaces:**
- Produces: Provider objects now include `keepAlive` field (default `'-1'`)

- [ ] **Step 1: Update EMPTY_PROVIDER and form handling**

In `src/options/ProvidersTab.jsx`, add keepAlive to the empty provider template and add input field in the edit form:

```jsx
const EMPTY_PROVIDER = {
  name: '',
  baseUrl: '',
  apiKey: '',
  model: '',
  keepAlive: '-1',
  isDefault: false,
}
```

Add this input field after the Model field (after line 195, before the isDefault checkbox):

```jsx
<label>
  Keep Alive
  <input
    value={form.keepAlive || '-1'}
    onChange={e => setForm({ ...form, keepAlive: e.target.value })}
    placeholder="-1"
  />
  <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
    How long to keep model loaded. "-1" (permanent), "0" (unload immediately), duration ("10m", "24h").
  </div>
</label>
```

- [ ] **Step 2: Verify provider edit form shows keepAlive**

Run: `npm run dev` and open options page
Expected: Edit any provider → "Keep Alive" field appears with default "-1"

- [ ] **Step 3: Commit**

```bash
git add src/options/ProvidersTab.jsx
git commit -m "feat: add keepAlive field to provider config"
```

---

### Task 3: Update Side Panel and Textarea Compose to Use Provider keepAlive

**Files:**
- Modify: `src/sidepanel/App.jsx:115`
- Modify: `src/content/textareaCompose.jsx:133`

**Interfaces:**
- Consumes: `provider.keepAlive` from provider object
- Produces: `callProvider()` receives keepAlive from provider instead of settings

- [ ] **Step 1: Update sidepanel to use provider.keepAlive**

In `src/sidepanel/App.jsx`, change line 115 from:
```js
keepAlive: settings?.keepAlive,
```
to:
```js
keepAlive: provider?.keepAlive,
```

- [ ] **Step 2: Update textareaCompose to use provider.keepAlive**

In `src/content/textareaCompose.jsx`, change line 133 from:
```js
keepAlive: settings?.keepAlive,
```
to:
```js
keepAlive: provider?.keepAlive,
```

- [ ] **Step 3: Verify side panel chat works**

Run: `npm run dev`, load extension, open side panel
Expected: Chat works, keepAlive value comes from provider config

- [ ] **Step 4: Commit**

```bash
git add src/sidepanel/App.jsx src/content/textareaCompose.jsx
git commit -m "feat: use provider.keepAlive instead of settings.keepAlive"
```

---

### Task 4: Create OllamaInstancesTab Component

**Files:**
- Create: `src/options/OllamaInstancesTab.jsx`

**Interfaces:**
- Consumes: `getDefaultProvider()` from `@/storage/providers`
- Produces: Tab component that lists/unloads Ollama models

- [ ] **Step 1: Create OllamaInstancesTab component**

Create `src/options/OllamaInstancesTab.jsx`:

```jsx
import { useState, useEffect } from 'react'
import { getDefaultProvider } from '@/storage/providers'

function getOllamaBaseUrl(provider) {
  if (!provider?.baseUrl) return null
  const url = provider.baseUrl.replace(/\/+$/, '')
  // Strip /v1 suffix to get native Ollama API base
  return url.replace(/\/v1$/, '')
}

export default function OllamaInstancesTab() {
  const [models, setModels] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [unloading, setUnloading] = useState(null)
  const [baseUrl, setBaseUrl] = useState(null)

  useEffect(() => {
    loadModels()
  }, [])

  async function loadModels() {
    setLoading(true)
    setError(null)
    try {
      const provider = await getDefaultProvider()
      const ollamaUrl = getOllamaBaseUrl(provider)
      if (!ollamaUrl) {
        setError('No default provider configured')
        setLoading(false)
        return
      }
      setBaseUrl(ollamaUrl)

      const response = await fetch(`${ollamaUrl}/api/ps`)
      if (!response.ok) {
        throw new Error(`Ollama returned ${response.status}`)
      }
      const data = await response.json()
      setModels(data.models || [])
    } catch (err) {
      setError(`Cannot connect to Ollama: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  async function handleUnload(modelName) {
    setUnloading(modelName)
    try {
      const response = await fetch(`${baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelName, keep_alive: 0 }),
      })
      if (!response.ok) {
        throw new Error(`Failed to unload: ${response.status}`)
      }
      await loadModels()
    } catch (err) {
      alert(`Error unloading model: ${err.message}`)
    } finally {
      setUnloading(null)
    }
  }

  function formatSize(bytes) {
    if (!bytes) return 'Unknown'
    const gb = bytes / (1024 * 1024 * 1024)
    if (gb >= 1) return `${gb.toFixed(1)} GB`
    const mb = bytes / (1024 * 1024)
    return `${mb.toFixed(0)} MB`
  }

  if (loading) {
    return (
      <div>
        <h2 style={{ marginBottom: 16 }}>Ollama Instances</h2>
        <p style={{ color: '#666' }}>Loading...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div>
        <h2 style={{ marginBottom: 16 }}>Ollama Instances</h2>
        <p style={{ color: '#dc2626' }}>{error}</p>
        <button className="btn btn-secondary" onClick={loadModels} style={{ marginTop: 8 }}>
          Retry
        </button>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2>Ollama Instances</h2>
        <button className="btn btn-secondary" onClick={loadModels}>Refresh</button>
      </div>

      {models.length === 0 ? (
        <p style={{ color: '#666', textAlign: 'center', padding: 24 }}>
          No models currently loaded in Ollama.
        </p>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {models.map(model => (
            <div
              key={model.name}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: 12,
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                gap: 12,
              }}
            >
              <div style={{ flex: 1 }}>
                <strong>{model.name}</strong>
                <div style={{ fontSize: 13, color: '#666' }}>
                  Size: {formatSize(model.size)}
                  {model.details?.parameter_size && ` · ${model.details.parameter_size}`}
                </div>
              </div>
              <button
                className="btn btn-danger"
                onClick={() => handleUnload(model.name)}
                disabled={unloading === model.name}
              >
                {unloading === model.name ? 'Unloading...' : 'Unload'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify component renders**

Run: `npm run dev`
Expected: Component compiles without errors

- [ ] **Step 3: Commit**

```bash
git add src/options/OllamaInstancesTab.jsx
git commit -m "feat: add OllamaInstancesTab component"
```

---

### Task 5: Wire Ollama Tab into App.jsx

**Files:**
- Modify: `src/options/App.jsx`

**Interfaces:**
- Consumes: `getDefaultProvider()` from `@/storage/providers`
- Consumes: `OllamaInstancesTab` component
- Produces: Conditional "Ollama" tab in options page

- [ ] **Step 1: Update App.jsx with conditional Ollama tab**

Replace `src/options/App.jsx` contents:

```jsx
import { useState, useEffect } from 'react'
import ProvidersTab from './ProvidersTab.jsx'
import PromptsTab from './PromptsTab.jsx'
import SettingsTab from './SettingsTab.jsx'
import OllamaInstancesTab from './OllamaInstancesTab.jsx'
import { getDefaultProvider } from '@/storage/providers'

function isLocalhostProvider(provider) {
  if (!provider?.baseUrl) return false
  return provider.baseUrl.includes('localhost') || provider.baseUrl.includes('127.0.0.1')
}

export default function App() {
  const [activeTab, setActiveTab] = useState('providers')
  const [showOllamaTab, setShowOllamaTab] = useState(false)

  useEffect(() => {
    checkOllamaAvailability()
  }, [])

  async function checkOllamaAvailability() {
    const provider = await getDefaultProvider()
    setShowOllamaTab(isLocalhostProvider(provider))
  }

  const tabs = [
    { id: 'providers', label: 'Providers' },
    { id: 'prompts', label: 'Prompts' },
    { id: 'settings', label: 'Settings' },
    ...(showOllamaTab ? [{ id: 'ollama', label: 'Ollama' }] : []),
  ]

  return (
    <div className="options-container">
      <h1>Ollama Scribe</h1>
      <nav className="tabs">
        {tabs.map(tab => (
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
        {activeTab === 'ollama' && <OllamaInstancesTab />}
      </main>
    </div>
  )
}
```

- [ ] **Step 2: Verify Ollama tab appears/disappears**

Run: `npm run dev`
Expected: If default provider is localhost → "Ollama" tab visible. Otherwise → tab hidden.

- [ ] **Step 3: Verify full flow**

1. Set default provider to `http://localhost:11434/v1`
2. Reload options page
3. Click "Ollama" tab
4. If Ollama is running → shows loaded models
5. Click "Unload" on a model → model unloaded, list refreshes

- [ ] **Step 4: Commit**

```bash
git add src/options/App.jsx
git commit -m "feat: add conditional Ollama tab to options page"
```

---

### Task 6: Final Verification

- [ ] **Step 1: Build and verify no errors**

Run: `npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 2: Manual testing checklist**

1. Options → Settings: no keepAlive field visible
2. Options → Providers → Edit provider: keepAlive field visible with default "-1"
3. Options → Providers → Add new provider: keepAlive field visible
4. Set default provider to localhost → "Ollama" tab appears
5. Set default provider to non-localhost → "Ollama" tab hidden
6. Ollama tab: shows loaded models when Ollama is running
7. Ollama tab: shows error when Ollama not running
8. Ollama tab: "Unload" button works, list refreshes
9. Side panel chat: uses provider's keepAlive value
10. Textarea compose: uses provider's keepAlive value

- [ ] **Step 3: Final commit if needed**

```bash
git add -A
git commit -m "feat: ollama instances management tab"
```
