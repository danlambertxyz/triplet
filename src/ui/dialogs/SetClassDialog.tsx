// TYPE-08 (agreed 16 Oct 2026): "Set class" on the selected-node bar gives an
// existing Data graph node a class, writing "x type Class" (as TYPE-02). Any
// other class the node had is replaced, and the pop-up shows that first (EDIT-05).

import { useMemo, useRef, useState } from 'react';
import { planSetClass } from '../../core/edit';
import { termKey } from '../../core/terms';
import type { IriTerm } from '../../core/types';
import { pickerClasses } from '../../core/typing';
import { useApp } from '../store';
import { Dialog, TripleRows } from './Dialog';

export function SetClassDialog({ term, onClose }: { term: IriTerm; onClose: () => void }) {
  const triples = useApp((s) => s.triples);
  const setClass = useApp((s) => s.setClass);
  const classes = useMemo(() => pickerClasses(triples), [triples]);
  const select = useRef<HTMLSelectElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  // Start on the class the node has now, if any.
  const current = useMemo(() => {
    const has = planSetClass(triples, term, term).remove.map((t) => t.o);
    return classes.find((c) => has.some((o) => o.kind === 'iri' && termKey(o) === termKey(c)));
  }, [classes, triples, term]);
  const [key, setKey] = useState(current ? termKey(current) : '');
  const chosen = classes.find((c) => termKey(c) === key);
  const plan = chosen ? planSetClass(triples, term, chosen) : undefined;
  const changes = !!plan && (plan.add !== undefined || plan.remove.length > 0);

  return (
    <Dialog
      titleId="sc-title"
      descId="sc-desc"
      initialFocus={classes.length ? select : cancel}
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!plan || !changes) return;
          setClass(
            plan.remove.map((t) => t.id),
            plan.add,
          );
          onClose();
        }}
      >
        <div className="dialog-head">
          <h2 id="sc-title">Set the class of “{term.label}”</h2>
          <p id="sc-desc">
            {classes.length
              ? `Says what kind of thing “${term.label}” is, by adding “${term.label} · type · ${chosen?.label ?? 'class'}” to the Data graph. It applies to “${term.label}” in every triple it's in.`
              : 'There are no classes yet. Add one on the Ontology tab by ticking “Class” beside the subject.'}
          </p>
        </div>
        {classes.length > 0 && (
          <div className="dialog-body">
            <div className="field">
              <label htmlFor="sc-class">Class</label>
              <select id="sc-class" ref={select} className="input" value={key} onChange={(e) => setKey(e.target.value)}>
                {!current && <option value="">Choose a class</option>}
                {classes.map((c) => (
                  <option key={termKey(c)} value={termKey(c)}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            {plan && plan.remove.length > 0 && (
              <section className="dgroup">
                <h3>Replaces</h3>
                <TripleRows triples={plan.remove} term={term} label="Type triples that are replaced" />
              </section>
            )}
            {plan && !changes && <p className="dialog-note">{term.label} already has this class.</p>}
          </div>
        )}
        <div className="dialog-foot">
          <span className="dialog-note">{changes ? 'You can undo this afterwards.' : ''}</span>
          <div className="dialog-btns">
            <button ref={cancel} type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            {classes.length > 0 && (
              <button type="submit" className="btn primary" disabled={!changes}>
                Set class
              </button>
            )}
          </div>
        </div>
      </form>
    </Dialog>
  );
}
