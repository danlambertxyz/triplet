// SCR-09: Settings. Change the base address and graph names as on the setup
// screen (ID-01, ID-04), add, edit and remove custom prefixes (PFX-04), see
// the built-in vocabularies (PFX-01), and have pairs kept as different things
// flagged again (DUP-07, added 17 Oct 2026), and accepted exceptions flagged
// again (CHK-07, Milestone 6). Nothing changes until Save.

import { useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import {
  customPrefixUses,
  graphNamesOf,
  validateCustomPrefix,
  validateGraphNames,
  withGraphNames,
  type CustomPrefixErrors,
  type GraphNames,
  type GraphNamesErrors,
} from '../../core/settings';
import { checkConformance, tripleOfException, type AcceptedException } from '../../core/conformance';
import type { DistinctPair } from '../../core/duplicates';
import { collectTerms, objectText, prefixedName } from '../../core/terms';
import type { CustomPrefix, NsKey, ProjectSettings, Triple } from '../../core/types';
import { BUILTIN_PREFIXES } from '../../core/vocab';
import { PencilIcon, TrashIcon } from '../icons';
import { Example } from '../SetupScreen';
import { newId, useApp } from '../store';
import { CloseButton, Dialog, plural } from './Dialog';

/** A custom prefix row being added or edited. */
interface RowEdit {
  id: string;
  isNew: boolean;
  prefix: string;
  namespace: string;
  errors: CustomPrefixErrors;
}

export function SettingsDialog({ settings, onClose }: { settings: ProjectSettings; onClose: () => void }) {
  const triples = useApp((s) => s.triples);
  const updateSettings = useApp((s) => s.updateSettings);
  const distinctPairs = useApp((s) => s.distinctPairs);
  const flagAgain = useApp((s) => s.flagAgain);
  const exceptions = useApp((s) => s.exceptions);
  /** Accepted exceptions that will be flagged again on Save, by index into exceptions. */
  const [unaccept, setUnaccept] = useState<Set<number>>(() => new Set());
  const termNames = useMemo(() => collectTerms(triples), [triples]);
  /** Pairs kept apart that will be flagged again on Save, by index into distinctPairs. */
  const [unflag, setUnflag] = useState<Set<number>>(() => new Set());
  const first = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<ProjectSettings>(() => ({
    ...settings,
    customPrefixes: settings.customPrefixes ?? [],
  }));
  const [names, setNames] = useState<GraphNames>(() => graphNamesOf(settings));
  /** Save was tried: empty fields are flagged too, as on the setup screen (ENT-08). */
  const [tried, setTried] = useState(false);
  const [row, setRow] = useState<RowEdit | null>(null);
  const [rowMessage, setRowMessage] = useState<{ id: string; text: string }>();

  const customs = (draft.customPrefixes ?? []).filter((c) => !c.removed);
  const setName = (key: keyof GraphNames, value: string) => {
    setNames((n) => ({ ...n, [key]: value }));
  };

  /** Applies the row being edited to the draft; false when it has problems. */
  const applyRow = (): ProjectSettings | false => {
    if (!row) return draft;
    // An untouched new row is simply dropped.
    if (row.isNew && !row.prefix.trim() && !row.namespace.trim()) {
      setRow(null);
      return draft;
    }
    const c = { prefix: row.prefix.trim(), namespace: row.namespace.trim() };
    const errs = validateCustomPrefix(c, draft, row.id);
    if (Object.keys(errs).length > 0) {
      setRow({ ...row, errors: errs });
      return false;
    }
    const list = draft.customPrefixes ?? [];
    const next: ProjectSettings = {
      ...draft,
      customPrefixes: row.isNew ? [...list, { id: row.id, ...c }] : list.map((x) => (x.id === row.id ? { ...x, ...c } : x)),
    };
    setDraft(next);
    setRow(null);
    return next;
  };

  const remove = (c: CustomPrefix) => {
    const uses = customPrefixUses(triples, c.id);
    if (uses > 0) {
      // EDIT-05: removing a prefix would leave those triples without a namespace.
      setRowMessage({ id: c.id, text: `Used in ${plural(uses, 'triple')}. Change or delete them first.` });
      return;
    }
    const saved = settings.customPrefixes?.some((x) => x.id === c.id);
    setDraft((d) => ({
      ...d,
      // A saved one is kept, marked removed, so Undo can never leave a term without its namespace.
      customPrefixes: saved
        ? (d.customPrefixes ?? []).map((x) => (x.id === c.id ? { ...x, removed: true } : x))
        : (d.customPrefixes ?? []).filter((x) => x.id !== c.id),
    }));
    setRowMessage(undefined);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next = applyRow();
    if (!next) return;
    // Namespaces are only rebuilt when the base or a name changed, so an older
    // project's namespaces stay as they are unless the user edits them.
    const before = graphNamesOf(settings);
    const changed = (Object.keys(names) as (keyof GraphNames)[]).some((k) => names[k].trim() !== before[k]);
    if (changed) {
      const errs = validateGraphNames(names, next);
      if (Object.keys(errs).length > 0) return setTried(true);
    }
    updateSettings(changed ? withGraphNames(next, names) : next);
    // One Undo step brings the choices back (EDIT-06); namespace changes aren't part of Undo.
    if (unflag.size > 0 || unaccept.size > 0) {
      flagAgain(
        distinctPairs.filter((_, i) => unflag.has(i)),
        exceptions.filter((_, i) => unaccept.has(i)),
      );
    }
    onClose();
  };

  // ENT-08: the names are checked as you type, as on the setup screen, and
  // Save is greyed out while one has a problem (agreed 17 Oct 2026). An empty
  // field is only flagged once Save is tried.
  const before = graphNamesOf(settings);
  const namesChanged = (Object.keys(names) as (keyof GraphNames)[]).some((k) => names[k].trim() !== before[k]);
  const found: GraphNamesErrors = namesChanged ? validateGraphNames(names, draft) : {};
  const namesInvalid = Object.keys(found).length > 0;
  const errors: GraphNamesErrors = {};
  for (const k of Object.keys(found) as (keyof GraphNamesErrors)[]) {
    if (tried || names[k].trim() !== '') errors[k] = found[k];
  }

  const nameInput = (key: keyof GraphNames, id: string, label: string) => (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        ref={key === 'base' ? first : undefined}
        className="input mono sm"
        value={names[key]}
        onChange={(e) => setName(key, e.target.value)}
        spellCheck={false}
        aria-invalid={!!errors[key]}
        aria-describedby={errors[key] ? `${id}-err` : undefined}
      />
      {errors[key] && (
        <div id={`${id}-err`} className="error">
          {errors[key]}
        </div>
      )}
    </div>
  );

  // Enter in a row's fields finishes that row rather than saving the pop-up.
  // Escape cancels just the row, not the whole pop-up.
  const rowKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setRow(null);
    }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    applyRow();
  };

  const editRow = (r: RowEdit) => (
    <div role="row" className="px-row editing" key={r.id}>
      <span role="cell">
        <input
          className="input mono sm"
          aria-label="Prefix"
          placeholder="e.g. fibo-fnd"
          value={r.prefix}
          autoFocus
          spellCheck={false}
          onKeyDown={rowKey}
          aria-invalid={!!r.errors.prefix}
          onChange={(e) => setRow({ ...r, prefix: e.target.value, errors: {} })}
        />
      </span>
      <span role="cell">
        <input
          className="input mono sm"
          aria-label="Namespace"
          placeholder="https://…/"
          value={r.namespace}
          spellCheck={false}
          onKeyDown={rowKey}
          aria-invalid={!!r.errors.namespace}
          onChange={(e) => setRow({ ...r, namespace: e.target.value, errors: {} })}
        />
      </span>
      <span role="cell" className="px-actions wide">
        <button type="button" className="btn xs" onClick={() => applyRow()}>
          Done
        </button>
        <button type="button" className="link-btn" onClick={() => setRow(null)}>
          Cancel
        </button>
      </span>
      {(r.errors.prefix || r.errors.namespace) && (
        <div className="px-msg">
          {r.errors.prefix && <div className="error">{r.errors.prefix}</div>}
          {r.errors.namespace && <div className="error">{r.errors.namespace}</div>}
        </div>
      )}
      {!r.isNew && customPrefixUses(triples, r.id) > 0 && (
        <p className="px-msg note">
          Used in {plural(customPrefixUses(triples, r.id), 'triple')}. Their IRIs change with it in the next export.
        </p>
      )}
    </div>
  );

  return (
    <Dialog titleId="st-title" className="settings" initialFocus={first} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <div className="dialog-head row">
          <h2 id="st-title">Settings</h2>
          <CloseButton onClick={onClose} />
        </div>
        <div className="dialog-body settings-body">
          <section aria-labelledby="st-ns" className="st-section">
            <div className="st-head">
              <h3 id="st-ns">Your namespaces</h3>
              <p>
                Each graph's namespace is the base address plus its name, and the name is also its prefix. Changing
                these updates every IRI in the next export. Your triples stay as they are.
              </p>
            </div>
            {nameInput('base', 'st-base', 'Base address')}
            <div className="row2">
              {nameInput('dataPath', 'st-data', 'Data graph name')}
              {nameInput('ontologyPath', 'st-ont', 'Ontology graph name')}
            </div>
            <Example graphName={names.dataPath} base={names.base} label="Data graph" term="Client Onboarding" />
            <Example graphName={names.ontologyPath} base={names.base} label="Ontology graph" term="Physical data element" />
          </section>

          <section aria-labelledby="st-px" className="st-section">
            <div className="st-head split">
              <div>
                <h3 id="st-px">Other vocabularies</h3>
                <p>Suggested as you type. Only the ones you use are declared in the export.</p>
              </div>
              <button
                type="button"
                className="btn xs"
                disabled={row !== null}
                onClick={() => setRow({ id: newId(), isNew: true, prefix: '', namespace: '', errors: {} })}
              >
                Add prefix
              </button>
            </div>
            <div role="table" aria-label="Prefixes" className="px-table">
              <div role="row" className="px-row head">
                <span role="columnheader">Prefix</span>
                <span role="columnheader">Namespace</span>
                <span role="columnheader">Source</span>
                <span role="columnheader">
                  <span className="sr-only">Actions</span>
                </span>
              </div>
              {row?.isNew && editRow(row)}
              {customs.map((c) =>
                row?.id === c.id ? (
                  editRow(row)
                ) : (
                  <div role="row" className="px-row" key={c.id}>
                    <span role="cell" className="mono">
                      {c.prefix}
                    </span>
                    <span role="cell" className="mono ns" title={c.namespace}>
                      {c.namespace}
                    </span>
                    <span role="cell">
                      <span className="tag">Custom</span>
                    </span>
                    <span role="cell" className="px-actions">
                      <button
                        type="button"
                        className="row-icon"
                        aria-label={`Edit ${c.prefix}`}
                        disabled={row !== null}
                        onClick={() => {
                          setRowMessage(undefined);
                          setRow({ id: c.id, isNew: false, prefix: c.prefix, namespace: c.namespace, errors: {} });
                        }}
                      >
                        <PencilIcon />
                      </button>
                      <button
                        type="button"
                        className="row-icon"
                        aria-label={`Remove ${c.prefix}`}
                        disabled={row !== null}
                        onClick={() => remove(c)}
                      >
                        <TrashIcon />
                      </button>
                    </span>
                    {rowMessage?.id === c.id && (
                      <div className="px-msg" role="alert">
                        <div className="error">{rowMessage.text}</div>
                      </div>
                    )}
                  </div>
                ),
              )}
              {BUILTIN_PREFIXES.map((b) => (
                <div role="row" className="px-row" key={b.prefix}>
                  <span role="cell" className="mono">
                    {b.prefix}
                  </span>
                  <span role="cell" className="mono ns muted" title={`${b.namespace} · ${b.usedFor}`}>
                    {b.namespace}
                  </span>
                  <span role="cell" className="builtin">
                    Built in
                  </span>
                  <span role="cell" />
                </div>
              ))}
            </div>
            <p className="st-note">
              Custom prefixes are a shorthand: type e.g. <span className="mono">fibo-fnd:Party</span> in any field. Unlike
              the built-in ones, they don't suggest terms.
            </p>
          </section>
          <KeptApart
            pairs={distinctPairs}
            unflag={unflag}
            setUnflag={setUnflag}
            names={termNames}
            settings={draft}
          />
          <AcceptedExceptions list={exceptions} triples={triples} unaccept={unaccept} setUnaccept={setUnaccept} />
        </div>
        <div className="dialog-foot end">
          <div className="dialog-btns">
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn primary" aria-disabled={namesInvalid}>
              Save
            </button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}

/**
 * DUP-07, SCR-09: pairs kept as different things in the duplicate review are
 * not flagged again. Here they can be flagged again (applied on Save, undoable).
 * Accepted exceptions (CHK-07) are meant to join this section in Milestone 6.
 */
function KeptApart({
  pairs,
  unflag,
  setUnflag,
  names,
  settings,
}: {
  pairs: readonly DistinctPair[];
  unflag: Set<number>;
  setUnflag: (s: Set<number>) => void;
  names: Map<string, { ns: NsKey; local: string; label: string }>;
  settings: ProjectSettings;
}) {
  const toggle = (i: number) => {
    const next = new Set(unflag);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setUnflag(next);
  };
  // A term no longer in the store is shown by its key's local name.
  const name = (key: string) => {
    const t = names.get(key);
    if (t) return { label: t.label, iri: prefixedName(t, settings) };
    const [ns, local] = key.split('|');
    return { label: local, iri: prefixedName({ ns: ns as NsKey, local }, settings) };
  };
  return (
    <section aria-labelledby="st-kept" className="st-section">
      <div className="st-head split">
        <div>
          <h3 id="st-kept">Kept as different things</h3>
          <p>
            Pairs you chose to keep apart in the duplicate review aren't flagged again. Flag one again to have it
            checked next time.
          </p>
        </div>
        {pairs.length > 1 && (
          <button
            type="button"
            className="btn xs quiet"
            onClick={() => setUnflag(unflag.size === pairs.length ? new Set() : new Set(pairs.map((_, i) => i)))}
          >
            {unflag.size === pairs.length ? 'Keep all apart' : 'Flag all again'}
          </button>
        )}
      </div>
      {pairs.length === 0 ? (
        <p className="st-note">None yet.</p>
      ) : (
        <ul className="kept-list" aria-label="Pairs kept as different things">
          {pairs.map(([x, y], i) => {
            const a = name(x);
            const b = name(y);
            const on = unflag.has(i);
            return (
              <li key={`${x}||${y}`} className={on ? 'off' : undefined}>
                <span>
                  “{a.label}” and “{b.label}” <span className="mono muted">{a.iri} · {b.iri}</span>
                </span>
                {on && <span className="kept-will">Flagged again on Save</span>}
                <button type="button" className="link-btn" onClick={() => toggle(i)}>
                  {on ? 'Keep apart' : 'Flag again'}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/**
 * CHK-07, SCR-09: triples accepted as exceptions in Validate mode, each with
 * Flag again (applied on Save with the pairs above, as one Undo step).
 */
function AcceptedExceptions({
  list,
  triples,
  unaccept,
  setUnaccept,
}: {
  list: readonly AcceptedException[];
  triples: readonly Triple[];
  unaccept: Set<number>;
  setUnaccept: (s: Set<number>) => void;
}) {
  const flags = useMemo(() => checkConformance(triples, list).flags, [triples, list]);
  const toggle = (i: number) => {
    const next = new Set(unaccept);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setUnaccept(next);
  };
  return (
    <section aria-labelledby="st-exceptions" className="st-section">
      <div className="st-head split">
        <div>
          <h3 id="st-exceptions">Accepted as exceptions</h3>
          <p>
            Triples you accepted in Validate mode are shown muted and not counted. Flag one again to have it counted.
          </p>
        </div>
        {list.length > 1 && (
          <button
            type="button"
            className="btn xs quiet"
            onClick={() => setUnaccept(unaccept.size === list.length ? new Set() : new Set(list.map((_, i) => i)))}
          >
            {unaccept.size === list.length ? 'Keep all accepted' : 'Flag all again'}
          </button>
        )}
      </div>
      {list.length === 0 ? (
        <p className="st-note">None yet.</p>
      ) : (
        <ul className="kept-list" aria-label="Accepted exceptions">
          {list.map((e, i) => {
            const t = tripleOfException(e, triples);
            const f = t && flags.find((x) => x.tripleId === t.id && x.kind === e.kind && x.rule === e.rule);
            const on = unaccept.has(i);
            return (
              <li key={`${e.s}|${e.p}|${e.o}|${e.kind}|${e.rule}`} className={on ? 'off' : undefined}>
                <span>
                  {t ? `${t.s.label} · ${t.p.label} · ${objectText(t.o)}` : e.s}
                  <span className="exc-reason">{f ? f.reason : 'No longer flagged.'}</span>
                </span>
                {on && <span className="kept-will">Flagged again on Save</span>}
                <button type="button" className="link-btn" onClick={() => toggle(i)}>
                  {on ? 'Keep accepted' : 'Flag again'}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
