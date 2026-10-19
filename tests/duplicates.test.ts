import { beforeEach, describe, expect, it } from 'vitest';
import {
  chosenPair,
  extraCopies,
  findDuplicates,
  mergeCandidates,
  planMerge,
  planRemove,
  planSameAs,
  repointPairs,
  type TermPair,
  type TripleSet,
} from '../src/core/duplicates';
import { resolveEntry } from '../src/core/entry';
import { planEdit, termUses } from '../src/core/edit';
import { exportGraph } from '../src/core/export';
import { collectTerms, objectText, prefixedName, termKey } from '../src/core/terms';
import type { IriTerm, Triple } from '../src/core/types';
import { useApp } from '../src/ui/store';
import { DATA_ENTRIES, ONTOLOGY_ENTRIES } from './fixtures/sampleEntries';
import { draftFor, enter, SETTINGS } from './helpers';

const SAMPLE = enter([...ONTOLOGY_ENTRIES, ...DATA_ENTRIES]);

function term(store: readonly Triple[], label: string, ns: IriTerm['ns'] = 'data'): IriTerm {
  const t = [...collectTerms(store).values()].find((x) => x.ns === ns && x.label === label);
  if (!t) throw new Error(`No term "${label}" in ${ns}`);
  return t;
}
const show = (t: Omit<Triple, 'id'>) => `${t.s.label} · ${t.p.label} · ${objectText(t.o)}`;
// Sample test "Duplicate": add business term "date of birth" alongside "Date of Birth".
const WITH_DOB = enter(
  [
    { graph: 'data', subject: 'date of birth', cls: 'Business term', predicate: 'belongs to', object: 'Individual Client' },
  ],
  SAMPLE,
);

describe('sample test "Duplicate" (DUP-01, ID-08)', () => {
  it('the sample itself has no possible duplicates', () => {
    expect(findDuplicates(SAMPLE)).toEqual([]);
  });

  it('"date of birth" gets data:DateOfBirth_2 and the pair is flagged as differing only by capital letters', () => {
    const dob2 = term(WITH_DOB, 'date of birth');
    expect(prefixedName(dob2, SETTINGS)).toBe('data:DateOfBirth_2');
    const sets = findDuplicates(WITH_DOB);
    expect(sets).toHaveLength(1);
    const p = sets[0] as TermPair;
    expect([p.a.label, p.b.label]).toEqual(['Date of Birth', 'date of birth']);
    expect(p.reason).toBe('These names differ only by capital letters.');
  });

  it('merging keeps the chosen name, moves every triple and frees the plain IRI (DUP-05)', () => {
    const [p] = findDuplicates(WITH_DOB) as TermPair[];
    const r = planMerge(WITH_DOB, p.a, p.b, 'date of birth');
    if (!r.ok) throw new Error(r.error);
    expect(prefixedName(r.survivor, SETTINGS)).toBe('data:DateOfBirth');
    expect(r.survivor.label).toBe('date of birth');
    // Date of Birth's 4 triples move onto the kept name; date of birth's two
    // (type Business term, belongs to Individual Client) repeat two of them.
    expect(r.moved).toBe(4);
    expect(r.combined).toBe(2);
    expect(collectTerms(r.triples).has(termKey(p.b))).toBe(false);
    expect(termUses(r.triples, r.survivor).all).toHaveLength(termUses(WITH_DOB, p.a).all.length);
    expect(findDuplicates(r.triples)).toEqual([]);
    // Nothing changed until applied (EDIT-05).
    expect(collectTerms(WITH_DOB).has(termKey(p.b))).toBe(true);
  });

  it('keep one, remove the other lists exactly the triples that go', () => {
    const [p] = findDuplicates(WITH_DOB) as TermPair[];
    expect(planRemove(WITH_DOB, p.b).map(show).sort()).toEqual(
      ['date of birth · belongs to · Individual Client', 'date of birth · type · Business term'].sort(),
    );
  });

  it('a pair kept as different things is not flagged again (DUP-07)', () => {
    const [p] = findDuplicates(WITH_DOB) as TermPair[];
    expect(findDuplicates(WITH_DOB, [[termKey(p.b), termKey(p.a)]])).toEqual([]);
  });

  it('linking them as the same thing writes owl:sameAs and clears the flag (DUP-06)', () => {
    const [p] = findDuplicates(WITH_DOB) as TermPair[];
    const link = planSameAs(WITH_DOB, p.a, p.b);
    expect(link.graph).toBe('data');
    expect(prefixedName(link.p, SETTINGS)).toBe('owl:sameAs');
    const store = [...WITH_DOB, { ...link, id: 'x' }];
    expect(findDuplicates(store)).toEqual([]);
    expect(exportGraph(store, SETTINGS, 'data').turtle).toContain('owl:sameAs');
  });
});

describe('what counts as a possible duplicate', () => {
  it('names that differ by case, spacing or punctuation (DUP-01)', () => {
    const store = enter([
      { graph: 'data', subject: 'Acme Bank', predicate: 'label', value: 'a' },
      { graph: 'data', subject: 'ACME bank', predicate: 'label', value: 'b' },
      { graph: 'data', subject: 'Acme-Bank', predicate: 'label', value: 'c' },
    ]);
    const sets = findDuplicates(store) as TermPair[];
    expect(sets.map((s) => [s.a.label, s.b.label])).toEqual([
      ['Acme Bank', 'ACME bank'],
      ['Acme Bank', 'Acme-Bank'],
      ['ACME bank', 'Acme-Bank'],
    ]);
    expect(sets[1].reason).toBe('These names differ only by spacing and punctuation.');
    expect(sets[2].reason).toBe('These names differ only by capital letters, spacing and punctuation.');
  });

  it('does not compare a Data graph thing with an Ontology class of the same name', () => {
    const store = enter([
      { graph: 'ontology', subject: 'client', predicate: 'type', object: 'Class' },
      { graph: 'data', subject: 'Client', predicate: 'label', value: 'x' },
    ]);
    expect(findDuplicates(store)).toEqual([]);
  });

  it('relationships in different word forms (DUP-02), but not entities', () => {
    const store = enter([
      { graph: 'data', subject: 'Ann', predicate: 'works for', object: 'Acme' },
      { graph: 'data', subject: 'Bob', predicate: 'worked for', object: 'Acme' },
      { graph: 'data', subject: 'Cy', predicate: 'employed by', object: 'Acme' },
      { graph: 'data', subject: 'Report', predicate: 'label', value: 'x' },
      { graph: 'data', subject: 'Reports', predicate: 'label', value: 'y' },
    ]);
    const sets = findDuplicates(store) as TermPair[];
    expect(sets.map((s) => [s.a.label, s.b.label, s.role])).toEqual([['works for', 'worked for', 'predicate']]);
    expect(sets[0].reason).toMatch(/forms of the same words/);
  });

  it('never pairs a relationship with an entity', () => {
    const store = enter([
      { graph: 'data', subject: 'Owner', predicate: 'owner', object: 'Acme' },
    ]);
    expect(findDuplicates(store)).toEqual([]);
  });

  it('a name typed with _2 in it is not taken for an ID-08 suffix', () => {
    const store = enter([
      { graph: 'data', subject: 'CUST', predicate: 'label', value: 'a' },
      { graph: 'data', subject: 'CUST_2', predicate: 'label', value: 'b' },
    ]);
    expect(findDuplicates(store)).toEqual([]);
  });

  it('identical triples are flagged as one set; the extra copies are what combining removes', () => {
    const t = SAMPLE[SAMPLE.length - 1];
    const store = [...SAMPLE, { ...t, id: 'copy' }];
    const sets = findDuplicates(store);
    expect(sets).toHaveLength(1);
    expect(sets[0].kind).toBe('triples');
    expect(extraCopies(sets[0] as TripleSet)).toEqual(['copy']);
  });
});

describe('the same triple is not added twice (DUP-01, agreed 16 Oct 2026)', () => {
  it('the entry form refuses it with a message on the object', () => {
    const e = DATA_ENTRIES[DATA_ENTRIES.length - 1];
    const r = resolveEntry(draftFor(e, SAMPLE), SAMPLE, SETTINGS);
    expect(r.triples).toEqual([]);
    expect(r.errors.object).toMatch(/already in the (Data|Ontology) graph/);
  });

  it('still adds a new class for an existing triple', () => {
    const store = enter([{ graph: 'data', subject: 'CRM', predicate: 'label', value: 'x' }], SAMPLE);
    const r = resolveEntry(
      draftFor({ graph: 'data', subject: 'CRM', cls: 'Dataset', predicate: 'label', value: 'x' }, store),
      store,
      SETTINGS,
    );
    expect(r.errors).toEqual({});
    expect(r.triples.map(show)).toEqual(['CRM · type · Dataset']);
  });

  it('Edit triple still says the triple already exists', () => {
    const [a, b] = SAMPLE.filter((t) => t.graph === 'data' && t.s.label === 'DOB');
    const r = planEdit(SAMPLE, b, { subject: 'DOB', predicate: a.p.label, objectKind: a.o.kind === 'literal' ? 'value' : 'entity', object: a.o.kind === 'literal' ? a.o.value : a.o.label, datatype: a.o.kind === 'literal' ? a.o.datatype : 'string' }, SETTINGS);
    expect(r.message).toMatch(/already exists/);
  });
});

describe('merging (DUP-04, DUP-05)', () => {
  it('relationships: every use is repointed, and the survivor is camelCase', () => {
    const store = enter([
      { graph: 'data', subject: 'Ann', predicate: 'works for', object: 'Acme' },
      { graph: 'data', subject: 'Bob', predicate: 'Works For', object: 'Acme' },
      { graph: 'data', subject: 'Ann', predicate: 'Works For', object: 'Acme' },
    ]);
    const [p] = findDuplicates(store) as TermPair[];
    const r = planMerge(store, p.a, p.b, 'Works For');
    if (!r.ok) throw new Error(r.error);
    expect(r.survivor.local).toBe('worksFor');
    expect(r.triples.map(show)).toEqual(['Ann · Works For · Acme', 'Bob · Works For · Acme']);
    expect(r.combined).toBe(1);
  });

  it('refuses a relationship merge that would give two domains and two ranges (ENT-11)', () => {
    const store = enter([
      { graph: 'ontology', subject: 'owns', predicate: 'domain', object: 'Person' },
      { graph: 'ontology', subject: 'owns', predicate: 'range', object: 'Car' },
      { graph: 'ontology', subject: 'Owns', predicate: 'domain', object: 'Company' },
      { graph: 'ontology', subject: 'Owns', predicate: 'range', object: 'Building' },
    ]);
    const a = term(store, 'owns', 'ontology');
    const b = term(store, 'Owns', 'ontology');
    const r = planMerge(store, a, b, 'owns');
    expect(r.ok).toBe(false);
  });

  it('two classes are linked with owl:equivalentClass in the Ontology graph', () => {
    const store = enter([
      { graph: 'ontology', subject: 'Client', predicate: 'type', object: 'Class' },
      { graph: 'ontology', subject: 'client', predicate: 'type', object: 'Class' },
    ]);
    const [p] = findDuplicates(store) as TermPair[];
    const link = planSameAs(store, p.a, p.b);
    expect(link.graph).toBe('ontology');
    expect(prefixedName(link.p, SETTINGS)).toBe('owl:equivalentClass');
  });

  it('two relationships are linked with owl:equivalentProperty', () => {
    const store = enter([
      { graph: 'data', subject: 'Ann', predicate: 'works for', object: 'Acme' },
      { graph: 'data', subject: 'Bob', predicate: 'worksFor', object: 'Acme' },
    ]);
    const [p] = findDuplicates(store) as TermPair[];
    expect(prefixedName(planSameAs(store, p.a, p.b).p, SETTINGS)).toBe('owl:equivalentProperty');
  });

  it('Merge from the node bar offers same-kind terms in the same graph', () => {
    const dob = term(SAMPLE, 'DOB');
    const offered = mergeCandidates(SAMPLE, dob).map((t) => t.label);
    expect(offered).toContain('CUST_ID');
    expect(offered).not.toContain('DOB');
    expect(offered).not.toContain('implements');
    expect(chosenPair(SAMPLE, dob, term(SAMPLE, 'CUST_ID')).reason).toMatch(/chose/);
  });

  it('the kept term keeps its own IRI, e.g. one typed as a prefixed name', () => {
    const store = enter([
      { graph: 'data', subject: 'data:Cust-Id', predicate: 'label', value: 'a' },
      { graph: 'data', subject: 'Cust Id', predicate: 'label', value: 'b' },
    ]);
    const [p] = findDuplicates(store) as TermPair[];
    const r = planMerge(store, p.a, p.b, 'Cust-Id');
    if (!r.ok) throw new Error(r.error);
    expect(r.survivor.local).toBe('Cust-Id');
  });

  it('"uses" and "used" are word forms of one relationship (DUP-02)', () => {
    const store = enter([
      { graph: 'data', subject: 'A', predicate: 'uses', object: 'B' },
      { graph: 'data', subject: 'C', predicate: 'used', object: 'B' },
    ]);
    expect(findDuplicates(store)).toHaveLength(1);
  });

  it('pairs kept apart follow a rename or merge', () => {
    expect(repointPairs([['a', 'c'], ['b', 'c'], ['a', 'b']], ['a', 'b'], 's')).toEqual([['s', 'c']]);
  });
});

describe('store: duplicate choices are part of Undo and Redo (EDIT-06, DUP-07)', () => {
  const st = () => useApp.getState();
  beforeEach(() => {
    st().createProject(SETTINGS);
    st().addTriples(WITH_DOB);
  });

  it('keep as different things is undoable and saved with the project', () => {
    const [p] = findDuplicates(st().triples) as TermPair[];
    st().keepDistinct(termKey(p.a), termKey(p.b));
    expect(findDuplicates(st().triples, st().distinctPairs)).toEqual([]);
    const saved = useApp.persist.getOptions().partialize!(st()) as Record<string, unknown>;
    expect(saved.distinctPairs).toEqual([[termKey(p.a), termKey(p.b)]]);
    st().undo();
    expect(findDuplicates(st().triples, st().distinctPairs)).toHaveLength(1);
    st().redo();
    expect(st().distinctPairs).toHaveLength(1);
  });

  it('a merge is one undoable step', () => {
    const before = st().triples;
    const [p] = findDuplicates(before) as TermPair[];
    const r = planMerge(before, p.a, p.b, p.a.label);
    if (!r.ok) throw new Error(r.error);
    st().mergeTerms(r.triples, [termKey(p.a), termKey(p.b)], termKey(r.survivor));
    expect(findDuplicates(st().triples)).toEqual([]);
    st().undo();
    expect(st().triples).toBe(before);
  });

  it('keeping a pair apart twice stores it once', () => {
    st().keepDistinct('a', 'b');
    const n = st().history.past.length;
    st().keepDistinct('b', 'a');
    expect(st().distinctPairs).toEqual([['a', 'b']]);
    expect(st().history.past.length).toBe(n);
  });

  it('Settings can have a kept-apart pair flagged again, as one undoable step', () => {
    const [p] = findDuplicates(st().triples) as TermPair[];
    st().keepDistinct(termKey(p.a), termKey(p.b));
    st().flagAgain([[termKey(p.b), termKey(p.a)]]);
    expect(st().distinctPairs).toEqual([]);
    expect(findDuplicates(st().triples, st().distinctPairs)).toHaveLength(1);
    st().undo();
    expect(st().distinctPairs).toHaveLength(1);
  });

  it('a new project forgets the pairs kept apart (GEN-10)', () => {
    st().keepDistinct('a', 'b');
    st().createProject(SETTINGS);
    expect(st().distinctPairs).toEqual([]);
  });
});
