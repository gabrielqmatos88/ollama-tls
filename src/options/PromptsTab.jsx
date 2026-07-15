import { useState, useEffect } from "react";
import {
  getPrompts,
  initializePrompts,
  addPrompt,
  updatePrompt,
  deletePrompt,
} from "@/storage/prompts";
import { parseVariables } from "@/utils/templateParser";

const EMPTY_PROMPT = {
  name: "",
  template: "",
  showInContextMenu: true,
};

export default function PromptsTab() {
  const [prompts, setPrompts] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_PROMPT);

  useEffect(() => {
    loadPrompts();
  }, []);

  async function loadPrompts() {
    const loaded = await initializePrompts();
    setPrompts(loaded);
  }

  function startAdd() {
    setForm({ ...EMPTY_PROMPT });
    setEditing("new");
  }

  function startEdit(prompt) {
    setForm({ ...prompt });
    setEditing(prompt.id);
  }

  function cancelEdit() {
    setEditing(null);
    setForm(EMPTY_PROMPT);
  }

  async function handleSave() {
    if (!form.name || !form.template) return;

    if (editing === "new") {
      await addPrompt(form);
    } else {
      await updatePrompt(editing, form);
    }

    await loadPrompts();
    cancelEdit();
  }

  async function handleDelete(id) {
    await deletePrompt(id);
    await loadPrompts();
    if (editing === id) cancelEdit();
  }

  const detectedVariables = form.template ? parseVariables(form.template) : [];

  return (
    <div>
      <div className="section-header">
        <h2>Prompts</h2>
        <button className="btn btn-primary" onClick={startAdd}>
          Add Prompt
        </button>
      </div>

      {editing && (
        <div className="form-card">
          <h3>
            {editing === "new" ? "New Prompt" : "Edit Prompt"}
          </h3>
          <div className="form-grid">
            <label>
              Name
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Translate to Spanish"
              />
            </label>
            <label>
              Template
              <textarea
                value={form.template}
                onChange={(e) => setForm({ ...form, template: e.target.value })}
                placeholder="Translate to {language}:\n\n{text}"
                rows={4}
              />
            </label>
            {detectedVariables.length > 0 && (
              <div className="form-hint">
                <strong>Variables detected:</strong>
                <ul style={{ marginTop: 4, paddingLeft: 20 }}>
                  {detectedVariables.map((v) => (
                    <li key={v.name}>
                      <code>{`{${v.name}}`}</code>
                      {" — "}
                      <span style={{ color: "var(--accent)" }}>{v.type}</span>
                      {v.options && ` (options: ${v.options.join(", ")})`}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={form.showInContextMenu}
                onChange={(e) =>
                  setForm({ ...form, showInContextMenu: e.target.checked })
                }
                className="input-auto"
              />
              Show in context menu
            </label>
          </div>
          <div className="form-actions">
            <button className="btn btn-primary" onClick={handleSave}>
              Save
            </button>
            <button className="btn btn-secondary" onClick={cancelEdit}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="items-list">
        {prompts.map((prompt) => (
          <div
            key={prompt.id}
            className="item-card"
          >
            <div className="flex-1">
              <strong>{prompt.name}</strong>
              {!prompt.showInContextMenu && (
                <span
                  className="badge badge--gray"
                >
                  hidden
                </span>
              )}
              <div
                className="form-hint"
                style={{
                  whiteSpace: "pre-wrap",
                  maxHeight: 40,
                  overflow: "hidden",
                }}
              >
                {prompt.template}
              </div>
            </div>
            <button
              className="btn btn-secondary"
              onClick={() => startEdit(prompt)}
            >
              Edit
            </button>
            <button
              className="btn btn-danger"
              onClick={() => handleDelete(prompt.id)}
            >
              Delete
            </button>
          </div>
        ))}
        {prompts.length === 0 && !editing && (
          <p className="empty-text">
            No prompts configured.
          </p>
        )}
      </div>
    </div>
  );
}
