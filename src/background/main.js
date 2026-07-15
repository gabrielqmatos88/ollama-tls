import { addNote } from "@/storage/notes";
import { getPrompts, initializePrompts } from "@/storage/prompts";
import { getSettings } from "@/storage/settings";
import { parseVariables } from "@/utils/templateParser";
import { sidePanelManager } from "./sidePanelManager.js";

chrome.runtime.onInstalled.addListener(async () => {
  await initializePrompts();
  await rebuildContextMenus();
});

// Open side panel when clicking extension icon
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.prompts) {
    rebuildContextMenus();
  }
});

async function rebuildContextMenus() {
  await chrome.contextMenus.removeAll();

  const prompts = (await getPrompts()) || [];
  const contextPrompts = prompts.filter((p) => p.showInContextMenu);

  // Parent menu for selected text
  chrome.contextMenus.create({
    id: "ollama-scribe",
    title: "Ollama Scribe",
    contexts: ["selection"],
  });

  // Parent menu for textareas/input fields
  chrome.contextMenus.create({
    id: "ollama-scribe-editable",
    title: "Ollama Scribe - Help compose",
    contexts: ["editable"],
  });

  // Add prompts to both menus
  for (const prompt of contextPrompts) {
    // For selected text
    chrome.contextMenus.create({
      id: `prompt:${prompt.id}`,
      parentId: "ollama-scribe",
      title: prompt.name,
      contexts: ["selection"],
    });

    // For textareas
    chrome.contextMenus.create({
      id: `compose:${prompt.id}`,
      parentId: "ollama-scribe-editable",
      title: prompt.name,
      contexts: ["editable"],
    });
  }

  // Add "Save as Note" item
  chrome.contextMenus.create({
    id: "save-note",
    parentId: "ollama-scribe",
    title: "Save as Note",
    contexts: ["selection"],
  });

  // Add "Copy as Markdown" item
  chrome.contextMenus.create({
    id: "copy-as-markdown",
    parentId: "ollama-scribe",
    title: "Copy as Markdown",
    contexts: ["selection"],
  });
}

async function getVariablesForPrompt(promptId) {
  const prompts = (await getPrompts()) || [];
  const prompt = prompts.find((p) => p.id === promptId);
  const settings = await getSettings();
  const variables = {};

  if (prompt) {
    const templateVars = parseVariables(prompt.template);
    for (const v of templateVars) {
      if (v.name === "language" && settings.nativeLanguage) {
        variables.language = settings.nativeLanguage;
      }
    }
  }

  return variables;
}

async function sendToSidePanel(data) {
  await chrome.storage.local.set({
    messageBus_pending: [
      { type: "PROMPT_SELECTED", data, timestamp: Date.now() },
    ],
  });
}

async function sendToContentScript(tabId, data) {
  await chrome.storage.local.set({
    textareaCompose: data,
  });

  // Also try direct message
  chrome.tabs
    .sendMessage(tabId, {
      type: "TEXTAREA_COMPOSE",
      ...data,
    })
    .catch(() => {});
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const { menuItemId } = info;

  // Handle selected text prompts (original behavior)
  if (menuItemId.startsWith("prompt:")) {
    const promptId = menuItemId.replace("prompt:", "");
    const selectedText = info.selectionText;
    const windowId = tab.windowId;

    // Open side panel FIRST while user gesture is still active
    try {
      await chrome.sidePanel.open({ windowId });
    } catch (err) {
      console.error("Failed to open side panel:", err);
    }

    // Now do async work to get variables and send message
    const variables = await getVariablesForPrompt(promptId);
    await sendToSidePanel({ promptId, selectedText, variables });
    return;
  }

  // Handle textarea compose prompts
  if (menuItemId.startsWith("compose:")) {
    const promptId = menuItemId.replace("compose:", "");
    const variables = await getVariablesForPrompt(promptId);

    // Send to content script to handle textarea interaction
    await sendToContentScript(tab.id, {
      promptId,
      variables,
    });
    return;
  }

  // Handle save as note
  if (menuItemId === "save-note") {
    const selectedText = info.selectionText;
    const sourceUrl = tab.url || "";
    const sourceTitle = tab.title || "";
    try {
      await addNote({ text: selectedText, sourceUrl, sourceTitle });
    } catch (err) {
      console.error("Failed to save note:", err);
    }
    return;
  }

  // Handle copy as markdown
  if (menuItemId === "copy-as-markdown") {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: copySelectionAsMarkdown,
      });
    } catch (err) {
      console.error("Failed to copy as markdown:", err);
    }
    return;
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "OPEN_SIDEBAR_WITH_PROMPT") {
    const { promptId, selectedText, variables } = message;
    const windowId = sender.tab?.windowId;

    if (windowId) {
      // Open side panel FIRST while user gesture is still active
      chrome.sidePanel
        .open({ windowId })
        .then(() => {
          sendToSidePanel({ promptId, selectedText, variables });
        })
        .catch((err) => {
          console.error("Failed to open side panel:", err);
          // Still send the message even if panel failed to open
          sendToSidePanel({ promptId, selectedText, variables });
        });
    }

    sendResponse({ ok: true });
  }
  return true;
});

// Sync side panel state on window focus changes
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  await sidePanelManager.isOpen();
});

function copySelectionAsMarkdown() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;

  const range = selection.getRangeAt(0);
  const fragment = range.cloneContents();
  const container = document.createElement("div");
  container.appendChild(fragment);

  function nodeToMd(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent;
    if (node.nodeType !== Node.ELEMENT_NODE) return "";

    const tag = node.tagName.toLowerCase();
    const children = Array.from(node.childNodes)
      .map((child) => nodeToMd(child))
      .join("");

    switch (tag) {
      case "h1":
        return `# ${children}\n\n`;
      case "h2":
        return `## ${children}\n\n`;
      case "h3":
        return `### ${children}\n\n`;
      case "h4":
        return `#### ${children}\n\n`;
      case "h5":
        return `##### ${children}\n\n`;
      case "h6":
        return `###### ${children}\n\n`;
      case "strong":
      case "b":
        return `**${children}**`;
      case "em":
      case "i":
        return `*${children}*`;
      case "code":
        return `\`${children}\``;
      case "a": {
        const href = node.getAttribute("href") || "";
        return `[${children}](${href})`;
      }
      case "br":
        return "\n";
      case "p":
        return `${children}\n\n`;
      case "blockquote":
        return `> ${children}\n\n`;
      case "ul":
        return Array.from(node.children)
          .map((li) => `- ${nodeToMd(li)}\n`)
          .join("");
      case "ol":
        return Array.from(node.children)
          .map((li, i) => `${i + 1}. ${nodeToMd(li)}\n`)
          .join("");
      case "li":
        return children;
      case "div":
        return `${children}\n`;
      case "pre":
        return `\`\`\`\n${children}\n\`\`\`\n\n`;
      default:
        return children;
    }
  }

  const markdown = nodeToMd(container).trim();
  navigator.clipboard.writeText(markdown).catch((err) => {
    console.error("Clipboard write failed:", err);
  });
}
