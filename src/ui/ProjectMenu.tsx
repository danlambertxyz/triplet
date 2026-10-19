// GEN-10: the project name in the top bar opens a menu with "Start a new
// project…". Nothing is cleared until the user confirms (EDIT-05).

import { useEffect, useRef, useState } from 'react';
import { plural } from './dialogs/Dialog';
import { useApp } from './store';

export function ProjectMenu({ name }: { name: string }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  // Close the menu on a click outside it.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  return (
    <div
      className="project-menu"
      ref={wrap}
      onBlur={(e) => {
        // Close when keyboard focus leaves the button and menu.
        if (!wrap.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        ref={button}
        type="button"
        className="project-name-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="project-menu"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
        }}
      >
        {name}
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div id="project-menu" className="menu" role="menu" aria-label="Project">
          <button
            type="button"
            role="menuitem"
            autoFocus
            onClick={() => {
              setOpen(false);
              setConfirming(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setOpen(false);
                button.current?.focus();
              }
            }}
          >
            Start a new project…
          </button>
        </div>
      )}
      {confirming && (
        <NewProjectDialog
          name={name}
          onClose={() => {
            setConfirming(false);
            // After the dialog has closed, which would otherwise put focus back on the gone menu item.
            requestAnimationFrame(() => button.current?.focus());
          }}
        />
      )}
    </div>
  );
}

function NewProjectDialog({ name, onClose }: { name: string; onClose: () => void }) {
  const triples = useApp((s) => s.triples);
  const resetProject = useApp((s) => s.resetProject);
  const setScreen = useApp((s) => s.setScreen);
  const ref = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);

  // A modal <dialog> keeps focus inside and closes on Escape.
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    // Start on the safe choice.
    cancel.current?.focus();
    return () => d?.close();
  }, []);

  const data = triples.filter((t) => t.graph === 'data').length;
  const ontology = triples.length - data;
  const what =
    triples.length === 0
      ? 'There are no triples yet.'
      : `This removes ${plural(data, 'triple')} in the Data graph and ${plural(ontology, 'triple')} in the Ontology graph from this browser.`;

  return (
    <dialog
      ref={ref}
      className="dialog"
      role="alertdialog"
      aria-labelledby="np-title"
      aria-describedby="np-desc"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="dialog-head">
        <h2 id="np-title">Start a new project?</h2>
        <p id="np-desc">
          {what} “{name}” and its settings are cleared too, and you go back to the setup screen. You can't undo this.
        </p>
      </div>
      <div className="dialog-foot">
        {triples.length > 0 ? (
          <button
            type="button"
            className="btn quiet"
            onClick={() => {
              onClose();
              setScreen('export');
            }}
          >
            Export first
          </button>
        ) : (
          <span />
        )}
        <div className="dialog-btns">
          <button ref={cancel} type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn danger" onClick={resetProject}>
            Start new project
          </button>
        </div>
      </div>
    </dialog>
  );
}
