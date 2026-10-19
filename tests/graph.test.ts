import { describe, expect, it } from 'vitest';
import { CLASS_PALETTE, UNTYPED_COLOUR } from '../src/core/colours';
import { nodeSize } from '../src/core/graphLayout';
import {
  buildGraph,
  entityNodeId,
  humanise,
  legendClasses,
  usageCounts,
  valueNodeId,
  type EntityNodeModel,
  type GraphModel,
} from '../src/core/graphModel';
import { composeGraphView, dragKey, focusFor, MAX_HIGHLIGHTED, pushApart } from '../src/core/graphView';
import { termKey } from '../src/core/terms';
import type { GraphName, Triple } from '../src/core/types';
import { RDF_TYPE } from '../src/core/vocab';
import { DATA_ENTRIES, ONTOLOGY_ENTRIES } from './fixtures/sampleEntries';
import { enter } from './helpers';

const store = enter([...ONTOLOGY_ENTRIES, ...DATA_ENTRIES]);

const entity = (m: GraphModel, label: string) =>
  m.nodes.find((n): n is EntityNodeModel => n.kind === 'entity' && n.label === label);

/**
 * Every triple in a graph must show up exactly once in the graph view: as an
 * edge, as a value (node or on-node row), or as a node's class (TYPE-04).
 */
function accountFor(triples: readonly Triple[], graph: GraphName, m: GraphModel) {
  const shown = new Map<string, number>();
  const bump = (id: string) => shown.set(id, (shown.get(id) ?? 0) + 1);
  for (const e of m.edges) e.tripleIds.forEach(bump);
  for (const n of m.nodes) {
    if (n.kind === 'entity') n.values.forEach((v) => bump(v.tripleId));
  }
  const typeKey = termKey(RDF_TYPE);
  for (const t of triples) {
    if (t.graph !== graph) continue;
    if (termKey(t.p) === typeKey && t.o.kind === 'iri') {
      const n = m.nodes.find((x) => x.id === entityNodeId(graph, t.s)) as EntityNodeModel;
      expect(n.classLabels).toContain(humanise(t.o.label));
      bump(t.id);
    }
  }
  const inGraph = triples.filter((t) => t.graph === graph);
  expect([...shown.keys()].sort()).toEqual(inGraph.map((t) => t.id).sort());
  expect([...shown.values()].every((c) => c === 1)).toBe(true);
}

describe('graph model from the sample domain (FLOW-03)', () => {
  it('shows every Data graph triple once, in both Values modes (LIT-04)', () => {
    accountFor(store, 'data', buildGraph(store, 'data', 'separate'));
    accountFor(store, 'data', buildGraph(store, 'data', 'onNode'));
  });

  it('has a node per subject and entity object, and none for classes used only as types', () => {
    const m = buildGraph(store, 'data', 'onNode');
    const entities = m.nodes.filter((n) => n.kind === 'entity');
    // 34 entities in the sample's Data graph; classes appear as colours, not nodes.
    expect(entities).toHaveLength(34);
    expect(entity(m, 'Physical data element')).toBeUndefined();
    expect(m.nodes.every((n) => n.kind === 'entity')).toBe(true);
  });

  it('labels edges with the predicate, from subject to object', () => {
    const m = buildGraph(store, 'data', 'separate');
    const crm = entity(m, 'CRM')!;
    const cm = entity(m, 'Client Master')!;
    const e = m.edges.find((x) => x.source === crm.id && x.target === cm.id);
    expect(e?.labels).toEqual(['has dataset']);
    expect(e?.kind).toBe('relation');
  });

  it('Separate: each value is its own node with a dashed edge labelled by the predicate', () => {
    const m = buildGraph(store, 'data', 'separate');
    const values = m.nodes.filter((n) => n.kind === 'value');
    // 9 elements × 2 values, 3 datasets × 1, 6 business-term definitions.
    expect(values).toHaveLength(27);
    const cust = entity(m, 'CUST_ID')!;
    const toValues = m.edges.filter((e) => e.source === cust.id && e.kind === 'literal');
    expect(toValues.map((e) => e.labels[0]).sort()).toEqual(['contains PII', 'data type']);
    const pii = values.find(
      (v) => v.kind === 'value' && v.subject.label === 'CUST_ID' && v.predicate.label === 'contains PII',
    );
    expect(pii?.kind === 'value' && pii.literal).toEqual({ kind: 'literal', value: 'false', datatype: 'boolean' });
    expect(cust.values).toEqual([]);
  });

  it('On node: values are listed inside their subject and have no nodes or edges', () => {
    const m = buildGraph(store, 'data', 'onNode');
    expect(m.edges.some((e) => e.kind === 'literal')).toBe(false);
    const cm = entity(m, 'Client Master')!;
    expect(cm.values.map(({ predicate, value, datatype }) => ({ predicate, value, datatype }))).toEqual([
      { predicate: 'last refreshed', value: '2026-10-14', datatype: 'date' },
    ]);
  });

  it('gives Data nodes their class colour and label (TYPE-04)', () => {
    const m = buildGraph(store, 'data', 'separate');
    const cust = entity(m, 'CUST_ID')!;
    const dob = entity(m, 'DOB')!;
    const crm = entity(m, 'CRM')!;
    expect(cust.classLabels).toEqual(['Physical data element']);
    expect(cust.colourClass).toBe('Physical data element');
    expect(CLASS_PALETTE).toContain(cust.colour);
    expect(dob.colour).toBe(cust.colour);
    expect(crm.colour).not.toBe(cust.colour);
  });

  it('greys out Data nodes with no class from the ontology', () => {
    const t = enter([{ graph: 'data', subject: 'Alice', predicate: 'works for', object: 'Acme Bank' }]);
    const m = buildGraph(t, 'data', 'separate');
    expect(entity(m, 'Alice')).toMatchObject({ colour: UNTYPED_COLOUR, classLabels: [] });
    expect(legendClasses(m)).toEqual([{ key: '', label: 'No class', colour: UNTYPED_COLOUR }]);
  });

  it("keeps the user's own class names as typed, rewording only standard types", () => {
    const t = enter([
      { graph: 'ontology', subject: 'BankAccount', predicate: 'subclass of', object: 'iPhone' },
      { graph: 'data', subject: 'Acct 1', cls: 'BankAccount' },
    ]);
    const m = buildGraph(t, 'data', 'separate');
    expect(entity(m, 'Acct 1')?.classLabels).toEqual(['BankAccount']);
    expect(legendClasses(m).map((l) => l.label)).toEqual(['BankAccount']);
  });

  it('builds the legend from the classes in use, in ontology order', () => {
    const legend = legendClasses(buildGraph(store, 'data', 'separate'));
    expect(legend.map((l) => l.label)).toEqual([
      'Physical data element',
      'Logical data element',
      'Business term',
      'Data product',
      'Data domain',
      'System',
      'Process',
      'Dataset',
    ]);
    expect(new Set(legend.map((l) => l.colour)).size).toBe(8);
  });

  it('joins triples between the same two nodes into one edge', () => {
    const t = enter([
      { graph: 'data', subject: 'Alice', predicate: 'works for', object: 'Acme Bank' },
      { graph: 'data', subject: 'Alice', predicate: 'founded', object: 'Acme Bank' },
    ]);
    const m = buildGraph(t, 'data', 'separate');
    expect(m.edges).toHaveLength(1);
    expect(m.edges[0].labels).toEqual(['works for', 'founded']);
    expect(m.edges[0].tripleIds).toHaveLength(2);
  });

  it('keeps value nodes apart even when two values are equal', () => {
    const t = enter([
      { graph: 'data', subject: 'A', predicate: 'code', value: 'X' },
      { graph: 'data', subject: 'B', predicate: 'code', value: 'X' },
    ]);
    const m = buildGraph(t, 'data', 'separate');
    expect(m.nodes.filter((n) => n.kind === 'value').map((n) => n.id)).toEqual(t.map((x) => valueNodeId(x.id)));
  });
});

describe('usage counts (FLOW-07)', () => {
  it('counts every triple that uses a term, in any position and either graph', () => {
    const counts = usageCounts(store);
    const key = (label: string) => termKey([...store].map((t) => t.s).find((s) => s.label === label)!);
    // DOB: type, 2 values, implements, CRM hasPhysicalDataElement, uses ×2.
    expect(counts.get(key('DOB'))).toBe(7);
    // CUST_ID: type, 2 values, implements, CRM hasPhysicalDataElement, Client Onboarding uses.
    expect(counts.get(key('CUST_ID'))).toBe(6);
    const m = buildGraph(store, 'data', 'separate');
    expect(entity(m, 'DOB')?.usage).toBe(7);
    // Physical data element: 5 domain/range triples in the Ontology graph + 9 rdf:type in the Data graph.
    expect(entity(buildGraph(store, 'ontology', 'separate'), 'Physical data element')?.usage).toBe(5 + 9);
  });
});

describe('humanise', () => {
  it('splits OWL type names into words', () => {
    expect(humanise('FunctionalProperty')).toBe('Functional property');
    expect(humanise('Class')).toBe('Class');
    expect(humanise('Physical data element')).toBe('Physical data element');
    expect(humanise('CUST_ID')).toBe('CUST_ID');
  });
});

describe('Ontology graph as a class diagram (FLOW-03 exception)', () => {
  const m = buildGraph(store, 'ontology', 'separate');
  const id = (label: string) => entity(m, label)!.id;
  const arrow = (from: string, to: string) => m.edges.find((e) => e.source === id(from) && e.target === id(to));

  it('has one plain card per class and no cards for relationships or datatypes', () => {
    const cards = m.nodes.filter((n): n is EntityNodeModel => n.kind === 'entity');
    expect(cards.map((n) => n.label).sort()).toEqual([
      'Business term',
      'Data domain',
      'Data product',
      'Dataset',
      'Logical data element',
      'Physical data element',
      'Process',
      'System',
    ]);
    expect(cards.every((n) => n.role === 'class' && n.colour === undefined && n.classLabels[0] === 'Class')).toBe(true);
  });

  it("draws each relationship's domain and range as one arrow between the classes", () => {
    expect(arrow('Physical data element', 'Logical data element')?.labels).toEqual(['implements (functional)']);
    expect(arrow('System', 'Physical data element')?.labels).toEqual(['has physical data element']);
    // Two domains: two arrows (TYPE-07 combines them only on export).
    expect(arrow('Business term', 'Data domain')?.labels).toEqual(['belongs to (functional)']);
    expect(arrow('Data product', 'Data domain')?.labels).toEqual(['belongs to (functional)']);
    expect(m.edges).toHaveLength(8);
    expect(arrow('Physical data element', 'Logical data element')?.tripleIds).toHaveLength(2);
  });

  it('lists relationships with a literal range inside the class card', () => {
    expect(entity(m, 'Physical data element')!.attributes.map((a) => `${a.property}: ${a.range}`)).toEqual([
      'data type: string',
      'contains PII: boolean',
    ]);
    expect(entity(m, 'Dataset')!.attributes.map((a) => `${a.property}: ${a.range}`)).toEqual(['last refreshed: date']);
  });

  it('accounts for every domain and range triple', () => {
    const shown = new Set([
      ...m.edges.flatMap((e) => e.tripleIds),
      ...m.nodes.flatMap((n) => (n.kind === 'entity' ? n.attributes.flatMap((a) => a.tripleIds) : [])),
    ]);
    const domainRange = store.filter((t) => t.graph === 'ontology' && ['domain', 'range'].includes(t.p.local));
    expect(domainRange.every((t) => shown.has(t.id))).toBe(true);
  });

  it('shows a relationship without a domain or range as a loose label', () => {
    const t = enter([
      { graph: 'ontology', subject: 'owns', predicate: 'domain', object: 'Person' },
      { graph: 'ontology', subject: 'Account', predicate: 'subclass of', object: 'Asset' },
    ]);
    const g = buildGraph(t, 'ontology', 'separate');
    expect(entity(g, 'owns')).toMatchObject({ role: 'property', note: 'No range yet' });
    expect(g.edges.find((e) => e.kind === 'parent')?.labels).toEqual(['subclass of']);
  });
});

describe('Both view (GRAPH-03, agreed 16 Oct 2026)', () => {
  const v = composeGraphView(store, 'both', 'separate');
  const [ont, data] = v.bands;

  it('puts the Ontology area on the left and the Data graph to its right', () => {
    expect(v.bands.map((b) => b.graph)).toEqual(['ontology', 'data']);
    expect(ont.area).toBeDefined();
    const right = Math.max(...[...ont.positions].map(([id, p]) => p.x + ont.sizes.get(id)!.width));
    expect(right).toBeLessThanOrEqual(ont.maxX!);
    expect(Math.min(...[...data.positions.values()].map((p) => p.x))).toBeGreaterThanOrEqual(data.minX!);
    expect(ont.maxX!).toBeLessThan(data.minX!);
  });

  it('shows only the classes the data uses, plus their parents', () => {
    const t = enter([
      { graph: 'ontology', subject: 'Account', predicate: 'subclass of', object: 'Asset' },
      { graph: 'ontology', subject: 'Unused', predicate: 'subclass of', object: 'Asset' },
      { graph: 'data', subject: 'Acct 1', cls: 'Account' },
    ]);
    const [o] = composeGraphView(t, 'both', 'separate').bands;
    expect(o.model.nodes.map((n) => (n.kind === 'entity' ? n.label : '')).sort()).toEqual(['Account', 'Asset']);
  });

  it('selecting a data node links it to its class and highlights the class rules its triples follow', () => {
    const cust = entity(data.model, 'CUST_ID')!;
    const f = focusFor(v, cust.id)!;
    const pde = entity(ont.model, 'Physical data element')!;
    expect(f.typeLinks.map((e) => [e.source, e.target])).toEqual([[cust.id, pde.id]]);
    expect(f.highlighted.size).toBeLessThanOrEqual(MAX_HIGHLIGHTED);
    const labels = ont.model.edges.filter((e) => f.highlighted.has(e.id)).map((e) => e.labels[0]);
    expect(labels.sort()).toEqual(['has physical data element', 'implements (functional)', 'uses']);
    // Unrelated cards fade.
    expect(f.nodes.has(cust.id)).toBe(true);
    expect(f.nodes.has(entity(data.model, 'DOB')!.id)).toBe(false);
    expect(f.nodes.has(entity(ont.model, 'Data domain')!.id)).toBe(false);
  });

  it("highlights the class's parent first", () => {
    const t = enter([
      { graph: 'ontology', subject: 'owns', predicate: 'domain', object: 'Account' },
      { graph: 'ontology', subject: 'owns', predicate: 'range', object: 'Card' },
      { graph: 'ontology', subject: 'Account', predicate: 'subclass of', object: 'Asset' },
      { graph: 'data', subject: 'Acct 1', cls: 'Account', predicate: 'owns', object: 'Card 9' },
      { graph: 'data', subject: 'Card 9', cls: 'Card' },
    ]);
    const view = composeGraphView(t, 'both', 'separate');
    const acct = entity(view.bands[1].model, 'Acct 1')!;
    const f = focusFor(view, acct.id)!;
    const kinds = [...f.highlighted].map((id) => view.bands[0].model.edges.find((e) => e.id === id)!.kind);
    expect(kinds).toEqual(['parent', 'relation']);
  });

  it('keeps cards dragged left or up inside the Ontology area', () => {
    const card = ont.model.nodes[0];
    const moved = composeGraphView(store, 'both', 'separate', { [dragKey('both', card.id)]: { x: -300, y: -200 } });
    const [o] = moved.bands;
    const p = o.positions.get(card.id)!;
    expect(o.area!.x).toBeLessThanOrEqual(p.x);
    expect(o.area!.y).toBeLessThanOrEqual(p.y);
  });

  it('has no focus outside the Both view', () => {
    const single = composeGraphView(store, 'data', 'separate');
    expect(focusFor(single, entity(single.bands[0].model, 'CUST_ID')!.id)).toBeUndefined();
  });

  it('keeps its own dragged positions', () => {
    const cust = entity(data.model, 'CUST_ID')!;
    const moved = composeGraphView(store, 'both', 'separate', { [dragKey('both', cust.id)]: { x: 3, y: 4 } });
    expect(moved.bands[1].positions.get(cust.id)).toEqual({ x: 3 + data.offset.x, y: 4 + data.offset.y });
    // The Data view ignores it.
    const alone = composeGraphView(store, 'data', 'separate', { [dragKey('both', cust.id)]: { x: 3, y: 4 } });
    expect(alone.bands[0].positions.get(cust.id)).not.toEqual({ x: 3, y: 4 });
  });
});

describe('pushApart (agreed 16 Oct 2026)', () => {
  it('moves a card the dropped card landed on, the shorter way', () => {
    const boxes = new Map([
      ['a', { x: 0, y: 0, width: 100, height: 50 }],
      ['b', { x: 80, y: 10, width: 100, height: 50 }],
    ]);
    expect(pushApart(boxes, ['a'], 10)).toEqual(new Map([['b', { x: 110, y: 10 }]]));
  });

  it('passes the push along to the next card, and leaves the dropped card where it was put', () => {
    const boxes = new Map([
      ['a', { x: 0, y: 0, width: 100, height: 50 }],
      ['b', { x: 90, y: 0, width: 100, height: 50 }],
      ['c', { x: 200, y: 0, width: 100, height: 50 }],
    ]);
    const moved = pushApart(boxes, ['a'], 10);
    expect(moved.get('b')).toEqual({ x: 110, y: 0 });
    expect(moved.get('c')).toEqual({ x: 220, y: 0 });
    expect(moved.has('a')).toBe(false);
  });

  it('moves nothing when there is no overlap', () => {
    const boxes = new Map([
      ['a', { x: 0, y: 0, width: 100, height: 50 }],
      ['b', { x: 300, y: 0, width: 100, height: 50 }],
    ]);
    expect(pushApart(boxes, ['a']).size).toBe(0);
  });
});

describe('graph view layout (GRAPH-03, FLOW-06)', () => {
  it('lays out every node without overlaps', () => {
    for (const view of ['data', 'ontology'] as const) {
      const v = composeGraphView(store, view, 'separate');
      const [band] = v.bands;
      const boxes = [...band.positions].map(([id, p]) => ({ ...p, ...band.sizes.get(id)! }));
      expect(boxes).toHaveLength(band.model.nodes.length);
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i];
          const b = boxes[j];
          const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
          expect(overlap).toBe(false);
        }
      }
    }
  });

  it('single views have no band labels', () => {
    expect(composeGraphView(store, 'data', 'separate').bands[0].labelAt).toBeUndefined();
  });

  it('keeps dragged positions', () => {
    const ontNode = buildGraph(store, 'ontology', 'separate').nodes[0];
    const alone = composeGraphView(store, 'ontology', 'separate', { [ontNode.id]: { x: 5, y: 7 } });
    expect(alone.bands[0].positions.get(ontNode.id)).toEqual({ x: 5, y: 7 });
  });

  it('estimates taller nodes for long names and on-node values', () => {
    const m = buildGraph(store, 'data', 'onNode');
    const short = nodeSize(entity(m, 'CRM')!);
    const withValues = nodeSize(entity(m, 'CUST_ID')!);
    expect(withValues.height).toBeGreaterThan(short.height);
  });
});
