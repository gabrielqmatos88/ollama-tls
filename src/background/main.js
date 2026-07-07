import { getPrompts, initializePrompts } from '@/storage/prompts'
import { getSettings } from '@/storage/settings'
import { parseVariables } from '@/utils/templateParser'

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

async function openSidePanelWithPrompt(tabId, promptId, selectedText, variables) {
  // Store the pending message first
  await chrome.storage.local.set({
    pendingPrompt: { promptId, selectedText, variables }
  })

  // Open the side panel
  try {
    await chrome.sidePanel.open({ tabId })
    await chrome.sidePanel.setOptions({ tabId, enabled: true })
  } catch (err) {
    console.error('Failed to open side panel:', err)
  }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!info.menuItemId.startsWith('prompt:')) return

  const promptId = info.menuItemId.replace('prompt:', '')
  const selectedText = info.selectionText
  const variables = await getVariablesForPrompt(promptId)

  await openSidePanelWithPrompt(tab.id, promptId, selectedText, variables)
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'OPEN_SIDEBAR_WITH_PROMPT') {
    const { promptId, selectedText, variables } = message
    openSidePanelWithPrompt(sender.tab.id, promptId, selectedText, variables)
    sendResponse({ ok: true })
  }
  return true
})
