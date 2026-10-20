// Turtle export, one file per graph (GRAPH-05). Written with N3.Writer and
// checked by re-parsing with N3.Parser; Turtle is never built by hand.

import { DataFactory, Parser, Writer } from 'n3';
import type { Literal, NamedNode, Quad_Object } from 'n3';
import type { GraphName, IriTerm, ObjectTerm, ProjectSettings, Triple } from './types';
import { activeCustomPrefixes, fullIri, termKey } from './terms';
import { inferOntologyTyping, isDatatypeTerm } from './typing';
import { BUILTIN_PREFIXES, RDFS_DOMAIN, RDFS_LABEL, RDFS_RANGE, XSD_NAMESPACE } from './vocab';

const { namedNode, literal } = DataFactory;

const RDF_NS = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const OWL_NS = 'http://www.w3.org/2002/07/owl#';
const RDFS_NS = 'http://www.w3.org/2000/01/rdf-schema#';
const IRI_RDF_TYPE = `${RDF_NS}type`;
const CLASS_IRIS = new Set([`${OWL_NS}Class`, `${RDFS_NS}Class`]);

/** owl:unionOf of several domains or ranges (TYPE-07). */
interface Union {
  union: true;
  type: 'owl:Class' | 'rdfs:Datatype';
  members: NamedNode[];
}

type ExportObject = NamedNode | Literal | Union;

interface Group {
  subject: NamedNode;
  predicates: Map<string, { predicate: NamedNode; objects: ExportObject[]; keys: Set<string> }>;
}

export interface ExportResult {
  turtle: string;
  /** Prefixes declared in the file: only the ones used (PFX-03). */
  prefixes: string[];
  valid: boolean;
  error?: string;
  /** Number of RDF triples in the file (including those inside unions). */
  tripleCount: number;
  /** Triples from the store that this export covers. */
  storeTripleCount: number;
}

function objectKey(o: ExportObject): string {
  if ('union' in o) return `U|${o.type}|${o.members.map((m) => m.value).join(' ')}`;
  if (o.termType === 'Literal') return `L|${o.datatype.value}|${o.value}`;
  return `I|${o.value}`;
}

/** Order of predicates within a subject: type, label, domain, range, then as entered. */
const PREDICATE_ORDER = [IRI_RDF_TYPE, `${RDFS_NS}label`, `${RDFS_NS}domain`, `${RDFS_NS}range`];
function predicateRank(iri: string): number {
  const i = PREDICATE_ORDER.indexOf(iri);
  return i === -1 ? PREDICATE_ORDER.length : i;
}

/** Local part that N3.Writer can write after a prefix (mirrors its own rule). */
const WRITER_LOCAL = /^[_a-zA-Z0-9](?:\.?[-_a-zA-Z0-9])*$/;

/** N3.Writer writes these literals bare (true, 42, 3.5), so xsd isn't needed for them. */
function literalIsBare(l: Literal): boolean {
  switch (l.datatype.value) {
    case `${XSD_NAMESPACE}string`:
      return true;
    case `${XSD_NAMESPACE}boolean`:
      return l.value === 'true' || l.value === 'false';
    case `${XSD_NAMESPACE}integer`:
      return /^[+-]?\d+$/.test(l.value);
    case `${XSD_NAMESPACE}decimal`:
      return /^[+-]?\d*\.\d+$/.test(l.value);
    default:
      return false;
  }
}

export function exportGraph(store: readonly Triple[], settings: ProjectSettings, graph: GraphName): ExportResult {
  const triples = store.filter((t) => t.graph === graph);
  const iri = (t: IriTerm) => namedNode(fullIri(t, settings));
  const obj = (o: ObjectTerm): NamedNode | Literal =>
    o.kind === 'iri' ? iri(o) : literal(o.value, namedNode(XSD_NAMESPACE + o.datatype));

  const groups = new Map<string, Group>();
  const add = (s: NamedNode, p: NamedNode, o: ExportObject) => {
    let g = groups.get(s.value);
    if (!g) groups.set(s.value, (g = { subject: s, predicates: new Map() }));
    let entry = g.predicates.get(p.value);
    if (!entry) g.predicates.set(p.value, (entry = { predicate: p, objects: [], keys: new Set() }));
    const k = objectKey(o);
    if (!entry.keys.has(k)) {
      entry.keys.add(k);
      entry.objects.push(o);
    }
  };

  // TYPE-07: in the Ontology graph, several domains (or ranges) of one
  // predicate become a single owl:unionOf; a single one stays a plain triple.
  const unions = new Map<string, IriTerm[]>();
  if (graph === 'ontology') {
    for (const t of triples) {
      const pk = termKey(t.p);
      if ((pk === termKey(RDFS_DOMAIN) || pk === termKey(RDFS_RANGE)) && t.o.kind === 'iri') {
        const k = `${termKey(t.s)}#${pk}`;
        const list = unions.get(k) ?? [];
        if (!list.some((m) => termKey(m) === termKey(t.o as IriTerm))) list.push(t.o);
        unions.set(k, list);
      }
    }
  }
  const emittedUnions = new Set<string>();

  for (const t of triples) {
    const unionKey = `${termKey(t.s)}#${termKey(t.p)}`;
    const members = unions.get(unionKey);
    if (members && members.length > 1) {
      if (emittedUnions.has(unionKey)) continue;
      emittedUnions.add(unionKey);
      const type = members.every(isDatatypeTerm) ? 'rdfs:Datatype' : 'owl:Class';
      add(iri(t.s), iri(t.p), { union: true, type, members: members.map(iri) });
    } else {
      add(iri(t.s), iri(t.p), obj(t.o));
    }
  }

  // TYPE-06: types from how ontology terms are used.
  if (graph === 'ontology') {
    for (const { term, type } of inferOntologyTyping(triples).autoTypes) {
      add(iri(term), namedNode(IRI_RDF_TYPE), namedNode(OWL_NS + type));
    }
  }

  // ID-06: the typed text is kept as rdfs:label for the graph's own terms.
  const labelled = new Set<string>();
  for (const t of triples) {
    for (const term of [t.s, t.p, t.o]) {
      if (term.kind !== 'iri' || term.ns !== graph) continue;
      const k = termKey(term);
      if (labelled.has(k)) continue;
      labelled.add(k);
      add(iri(term), iri(RDFS_LABEL), literal(term.label));
    }
  }

  // Work out which prefixes the file uses, in the same way N3.Writer decides
  // whether it can abbreviate an IRI.
  const candidates: { prefix: string; namespace: string }[] = [
    { prefix: settings.data.prefix, namespace: settings.data.namespace },
    { prefix: settings.ontology.prefix, namespace: settings.ontology.namespace },
    ...BUILTIN_PREFIXES,
    // PFX-04: custom prefixes are declared like the built-in ones when used.
    // A removed one isn't, so its terms (back through Undo) are written in full.
    ...activeCustomPrefixes(settings),
  ];
  const used = new Set<string>();
  const useIri = (value: string) => {
    for (const c of candidates) {
      if (value.startsWith(c.namespace) && WRITER_LOCAL.test(value.slice(c.namespace.length))) {
        used.add(c.prefix);
        return;
      }
    }
  };
  const useObject = (o: ExportObject) => {
    if ('union' in o) {
      useIri(o.type === 'owl:Class' ? `${OWL_NS}Class` : `${RDFS_NS}Datatype`);
      useIri(`${OWL_NS}unionOf`);
      o.members.forEach((m) => useIri(m.value));
    } else if (o.termType === 'Literal') {
      if (!literalIsBare(o)) useIri(o.datatype.value);
    } else {
      useIri(o.value);
    }
  };

  // Classes first, then everything else, each in the order entered.
  const isClassGroup = (g: Group) =>
    g.predicates.get(IRI_RDF_TYPE)?.objects.some((o) => !('union' in o) && CLASS_IRIS.has(o.value)) ?? false;
  const groupList = [...groups.values()];
  const ordered = [...groupList.filter(isClassGroup), ...groupList.filter((g) => !isClassGroup(g))].map((g) => ({
    subject: g.subject,
    predicates: [...g.predicates.values()].sort(
      (a, b) => predicateRank(a.predicate.value) - predicateRank(b.predicate.value),
    ),
  }));
  let expectedCount = 0;
  for (const g of ordered) {
    useIri(g.subject.value);
    for (const { predicate, objects } of g.predicates) {
      if (predicate.value !== IRI_RDF_TYPE) useIri(predicate.value);
      for (const o of objects) {
        useObject(o);
        // A union is 1 triple + its blank node's type and unionOf + 2 per list item.
        expectedCount += 'union' in o ? 3 + 2 * o.members.length : 1;
      }
    }
  }

  // Own prefixes first, then the vocabularies alphabetically.
  const declared = candidates
    .filter((c) => used.has(c.prefix))
    .sort((a, b) => {
      const rank = (p: string) => (p === settings.data.prefix ? 0 : p === settings.ontology.prefix ? 1 : 2);
      return rank(a.prefix) - rank(b.prefix) || a.prefix.localeCompare(b.prefix);
    });
  const prefixes: Record<string, string> = {};
  for (const c of declared) prefixes[c.prefix] = c.namespace;

  const writer = new Writer({ prefixes });
  for (const g of ordered) {
    for (const { predicate, objects } of g.predicates) {
      for (const o of objects) {
        let object: Quad_Object;
        if ('union' in o) {
          const typeIri = o.type === 'owl:Class' ? `${OWL_NS}Class` : `${RDFS_NS}Datatype`;
          object = writer.blank([
            { predicate: namedNode(IRI_RDF_TYPE), object: namedNode(typeIri) },
            // N3.Writer.list returns a serialised list term; its typing says otherwise.
            { predicate: namedNode(`${OWL_NS}unionOf`), object: writer.list(o.members) as unknown as Quad_Object },
          ]);
        } else {
          object = o;
        }
        writer.addQuad(g.subject, predicate, object);
      }
    }
  }
  let turtle = '';
  writer.end((error, result) => {
    if (error) throw error;
    turtle = result;
  });

  const check = validateTurtle(turtle);
  const valid = check.valid && check.count === expectedCount;
  return {
    turtle,
    prefixes: declared.map((d) => d.prefix),
    valid,
    error: check.error ?? (valid ? undefined : `Expected ${expectedCount} triples but the file holds ${check.count}.`),
    tripleCount: check.count,
    storeTripleCount: triples.length,
  };
}

/** Re-parses Turtle to confirm it is valid (FLOW-05). */
export function validateTurtle(turtle: string): { valid: boolean; count: number; error?: string } {
  try {
    const quads = new Parser({ format: 'text/turtle' }).parse(turtle);
    return { valid: true, count: quads.length };
  } catch (e) {
    return { valid: false, count: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

/** File name suggestion from the project name, e.g. "individual-client-data.ttl". */
export function defaultFileName(projectName: string, graph: GraphName): string {
  return `${fileSlug(projectName)}-${graph}.ttl`;
}

/** The project name as a file name, e.g. "individual-client"; "triplet" when it has no letters or digits. */
export function fileSlug(projectName: string): string {
  const slug = projectName
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'triplet';
}
