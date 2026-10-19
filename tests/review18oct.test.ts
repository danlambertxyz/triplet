// The review after Milestone 7 (18 Oct 2026): the plain-triple flag
// (CHK-11) and its fixes, highlighting by class, the Both view's arrows by
// class pair, keeping a hand-made arrangement, Tidy layout and renames that
// keep a card where it was.

import { beforeEach, describe, expect, it } from 'vitest';
import { checkConformance, exceptionFor, planRelationshipFix, pruneExceptions } from '../src/core/conformance';
import { planRename } from '../src/core/edit';
import { buildGraph, legendClasses, type EntityNodeModel, type GraphModel } from '../src/core/graphModel';
import { classFocus, composeGraphView, dragKey, focusFor, instancesOf } from '../src/core/graphView';
import { collectTerms, objectText, termKey } from '../src/core/terms';
import type { IriTerm, Triple } from '../src/core/types';
import { useApp } from '../src/ui/store';
import { DATA_ENTRIES, ONTOLOGY_ENTRIES, type SampleEntry } from './fixtures/sampleEntries';
import { enter, SETTINGS } from './helpers';

const SAMPLE = enter([...ONTOLOGY_ENTRIES, ...DATA_ENTRIES]);
const o = (subject: string, predicate: string, object: string): SampleEntry => ({ graph: 'ontology', subject, predicate, object });
const d = (subject: string, predicate: string, object: string, cls?: string): SampleEntry => ({
  graph: 'data',
  subject,
  predicate,
  object,
  cls,
});
const show = (t: Pick<Triple, 's' | 'p' | 'o'>) => `${t.s.label} · ${t.p.label} · ${objectText(t.o)}`;
const entity = (m: GraphModel, label: string) =>
  m.nodes.find((n): n is EntityNodeModel => n.kind === 'entity' && n.label === label);
function term(store: readonly Triple[], label: string, ns: IriTerm['ns'] = 'data'): IriTerm {
  const t = [...collectTerms(store).values()].find((x) => x.ns === ns && x.label === label);
  if (!t) throw new Error(`No term "${label}" in ${ns}`);
  return t;
}

// The case from the review: "belongs to" recorded as a relationship, and also typed plainly between two classes.
const MIXED = (() => {
  const base = enter([
    o('Data domain', 'type', 'Class'),
    o('Business term', 'type', 'Class'),
    o('Data product', 'type', 'Class'),
    o('belongs to', 'domain', 'Data product'),
    o('belongs to', 'range', 'Data domain'),
  ]);
  // The plain triple, as "Add as a plain triple" (ENT-09) records it.
  const plain: Triple = {
    id: 'plain',
    graph: 'ontology',
    s: term(base, 'Business term', 'ontology'),
    p: term(base, 'belongs to', 'ontology'),
    o: term(base, 'Data domain', 'ontology'),
  };
  return [...base, plain];
})();
const plainOf = (store: readonly Triple[]) => store.find((t) => t.graph === 'ontology' && t.p.label === 'belongs to')!;

describe('CHK-11: a relationship also used plainly between two classes', () => {
  it('flags the plain triple and lists the domain and range triples beside it', () => {
    const plain = plainOf(MIXED);
    expect(plain.s.label).toBe('Business term');
    const c = checkConformance(MIXED);
    expect(c.flags.map((f) => [f.tripleId, f.kind])).toEqual([[plain.id, 'plain']]);
    const related = c.flags[0].related!.map((id) => show(MIXED.find((t) => t.id === id)!));
    expect(related.sort()).toEqual(['belongs to · domain · Data product', 'belongs to · range · Data domain']);
  });

  it('does not flag a plain triple whose relationship has no domain or range', () => {
    const plainOnly = MIXED.filter((t) => !(t.graph === 'ontology' && t.s.label === 'belongs to'));
    // Another relationship has rules, so the check does run.
    const withRules = enter([o('owns', 'domain', 'Data product')], plainOnly);
    expect(checkConformance(withRules).hasRules).toBe(true);
    expect(checkConformance(withRules).flags).toEqual([]);
  });

  it('"Make it domain and range" adds the missing domain, keeps the range, and clears the flag', () => {
    const plain = plainOf(MIXED);
    const plan = planRelationshipFix(MIXED, plain);
    if ('error' in plan) throw new Error(plan.error);
    expect(plan.add.map(show)).toEqual(['belongs to · domain · Business term']);
    const after = [...MIXED.filter((t) => t.id !== plain.id), ...plan.add.map((t, i) => ({ ...t, id: `n${i}` }))];
    expect(checkConformance(after).flags).toEqual([]);
  });

  it('refuses the fix when it would give two domains and two ranges (ENT-11)', () => {
    const store = enter([o('Thing A', 'type', 'Class'), o('Thing B', 'type', 'Class')], MIXED);
    const base = store.length;
    // A second plain use, between two other classes.
    const withPlain = [...store, { ...plainOf(MIXED), id: 'p2', s: term(store, 'Thing A', 'ontology'), o: term(store, 'Thing B', 'ontology') }];
    const plan = planRelationshipFix(withPlain, withPlain[base]);
    expect('error' in plan && plan.error).toMatch(/can't link two different pairs/);
  });

  it('an accepted exception on the plain triple is kept while it exists, and dropped when it goes', () => {
    const plain = plainOf(MIXED);
    const [flag] = checkConformance(MIXED).flags;
    const exc = exceptionFor(plain, flag);
    expect(checkConformance(MIXED, [exc]).flags[0].accepted).toBe(true);
    expect(pruneExceptions([exc], MIXED)).toEqual([exc]);
    expect(pruneExceptions([exc], MIXED.filter((t) => t.id !== plain.id))).toEqual([]);
  });

  it('the sample has no plain-triple flags', () => {
    expect(checkConformance(SAMPLE).flags).toEqual([]);
  });
});

describe('highlighting by class (agreed 18 Oct 2026)', () => {
  const view = composeGraphView(SAMPLE, 'data', 'separate');
  const data = view.bands[0].model;

  it('legend entries carry their class key', () => {
    const pde = legendClasses(data).find((l) => l.label === 'Physical data element')!;
    expect(pde.key).toBe(termKey(term(SAMPLE, 'Physical data element', 'ontology')));
  });

  it('picks out the cards of a class, with their literals, and fades the rest', () => {
    const key = termKey(term(SAMPLE, 'Dataset', 'ontology'));
    const ids = instancesOf(data, SAMPLE, key).map((id) => data.nodes.find((n) => n.id === id)!);
    expect(ids.map((n) => (n.kind === 'entity' ? n.label : '')).sort()).toEqual([
      'Client Account Register',
      'Client Master',
      'KYC Profiles',
    ]);
    const f = classFocus(view, key, SAMPLE)!;
    expect(f.nodes.has(entity(data, 'Client Master')!.id)).toBe(true);
    expect(f.nodes.has(entity(data, 'CRM')!.id)).toBe(false);
    // Client Master's date stays visible with it.
    expect([...f.nodes].some((id) => id.startsWith('value#'))).toBe(true);
  });

  it('includes subclasses, and "No class" picks the cards with none', () => {
    const t = enter([
      o('Savings account', 'subclass of', 'Account'),
      { graph: 'data', subject: 'S1', cls: 'Savings account' },
      { graph: 'data', subject: 'A1', cls: 'Account', predicate: 'owned by', object: 'Ann' },
    ]);
    const m = buildGraph(t, 'data', 'separate');
    const label = (id: string) => (m.nodes.find((n) => n.id === id) as EntityNodeModel).label;
    expect(instancesOf(m, t, termKey(term(t, 'Account', 'ontology'))).map(label).sort()).toEqual(['A1', 'S1']);
    expect(instancesOf(m, t, '').map(label)).toEqual(['Ann']);
  });

  it('in Both, selecting a class card picks out its data', () => {
    const both = composeGraphView(SAMPLE, 'both', 'separate');
    const ont = both.bands[0].model;
    const f = focusFor(both, entity(ont, 'System')!.id, SAMPLE)!;
    const shown = both.bands[1].model.nodes.filter((n) => f.nodes.has(n.id)).map((n) => (n as EntityNodeModel).label);
    expect(shown.sort()).toEqual(['CRM', 'Core Banking', 'KYC Platform']);
  });
});

describe("Both view: the arrows a card's triples follow, by class pair (18 Oct 2026)", () => {
  it('highlights both "belongs to" arrows into a data domain', () => {
    const t = enter([
      o('belongs to', 'domain', 'Business term'),
      o('belongs to', 'domain', 'Data product'),
      o('belongs to', 'range', 'Data domain'),
      { graph: 'data', subject: 'Individual Client', cls: 'Data domain' },
      d('Legal Name', 'belongs to', 'Individual Client', 'Business term'),
      d('IC 360', 'belongs to', 'Individual Client', 'Data product'),
    ]);
    const v = composeGraphView(t, 'both', 'separate');
    const [ont, data] = v.bands;
    const f = focusFor(v, entity(data.model, 'Individual Client')!.id, t)!;
    const lit = ont.model.edges.filter((e) => f.highlighted.has(e.id));
    const name = (id: string) => (ont.model.nodes.find((n) => n.id === id) as EntityNodeModel).label;
    expect(lit.map((e) => name(e.source)).sort()).toEqual(['Business term', 'Data product']);
  });
});

describe('arrangements and arrows (agreed 18 Oct 2026)', () => {
  const base = composeGraphView(SAMPLE, 'data', 'separate');
  const band = base.bands[0];
  const pinned = Object.fromEntries([...band.positions].map(([id, p]) => [dragKey('data', id), p]));

  it('arrows follow the layout path until a card moves', () => {
    expect(band.routes.size).toBeGreaterThan(0);
    const crm = entity(band.model, 'CRM')!;
    const moved = composeGraphView(SAMPLE, 'data', 'separate', { ...pinned, [crm.id]: { x: -500, y: -500 } }).bands[0];
    const touching = band.model.edges.filter((e) => e.source === crm.id || e.target === crm.id);
    expect(touching.length).toBeGreaterThan(0);
    for (const e of touching) expect(moved.routes.has(e.id)).toBe(false);
    // Arrows between cards that didn't move keep their path.
    expect(moved.routes.size).toBe(band.routes.size - touching.filter((e) => band.routes.has(e.id)).length);
  });

  it('a new card in an arranged view goes beside the card it links to, without overlapping', () => {
    const crm = entity(band.model, 'CRM')!;
    // CRM dragged far away; then a new dataset is added for it.
    const arranged = { ...pinned, [crm.id]: { x: 3000, y: 3000 } };
    const more = enter([d('CRM', 'has dataset', 'CRM Archive', 'Dataset')], SAMPLE);
    const b = composeGraphView(more, 'data', 'separate', arranged).bands[0];
    const archive = b.positions.get(entity(b.model, 'CRM Archive')!.id)!;
    expect(Math.hypot(archive.x - 3000, archive.y - 3000)).toBeLessThan(600);
    // Every card that was placed stays put.
    for (const [id, p] of Object.entries(arranged)) expect(b.positions.get(id)).toEqual(p);
    // No two cards overlap.
    const boxes = [...b.positions].map(([id, p]) => ({ id, ...p, ...b.sizes.get(id)! }));
    for (const x of boxes) {
      for (const y of boxes) {
        if (x.id >= y.id) continue;
        const overlap = x.x < y.x + y.width && y.x < x.x + x.width && x.y < y.y + y.height && y.y < x.y + x.height;
        expect(overlap, `${x.id} overlaps ${y.id}`).toBe(false);
      }
    }
  });
});

describe('store: Tidy layout and renames (agreed 18 Oct 2026)', () => {
  beforeEach(() => {
    useApp.getState().createProject(SETTINGS);
    useApp.setState({ triples: SAMPLE });
  });

  it('Tidy layout forgets the view’s positions, and Undo and Redo bring them back and forth', () => {
    const k = dragKey('data', 'data#x');
    useApp.getState().setNodePositions('separate', { [k]: { x: 1, y: 2 }, other: { x: 5, y: 5 } });
    useApp.getState().tidyLayout('separate', [k]);
    expect(useApp.getState().nodePositions.separate).toEqual({ other: { x: 5, y: 5 } });
    useApp.getState().undo();
    expect(useApp.getState().nodePositions.separate[k]).toEqual({ x: 1, y: 2 });
    expect(useApp.getState().triples).toBe(SAMPLE);
    useApp.getState().redo();
    expect(useApp.getState().nodePositions.separate[k]).toBeUndefined();
  });

  it('Undo of an ordinary change leaves dragged positions alone', () => {
    useApp.getState().deleteTriple(SAMPLE[0].id);
    useApp.getState().setNodePositions('separate', { a: { x: 1, y: 1 } });
    useApp.getState().undo();
    expect(useApp.getState().nodePositions.separate.a).toEqual({ x: 1, y: 1 });
  });

  it('a renamed card keeps where it was dragged, in every view', () => {
    const cid = term(SAMPLE, 'Client ID');
    const k = termKey(cid);
    useApp.getState().setNodePositions('separate', { [`data#${k}`]: { x: 7, y: 8 }, [`both|data#${k}`]: { x: 9, y: 9 } });
    const r = planRename(SAMPLE, cid, 'Customer ID');
    if (!r.ok) throw new Error('rename failed');
    useApp.getState().renameTerm(r.triples, k, termKey(r.renamed));
    const pos = useApp.getState().nodePositions.separate;
    expect(pos[`data#${termKey(r.renamed)}`]).toEqual({ x: 7, y: 8 });
    expect(pos[`both|data#${termKey(r.renamed)}`]).toEqual({ x: 9, y: 9 });
  });
});
