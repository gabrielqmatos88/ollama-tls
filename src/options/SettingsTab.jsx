import { useState, useEffect } from "react";
import { getSettings, updateSettings } from "@/storage/settings";
import { initializePrompts } from "@/storage/prompts";
import { applyTheme } from "@/utils/theme";

export default function SettingsTab() {
  const [settings, setSettings] = useState({
    nativeLanguage: "",
    theme: "light",
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    const loaded = await getSettings();
    setSettings({
      nativeLanguage: loaded.nativeLanguage || "",
      theme: loaded.theme || "light",
    });
  }

  async function handleSave() {
    await updateSettings({
      nativeLanguage: settings.nativeLanguage || null,
      theme: settings.theme,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleThemeChange(theme) {
    setSettings({ ...settings, theme });
    await updateSettings({ theme });
    await applyTheme();
  }

  async function handleClearHistory() {
    await chrome.storage.local.remove("conversations");
    alert("Conversation history cleared.");
  }

  async function handleResetData() {
    const confirmed = window.confirm(
      "This will reset ALL settings, prompts, providers, and conversation history to defaults. This cannot be undone. Continue?"
    );
    if (!confirmed) return;
    await chrome.storage.sync.clear();
    await chrome.storage.local.clear();
    await initializePrompts();
    window.location.reload();
  }

  const browserLang = navigator.language || "";

  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>Settings</h2>

      <div className="form-grid" style={{ maxWidth: 400 }}>
        <label>
          Theme
          <select
            value={settings.theme}
            onChange={(e) => handleThemeChange(e.target.value)}
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="monokai">Monokai</option>
          </select>
        </label>

        <label>
          Native Language
          <input
            value={settings.nativeLanguage}
            onChange={(e) =>
              setSettings({ ...settings, nativeLanguage: e.target.value })
            }
            placeholder={browserLang}
          />
          <div className="form-hint">
            Used for "Translate to Native" prompt. Browser default:{" "}
            {browserLang}
          </div>
        </label>

        <div>
          <button className="btn btn-primary" onClick={handleSave}>
            Save Settings
          </button>
          {saved && (
            <span className="test-result test-result--success" style={{ marginLeft: 8 }}>
              Saved!
            </span>
          )}
        </div>

        <hr className="hr-divider" />

        <div>
          <button className="btn btn-danger" onClick={handleClearHistory}>
            Clear All Conversation History
          </button>
          <div className="form-hint">
            This will delete all saved conversations from the side panel.
          </div>
        </div>

        <hr className="hr-divider" />

        <div>
          <button className="btn btn-danger" onClick={handleResetData}>
            Reset Data
          </button>
          <div className="form-hint">
            This will reset all settings, prompts, and providers to defaults and clear all data.
          </div>
        </div>
      </div>
    </div>
  );
}
