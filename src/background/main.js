import { getPrompts, initializePrompts } from '@/storage/prompts'

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

  const prompts = await getPrompts()
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

  await chrome.sidePanel.open({ tabId: tab.id })
  await chrome.sidePanel.setOptions({
    tabId: tab.id,
    enabled: true,
  })

  setTimeout(() => {
    chrome.runtime.sendMessage({
      type: 'PROMPT_SELECTED',
      promptId,
      selectedText,
      variables: {},
    }).catch(() => {})
  }, 300)
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'OPEN_SIDEBAR_WITH_PROMPT') {
    const { promptId, selectedText, variables } = message

    chrome.sidePanel.open({ tabId: sender.tab.id })
    chrome.sidePanel.setOptions({
      tabId: sender.tab.id,
      enabled: true,
    })

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
