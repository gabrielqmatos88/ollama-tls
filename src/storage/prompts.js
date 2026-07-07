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
