/**
 * MessageBus - Reliable communication between extension components
 * Uses chrome.storage.local as the message queue for reliability
 */

const PENDING_KEY = 'messageBus_pending'
const LISTENERS = new Set()

// Initialize listener for storage changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[PENDING_KEY]?.newValue) {
    const messages = changes[PENDING_KEY].newValue
    for (const listener of LISTENERS) {
      for (const msg of messages) {
        try { listener(msg) } catch (e) { console.error('MessageBus listener error:', e) }
      }
    }
    // Clear after delivering
    chrome.storage.local.remove(PENDING_KEY)
  }
})

/**
 * Send a message through the bus
 * @param {string} type - Message type
 * @param {object} data - Message data
 * @param {object} options - { openSidePanel: boolean, windowId: number }
 */
export async function sendMessage(type, data = {}, options = {}) {
  const message = { type, data, timestamp: Date.now() }

  // Store the message
  await chrome.storage.local.set({ [PENDING_KEY]: [message] })

  // Open side panel if requested
  if (options.openSidePanel && options.windowId) {
    try {
      await chrome.sidePanel.open({ windowId: options.windowId })
      await chrome.sidePanel.setOptions({ 
        tabId: options.windowId, 
        enabled: true 
      })
    } catch (err) {
      console.error('MessageBus: Failed to open side panel:', err)
    }
  }
}

/**
 * Listen for messages
 * @param {function} callback - Called with (message) for each incoming message
 * @returns {function} unsubscribe function
 */
export function onMessage(callback) {
  LISTENERS.add(callback)

  // Also check for any pending messages on subscribe
  checkPending()

  return () => LISTENERS.delete(callback)
}

/**
 * Check for pending messages (call on component mount)
 */
export async function checkPending() {
  const result = await chrome.storage.local.get(PENDING_KEY)
  if (result[PENDING_KEY]?.length) {
    const messages = result[PENDING_KEY]
    for (const listener of LISTENERS) {
      for (const msg of messages) {
        try { listener(msg) } catch (e) { console.error('MessageBus listener error:', e) }
      }
    }
    await chrome.storage.local.remove(PENDING_KEY)
  }
}

// Auto-check pending on storage focus (when side panel becomes visible)
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkPending()
    }
  })
}
