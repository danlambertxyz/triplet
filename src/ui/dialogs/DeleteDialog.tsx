// SCR-07, EDIT-04/05: deleting an entity lists every triple that uses it, as
// subject and as object (and as a relationship, for a predicate). Nothing is
// removed until the user confirms; Cancel is the default button.

import { useRef } from 'react';
import { termUses } from '../../core/edit';
import { objectText } from '../../core/terms';
import type { IriTerm, Triple } from '../../core/types';
import { useApp } from '../store';
import { Dialog, plural, TripleRows } from './Dialog';

export function DeleteTermDialog({ term, onClose }: { term: IriTerm; onClose: () => void }) {
  const triples = useApp((s) => s.triples);
  const deleteTriples = useApp((s) => s.deleteTriples);
  const cancel = useRef<HTMLButtonElement>(null);
  const uses = termUses(triples, term);
  const n = uses.all.length;
  const name = term.label;
  const groups: [string, Triple[]][] = [
    [`“${name}” as subject`, uses.asSubject],
    [`“${name}” as object`, uses.asObject],
    [`“${name}” as relationship`, uses.asPredicate],
  ];

  return (
    <Dialog titleId="del-title" descId="del-desc" role="alertdialog" className="wide" initialFocus={cancel} onClose={onClose}>
      <div className="dialog-head">
        <h2 id="del-title">Delete “{name}”?</h2>
        <p id="del-desc">
          “{name}” is used in {plural(n, 'triple')}. Deleting it removes {n === 1 ? 'it' : 'all of them'}. Nothing is
          removed until you confirm.
        </p>
      </div>
      <div className="dialog-body">
        {groups
          .filter(([, rows]) => rows.length > 0)
          .map(([title, rows]) => (
            <section key={title} className="dgroup">
              <h3>
                {title} · {rows.length}
              </h3>
              <TripleRows triples={rows} term={term} label={title} />
            </section>
          ))}
      </div>
      <div className="dialog-foot">
        <span className="dialog-note">You can undo this afterwards.</span>
        <div className="dialog-btns">
          <button ref={cancel} type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn danger"
            onClick={() => {
              deleteTriples(uses.all.map((t) => t.id));
              onClose();
            }}
          >
            Delete “{name}” and {plural(n, 'triple')}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

/** EDIT-03: deleting one triple, e.g. a literal from the selected-node bar. */
export function DeleteTripleDialog({ triple, onClose }: { triple: Triple; onClose: () => void }) {
  const deleteTriple = useApp((s) => s.deleteTriple);
  const cancel = useRef<HTMLButtonElement>(null);
  return (
    <Dialog titleId="delt-title" descId="delt-desc" role="alertdialog" initialFocus={cancel} onClose={onClose}>
      <div className="dialog-head">
        <h2 id="delt-title">Delete this triple?</h2>
        <p id="delt-desc">
          This removes one triple from the {triple.graph === 'data' ? 'Data' : 'Ontology'} graph. Nothing is removed
          until you confirm.
        </p>
      </div>
      <div className="dialog-body">
        <TripleRows triples={[triple]} label="Triple to delete" />
      </div>
      <div className="dialog-foot">
        <span className="dialog-note">You can undo this afterwards.</span>
        <div className="dialog-btns">
          <button ref={cancel} type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn danger"
            aria-label={`Delete ${triple.s.label} · ${triple.p.label} · ${objectText(triple.o)}`}
            onClick={() => {
              deleteTriple(triple.id);
              onClose();
            }}
          >
            Delete triple
          </button>
        </div>
      </div>
    </Dialog>
  );
}
