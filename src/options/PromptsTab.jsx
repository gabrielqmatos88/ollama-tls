import { useState, useEffect } from 'react'
import { getPrompts, initializePrompts, addPrompt, updatePrompt, deletePrompt } from '@/storage/prompts'
import { parseVariables } from '@/utils/templateParser'

const EMPTY_PROMPT = {
  name: '',
  template: '',
  showInContextMenu: true,
}

export default function PromptsTab() {
  const [prompts, setPrompts] = useState([])
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_PROMPT)

  useEffect(() => {
    loadPrompts()
  }, [])

  async function loadPrompts() {
    const loaded = await initializePrompts()
    setPrompts(loaded)
  }

  function startAdd() {
    setForm({ ...EMPTY_PROMPT })
    setEditing('new')
  }

  function startEdit(prompt) {
    setForm({ ...prompt })
    setEditing(prompt.id)
  }

  function cancelEdit() {
    setEditing(null)
    setForm(EMPTY_PROMPT)
  }

  async function handleSave() {
    if (!form.name || !form.template) return

    if (editing === 'new') {
      await addPrompt(form)
    } else {
      await updatePrompt(editing, form)
    }

    await loadPrompts()
    cancelEdit()
  }

  async function handleDelete(id) {
    await deletePrompt(id)
    await loadPrompts()
    if (editing === id) cancelEdit()
  }

  const detectedVariables = form.template ? parseVariables(form.template) : []

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2>Prompts</h2>
        <button className="btn btn-primary" onClick={startAdd}>Add Prompt</button>
      </div>

      {editing && (
        <div style={{ background: '#f9fafb', padding: 16, borderRadius: 8, marginBottom: 16, border: '1px solid #e5e7eb' }}>
          <h3 style={{ marginBottom: 12 }}>{editing === 'new' ? 'New Prompt' : 'Edit Prompt'}</h3>
          <div style={{ display: 'grid', gap: 12 }}>
            <label>
              Name
              <input
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="Translate to Spanish"
              />
            </label>
            <label>
              Template
              <textarea
                value={form.template}
                onChange={e => setForm({ ...form, template: e.target.value })}
                placeholder="Translate to {language}:\n\n{text}"
                rows={4}
              />
            </label>
            {detectedVariables.length > 0 && (
              <div style={{ fontSize: 13, color: '#666' }}>
                <strong>Variables detected:</strong>
                <ul style={{ marginTop: 4, paddingLeft: 20 }}>
                  {detectedVariables.map(v => (
                    <li key={v.name}>
                      <code>{`{${v.name}}`}</code>
                      {' — '}
                      <span style={{ color: '#2563eb' }}>{v.type}</span>
                      {v.options && ` (options: ${v.options.join(', ')})`}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={form.showInContextMenu}
                onChange={e => setForm({ ...form, showInContextMenu: e.target.checked })}
                style={{ width: 'auto' }}
              />
              Show in context menu
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button className="btn btn-primary" onClick={handleSave}>Save</button>
            <button className="btn btn-secondary" onClick={cancelEdit}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gap: 8 }}>
        {prompts.map(prompt => (
          <div key={prompt.id} style={{ display: 'flex', alignItems: 'center', padding: 12, border: '1px solid #e5e7eb', borderRadius: 8, gap: 12 }}>
            <div style={{ flex: 1 }}>
              <strong>{prompt.name}</strong>
              {!prompt.showInContextMenu && <span style={{ marginLeft: 8, fontSize: 12, color: '#666', background: '#f3f4f6', padding: '2px 6px', borderRadius: 4 }}>hidden</span>}
              <div style={{ fontSize: 13, color: '#666', marginTop: 4, whiteSpace: 'pre-wrap', maxHeight: 40, overflow: 'hidden' }}>{prompt.template}</div>
            </div>
            <button className="btn btn-secondary" onClick={() => startEdit(prompt)}>Edit</button>
            <button className="btn btn-danger" onClick={() => handleDelete(prompt.id)}>Delete</button>
          </div>
        ))}
        {prompts.length === 0 && !editing && (
          <p style={{ color: '#666', textAlign: 'center', padding: 24 }}>No prompts configured.</p>
        )}
      </div>
    </div>
  )
}
