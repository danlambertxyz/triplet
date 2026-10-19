// One flag on one triple (CHK-06), as the list, the graph's bars and Edit
// triple show it: the reason, Accept as exception (CHK-07), and a fix where
// one is clear (agreed 18 Oct 2026): Set class for a subject or
// object of the wrong class, and for a plain class-to-class triple (CHK-11)
// the relationship's domain and range triples beside it, with "Make it domain
// and range" or Remove.

import { useState } from 'react';
import { exceptionFor, planRelationshipFix, type Flag } from '../core/conformance';
import { objectText } from '../core/terms';
import type { IriTerm, Triple } from '../core/types';
import { FlagIcon } from './icons';
import { useApp } from './store';

export function FlagItem({ triple: t, flag: f, showTriple }: { triple: Triple; flag: Flag; showTriple?: boolean }) {
  const triples = useApp((s) => s.triples);
  const accept = useApp((s) => s.acceptExceptions);
  const unaccept = useApp((s) => s.unacceptExceptions);
  const openDialog = useApp((s) => s.openDialog);
  const replaceWithTriples = useApp((s) => s.replaceWithTriples);
  const [error, setError] = useState<string>();

  // The term whose class is in question: the subject for a domain flag, an entity object for a range flag.
  const wrongClass: IriTerm | undefined =
    f.accepted || t.graph !== 'data'
      ? undefined
      : f.kind === 'domain'
        ? t.s
        : f.kind === 'range' && t.o.kind === 'iri'
          ? t.o
          : undefined;
  const related = f.related?.map((id) => triples.find((x) => x.id === id)).filter((x): x is Triple => !!x) ?? [];

  const makeRelationship = () => {
    const plan = planRelationshipFix(triples, t);
    if ('error' in plan) setError(plan.error);
    else replaceWithTriples(t.id, plan.add);
  };

  return (
    <li className={f.accepted ? 'accepted' : undefined}>
      <FlagIcon />
      <span className="reason">
        {showTriple && (
          <span className="trip">
            {t.s.label} · {t.p.label} · {objectText(t.o)}:{' '}
          </span>
        )}
        {f.accepted && <span className="acc">Accepted as exception · </span>}
        {f.reason}
        {related.length > 0 && (
          <span className="flag-related">
            Recorded as a relationship:
            {related.map((x) => (
              <span key={x.id}>
                {x.s.label} · {x.p.label} · {objectText(x.o)}
              </span>
            ))}
          </span>
        )}
        {error && (
          <span className="flag-error" role="alert">
            {error}
          </span>
        )}
      </span>
      <span className="flag-acts">
        {wrongClass && (
          <button type="button" className="link-btn" onClick={() => openDialog({ kind: 'setClass', term: wrongClass })}>
            Set class of “{wrongClass.label}”…
          </button>
        )}
        {f.kind === 'plain' && !f.accepted && (
          <>
            <button type="button" className="link-btn" onClick={makeRelationship}>
              Make it domain and range
            </button>
            <button type="button" className="link-btn" onClick={() => openDialog({ kind: 'deleteTriple', tripleId: t.id })}>
              Remove…
            </button>
          </>
        )}
        <button type="button" className="link-btn" onClick={() => (f.accepted ? unaccept : accept)([exceptionFor(t, f)])}>
          {f.accepted ? 'Flag again' : 'Accept as exception'}
        </button>
      </span>
    </li>
  );
}
