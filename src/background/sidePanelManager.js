/**
 * SidePanelManager - Tracks and manages side panel lifecycle
 * Stores the side panel tab ID and syncs on open/close events
 */

const STORAGE_KEY = "sidePanelState";

class SidePanelManager {
  constructor() {
    this.tabId = null;
    this.windowId = null;
    this.init();
  }

  async init() {
    // Load persisted state
    const result = await chrome.storage.local.get(STORAGE_KEY);
    if (result[STORAGE_KEY]) {
      this.tabId = result[STORAGE_KEY].tabId;
      this.windowId = result[STORAGE_KEY].windowId;
    }

    // Listen for tab close events
    chrome.tabs.onRemoved.addListener((tabId) => {
      if (tabId === this.tabId) {
        this.clear();
      }
    });

    // Listen for tab updates (e.g., navigation away from side panel)
    chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
      if (tabId === this.tabId && changeInfo.status === "loading") {
        this.clear();
      }
    });

    // Validate stored tab still exists
    if (this.tabId) {
      try {
        await chrome.tabs.get(this.tabId);
      } catch {
        this.clear();
      }
    }
  }

  async save() {
    await chrome.storage.local.set({
      [STORAGE_KEY]: { tabId: this.tabId, windowId: this.windowId },
    });
  }

  async clear() {
    this.tabId = null;
    this.windowId = null;
    await chrome.storage.local.remove(STORAGE_KEY);
  }

  /**
   * Get or open the side panel
   * @param {number} windowId - The window to open the side panel in
   * @returns {number} The side panel tab ID
   */
  async getOrOpen(windowId) {
    // If we have a stored tab ID, verify it still exists
    if (this.tabId) {
      try {
        const tab = await chrome.tabs.get(this.tabId);
        if (tab) {
          this.windowId = tab.windowId;
          return this.tabId;
        }
      } catch {
        // Tab no longer exists
        await this.clear();
      }
    }

    // Open a new side panel
    try {
      await chrome.sidePanel.open({ windowId });

      // The side panel doesn't give us a tab ID directly,
      // so we need to find it by querying tabs
      const tabs = await chrome.tabs.query({ windowId });

      // Side panel tabs are typically the last ones and have a specific URL pattern
      for (const tab of tabs.reverse()) {
        if (
          tab.url?.includes("sidepanel/index.html") ||
          tab.url?.includes("sidepanel")
        ) {
          this.tabId = tab.id;
          this.windowId = windowId;
          await this.save();
          return tab.id;
        }
      }

      // If we couldn't find it by URL, just use the side panel API
      // The message will be delivered via storage anyway
      return null;
    } catch (err) {
      console.error("SidePanelManager: Failed to open side panel:", err);
      return null;
    }
  }

  /**
   * Check if side panel is currently open
   */
  async isOpen() {
    if (!this.tabId) return false;

    try {
      const tab = await chrome.tabs.get(this.tabId);
      return !!tab;
    } catch {
      await this.clear();
      return false;
    }
  }
}

// Export singleton instance
export const sidePanelManager = new SidePanelManager();
