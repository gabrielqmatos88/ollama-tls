import { getPrompts, initializePrompts } from '@/storage/prompts'
import { getSettings } from '@/storage/settings'
import { parseVariables } from '@/utils/templateParser'
import { sendMessage } from '@/utils/messageBus'

chrome.runtime.onInstalled.addListener(async () => {
  await initializePrompts()
  await rebuildContextMenus()
})

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.prompts) {
    rebuildContextMenus()
  }
})

async function rebuildContextMenus() {
  await chrome.contextMenus.removeAll()

  const prompts = (await getPrompts()) || []
  const contextPrompts = prompts.filter(p => p.showInContextMenu)

  chrome.contextMenus.create({
    id: 'ollama-tls',
    title: 'ollama-tls',
    contexts: ['selection'],
  })

  for (const prompt of contextPrompts) {
    chrome.contextMenus.create({
      id: `prompt:${prompt.id}`,
      parentId: 'ollama-tls',
      title: prompt.name,
      contexts: ['selection'],
    })
  }
}

async function getVariablesForPrompt(promptId) {
  const prompts = (await getPrompts()) || []
  const prompt = prompts.find(p => p.id === promptId)
  const settings = await getSettings()
  const variables = {}

  if (prompt) {
    const templateVars = parseVariables(prompt.template)
    for (const v of templateVars) {
      if (v.name === 'language' && settings.nativeLanguage) {
        variables.language = settings.nativeLanguage
      }
    }
  }

  return variables
}

// Listen for messages from content script
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area === 'local' && changes.messageBus_pending?.newValue) {
    const messages = changes.messageBus_pending.newValue
    for (const msg of messages) {
      if (msg.type === 'PROMPT_FROM_CONTENT') {
        const { promptId, selectedText, variables } = msg.data
        // Re-broadcast as PROMPT_SELECTED for the side panel
        await sendMessage('PROMPT_SELECTED', { promptId, selectedText, variables })
      }
    }
  }
})

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!info.menuItemId.startsWith('prompt:')) return

  const promptId = info.menuItemId.replace('prompt:', '')
  const selectedText = info.selectionText
  const variables = await getVariablesForPrompt(promptId)

  await sendMessage('PROMPT_SELECTED', { promptId, selectedText, variables }, {
    openSidePanel: true,
    tabId: tab.id,
  })
})

// Handle messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'OPEN_SIDEBAR_WITH_PROMPT') {
    const { promptId, selectedText, variables } = message
    sendMessage('PROMPT_SELECTED', { promptId, selectedText, variables }, {
      openSidePanel: true,
      tabId: sender.tab.id,
    })
    sendResponse({ ok: true })
  }
  return true
})
