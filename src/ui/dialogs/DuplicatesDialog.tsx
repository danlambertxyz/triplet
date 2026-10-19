// SCR-08, DUP-03–07: the duplicate review. Each set of possible duplicates is
// shown side by side with the triples that use them and why they were
// flagged; the user picks what happens, or skips it with "Decide later".
// Nothing changes until they confirm (EDIT-05, EDIT-07), and every choice is
// one Undo step (EDIT-06).

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { subjectColours, UNTYPED_COLOUR } from '../../core/colours';
import {
  chosenPair,
  extraCopies,
  findDuplicates,
  planMerge,
  planRemove,
  planSameAs,
  type DuplicateSet,
  type TermPair,
  type TripleSet,
} from '../../core/duplicates';
import { termUses } from '../../core/edit';
import { prefixedName, sameTerm, termKey } from '../../core/terms';
import type { IriTerm, ProjectSettings, Triple } from '../../core/types';
import { inferOntologyTyping } from '../../core/typing';
import { RDF_TYPE } from '../../core/vocab';
import { useApp } from '../store';
import { CloseButton, Dialog, plural, TripleRows } from './Dialog';

/** Every flagged set, derived from the store (DUP-01, DUP-07). */
export function useDuplicates(): DuplicateSet[] {
  const triples = useApp((s) => s.triples);
  const distinct = useApp((s) => s.distinctPairs);
  return useMemo(() => findDuplicates(triples, distinct), [triples, distinct]);
}

type Choice = 'merge' | 'remove' | 'sameAs' | 'distinct';

export function DuplicatesDialog({
  settings,
  focus,
  pair,
  onClose,
}: {
  settings: ProjectSettings;
  /** Key of the set to open at. */
  focus?: string;
  /** Two terms picked with Merge in the selected-node bar (FLOW-04). */
  pair?: [IriTerm, IriTerm];
  onClose: () => void;
}) {
  const triples = useApp((s) => s.triples);
  const flagged = useDuplicates();
  // A chosen pair that is also flagged is reviewed as flagged, with its reason.
  const [chosen] = useState(() => (pair ? chosenPair(triples, pair[0], pair[1]) : undefined));
  const sets: DuplicateSet[] = chosen ? (flagged.some((s) => s.key === chosen.key) ? flagged : [chosen]) : flagged;
  const [index, setIndex] = useState(() => {
    const k = chosen?.key ?? focus;
    return Math.max(0, sets.findIndex((s) => s.key === k));
  });
  // A resolved set drops out of the list, so the same index shows the next one.
  const i = Math.min(index, sets.length - 1);
  const set = sets[i];
  // Nothing left to review (e.g. undone elsewhere): close.
  useEffect(() => {
    if (!set) onClose();
  }, [set, onClose]);
  if (!set) return null;
  const isLast = i === sets.length - 1;
  const next = () => (isLast ? onClose() : setIndex(i + 1));
  // A resolved set drops out of the list, so this same index now shows the
  // next one; after the last one, or a pair picked with Merge, the review ends.
  const afterResolve = () => {
    if (chosen || isLast) onClose();
  };

  return (
    <Dialog titleId="dup-title" descId="dup-desc" className="dup" onClose={onClose}>
      <div className="dialog-head row">
        <div className="dialog-head-text">
          <h2 id="dup-title">{set.kind === 'triples' ? 'Repeated triple' : set === chosen ? 'Merge' : 'Possible duplicate'}</h2>
          <p id="dup-desc">
            {set.kind === 'terms' ? set.reason : `The same triple was entered ${set.triples.length} times.`}
          </p>
        </div>
        <div className="dup-nav">
          <span className="dup-count">
            {i + 1} of {sets.length}
          </span>
          <div className="icon-group">
            <button type="button" aria-label="Previous duplicate" disabled={i === 0} onClick={() => setIndex(i - 1)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <button type="button" aria-label="Next duplicate" disabled={isLast} onClick={() => setIndex(i + 1)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </div>
          <CloseButton onClick={onClose} />
        </div>
      </div>
      {set.kind === 'terms' ? (
        <TermPairReview
          key={set.key}
          set={set}
          settings={settings}
          isLast={isLast}
          onLater={next}
          onDone={afterResolve}
        />
      ) : (
        <TripleSetReview key={set.key} set={set} isLast={isLast} onLater={next} onDone={afterResolve} />
      )}
    </Dialog>
  );
}

function Foot({
  isLast,
  label,
  danger,
  disabled,
  onLater,
  onConfirm,
}: {
  isLast: boolean;
  label: string;
  danger?: boolean;
  disabled?: boolean;
  onLater: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="dialog-foot">
      <span className="dialog-note">You can undo this afterwards.</span>
      <div className="dialog-btns">
        <button type="button" className="btn" onClick={onLater}>
          Decide later
        </button>
        <button type="button" className={`btn ${danger ? 'danger' : 'primary'}`} disabled={disabled} onClick={onConfirm}>
          {isLast ? label : `${label} and go to next`}
        </button>
      </div>
    </div>
  );
}

/** DUP-03: one term with its class, IRI and the triples that use it. */
function TermCard({
  term,
  triples,
  colours,
  settings,
}: {
  term: IriTerm;
  triples: readonly Triple[];
  colours: Map<string, string>;
  settings: ProjectSettings;
}) {
  const uses = termUses(triples, term);
  const colour = term.ns === 'data' ? (colours.get(termKey(term)) ?? UNTYPED_COLOUR) : undefined;
  const kind = useMemo(() => kindOf(triples, term), [triples, term]);
  return (
    <section className="dup-card" aria-label={term.label}>
      <div className="dup-card-head">
        <span className="dup-kind">
          {colour && <span className="dot" style={{ background: colour }} aria-hidden="true" />}
          {kind}
        </span>
        <span className="dup-name">{term.label}</span>
        <span className="dup-iri">{prefixedName(term, settings)}</span>
      </div>
      <div className="dup-card-body">
        <span className="dup-used">Used in {plural(uses.all.length, 'triple')}</span>
        <TripleRows triples={uses.all} term={term} label={`Triples that use “${term.label}”`} />
      </div>
    </section>
  );
}

/** What kind of term this is, for the card's heading: its class, or Class / Relationship. */
function kindOf(triples: readonly Triple[], term: IriTerm): string {
  const typeKey = termKey(RDF_TYPE);
  const classes = triples
    .filter((t) => t.graph === 'data' && termKey(t.p) === typeKey && sameTerm(t.s, term) && t.o.kind === 'iri')
    .map((t) => (t.o as IriTerm).label);
  if (classes.length) return classes.join(', ');
  if (triples.some((t) => sameTerm(t.p, term))) return 'Relationship';
  if (inferOntologyTyping(triples).classes.some((c) => sameTerm(c, term))) return 'Class';
  return term.ns === 'data' ? 'No class' : 'Term';
}

function TermPairReview({
  set,
  settings,
  isLast,
  onLater,
  onDone,
}: {
  set: TermPair;
  settings: ProjectSettings;
  isLast: boolean;
  onLater: () => void;
  onDone: () => void;
}) {
  const triples = useApp((s) => s.triples);
  const mergeTerms = useApp((s) => s.mergeTerms);
  const deleteTriples = useApp((s) => s.deleteTriples);
  const linkTriple = useApp((s) => s.linkTriple);
  const keepDistinct = useApp((s) => s.keepDistinct);
  const { a, b } = set;
  const [choice, setChoice] = useState<Choice>('merge');
  const [keepName, setKeepName] = useState(a.label);
  const [keepKey, setKeepKey] = useState(termKey(a));

  const merge = useMemo(() => planMerge(triples, a, b, keepName), [triples, a, b, keepName]);
  const colours = useMemo(() => subjectColours(triples), [triples]);
  const keptTerm = keepKey === termKey(b) ? b : a;
  const dropped = keptTerm === a ? b : a;
  const removed = useMemo(() => planRemove(triples, dropped), [triples, dropped]);
  const link = useMemo(() => planSameAs(triples, a, b), [triples, a, b]);
  // The term whose name isn't kept, as planMerge decides it.
  const other = keepName === b.label ? a : b;
  const moved = merge.ok ? merge.moved : termUses(triples, other).all.length;

  const confirm = () => {
    if (choice === 'merge') {
      if (!merge.ok) return;
      mergeTerms(merge.triples, [termKey(a), termKey(b)], termKey(merge.survivor));
    } else if (choice === 'remove') {
      deleteTriples(removed.map((t) => t.id));
    } else if (choice === 'sameAs') {
      linkTriple(link);
    } else {
      keepDistinct(termKey(a), termKey(b));
    }
    onDone();
  };

  const label = {
    merge: 'Merge',
    remove: `Remove “${dropped.label}” and ${plural(removed.length, 'triple')}`,
    sameAs: 'Link them',
    distinct: 'Keep both',
  }[choice];

  return (
    <>
      <div className="dialog-body dup-body">
        <div className="dup-cards">
          <TermCard term={a} triples={triples} colours={colours} settings={settings} />
          <TermCard term={b} triples={triples} colours={colours} settings={settings} />
        </div>
        <fieldset className="dup-choices">
          <legend>What should happen?</legend>
          <ChoiceCard id="merge" choice={choice} setChoice={setChoice} title="Merge into one">
            <span className="t2">
              Moves the {plural(moved, 'triple')} on “{other.label}” onto the one you keep.
              Identical triples are combined.
            </span>
            <span className="dup-inline">
              <span aria-hidden="true">Keep the name</span>
              <select
                aria-label="Name to keep"
                className="input sm"
                value={keepName}
                onChange={(e) => setKeepName(e.target.value)}
              >
                <option value={a.label}>{a.label}</option>
                <option value={b.label}>{b.label}</option>
              </select>
              {merge.ok && <span className="dup-iri">{prefixedName(merge.survivor, settings)}</span>}
            </span>
            {!merge.ok && choice === 'merge' && <span className="error">{merge.error}</span>}
          </ChoiceCard>

          <ChoiceCard id="remove" choice={choice} setChoice={setChoice} title="Keep one, remove the other">
            <span className="t2">
              Deletes one of them and every triple that uses it. You'll see the list before anything is removed.
            </span>
            {choice === 'remove' && (
              <>
                <span className="dup-inline">
                  <span aria-hidden="true">Keep</span>
                  <select aria-label="Term to keep" className="input sm" value={keepKey} onChange={(e) => setKeepKey(e.target.value)}>
                    <option value={termKey(a)}>{a.label}</option>
                    <option value={termKey(b)}>{b.label}</option>
                  </select>
                </span>
                <span className="t2">
                  Removes “{dropped.label}” and {removed.length === 1 ? 'this triple' : `these ${removed.length} triples`}:
                </span>
                <TripleRows triples={removed} term={dropped} label={`Triples removed with “${dropped.label}”`} />
              </>
            )}
          </ChoiceCard>

          <ChoiceCard id="sameAs" choice={choice} setChoice={setChoice} title="Keep both and mark them as the same thing">
            <span className="t2">
              Keeps both and adds a link between them <span className="mono">({prefixedName(link.p, settings)})</span>.
            </span>
          </ChoiceCard>

          <ChoiceCard id="distinct" choice={choice} setChoice={setChoice} title="Keep both as different things">
            <span className="t2">Nothing changes, and this pair won't be flagged again.</span>
          </ChoiceCard>
        </fieldset>
      </div>
      <Foot
        isLast={isLast}
        label={label}
        danger={choice === 'remove'}
        disabled={choice === 'merge' && !merge.ok}
        onLater={onLater}
        onConfirm={confirm}
      />
    </>
  );
}

/** One answer to "What should happen?": the whole card selects it; its controls stay usable. */
function ChoiceCard({
  id,
  choice,
  setChoice,
  title,
  children,
}: {
  id: Choice;
  choice: Choice;
  setChoice: (c: Choice) => void;
  title: string;
  children: ReactNode;
}) {
  const on = choice === id;
  return (
    <div className={`dup-choice${on ? ' on' : ''}`} onClick={() => setChoice(id)}>
      <input id={`dup-${id}`} type="radio" name="dup" checked={on} onChange={() => setChoice(id)} />
      <div className="dup-choice-text">
        <label htmlFor={`dup-${id}`} className="t1">
          {title}
        </label>
        {children}
      </div>
    </div>
  );
}

function TripleSetReview({
  set,
  isLast,
  onLater,
  onDone,
}: {
  set: TripleSet;
  isLast: boolean;
  onLater: () => void;
  onDone: () => void;
}) {
  const deleteTriples = useApp((s) => s.deleteTriples);
  const extra = extraCopies(set);
  return (
    <>
      <div className="dialog-body dup-body">
        <section className="dgroup">
          <h3>In the {set.triples[0].graph === 'data' ? 'Data' : 'Ontology'} graph</h3>
          <TripleRows triples={set.triples} label="The repeated triple" />
        </section>
        <p className="dialog-note">
          A graph holds each triple once, so the copies mean nothing extra. Combining keeps one and removes{' '}
          {extra.length === 1 ? 'the copy' : `${extra.length} copies`}.
        </p>
      </div>
      <Foot
        isLast={isLast}
        label="Combine into one"
        onLater={onLater}
        onConfirm={() => {
          deleteTriples(extra);
          onDone();
        }}
      />
    </>
  );
}
