import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { getPrompts } from "@/storage/prompts";
import { replaceVariables } from "@/utils/templateParser";
import { callProvider } from "@/api/client.js";
import { getDefaultProvider } from "@/storage/providers";
import Spinner from "./Spinner.jsx";
import DiffPopup from "./DiffPopup.jsx";
import "./spinner.css";
import "./diffPopup.css";

let overlayContainer = null;
let overlayRoot = null;
let activeTextarea = null;

function showSpinner(textarea) {
  hideSpinner();
  activeTextarea = textarea;

  // Create overlay positioned relative to textarea
  overlayContainer = document.createElement("div");
  overlayContainer.id = "crjsx-spinner-overlay";
  overlayContainer.style.position = "absolute";
  overlayContainer.style.zIndex = "2147483646";

  // Position over the textarea
  const rect = textarea.getBoundingClientRect();
  overlayContainer.style.top = `${rect.top + window.scrollY}px`;
  overlayContainer.style.left = `${rect.left + window.scrollX}px`;
  overlayContainer.style.width = `${rect.width}px`;
  overlayContainer.style.height = `${rect.height}px`;

  document.body.appendChild(overlayContainer);

  overlayRoot = createRoot(overlayContainer);
  overlayRoot.render(
    <StrictMode>
      <Spinner text="AI is processing..." />
    </StrictMode>,
  );
}

function hideSpinner() {
  if (overlayRoot) {
    overlayRoot.unmount();
    overlayRoot = null;
  }
  if (overlayContainer) {
    overlayContainer.remove();
    overlayContainer = null;
  }
}

function showDiffPopup(textarea, original, suggested) {
  hideSpinner();

  const popupContainer = document.createElement("div");
  popupContainer.id = "crjsx-diff-popup-root";
  document.body.appendChild(popupContainer);

  const popupRoot = createRoot(popupContainer);

  function handleApply() {
    textarea.value = suggested;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.dispatchEvent(new Event("change", { bubbles: true }));
    cleanup();
  }

  function handleCopy() {
    navigator.clipboard.writeText(suggested);
    cleanup();
  }

  function cleanup() {
    popupRoot.unmount();
    popupContainer.remove();
  }

  popupRoot.render(
    <StrictMode>
      <DiffPopup
        original={original}
        suggested={suggested}
        onApply={handleApply}
        onCopy={handleCopy}
        onClose={cleanup}
      />
    </StrictMode>,
  );
}

async function handleTextareaCompose(promptId, variables) {
  const textarea = activeTextarea || document.activeElement;

  if (
    !textarea ||
    (textarea.tagName !== "TEXTAREA" && !textarea.isContentEditable)
  ) {
    console.warn("No textarea focused");
    return;
  }

  const originalText = textarea.value || textarea.textContent || "";

  // Get prompt template
  const prompts = (await getPrompts()) || [];
  const prompt = prompts.find((p) => p.id === promptId);
  if (!prompt) return;

  // Build the message with textarea content
  const content = replaceVariables(prompt.template, originalText, variables);

  // Show spinner
  showSpinner(textarea);

  // Get provider
  const provider = await getDefaultProvider();
  if (!provider) {
    hideSpinner();
    alert("No provider configured. Please add a provider in the options page.");
    return;
  }

  try {
    // Call LLM
    const result = await callProvider({
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      model: provider.model,
      messages: [{ role: "user", content }],
      signal: AbortSignal.timeout(60000), // 60 second timeout
      keepAlive: provider?.keepAlive,
      onChunk: () => {},
    });

    // Show diff popup
    showDiffPopup(textarea, originalText, result);
  } catch (err) {
    hideSpinner();
    alert(`Error: ${err.message}`);
  }
}

// Listen for messages from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "TEXTAREA_COMPOSE") {
    handleTextareaCompose(message.promptId, message.variables);
    sendResponse({ ok: true });
  }
  return true;
});

// Track which textarea was last focused
document.addEventListener("focusin", (e) => {
  if (e.target.tagName === "TEXTAREA" || e.target.isContentEditable) {
    activeTextarea = e.target;
  }
});

// Also check storage on load
chrome.storage.local.get("textareaCompose").then((result) => {
  if (result.textareaCompose) {
    const { promptId, variables } = result.textareaCompose;
    chrome.storage.local.remove("textareaCompose");
    handleTextareaCompose(promptId, variables);
  }
});
