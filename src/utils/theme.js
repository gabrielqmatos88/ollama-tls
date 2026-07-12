import { getSettings } from '@/storage/settings'

export async function applyTheme() {
  const settings = await getSettings()
  document.body.dataset.theme = settings.theme || 'light'
}

export function onThemeChanged(callback) {
  const listener = (changes, area) => {
    if (area === 'sync' && changes.settings) {
      const newSettings = changes.settings.newValue
      if (newSettings?.theme) {
        document.body.dataset.theme = newSettings.theme
        callback?.(newSettings.theme)
      }
    }
  }
  chrome.storage.onChanged.addListener(listener)
  return () => chrome.storage.onChanged.removeListener(listener)
}
