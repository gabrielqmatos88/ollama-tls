import { useState } from "react";
import "./diffPopup.css";

function computeSimpleDiff(original, suggested) {
  const originalLines = original.split("\n");
  const suggestedLines = suggested.split("\n");
  const diff = [];

  const maxLen = Math.max(originalLines.length, suggestedLines.length);

  for (let i = 0; i < maxLen; i++) {
    const orig = originalLines[i];
    const sug = suggestedLines[i];

    if (orig === sug) {
      diff.push({ type: "unchanged", text: orig || "" });
    } else {
      if (orig !== undefined) {
        diff.push({ type: "removed", text: orig });
      }
      if (sug !== undefined) {
        diff.push({ type: "added", text: sug });
      }
    }
  }

  return diff;
}

export default function DiffPopup({
  original,
  suggested,
  onApply,
  onCopy,
  onClose,
}) {
  const [showDiff, setShowDiff] = useState(false);
  const diff = computeSimpleDiff(original, suggested);

  return (
    <>
      <div className="crjsx-diff-backdrop" onClick={onClose} />
      <div className="crjsx-diff-popup">
        <div className="crjsx-diff-header">
          <h3>AI Suggestion</h3>
          <button className="crjsx-diff-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="crjsx-diff-content">
          <div className="crjsx-diff-section">
            <div className="crjsx-diff-label">Original</div>
            <div className="crjsx-diff-text original">{original}</div>
          </div>

          <div className="crjsx-diff-section">
            <div className="crjsx-diff-label">Suggested</div>
            <div className="crjsx-diff-text suggested">{suggested}</div>
          </div>

          <button
            className="crjsx-diff-btn crjsx-diff-btn-cancel"
            onClick={() => setShowDiff(!showDiff)}
            style={{ marginBottom: 12 }}
          >
            {showDiff ? "Hide" : "Show"} Diff
          </button>

          {showDiff && (
            <div className="crjsx-diff-changes">
              {diff.map((line, i) => (
                <div key={i} className={`crjsx-diff-line ${line.type}`}>
                  {line.type === "added"
                    ? "+ "
                    : line.type === "removed"
                      ? "- "
                      : "  "}
                  {line.text}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="crjsx-diff-actions">
          <button
            className="crjsx-diff-btn crjsx-diff-btn-cancel"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="crjsx-diff-btn crjsx-diff-btn-copy"
            onClick={onCopy}
          >
            Copy
          </button>
          <button
            className="crjsx-diff-btn crjsx-diff-btn-apply"
            onClick={onApply}
          >
            Apply
          </button>
        </div>
      </div>
    </>
  );
}
