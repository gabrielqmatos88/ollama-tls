import { useState, useEffect } from "react";
import {
  getProviders,
  addProvider,
  updateProvider,
  deleteProvider,
} from "@/storage/providers";
import { getSettings, setDefaultProviderId } from "@/storage/settings";

const EMPTY_PROVIDER = {
  name: "",
  baseUrl: "",
  apiKey: "",
  model: "",
  keepAlive: "-1",
};

export default function ProvidersTab() {
  const [providers, setProviders] = useState([]);
  const [editing, setEditing] = useState(null); // null | 'new' | provider id
  const [form, setForm] = useState(EMPTY_PROVIDER);
  const [testResult, setTestResult] = useState(null);
  const [modelList, setModelList] = useState(null);
  const [modelLoading, setModelLoading] = useState(false);
  const [modelError, setModelError] = useState(null);
  const [settings, setSettingsState] = useState(null);

  useEffect(() => {
    loadProviders();
    getSettings().then(setSettingsState);
  }, []);

  useEffect(() => {
    const listener = (changes, area) => {
      if (area === "sync" && changes.settings) {
        getSettings().then(setSettingsState);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  async function loadProviders() {
    const loaded = await getProviders();
    setProviders(loaded);
  }

  function startAdd() {
    setForm({ ...EMPTY_PROVIDER });
    setEditing("new");
    setTestResult(null);
    setModelList(null);
    setModelError(null);
  }

  function startEdit(provider) {
    setForm({ ...provider });
    setEditing(provider.id);
    setTestResult(null);
    setModelList(null);
    setModelError(null);
  }

  function startDuplicate(provider) {
    const baseName = provider.name.replace(/\s*\(copy( \d+)?\)$/, "");
    const existingNames = new Set(providers.map((p) => p.name));
    let name = `${baseName} (copy)`;
    let i = 2;
    while (existingNames.has(name)) {
      name = `${baseName} (copy ${i++})`;
    }
    setForm({ ...provider, id: undefined, name, model: "", builtIn: false });
    setEditing("new");
    setTestResult(null);
    setModelList(null);
    setModelError(null);
  }

  function cancelEdit() {
    setEditing(null);
    setForm(EMPTY_PROVIDER);
    setTestResult(null);
    setModelList(null);
    setModelError(null);
  }

  async function handleSave() {
    if (!form.name || !form.baseUrl || !form.model) return;

    if (editing === "new" || form.builtIn) {
      const { builtIn, id, ...rest } = form;
      await addProvider(rest);
    } else {
      await updateProvider(editing, form);
    }

    await loadProviders();
    cancelEdit();
  }

  async function handleDelete(id) {
    await deleteProvider(id);
    await loadProviders();
    if (editing === id) cancelEdit();
  }

  async function handleSetDefault(id) {
    await setDefaultProviderId(id);
    await loadProviders();
  }

  async function handleTestConnection() {
    setTestResult("testing...");
    try {
      const { callProvider } = await import("@/api/client.js");
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      await callProvider({
        baseUrl: form.baseUrl,
        apiKey: form.apiKey,
        model: form.model,
        messages: [
          { role: "user", content: 'Say "connection ok" in 3 words or less.' },
        ],
        signal: controller.signal,
        onChunk: () => {},
      });

      clearTimeout(timeout);
      setTestResult("Connection successful!");
    } catch (err) {
      setTestResult(`Error: ${err.message}`);
    }
  }

  async function handleLoadModels() {
    if (!form.baseUrl) return;
    setModelLoading(true);
    setModelError(null);
    try {
      const { fetchModels } = await import("@/api/client.js");
      const models = await fetchModels({
        baseUrl: form.baseUrl,
        apiKey: form.apiKey,
      });
      setModelList(models.map((m) => m.id || m));
    } catch (err) {
      setModelError(`Error: ${err.message}`);
      setModelList(null);
    } finally {
      setModelLoading(false);
    }
  }

  return (
    <div>
      <div className="section-header">
        <h2>Providers</h2>
        <button className="btn btn-primary" onClick={startAdd}>
          Add Provider
        </button>
      </div>

      {editing && (
        <div className="form-card">
          <h3>
            {editing === "new" ? "New Provider" : "Edit Provider"}
          </h3>
          <div className="form-grid">
            <label>
              Name
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="My Provider"
                disabled={!!form.builtIn}
              />
            </label>
            <label>
              Base URL
              <input
                value={form.baseUrl}
                onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
                placeholder="http://localhost:11434/v1"
                disabled={!!form.builtIn}
              />
            </label>
            <label>
              API Key (optional for local)
              <input
                type="password"
                value={form.apiKey}
                onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                placeholder="sk-..."
                disabled={!!form.builtIn}
              />
            </label>
            <label>
              Model
              <div className="model-row">
                {modelList ? (
                  <select
                    value={form.model}
                    onChange={(e) => {
                      if (e.target.value === "__manual__") {
                        setModelList(null);
                      } else {
                        setForm({ ...form, model: e.target.value });
                      }
                    }}
                    className="flex-1"
                    disabled={!!form.builtIn}
                  >
                    <option value="__manual__">— enter manually —</option>
                    {modelList.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={form.model}
                    onChange={(e) =>
                      setForm({ ...form, model: e.target.value })
                    }
                    placeholder="llama3.2"
                    className="flex-1"
                    disabled={!!form.builtIn}
                  />
                )}
                <button
                  className="btn btn-secondary"
                  onClick={handleLoadModels}
                  disabled={modelLoading || !form.baseUrl || !!form.builtIn}
                  className="btn-nowrap"
                >
                  {modelLoading ? "Loading..." : "Load Models"}
                </button>
              </div>
              {modelError && (
                <span className="error-text">
                  {modelError}
                </span>
              )}
            </label>
            <label>
              Keep Alive
              <input
                value={form.keepAlive || "-1"}
                onChange={(e) =>
                  setForm({ ...form, keepAlive: e.target.value })
                }
                placeholder="-1"
                disabled={!!form.builtIn}
              />
              <div className="form-hint">
                How long to keep model loaded. "-1" (permanent), "0" (unload
                immediately), duration ("10m", "24h").
              </div>
            </label>
          </div>
          <div className="form-actions">
            {!form.builtIn && (
              <button className="btn btn-primary" onClick={handleSave}>
                Save
              </button>
            )}
            <button
              className="btn btn-secondary"
              onClick={handleTestConnection}
            >
              Test Connection
            </button>
            <button className="btn btn-secondary" onClick={cancelEdit}>
              Cancel
            </button>
            {testResult && (
              <span
                className={`test-result ${testResult.includes("Error") ? "test-result--error" : "test-result--success"}`}
              >
                {testResult}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="items-list">
        {providers.map((provider) => (
          <div key={provider.id} className="item-card">
            <input
              type="radio"
              name="defaultProvider"
              checked={
                settings ? provider.id === settings.defaultProviderId : false
              }
              onChange={() => handleSetDefault(provider.id)}
              className="input-auto"
            />
            <div className="flex-1">
              <strong>{provider.name}</strong>
              {provider.builtIn && (
                <span className="badge badge--green">
                  built-in
                </span>
              )}
              {settings && provider.id === settings.defaultProviderId && (
                <span className="badge badge--blue">
                  default
                </span>
              )}
              <div className="form-hint">
                {provider.baseUrl} — {provider.model || "(no model selected)"}
              </div>
            </div>
            <button
              className="btn btn-secondary"
              onClick={() => startEdit(provider)}
            >
              Edit
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => startDuplicate(provider)}
            >
              Duplicate
            </button>
            {!provider.builtIn && (
              <button
                className="btn btn-danger"
                onClick={() => handleDelete(provider.id)}
              >
                Delete
              </button>
            )}
          </div>
        ))}
        {providers.length === 0 && !editing && (
          <p className="empty-text">
            No providers configured. Click "Add Provider" to get started.
          </p>
        )}
      </div>
    </div>
  );
}
