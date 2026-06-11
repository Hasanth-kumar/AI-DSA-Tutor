import { marked } from "marked";
import { useMemo } from "react";
import type { ProblemNote } from "../types/api.js";

interface Props {
  note: ProblemNote;
}

/** Renders the user's own Obsidian note next to a problem (2.3). */
export function ProblemNotePanel({ note }: Props) {
  const html = useMemo(
    () => marked.parse(note.contentPlain, { async: false }),
    [note.contentPlain],
  );

  return (
    <div className="problem-note">
      <div className="problem-note-header">
        <span className="problem-note-title">📓 Your note: {note.title}</span>
        <span className="problem-note-path muted">{note.path}</span>
      </div>
      <div
        className="problem-note-body"
        // Local-only content from the user's own vault.
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
