const STORAGE_KEY = 'settings'

export async function getSettings() {
  const result = await chrome.storage.sync.get(STORAGE_KEY)
  return result[STORAGE_KEY] || {
    nativeLanguage: null,
    defaultProviderId: null,
  }
}

export async function saveSettings(settings) {
  await chrome.storage.sync.set({ [STORAGE_KEY]: settings })
}

export async function updateSettings(updates) {
  const settings = await getSettings()
  const updated = { ...settings, ...updates }
  await saveSettings(updated)
  return updated
}
