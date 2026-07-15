import { useState, useEffect, useRef } from "react";
import { getNotes, deleteNote, deleteNotes } from "@/storage/notes";
import { getDefaultProvider } from "@/storage/providers";
import { callProvider } from "@/api/client";

export default function NotesTab() {
  const [notes, setNotes] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [prompt, setPrompt] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [docContent, setDocContent] = useState(null);
  const [adjustPrompt, setAdjustPrompt] = useState("");
  const abortRef = useRef(null);

  useEffect(() => {
    loadNotes();
    const listener = (changes, area) => {
      if (area === "local" && changes.notes) {
        loadNotes();
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  async function loadNotes() {
    const loaded = await getNotes();
    setNotes(loaded);
  }

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleExpand(id) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(notes.map((n) => n.id)));
  }

  function deselectAll() {
    setSelectedIds(new Set());
  }

  async function handleDelete(id) {
    await deleteNote(id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  async function handleDeleteSelected() {
    await deleteNotes([...selectedIds]);
    setSelectedIds(new Set());
  }

  async function handleGenerate() {
    if (!prompt.trim() || selectedIds.size === 0) return;

    const selectedNotes = notes.filter((n) => selectedIds.has(n.id));
    let fullPrompt = prompt.trim() + "\n";
    selectedNotes.forEach((note, i) => {
      fullPrompt += `\n--- Note ${i + 1}${note.sourceTitle ? ` (from: ${note.sourceTitle})` : ""} ---\n${note.text}\n`;
    });

    const provider = await getDefaultProvider();
    if (!provider) {
      setDocContent(
        "Error: No provider configured. Please add a provider in the options page.",
      );
      return;
    }

    setIsStreaming(true);
    setStreamingContent("");
    setDocContent(null);
    setAdjustPrompt("");
    abortRef.current = new AbortController();

    try {
      let full = "";
      await callProvider({
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey,
        model: provider.model,
        messages: [{ role: "user", content: fullPrompt }],
        signal: abortRef.current.signal,
        onChunk: (delta, fullText) => {
          full = fullText;
          setStreamingContent(fullText);
        },
      });
      setDocContent(full);
    } catch (err) {
      if (err.name !== "AbortError") {
        setDocContent(`Error: ${err.message}`);
      }
    } finally {
      setIsStreaming(false);
      setStreamingContent("");
      abortRef.current = null;
    }
  }

  async function handleApply() {
    if (!adjustPrompt.trim() || !docContent || isStreaming) return;

    const fullPrompt = `${adjustPrompt.trim()}\n\n--- Current Document ---\n${docContent}`;

    const provider = await getDefaultProvider();
    if (!provider) {
      setDocContent("Error: No provider configured.");
      return;
    }

    setIsStreaming(true);
    setStreamingContent("");
    abortRef.current = new AbortController();

    try {
      let full = "";
      await callProvider({
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey,
        model: provider.model,
        messages: [{ role: "user", content: fullPrompt }],
        signal: abortRef.current.signal,
        onChunk: (delta, fullText) => {
          full = fullText;
          setStreamingContent(fullText);
        },
      });
      setDocContent(full);
      setAdjustPrompt("");
    } catch (err) {
      if (err.name !== "AbortError") {
        setDocContent(`Error: ${err.message}`);
      }
    } finally {
      setIsStreaming(false);
      setStreamingContent("");
      abortRef.current = null;
    }
  }

  function handleStop() {
    abortRef.current?.abort();
  }

  function handleDownload() {
    const content = docContent || streamingContent;
    if (!content) return;
    const blob = new Blob([content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `notes-summary-${new Date().toISOString().split("T")[0]}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleNewGeneration() {
    setDocContent(null);
    setStreamingContent("");
    setAdjustPrompt("");
  }

  function handleBack() {
    setDocContent(null);
    setStreamingContent("");
    setAdjustPrompt("");
  }

  // Editor view
  if (docContent !== null || isStreaming) {
    const displayContent = docContent || streamingContent;
    return (
      <div className="notes-editor">
        <div className="notes-editor-content">
          <textarea
            className="notes-editor-textarea"
            value={displayContent}
            onChange={(e) => setDocContent(e.target.value)}
            disabled={isStreaming}
            placeholder="Generated content will appear here..."
          />
          {isStreaming && <span className="streaming-indicator" />}
        </div>
        <div className="notes-editor-prompt">
          <textarea
            className="notes-prompt"
            value={adjustPrompt}
            onChange={(e) => setAdjustPrompt(e.target.value)}
            placeholder="Ask AI to adjust the document..."
            rows={2}
            disabled={isStreaming}
          />
          <button
            className="btn btn-primary"
            onClick={handleApply}
            disabled={!adjustPrompt.trim() || isStreaming}
          >
            {isStreaming ? "Generating..." : "Apply"}
          </button>
        </div>
        <div className="notes-editor-actions">
          {!isStreaming && (
            <>
              <button className="btn btn-primary" onClick={handleDownload}>
                Download .md
              </button>
              <button
                className="btn btn-secondary"
                onClick={handleNewGeneration}
              >
                New generation
              </button>
              <button className="btn btn-secondary" onClick={handleBack}>
                Back to notes
              </button>
            </>
          )}
          {isStreaming && (
            <button className="stop-btn" onClick={handleStop}>
              Stop
            </button>
          )}
        </div>
      </div>
    );
  }

  if (notes.length === 0) {
    return (
      <div className="empty-state">
        No notes yet. Select text on a page and use the context menu to save
        notes.
      </div>
    );
  }

  return (
    <div className="notes-tab">
      <div className="notes-list">
        {notes.map((note) => (
          <div
            key={note.id}
            className={`note-item ${selectedIds.has(note.id) ? "selected" : ""}`}
          >
            <div className="note-header">
              <input
                type="checkbox"
                checked={selectedIds.has(note.id)}
                onChange={() => toggleSelect(note.id)}
                className="input-auto"
              />
              <div
                className="note-content"
                onClick={() => toggleExpand(note.id)}
              >
                <div
                  className={`note-text ${expandedIds.has(note.id) ? "" : "truncated"}`}
                >
                  {note.text}
                </div>
                {note.sourceTitle && (
                  <div className="note-source">
                    {note.sourceUrl &&
                    (note.sourceUrl.startsWith("http://") ||
                      note.sourceUrl.startsWith("https://")) ? (
                      <a
                        href={note.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {note.sourceTitle}
                      </a>
                    ) : (
                      <span>{note.sourceTitle}</span>
                    )}
                  </div>
                )}
              </div>
              <button
                className="note-delete"
                onClick={() => handleDelete(note.id)}
                title="Delete note"
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="notes-actions">
        <div className="notes-select-actions">
          <button
            className="btn btn-secondary"
            onClick={
              selectedIds.size === notes.length ? deselectAll : selectAll
            }
          >
            {selectedIds.size === notes.length ? "Deselect All" : "Select All"}
          </button>
          {selectedIds.size > 0 && (
            <button className="btn btn-danger" onClick={handleDeleteSelected}>
              Delete Selected ({selectedIds.size})
            </button>
          )}
        </div>
        <textarea
          className="notes-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Tell AI how to organize your notes..."
          rows={3}
        />
        <button
          className="btn btn-primary"
          onClick={handleGenerate}
          disabled={selectedIds.size === 0 || !prompt.trim()}
        >
          Generate ({selectedIds.size} notes)
        </button>
      </div>
    </div>
  );
}
