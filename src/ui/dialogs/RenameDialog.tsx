// SCR-06, EDIT-01, ID-07: rename an entity, class or relationship everywhere
// it is used, showing the old → new IRI and label and every triple affected.
// Nothing changes until the user confirms (EDIT-07).

import { useRef, useState, type FormEvent } from 'react';
import { planRename, termUses } from '../../core/edit';
import { prefixedName, termKey } from '../../core/terms';
import type { IriTerm, ProjectSettings } from '../../core/types';
import { useApp } from '../store';
import { CloseButton, Dialog, plural, TripleRows } from './Dialog';

export function RenameDialog({
  term,
  settings,
  onClose,
}: {
  term: IriTerm;
  settings: ProjectSettings;
  onClose: () => void;
}) {
  const triples = useApp((s) => s.triples);
  const renameTerm = useApp((s) => s.renameTerm);
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(term.label);
  const [tried, setTried] = useState(false);

  const uses = termUses(triples, term);
  const n = uses.all.length;
  const plan = planRename(triples, term, name);
  // An empty field is only flagged once the user tries to rename (field checks).
  const error = !plan.ok && !plan.unchanged && (name.trim() !== '' || tried) ? plan.error : undefined;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (!plan.ok) return;
    renameTerm(plan.triples, termKey(term), termKey(plan.renamed));
    onClose();
  };

  return (
    <Dialog titleId="rn-title" descId="rn-desc" className="wide" initialFocus={input} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <div className="dialog-head row">
          <div className="dialog-head-text">
            <h2 id="rn-title">Rename “{term.label}”</h2>
            <p id="rn-desc">
              “{term.label}” is used in {plural(n, 'triple')}. Renaming it updates {n === 1 ? 'it' : 'all of them'},
              including its IRI. Nothing changes until you confirm.
            </p>
          </div>
          <CloseButton onClick={onClose} />
        </div>
        <div className="dialog-body">
          <div className="field">
            <label htmlFor="rn-new">New name</label>
            <input
              id="rn-new"
              ref={input}
              className="input lg strong"
              autoComplete="off"
              value={name}
              onFocus={(e) => e.target.select()}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={!!error}
              aria-describedby={error ? 'rn-err' : undefined}
            />
            {error && (
              <div id="rn-err" className="error">
                {error}
              </div>
            )}
          </div>

          <div className="diff">
            <span className="k">IRI</span>
            <span className="mono">
              {plan.ok ? (
                <>
                  <s>{prefixedName(term, settings)}</s> → {prefixedName(plan.renamed, settings)}
                </>
              ) : (
                prefixedName(term, settings)
              )}
            </span>
            <span className="k">Label</span>
            <span className="mono">
              {plan.ok ? (
                <>
                  <s>"{term.label}"</s> → "{plan.renamed.label}"
                </>
              ) : (
                `"${term.label}"`
              )}
            </span>
          </div>

          <section className="dgroup">
            <h3>Updates {plural(n, 'triple')}</h3>
            {plan.ok ? (
              <TripleRows triples={plan.affected} term={plan.renamed} label="Triples after renaming" />
            ) : (
              <TripleRows triples={uses.all} term={term} label="Triples that use this name" />
            )}
          </section>
        </div>
        <div className="dialog-foot">
          <span className="dialog-note">You can undo this afterwards.</span>
          <div className="dialog-btns">
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn primary" aria-disabled={!plan.ok}>
              Rename in {plural(n, 'triple')}
            </button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
