import { useState, useEffect } from 'react'
import { getPrompts } from '@/storage/prompts'
import { getSettings } from '@/storage/settings'
import { parseVariables } from '@/utils/templateParser'

export default function PromptBar({ onSend, disabled, providers, selectedProviderId, onProviderChange }) {
  const [prompts, setPrompts] = useState([])
  const [selectedPromptId, setSelectedPromptId] = useState('')
  const [variableValues, setVariableValues] = useState({})
  const [lastRunVariables, setLastRunVariables] = useState({})
  const [settings, setSettings] = useState({})

  useEffect(() => {
    async function load() {
      const [allPrompts, s] = await Promise.all([
        getPrompts(),
        getSettings(),
      ])
      setPrompts(allPrompts.filter(p => p.showInContextMenu))
      setSettings(s)
    }
    load()
  }, [])

  const selectedPrompt = prompts.find(p => p.id === selectedPromptId)
  const parsedVariables = selectedPrompt ? parseVariables(selectedPrompt.template) : []
  const hasText = selectedPrompt ? /\{text[^}]*\}/.test(selectedPrompt.template) : false
  const variables = hasText ? [{ name: 'text', type: 'textarea' }, ...parsedVariables] : parsedVariables

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
    const hasText = /\{text[^}]*\}/.test(prompt.template)
    const allVars = hasText ? [{ name: 'text', type: 'textarea' }, ...vars] : vars
    const defaults = { ...previousValues }
    if (settings.nativeLanguage) {
      const langVar = allVars.find(v => v.name === 'language')
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
            onChange={e => onProviderChange(e.target.value)}
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
