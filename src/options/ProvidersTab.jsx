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
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <h2>Providers</h2>
        <button className="btn btn-primary" onClick={startAdd}>
          Add Provider
        </button>
      </div>

      {editing && (
        <div
          style={{
            background: "#f9fafb",
            padding: 16,
            borderRadius: 8,
            marginBottom: 16,
            border: "1px solid #e5e7eb",
          }}
        >
          <h3 style={{ marginBottom: 12 }}>
            {editing === "new" ? "New Provider" : "Edit Provider"}
          </h3>
          <div style={{ display: "grid", gap: 12 }}>
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
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
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
                    style={{ flex: 1 }}
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
                    style={{ flex: 1 }}
                    disabled={!!form.builtIn}
                  />
                )}
                <button
                  className="btn btn-secondary"
                  onClick={handleLoadModels}
                  disabled={modelLoading || !form.baseUrl || !!form.builtIn}
                  style={{ whiteSpace: "nowrap" }}
                >
                  {modelLoading ? "Loading..." : "Load Models"}
                </button>
              </div>
              {modelError && (
                <span style={{ fontSize: 13, color: "#dc2626" }}>
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
              <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
                How long to keep model loaded. "-1" (permanent), "0" (unload
                immediately), duration ("10m", "24h").
              </div>
            </label>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
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
                style={{
                  alignSelf: "center",
                  fontSize: 14,
                  color: testResult.includes("Error") ? "#dc2626" : "#16a34a",
                }}
              >
                {testResult}
              </span>
            )}
          </div>
        </div>
      )}

      <div style={{ display: "grid", gap: 8 }}>
        {providers.map((provider) => (
          <div
            key={provider.id}
            style={{
              display: "flex",
              alignItems: "center",
              padding: 12,
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              gap: 12,
            }}
          >
            <input
              type="radio"
              name="defaultProvider"
              checked={
                settings ? provider.id === settings.defaultProviderId : false
              }
              onChange={() => handleSetDefault(provider.id)}
              style={{ width: "auto" }}
            />
            <div style={{ flex: 1 }}>
              <strong>{provider.name}</strong>
              {provider.builtIn && (
                <span
                  style={{
                    marginLeft: 8,
                    fontSize: 12,
                    color: "#65a30d",
                    background: "#f0fdf4",
                    padding: "2px 6px",
                    borderRadius: 4,
                  }}
                >
                  built-in
                </span>
              )}
              {settings && provider.id === settings.defaultProviderId && (
                <span
                  style={{
                    marginLeft: 8,
                    fontSize: 12,
                    color: "#2563eb",
                    background: "#eff6ff",
                    padding: "2px 6px",
                    borderRadius: 4,
                  }}
                >
                  default
                </span>
              )}
              <div style={{ fontSize: 13, color: "#666" }}>
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
          <p style={{ color: "#666", textAlign: "center", padding: 24 }}>
            No providers configured. Click "Add Provider" to get started.
          </p>
        )}
      </div>
    </div>
  );
}
