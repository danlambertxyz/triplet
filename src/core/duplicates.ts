// Duplicate detection and resolution (DUP-01–07, ID-08). Possible duplicates
// are always derived from the triple store; the only thing stored is the list
// of pairs the user chose to keep as different things (DUP-07, agreed
// 16 Oct 2026: saved with the project, part of Undo, never exported).
// Nothing here changes the store: each plan is shown to the user first, and
// the store applies it only when they confirm (EDIT-05, EDIT-07).

import { termUses, nameKindOf } from './edit';
import { toLocalName, type NameKind } from './localName';
import { collectTerms, isOwnNs, objectKey, sameTerm, termKey } from './terms';
import type { GraphName, IriTerm, ObjectTerm, Triple } from './types';
import { inferOntologyTyping } from './typing';
import { RDFS_DOMAIN, RDFS_RANGE, vocabNs } from './vocab';

/** Two terms the user kept as different things, by termKey (DUP-07). */
export type DistinctPair = [string, string];

const owl = (local: string, label: string): IriTerm => ({ kind: 'iri', ns: vocabNs('owl'), local, label });
export const OWL_SAME_AS = owl('sameAs', 'same as');
export const OWL_EQUIVALENT_CLASS = owl('equivalentClass', 'equivalent class');
export const OWL_EQUIVALENT_PROPERTY = owl('equivalentProperty', 'equivalent property');
const SAME_LINKS = new Set([OWL_SAME_AS, OWL_EQUIVALENT_CLASS, OWL_EQUIVALENT_PROPERTY].map(termKey));

/** Two possibly duplicate terms, `a` being the one that appeared first. */
export interface TermPair {
  kind: 'terms';
  key: string;
  a: IriTerm;
  b: IriTerm;
  /** Relationships are only compared with relationships, everything else with everything else. */
  role: NameKind;
  /** Why they were flagged, as a sentence (DUP-03). */
  reason: string;
}

/** The same triple entered more than once (DUP-01). */
export interface TripleSet {
  kind: 'triples';
  key: string;
  triples: Triple[];
}

export type DuplicateSet = TermPair | TripleSet;

/** Order-independent identity of a pair of terms. */
export function pairKey(a: Pick<IriTerm, 'ns' | 'local'>, b: Pick<IriTerm, 'ns' | 'local'>): string {
  return [termKey(a), termKey(b)].sort().join('||');
}

function tripleKey(t: Omit<Triple, 'id'>): string {
  return JSON.stringify([t.graph, termKey(t.s), termKey(t.p), objectKey(t.o)]);
}

// Letters and digits only, lower case: "Date of Birth", "date-of-birth" and
// "DateOfBirth" all become "dateofbirth" (DUP-01).
const NOT_ALNUM = /[^\p{L}\p{N}]+/gu;
const core = (label: string) => label.normalize('NFC').toLowerCase().replace(NOT_ALNUM, '');

/** Splits a name into words at spaces, punctuation and camelCase humps. */
function words(label: string): string[] {
  return label
    .normalize('NFC')
    .replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/**
 * DUP-02 (agreed: word forms only, no synonym lists): plain
 * English endings are dropped so "works for", "worked for" and "working for"
 * match. Telling "works for" from "employed by" needs meaning (DUP-08).
 */
function stem(word: string): string {
  // Short verbs: "used" and "uses" both become "us", like "use".
  if (/^\p{L}{2}(e|ed|es)$/u.test(word)) return word.slice(0, 2);
  for (const end of ['ing', 'ed', 'es', 's']) {
    if (word.length - end.length >= 3 && word.endsWith(end)) return word.slice(0, -end.length);
  }
  return word;
}
const wordForm = (label: string) => words(label).map(stem).join(' ');

/** Says how two names that share the same letters differ, e.g. "These names differ only by capital letters." */
function difference(x: string, y: string): string {
  const letters = (s: string) => s.normalize('NFC').replace(NOT_ALNUM, '');
  const spacing = (s: string) => s.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, '').trim().split(/\s+/).join(' ');
  const punctuation = (s: string) => s.normalize('NFC').replace(/[\p{L}\p{N}\s]+/gu, '');
  const parts: string[] = [];
  if (letters(x) !== letters(y)) parts.push('capital letters');
  if (spacing(x) !== spacing(y)) parts.push('spacing');
  if (punctuation(x) !== punctuation(y)) parts.push('punctuation');
  if (parts.length === 0) return 'These names give the same IRI.';
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return `These names differ only by ${list}.`;
}

/** Pairs of terms already linked as the same thing (owl:sameAs and friends): not flagged again. */
function linkedPairs(triples: readonly Triple[]): Set<string> {
  const out = new Set<string>();
  for (const t of triples) if (SAME_LINKS.has(termKey(t.p)) && t.o.kind === 'iri') out.add(pairKey(t.s, t.o));
  return out;
}

/**
 * DUP-01–03, ID-08: every set of possible duplicates in the store, in the
 * order their terms first appear. Only the project's own terms are compared,
 * and only within one namespace: a Data graph thing and an Ontology graph
 * class of the same name are different on purpose.
 */
export function findDuplicates(triples: readonly Triple[], distinct: readonly DistinctPair[] = []): DuplicateSet[] {
  const out: DuplicateSet[] = [];

  // Identical triples: the same graph, subject, predicate and object twice.
  const byTriple = new Map<string, Triple[]>();
  for (const t of triples) {
    const k = tripleKey(t);
    byTriple.set(k, [...(byTriple.get(k) ?? []), t]);
  }
  for (const [k, group] of byTriple) if (group.length > 1) out.push({ kind: 'triples', key: `triples:${k}`, triples: group });

  const skip = linkedPairs(triples);
  for (const [x, y] of distinct) skip.add([x, y].sort().join('||'));

  const terms = [...collectTerms(triples).values()].filter((t) => isOwnNs(t.ns));
  const roles = new Map(terms.map((t) => [termKey(t), nameKindOf(triples, t)]));
  const seen = new Set<string>();
  const flag = (a: IriTerm, b: IriTerm, reason: string) => {
    const key = pairKey(a, b);
    if (seen.has(key) || skip.has(key)) return;
    seen.add(key);
    out.push({ kind: 'terms', key, a, b, role: roles.get(termKey(a))!, reason });
  };

  for (let i = 0; i < terms.length; i++) {
    for (let j = i + 1; j < terms.length; j++) {
      const a = terms[i];
      const b = terms[j];
      const role = roles.get(termKey(a));
      if (a.ns !== b.ns || role !== roles.get(termKey(b))) continue;
      if (core(a.label) === core(b.label)) flag(a, b, difference(a.label, b.label));
      else if (suffixedFrom(a, b, role!) || suffixedFrom(b, a, role!)) flag(a, b, 'These names give the same IRI, so the second got a number (ID-08).');
      else if (role === 'predicate' && wordForm(a.label) === wordForm(b.label)) {
        flag(a, b, 'These relationships use different forms of the same words.');
      }
    }
  }
  return out;
}

/**
 * ID-08: `x` got a numbered suffix because `y` already had its plain local
 * name. A name typed with "_2" in it (e.g. CUST_2) doesn't count.
 */
function suffixedFrom(x: IriTerm, y: IriTerm, role: NameKind): boolean {
  const m = /^(.*)_\d+$/.exec(x.local);
  return !!m && m[1] === y.local && toLocalName(x.label, role) !== x.local;
}

/** The term pairs that involve a term, for Merge in the selected-node bar. */
export function setsWithTerm(sets: readonly DuplicateSet[], term: Pick<IriTerm, 'ns' | 'local'>): TermPair[] {
  const k = termKey(term);
  return sets.filter((s): s is TermPair => s.kind === 'terms' && (termKey(s.a) === k || termKey(s.b) === k));
}

/**
 * FLOW-04: the terms a node can be merged with when it isn't flagged: the
 * project's own terms in the same namespace and of the same kind (entity or
 * relationship), sorted by name.
 */
export function mergeCandidates(triples: readonly Triple[], term: IriTerm): IriTerm[] {
  if (!isOwnNs(term.ns)) return [];
  const role = nameKindOf(triples, term);
  return [...collectTerms(triples).values()]
    .filter((t) => t.ns === term.ns && !sameTerm(t, term) && nameKindOf(triples, t) === role)
    .sort((x, y) => x.label.localeCompare(y.label));
}

/** A pair the user picked themselves, shown in the same review (FLOW-04). */
export function chosenPair(triples: readonly Triple[], a: IriTerm, b: IriTerm): TermPair {
  return { kind: 'terms', key: pairKey(a, b), a, b, role: nameKindOf(triples, a), reason: 'You chose to merge these.' };
}

export type MergePlan =
  | {
      ok: true;
      survivor: IriTerm;
      triples: Triple[];
      /** Triples that pointed at the term whose name isn't kept. */
      moved: number;
      /** Triples dropped because the merge made them identical to another, or a link from the term to itself. */
      combined: number;
    }
  | { ok: false; error: string };

/**
 * DUP-04, DUP-05: merges two terms into one named `keepName` (one of their
 * two names). Every triple of either is repointed to the survivor; triples
 * that become identical are combined, and a "same as" link between the two
 * goes, as it would link the survivor to itself. The survivor's IRI comes
 * from the kept name, as if typed afresh: merging "date of birth"
 * (DateOfBirth_2) into "Date of Birth" frees the plain DateOfBirth (ID-08).
 */
export function planMerge(triples: readonly Triple[], a: IriTerm, b: IriTerm, keepName: string): MergePlan {
  if (!isOwnNs(a.ns) || a.ns !== b.ns) return { ok: false, error: 'Only your own terms in the same graph can be merged.' };
  const kept = keepName === b.label ? b : a;
  const other = kept === a ? b : a;
  const role = nameKindOf(triples, a);
  const taken = collectTerms(triples);
  taken.delete(termKey(a));
  taken.delete(termKey(b));
  // The kept term keeps its IRI, unless it only had a numbered suffix because
  // the other one held its plain name (ID-08), which the merge now frees.
  const plain = toLocalName(kept.label, role);
  const base = plain && new RegExp(`^${plain}_\\d+$`, 'u').test(kept.local) ? plain : kept.local;
  let local = base;
  for (let n = 2; taken.has(termKey({ ns: kept.ns, local })); n++) local = `${base}_${n}`;
  const survivor: IriTerm = { kind: 'iri', ns: kept.ns, local, label: kept.label };

  const isEither = (x: ObjectTerm) => x.kind === 'iri' && (sameTerm(x, a) || sameTerm(x, b));
  const swap = <T extends ObjectTerm>(x: T): T => (isEither(x) ? (survivor as T) : x);
  const moved = termUses(triples, other).all.length;
  const seen = new Set<string>();
  const out: Triple[] = [];
  for (const t of triples) {
    const next = isEither(t.s) || isEither(t.p) || isEither(t.o) ? { ...t, s: swap(t.s), p: swap(t.p), o: swap(t.o) } : t;
    const k = tripleKey(next);
    const selfLink = SAME_LINKS.has(termKey(next.p)) && next.o.kind === 'iri' && sameTerm(next.s, next.o);
    if (seen.has(k) || selfLink) continue;
    seen.add(k);
    out.push(next);
  }

  // ENT-11: one relationship can't end up with several domains and several ranges.
  if (role === 'predicate') {
    const ends = (p: IriTerm) =>
      [...new Set(out.filter((t) => t.graph === 'ontology' && sameTerm(t.s, survivor) && sameTerm(t.p, p)).map((t) => (t.o as IriTerm).label))];
    const domains = ends(RDFS_DOMAIN);
    const ranges = ends(RDFS_RANGE);
    if (domains.length > 1 && ranges.length > 1) {
      return {
        ok: false,
        error:
          `Merged, “${survivor.label}” would go from ${domains.join(' or ')} to ${ranges.join(' or ')}. One ` +
          `relationship can't link two different pairs of classes (ENT-11), so these can't be merged as they are.`,
      };
    }
  }
  return { ok: true, survivor, triples: out, moved, combined: triples.length - out.length };
}

/** DUP-04: keep one, remove the other with every triple that uses it. */
export function planRemove(triples: readonly Triple[], remove: IriTerm): Triple[] {
  return termUses(triples, remove).all;
}

/**
 * DUP-06 (agreed: the link matches the kind of term): owl:sameAs
 * for things, owl:equivalentClass for two classes, owl:equivalentProperty for
 * two relationships. Written in the graph the terms belong to.
 */
export function planSameAs(triples: readonly Triple[], a: IriTerm, b: IriTerm): Omit<Triple, 'id'> {
  const classes = new Set(inferOntologyTyping(triples).classes.map(termKey));
  const p =
    nameKindOf(triples, a) === 'predicate'
      ? OWL_EQUIVALENT_PROPERTY
      : classes.has(termKey(a)) && classes.has(termKey(b))
        ? OWL_EQUIVALENT_CLASS
        : OWL_SAME_AS;
  const graph: GraphName = a.ns === 'ontology' ? 'ontology' : 'data';
  return { graph, s: b, p, o: a };
}

/** The identical copies to remove, keeping the first of each set (DUP-05). */
export function extraCopies(set: TripleSet): string[] {
  return set.triples.slice(1).map((t) => t.id);
}

/** Keeps pairs kept as different things in step with a rename or merge: `from` keys become `to`. */
export function repointPairs(pairs: readonly DistinctPair[], from: readonly string[], to: string): DistinctPair[] {
  const swap = (k: string) => (from.includes(k) ? to : k);
  const out: DistinctPair[] = [];
  const seen = new Set<string>();
  for (const [x, y] of pairs) {
    const p: DistinctPair = [swap(x), swap(y)];
    const k = [...p].sort().join('||');
    if (p[0] === p[1] || seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}
