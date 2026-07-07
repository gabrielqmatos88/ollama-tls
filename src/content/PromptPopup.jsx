import { useState, useEffect, useRef } from 'react'
import { getPrompts } from '@/storage/prompts'
import { getSettings } from '@/storage/settings'
import { parseVariables } from '@/utils/templateParser'

export default function PromptPopup({ selectedText, position, onSend, onClose }) {
  const [prompts, setPrompts] = useState([])
  const [selectedPrompt, setSelectedPrompt] = useState(null)
  const [variableValues, setVariableValues] = useState({})
  const [settings, setSettings] = useState({})
  const popupRef = useRef(null)

  useEffect(() => {
    async function load() {
      const allPrompts = await getPrompts()
      setPrompts(allPrompts.filter(p => p.showInContextMenu))
      const s = await getSettings()
      setSettings(s)
    }
    load()
  }, [])

  useEffect(() => {
    function handleClickOutside(e) {
      if (popupRef.current && !popupRef.current.contains(e.target)) {
        onClose()
      }
    }
    function handleEscape(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose])

  function handlePromptClick(prompt) {
    const variables = parseVariables(prompt.template)
    if (variables.length === 0) {
      onSend(prompt.id, selectedText, {})
      return
    }
    const defaults = {}
    if (settings.nativeLanguage) {
      const langVar = variables.find(v => v.name === 'language')
      if (langVar) defaults.language = settings.nativeLanguage
    }
    setVariableValues(defaults)
    setSelectedPrompt(prompt)
  }

  function handleConfirm() {
    onSend(selectedPrompt.id, selectedText, variableValues)
  }

  const variables = selectedPrompt ? parseVariables(selectedPrompt.template) : []

  return (
    <div className="crjsx-prompt-popup" ref={popupRef} style={{ top: position.top, left: position.left }}>
      {!selectedPrompt ? (
        <div className="prompt-list">
          {prompts.map(prompt => (
            <button key={prompt.id} className="prompt-item" onClick={() => handlePromptClick(prompt)}>
              {prompt.name}
            </button>
          ))}
        </div>
      ) : (
        <div>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>{selectedPrompt.name}</div>
          <div className="variables-form">
            {variables.map(variable => (
              <label key={variable.name}>
                {variable.name}
                {variable.type === 'text' && (
                  <input
                    type="text"
                    value={variableValues[variable.name] || ''}
                    onChange={e => setVariableValues({ ...variableValues, [variable.name]: e.target.value })}
                  />
                )}
                {variable.type === 'number' && (
                  <input
                    type="number"
                    value={variableValues[variable.name] || ''}
                    onChange={e => setVariableValues({ ...variableValues, [variable.name]: e.target.value })}
                  />
                )}
                {variable.type === 'textarea' && (
                  <textarea
                    value={variableValues[variable.name] || ''}
                    onChange={e => setVariableValues({ ...variableValues, [variable.name]: e.target.value })}
                    rows={3}
                  />
                )}
                {variable.type === 'boolean' && (
                  <div className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={variableValues[variable.name] || false}
                      onChange={e => setVariableValues({ ...variableValues, [variable.name]: e.target.checked })}
                      style={{ width: 'auto' }}
                    />
                    <span>{variable.name}</span>
                  </div>
                )}
                {variable.type === 'select' && (
                  <select
                    value={variableValues[variable.name] || ''}
                    onChange={e => setVariableValues({ ...variableValues, [variable.name]: e.target.value })}
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
                          style={{ width: 'auto' }}
                        />
                        {opt}
                      </label>
                    ))}
                  </div>
                )}
              </label>
            ))}
          </div>
          <div className="form-actions">
            <button className="btn-confirm" onClick={handleConfirm}>Send</button>
            <button className="btn-cancel" onClick={() => setSelectedPrompt(null)}>Back</button>
          </div>
        </div>
      )}
    </div>
  )
}
