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

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!info.menuItemId.startsWith('prompt:')) return

  const promptId = info.menuItemId.replace('prompt:', '')
  const selectedText = info.selectionText

  // Pre-fill variables from settings
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

  try {
    await chrome.sidePanel.open({ tabId: tab.id })
    await chrome.sidePanel.setOptions({
      tabId: tab.id,
      enabled: true,
    })
  } catch (err) {
    console.error('Failed to open side panel:', err)
    return
  }

  setTimeout(() => {
    chrome.runtime.sendMessage({
      type: 'PROMPT_SELECTED',
      promptId,
      selectedText,
      variables,
    }).catch(() => {})
  }, 300)
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'OPEN_SIDEBAR_WITH_PROMPT') {
    const { promptId, selectedText, variables } = message

    try {
      chrome.sidePanel.open({ tabId: sender.tab.id })
      chrome.sidePanel.setOptions({
        tabId: sender.tab.id,
        enabled: true,
      })
    } catch (err) {
      console.error('Failed to open side panel:', err)
      sendResponse({ ok: false, error: err.message })
      return true
    }

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
  return true
})
