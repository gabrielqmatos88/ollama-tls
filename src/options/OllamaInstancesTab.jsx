import { useState, useEffect } from "react";
import { getDefaultProvider } from "@/storage/providers";

function getOllamaBaseUrl(provider) {
  if (!provider?.baseUrl) return null;
  const url = provider.baseUrl.replace(/\/+$/, "");
  // Strip /v1 suffix to get native Ollama API base
  return url.replace(/\/v1$/, "");
}

export default function OllamaInstancesTab() {
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [unloading, setUnloading] = useState(null);
  const [baseUrl, setBaseUrl] = useState(null);

  useEffect(() => {
    loadModels();
  }, []);

  async function loadModels() {
    setLoading(true);
    setError(null);
    try {
      const provider = await getDefaultProvider();
      const ollamaUrl = getOllamaBaseUrl(provider);
      if (!ollamaUrl) {
        setError("No default provider configured");
        setLoading(false);
        return;
      }
      setBaseUrl(ollamaUrl);

      const response = await fetch(`${ollamaUrl}/api/ps`);
      if (!response.ok) {
        throw new Error(`Ollama returned ${response.status}`);
      }
      const data = await response.json();
      setModels(data.models || []);
    } catch (err) {
      setError(`Cannot connect to Ollama: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleUnload(modelName) {
    setUnloading(modelName);
    try {
      const response = await fetch(`${baseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: modelName, keep_alive: 0 }),
      });
      if (!response.ok) {
        throw new Error(`Failed to unload: ${response.status}`);
      }
      await loadModels();
    } catch (err) {
      alert(`Error unloading model: ${err.message}`);
    } finally {
      setUnloading(null);
    }
  }

  function formatSize(bytes) {
    if (!bytes) return "Unknown";
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1) return `${gb.toFixed(1)} GB`;
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(0)} MB`;
  }

  if (loading) {
    return (
      <div>
        <h2 style={{ marginBottom: 16 }}>Ollama Instances</h2>
        <p className="form-hint">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <h2 style={{ marginBottom: 16 }}>Ollama Instances</h2>
        <p className="error-text">{error}</p>
        <button
          className="btn btn-secondary"
          onClick={loadModels}
          style={{ marginTop: 8 }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="section-header">
        <h2>Ollama Instances</h2>
        <button className="btn btn-secondary" onClick={loadModels}>
          Refresh
        </button>
      </div>

      {models.length === 0 ? (
        <p className="empty-text">
          No models currently loaded in Ollama.
        </p>
      ) : (
        <div className="items-list">
          {models.map((model) => (
            <div
              key={model.name}
              className="item-card"
            >
              <div className="flex-1">
                <strong>{model.name}</strong>
                <div className="form-hint">
                  Size: {formatSize(model.size)}
                  {model.details?.parameter_size &&
                    ` · ${model.details.parameter_size}`}
                </div>
              </div>
              <button
                className="btn btn-danger"
                onClick={() => handleUnload(model.name)}
                disabled={unloading === model.name}
              >
                {unloading === model.name ? "Unloading..." : "Unload"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
