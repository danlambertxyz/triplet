import { beforeEach, describe, expect, it } from 'vitest';
import { draftFromTriple, nameKindOf, planEdit, planRename, planSetClass, termUses } from '../src/core/edit';
import { pairingClash, resolveEntry } from '../src/core/entry';
import { exportGraph } from '../src/core/export';
import { emptyHistory, HISTORY_LIMIT, record, redo, undo } from '../src/core/history';
import { collectTerms, objectText, termKey } from '../src/core/terms';
import type { IriTerm, Triple } from '../src/core/types';
import { RDF_TYPE } from '../src/core/vocab';
import { useApp } from '../src/ui/store';
import { DATA_ENTRIES, ONTOLOGY_ENTRIES } from './fixtures/sampleEntries';
import { enter, SETTINGS } from './helpers';

const SAMPLE = enter([...ONTOLOGY_ENTRIES, ...DATA_ENTRIES]);

function term(store: readonly Triple[], label: string, ns: IriTerm['ns'] = 'data'): IriTerm {
  const t = [...collectTerms(store).values()].find((x) => x.ns === ns && x.label === label);
  if (!t) throw new Error(`No term "${label}" in ${ns}`);
  return t;
}

const show = (t: Triple) => `${t.s.label} · ${t.p.label} · ${objectText(t.o)}`;

describe('delete warning (EDIT-04, SCR-07): sample test "Delete DOB"', () => {
  const dob = term(SAMPLE, 'DOB');
  const uses = termUses(SAMPLE, dob);

  it('lists every triple using DOB, split into as subject and as object', () => {
    expect(uses.asSubject.map(show).sort()).toEqual(
      ['DOB · contains PII · "true"', 'DOB · data type · "DATE"', 'DOB · implements · Birth Date', 'DOB · type · Physical data element'].sort(),
    );
    expect(uses.asObject.map(show).sort()).toEqual(
      ['CRM · has physical data element · DOB', 'Client Onboarding · uses · DOB', 'KYC Periodic Review · uses · DOB'].sort(),
    );
    expect(uses.asPredicate).toEqual([]);
    expect(uses.all).toHaveLength(7);
  });

  it('removes nothing while the warning is open', () => {
    const before = SAMPLE.length;
    termUses(SAMPLE, dob);
    expect(SAMPLE).toHaveLength(before);
  });

  it('lists a relationship by its uses as a predicate', () => {
    const uses2 = termUses(SAMPLE, term(SAMPLE, 'uses', 'ontology'));
    expect(uses2.asSubject).toHaveLength(2); // domain and range
    expect(uses2.asPredicate).toHaveLength(6);
  });
});

describe('rename (EDIT-01, ID-07, SCR-06): sample test "rename Client ID"', () => {
  const clientId = term(SAMPLE, 'Client ID');

  it('renames Client ID everywhere, with a new IRI and label', () => {
    const plan = planRename(SAMPLE, clientId, 'Client Number');
    if (!plan.ok) throw new Error(plan.error);
    expect(plan.renamed).toMatchObject({ ns: 'data', local: 'ClientNumber', label: 'Client Number' });
    expect(plan.affected.map(show).sort()).toEqual(
      [
        'CLIENT_NO · implements · Client Number',
        'CUST_ID · implements · Client Number',
        'Client Number · represents · Client Identifier',
        'Client Number · type · Logical data element',
      ].sort(),
    );
    expect(plan.triples).toHaveLength(SAMPLE.length);
    expect(termUses(plan.triples, clientId).all).toEqual([]);
    const ttl = exportGraph(plan.triples, SETTINGS, 'data').turtle;
    expect(ttl).toContain('data:ClientNumber');
    expect(ttl).toContain('"Client Number"');
    expect(ttl).not.toContain('ClientID');
  });

  it('keeps triple ids, so the list keeps its order', () => {
    const plan = planRename(SAMPLE, clientId, 'Client Number');
    if (!plan.ok) throw new Error(plan.error);
    expect(plan.triples.map((t) => t.id)).toEqual(SAMPLE.map((t) => t.id));
  });

  it('follows the local-name rule for the new name (ID-06)', () => {
    const plan = planRename(SAMPLE, clientId, 'KYC client ref');
    expect(plan.ok && plan.renamed.local).toBe('KYCClientRef');
  });

  it('names a renamed relationship in camelCase and keeps its domain and range (ENT-11)', () => {
    const belongsTo = term(SAMPLE, 'belongs to', 'ontology');
    expect(nameKindOf(SAMPLE, belongsTo)).toBe('predicate');
    const plan = planRename(SAMPLE, belongsTo, 'is part of');
    if (!plan.ok) throw new Error(plan.error);
    expect(plan.renamed.local).toBe('isPartOf');
    const renamed = termUses(plan.triples, plan.renamed);
    expect(renamed.asSubject.map(show).sort()).toEqual(
      [
        'is part of · domain · Business term',
        'is part of · domain · Data product',
        'is part of · range · Data domain',
        'is part of · type · FunctionalProperty',
      ].sort(),
    );
    // Data triples follow the new name too.
    expect(renamed.asPredicate).toHaveLength(7);
    // Renaming the existing relationship frees its name for a new pairing.
    const fresh = enter([{ graph: 'ontology', subject: 'belongs to', predicate: 'domain', object: 'Process' }], plan.triples);
    const add = enter([{ graph: 'ontology', subject: 'belongs to', predicate: 'range', object: 'System' }], fresh);
    expect(pairingClash(fresh, add.slice(fresh.length))).toBeUndefined();
  });

  it('refuses a name another term already has; combining is Merge', () => {
    const plan = planRename(SAMPLE, clientId, 'Client Identifier');
    expect(plan.ok).toBe(false);
    expect(!plan.ok && plan.error).toMatch(/Merge/);
  });

  it('gives a numbered suffix when only the local name clashes (ID-08)', () => {
    const plan = planRename(SAMPLE, clientId, 'client identifier');
    expect(plan.ok && plan.renamed.local).toBe('ClientIdentifier_2');
  });

  it('allows changing only the case, keeping the IRI where the local name is the same', () => {
    const fullName = term(SAMPLE, 'Full Name');
    const plan = planRename(SAMPLE, fullName, 'Full name');
    expect(plan.ok && plan.renamed.local).toBe('FullName');
  });

  it('flags empty, unchanged and over-long names, and standard vocabulary', () => {
    expect(planRename(SAMPLE, clientId, '  ')).toMatchObject({ ok: false, error: 'Enter a new name.' });
    expect(planRename(SAMPLE, clientId, 'Client ID')).toMatchObject({ ok: false, unchanged: true });
    expect(planRename(SAMPLE, clientId, '!!!')).toMatchObject({ ok: false });
    expect(planRename(SAMPLE, clientId, 'x'.repeat(121))).toMatchObject({ ok: false });
    expect(planRename(SAMPLE, RDF_TYPE, 'kind')).toMatchObject({ ok: false });
  });
});

describe('edit triple (EDIT-02, SCR-05)', () => {
  const custImplements = SAMPLE.find((t) => t.s.label === 'CUST_ID' && t.p.label === 'implements')!;

  it('fills the fields so that saving them unchanged changes nothing, for every sample triple', () => {
    for (const t of SAMPLE) {
      const draft = draftFromTriple(t, SAMPLE, SETTINGS);
      const r = planEdit(SAMPLE, t, draft, SETTINGS);
      expect({ triple: show(t), unchanged: r.unchanged, errors: r.errors }).toEqual({
        triple: show(t),
        unchanged: true,
        errors: {},
      });
    }
  });

  it('changes only that one triple', () => {
    const draft = { ...draftFromTriple(custImplements, SAMPLE, SETTINGS), object: 'Given Name' };
    const r = planEdit(SAMPLE, custImplements, draft, SETTINGS);
    expect(r.triple && show({ ...r.triple, id: 'x' })).toBe('CUST_ID · implements · Given Name');
    expect(r.triple?.o).toEqual(term(SAMPLE, 'Given Name'));
    // CLIENT_NO still implements Client ID.
    expect(SAMPLE.some((t) => show(t) === 'CLIENT_NO · implements · Client ID')).toBe(true);
  });

  it('can switch the object to a literal, checked against its datatype', () => {
    const base = draftFromTriple(custImplements, SAMPLE, SETTINGS);
    const bad = planEdit(SAMPLE, custImplements, { ...base, objectKind: 'value', object: 'soon', datatype: 'date' }, SETTINGS);
    expect(bad.errors.object).toBeDefined();
    const ok = planEdit(SAMPLE, custImplements, { ...base, objectKind: 'value', object: '2026-10-14', datatype: 'date' }, SETTINGS);
    expect(ok.triple?.o).toEqual({ kind: 'literal', value: '2026-10-14', datatype: 'date' });
  });

  it('refuses an edit that would repeat another triple', () => {
    const draft = { ...draftFromTriple(custImplements, SAMPLE, SETTINGS), subject: 'CLIENT_NO' };
    const r = planEdit(SAMPLE, custImplements, draft, SETTINGS);
    expect(r.triple).toBeUndefined();
    expect(r.message).toMatch(/already exists/);
  });

  it('keeps a plain triple between two classes plain (no relationship recording)', () => {
    const t = SAMPLE.find((x) => x.graph === 'ontology' && x.s.label === 'uses' && x.p.label === 'range')!;
    const draft = { ...draftFromTriple(t, SAMPLE, SETTINGS), object: 'Dataset' };
    const r = planEdit(SAMPLE, t, draft, SETTINGS);
    expect(r.triple && show({ ...r.triple, id: 'x' })).toBe('uses · range · Dataset');
  });

  it('refuses a second pairing of classes for a relationship (ENT-11)', () => {
    // belongs to has two domains; changing its range would be fine, but adding a
    // second range by editing its type triple is a clash.
    const t = SAMPLE.find((x) => x.s.label === 'belongs to' && x.p.label === 'type')!;
    const draft = { ...draftFromTriple(t, SAMPLE, SETTINGS), predicate: 'range', object: 'Process' };
    const r = planEdit(SAMPLE, t, draft, SETTINGS);
    expect(r.triple).toBeUndefined();
    expect(Object.values(r.errors).join(' ')).toMatch(/rename the existing one/);
    // Editing the existing range to another class is allowed: still one range.
    const range = SAMPLE.find((x) => x.s.label === 'belongs to' && x.p.label === 'range')!;
    const ok = planEdit(SAMPLE, range, { ...draftFromTriple(range, SAMPLE, SETTINGS), object: 'Process' }, SETTINGS);
    expect(ok.errors).toEqual({});
    expect(ok.triple).toBeDefined();
  });
});

describe('set class from the selected-node bar (TYPE-08)', () => {
  it('adds "x type Class" to the Data graph for an untyped node', () => {
    const store = enter([{ graph: 'data', subject: 'Last Name', predicate: 'label', value: 'Last Name' }], SAMPLE);
    const lastName = term(store, 'Last Name');
    const lde = term(store, 'Logical data element', 'ontology');
    const plan = planSetClass(store, lastName, lde);
    expect(plan.remove).toEqual([]);
    expect(plan.add).toEqual({ graph: 'data', s: lastName, p: RDF_TYPE, o: lde });
  });

  it('replaces the current class, listing the triple that goes', () => {
    const dob = term(SAMPLE, 'DOB');
    const plan = planSetClass(SAMPLE, dob, term(SAMPLE, 'Logical data element', 'ontology'));
    expect(plan.remove.map(show)).toEqual(['DOB · type · Physical data element']);
    expect(plan.add).toBeDefined();
  });

  it('does nothing when the node already has only that class', () => {
    const dob = term(SAMPLE, 'DOB');
    expect(planSetClass(SAMPLE, dob, term(SAMPLE, 'Physical data element', 'ontology'))).toEqual({ remove: [], add: undefined });
  });
});

describe('class hint on the Ontology tab (ENT-12)', () => {
  const draft = (subject: string, object: string, ticks: { s?: boolean; o?: boolean } = {}) =>
    resolveEntry(
      {
        graph: 'ontology',
        subject,
        predicate: 'chases',
        objectKind: 'entity',
        object,
        datatype: 'string',
        subjectIsClass: ticks.s,
        objectIsClass: ticks.o,
      },
      SAMPLE,
      SETTINGS,
    );

  it('shows when neither side is a class, without blocking the entry', () => {
    const r = draft('Dog', 'Cat');
    expect(r.classHint).toMatchObject({ subject: { label: 'Dog' }, object: { label: 'Cat' } });
    expect(r.triples).toHaveLength(1);
  });

  it('does not show when either side is a class or ticked as one', () => {
    expect(draft('Dog', 'System').classHint).toBeUndefined();
    expect(draft('Dog', 'Cat', { s: true }).classHint).toBeUndefined();
    expect(draft('Dog', 'Cat', { o: true }).classHint).toBeUndefined();
  });

  it('does not show for standard predicates such as domain', () => {
    const r = resolveEntry(
      { graph: 'ontology', subject: 'chases', predicate: 'label', objectKind: 'value', object: 'chases', datatype: 'string' },
      SAMPLE,
      SETTINGS,
    );
    expect(r.classHint).toBeUndefined();
  });
});

describe('undo and redo history (EDIT-06)', () => {
  it('steps back and forward through snapshots', () => {
    let h = emptyHistory<number>();
    h = record(h, 1);
    h = record(h, 2);
    const u = undo(h, 3)!;
    expect(u.present).toBe(2);
    const r = redo(u.history, u.present)!;
    expect(r.present).toBe(3);
    expect(undo(emptyHistory<number>(), 1)).toBeUndefined();
    expect(redo(h, 3)).toBeUndefined();
  });

  it('clears the redo steps on a new change and keeps at most the limit', () => {
    let h = emptyHistory<number>();
    for (let i = 0; i < HISTORY_LIMIT + 10; i++) h = record(h, i);
    expect(h.past).toHaveLength(HISTORY_LIMIT);
    const u = undo(h, 999)!;
    expect(record(u.history, u.present).future).toEqual([]);
  });
});

describe('store: editing with undo and redo (EDIT-06, ENT-07)', () => {
  beforeEach(() => {
    useApp.getState().createProject(SETTINGS);
    useApp.getState().addTriples(SAMPLE);
  });
  const st = () => useApp.getState();

  it('undoes and redoes deleting DOB as one step', () => {
    const before = st().triples;
    const uses = termUses(before, term(before, 'DOB'));
    st().deleteTriples(uses.all.map((t) => t.id));
    expect(st().triples).toHaveLength(before.length - 7);
    st().undo();
    expect(st().triples).toEqual(before);
    st().redo();
    expect(st().triples).toHaveLength(before.length - 7);
  });

  it('undoes renaming Client ID', () => {
    const before = st().triples;
    const plan = planRename(before, term(before, 'Client ID'), 'Client Number');
    if (!plan.ok) throw new Error(plan.error);
    st().renameTerm(plan.triples, 'data|ClientID', termKey(plan.renamed));
    expect(collectTerms(st().triples).has('data|ClientNumber')).toBe(true);
    st().undo();
    expect(st().triples).toEqual(before);
    expect(collectTerms(st().triples).has('data|ClientID')).toBe(true);
  });

  it('undoes an addition from the confirmation (ENT-07), and a new change ends that confirmation', () => {
    const before = st().triples;
    st().addTriples(enter([{ graph: 'data', subject: 'CRM', predicate: 'label', value: 'Customer system' }], before).slice(before.length));
    expect(st().lastAdded).toHaveLength(1);
    st().undo();
    expect(st().triples).toEqual(before);
    expect(st().lastAdded).toEqual([]);
    st().redo();
    st().deleteTriple(st().triples[0].id);
    expect(st().lastAdded).toEqual([]);
  });

  it('edits a triple in place, keeping its id and position', () => {
    const t = st().triples[5];
    const replacement = { ...t, o: { kind: 'literal' as const, value: 'x', datatype: 'string' as const } };
    st().replaceTriple(t.id, replacement);
    expect(st().triples[5]).toEqual({ ...replacement, id: t.id });
    st().undo();
    expect(st().triples[5]).toBe(t);
  });

  it('sets a class as one step', () => {
    const before = st().triples;
    const dob = term(before, 'DOB');
    const plan = planSetClass(before, dob, term(before, 'Logical data element', 'ontology'));
    st().setClass(plan.remove.map((t) => t.id), plan.add);
    const types = st().triples.filter((t) => termKey(t.p) === termKey(RDF_TYPE) && t.s.local === 'DOB');
    expect(types.map(show)).toEqual(['DOB · type · Logical data element']);
    st().undo();
    expect(st().triples).toEqual(before);
  });

  it('starting a new project clears the undo history (GEN-10)', () => {
    st().deleteTriple(st().triples[0].id);
    expect(st().history.past.length).toBeGreaterThan(0);
    st().resetProject();
    expect(st().history).toEqual({ past: [], future: [] });
    st().undo();
    expect(st().triples).toEqual([]);
  });

  it('does not save the history or the open pop-up', () => {
    st().deleteTriple(st().triples[0].id);
    st().openDialog({ kind: 'deleteTriple', tripleId: st().triples[0].id });
    const saved = useApp.persist.getOptions().partialize!(st()) as Record<string, unknown>;
    expect(saved.triples).toBeDefined();
    expect(saved.history).toBeUndefined();
    expect(saved.dialog).toBeUndefined();
  });
});

describe('class hint skips relationships (ENT-12)', () => {
  it('does not suggest ticking Class for two relationships', () => {
    const r = resolveEntry(
      { graph: 'ontology', subject: 'implements', predicate: 'inverse of', objectKind: 'entity', object: 'represents', datatype: 'string' },
      SAMPLE,
      SETTINGS,
    );
    expect(r.classHint).toBeUndefined();
  });
});
