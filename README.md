# Ollama Scribe

Chrome extension for text translation, grammar correction, and AI-powered writing assistance using Ollama (or any OpenAI-compatible API).

Select text on any webpage, pick a prompt from the context menu, and get instant AI-powered results in a side panel chat.

## Features

- **Text Selection Popup** — select text, choose a prompt, get AI response in the side panel
- **Context Menu Prompts** — right-click selected text or editable fields for quick actions
- **Textarea Compose** — right-click an input field to rewrite, translate, or correct its content
- **Streaming Responses** — real-time AI output in the side panel
- **Conversation Persistence** — chat history saved in local storage
- **Custom Prompts** — create, edit, and reorder prompts with template variables
- **Multiple Providers** — configure any OpenAI-compatible endpoint (Ollama, OpenAI, etc.)

### Built-in Prompts

| Prompt | Description |
|---|---|
| Translate to English | Translates any language to English |
| Translate to Native | Translates to your configured native language |
| Correct Grammar | Fixes grammar and typos |
| Professional Tone | Rewrites in a professional tone |
| Simplify | Rewrites in simpler English |

## Setup

### Prerequisites

- Google Chrome (or Chromium-based browser)
- An Ollama instance running locally, or any OpenAI-compatible API endpoint

### Install from Source

```bash
git clone https://github.com/gabrielqmatos88/ollama-tls.git
cd ollama-tls
npm install
npm run dev
```

1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the `dist/` directory

### Configure Provider

1. Click the extension icon → **Options** (or right-click → Options)
2. Go to **Providers** tab
3. Add a provider with your endpoint details:
   - **Base URL**: `http://localhost:11434/v1` (for Ollama)
   - **Model**: `llama3`, `gemma`, etc.
   - **API Key**: leave empty for local Ollama
4. Set as default

## Usage

### Text Selection

1. Select text on any webpage
2. A popup appears with your available prompts
3. Click a prompt → the side panel opens with the AI response

### Context Menu

- **Right-click selected text** → "Ollama Scribe" → choose a prompt
- **Right-click an input field** → "Ollama Scribe - Help compose" → AI rewrites the field content

### Custom Prompts

Go to **Options → Prompts** to create your own. Use template variables:

- `{text}` — replaced with the selected text
- `{language}` — auto-filled from your native language setting
- `{tone;a;b;c}` — dropdown select
- `{count:number}` — number input

## Development

```bash
npm run dev      # Start dev server with HMR
npm run build    # Build to dist/
npm run preview  # Preview production build
```

## Tech Stack

- React 19 + Vite 8
- CRXJS V2 (Chrome extension bundler)
- Chrome Extension Manifest V3
- OpenAI-compatible streaming API

## License

MIT
