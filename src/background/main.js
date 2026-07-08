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

  // Parent menu for selected text
  chrome.contextMenus.create({
    id: 'ollama-scribe',
    title: 'Ollama Scribe',
    contexts: ['selection'],
  })

  // Parent menu for textareas/input fields
  chrome.contextMenus.create({
    id: 'ollama-scribe-editable',
    title: 'Ollama Scribe - Help compose',
    contexts: ['editable'],
  })

  // Add prompts to both menus
  for (const prompt of contextPrompts) {
    // For selected text
    chrome.contextMenus.create({
      id: `prompt:${prompt.id}`,
      parentId: 'ollama-scribe',
      title: prompt.name,
      contexts: ['selection'],
    })

    // For textareas
    chrome.contextMenus.create({
      id: `compose:${prompt.id}`,
      parentId: 'ollama-scribe-editable',
      title: prompt.name,
      contexts: ['editable'],
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
  await chrome.storage.local.set({
    messageBus_pending: [{ type: 'PROMPT_SELECTED', data, timestamp: Date.now() }]
  })
}

async function sendToContentScript(tabId, data) {
  await chrome.storage.local.set({
    textareaCompose: data
  })
  
  // Also try direct message
  chrome.tabs.sendMessage(tabId, {
    type: 'TEXTAREA_COMPOSE',
    ...data
  }).catch(() => {})
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const { menuItemId } = info

  // Handle selected text prompts (original behavior)
  if (menuItemId.startsWith('prompt:')) {
    const promptId = menuItemId.replace('prompt:', '')
    const selectedText = info.selectionText
    const windowId = tab.windowId

    // Open side panel FIRST while user gesture is still active
    try {
      await chrome.sidePanel.open({ windowId })
    } catch (err) {
      console.error('Failed to open side panel:', err)
    }

    // Now do async work to get variables and send message
    const variables = await getVariablesForPrompt(promptId)
    await sendToSidePanel({ promptId, selectedText, variables })
    return
  }

  // Handle textarea compose prompts
  if (menuItemId.startsWith('compose:')) {
    const promptId = menuItemId.replace('compose:', '')
    const variables = await getVariablesForPrompt(promptId)

    // Send to content script to handle textarea interaction
    await sendToContentScript(tab.id, {
      promptId,
      variables,
    })
    return
  }
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'OPEN_SIDEBAR_WITH_PROMPT') {
    const { promptId, selectedText, variables } = message
    const windowId = sender.tab?.windowId

    if (windowId) {
      // Open side panel FIRST while user gesture is still active
      chrome.sidePanel.open({ windowId }).then(() => {
        sendToSidePanel({ promptId, selectedText, variables })
      }).catch(err => {
        console.error('Failed to open side panel:', err)
        // Still send the message even if panel failed to open
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
