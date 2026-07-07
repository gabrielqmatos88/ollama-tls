import './App.css'

export default function App() {
  function handleOpenSidePanel() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.sidePanel.open({ tabId: tabs[0].id })
      }
    })
    window.close()
  }

  function handleOpenOptions() {
    chrome.runtime.openOptionsPage()
    window.close()
  }

  return (
    <div className="popup-container">
      <h2>Ollama Scribe</h2>
      <p className="popup-desc">AI text transformation</p>
      <div className="popup-actions">
        <button className="btn btn-primary" onClick={handleOpenSidePanel}>Open Chat</button>
        <button className="btn btn-secondary" onClick={handleOpenOptions}>Settings</button>
      </div>
    </div>
  )
}
