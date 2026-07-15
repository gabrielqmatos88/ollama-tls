/**
 * Convert a DOM Range to basic markdown.
 * Handles: headings, bold, italic, links, lists, paragraphs, blockquotes, code.
 */
export function domToMarkdown(range) {
  const fragment = range.cloneContents();
  const container = document.createElement("div");
  container.appendChild(fragment);
  return nodeToMarkdown(container).trim();
}

/**
 * Get current selection as markdown.
 */
export function selectionToMarkdown() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return "";
  return domToMarkdown(selection.getRangeAt(0));
}

function nodeToMarkdown(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const tag = node.tagName.toLowerCase();
  const children = Array.from(node.childNodes)
    .map((child) => nodeToMarkdown(child))
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
    case "img": {
      const alt = node.getAttribute("alt") || "";
      const src = node.getAttribute("src") || "";
      return `![${alt}](${src})`;
    }
    case "br":
      return "\n";
    case "p":
      return `${children}\n\n`;
    case "blockquote":
      return `> ${children}\n\n`;
    case "ul":
      return Array.from(node.children)
        .map((li) => `- ${nodeToMarkdown(li)}\n`)
        .join("");
    case "ol":
      return Array.from(node.children)
        .map((li, i) => `${i + 1}. ${nodeToMarkdown(li)}\n`)
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
