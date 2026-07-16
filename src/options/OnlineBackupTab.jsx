import { useState, useEffect } from "react";
import {
  parseGistUrl,
  fetchGist,
  findScribeGist,
  createScribeGist,
  updateScribeGist,
} from "@/utils/gistApi";
import { getSettings, saveSettings } from "@/storage/settings";
import { getProviders, saveProviders } from "@/storage/providers";
import { getPrompts, savePrompts, initializePrompts } from "@/storage/prompts";
import { getNotes } from "@/storage/notes";

const GIST_CONFIG_KEY = "gistConfig";

async function getGistConfig() {
  const result = await chrome.storage.sync.get(GIST_CONFIG_KEY);
  return result[GIST_CONFIG_KEY] || { token: "", gistId: null, isPublic: false };
}

async function saveGistConfig(config) {
  await chrome.storage.sync.set({ [GIST_CONFIG_KEY]: config });
}

function buildExportData(settings, providers, prompts, notes) {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: {
      nativeLanguage: settings.nativeLanguage,
      defaultProviderId: settings.defaultProviderId,
      theme: settings.theme,
    },
    providers: providers.filter((p) => !p.builtIn),
    prompts,
    notes,
  };
}

function validateImportData(data) {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid data format");
  }
  if (data.version !== 1) {
    throw new Error(`Unsupported version: ${data.version}`);
  }
  if (!data.settings || typeof data.settings !== "object") {
    throw new Error("Missing settings data");
  }
  if (!Array.isArray(data.providers)) {
    throw new Error("Missing providers data");
  }
  if (!Array.isArray(data.prompts)) {
    throw new Error("Missing prompts data");
  }
}

export default function OnlineBackupTab() {
  const [gistUrl, setGistUrl] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState("");
  const [importSuccess, setImportSuccess] = useState("");

  const [token, setToken] = useState("");
  const [gistId, setGistId] = useState(null);
  const [isPublic, setIsPublic] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportError, setExportError] = useState("");
  const [exportSuccess, setExportSuccess] = useState("");
  const [tokenSaved, setTokenSaved] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  async function loadConfig() {
    const config = await getGistConfig();
    setToken(config.token || "");
    setGistId(config.gistId);
    setIsPublic(config.isPublic ?? false);
  }

  async function handleSaveToken() {
    const config = await getGistConfig();
    await saveGistConfig({ ...config, token, isPublic });
    setTokenSaved(true);
    setTimeout(() => setTokenSaved(false), 2000);
  }

  async function handleImport() {
    setImportError("");
    setImportSuccess("");
    setImportLoading(true);

    try {
      const id = parseGistUrl(gistUrl);
      if (!id) {
        throw new Error("Invalid gist URL");
      }

      const gist = await fetchGist(id);
      const scribeFile = gist.files?.["scribe.json"];
      if (!scribeFile) {
        throw new Error("Gist does not contain scribe.json");
      }

      const data = JSON.parse(scribeFile.content);
      validateImportData(data);

      await saveSettings({
        nativeLanguage: data.settings.nativeLanguage ?? null,
        defaultProviderId: data.settings.defaultProviderId ?? "ollama-local",
        theme: data.settings.theme ?? "light",
      });
      await saveProviders(data.providers);
      await savePrompts(data.prompts);
      await chrome.storage.local.set({ notes: data.notes || [] });
      await initializePrompts();

      setImportSuccess("Data imported successfully. Reloading...");
      setTimeout(() => window.location.reload(), 1500);
    } catch (e) {
      setImportError(e.message);
    } finally {
      setImportLoading(false);
    }
  }

  async function handleExport() {
    setExportError("");
    setExportSuccess("");
    setExportLoading(true);

    try {
      if (!token) {
        throw new Error("GitHub token is required");
      }

      const [settings, providers, prompts, notes] = await Promise.all([
        getSettings(),
        getProviders(),
        getPrompts(),
        getNotes(),
      ]);

      const data = buildExportData(settings, providers, prompts, notes);

      let targetGistId = gistId;
      if (targetGistId) {
        try {
          await updateScribeGist(token, targetGistId, data);
        } catch (e) {
          if (e.message.includes("404")) {
            const gist = await createScribeGist(token, data, isPublic);
            targetGistId = gist.id;
            await saveGistConfig({ token, gistId: targetGistId, isPublic });
          } else {
            throw e;
          }
        }
      } else {
        const existing = await findScribeGist(token);
        if (existing) {
          targetGistId = existing.id;
          await updateScribeGist(token, targetGistId, data);
        } else {
          const gist = await createScribeGist(token, data, isPublic);
          targetGistId = gist.id;
        }
        await saveGistConfig({ token, gistId: targetGistId, isPublic });
      }

      setGistId(targetGistId);
      setExportSuccess("Data saved to gist successfully.");
    } catch (e) {
      setExportError(e.message);
    } finally {
      setExportLoading(false);
    }
  }

  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>Online Backup</h2>

      <div className="form-card">
        <h3>Import from Gist</h3>
        <div className="form-grid" style={{ maxWidth: 480 }}>
          <label>
            Gist URL
            <input
              value={gistUrl}
              onChange={(e) => setGistUrl(e.target.value)}
              placeholder="https://gist.github.com/user/abc123"
            />
            <div className="form-hint">
              Must be a public gist containing a scribe.json file
            </div>
          </label>
          <div>
            <button
              className="btn btn-primary"
              onClick={handleImport}
              disabled={importLoading}
            >
              {importLoading ? "Loading..." : "Load"}
            </button>
            {importError && (
              <span className="test-result test-result--error" style={{ marginLeft: 8 }}>
                {importError}
              </span>
            )}
            {importSuccess && (
              <span className="test-result test-result--success" style={{ marginLeft: 8 }}>
                {importSuccess}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="form-card">
        <h3>GitHub Sync</h3>
        <div className="form-grid" style={{ maxWidth: 480 }}>
          <label>
            Personal Access Token
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="ghp_..."
            />
            <div className="form-hint">
              Needs gist scope.{" "}
              <a
                href="https://github.com/settings/tokens/new?scopes=gist&description=Ollama+Scribe"
                target="_blank"
                rel="noopener noreferrer"
              >
                Create token
              </a>
            </div>
          </label>

          <label>
            Gist Visibility
            <div style={{ display: "flex", gap: 16, marginTop: 4 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 4, width: "auto" }}>
                <input
                  type="radio"
                  name="visibility"
                  checked={!isPublic}
                  onChange={() => setIsPublic(false)}
                  style={{ width: "auto" }}
                />
                Private
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 4, width: "auto" }}>
                <input
                  type="radio"
                  name="visibility"
                  checked={isPublic}
                  onChange={() => setIsPublic(true)}
                  style={{ width: "auto" }}
                />
                Public
              </label>
            </div>
          </label>

          <div>
            <button className="btn btn-secondary" onClick={handleSaveToken}>
              Save Token
            </button>
            {tokenSaved && (
              <span className="test-result test-result--success" style={{ marginLeft: 8 }}>
                Saved!
              </span>
            )}
          </div>

          <hr className="hr-divider" />

          <div>
            <button
              className="btn btn-primary"
              onClick={handleExport}
              disabled={exportLoading}
            >
              {exportLoading ? "Saving..." : "Save to Gist"}
            </button>
            {exportError && (
              <span className="test-result test-result--error" style={{ marginLeft: 8 }}>
                {exportError}
              </span>
            )}
            {exportSuccess && (
              <span className="test-result test-result--success" style={{ marginLeft: 8 }}>
                {exportSuccess}
              </span>
            )}
            {gistId && (
              <div className="form-hint" style={{ marginTop: 4 }}>
                Gist ID: {gistId}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
