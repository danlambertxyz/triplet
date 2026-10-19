// Review list. Always shows both graphs in two labelled bands (GRAPH-03);
// the Data / Ontology / Both toggle filters the graph only, by request
// (a change from FLOW-02). Newest first; the last entry is highlighted (ENT-07).
// Each graph's section can be folded away, and the triples behind the node or
// arrow selected in the graph are highlighted (both added 16 Oct 2026).

import { useEffect, useMemo, useRef, useState } from 'react';
import { subjectColours, UNTYPED_COLOUR } from '../core/colours';
import { objectText, prefixedName, termKey } from '../core/terms';
import type { Conformance, Flag } from '../core/conformance';
import type { DuplicateSet } from '../core/duplicates';
import type { GraphName, ProjectSettings, Triple } from '../core/types';
import { useDuplicates } from './dialogs/DuplicatesDialog';
import { FlagItem } from './FlagItem';
import { FlagIcon, PencilIcon, TrashIcon } from './icons';
import { useApp } from './store';
import { useConformance } from './useConformance';

const TITLES: Record<GraphName, string> = { data: 'Data graph', ontology: 'Ontology graph' };

export function TripleList({ settings }: { settings: ProjectSettings }) {
  const triples = useApp((s) => s.triples);
  const lastAdded = useApp((s) => s.lastAdded);
  const highlighted = useApp((s) => s.highlighted);
  const listCollapsed = useApp((s) => s.listCollapsed);
  const setListCollapsed = useApp((s) => s.setListCollapsed);
  const openDialog = useApp((s) => s.openDialog);
  const duplicates = useDuplicates();
  const conformance = useConformance();
  const flaggedOnly = useApp((s) => s.flaggedOnly) && !!conformance;
  const [filter, setFilter] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const marked = useMemo(() => new Set(highlighted), [highlighted]);

  // A new selection opens the sections holding its triples and brings the first into view.
  useEffect(() => {
    if (highlighted.length === 0) return;
    const graphs = new Set(triples.filter((t) => marked.has(t.id)).map((t) => t.graph));
    for (const g of graphs) if (useApp.getState().listCollapsed[g]) setListCollapsed(g, false);
    requestAnimationFrame(() =>
      listRef.current?.querySelector('.trow.involved')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }),
    );
    // Only when the selection changes, not on every edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlighted]);

  const colours = useMemo(() => subjectColours(triples), [triples]);
  const open = useMemo(() => new Set(conformance?.openTripleIds), [conformance]);
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return [...triples]
      .reverse()
      .filter((t) => !flaggedOnly || open.has(t.id))
      .filter(
        (t) =>
          !q ||
          [t.s.label, t.p.label, objectText(t.o), prefixedName(t.s, settings), prefixedName(t.p, settings)].some((x) =>
            x.toLowerCase().includes(q),
          ),
      );
  }, [triples, filter, settings, flaggedOnly, open]);

  if (triples.length === 0) {
    // In Validate mode the notice still says there's nothing to check yet (CHK-06).
    return (
      <>
        {conformance && (
          <div className="empty-notice">
            <ConformanceNotice conformance={conformance} />
          </div>
        )}
        <div className="empty">
          <div className="t1">No triples yet</div>
          <p>Fill in a subject, predicate and object above, and each triple you add will be listed here.</p>
        </div>
      </>
    );
  }

  const bands: [GraphName, Triple[]][] = [
    ['data', shown.filter((t) => t.graph === 'data')],
    ['ontology', shown.filter((t) => t.graph === 'ontology')],
  ];

  return (
    <div className="triples" ref={listRef}>
      <div className="triples-head">
        <h2 className="triples-title">Triples Created</h2>
        <label htmlFor="f-filter" className="sr-only">
          Filter triples
        </label>
        <input
          id="f-filter"
          className="filter"
          type="search"
          placeholder="Filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      {/* DUP-03: possible duplicates are flagged here, with a link to the review (SCR-08). */}
      {duplicates.length > 0 && (
        <div className="strip dup-notice" role="status">
          <span>
            <span className="t1">
              {duplicates.length === 1 ? '1 possible duplicate' : `${duplicates.length} possible duplicates`}
            </span>{' '}
            · {noticeText(duplicates[0])}
            {duplicates.length > 1 && ', and more'}
          </span>
          <button type="button" className="link-btn" onClick={() => openDialog({ kind: 'duplicates' })}>
            Review
          </button>
        </div>
      )}
      {conformance && <ConformanceNotice conformance={conformance} />}
      {bands.map(([graph, rows]) => (
        <div key={graph}>
          <h3 className="band">
            <button
              type="button"
              className="band-toggle"
              aria-expanded={!listCollapsed[graph]}
              aria-controls={`list-${graph}`}
              onClick={() => setListCollapsed(graph, !listCollapsed[graph])}
            >
              <svg className="chev" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 9l6 6 6-6" />
              </svg>
              {TITLES[graph]}
              <span className="band-count">{rows.length}</span>
            </button>
          </h3>
          <ul id={`list-${graph}`} className="list" aria-label={`Triples in the ${TITLES[graph]}`} hidden={listCollapsed[graph]}>
            {rows.length === 0 && (
              <li className="trow none">
                <span className="cell">
                  {flaggedOnly
                    ? 'No flagged triples'
                    : filter
                      ? 'No matching triples'
                      : 'No triples in this graph yet'}
                </span>
              </li>
            )}
            {rows.map((t) => (
              <Row
                key={t.id}
                triple={t}
                settings={settings}
                isNew={lastAdded.includes(t.id)}
                involved={marked.has(t.id)}
                flags={conformance?.byTriple.get(t.id)}
                colour={t.graph === 'data' ? (colours.get(termKey(t.s)) ?? UNTYPED_COLOUR) : undefined}
              />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** The first flagged set in a few words, e.g. “Date of Birth” and “date of birth” look alike. */
function noticeText(first: DuplicateSet): string {
  if (first.kind === 'terms') return `“${first.a.label}” and “${first.b.label}” look alike`;
  const [t] = first.triples;
  return `“${t.s.label} · ${t.p.label} · ${objectText(t.o)}” is in the list ${first.triples.length} times`;
}

/**
 * CHK-06: counts the flagged triples (accepted exceptions aren't counted,
 * CHK-07) and offers "Show flagged only", like the duplicate notice.
 */
function ConformanceNotice({ conformance: c }: { conformance: Conformance }) {
  const flaggedOnly = useApp((s) => s.flaggedOnly);
  const setFlaggedOnly = useApp((s) => s.setFlaggedOnly);
  const count = c.openTripleIds.length;
  const accepted = new Set(c.flags.filter((f) => f.accepted).map((f) => f.tripleId)).size;
  const first = c.flags.find((f) => !f.accepted);
  let head: string;
  let detail: string;
  if (!c.hasRules) {
    head = 'Nothing to check yet';
    detail = 'Your Ontology graph declares no relationships. Give one a domain or range to have the Data graph checked.';
  } else if (count > 0) {
    head = count === 1 ? '1 flagged triple' : `${count} flagged triples`;
    // "And more" only when another reason is waiting (two values of one subject share theirs).
    const reasons = new Set(c.flags.filter((f) => !f.accepted).map((f) => f.reason));
    detail = first!.reason + (reasons.size > 1 ? ' And more.' : '');
  } else {
    head = 'No flags';
    detail = 'Every triple fits the Ontology graph.';
  }
  const extras = [
    accepted > 0 && `${accepted} accepted as ${accepted === 1 ? 'an exception' : 'exceptions'}`,
    c.hasRules && c.untyped > 0 && `${c.untyped} ${c.untyped === 1 ? 'entity has' : 'entities have'} no class, so ${c.untyped === 1 ? "it isn't" : "they aren't"} fully checked`,
  ].filter(Boolean);
  return (
    <div className="strip chk-notice" role="status">
      <FlagIcon size={14} />
      <span>
        <span className="t1">{head}</span> · {detail}
        {extras.length > 0 && <span className="chk-extra">{extras.join(' · ')}</span>}
      </span>
      <span className="chk-actions">
        {(count > 0 || flaggedOnly) && (
          <button type="button" className="link-btn" aria-pressed={flaggedOnly} onClick={() => setFlaggedOnly(!flaggedOnly)}>
            {flaggedOnly ? 'Show all' : 'Show flagged only'}
          </button>
        )}
      </span>
    </div>
  );
}

function Row({
  triple: t,
  settings,
  isNew,
  involved,
  flags,
  colour,
}: {
  triple: Triple;
  settings: ProjectSettings;
  isNew: boolean;
  /** Behind the node or arrow selected in the graph. */
  involved: boolean;
  /** Validate mode: the triple's flags, accepted or not (CHK-06, CHK-07). */
  flags?: Flag[];
  colour?: string;
}) {
  const deleteTriple = useApp((s) => s.deleteTriple);
  const openDialog = useApp((s) => s.openDialog);
  const [confirming, setConfirming] = useState(false);
  const summary = `${t.s.label} · ${t.p.label} · ${objectText(t.o)}`;

  if (confirming) {
    // EDIT-03, EDIT-05: nothing is removed until the user confirms.
    return (
      <li className="trow confirming">
        <span className="q">
          Delete <b>{summary}</b>?
        </span>
        <span className="btns">
          <button type="button" className="btn xs" autoFocus onClick={() => setConfirming(false)}>
            Cancel
          </button>
          <button type="button" className="btn xs danger" onClick={() => deleteTriple(t.id)}>
            Delete
          </button>
        </span>
      </li>
    );
  }

  return (
    <li
      className={`trow${isNew ? ' new' : ''}${involved ? ' involved' : ''}${flags ? (flags.some((f) => !f.accepted) ? ' flagged' : ' accepted') : ''}`}
    >
      <div className="subj">
        {colour ? <span className="dot" style={{ background: colour }} aria-hidden="true" /> : <span className="ring" aria-hidden="true" />}
        <span className="cell" title={prefixedName(t.s, settings)}>
          {t.s.label}
        </span>
      </div>
      <div className="cell pred" title={prefixedName(t.p, settings)}>
        {t.p.label}
      </div>
      <div className="obj" title={t.o.kind === 'iri' ? prefixedName(t.o, settings) : objectText(t.o)}>
        <span className={`cell${t.o.kind === 'literal' ? ' val' : ''}`}>{objectText(t.o)}</span>
        {t.o.kind === 'literal' && <span className="dt">{t.o.datatype}</span>}
      </div>
      <div className="acts">
        {/* EDIT-08: Edit triple opens from the pencil (SCR-05). */}
        <button
          type="button"
          aria-label={`Edit triple ${summary}`}
          title="Edit triple"
          onClick={() => openDialog({ kind: 'edit', tripleId: t.id })}
        >
          <PencilIcon />
        </button>
        <button type="button" aria-label={`Delete triple ${summary}`} title="Delete triple" onClick={() => setConfirming(true)}>
          <TrashIcon />
        </button>
      </div>
      {flags && (
        <ul className="flags" aria-label={`Flags on ${summary}`}>
          {flags.map((f) => (
            <FlagItem key={`${f.kind}|${f.rule}`} triple={t} flag={f} />
          ))}
        </ul>
      )}
    </li>
  );
}
