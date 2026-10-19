// Editing the triple store (EDIT-01–05, SCR-05–07, TYPE-08). Each function
// works out what a change would do, so the pop-ups can show it before the
// user confirms (EDIT-05, EDIT-07); the store then applies the result.

import { MAX_NAME_LENGTH, resolveEntry, type EntryDraft, type EntryResult } from './entry';
import { toLocalName, type NameKind } from './localName';
import { collectTerms, isOwnNs, prefixedName, sameTerm, sameTriple, termKey } from './terms';
import type { IriTerm, ObjectTerm, ProjectSettings, Triple } from './types';
import { isPropertyType, predicateMakesSubjectAProperty } from './typing';
import { RDF_TYPE } from './vocab';

const K_TYPE = termKey(RDF_TYPE);
const K_SUBPROPERTY = 'vocab:rdfs|subPropertyOf';

function isTerm(o: ObjectTerm, term: IriTerm): boolean {
  return o.kind === 'iri' && sameTerm(o, term);
}

/** SCR-07: every triple that uses a term, split by where it appears. Each triple is listed once. */
export interface TermUses {
  asSubject: Triple[];
  asObject: Triple[];
  /** Triples that use the term as their predicate (a relationship). */
  asPredicate: Triple[];
  all: Triple[];
}

export function termUses(triples: readonly Triple[], term: IriTerm): TermUses {
  const out: TermUses = { asSubject: [], asObject: [], asPredicate: [], all: [] };
  for (const t of triples) {
    if (isTerm(t.s, term)) out.asSubject.push(t);
    else if (isTerm(t.o, term)) out.asObject.push(t);
    else if (isTerm(t.p, term)) out.asPredicate.push(t);
    else continue;
    out.all.push(t);
  }
  return out;
}

/**
 * Whether a term is named like a relationship (camelCase) or like an entity
 * or class (PascalCase), judged from how it is used (ID-06).
 */
export function nameKindOf(triples: readonly Triple[], term: IriTerm): NameKind {
  for (const t of triples) {
    if (isTerm(t.p, term)) return 'predicate';
    if (t.graph !== 'ontology' || !isTerm(t.s, term)) {
      if (t.graph === 'ontology' && termKey(t.p) === K_SUBPROPERTY && isTerm(t.o, term)) return 'predicate';
      continue;
    }
    if (predicateMakesSubjectAProperty(t.p)) return 'predicate';
    if (termKey(t.p) === K_TYPE && t.o.kind === 'iri' && isPropertyType(t.o)) return 'predicate';
  }
  // Not used as a relationship anywhere: keep the case its current name has.
  return /^\p{Ll}/u.test(term.local) ? 'predicate' : 'entity';
}

/** Only the project's own terms can be renamed; standard vocabulary (rdf:type, skos:definition…) can't. */
export function canRename(term: IriTerm): boolean {
  return isOwnNs(term.ns);
}

export type RenamePlan =
  | { ok: true; renamed: IriTerm; affected: Triple[]; triples: Triple[] }
  | { ok: false; error: string; unchanged?: boolean };

/**
 * EDIT-01, ID-07: renaming a term gives it a new label and local name in every
 * triple that uses it. Domain and range stay with a renamed relationship, as
 * they are triples that use it. A local name already taken by another term
 * gets a numbered suffix, so two terms never share an IRI (ID-08).
 */
export function planRename(triples: readonly Triple[], term: IriTerm, newName: string): RenamePlan {
  const name = newName.trim();
  if (!canRename(term)) return { ok: false, error: "Standard vocabulary terms can't be renamed." };
  if (!name) return { ok: false, error: 'Enter a new name.' };
  if (name === term.label) return { ok: false, error: 'This is the current name.', unchanged: true };
  if (name.length > MAX_NAME_LENGTH) return { ok: false, error: `Keep it to ${MAX_NAME_LENGTH} characters or fewer.` };
  const base = toLocalName(name, nameKindOf(triples, term));
  if (!base) return { ok: false, error: 'Use at least one letter or number.' };

  const others = collectTerms(triples);
  others.delete(termKey(term));
  for (const t of others.values()) {
    if (t.ns === term.ns && t.label === name) {
      return {
        ok: false,
        error: `“${name}” is already the name of another term. Combining two terms is Merge, which comes with duplicate handling.`,
      };
    }
  }
  let local = base;
  for (let n = 2; others.has(termKey({ ns: term.ns, local })); n++) local = `${base}_${n}`;
  const renamed: IriTerm = { ...term, local, label: name };

  const swap = <T extends ObjectTerm>(x: T): T => (isTerm(x, term) ? (renamed as T) : x);
  const affected: Triple[] = [];
  const out = triples.map((t) => {
    if (!isTerm(t.s, term) && !isTerm(t.p, term) && !isTerm(t.o, term)) return t;
    const next = { ...t, s: swap(t.s), p: swap(t.p), o: swap(t.o) };
    affected.push(next);
    return next;
  });
  return { ok: true, renamed, affected, triples: out };
}

/** SCR-05: the Edit triple fields, filled from an existing triple. */
export type EditDraft = Pick<EntryDraft, 'subject' | 'predicate' | 'objectKind' | 'object' | 'datatype'>;

/** Plain-triple entry for one existing triple: no class pickers, ticks or relationship recording. */
function editEntry(draft: EditDraft, triple: Triple): EntryDraft {
  return { ...draft, graph: triple.graph, asRelationship: false };
}

/**
 * Text that types each term of a triple back into the Edit triple fields. A
 * term's label is used where typing it finds that same term; otherwise its
 * prefixed name (e.g. a Data graph subject that lives in the Ontology namespace).
 */
export function draftFromTriple(triple: Triple, store: readonly Triple[], settings: ProjectSettings): EditDraft {
  const draft: EditDraft = {
    subject: triple.s.label,
    predicate: triple.p.label,
    objectKind: triple.o.kind === 'literal' ? 'value' : 'entity',
    object: triple.o.kind === 'literal' ? triple.o.value : triple.o.label,
    datatype: triple.o.kind === 'literal' ? triple.o.datatype : 'string',
  };
  const others = store.filter((t) => t.id !== triple.id);
  const { preview } = resolveEntry(editEntry(draft, triple), others, settings, store);
  const same = (a: IriTerm | undefined, b: ObjectTerm) => !!a && sameTerm(a, b);
  if (!same(preview.subject, triple.s)) draft.subject = prefixedName(triple.s, settings);
  if (!same(preview.predicate, triple.p)) draft.predicate = prefixedName(triple.p, settings);
  if (triple.o.kind === 'iri' && !same(preview.object, triple.o)) draft.object = prefixedName(triple.o, settings);
  return draft;
}

export interface EditResult {
  /** The edited triple, when it can be saved and differs from the original. */
  triple?: Omit<Triple, 'id'>;
  errors: EntryResult['errors'];
  preview: EntryResult['preview'];
  /** True when the fields still say what the triple already says. */
  unchanged: boolean;
  /** A problem with the triple as a whole, e.g. it already exists. */
  message?: string;
}

/**
 * EDIT-02: change one triple's subject, predicate or object in place. Only
 * that triple changes; renaming everywhere is Rename's job. The same field
 * checks as the entry form apply (ENT-08), and a relationship can't be given
 * a second pairing of classes (ENT-11).
 */
export function planEdit(
  store: readonly Triple[],
  triple: Triple,
  draft: EditDraft,
  settings: ProjectSettings,
): EditResult {
  const others = store.filter((t) => t.id !== triple.id);
  const r = resolveEntry(editEntry(draft, triple), others, settings, store);
  const base = { errors: r.errors, preview: r.preview, unchanged: false };
  if (r.alreadyExists) return { ...base, errors: {}, message: 'This triple already exists in the graph.' };
  if (Object.keys(r.errors).length > 0) return base;
  const next = r.triples[0];
  if (!next) return { ...base, message: 'Fill in the subject, predicate and object.' };
  if (sameTriple(next, triple)) return { ...base, unchanged: true };
  if (others.some((t) => sameTriple(t, next))) return { ...base, message: 'This triple already exists in the graph.' };
  return { ...base, triple: next };
}

/**
 * TYPE-08: "Set class" on a Data graph node writes "term type Class" (as
 * TYPE-02) and replaces the node's other type triples. `remove` lists the
 * triples that go, so the user sees them before confirming (EDIT-05).
 */
export function planSetClass(
  triples: readonly Triple[],
  term: IriTerm,
  cls: IriTerm,
): { remove: Triple[]; add?: Omit<Triple, 'id'> } {
  const types = triples.filter((t) => t.graph === 'data' && termKey(t.p) === K_TYPE && isTerm(t.s, term));
  const add = { graph: 'data' as const, s: term, p: RDF_TYPE, o: cls };
  return {
    remove: types.filter((t) => !isTerm(t.o, cls)),
    add: types.some((t) => isTerm(t.o, cls)) ? undefined : add,
  };
}
