// Milestone 8: start a new project from Turtle files (IMP-01–09). Each file
// goes into the graph the user chose for it (IMP-02); this module reads the
// files with N3.Parser and turns them into the store's triples, reversing
// what the export does: labels of the graph's own terms become names (IMP-05),
// types Triplet adds on export are not stored (TYPE-06), and owl:unionOf
// domains and ranges are split back into one triple per class (TYPE-07).
// Whatever Triplet can't show is left out or simplified and listed (IMP-07).

import { Parser, type Literal, type Quad, type Term } from 'n3';
import { OWL_EQUIVALENT_CLASS, OWL_EQUIVALENT_PROPERTY, OWL_SAME_AS } from './duplicates';
import { pairingClash, validateLiteral } from './entry';
import { tripleContentKey } from './conformance';
import { termKey } from './terms';
import { normaliseBase, validateCustomPrefix, validateSetup, type SetupDraft } from './settings';
import { inferOntologyTyping, PROPERTY_KIND_TYPES } from './typing';
import {
  DATATYPES,
  type CustomPrefix,
  type Datatype,
  type GraphName,
  type IriTerm,
  type LiteralTerm,
  type NsKey,
  type ObjectTerm,
  type ProjectSettings,
  type Triple,
} from './types';
import {
  BUILTIN_PREFIXES,
  DATA_COMMON_PREDICATES,
  ONTOLOGY_PREDICATES,
  ONTOLOGY_TYPE_OBJECTS,
  OWL_CLASS,
  RDF_TYPE,
  RDFS_CLASS,
  RDFS_DOMAIN,
  RDFS_LABEL,
  RDFS_RANGE,
  vocabNs,
  XSD_NAMESPACE,
  xsdTerm,
} from './vocab';

const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
const OWL = 'http://www.w3.org/2002/07/owl#';
const IRI = {
  type: `${RDF}type`,
  first: `${RDF}first`,
  rest: `${RDF}rest`,
  nil: `${RDF}nil`,
  langString: `${RDF}langString`,
  string: `${XSD_NAMESPACE}string`,
  label: `${RDFS}label`,
  domain: `${RDFS}domain`,
  range: `${RDFS}range`,
  datatype: `${RDFS}Datatype`,
  owlClass: `${OWL}Class`,
  unionOf: `${OWL}unionOf`,
  restriction: `${OWL}Restriction`,
};

// ---------------------------------------------------------------------------
// Reading a file

export interface ParsedFile {
  fileName: string;
  quads: Quad[];
  /** The file's own @prefix declarations, prefix → namespace. */
  prefixes: Record<string, string>;
}

export interface ParseError {
  fileName: string;
  message: string;
  line?: number;
}

/** IMP-03: reads one file; a file that isn't valid Turtle is refused with the parser's message and line. */
export function readTurtle(fileName: string, text: string): ParsedFile | ParseError {
  const prefixes: Record<string, string> = {};
  try {
    const quads = new Parser({ format: 'text/turtle' }).parse(text, null, (prefix, iri) => {
      prefixes[prefix] = iri.value;
    });
    return { fileName, quads, prefixes };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const line = (e as { context?: { line?: number } }).context?.line;
    return { fileName, message, line };
  }
}

export function isParseError(r: ParsedFile | ParseError): r is ParseError {
  return 'message' in r;
}

// ---------------------------------------------------------------------------
// The result shown in the summary (IMP-03) and used to create the project

export interface ImportNote {
  graph: GraphName;
  /** Left out: not imported. Simplified: imported in a form Triplet can show. Handled: nothing lost. */
  kind: 'left-out' | 'simplified' | 'handled';
  /** What it is, e.g. "OWL restrictions". */
  what: string;
  /** Why, in plain words. */
  why: string;
  count: number;
  /** The first one, in Turtle-like short form. */
  example?: string;
}

export interface ImportPrefix {
  prefix: string;
  namespace: string;
  /** What it became in the project. */
  role: 'data' | 'ontology' | 'built-in' | 'custom' | 'unused';
  /** For a custom prefix whose file name couldn't be used: the name it got instead. */
  renamedTo?: string;
}

export interface ImportPlan {
  /** Base address and graph names to fill into the setup fields (IMP-04). */
  names: Omit<SetupDraft, 'name'>;
  /** Which of `names` were read from the files rather than kept from the form. */
  detected: { base: boolean; dataPath: boolean; ontologyPath: boolean };
  customPrefixes: CustomPrefix[];
  triples: Omit<Triple, 'id'>[];
  perGraph: Partial<Record<GraphName, { fileName: string; fileTriples: number; stored: number }>>;
  prefixes: ImportPrefix[];
  notes: ImportNote[];
}

// ---------------------------------------------------------------------------
// Namespaces (IMP-04)

/** Splits an IRI after its last "/" or "#": namespace and local name. */
function splitIri(iri: string): { ns: string; local: string } {
  const i = Math.max(iri.lastIndexOf('/'), iri.lastIndexOf('#'));
  return { ns: iri.slice(0, i + 1), local: iri.slice(i + 1) };
}

function builtinOf(iri: string) {
  return BUILTIN_PREFIXES.find((b) => iri.startsWith(b.namespace) && iri.length > b.namespace.length);
}

/** "https://example.org/data/" → base "https://example.org/" + name "data", when it fits ID-01. */
function fitGraph(ns: string): { base: string; path: string } | undefined {
  if (!ns.endsWith('/')) return undefined;
  const { ns: base, local: path } = splitIri(ns.slice(0, -1));
  if (!base || !path) return undefined;
  const errors = validateSetup({ name: 'x', base, dataPath: path, ontologyPath: `${path}x` });
  if (errors.base || errors.dataPath || normaliseBase(base) !== base) return undefined;
  return { base, path };
}

/** Namespaces of the file's subjects, most used first (distinct subjects counted once). */
function subjectNamespaces(file: ParsedFile): string[] {
  const seen = new Set<string>();
  const count = new Map<string, number>();
  for (const q of file.quads) {
    if (q.subject.termType !== 'NamedNode' || seen.has(q.subject.value)) continue;
    seen.add(q.subject.value);
    if (builtinOf(q.subject.value)) continue;
    const { ns, local } = splitIri(q.subject.value);
    if (!local) continue;
    count.set(ns, (count.get(ns) ?? 0) + 1);
  }
  const declared = new Set(Object.values(file.prefixes));
  return [...count.entries()]
    .sort((a, b) => b[1] - a[1] || Number(declared.has(b[0])) - Number(declared.has(a[0])))
    .map(([ns]) => ns);
}

/** Every namespace used anywhere in the files (subjects, predicates, objects, datatypes), most used first. */
function allNamespaces(files: readonly ParsedFile[]): string[] {
  const count = new Map<string, number>();
  const add = (t: Term) => {
    if (t.termType !== 'NamedNode' || builtinOf(t.value)) return;
    const { ns, local } = splitIri(t.value);
    if (local) count.set(ns, (count.get(ns) ?? 0) + 1);
  };
  for (const f of files) for (const q of f.quads) [q.subject, q.predicate, q.object].forEach(add);
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([ns]) => ns);
}

interface GraphNamespaces {
  names: ImportPlan['names'];
  detected: ImportPlan['detected'];
  /** The namespaces whose terms become the graphs' own terms. */
  own: Partial<Record<GraphName, string>>;
}

/**
 * IMP-04: each graph's namespace is the one most of its file's subjects use.
 * It becomes the graph's namespace when it fits base + name + "/" (ID-01) and
 * shares the base address with the other graph; the Ontology graph's base
 * wins when they differ. A namespace both files use goes to the Ontology
 * graph. IRIs never change on import; whatever doesn't fit becomes a custom
 * prefix instead.
 */
function detectGraphs(files: Partial<Record<GraphName, ParsedFile>>, fallback: SetupDraft): GraphNamespaces {
  const candidate = (g: GraphName) => {
    const f = files[g];
    if (!f) return undefined;
    // When the most used namespace doesn't fit ID-01, it becomes a custom prefix.
    const ns = subjectNamespaces(f)[0];
    const fit = ns ? fitGraph(ns) : undefined;
    return fit ? { ns, ...fit } : undefined;
  };
  let ont = candidate('ontology');
  let data = candidate('data');
  if (data && ont && data.ns === ont.ns) data = undefined;
  const base = ont?.base ?? data?.base;
  if (data && base !== data.base) data = undefined;

  // A graph without a file of its own (or whose namespace didn't fit) may
  // still be used in the other file, e.g. a Data file's classes and relationships.
  if (base) {
    const taken = new Set([ont?.ns, data?.ns]);
    const other = allNamespaces(Object.values(files).filter((f): f is ParsedFile => !!f))
      .filter((ns) => !taken.has(ns))
      .map((ns) => ({ ns, fit: fitGraph(ns) }))
      .find((x) => x.fit?.base === base && x.fit.path !== (ont ?? data)?.path);
    if (other?.fit) {
      if (!ont && !files.ontology) ont = { ns: other.ns, ...other.fit };
      else if (!data && !files.data) data = { ns: other.ns, ...other.fit };
    }
  }

  // Names not found in the files come from the form, kept apart from the found one.
  const pick = (found: string | undefined, wanted: string, other: string | undefined, dflt: string) => {
    if (found) return found;
    const w = wanted.trim();
    if (w && w !== other) return w;
    return dflt !== other ? dflt : `${dflt}2`;
  };
  const ontologyPath = pick(ont?.path, fallback.ontologyPath, data?.path, 'ontology');
  const dataPath = pick(data?.path, fallback.dataPath, ontologyPath, 'data');
  return {
    names: { base: base ?? fallback.base, dataPath, ontologyPath },
    detected: { base: !!base, dataPath: !!data, ontologyPath: !!ont },
    own: { data: data?.ns, ontology: ont?.ns },
  };
}

// ---------------------------------------------------------------------------
// Literals (LIT-02, IMP-07)

const INTEGER_TYPES = new Set(
  [
    'int',
    'long',
    'short',
    'byte',
    'nonNegativeInteger',
    'positiveInteger',
    'nonPositiveInteger',
    'negativeInteger',
    'unsignedInt',
    'unsignedLong',
    'unsignedShort',
    'unsignedByte',
  ].map((l) => XSD_NAMESPACE + l),
);
const DECIMAL_TYPES = new Set(['double', 'float'].map((l) => XSD_NAMESPACE + l));

type LiteralResult = { term: LiteralTerm; change?: 'lang' | 'datatype' | 'invalid'; from?: string };

/**
 * A literal as Triplet can store it. Language tags are dropped; integer-like
 * types become integer and double or float become decimal when the value
 * allows; any other datatype, or a value that doesn't fit its datatype, is
 * kept as text (xsd:string).
 */
function convertLiteral(value: string, datatype: string, language: string): LiteralResult {
  const text = (): LiteralTerm => ({ kind: 'literal', value, datatype: 'string' });
  if (language) return { term: text(), change: 'lang', from: `@${language}` };
  const local = datatype.startsWith(XSD_NAMESPACE) ? datatype.slice(XSD_NAMESPACE.length) : '';
  if (local === 'string') return { term: text() };
  const as = (dt: Datatype): LiteralTerm | undefined => {
    const v = validateLiteral(value, dt);
    return 'value' in v ? { kind: 'literal', value: v.value, datatype: dt } : undefined;
  };
  if ((DATATYPES as readonly string[]).includes(local)) {
    const ok = as(local as Datatype);
    return ok && ok.value === value ? { term: ok } : { term: text(), change: 'invalid', from: shortDatatype(datatype) };
  }
  const mapped = INTEGER_TYPES.has(datatype) ? as('integer') : DECIMAL_TYPES.has(datatype) ? as('decimal') : undefined;
  return { term: mapped ?? text(), change: 'datatype', from: shortDatatype(datatype) };
}

function shortDatatype(iri: string): string {
  return iri.startsWith(XSD_NAMESPACE) ? `xsd:${iri.slice(XSD_NAMESPACE.length)}` : `<${iri}>`;
}

// ---------------------------------------------------------------------------
// Terms and labels (IMP-05)

/** Standard terms the entry form already knows by a plain-English name, so imported ones match typed ones. */
const KNOWN_VOCAB = new Map<string, IriTerm>(
  [
    ...ONTOLOGY_PREDICATES,
    ...ONTOLOGY_TYPE_OBJECTS,
    ...DATA_COMMON_PREDICATES,
    RDF_TYPE,
    RDFS_CLASS,
    OWL_SAME_AS,
    OWL_EQUIVALENT_CLASS,
    OWL_EQUIVALENT_PROPERTY,
    ...DATATYPES.map(xsdTerm),
  ].map((t) => [termKey(t), t]),
);

const K_LABEL = termKey(RDFS_LABEL);
const K_TYPE = termKey(RDF_TYPE);
const K_DOMAIN = termKey(RDFS_DOMAIN);
const K_RANGE = termKey(RDFS_RANGE);
const K_OWL_CLASS = termKey(OWL_CLASS);
const K_RDFS_CLASS = termKey(RDFS_CLASS);

// ---------------------------------------------------------------------------
// The import itself

const UNNAMED = {
  what: "IRIs Triplet can't name",
  why: 'Triplet names a term after the part of its IRI after the last / or #, with the rest as its namespace. These IRIs end in / or #, or have no such namespace (e.g. urn: or relative IRIs).',
};

class Notes {
  private map = new Map<string, ImportNote>();
  add(graph: GraphName, kind: ImportNote['kind'], what: string, why: string, example?: string, n = 1) {
    const k = `${graph}|${kind}|${what}`;
    const note = this.map.get(k);
    if (note) note.count += n;
    else this.map.set(k, { graph, kind, what, why, count: n, example });
  }
  list(): ImportNote[] {
    const rank = { 'left-out': 0, simplified: 1, handled: 2 };
    return [...this.map.values()].sort((a, b) => rank[a.kind] - rank[b.kind]);
  }
}

/**
 * IMP-03–08: everything needed to show the summary and create the project.
 * `fallback` is what the setup form holds, used for names the files don't give.
 */
export function planImport(files: Partial<Record<GraphName, ParsedFile>>, fallback: SetupDraft): ImportPlan {
  const graphs = (['data', 'ontology'] as const).filter((g) => files[g]);
  const detected = detectGraphs(files, fallback);
  const settings: ProjectSettings = {
    name: fallback.name,
    data: { namespace: `${normaliseBase(detected.names.base)}${detected.names.dataPath}/`, prefix: detected.names.dataPath },
    ontology: {
      namespace: `${normaliseBase(detected.names.base)}${detected.names.ontologyPath}/`,
      prefix: detected.names.ontologyPath,
    },
    customPrefixes: [],
  };
  const own = new Map<string, 'data' | 'ontology'>();
  if (detected.own.data) own.set(detected.own.data, 'data');
  if (detected.own.ontology) own.set(detected.own.ontology, 'ontology');
  // The graph namespaces the setup fields will give, when they weren't in the files.
  own.set(settings.data.namespace, own.get(settings.data.namespace) ?? 'data');
  own.set(settings.ontology.namespace, own.get(settings.ontology.namespace) ?? 'ontology');

  const notes = new Notes();
  const declared = new Map<string, string>(); // namespace → first file prefix
  for (const g of graphs) {
    for (const [p, ns] of Object.entries(files[g]!.prefixes)) if (!declared.has(ns)) declared.set(ns, p);
  }

  // Custom prefixes (PFX-04) for every other namespace, named as in the file where valid.
  const customs: CustomPrefix[] = [];
  const customByNs = new Map<string, CustomPrefix>();
  const customFor = (ns: string): CustomPrefix | undefined => {
    const found = customByNs.get(ns);
    if (found) return found;
    const s = { ...settings, customPrefixes: customs };
    // e.g. "urn:isbn:1" or a relative IRI: no namespace a prefix could stand for.
    if (validateCustomPrefix({ prefix: 'x', namespace: ns }, s).namespace) return undefined;
    const ok = (prefix: string) => Object.keys(validateCustomPrefix({ prefix, namespace: ns }, s)).length === 0;
    const fromFile = declared.get(ns);
    const tail = splitIri(ns.replace(/[/#]$/, '')).local.replace(/[^A-Za-z0-9_-]/g, '');
    let prefix = [fromFile, tail].find((p) => p && ok(p));
    for (let n = 1; !prefix; n++) if (ok(`ns${n}`)) prefix = `ns${n}`;
    const c: CustomPrefix = { id: `imported-${customs.length + 1}`, prefix, namespace: ns };
    customs.push(c);
    customByNs.set(ns, c);
    return c;
  };

  /** An IRI as namespace key + local name, or undefined when Triplet can't name it (see UNNAMED). */
  const toTerm = (iri: string): Omit<IriTerm, 'label'> | undefined => {
    const b = builtinOf(iri);
    if (b) return { kind: 'iri', ns: vocabNs(b.prefix), local: iri.slice(b.namespace.length) };
    const { ns, local } = splitIri(iri);
    if (!local) return undefined;
    const g = own.get(ns);
    if (g) return { kind: 'iri', ns: g, local };
    const c = customFor(ns);
    return c ? { kind: 'iri', ns: `custom:${c.id}` as NsKey, local } : undefined;
  };

  const shortIri = (iri: string) => {
    const b = builtinOf(iri);
    if (b) return `${b.prefix}:${iri.slice(b.namespace.length)}`;
    const { ns, local } = splitIri(iri);
    const p = declared.get(ns);
    return p !== undefined && /^[\w-]*$/.test(local) ? `${p}:${local}` : `<${iri}>`;
  };
  const shortTerm = (t: Term): string => {
    if (t.termType === 'NamedNode') return t.value === IRI.type ? 'a' : shortIri(t.value);
    if (t.termType === 'BlankNode') return '[…]';
    if (t.termType === 'Literal') {
      const l = t as Term & { language: string; datatype: { value: string } };
      const v = JSON.stringify(t.value.length > 40 ? `${t.value.slice(0, 40)}…` : t.value);
      if (l.language) return `${v}@${l.language}`;
      return l.datatype.value === `${XSD_NAMESPACE}string` ? v : `${v}^^${shortIri(l.datatype.value)}`;
    }
    return t.value;
  };
  const shortQuad = (q: Quad) => `${shortTerm(q.subject)} ${shortTerm(q.predicate)} ${shortTerm(q.object)}`;

  type Raw = { graph: GraphName; s: Omit<IriTerm, 'label'>; p: Omit<IriTerm, 'label'>; o: Omit<IriTerm, 'label'> | LiteralTerm };
  const raw: Raw[] = [];
  /** Label literals per term, from every file, for names (IMP-05). */
  const labelsOf = new Map<string, { graph: GraphName; index: number; value: string; language: string }[]>();
  const perGraph: ImportPlan['perGraph'] = {};

  for (const graph of graphs) {
    const file = files[graph]!;
    const quads = file.quads;
    const bySubject = new Map<string, Quad[]>();
    const asObject = new Map<string, number>();
    for (const q of quads) {
      if (q.subject.termType === 'BlankNode') {
        const list = bySubject.get(q.subject.value) ?? [];
        list.push(q);
        bySubject.set(q.subject.value, list);
      }
      if (q.object.termType === 'BlankNode') asObject.set(q.object.value, (asObject.get(q.object.value) ?? 0) + 1);
    }
    const handledBlank = new Set<string>();

    /** TYPE-07: [ a owl:Class ; owl:unionOf ( A B ) ] → the IRIs A and B, or undefined if it's anything else. */
    const unionMembers = (b: string): { members: string[]; nodes: string[] } | undefined => {
      if ((asObject.get(b) ?? 0) !== 1) return undefined;
      const qs = bySubject.get(b) ?? [];
      let list: Term | undefined;
      for (const q of qs) {
        if (q.predicate.value === IRI.unionOf && !list) list = q.object;
        else if (!(q.predicate.value === IRI.type && (q.object.value === IRI.owlClass || q.object.value === IRI.datatype)))
          return undefined;
      }
      const members: string[] = [];
      const nodes = [b];
      while (list && list.termType === 'BlankNode') {
        const item = bySubject.get(list.value) ?? [];
        const first = item.find((q) => q.predicate.value === IRI.first);
        const rest = item.find((q) => q.predicate.value === IRI.rest);
        if (item.length !== 2 || !first || !rest || first.object.termType !== 'NamedNode') return undefined;
        if ((asObject.get(list.value) ?? 0) !== 1) return undefined;
        members.push(first.object.value);
        nodes.push(list.value);
        list = rest.object;
      }
      if (!list || list.value !== IRI.nil || members.length === 0) return undefined;
      return { members, nodes };
    };

    /** Marks a left-out structure's blank nodes, so its inner nodes aren't listed again. */
    const reach = (b: string) => {
      if (handledBlank.has(b)) return;
      handledBlank.add(b);
      for (const q of bySubject.get(b) ?? []) if (q.object.termType === 'BlankNode') reach(q.object.value);
    };
    const blankKind = (b: string): { what: string; why: string } => {
      const qs = bySubject.get(b) ?? [];
      if (qs.some((q) => q.predicate.value === IRI.type && q.object.value === IRI.restriction))
        return { what: 'OWL restrictions', why: "Triplet can't show restrictions (owl:Restriction) yet." };
      if (qs.some((q) => q.predicate.value === IRI.first))
        return { what: 'RDF lists', why: "Triplet can't show lists ( … ) yet." };
      if (qs.some((q) => [IRI.unionOf, `${OWL}intersectionOf`, `${OWL}complementOf`, `${OWL}oneOf`].includes(q.predicate.value)))
        return { what: 'OWL class expressions', why: 'Only an either/or (owl:unionOf) domain or range can be shown.' };
      return { what: 'Blank nodes', why: 'Every term in Triplet needs its own IRI; [ … ] nodes have none.' };
    };

    let unions = 0;
    for (const q of quads) {
      if (q.subject.termType === 'BlankNode') {
        // Part of a structure; counted with the statement that points to it, or below if nothing does.
        continue;
      }
      const s = toTerm(q.subject.value);
      const p = toTerm(q.predicate.value);
      if (q.object.termType === 'BlankNode') {
        const b = q.object.value;
        const union =
          graph === 'ontology' && (q.predicate.value === IRI.domain || q.predicate.value === IRI.range)
            ? unionMembers(b)
            : undefined;
        const members = union?.members.map(toTerm);
        if (s && p && union && members?.every((m) => m)) {
          union.nodes.forEach((n) => handledBlank.add(n));
          for (const m of members) raw.push({ graph, s, p, o: m! });
          unions++;
          continue;
        }
        const kind = union ? UNNAMED : blankKind(b);
        reach(b);
        notes.add(graph, 'left-out', kind.what, kind.why, shortQuad(q));
        continue;
      }
      let o: Raw['o'] | undefined;
      if (q.object.termType === 'Literal') {
        const lit = q.object as Term & { language: string; datatype: { value: string } };
        const r = convertLiteral(lit.value, lit.datatype.value, lit.language);
        o = r.term;
        if (r.change === 'lang')
          notes.add(graph, 'simplified', 'Language tags', 'Kept as plain text without the tag; Triplet has no language tags yet.', shortQuad(q));
        else if (r.change === 'datatype')
          notes.add(
            graph,
            'simplified',
            `Datatype ${r.from}`,
            o.datatype === 'string'
              ? 'Triplet has no such datatype; the value is kept as text.'
              : `Stored as ${o.datatype}, the nearest datatype Triplet has.`,
            shortQuad(q),
          );
        else if (r.change === 'invalid')
          notes.add(graph, 'simplified', `Values that don't fit ${r.from}`, 'Kept as text, since the value isn\'t a valid one of its datatype.', shortQuad(q));
      } else {
        o = toTerm(q.object.value);
      }
      if (!s || !p || !o) {
        notes.add(graph, 'left-out', UNNAMED.what, UNNAMED.why, shortQuad(q));
        continue;
      }
      raw.push({ graph, s, p, o });
      // A typed label (e.g. "42"^^xsd:integer) stays an ordinary triple, so its datatype isn't lost.
      const text = q.object.termType === 'Literal' && [IRI.string, IRI.langString].includes((q.object as Literal).datatype.value);
      if (q.predicate.value === IRI.label && text) {
        const list = labelsOf.get(termKey(s)) ?? [];
        list.push({ graph, index: raw.length - 1, value: q.object.value, language: (q.object as Literal).language });
        labelsOf.set(termKey(s), list);
      }
    }
    // Blank-node structures nothing points to, e.g. "[] a ex:Thing".
    for (const [b, qs] of bySubject) {
      if (handledBlank.has(b) || (asObject.get(b) ?? 0) > 0) continue;
      const kind = blankKind(b);
      reach(b);
      notes.add(graph, 'left-out', kind.what, kind.why, shortQuad(qs[0]));
    }
    if (unions > 0)
      notes.add(graph, 'handled', 'Either/or domains and ranges', 'Split back into one domain or range triple per class.', undefined, unions);
    perGraph[graph] = { fileName: file.fileName, fileTriples: quads.length, stored: 0 };
  }

  // IMP-05: names. A label of the graph's own term in its own file is the term's
  // name and isn't stored, since the export writes it. Several labels: the
  // untagged one first, then English, then the first; the rest stay as triples.
  const nameIndex = new Map<string, number>(); // termKey → index in raw of the label used as name
  const termGraphs = new Map<string, Set<GraphName>>();
  raw.forEach((t) => {
    if (termKey(t.p) === K_LABEL) return;
    for (const term of [t.s, t.p, t.o]) {
      if (term.kind !== 'iri') continue;
      const set = termGraphs.get(termKey(term)) ?? new Set();
      set.add(t.graph);
      termGraphs.set(termKey(term), set);
    }
  });
  const rankLabel = (l: { language: string }) => (!l.language ? 0 : /^en(-|$)/i.test(l.language) ? 1 : 2);
  const names = new Map<string, string>();
  for (const [k, list] of labelsOf) {
    const ns = k.split('|')[0];
    const ownList = list.filter((l) => l.graph === ns);
    const best = (xs: typeof list) => [...xs].sort((a, b) => rankLabel(a) - rankLabel(b))[0];
    // Only a term the graph's other triples use: the export labels only those.
    if (ownList.length > 0 && termGraphs.get(k)?.has(ownList[0].graph)) {
      const b = best(ownList);
      nameIndex.set(k, b.index);
      names.set(k, b.value);
    } else {
      names.set(k, best(list).value);
    }
  }
  const namesUsed = new Map<GraphName, number>();
  const dropped = new Set<number>(nameIndex.values());
  for (const i of dropped) namesUsed.set(raw[i].graph, (namesUsed.get(raw[i].graph) ?? 0) + 1);

  const labelled = (t: Omit<IriTerm, 'label'>): IriTerm => {
    const k = termKey(t);
    const known = KNOWN_VOCAB.get(k);
    // The entry form's names for standard terms win, so imported ones match typed ones.
    return { ...t, label: known?.label ?? names.get(k) ?? t.local } as IriTerm;
  };
  const withLabel = (o: Raw['o']): ObjectTerm => (o.kind === 'literal' ? o : labelled(o));

  let triples: Omit<Triple, 'id'>[] = [];
  raw.forEach((t, i) => {
    if (dropped.has(i)) return;
    triples.push({ graph: t.graph, s: labelled(t.s), p: labelled(t.p), o: withLabel(t.o) });
  });

  // TYPE-06: types the export adds anyway aren't stored. Worked out on the
  // Ontology graph without its class and property-kind types: a type it would
  // add back is dropped; a term with another such type keeps all of them, since
  // any explicit one stops the export adding its own.
  const isTypeOf = (t: Omit<Triple, 'id'>, kinds: (k: string) => boolean) =>
    t.graph === 'ontology' && termKey(t.p) === K_TYPE && t.o.kind === 'iri' && kinds(termKey(t.o));
  const isClassType = (k: string) => k === K_OWL_CLASS || k === K_RDFS_CLASS;
  const candidates = triples.filter((t) => isTypeOf(t, (k) => isClassType(k) || PROPERTY_KIND_TYPES.has(k)));
  const candidateSet = new Set(candidates);
  const auto = new Map<string, string>();
  for (const a of inferOntologyTyping(triples.filter((t) => !candidateSet.has(t)) as Triple[]).autoTypes) {
    auto.set(termKey(a.term), termKey({ ns: vocabNs('owl'), local: a.type }));
  }
  const typesOf = new Map<string, Set<string>>();
  for (const t of candidates) {
    const set = typesOf.get(termKey(t.s)) ?? new Set();
    set.add(termKey(t.o as IriTerm));
    typesOf.set(termKey(t.s), set);
  }
  const addedByExport = (t: Omit<Triple, 'id'>) => {
    const k = termKey(t.s);
    const types = typesOf.get(k)!;
    const ok = termKey(t.o as IriTerm);
    if (auto.get(k) !== ok) return false;
    if (isClassType(ok)) return !types.has(K_RDFS_CLASS);
    return [...types].filter((x) => PROPERTY_KIND_TYPES.has(x)).length === 1;
  };
  const autoDropped = new Set(candidates.filter(addedByExport));
  if (autoDropped.size > 0) {
    triples = triples.filter((t) => !autoDropped.has(t));
    notes.add('ontology', 'handled', 'Types Triplet adds itself', 'Classes and properties are typed from how they are used, so these aren\'t stored.', undefined, autoDropped.size);
  }
  for (const [g, n] of namesUsed)
    notes.add(g, 'handled', 'Labels used as names', 'Each of your own terms is named by its label, which Triplet writes back on export.', undefined, n);

  // DUP-01: the same triple only once (repeats can appear once tags or datatypes are simplified).
  const unique = new Map<string, Omit<Triple, 'id'>>();
  for (const t of triples) {
    const k = `${t.graph} ${tripleContentKey(t)}`;
    if (unique.has(k)) notes.add(t.graph, 'handled', 'Repeated triples', 'The same triple is stored once.');
    else unique.set(k, t);
  }
  triples = [...unique.values()];

  // IMP-08: a relationship with several domains and several ranges is kept as typed, with a note (ENT-11).
  const ends = new Map<string, Omit<Triple, 'id'>[]>();
  for (const t of triples) {
    if (t.graph !== 'ontology' || (termKey(t.p) !== K_DOMAIN && termKey(t.p) !== K_RANGE)) continue;
    const list = ends.get(termKey(t.s)) ?? [];
    list.push(t);
    ends.set(termKey(t.s), list);
  }
  for (const list of ends.values()) {
    if (pairingClash([], list))
      notes.add('ontology', 'handled', 'Relationships with several domains and ranges', 'Imported as they are; Triplet won\'t add more of these by hand.', `“${list[0].s.label}”`);
  }

  for (const g of graphs) perGraph[g]!.stored = triples.filter((t) => t.graph === g).length;

  // Prefixes found in the files, and what each became.
  const usedCustom = new Set(triples.flatMap((t) => [t.s.ns, t.p.ns, t.o.kind === 'iri' ? t.o.ns : '']));
  const customsUsed = customs.filter((c) => usedCustom.has(`custom:${c.id}`));
  const prefixes: ImportPrefix[] = [];
  const listed = new Set<string>();
  for (const g of graphs) {
    for (const [prefix, namespace] of Object.entries(files[g]!.prefixes)) {
      if (listed.has(`${prefix}|${namespace}`)) continue;
      listed.add(`${prefix}|${namespace}`);
      const ownGraph = namespace === settings.data.namespace ? 'data' : namespace === settings.ontology.namespace ? 'ontology' : undefined;
      const custom = customsUsed.find((c) => c.namespace === namespace);
      const role: ImportPrefix['role'] = ownGraph
        ? ownGraph
        : BUILTIN_PREFIXES.some((b) => b.namespace === namespace)
          ? 'built-in'
          : custom
            ? 'custom'
            : 'unused';
      prefixes.push({ prefix, namespace, role, renamedTo: custom && custom.prefix !== prefix ? custom.prefix : undefined });
    }
  }
  for (const c of customsUsed) {
    if (!prefixes.some((p) => p.role === 'custom' && p.namespace === c.namespace))
      prefixes.push({ prefix: c.prefix, namespace: c.namespace, role: 'custom' });
  }

  return {
    names: detected.names,
    detected: detected.detected,
    customPrefixes: customsUsed,
    triples,
    perGraph,
    prefixes,
    notes: notes.list(),
  };
}
