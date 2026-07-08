import { useState, useEffect } from 'react'
import { getPrompts } from '@/storage/prompts'
import { getProviders } from '@/storage/providers'
import { getSettings } from '@/storage/settings'
import { parseVariables } from '@/utils/templateParser'

export default function PromptBar({ onSend, disabled }) {
  const [prompts, setPrompts] = useState([])
  const [providers, setProviders] = useState([])
  const [selectedPromptId, setSelectedPromptId] = useState('')
  const [selectedProviderId, setSelectedProviderId] = useState('')
  const [variableValues, setVariableValues] = useState({})
  const [lastRunVariables, setLastRunVariables] = useState({})
  const [settings, setSettings] = useState({})

  useEffect(() => {
    async function load() {
      const [allPrompts, allProviders, s] = await Promise.all([
        getPrompts(),
        getProviders(),
        getSettings(),
      ])
      setPrompts(allPrompts.filter(p => p.showInContextMenu))
      setProviders(allProviders)
      const defaultProvider = allProviders.find(p => p.isDefault) || allProviders[0]
      if (defaultProvider) setSelectedProviderId(defaultProvider.id)
      setSettings(s)
    }
    load()
  }, [])

  const selectedPrompt = prompts.find(p => p.id === selectedPromptId)
  const variables = selectedPrompt ? parseVariables(selectedPrompt.template) : []

  function handlePromptChange(promptId) {
    setSelectedPromptId(promptId)
    if (!promptId) {
      setVariableValues({})
      return
    }
    const previousValues = lastRunVariables[promptId] || {}
    const prompt = prompts.find(p => p.id === promptId)
    if (!prompt) return
    const vars = parseVariables(prompt.template)
    const defaults = { ...previousValues }
    if (settings.nativeLanguage) {
      const langVar = vars.find(v => v.name === 'language')
      if (langVar && !defaults.language) defaults.language = settings.nativeLanguage
    }
    setVariableValues(defaults)
  }

  function handleRun() {
    if (!selectedPromptId || disabled) return
    setLastRunVariables(prev => ({ ...prev, [selectedPromptId]: { ...variableValues } }))
    onSend(selectedPromptId, variableValues, selectedProviderId)
  }

  return (
    <div className="prompt-bar">
      <div className="prompt-bar-row">
        <select
          value={selectedPromptId}
          onChange={e => handlePromptChange(e.target.value)}
          disabled={disabled}
        >
          <option value="">Free text...</option>
          {prompts.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        {providers.length > 1 && (
          <select
            value={selectedProviderId}
            onChange={e => setSelectedProviderId(e.target.value)}
            disabled={disabled}
          >
            {providers.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}
      </div>
      {selectedPrompt && variables.length > 0 && (
        <div className="prompt-bar-variables">
          {variables.map(variable => (
            <label key={variable.name}>
              {variable.name}
              {variable.type === 'text' && (
                <input
                  type="text"
                  value={variableValues[variable.name] || ''}
                  onChange={e => setVariableValues({ ...variableValues, [variable.name]: e.target.value })}
                  disabled={disabled}
                />
              )}
              {variable.type === 'number' && (
                <input
                  type="number"
                  value={variableValues[variable.name] || ''}
                  onChange={e => setVariableValues({ ...variableValues, [variable.name]: e.target.value })}
                  disabled={disabled}
                />
              )}
              {variable.type === 'textarea' && (
                <textarea
                  value={variableValues[variable.name] || ''}
                  onChange={e => setVariableValues({ ...variableValues, [variable.name]: e.target.value })}
                  disabled={disabled}
                  rows={2}
                />
              )}
              {variable.type === 'boolean' && (
                <div className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={variableValues[variable.name] || false}
                    onChange={e => setVariableValues({ ...variableValues, [variable.name]: e.target.checked })}
                    disabled={disabled}
                    style={{ width: 'auto' }}
                  />
                  <span>{variable.name}</span>
                </div>
              )}
              {variable.type === 'select' && (
                <select
                  value={variableValues[variable.name] || ''}
                  onChange={e => setVariableValues({ ...variableValues, [variable.name]: e.target.value })}
                  disabled={disabled}
                >
                  <option value="">Select...</option>
                  {variable.options.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              )}
              {variable.type === 'radio' && (
                <div className="radio-group">
                  {variable.options.map(opt => (
                    <label key={opt}>
                      <input
                        type="radio"
                        name={variable.name}
                        value={opt}
                        checked={variableValues[variable.name] === opt}
                        onChange={e => setVariableValues({ ...variableValues, [variable.name]: e.target.value })}
                        disabled={disabled}
                        style={{ width: 'auto' }}
                      />
                      {opt}
                    </label>
                  ))}
                </div>
              )}
            </label>
          ))}
          <button
            className="btn btn-primary"
            onClick={handleRun}
            disabled={disabled}
          >
            Run
          </button>
        </div>
      )}
      {selectedPrompt && variables.length === 0 && (
        <div className="prompt-bar-variables">
          <button
            className="btn btn-primary"
            onClick={handleRun}
            disabled={disabled}
          >
            Run
          </button>
        </div>
      )}
    </div>
  )
}
