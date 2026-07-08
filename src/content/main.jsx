import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import PromptPopup from './PromptPopup.jsx'
import { selectionToMarkdown } from '@/utils/domToMarkdown'
import './popup.css'

let popupContainer = null
let popupRoot = null

function showPopup(selectedText, markdownText, rect) {
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
        markdownText={markdownText}
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
  // Send message to background to open side panel and forward
  chrome.runtime.sendMessage({
    type: 'OPEN_SIDEBAR_WITH_PROMPT',
    promptId,
    selectedText,
    variables,
  })

  hidePopup()
}

document.addEventListener('mouseup', (e) => {
  if (e.target.closest('#crjsx-prompt-popup-root')) return

  const selection = window.getSelection()
  const selectedText = selection.toString().trim()

  if (!selectedText) return

  const range = selection.getRangeAt(0)
  const rect = range.getBoundingClientRect()
  const markdownText = selectionToMarkdown()

  showPopup(selectedText, markdownText, rect)
})
