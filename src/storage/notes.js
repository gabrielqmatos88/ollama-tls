const STORAGE_KEY = "notes";

export async function getNotes() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const notes = result[STORAGE_KEY] || [];
  return notes.sort((a, b) => b.createdAt - a.createdAt);
}

export async function addNote({ text, sourceUrl, sourceTitle }) {
  const notes = await getNotes();
  const note = {
    id: crypto.randomUUID(),
    text,
    sourceUrl: sourceUrl || "",
    sourceTitle: sourceTitle || "",
    createdAt: Date.now(),
  };
  notes.push(note);
  await chrome.storage.local.set({ [STORAGE_KEY]: notes });
  return note;
}

export async function saveNotes(notes) {
  await chrome.storage.local.set({ [STORAGE_KEY]: notes });
}

export async function deleteNote(id) {
  const notes = await getNotes();
  await chrome.storage.local.set({
    [STORAGE_KEY]: notes.filter((n) => n.id !== id),
  });
}

export async function deleteNotes(ids) {
  const notes = await getNotes();
  const idSet = new Set(ids);
  await chrome.storage.local.set({
    [STORAGE_KEY]: notes.filter((n) => !idSet.has(n.id)),
  });
}
