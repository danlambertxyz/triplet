// EDIT-06: Undo and Redo step through snapshots of the triple store (and the
// pairs kept as different things, DUP-07). Each
// change (adding, editing, renaming, deleting, setting a class) records the
// store as it was before. Snapshots share unchanged triples, so they are cheap.
// The history lives for this visit only (agreed 16 Oct 2026); it isn't saved.

export interface History<T> {
  past: T[];
  future: T[];
}

/** Oldest steps are forgotten beyond this. */
export const HISTORY_LIMIT = 100;

export function emptyHistory<T>(): History<T> {
  return { past: [], future: [] };
}

/** Records `before` as the step to undo to; a new change clears the redo steps. */
export function record<T>(h: History<T>, before: T): History<T> {
  return { past: [...h.past, before].slice(-HISTORY_LIMIT), future: [] };
}

/** Steps back: returns the state to show and the new history, or undefined when there's nothing to undo. */
export function undo<T>(h: History<T>, present: T): { present: T; history: History<T> } | undefined {
  if (h.past.length === 0) return undefined;
  return {
    present: h.past[h.past.length - 1],
    history: { past: h.past.slice(0, -1), future: [present, ...h.future] },
  };
}

export function redo<T>(h: History<T>, present: T): { present: T; history: History<T> } | undefined {
  if (h.future.length === 0) return undefined;
  return {
    present: h.future[0],
    history: { past: [...h.past, present].slice(-HISTORY_LIMIT), future: h.future.slice(1) },
  };
}
