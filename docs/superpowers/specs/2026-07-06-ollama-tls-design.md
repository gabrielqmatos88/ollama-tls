# ollama-tls — Design Spec

## Overview

Chrome extension (Manifest V3) that helps users transform text using OpenAI-compatible APIs. Users can translate, correct grammar, change tone, and rewrite text via a context menu popup or a persistent chat side panel.

**Tech stack:** React 19, Vite 8, CRXJS v2 (existing scaffold)

## Goals

- Support any OpenAI-compatible API (OpenAI, Ollama `/v1`, LM Studio, etc.) via custom URL + API key
- Manage multiple providers and switch between them
- Manage prompt templates with typed variable placeholders (text, number, select, radio, checkbox, textarea)
- Select text on any HTTP(S) page → floating popup with prompts → sends to side panel
- Side panel acts as a chat: shows AI response, user can iterate with follow-up requests
- Conversation history persists across side panel closes
- Options page for managing providers, prompts, and settings

## Architecture

### File Structure

```
src/
  api/
    client.js          # OpenAI-compatible API client (fetch-based, streaming)
  storage/
    providers.js       # CRUD for provider configs
    prompts.js         # CRUD for prompt templates
    settings.js        # Native language, preferences
  utils/
    templateParser.js  # Parse {name:type} syntax, generate input widgets, replace variables
  background/
    main.js            # Service worker: context menu, message routing
  content/
    main.jsx           # Entry: selection listener + popup injection
    PromptPopup.jsx    # Floating popup near text selection
    popup.css
  sidepanel/
    App.jsx            # Chat interface, conversation state, persistence
    ChatMessage.jsx    # Single message component
    ChatInput.jsx      # Input bar
    App.css
  options/
    index.html
    main.jsx
    App.jsx            # Tabs: Providers | Prompts | Settings
    ProvidersTab.jsx
    PromptsTab.jsx
    SettingsTab.jsx
    App.css
```

### Layers

| Layer                | Responsibility                                                                   |
| -------------------- | -------------------------------------------------------------------------------- |
| `api/client.js`      | Single function to call any OpenAI-compatible endpoint with streaming            |
| `storage/*`          | Thin wrappers around `chrome.storage.sync` for providers, prompts, settings      |
| `utils/templateParser.js` | Parse `{name:type}` syntax, extract variables, replace placeholders with values |
| `background/main.js` | Context menu registration, message routing between content script and side panel |
| Content script       | Text selection detection, floating prompt popup with typed variable inputs       |
| Side panel           | Chat UI, conversation management, persistence                                    |
| Options page         | Configuration management for providers, prompts, settings                        |

## Data Models

### Provider

```js
{
  id: "uuid",
  name: "Ollama Local",
  baseUrl: "http://localhost:11434/v1",
  apiKey: "",           // empty for local providers
  model: "llama3.2",
  isDefault: true       // one provider marked as default
}
```

Stored in `chrome.storage.sync` as an array under key `providers`.

### Prompt Template

```js
{
  id: "uuid",
  name: "Translate to English",
  template: "Translate the following text to English:\n\n{text}",
  variables: [
    { name: "text", type: "text" }
  ],
  showInContextMenu: true
}
```

The `{text}` placeholder is special — it is always replaced automatically with the user's selected text. Other placeholders require user input in the popup before sending. If a prompt has no `{text}` placeholder, the selected text is appended at the end of the template.

Variables are parsed from the template's `{placeholder}` syntax. The type annotation after `:` determines the input widget rendered in the popup.

### Variable Type Syntax

Variables use `{name:type}` syntax in templates. The type determines the UI input rendered.

| Syntax | Type | UI Widget | Example |
|--------|------|-----------|---------|
| `{name}` | text (default) | Text input | `{language}` → text input labeled "language" |
| `{name:number}` | number | Number input | `{age:number}` → number input |
| `{name:textarea}` | textarea | Multi-line textarea | `{description:textarea}` → textarea |
| `{name:boolean}` | boolean | Checkbox | `{skip:boolean}` → checkbox |
| `{name:a;b;c}` | select | Dropdown select | `{gender:male;female}` → select with two options |
| `{name:a\|b\|c}` | radio | Radio buttons | `{gender:male\|female}` → two radio buttons |

**Parsing rules:**
- `{text}` is always type `text` and auto-filled with selected text
- Type is everything after the first `:` inside the braces
- Semicolons (`;`) separate select options
- Pipes (`|`) separate radio options
- `boolean` renders a checkbox, value is `true`/`false`
- `textarea` renders a multi-line input
- `number` renders a numeric input with validation

**Examples in templates:**
- `"Translate to {language}:\n\n{text}"` — `{language}` renders as text input
- `"Summarize in {style:bullet points;paragraph;one sentence}:\n\n{text}"` — `{style}` renders as select dropdown
- `"Rewrite in formal tone{include_examples:boolean}:\n\n{text}"` — `{include_examples}` renders as checkbox

Stored in `chrome.storage.sync` as an array under key `prompts`.

### Default Prompts (pre-loaded on first install)

| Name | Template |
|------|----------|
| Translate to English | `Translate to English:\n\n{text}` |
| Translate to Native | `Translate to {language}:\n\n{text}` |
| Correct Grammar | `Correct the grammar and fix typos:\n\n{text}` |
| Professional Tone | `Rewrite in a professional tone:\n\n{text}` |
| Simplify | `Rewrite this in simpler English:\n\n{text}` |

The `{language}` variable in "Translate to Native" defaults to the user's native language from settings (if set), but can be overridden in the popup.

### Settings

```js
{
  nativeLanguage: "pt-BR",  // or null to auto-detect from browser
  defaultProviderId: "uuid"
}
```

Stored in `chrome.storage.sync` under key `settings`.

### Conversation (persisted)

```js
{
  id: "uuid",
  messages: [
    { role: "user", content: "..." },
    { role: "assistant", content: "..." }
  ],
  createdAt: timestamp,
  updatedAt: timestamp
}
```

Stored in `chrome.storage.local` (higher capacity) under key `conversations`.

## Components

### Content Script & Prompt Popup

**Flow:**

1. User selects text on any HTTPS page
2. Content script detects selection via `mouseup` event
3. Floating popup appears near the cursor showing available prompts (filtered by `showInContextMenu: true`)
4. User clicks a prompt
5. If the prompt has variables beyond `{text}`, inline inputs appear in the popup — each rendered according to its type (text input, number input, select dropdown, radio buttons, checkbox, textarea)
6. On confirm, content script sends `{promptId, selectedText, variables}` to background service worker (where `variables` is an object like `{ language: "pt-BR", style: "bullet points" }`)
7. Background opens the side panel and passes the data to it
8. Popup disappears

**Popup behavior:**

- Positioned near the selection using `getBoundingClientRect()` from the selection range
- Dismissed on click outside or Escape key
- Prompt names shown as a simple styled list
- Injected into the page's DOM for simplicity

**Context menu (parallel option):**

- Chrome context menu also registered: right-click → "ollama-tls" → list of prompts
- Same flow as the custom popup — both coexist, user chooses which to use
- Custom popup works on `mouseup`, context menu works on right-click

### Side Panel — Chat Interface

**Initial state:** Shows conversation history from previous sessions (if any). Text input at the bottom.

**When receiving a prompt from content script:**

1. Appends the prompt as a user message to the conversation
2. Immediately sends to the API and streams the response
3. AI response appears as an assistant message in real-time
4. User can copy the result with a button on each message

**Continuing the conversation:**

- User can type follow-up requests ("make it more formal", "shorter", "change to Spanish")
- Each message is sent with the full conversation history for context
- Streaming responses for real-time feedback
- "Stop generating" button to abort mid-stream

**Persistence:**

- Conversations stored in `chrome.storage.local`
- Each conversation keyed by unique ID
- Side panel loads the most recent conversation on open
- "New conversation" button to start fresh
- Auto-saves on each new message

**Components:**

- `App.jsx` — Manages conversation state, message list, API calls, persistence
- `ChatMessage.jsx` — Renders a single message (user or assistant) with copy button
- `ChatInput.jsx` — Text input + send button, Enter to send

### Options Page

Three tabs in a minimal UI:

**Tab 1: Providers**

- List of configured providers showing name, base URL, model
- "Add Provider" button opens inline form (name, base URL, API key, model)
- Edit/delete existing providers
- One provider marked as default (radio button)
- "Test Connection" button to verify the endpoint works

**Tab 2: Prompts**

- List of prompt templates showing name and template preview
- "Add Prompt" button opens inline form (name, template text)
- Template input supports `{text}` (auto-included) and typed variables using `{name:type}` syntax
- Variables auto-parsed from `{placeholder}` syntax as user types
- Variable type preview shown below template input — lists detected variables with their inferred input widgets
- Edit/delete existing prompts
- Toggle `showInContextMenu` per prompt
- Default prompts pre-loaded on first install

**Tab 3: Settings**

- Native language input (text field, browser language shown as placeholder)
- Current default provider displayed
- "Clear all conversation history" button

### Background Service Worker

Responsibilities:

- Registers context menus on install (one entry per prompt with `showInContextMenu: true`)
- Listens for context menu clicks → sends `{promptId, selectedText}` to side panel
- Listens for messages from content script (custom popup) → opens side panel with data
- Uses `chrome.sidePanel.open()` to bring up the side panel
- Routes messages between content script and side panel

### API Client

Single async function with streaming support:

```js
async function callProvider({ baseUrl, apiKey, model, messages, signal })
```

- Constructs OpenAI-compatible request: `POST {baseUrl}/chat/completions`
- Headers: `Authorization: Bearer {apiKey}`, `Content-Type: application/json`
- Body: `{ model, messages, stream: true }`
- Supports streaming via `ReadableStream` — parses SSE chunks and yields content deltas
- Accepts an `AbortSignal` for cancellation
- Works identically for OpenAI, Ollama `/v1`, LM Studio, or any compatible endpoint

## Manifest Changes

Add to `manifest.config.js`:

- `permissions`: add `"contextMenus"`, `"storage"`
- `options_page`: `"src/options/index.html"`
- `host_permissions`: `["<all_urls>"]` (needed for API calls to any endpoint)

## Error Handling

- API errors shown inline in the chat as error messages
- Invalid provider config caught on "Test Connection" with clear error messages
- Empty API key allowed for local providers (Ollama)
- Network errors shown with retry option
- Streaming abort handled cleanly (partial message kept)

## Testing Strategy

Manual testing (no automated tests configured in project):

- Add provider, test connection, set as default
- Create/edit/delete prompts
- Select text → popup appears → pick prompt → side panel receives it
- Chat with AI, verify streaming, copy result
- Close and reopen side panel — history persists
- Context menu fallback works
- Options page tabs all functional

## Out of Scope

- Conversation export/import
- Multiple conversation threads (single active conversation for now)
- Keyboard shortcuts
- Dark mode (follow system preference via CSS `prefers-color-scheme`)
- Offline mode / queuing requests
