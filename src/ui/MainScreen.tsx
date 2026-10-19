// SCR-02 / SCR-03: entry form and triple list on the left, graph on the right.

import { useEffect } from 'react';
import type { ProjectSettings } from '../core/types';
import { Dialogs } from './dialogs/Dialogs';
import { EntryForm } from './EntryForm';
import { GraphPanel } from './graph/GraphPanel';
import { DownloadIcon, HelpIcon, RedoIcon, SettingsIcon, UndoIcon } from './icons';
import { InfoPopover } from './InfoPopover';
import { ProjectMenu } from './ProjectMenu';
import { useApp } from './store';
import { TripleList } from './TripleList';

export function MainScreen({ settings }: { settings: ProjectSettings }) {
  const hasTriples = useApp((s) => s.triples.length > 0);
  const saveFailed = useApp((s) => s.saveFailed);
  const setScreen = useApp((s) => s.setScreen);
  const collapsed = useApp((s) => s.panelCollapsed);
  const canUndo = useApp((s) => s.history.past.length > 0);
  const canRedo = useApp((s) => s.history.future.length > 0);
  const undo = useApp((s) => s.undo);
  const redo = useApp((s) => s.redo);
  const openDialog = useApp((s) => s.openDialog);
  const mode = useApp((s) => s.mode);
  const setMode = useApp((s) => s.setMode);

  // EDIT-06 shortcuts: Cmd/Ctrl+Z and Shift+Cmd/Ctrl+Z (or Ctrl+Y). Text fields
  // keep their own undo, and nothing happens while a pop-up is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      const isRedo = (key === 'z' && e.shiftKey) || (key === 'y' && !e.shiftKey);
      if (key !== 'z' && !isRedo) return;
      const el = e.target as HTMLElement | null;
      if (el?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (document.querySelector('dialog[open]')) return;
      e.preventDefault();
      if (isRedo) redo();
      else undo();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  return (
    <div className="app main-app">
      <header className="topbar">
        <div className="topbar-title">
          <div className="brand">Triplet</div>
          <ProjectMenu name={settings.name} />
          {saveFailed ? (
            <div className="save-state failed" role="alert">
              Not saved: this browser is blocking or out of local storage
            </div>
          ) : (
            <div className="save-state">Saved locally</div>
          )}
        </div>
        <div className="mode">
          <span className="mode-label" id="mode-label">
            Mode
          </span>
          {/* MODE-01–05: Sketch (default) checks nothing; Validate flags what doesn't fit the Ontology graph. */}
          <div className="seg" role="group" aria-labelledby="mode-label">
            <button type="button" aria-pressed={mode === 'sketch'} onClick={() => setMode('sketch')}>
              Sketch
            </button>
            <button type="button" aria-pressed={mode === 'validate'} onClick={() => setMode('validate')}>
              Validate
            </button>
          </div>
          <ModeHelp />
        </div>
        {/* EDIT-06: step back and forward through changes. */}
        <div className="icon-group">
          <button type="button" aria-label="Undo" title="Undo (⌘Z)" disabled={!canUndo} onClick={undo}>
            <UndoIcon />
          </button>
          <button type="button" aria-label="Redo" title="Redo (⇧⌘Z)" disabled={!canRedo} onClick={redo}>
            <RedoIcon />
          </button>
        </div>
        {/* The user guide (added 17 Oct 2026). */}
        <button type="button" className="icon-btn" aria-label="Help" title="Help" onClick={() => openDialog({ kind: 'help' })}>
          <HelpIcon />
        </button>
        {/* SCR-09: settings (namespaces, prefixes, pairs kept apart). */}
        <button
          type="button"
          className="icon-btn"
          aria-label="Settings"
          title="Settings"
          onClick={() => openDialog({ kind: 'settings' })}
        >
          <SettingsIcon />
        </button>
        <button type="button" className="btn primary sm" disabled={!hasTriples} onClick={() => setScreen('export')}>
          {hasTriples && <DownloadIcon />}
          Export .ttl
        </button>
      </header>

      <main className="split">
        {/* Hidden rather than removed, so half-typed entries survive collapsing. */}
        <section className="left" id="entry-panel" aria-label="Entry and review" hidden={collapsed}>
          <EntryForm settings={settings} />
          <TripleList settings={settings} />
        </section>
        <section className="right" aria-label="Graph view">
          <GraphPanel settings={settings} />
        </section>
      </main>
      <Dialogs settings={settings} />
    </div>
  );
}

/** MODE-05, FLOW-09: what Sketch and Validate do, in plain language. */
function ModeHelp() {
  return (
    <InfoPopover label="About Sketch and Validate" title="Sketch and Validate">
      <dl>
        <dt>Sketch</dt>
        <dd>Type anything. Nothing is checked against your ontology. This is the default.</dd>
        <dt>Validate</dt>
        <dd>
          Your Ontology graph is the reference. Data graph triples that don't fit it (the wrong class for a
          relationship's domain or range, the wrong kind of literal, a relationship the ontology doesn't declare, or
          two values for a “functional” relationship) are flagged with a reason. Nothing is ever blocked or changed.
        </dd>
      </dl>
      <p>
        Switching modes never changes your triples. Flags you accept as exceptions are kept when you switch back.
        Checking against an uploaded ontology is coming soon.
      </p>
    </InfoPopover>
  );
}
