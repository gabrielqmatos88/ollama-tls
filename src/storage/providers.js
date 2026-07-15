import { getSettings } from './settings'

const STORAGE_KEY = 'providers'

const BUILT_IN_PROVIDERS = [
  {
    id: 'ollama-local',
    name: 'Ollama (Local)',
    baseUrl: 'http://localhost:11434/v1',
    apiKey: '',
    model: 'llama3.2',
    keepAlive: '-1',
    builtIn: true,
  },
]

export async function getProviders() {
  const result = await chrome.storage.sync.get(STORAGE_KEY)
  const stored = result[STORAGE_KEY] || []
  const storedIds = new Set(stored.map(p => p.id))
  const merged = [...BUILT_IN_PROVIDERS.filter(p => !storedIds.has(p.id)), ...stored]
  return merged
}

export async function saveProviders(providers) {
  const userProviders = providers.filter(p => !p.builtIn)
  await chrome.storage.sync.set({ [STORAGE_KEY]: userProviders })
}

export async function addProvider(provider) {
  const providers = await getProviders()
  provider.id = crypto.randomUUID()
  providers.push(provider)
  await saveProviders(providers)
  return provider
}

export async function updateProvider(id, updates) {
  const providers = await getProviders()
  const index = providers.findIndex(p => p.id === id)
  if (index === -1) throw new Error('Provider not found')
  providers[index] = { ...providers[index], ...updates }
  await saveProviders(providers)
  return providers[index]
}

export async function deleteProvider(id) {
  const providers = await getProviders()
  const provider = providers.find(p => p.id === id)
  if (provider?.builtIn) throw new Error('Cannot delete a built-in provider')
  await saveProviders(providers.filter(p => p.id !== id))
}

export async function getDefaultProvider() {
  const [providers, settings] = await Promise.all([getProviders(), getSettings()])
  const defaultProv = providers.find(p => p.id === settings.defaultProviderId)
  return defaultProv || providers[0] || null
}
