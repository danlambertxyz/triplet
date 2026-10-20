// Ontology conformance check for Validate mode (CHK-01–10). Data graph
// triples are checked against the project's own Ontology graph; anything that
// doesn't fit is flagged, never blocked. Flags are always derived from the
// triple store; the only thing stored is the list of accepted exceptions
// (CHK-07). Every rule comes from the user's Ontology graph (GEN-04): the only
// vocabulary known here is RDF/RDFS/OWL/XSD itself.
//
// Domain and range are read as expectations, as SHACL-style validation does,
// not as RDFS inference rules (agreed 16 Oct 2026).
//
// Accepted exceptions (agreed 17 Oct 2026): stored against the
// triple's content plus the check that flagged it, so a new reason on the same
// triple flags it again and editing the triple asks again. A rename or merge
// carries the exception along, as it does for pairs kept apart (DUP-07).
//
// CHK-11 (agreed 18 Oct 2026) is the one check on the Ontology
// graph itself: a relationship recorded with a domain or range that is also
// used in a plain triple between two classes. The plain triple is flagged.

import { pairingClash } from './entry';
import { isOwnNs, objectKey, termKey } from './terms';
import type { Datatype, IriTerm, Triple } from './types';
import { inferOntologyTyping, isDatatypeTerm } from './typing';
import { RDF_TYPE, RDFS_DOMAIN, RDFS_RANGE, RDFS_SUBCLASS_OF, vocabNs } from './vocab';

export const CHECK_KINDS = ['domain', 'range', 'undeclared', 'functional', 'plain'] as const;
export type CheckKind = (typeof CHECK_KINDS)[number];

/** The graph a check looks at: CHK-11 checks the Ontology graph, every other check the Data graph. */
export function graphOfCheck(kind: CheckKind): 'data' | 'ontology' {
  return kind === 'plain' ? 'ontology' : 'data';
}

/** A triple accepted as an exception to one check (CHK-07), in the graph that check looks at. */
export interface AcceptedException {
  /** termKeys of the subject and predicate, and the object's key (see objectKey). */
  s: string;
  p: string;
  o: string;
  kind: CheckKind;
  /** termKey of the relationship whose rule flagged it (the predicate, or a parent of it, CHK-09). */
  rule: string;
}

export interface Flag {
  tripleId: string;
  kind: CheckKind;
  rule: string;
  /** Plain-English reason (CHK-06), names in curly quotes. */
  reason: string;
  accepted: boolean;
  /** CHK-11: the relationship's domain and range triples, shown beside the plain one. */
  related?: string[];
}

export interface Conformance {
  /** Every flag, accepted or not, in triple order. */
  flags: Flag[];
  byTriple: Map<string, Flag[]>;
  /** Flagged triples with at least one flag not accepted: what the notice counts. */
  openTripleIds: string[];
  /** CHK-05: entities in the Data graph with no class, which can't be checked. */
  untyped: number;
  /** False when the Ontology graph declares no relationships, so there is nothing to check against. */
  hasRules: boolean;
}

const K_TYPE = termKey(RDF_TYPE);
const K_DOMAIN = termKey(RDFS_DOMAIN);
const K_RANGE = termKey(RDFS_RANGE);
const K_SUBCLASS = termKey(RDFS_SUBCLASS_OF);
const K_SUBPROPERTY = termKey({ ns: vocabNs('rdfs'), local: 'subPropertyOf' });
const K_FUNCTIONAL = termKey({ ns: vocabNs('owl'), local: 'FunctionalProperty' });
const K_RDFS_LITERAL = termKey({ ns: vocabNs('rdfs'), local: 'Literal' });
/** Types that declare a term a property (CHK-04). */
const PROPERTY_TYPES = new Set(
  [
    ['owl', 'ObjectProperty'],
    ['owl', 'DatatypeProperty'],
    ['owl', 'AnnotationProperty'],
    ['owl', 'FunctionalProperty'],
    ['owl', 'InverseFunctionalProperty'],
    ['owl', 'TransitiveProperty'],
    ['owl', 'SymmetricProperty'],
    ['rdf', 'Property'],
  ].map(([p, l]) => termKey({ ns: vocabNs(p), local: l })),
);
/** Classes every entity belongs to, so a domain or range of one of them always fits. */
const ANY_THING = new Set([termKey({ ns: vocabNs('owl'), local: 'Thing' }), termKey({ ns: vocabNs('rdfs'), local: 'Resource' })]);

/** The content of a Data graph triple, as an exception stores it. */
function contentKey(s: string, p: string, o: string): string {
  return JSON.stringify([s, p, o]);
}

export function tripleContentKey(t: Pick<Triple, 's' | 'p' | 'o'>): string {
  return contentKey(termKey(t.s), termKey(t.p), objectKey(t.o));
}

export function exceptionKey(e: Pick<AcceptedException, 's' | 'p' | 'o' | 'kind' | 'rule'>): string {
  return JSON.stringify([e.s, e.p, e.o, e.kind, e.rule]);
}

/** The exception that accepts this flag on this triple. */
export function exceptionFor(t: Triple, flag: Pick<Flag, 'kind' | 'rule'>): AcceptedException {
  return { s: termKey(t.s), p: termKey(t.p), o: objectKey(t.o), kind: flag.kind, rule: flag.rule };
}

/** The project's own ontology, indexed for checking. */
interface Rules {
  domains: Map<string, IriTerm[]>;
  ranges: Map<string, IriTerm[]>;
  parentsOfClass: Map<string, string[]>;
  parentsOfProperty: Map<string, string[]>;
  declared: Set<string>;
  functional: Set<string>;
  labels: Map<string, string>;
}

function push<V>(m: Map<string, V[]>, k: string, v: V) {
  const list = m.get(k);
  if (list) list.push(v);
  else m.set(k, [v]);
}

function readRules(triples: readonly Triple[]): Rules {
  const r: Rules = {
    domains: new Map(),
    ranges: new Map(),
    parentsOfClass: new Map(),
    parentsOfProperty: new Map(),
    declared: new Set(),
    functional: new Set(),
    labels: new Map(),
  };
  for (const t of triples) {
    if (t.graph !== 'ontology' || t.o.kind !== 'iri') continue;
    const s = termKey(t.s);
    const o = termKey(t.o);
    const p = termKey(t.p);
    r.labels.set(s, t.s.label);
    if (!r.labels.has(o)) r.labels.set(o, t.o.label);
    if (p === K_DOMAIN) {
      if (!r.domains.get(s)?.some((x) => termKey(x) === o)) push(r.domains, s, t.o);
      r.declared.add(s);
    } else if (p === K_RANGE) {
      if (!r.ranges.get(s)?.some((x) => termKey(x) === o)) push(r.ranges, s, t.o);
      r.declared.add(s);
    } else if (p === K_SUBCLASS) {
      push(r.parentsOfClass, s, o);
    } else if (p === K_SUBPROPERTY) {
      push(r.parentsOfProperty, s, o);
      r.declared.add(s);
    } else if (p === K_TYPE && PROPERTY_TYPES.has(o)) {
      r.declared.add(s);
      if (o === K_FUNCTIONAL) r.functional.add(s);
    }
  }
  return r;
}

/** The key itself and every ancestor through `parents`, nearest first; safe with cycles. */
function withAncestors(key: string, parents: Map<string, string[]>): string[] {
  const out = [key];
  const seen = new Set(out);
  for (let i = 0; i < out.length; i++) {
    for (const p of parents.get(out[i]) ?? []) {
      if (!seen.has(p)) {
        seen.add(p);
        out.push(p);
      }
    }
  }
  return out;
}

/** CHK-01/02: does any of the term's classes (or their parents) match any expected class? */
function fits(classes: readonly IriTerm[], expected: readonly IriTerm[], rules: Rules): boolean {
  const want = new Set(expected.map(termKey));
  if ([...want].some((k) => ANY_THING.has(k))) return true;
  return classes.some((c) => withAncestors(termKey(c), rules.parentsOfClass).some((k) => want.has(k)));
}

/** CHK-03: a literal's datatype fits a datatype range; integer fits decimal, rdfs:Literal takes any. */
function datatypeFits(dt: Datatype, ranges: readonly IriTerm[]): boolean {
  return ranges.some((r) => {
    const k = termKey(r);
    if (k === K_RDFS_LITERAL) return true;
    if (r.ns !== vocabNs('xsd')) return false;
    return r.local === dt || (r.local === 'decimal' && dt === 'integer');
  });
}

const q = (label: string) => `“${label}”`;

/** “A”, “A” or “B”, “A”, “B” or “C”. */
function either(labels: readonly string[]): string {
  const quoted = labels.map(q);
  return quoted.length <= 1 ? (quoted[0] ?? '') : `${quoted.slice(0, -1).join(', ')} or ${quoted[quoted.length - 1]}`;
}

function article(label: string): string {
  return /^[aeiou]/i.test(label) ? 'an' : 'a';
}

/** “a “System”” or “a “System” or a “Process”” for the reason sentences. */
function classPhrase(labels: readonly string[]): string {
  return labels.map((l) => `${article(l)} ${q(l)}`).join(' or ');
}

function datatypeName(t: IriTerm): string {
  return termKey(t) === K_RDFS_LITERAL ? 'any literal' : t.local;
}

export function checkConformance(triples: readonly Triple[], accepted: readonly AcceptedException[] = []): Conformance {
  if (last && last.triples === triples && last.accepted === accepted) return last.result;
  const result = runChecks(triples, accepted);
  last = { triples, accepted, result };
  return result;
}

/** The last result, so the list, the graph and Settings share one run per change. */
let last: { triples: readonly Triple[]; accepted: readonly AcceptedException[]; result: Conformance } | undefined;

function runChecks(triples: readonly Triple[], accepted: readonly AcceptedException[]): Conformance {
  const rules = readRules(triples);
  const acceptedKeys = new Set(accepted.map(exceptionKey));
  const hasRules = rules.declared.size > 0;

  // The Data graph's classes, by termKey of the instance.
  const classesOf = new Map<string, IriTerm[]>();
  const entities = new Map<string, true>();
  for (const t of triples) {
    if (t.graph !== 'data') continue;
    if (termKey(t.p) === K_TYPE) {
      if (t.o.kind === 'iri') push(classesOf, termKey(t.s), t.o);
      entities.set(termKey(t.s), true);
      continue;
    }
    entities.set(termKey(t.s), true);
    if (t.o.kind === 'iri') entities.set(termKey(t.o), true);
  }
  const untyped = [...entities.keys()].filter((k) => !classesOf.has(k)).length;

  const flags: Flag[] = [];
  const add = (t: Triple, kind: CheckKind, rule: string, reason: string, related?: string[]) => {
    const accepted = acceptedKeys.has(exceptionKey(exceptionFor(t, { kind, rule })));
    flags.push({ tripleId: t.id, kind, rule, reason, accepted, ...(related ? { related } : {}) });
  };
  const label = (k: string, fallback: string) => rules.labels.get(k) ?? fallback;

  // CHK-10: values per subject for each functional relationship (or a child of one).
  const functionalValues = new Map<string, { rule: string; subject: IriTerm; triples: Triple[] }>();

  for (const t of triples) {
    if (t.graph !== 'data' || !hasRules) continue;
    const pk = termKey(t.p);
    // Type triples are never checked against domain and range (CHK-04).
    if (pk === K_TYPE) continue;

    // CHK-04: the project's own predicates must be declared in the Ontology graph.
    if (isOwnNs(t.p.ns) && !rules.declared.has(pk)) {
      add(t, 'undeclared', pk, `${q(t.p.label)} isn't declared in the Ontology graph: it has no domain, range, type or parent relationship there.`);
    }

    const chain = withAncestors(pk, rules.parentsOfProperty);
    const seenDomain = new Set<string>();
    const seenRange = new Set<string>();
    for (const rule of chain) {
      const via = rule === pk ? '' : `${q(t.p.label)} is a kind of ${q(label(rule, rule))}, which `;
      const name = rule === pk ? q(t.p.label) : '';
      const lead = via || `${name} `;

      // CHK-01: the subject's class.
      const domains = rules.domains.get(rule);
      const sClasses = classesOf.get(termKey(t.s));
      if (domains && sClasses) {
        const sig = domains.map(termKey).sort().join(' ');
        if (!seenDomain.has(sig)) {
          seenDomain.add(sig);
          if (!fits(sClasses, domains, rules)) {
            add(
              t,
              'domain',
              rule,
              `${lead}expects ${classPhrase(domains.map((d) => d.label))} as subject; ${q(t.s.label)} is ${classPhrase(sClasses.map((c) => c.label))}.`,
            );
          }
        }
      }

      // CHK-02/03: the object.
      const ranges = rules.ranges.get(rule);
      if (!ranges) continue;
      const sig = ranges.map(termKey).sort().join(' ');
      if (seenRange.has(sig)) continue;
      seenRange.add(sig);
      const dtRanges = ranges.filter(isDatatypeTerm);
      const classRanges = ranges.filter((r) => !isDatatypeTerm(r));
      if (t.o.kind === 'literal') {
        if (dtRanges.length === 0) {
          add(t, 'range', rule, `${lead}expects an entity (${classPhrase(classRanges.map((c) => c.label))}) as object, not a literal.`);
        } else if (!datatypeFits(t.o.datatype, dtRanges)) {
          add(t, 'range', rule, `${lead}expects ${either(dtRanges.map(datatypeName))} as object; "${t.o.value}" is ${t.o.datatype}.`);
        }
      } else if (classRanges.length === 0) {
        add(t, 'range', rule, `${lead}expects a literal (${dtRanges.map(datatypeName).join(' or ')}) as object; ${q(t.o.label)} is an entity.`);
      } else {
        const oClasses = classesOf.get(termKey(t.o));
        if (oClasses && !fits(oClasses, classRanges, rules)) {
          add(
            t,
            'range',
            rule,
            `${lead}expects ${classPhrase(classRanges.map((c) => c.label))} as object; ${q(t.o.label)} is ${classPhrase(oClasses.map((c) => c.label))}.`,
          );
        }
      }
    }

    for (const rule of chain) {
      if (!rules.functional.has(rule)) continue;
      const k = `${termKey(t.s)}\n${rule}`;
      const group = functionalValues.get(k);
      if (group) group.triples.push(t);
      else functionalValues.set(k, { rule, subject: t.s, triples: [t] });
    }
  }

  // CHK-10: more than one value for a functional relationship flags every value
  // (agreed 17 Oct 2026: Triplet can't tell which one is wrong).
  for (const { rule, subject, triples: group } of functionalValues.values()) {
    const values = new Map<string, string>();
    for (const t of group) values.set(objectKey(t.o), t.o.kind === 'literal' ? `"${t.o.value}"` : q(t.o.label));
    if (values.size < 2) continue;
    const name = label(rule, group.find((t) => termKey(t.p) === rule)?.p.label ?? rule);
    const list = [...values.values()];
    const listed = `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
    for (const t of group) {
      add(t, 'functional', rule, `${q(name)} allows one value per subject; ${q(subject.label)} has ${values.size}: ${listed}.`);
    }
  }

  // CHK-11: a relationship with a domain or range, also used plainly between two classes.
  if (hasRules) {
    const classes = new Set(inferOntologyTyping(triples).classes.map(termKey));
    for (const t of triples) {
      if (t.graph !== 'ontology' || t.o.kind !== 'iri' || !isOwnNs(t.p.ns)) continue;
      const pk = termKey(t.p);
      if (!rules.domains.has(pk) && !rules.ranges.has(pk)) continue;
      if (!classes.has(termKey(t.s)) || !classes.has(termKey(t.o))) continue;
      const related = triples
        .filter((x) => x.graph === 'ontology' && termKey(x.s) === pk && [K_DOMAIN, K_RANGE].includes(termKey(x.p)))
        .map((x) => x.id);
      add(
        t,
        'plain',
        pk,
        `${q(t.p.label)} is recorded as a relationship with a domain or range, but here it links the classes ${q(t.s.label)} and ${q(t.o.label)} themselves. That says something about the classes, not their data, so it isn't checked as a rule.`,
        related,
      );
    }
  }

  // Keep flags in triple order, as the list and the graph read them.
  const order = new Map(triples.map((t, i) => [t.id, i]));
  flags.sort((a, b) => order.get(a.tripleId)! - order.get(b.tripleId)!);
  const byTriple = new Map<string, Flag[]>();
  for (const f of flags) push(byTriple, f.tripleId, f);
  const openTripleIds = [...byTriple].filter(([, fs]) => fs.some((f) => !f.accepted)).map(([id]) => id);
  return { flags, byTriple, openTripleIds, untyped, hasRules };
}

/** A rename or merge carries accepted exceptions to the new name (agreed 17 Oct 2026). */
export function repointExceptions(list: readonly AcceptedException[], from: readonly string[], to: string): AcceptedException[] {
  const gone = new Set(from);
  const map = (k: string) => (gone.has(k) ? to : k);
  const out: AcceptedException[] = [];
  const seen = new Set<string>();
  for (const e of list) {
    const next = { ...e, s: map(e.s), p: map(e.p), o: map(e.o), rule: map(e.rule) };
    const k = exceptionKey(next);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(next);
    }
  }
  return out;
}

/**
 * Drops exceptions whose triple is no longer in its graph (deleted, or
 * changed by Edit triple, which asks again, CHK-07). Undo brings them back
 * with the triple.
 */
export function pruneExceptions(list: readonly AcceptedException[], triples: readonly Triple[]): AcceptedException[] {
  const present = new Set(triples.map((t) => `${t.graph}\n${tripleContentKey(t)}`));
  const kept = list.filter((e) => present.has(`${graphOfCheck(e.kind)}\n${contentKey(e.s, e.p, e.o)}`));
  return kept.length === list.length ? (list as AcceptedException[]) : kept;
}

/** The triple an exception belongs to, if it is still there. */
export function tripleOfException(e: AcceptedException, triples: readonly Triple[]): Triple | undefined {
  const key = contentKey(e.s, e.p, e.o);
  const graph = graphOfCheck(e.kind);
  return triples.find((t) => t.graph === graph && tripleContentKey(t) === key);
}

/**
 * CHK-11 fix: replaces a plain "Class · relationship · Class" triple with the
 * relationship's domain and range (as ENT-09 records it), skipping either
 * one already there. Refused when it would give two domains and two ranges (ENT-11).
 */
export function planRelationshipFix(
  triples: readonly Triple[],
  plain: Triple,
): { add: Omit<Triple, 'id'>[] } | { error: string } {
  if (plain.o.kind !== 'iri') return { error: 'Only a triple between two classes can become a domain and range.' };
  const wanted: Omit<Triple, 'id'>[] = [
    { graph: 'ontology', s: plain.p, p: RDFS_DOMAIN, o: plain.s },
    { graph: 'ontology', s: plain.p, p: RDFS_RANGE, o: plain.o },
  ];
  const have = new Set(triples.filter((t) => t.graph === 'ontology').map(tripleContentKey));
  const add = wanted.filter((t) => !have.has(tripleContentKey(t)));
  const rest = triples.filter((t) => t.id !== plain.id);
  const error = pairingClash(rest, add);
  return error ? { error } : { add };
}
