// Turns what the user typed in the entry form into triples (FLOW-01).

import type { Datatype, GraphName, IriTerm, LiteralTerm, NsKey, ObjectTerm, ProjectSettings, Triple } from './types';
import { toLocalName, type NameKind } from './localName';
import { collectTerms, isOwnNs, parsePrefixed, sameTriple, termKey } from './terms';
import { inferOntologyTyping, isPropertyType, predicateMakesSubjectAProperty } from './typing';
import {
  DATA_COMMON_PREDICATES,
  ONTOLOGY_PREDICATES,
  ONTOLOGY_TYPE_OBJECTS,
  RDF_TYPE,
  OWL_CLASS,
  RDFS_DOMAIN,
  RDFS_RANGE,
  vocabNs,
  xsdTerm,
} from './vocab';
import { DATATYPES } from './types';

export interface EntryDraft {
  graph: GraphName;
  subject: string;
  /** termKey of the class picked for the subject (Data tab only, optional; TYPE-01). */
  classKey?: string;
  /** termKey of the class picked for an entity object (Data tab only, optional). */
  objectClassKey?: string;
  predicate: string;
  objectKind: 'entity' | 'value';
  object: string;
  datatype: Datatype;
  /**
   * Ontology tab, subject and object both classes (ENT-09): record the entry as
   * a relationship, i.e. a domain and a range triple. Default true; false adds
   * the plain triple as typed.
   */
  asRelationship?: boolean;
  /** Ontology tab (ENT-10): the subject / entity object is a class; adds "x type Class" if it isn't one yet. */
  subjectIsClass?: boolean;
  objectIsClass?: boolean;
}

/** ENT-09: a class-to-class entry that can be recorded as a relationship. */
export interface RelationshipOffer {
  property: IriTerm;
  domain: IriTerm;
  range: IriTerm;
  /** True when the entry will be recorded this way (the user hasn't chosen the plain triple). */
  recorded: boolean;
  /** Terms ticked as classes that this entry also records as classes (ENT-10). */
  newClasses: IriTerm[];
}

export type EntryField = 'subject' | 'predicate' | 'object';

export interface EntryResult {
  /** Triples to add, in order. Empty when there are errors. */
  triples: Omit<Triple, 'id'>[];
  errors: Partial<Record<EntryField, string>>;
  relationship?: RelationshipOffer;
  /** Resolved terms, for showing the IRI that will be generated (ENT-06), and the literal as exported. */
  preview: { subject?: IriTerm; predicate?: IriTerm; object?: IriTerm; literal?: LiteralTerm };
  /** ENT-10: whether the subject / object is already a class in the Ontology graph. */
  alreadyClass: { subject: boolean; object: boolean };
  /**
   * ENT-12: on the Ontology tab, the user's own relationship links two terms
   * that are neither classes nor ticked as classes. A hint only; never blocks.
   */
  classHint?: { subject: IriTerm; object: IriTerm };
  /** DUP-01: the entry would only repeat a triple that is already there (shown as an error on the object). */
  alreadyExists?: true;
}

/** Terms already in the store plus terms created earlier in this same entry. */
class TermIndex {
  private byKey: Map<string, IriTerm>;
  private byLabel = new Map<string, IriTerm>();

  constructor(triples: readonly Triple[]) {
    this.byKey = collectTerms(triples);
    for (const t of this.byKey.values()) this.indexLabel(t);
  }

  private indexLabel(t: IriTerm) {
    const k = `${t.ns}|${t.label}`;
    if (!this.byLabel.has(k)) this.byLabel.set(k, t);
  }

  get(ns: NsKey, local: string) {
    return this.byKey.get(termKey({ ns, local }));
  }

  findByLabel(ns: NsKey, label: string) {
    return this.byLabel.get(`${ns}|${label}`);
  }

  /**
   * A new term from a typed name. If its local name is already taken by a
   * differently typed name, it gets a numbered suffix so two terms never
   * share an IRI (ID-08).
   */
  create(ns: NsKey, label: string, kind: NameKind): IriTerm | undefined {
    const base = toLocalName(label, kind);
    if (!base) return undefined;
    let local = base;
    for (let n = 2; this.byKey.has(termKey({ ns, local })); n++) local = `${base}_${n}`;
    return this.add({ kind: 'iri', ns, local, label });
  }

  add(t: IriTerm): IriTerm {
    const k = termKey(t);
    if (!this.byKey.has(k)) {
      this.byKey.set(k, t);
      this.indexLabel(t);
    }
    return this.byKey.get(k)!;
  }
}

const LOCAL_NAME_OK = /^[\p{L}\p{N}_][\p{L}\p{M}\p{N}_-]*$/u;
/** Longest subject, predicate or entity object accepted (field checks). */
export const MAX_NAME_LENGTH = 120;
// Looks like a vocabulary prefix (lower-case, e.g. skos:prefLabel), not a name that happens to contain a colon (Q1:Revenue).
const PREFIXED_SHAPE = /^([a-z][a-z0-9-]*):([A-Za-z_][^\s:/]*)$/;

function matchByLabel(list: readonly IriTerm[], text: string): IriTerm | undefined {
  const lower = text.toLowerCase();
  return list.find((t) => t.label.toLowerCase() === lower);
}

type Resolved = { term: IriTerm } | { error: string };

function resolvePrefixed(text: string, settings: ProjectSettings, index: TermIndex): Resolved | undefined {
  const parsed = parsePrefixed(text, settings);
  if (!parsed) {
    // Looks like "prefix:name" but the prefix is unknown: say so rather than make an odd name from it.
    const m = PREFIXED_SHAPE.exec(text);
    return m
      ? {
          error: `"${m[1]}:" isn't a known prefix. Use ${settings.data.prefix}:, ${settings.ontology.prefix}:, a built-in one such as skos:, or add it under Settings (⚙).`,
        }
      : undefined;
  }
  const { ns, local } = parsed;
  if (!local) return { error: `Add a name after "${text}".` };
  if (!LOCAL_NAME_OK.test(local)) return { error: `"${local}" can't be used as a name after the prefix.` };
  const existing = index.get(ns, local);
  if (existing) return { term: existing };
  const known = [...ONTOLOGY_PREDICATES, ...ONTOLOGY_TYPE_OBJECTS].find((t) => t.ns === ns && t.local === local);
  return { term: index.add(known ?? { kind: 'iri', ns, local, label: local }) };
}

function resolveName(text: string, ns: NsKey, kind: NameKind, index: TermIndex): Resolved {
  if (text.length > MAX_NAME_LENGTH) return { error: `Keep it to ${MAX_NAME_LENGTH} characters or fewer.` };
  const existing = index.findByLabel(ns, text);
  if (existing) return { term: existing };
  const created = index.create(ns, text, kind);
  return created ? { term: created } : { error: 'Use at least one letter or number.' };
}

function resolvePredicate(draft: EntryDraft, settings: ProjectSettings, index: TermIndex): Resolved | undefined {
  const text = draft.predicate.trim();
  if (!text) return undefined;
  const prefixed = resolvePrefixed(text, settings, index);
  if (prefixed) return prefixed;
  // "type" also means rdf:type on the Data tab, matching how class-picker triples are listed.
  const common = draft.graph === 'data' ? [...DATA_COMMON_PREDICATES, RDF_TYPE] : ONTOLOGY_PREDICATES;
  const builtin = matchByLabel(common, text);
  if (builtin) return { term: index.add(builtin) };
  // Your own predicates live in the Ontology namespace on both tabs.
  return resolveName(text, 'ontology', 'predicate', index);
}

function isType(p: IriTerm | undefined) {
  return !!p && termKey(p) === termKey(RDF_TYPE);
}

function isRange(p: IriTerm | undefined) {
  return !!p && termKey(p) === termKey(RDFS_RANGE);
}

function resolveObjectEntity(
  text: string,
  draft: EntryDraft,
  p: IriTerm | undefined,
  settings: ProjectSettings,
  index: TermIndex,
): Resolved {
  const prefixed = resolvePrefixed(text, settings, index);
  if (prefixed) return prefixed;
  if (draft.graph === 'ontology') {
    if (isType(p)) {
      const t = matchByLabel(ONTOLOGY_TYPE_OBJECTS, text);
      if (t) return { term: index.add(t) };
    }
    if (isRange(p) && (DATATYPES as readonly string[]).includes(text)) {
      return { term: index.add(xsdTerm(text as Datatype)) };
    }
    const kind: NameKind = p && p.ns === vocabNs('rdfs') && p.local === 'subPropertyOf' ? 'predicate' : 'entity';
    return resolveName(text, 'ontology', kind, index);
  }
  // Data tab: the object of "type" is a class from the Ontology graph.
  if (isType(p)) return resolveName(text, 'ontology', 'entity', index);
  return resolveName(text, 'data', 'entity', index);
}

/** Checks a literal against its datatype (LIT-02); returns the value as stored. */
export function validateLiteral(raw: string, dt: Datatype): { value: string } | { error: string } {
  const value = dt === 'string' ? raw : raw.trim();
  if (value.trim() === '') return { error: dt === 'boolean' ? 'Choose true or false.' : 'Enter a literal.' };
  switch (dt) {
    case 'integer':
      return /^[+-]?\d+$/.test(value) ? { value } : { error: 'An integer is a whole number, e.g. 42.' };
    case 'decimal':
      if (/^[+-]?\d+,\d+$/.test(value)) return { error: 'Use a dot for decimals, e.g. 3.14.' };
      return /^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(value) ? { value } : { error: 'A decimal is a number, e.g. 3.14.' };
    case 'boolean': {
      const lower = value.toLowerCase();
      return lower === 'true' || lower === 'false' ? { value: lower } : { error: 'Choose true or false.' };
    }
    case 'date':
      return isRealDate(value) ? { value } : { error: 'Use a date like 2026-10-14.' };
    case 'dateTime': {
      // The browser's date-time picker leaves out the seconds; xsd:dateTime needs them.
      const full = /T\d{2}:\d{2}$/.test(value) ? `${value}:00` : value;
      const m = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/.exec(full);
      return m && isRealDate(m[1]) ? { value: full } : { error: 'Use a date and time like 2026-10-14T09:30:00.' };
    }
    default:
      return { value };
  }
}

/** The literal as it appears in the exported Turtle, e.g. "2026-10-14"^^xsd:date. */
export function literalPreview(l: LiteralTerm): string {
  const quoted = JSON.stringify(l.value);
  return l.datatype === 'string' ? quoted : `${quoted}^^xsd:${l.datatype}`;
}

function isRealDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

/**
 * `known` adds terms to look names up in without counting their triples as
 * part of the store; Edit triple passes the whole store here and the store
 * minus the triple being edited as `store` (EDIT-02).
 */
export function resolveEntry(
  draft: EntryDraft,
  store: readonly Triple[],
  settings: ProjectSettings,
  known: readonly Triple[] = store,
): EntryResult {
  const index = new TermIndex(known);
  const errors: EntryResult['errors'] = {};
  const preview: EntryResult['preview'] = {};
  const alreadyClass = { subject: false, object: false };
  const ontologyClasses = new Set(inferOntologyTyping(store).classes.map(termKey));
  const ticked = draft.graph === 'ontology';

  const subjectText = draft.subject.trim();
  const predicateText = draft.predicate.trim();
  const objectText = draft.objectKind === 'value' ? draft.object : draft.object.trim();
  const classes = draft.graph === 'data' ? inferOntologyTyping(store).classes : [];
  const findClass = (key?: string) => (key ? classes.find((c) => termKey(c) === key) : undefined);
  const cls = findClass(draft.classKey);
  const objectCls = draft.objectKind === 'entity' ? findClass(draft.objectClassKey) : undefined;
  // With a class picked (TYPE-02), or the subject ticked as a class on the
  // Ontology tab (ENT-10), the subject alone is a complete entry.
  const classOnly = (!!cls || (ticked && !!draft.subjectIsClass)) && !predicateText && !objectText.trim();

  // Predicate first: on the Ontology tab it decides whether a new subject is
  // a class (PascalCase) or a property (camelCase).
  const p = resolvePredicate(draft, settings, index);
  if (p && 'term' in p) preview.predicate = p.term;
  else if (p) errors.predicate = p.error;
  else if (!classOnly) errors.predicate = 'Enter a predicate.';
  const pTerm = p && 'term' in p ? p.term : undefined;

  let o: ObjectTerm | undefined;
  let oText: Resolved | undefined;
  if (draft.objectKind === 'value') {
    if (!classOnly) {
      const v = validateLiteral(objectText, draft.datatype);
      if ('error' in v) errors.object = v.error;
      else o = preview.literal = { kind: 'literal', value: v.value, datatype: draft.datatype } satisfies LiteralTerm;
    }
  } else if (objectText) {
    // Resolve the object before the subject only when it is a type such as
    // ObjectProperty, which makes the subject a property.
    if (draft.graph === 'ontology' && isType(pTerm)) {
      oText = resolveObjectEntity(objectText, draft, pTerm, settings, index);
    }
  } else if (!classOnly) {
    errors.object = 'Enter an object.';
  }

  let s: IriTerm | undefined;
  if (!subjectText) {
    errors.subject = 'Enter a subject.';
  } else {
    const prefixed = resolvePrefixed(subjectText, settings, index);
    let r: Resolved;
    if (prefixed) r = prefixed;
    else if (draft.graph === 'data') r = resolveName(subjectText, 'data', 'entity', index);
    else {
      // A subject ticked as a class is named like one (PascalCase), whatever the predicate.
      const isProperty =
        !draft.subjectIsClass &&
        ((pTerm && predicateMakesSubjectAProperty(pTerm)) || (oText && 'term' in oText && isPropertyType(oText.term)));
      r = resolveName(subjectText, 'ontology', isProperty ? 'predicate' : 'entity', index);
    }
    if ('term' in r) s = preview.subject = r.term;
    else errors.subject = r.error;
  }

  if (draft.objectKind === 'entity' && objectText) {
    oText ??= resolveObjectEntity(objectText, draft, pTerm, settings, index);
    if ('term' in oText) o = preview.object = oText.term;
    else errors.object = oText.error;
  }

  if (s) alreadyClass.subject = ontologyClasses.has(termKey(s));
  if (o?.kind === 'iri') alreadyClass.object = ontologyClasses.has(termKey(o));
  if (Object.keys(errors).length > 0 || !s) return { triples: [], errors, preview, alreadyClass };

  // ENT-10: a term ticked as a class becomes one: "x type Class" in the Ontology graph.
  const triples: Omit<Triple, 'id'>[] = [];
  const declared = new Set<string>();
  const declare = (term: IriTerm) => {
    if (ontologyClasses.has(termKey(term)) || declared.has(termKey(term))) return;
    declared.add(termKey(term));
    triples.push({ graph: 'ontology', s: term, p: RDF_TYPE, o: OWL_CLASS });
  };
  if (ticked && draft.subjectIsClass) {
    declare(s);
    // Already a class: nothing to declare, so the entry still needs a predicate and object.
    if (classOnly && declared.size === 0 && !cls) errors.predicate = 'Enter a predicate.';
  }
  if (ticked && draft.objectIsClass && o?.kind === 'iri') declare(o);
  const isClass = (t: IriTerm) => ontologyClasses.has(termKey(t)) || declared.has(termKey(t));

  // ENT-09: "Class · relationship · Class" on the Ontology tab means "the
  // relationship goes from this class to that one", which RDF records as the
  // relationship's domain and range, not as a triple between the two classes.
  const relationship: RelationshipOffer | undefined =
    draft.graph === 'ontology' && pTerm && isOwnNs(pTerm.ns) && o?.kind === 'iri' && isClass(s) && isClass(o)
      ? {
          property: pTerm,
          domain: s,
          range: o,
          recorded: draft.asRelationship !== false,
          newClasses: [s, o].filter((t) => declared.has(termKey(t))),
        }
      : undefined;

  // Relationships are named in camelCase (ID-06); linking two of them isn't a slip worth a hint.
  const maybeClass = (t: IriTerm) => !isClass(t) && !/^\p{Ll}/u.test(t.local);
  const classHint =
    draft.graph === 'ontology' && pTerm && isOwnNs(pTerm.ns) && o?.kind === 'iri' && isOwnNs(o.ns) && maybeClass(s) && maybeClass(o)
      ? { subject: s, object: o }
      : undefined;

  if (relationship?.recorded) {
    const pair = [
      { graph: 'ontology' as const, s: relationship.property, p: RDFS_DOMAIN, o: relationship.domain },
      { graph: 'ontology' as const, s: relationship.property, p: RDFS_RANGE, o: relationship.range },
    ];
    triples.push(...pair.filter((t) => !store.some((x) => sameTriple(x, t))));
    if (triples.length === 0) errors.predicate = 'This relationship is already recorded.';
    const clash = pairingClash(store, triples);
    if (clash) errors.predicate = clash;
    return { triples: Object.keys(errors).length ? [] : triples, errors, preview, relationship, alreadyClass };
  }
  let duplicate = false;
  // "Class · type · Class" with the box ticked would only repeat the declaration.
  if (
    pTerm &&
    o &&
    !(isType(pTerm) && o.kind === 'iri' && termKey(o) === termKey(OWL_CLASS) && declared.has(termKey(s)))
  ) {
    const plain = { graph: draft.graph, s, p: pTerm, o };
    // DUP-01 (agreed 16 Oct 2026): the same triple isn't added twice.
    if (store.some((t) => sameTriple(t, plain))) duplicate = true;
    else triples.push(plain);
  }
  // TYPE-02: a picked class is written as "x rdf:type Class" in the Data graph,
  // for the subject and (by request, beyond TYPE-01) for an entity object.
  const addType = (term: IriTerm, c: IriTerm) => {
    const typeTriple = { graph: 'data' as const, s: term, p: RDF_TYPE, o: c };
    const exists = [...store, ...triples].some((t) => sameTriple(t, typeTriple));
    if (!exists) triples.push(typeTriple);
    return !exists;
  };
  // Already of that class (the picker keeps it with the subject): the entry still needs a predicate and object.
  if (cls && !addType(s, cls) && classOnly) errors.predicate = 'Enter a predicate.';
  // Not for "type": its object is already a class.
  if (objectCls && o?.kind === 'iri' && !isType(pTerm)) addType(o, objectCls);
  // Only an error when the entry would add nothing new (a picked class may still be new).
  const alreadyExists = duplicate && triples.length === 0;
  if (alreadyExists) errors.object = `This triple is already in the ${draft.graph === 'data' ? 'Data' : 'Ontology'} graph.`;
  // A domain or range typed directly can create the same clash (ENT-11).
  const clash = draft.graph === 'ontology' ? pairingClash(store, triples) : undefined;
  if (clash) errors.subject = clash;
  return {
    triples: Object.keys(errors).length ? [] : triples,
    errors,
    preview,
    relationship,
    alreadyClass,
    classHint,
    alreadyExists: alreadyExists || undefined,
  };
}

/**
 * ID-08: when a term's local name got a numbered suffix because its plain
 * form was taken by a differently typed name, the term that has it; else
 * undefined. Lets the form say why the IRI ends in _2.
 */
export function suffixClash(term: IriTerm, known: readonly Triple[]): IriTerm | undefined {
  const m = /^(.*)_\d+$/.exec(term.local);
  if (!m || toLocalName(term.label, 'entity') === term.local || toLocalName(term.label, 'predicate') === term.local) {
    return undefined;
  }
  const taken = collectTerms(known).get(termKey({ ns: term.ns, local: m[1] }));
  return taken && taken.label !== term.label ? taken : undefined;
}

/**
 * ENT-11: a relationship may have several domains or several ranges, but not
 * both. With both, RDF can't say which domain goes with which range, so the
 * either/or export (TYPE-07) would also allow pairings nobody meant. Returns
 * the message to show when the new triples would cause that, else undefined.
 */
export function pairingClash(store: readonly Triple[], added: readonly Omit<Triple, 'id'>[]): string | undefined {
  const kD = termKey(RDFS_DOMAIN);
  const kR = termKey(RDFS_RANGE);
  const touched = new Map<string, IriTerm>();
  for (const t of added) {
    if (t.graph === 'ontology' && (termKey(t.p) === kD || termKey(t.p) === kR)) touched.set(termKey(t.s), t.s);
  }
  for (const [k, property] of touched) {
    const ends = (pk: string, from: readonly Omit<Triple, 'id'>[]) => {
      const out = new Map<string, string>();
      for (const t of from) {
        if (t.graph === 'ontology' && termKey(t.s) === k && termKey(t.p) === pk && t.o.kind === 'iri') {
          out.set(termKey(t.o), t.o.label);
        }
      }
      return out;
    };
    const domains = ends(kD, [...store, ...added]);
    const ranges = ends(kR, [...store, ...added]);
    if (domains.size < 2 || ranges.size < 2) continue;
    const before = (pk: string) => [...ends(pk, store).values()].join(' or ') || 'nothing yet';
    return (
      `“${property.label}” already goes from ${before(kD)} to ${before(kR)}. One relationship can't link two ` +
      `different pairs of classes, so give this one its own, more specific name, or rename the existing one.`
    );
  }
  return undefined;
}

/**
 * SCR-01: the classes named on the setup screen, as "x type Class" triples in
 * the Ontology graph, one per distinct name.
 */
export function declareClasses(names: readonly string[], settings: ProjectSettings): Omit<Triple, 'id'>[] {
  const out: Triple[] = [];
  for (const name of names) {
    const r = resolveEntry(
      {
        graph: 'ontology',
        subject: name,
        predicate: '',
        objectKind: 'entity',
        object: '',
        datatype: 'string',
        subjectIsClass: true,
      },
      out,
      settings,
    );
    // No predicate: only the declaration is wanted.
    for (const t of r.triples) if (!out.some((x) => sameTriple(x, t))) out.push({ ...t, id: String(out.length) });
  }
  return out.map(({ id: _id, ...t }) => t);
}

/** SCR-01: the class names typed on the setup screen, one per line, with any problems. */
export function parseClassList(text: string): { names: string[]; errors: string[] } {
  const names: string[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const raw of text.split('\n')) {
    const name = raw.trim();
    if (!name) continue;
    const local = toLocalName(name, 'entity');
    if (!local) errors.push(`"${name}" needs at least one letter or number.`);
    else if (name.length > MAX_NAME_LENGTH)
      errors.push(`"${name.slice(0, 20)}…" is longer than ${MAX_NAME_LENGTH} characters.`);
    else if (seen.has(local)) errors.push(`"${name}" is listed twice.`);
    else {
      seen.add(local);
      names.push(name);
    }
  }
  return { names, errors };
}
