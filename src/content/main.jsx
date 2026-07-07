import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import PromptPopup from './PromptPopup.jsx'
import { sendMessage } from '@/utils/messageBus'
import './popup.css'

let popupContainer = null
let popupRoot = null

function showPopup(selectedText, rect) {
  hidePopup()

  popupContainer = document.createElement('div')
  popupContainer.id = 'crjsx-prompt-popup-root'
  popupContainer.style.position = 'absolute'
  popupContainer.style.zIndex = '2147483647'
  document.body.appendChild(popupContainer)

  const scrollX = window.scrollX
  const scrollY = window.scrollY
  const top = scrollY + rect.bottom + 8
  const left = scrollX + rect.left

  popupRoot = createRoot(popupContainer)
  popupRoot.render(
    <StrictMode>
      <PromptPopup
        selectedText={selectedText}
        position={{ top, left }}
        onSend={handleSend}
        onClose={hidePopup}
      />
    </StrictMode>,
  )
}

function hidePopup() {
  if (popupRoot) {
    popupRoot.unmount()
    popupRoot = null
  }
  if (popupContainer) {
    popupContainer.remove()
    popupContainer = null
  }
}

async function handleSend(promptId, selectedText, variables) {
  // Get the current tab ID
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  
  await sendMessage('PROMPT_FROM_CONTENT', {
    promptId,
    selectedText,
    variables,
  }, { openSidePanel: true, tabId: tab.id })

  hidePopup()
}

document.addEventListener('mouseup', (e) => {
  if (e.target.closest('#crjsx-prompt-popup-root')) return

  const selection = window.getSelection()
  const selectedText = selection.toString().trim()

  if (!selectedText) return

  const range = selection.getRangeAt(0)
  const rect = range.getBoundingClientRect()

  showPopup(selectedText, rect)
})
