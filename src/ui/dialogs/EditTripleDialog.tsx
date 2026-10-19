// SCR-05, EDIT-02: change one triple's subject, predicate or object in place.
// Only that triple changes; the pop-up points to Rename for changing a name
// everywhere (EDIT-08). Same field checks (ENT-08) and the same dropdowns of
// existing terms (ENT-03) as the entry form.

import { useMemo, useRef, useState, type FormEvent } from 'react';
import { canRename, draftFromTriple, planEdit, type EditDraft } from '../../core/edit';
import { literalPreview, type EntryField } from '../../core/entry';
import { suggest, type SuggestField } from '../../core/suggest';
import { collectTerms, termKey } from '../../core/terms';
import type { IriTerm, ProjectSettings, Triple } from '../../core/types';
import { ObjectInput, ObjectKindToggle, TermHint } from '../fields';
import { FlagItem } from '../FlagItem';
import { useApp } from '../store';
import { TermCombobox } from '../TermCombobox';
import { useConformance } from '../useConformance';
import { CloseButton, Dialog } from './Dialog';

const GRAPH_TITLE = { data: 'Data graph', ontology: 'Ontology graph' } as const;

export function EditTripleDialog({
  triple,
  settings,
  onClose,
}: {
  triple: Triple;
  settings: ProjectSettings;
  onClose: () => void;
}) {
  const triples = useApp((s) => s.triples);
  const replaceTriple = useApp((s) => s.replaceTriple);
  const deleteTriple = useApp((s) => s.deleteTriple);
  const openDialog = useApp((s) => s.openDialog);
  const first = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<EditDraft>(() => draftFromTriple(triple, triples, settings));
  const [shown, setShown] = useState<Partial<Record<EntryField, string>>>({});
  const [message, setMessage] = useState<string>();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const flags = useConformance()?.byTriple.get(triple.id);

  const known = useMemo(() => collectTerms(triples), [triples]);
  const result = useMemo(() => planEdit(triples, triple, draft, settings), [triples, triple, draft, settings]);
  // Suggestions from the store without this triple, as if typing it afresh.
  const others = useMemo(() => triples.filter((t) => t.id !== triple.id), [triples, triple.id]);
  const pTerm = result.preview.predicate;
  const options = useMemo(() => {
    const of = (field: SuggestField) =>
      suggest({ field, graph: triple.graph, text: draft[field], triples: others, settings, predicate: pTerm });
    return { subject: of('subject'), predicate: of('predicate'), object: of('object') };
  }, [others, settings, triple.graph, draft.subject, draft.predicate, draft.object, pTerm]);

  // Field checks as in the entry form: errors show once a field has content;
  // empty fields are flagged on Save.
  const errors: Partial<Record<EntryField, string>> = { ...shown };
  for (const f of ['subject', 'predicate', 'object'] as const) {
    if (draft[f].trim() !== '' && result.errors[f]) errors[f] = result.errors[f];
  }

  const set = <K extends keyof EditDraft>(key: K, value: EditDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    const field: EntryField = key === 'subject' ? 'subject' : key === 'predicate' ? 'predicate' : 'object';
    setShown((e) => ({ ...e, [field]: undefined }));
    setMessage(undefined);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (result.unchanged) return;
    if (Object.keys(result.errors).length > 0) return setShown(result.errors);
    if (!result.triple) return setMessage(result.message);
    replaceTriple(triple.id, result.triple);
    onClose();
  };

  const hint = (term: IriTerm | undefined) => (
    <TermHint term={term} triples={triples} known={known} settings={settings} />
  );

  const field = (f: 'subject' | 'predicate', label: string) => (
    <div className="field">
      <label htmlFor={`et-${f}`}>{label}</label>
      <TermCombobox
        id={`et-${f}`}
        inputRef={f === 'subject' ? first : undefined}
        value={draft[f]}
        onChange={(v) => set(f, v)}
        suggestions={options[f]}
        invalid={!!errors[f]}
        describedBy={errors[f] ? `et-${f}-err` : undefined}
      />
      {errors[f] ? (
        <div id={`et-${f}-err`} className="error">
          {errors[f]}
        </div>
      ) : (
        hint(result.preview[f])
      )}
    </div>
  );

  // EDIT-02 points to Rename for changing a name everywhere; these open it for this triple's own terms.
  const renameable = [triple.s, triple.p, ...(triple.o.kind === 'iri' ? [triple.o] : [])].filter(
    (t, i, all) => canRename(t) && all.findIndex((x) => termKey(x) === termKey(t)) === i,
  );

  return (
    <Dialog titleId="et-title" className="wide" initialFocus={first} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <div className="dialog-head row">
          <h2 id="et-title">Edit triple</h2>
          <CloseButton onClick={onClose} />
        </div>
        <div className="dialog-body">
          <div className={`strip${triple.graph === 'ontology' ? ' inverted' : ''}`}>
            <span className="t1">In {GRAPH_TITLE[triple.graph]}</span>
            <span className="t2">
              {settings[triple.graph].prefix}: {settings[triple.graph].namespace}
            </span>
          </div>

          {/* Validate mode: the triple's flags, with their fixes (CHK-06, agreed 18 Oct 2026). */}
          {flags && flags.length > 0 && (
            <ul className="sel-flags dialog-flags" aria-label="Flags on this triple">
              {flags.map((f) => (
                <FlagItem key={`${f.kind}|${f.rule}`} triple={triple} flag={f} />
              ))}
            </ul>
          )}

          {field('subject', 'Subject')}
          {field('predicate', 'Predicate')}

          <div className="field">
            <div className="label-row">
              <label htmlFor="et-object">Object</label>
              <ObjectKindToggle
                kind={draft.objectKind}
                onChange={(k) => {
                  set('objectKind', k);
                  set('object', '');
                }}
              />
            </div>
            <ObjectInput
              id="et-object"
              kind={draft.objectKind}
              value={draft.object}
              datatype={draft.datatype}
              onValue={(v) => set('object', v)}
              onDatatype={(dt) => set('datatype', dt)}
              suggestions={options.object}
              invalid={!!errors.object}
            />
            {errors.object ? (
              <div id="et-object-err" className="error">
                {errors.object}
              </div>
            ) : result.preview.literal ? (
              <div className="hint">{literalPreview(result.preview.literal)}</div>
            ) : (
              hint(result.preview.object)
            )}
          </div>

          {message && (
            <div className="error" role="alert">
              {message}
            </div>
          )}

          <div className="dialog-note-block">
            <p>This changes only this one triple. To change a name everywhere it appears, use Rename instead.</p>
            {renameable.length > 0 && (
              <div className="rename-links">
                {renameable.map((t) => (
                  <button
                    key={termKey(t)}
                    type="button"
                    className="link-btn"
                    onClick={() => openDialog({ kind: 'rename', term: t })}
                  >
                    Rename “{t.label}”…
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="dialog-foot">
          {confirmDelete ? (
            <div className="inline-confirm" role="group" aria-label="Delete this triple?">
              <span>Delete this triple?</span>
              <button type="button" className="btn xs" autoFocus onClick={() => setConfirmDelete(false)}>
                Keep
              </button>
              <button
                type="button"
                className="btn xs danger"
                onClick={() => {
                  deleteTriple(triple.id);
                  onClose();
                }}
              >
                Delete
              </button>
            </div>
          ) : (
            <button type="button" className="link-btn" onClick={() => setConfirmDelete(true)}>
              Delete triple
            </button>
          )}
          <div className="dialog-btns">
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn primary"
              aria-disabled={result.unchanged || Object.keys(result.errors).length > 0 || !result.triple}
            >
              Save changes
            </button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
