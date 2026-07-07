import { useState } from 'react'
import ProvidersTab from './ProvidersTab.jsx'
import PromptsTab from './PromptsTab.jsx'
import SettingsTab from './SettingsTab.jsx'

const TABS = [
  { id: 'providers', label: 'Providers' },
  { id: 'prompts', label: 'Prompts' },
  { id: 'settings', label: 'Settings' },
]

export default function App() {
  const [activeTab, setActiveTab] = useState('providers')

  return (
    <div className="options-container">
      <h1>ollama-tls</h1>
      <nav className="tabs">
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      <main className="tab-content">
        {activeTab === 'providers' && <ProvidersTab />}
        {activeTab === 'prompts' && <PromptsTab />}
        {activeTab === 'settings' && <SettingsTab />}
      </main>
    </div>
  )
}
