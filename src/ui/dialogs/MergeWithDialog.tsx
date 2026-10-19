// FLOW-04: Merge from the selected-node bar for a term that isn't flagged as
// a possible duplicate. The user picks the term to merge it with, then
// confirms in the duplicate review (SCR-08), where they choose the name to keep.

import { useMemo, useRef, useState } from 'react';
import { mergeCandidates } from '../../core/duplicates';
import { prefixedName, termKey } from '../../core/terms';
import type { IriTerm, ProjectSettings } from '../../core/types';
import { useApp } from '../store';
import { Dialog } from './Dialog';

export function MergeWithDialog({ term, settings, onClose }: { term: IriTerm; settings: ProjectSettings; onClose: () => void }) {
  const triples = useApp((s) => s.triples);
  const openDialog = useApp((s) => s.openDialog);
  const candidates = useMemo(() => mergeCandidates(triples, term), [triples, term]);
  const [key, setKey] = useState('');
  const select = useRef<HTMLSelectElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const other = candidates.find((c) => termKey(c) === key);

  return (
    <Dialog titleId="mw-title" descId="mw-desc" initialFocus={candidates.length ? select : cancel} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (other) openDialog({ kind: 'duplicates', pair: [term, other] });
        }}
      >
        <div className="dialog-head">
          <h2 id="mw-title">Merge “{term.label}” with…</h2>
          <p id="mw-desc">
            {candidates.length
              ? 'Choose the term it is the same as. Next you choose which name to keep; nothing changes until you confirm.'
              : `There is nothing of the same kind in this graph to merge “${term.label}” with.`}
          </p>
        </div>
        {candidates.length > 0 && (
          <div className="dialog-body">
            <div className="field">
              <label htmlFor="mw-term">Merge with</label>
              <select id="mw-term" ref={select} className="input" value={key} onChange={(e) => setKey(e.target.value)}>
                <option value="">Choose a term</option>
                {candidates.map((c) => (
                  <option key={termKey(c)} value={termKey(c)}>
                    {c.label} ({prefixedName(c, settings)})
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
        <div className="dialog-foot">
          <span />
          <div className="dialog-btns">
            <button ref={cancel} type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            {candidates.length > 0 && (
              <button type="submit" className="btn primary" disabled={!other}>
                Next
              </button>
            )}
          </div>
        </div>
      </form>
    </Dialog>
  );
}
