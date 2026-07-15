import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { getPrompts } from "@/storage/prompts";
import { replaceVariables } from "@/utils/templateParser";
import { callProvider } from "@/api/client.js";
import { getDefaultProvider } from "@/storage/providers";
import { getSettings } from "@/storage/settings";
import Spinner from "./Spinner.jsx";
import DiffPopup from "./DiffPopup.jsx";
import "@/theme.css";
import "./spinner.css";
import "./diffPopup.css";

let overlayContainer = null;
let overlayRoot = null;
let activeTextarea = null;

async function applyThemeToContainer(container) {
  const settings = await getSettings();
  container.dataset.theme = settings.theme || "light";
}

function showSpinner(textarea) {
  hideSpinner();
  activeTextarea = textarea;

  overlayContainer = document.createElement("div");
  overlayContainer.id = "crjsx-spinner-overlay";
  overlayContainer.style.position = "absolute";
  overlayContainer.style.zIndex = "2147483646";

  const rect = textarea.getBoundingClientRect();
  overlayContainer.style.top = `${rect.top + window.scrollY}px`;
  overlayContainer.style.left = `${rect.left + window.scrollX}px`;
  overlayContainer.style.width = `${rect.width}px`;
  overlayContainer.style.height = `${rect.height}px`;

  applyThemeToContainer(overlayContainer);
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

  applyThemeToContainer(popupContainer);
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

  const prompts = (await getPrompts()) || [];
  const prompt = prompts.find((p) => p.id === promptId);
  if (!prompt) return;

  const content = replaceVariables(prompt.template, originalText, variables);

  showSpinner(textarea);

  const provider = await getDefaultProvider();
  if (!provider) {
    hideSpinner();
    alert("No provider configured. Please add a provider in the options page.");
    return;
  }

  try {
    const result = await callProvider({
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      model: provider.model,
      messages: [{ role: "user", content }],
      signal: AbortSignal.timeout(60000),
      keepAlive: provider?.keepAlive,
      onChunk: () => {},
    });

    showDiffPopup(textarea, originalText, result);
  } catch (err) {
    hideSpinner();
    alert(`Error: ${err.message}`);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "TEXTAREA_COMPOSE") {
    handleTextareaCompose(message.promptId, message.variables);
    sendResponse({ ok: true });
  }
  return true;
});

document.addEventListener("focusin", (e) => {
  if (e.target.tagName === "TEXTAREA" || e.target.isContentEditable) {
    activeTextarea = e.target;
  }
});

chrome.storage.local.get("textareaCompose").then((result) => {
  if (result.textareaCompose) {
    const { promptId, variables } = result.textareaCompose;
    chrome.storage.local.remove("textareaCompose");
    handleTextareaCompose(promptId, variables);
  }
});
