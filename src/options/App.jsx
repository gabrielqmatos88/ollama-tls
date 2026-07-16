import { useState, useEffect } from "react";
import ProvidersTab from "./ProvidersTab.jsx";
import PromptsTab from "./PromptsTab.jsx";
import SettingsTab from "./SettingsTab.jsx";
import OllamaInstancesTab from "./OllamaInstancesTab.jsx";
import OnlineBackupTab from "./OnlineBackupTab.jsx";
import { getDefaultProvider } from "@/storage/providers";

function isLocalhostProvider(provider) {
  if (!provider?.baseUrl) return false;
  return (
    provider.baseUrl.includes("localhost") ||
    provider.baseUrl.includes("127.0.0.1")
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState("providers");
  const [showOllamaTab, setShowOllamaTab] = useState(false);

  useEffect(() => {
    checkOllamaAvailability();
  }, []);

  async function checkOllamaAvailability() {
    const provider = await getDefaultProvider();
    setShowOllamaTab(isLocalhostProvider(provider));
  }

  const tabs = [
    { id: "providers", label: "Providers" },
    { id: "prompts", label: "Prompts" },
    { id: "settings", label: "Settings" },
    { id: "backup", label: "Online Backup" },
    ...(showOllamaTab ? [{ id: "ollama", label: "Ollama" }] : []),
  ];

  return (
    <div className="options-container">
      <h1>Ollama Scribe</h1>
      <nav className="tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`tab ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      <main className="tab-content">
        {activeTab === "providers" && <ProvidersTab />}
        {activeTab === "prompts" && <PromptsTab />}
        {activeTab === "settings" && <SettingsTab />}
        {activeTab === "backup" && <OnlineBackupTab />}
        {activeTab === "ollama" && <OllamaInstancesTab />}
      </main>
    </div>
  );
}
