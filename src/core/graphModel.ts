// Graph view model, derived from the triple store on every change so the
// graph can never disagree with the list (build brief: one source of truth).
//
// Data graph (FLOW-03): subjects and objects are nodes, predicates are
// labelled edges. An rdf:type triple is shown as the node's class (colour and
// small label) rather than as an edge (TYPE-04).
//
// Ontology graph (FLOW-03 exception, agreed 16 Oct 2026): drawn as a class
// diagram. Classes are nodes; a relationship's domain and range triples become
// one arrow from the domain class to the range class; a relationship whose
// range is a literal type is listed inside its domain class's card; "subclass
// of" is a parent arrow. A relationship still missing its domain or range is
// shown as a loose label so it doesn't vanish.
//
// LIT-04: literals are either their own dashed nodes (Separate) or listed
// inside their subject's node (On node).

import { CLASS_PALETTE, classColours, UNTYPED_COLOUR } from './colours';
import { isOwnNs, termKey } from './terms';
import type { Datatype, GraphName, IriTerm, LiteralTerm, Triple } from './types';
import { inferOntologyTyping, isClassType, isDatatypeTerm, isPropertyType } from './typing';
import { RDF_TYPE, RDFS_DOMAIN, RDFS_RANGE, RDFS_SUBCLASS_OF, vocabNs } from './vocab';

export type ValuesMode = 'separate' | 'onNode';

export interface NodeValue {
  tripleId: string;
  predicate: string;
  value: string;
  datatype: Datatype;
}

/** A relationship whose range is a literal type, listed inside its domain class's card. */
export interface NodeAttribute {
  property: string;
  propertyKey: string;
  range: string;
  tripleIds: string[];
}

export interface EntityNodeModel {
  kind: 'entity';
  id: string;
  graph: GraphName;
  /** instance: a Data graph node; class: an Ontology class; property: a relationship missing its domain or range. */
  role: 'instance' | 'class' | 'property';
  term: IriTerm;
  label: string;
  /** Class labels from rdf:type triples, or the ontology kind (Class, Object property…). */
  classLabels: string[];
  /** Data graph only: termKeys of the node's classes, in the order typed. */
  classKeys: string[];
  /** Data graph only: the colour of the node's first class from the ontology, or grey (TYPE-04). */
  colour?: string;
  /** Data graph only: the label of the class that gave the colour. */
  colourClass?: string;
  /** Data graph only: the termKey of that class, for the legend's highlight (18 Oct 2026). */
  colourClassKey?: string;
  /** On node mode only: the node's literals (LIT-04). */
  values: NodeValue[];
  /** Ontology classes only: relationships whose range is a literal type. */
  attributes: NodeAttribute[];
  /** Loose relationships: what is still missing, e.g. "No range yet". */
  note?: string;
  /** Triples anywhere in the project that use this term (FLOW-07). */
  usage: number;
}

export interface ValueNodeModel {
  kind: 'value';
  id: string;
  graph: GraphName;
  tripleId: string;
  literal: LiteralTerm;
  subject: IriTerm;
  predicate: IriTerm;
  usage: 1;
}

export type NodeModel = EntityNodeModel | ValueNodeModel;

/** relation: an ordinary arrow; literal: dashed to a literal node; parent: "subclass of"; type: instance to its class. */
export type EdgeKind = 'relation' | 'literal' | 'parent' | 'type';

export interface EdgeModel {
  id: string;
  graph: GraphName;
  source: string;
  target: string;
  kind: EdgeKind;
  /** Predicate labels; triples joining the same two nodes share one edge. */
  labels: string[];
  /** termKeys of the predicates (Data) or relationships (Ontology) the edge stands for. */
  predicateKeys: string[];
  tripleIds: string[];
}

export interface GraphModel {
  nodes: NodeModel[];
  edges: EdgeModel[];
}

const K_TYPE = termKey(RDF_TYPE);
const K_DOMAIN = termKey(RDFS_DOMAIN);
const K_RANGE = termKey(RDFS_RANGE);
const K_SUBCLASS = termKey(RDFS_SUBCLASS_OF);
const K_SUBPROPERTY = termKey({ ns: vocabNs('rdfs'), local: 'subPropertyOf' });

export function entityNodeId(graph: GraphName, t: Pick<IriTerm, 'ns' | 'local'>): string {
  return `${graph}#${termKey(t)}`;
}

/** Ontology node id for a class, from its termKey. */
export function classNodeId(key: string): string {
  return `ontology#${key}`;
}

export function valueNodeId(tripleId: string): string {
  return `value#${tripleId}`;
}

/** Number of triples in the whole project that use the term as subject, predicate or object. */
export function usageCounts(triples: readonly Triple[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const t of triples) {
    const keys = new Set([termKey(t.s), termKey(t.p)]);
    if (t.o.kind === 'iri') keys.add(termKey(t.o));
    for (const k of keys) out.set(k, (out.get(k) ?? 0) + 1);
  }
  return out;
}

/** "FunctionalProperty" → "Functional property", for small node labels. */
export function humanise(label: string): string {
  if (/\s/.test(label) || !/[a-z][A-Z]/.test(label)) return label;
  const words = label.replace(/([a-z])([A-Z])/g, '$1 $2').split(' ');
  return words.map((w, i) => (i === 0 ? w : w.toLowerCase())).join(' ');
}

/** Shared node and edge bookkeeping for both graphs. */
class Builder {
  readonly entities = new Map<string, EntityNodeModel>();
  readonly values: ValueNodeModel[] = [];
  readonly edges = new Map<string, EdgeModel>();
  private readonly usage: Map<string, number>;

  constructor(
    triples: readonly Triple[],
    readonly graph: GraphName,
    readonly valuesMode: ValuesMode,
  ) {
    this.usage = usageCounts(triples);
  }

  entity(term: IriTerm, role: EntityNodeModel['role']): EntityNodeModel {
    const id = entityNodeId(this.graph, term);
    let n = this.entities.get(id);
    if (!n) {
      n = {
        kind: 'entity',
        id,
        graph: this.graph,
        role,
        term,
        label: term.label,
        classLabels: [],
        classKeys: [],
        values: [],
        attributes: [],
        usage: this.usage.get(termKey(term)) ?? 0,
      };
      this.entities.set(id, n);
    }
    return n;
  }

  literal(s: EntityNodeModel, t: Triple & { o: LiteralTerm }) {
    if (this.valuesMode === 'onNode') {
      s.values.push({ tripleId: t.id, predicate: t.p.label, value: t.o.value, datatype: t.o.datatype });
      return;
    }
    const id = valueNodeId(t.id);
    this.values.push({
      kind: 'value',
      id,
      graph: this.graph,
      tripleId: t.id,
      literal: t.o,
      subject: t.s,
      predicate: t.p,
      usage: 1,
    });
    this.edges.set(id, {
      id: `edge#${id}`,
      graph: this.graph,
      source: s.id,
      target: id,
      kind: 'literal',
      labels: [t.p.label],
      predicateKeys: [termKey(t.p)],
      tripleIds: [t.id],
    });
  }

  /** Joins an arrow into the edge between the same two nodes, if there is one. */
  edge(source: string, target: string, kind: EdgeKind, label: string, predicateKey: string, tripleIds: string[]) {
    const key = `${source}->${target}`;
    const e = this.edges.get(key);
    if (e) {
      if (!e.labels.includes(label)) e.labels.push(label);
      if (!e.predicateKeys.includes(predicateKey)) e.predicateKeys.push(predicateKey);
      e.tripleIds.push(...tripleIds);
      if (kind === 'parent') e.kind = 'parent';
    } else {
      this.edges.set(key, {
        id: `edge#${key}`,
        graph: this.graph,
        source,
        target,
        kind,
        labels: [label],
        predicateKeys: [predicateKey],
        tripleIds: [...tripleIds],
      });
    }
  }

  model(): GraphModel {
    return { nodes: [...this.entities.values(), ...this.values], edges: [...this.edges.values()] };
  }
}

export function buildGraph(triples: readonly Triple[], graph: GraphName, valuesMode: ValuesMode): GraphModel {
  return graph === 'data' ? buildDataGraph(triples, valuesMode) : buildOntologyGraph(triples, valuesMode);
}

function buildDataGraph(triples: readonly Triple[], valuesMode: ValuesMode): GraphModel {
  const b = new Builder(triples, 'data', valuesMode);
  const colours = classColours(triples);
  for (const t of triples) {
    if (t.graph !== 'data') continue;
    const s = b.entity(t.s, 'instance');
    if (t.o.kind === 'literal') {
      b.literal(s, t as Triple & { o: LiteralTerm });
    } else if (termKey(t.p) === K_TYPE) {
      // Only standard type names (owl:FunctionalProperty…) are reworded; the user's own class names stay as typed.
      const label = isOwnNs(t.o.ns) ? t.o.label : humanise(t.o.label);
      if (!s.classLabels.includes(label)) s.classLabels.push(label);
      if (!s.classKeys.includes(termKey(t.o))) s.classKeys.push(termKey(t.o));
      const c = colours.get(termKey(t.o));
      if (c && !s.colour) {
        s.colour = c;
        s.colourClass = label;
        s.colourClassKey = termKey(t.o);
      }
    } else {
      b.edge(s.id, b.entity(t.o, 'instance').id, 'relation', t.p.label, termKey(t.p), [t.id]);
    }
  }
  for (const n of b.entities.values()) n.colour ??= UNTYPED_COLOUR;
  return b.model();
}

interface Relationship {
  term: IriTerm;
  domains: { term: IriTerm; tripleId: string }[];
  ranges: { term: IriTerm; tripleId: string }[];
  kinds: string[];
}

function buildOntologyGraph(triples: readonly Triple[], valuesMode: ValuesMode): GraphModel {
  const b = new Builder(triples, 'ontology', valuesMode);
  const own = triples.filter((t) => t.graph === 'ontology');
  const classes = inferOntologyTyping(triples).classes;
  const classKeys = new Set(classes.map(termKey));
  const asClass = (term: IriTerm) => {
    const n = b.entity(term, 'class');
    if (!n.classLabels.includes('Class')) n.classLabels.unshift('Class');
    return n;
  };

  // Pass 1: which terms are relationships, and their domains and ranges.
  const rels = new Map<string, Relationship>();
  const rel = (term: IriTerm) => {
    const k = termKey(term);
    if (!rels.has(k)) rels.set(k, { term, domains: [], ranges: [], kinds: [] });
    return rels.get(k)!;
  };
  for (const t of own) {
    const pk = termKey(t.p);
    if (t.o.kind !== 'iri') continue;
    if (pk === K_DOMAIN) rel(t.s).domains.push({ term: t.o, tripleId: t.id });
    else if (pk === K_RANGE) rel(t.s).ranges.push({ term: t.o, tripleId: t.id });
    else if (pk === K_TYPE && isPropertyType(t.o)) rel(t.s).kinds.push(humanise(t.o.label));
    else if (pk === K_SUBPROPERTY) {
      rel(t.s);
      rel(t.o);
    }
  }
  const isRel = (term: IriTerm) => rels.has(termKey(term)) && !classKeys.has(termKey(term));

  // Every class gets a card, in the order the ontology introduced it.
  for (const c of classes) asClass(c);

  // Pass 2: relationships become arrows between classes, or rows in a class card.
  for (const r of rels.values()) {
    if (!isRel(r.term)) continue;
    const rk = termKey(r.term);
    // Kinds with extra rules (functional, transitive…) show on the arrow, e.g. "implements (functional)".
    const extra = r.kinds
      .filter((k) => !/^(Object|Datatype|Annotation) property$|^Property$/.test(k))
      .map((k) => k.replace(/ property$/, '').toLowerCase());
    const label = extra.length ? `${r.term.label} (${extra.join(', ')})` : r.term.label;
    const classRanges = r.ranges.filter((x) => !isDatatypeTerm(x.term));
    const literalRanges = r.ranges.filter((x) => isDatatypeTerm(x.term));
    if (r.domains.length === 0 || r.ranges.length === 0) {
      const n = b.entity(r.term, 'property');
      n.classLabels = r.kinds.length ? r.kinds : ['Relationship'];
      n.note = r.domains.length === 0 ? 'No domain yet' : 'No range yet';
      continue;
    }
    for (const d of r.domains) {
      const dn = asClass(d.term);
      for (const g of classRanges) {
        b.edge(dn.id, asClass(g.term).id, 'relation', label, rk, [d.tripleId, g.tripleId]);
      }
      for (const l of literalRanges) {
        dn.attributes.push({
          property: r.term.label,
          propertyKey: rk,
          range: l.term.label,
          tripleIds: [d.tripleId, l.tripleId],
        });
      }
    }
  }

  // Pass 3: everything else.
  for (const t of own) {
    const pk = termKey(t.p);
    if (pk === K_DOMAIN || pk === K_RANGE || pk === K_SUBPROPERTY) continue;
    if (t.o.kind === 'literal') {
      // Literals about a relationship (e.g. its label) show only while it is a loose label.
      if (isRel(t.s) && !b.entities.has(entityNodeId('ontology', t.s))) continue;
      b.literal(b.entity(t.s, isRel(t.s) ? 'property' : 'class'), t as Triple & { o: LiteralTerm });
    } else if (pk === K_TYPE) {
      if (isClassType(t.o)) asClass(t.s);
      else if (!isPropertyType(t.o) && !isRel(t.s)) {
        const n = b.entity(t.s, 'class');
        const label = isOwnNs(t.o.ns) ? t.o.label : humanise(t.o.label);
        if (!n.classLabels.includes(label)) n.classLabels.push(label);
      }
    } else if (pk === K_SUBCLASS) {
      b.edge(asClass(t.s).id, asClass(t.o).id, 'parent', t.p.label, pk, [t.id]);
    } else if (!isRel(t.s) && !isRel(t.o) && !isDatatypeTerm(t.o)) {
      // Any other statement between classes is drawn as typed.
      b.edge(b.entity(t.s, 'class').id, b.entity(t.o, 'class').id, 'relation', t.p.label, pk, [t.id]);
    }
  }
  return b.model();
}

/**
 * Both view (GRAPH-03): the Ontology area shows only the classes the Data
 * graph uses, plus their parent classes, and the arrows between them.
 */
export function ontologyForData(ontology: GraphModel, data: GraphModel): GraphModel {
  const keep = new Set<string>();
  for (const n of data.nodes) {
    if (n.kind === 'entity') for (const k of n.classKeys) keep.add(classNodeId(k));
  }
  const parents = ontology.edges.filter((e) => e.kind === 'parent');
  for (let grew = true; grew;) {
    grew = false;
    for (const e of parents) {
      if (keep.has(e.source) && !keep.has(e.target)) {
        keep.add(e.target);
        grew = true;
      }
    }
  }
  const nodes = ontology.nodes.filter((n) =>
    n.kind === 'entity' ? n.role === 'class' && keep.has(n.id) : keep.has(entityNodeId('ontology', n.subject)),
  );
  const ids = new Set(nodes.map((n) => n.id));
  return { nodes, edges: ontology.edges.filter((e) => ids.has(e.source) && ids.has(e.target)) };
}

/**
 * Legend entries for the Data graph (TYPE-04): the classes its nodes use, in
 * ontology order, then "No class" when some node has none from the ontology.
 */
/** A legend entry; `key` is the class's termKey, or '' for entities with no class. */
export interface LegendClass {
  key: string;
  label: string;
  colour: string;
}

export function legendClasses(model: GraphModel): LegendClass[] {
  const used = new Map<string, LegendClass>();
  let untyped = false;
  for (const n of model.nodes) {
    if (n.kind !== 'entity' || n.graph !== 'data') continue;
    if (n.colourClass && n.colour && n.colourClassKey) {
      used.set(`${n.colour}|${n.colourClass}`, { key: n.colourClassKey, label: n.colourClass, colour: n.colour });
    }
    else untyped = true;
  }
  const out = [...used.values()];
  out.sort((a, b) => CLASS_PALETTE.indexOf(a.colour) - CLASS_PALETTE.indexOf(b.colour));
  if (untyped) out.push({ key: '', label: 'No class', colour: UNTYPED_COLOUR });
  return out;
}
