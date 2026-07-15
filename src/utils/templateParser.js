/**
 * Parse template variables from {name:type} syntax.
 * Returns array of { name, type, options }
 *
 * Types:
 *   {name}           -> { name, type: 'text' }
 *   {name:number}    -> { name, type: 'number' }
 *   {name:textarea}  -> { name, type: 'textarea' }
 *   {name:boolean}   -> { name, type: 'boolean' }
 *   {name:a;b;c}     -> { name, type: 'select', options: ['a','b','c'] }
 *   {name:a|b|c}     -> { name, type: 'radio', options: ['a','b','c'] }
 */
export function parseVariables(template) {
  const regex = /\{([^}]+)\}/g;
  const variables = [];
  let match;

  while ((match = regex.exec(template)) !== null) {
    const full = match[1];
    const colonIndex = full.indexOf(":");
    const name = colonIndex === -1 ? full : full.substring(0, colonIndex);
    const typeStr = colonIndex === -1 ? null : full.substring(colonIndex + 1);

    if (name === "text") continue; // {text} is special, not user-editable

    let type = "text";
    let options = null;

    if (!typeStr) {
      type = "text";
    } else if (typeStr === "number") {
      type = "number";
    } else if (typeStr === "textarea") {
      type = "textarea";
    } else if (typeStr === "boolean") {
      type = "boolean";
    } else if (typeStr.includes(";")) {
      type = "select";
      options = typeStr.split(";");
    } else if (typeStr.includes("|")) {
      type = "radio";
      options = typeStr.split("|");
    } else {
      type = "text";
    }

    variables.push({ name, type, options });
  }

  return variables;
}

/**
 * Replace all {name} and {name:type} placeholders in template with values.
 * The {text} placeholder is replaced with selectedText.
 */
export function replaceVariables(template, selectedText, variableValues = {}) {
  let result = template;

  // Replace {text} or {text:anything} with selected text
  result = result.replace(/\{text[^}]*\}/g, selectedText);

  // Replace other variables
  result = result.replace(/\{([^}]+)\}/g, (match, full) => {
    const colonIndex = full.indexOf(":");
    const name = colonIndex === -1 ? full : full.substring(0, colonIndex);

    if (name === "text") return selectedText;

    const value = variableValues[name];
    if (value === undefined || value === null) return match;
    return String(value);
  });

  return result;
}
