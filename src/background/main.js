import { getPrompts, initializePrompts } from '@/storage/prompts'
import { getSettings } from '@/storage/settings'
import { parseVariables } from '@/utils/templateParser'
import { sidePanelManager } from './sidePanelManager.js'

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

async function sendToSidePanel(data) {
  // Store the message
  await chrome.storage.local.set({
    messageBus_pending: [{ type: 'PROMPT_SELECTED', data, timestamp: Date.now() }]
  })
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!info.menuItemId.startsWith('prompt:')) return

  const promptId = info.menuItemId.replace('prompt:', '')
  const selectedText = info.selectionText
  const variables = await getVariablesForPrompt(promptId)

  // Get or open side panel
  const windowId = tab.windowId
  await sidePanelManager.getOrOpen(windowId)

  // Send the message
  await sendToSidePanel({ promptId, selectedText, variables })
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'OPEN_SIDEBAR_WITH_PROMPT') {
    const { promptId, selectedText, variables } = message
    const windowId = sender.tab?.windowId

    if (windowId) {
      sidePanelManager.getOrOpen(windowId).then(() => {
        sendToSidePanel({ promptId, selectedText, variables })
      })
    }

    sendResponse({ ok: true })
  }
  return true
})

// Sync side panel state on window focus changes
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return
  await sidePanelManager.isOpen()
})
