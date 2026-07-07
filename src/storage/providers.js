const STORAGE_KEY = 'providers'

export async function getProviders() {
  const result = await chrome.storage.sync.get(STORAGE_KEY)
  return result[STORAGE_KEY] || []
}

export async function saveProviders(providers) {
  await chrome.storage.sync.set({ [STORAGE_KEY]: providers })
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
  await saveProviders(providers.filter(p => p.id !== id))
}

export async function getDefaultProvider() {
  const providers = await getProviders()
  return providers.find(p => p.isDefault) || providers[0] || null
}
