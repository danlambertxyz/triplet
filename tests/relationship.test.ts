// ENT-09: on the Ontology tab, "Class · relationship · Class" is recorded as the
// relationship's domain and range when both ends are already classes.
import { describe, expect, it } from 'vitest';
import { resolveEntry, type EntryDraft } from '../src/core/entry';
import { buildGraph } from '../src/core/graphModel';
import { prefixedName } from '../src/core/terms';
import type { Triple } from '../src/core/types';
import { enter, SETTINGS } from './helpers';

// Two classes, made classes by a parent each.
const store = enter([
  { graph: 'ontology', subject: 'Logical Data Element', predicate: 'subclass of', object: 'Data element' },
  { graph: 'ontology', subject: 'Business Term', predicate: 'subclass of', object: 'Concept' },
]);

const draft = (d: Partial<EntryDraft>): EntryDraft => ({
  graph: 'ontology',
  subject: 'Logical Data Element',
  predicate: 'logical maps to',
  objectKind: 'entity',
  object: 'Business Term',
  datatype: 'string',
  ...d,
});

const show = (r: ReturnType<typeof resolveEntry>) =>
  r.triples.map((t) => [t.s, t.p, t.o].map((x) => (x.kind === 'iri' ? prefixedName(x, SETTINGS) : x.value)).join(' '));

describe('class-to-class entries become relationships (ENT-09)', () => {
  it('records a domain and a range triple by default', () => {
    const r = resolveEntry(draft({}), store, SETTINGS);
    expect(r.errors).toEqual({});
    expect(r.relationship?.recorded).toBe(true);
    expect(show(r)).toEqual([
      'ontology:logicalMapsTo rdfs:domain ontology:LogicalDataElement',
      'ontology:logicalMapsTo rdfs:range ontology:BusinessTerm',
    ]);
  });

  it('adds the plain triple when the user chooses to', () => {
    const r = resolveEntry(draft({ asRelationship: false }), store, SETTINGS);
    expect(r.relationship?.recorded).toBe(false);
    expect(show(r)).toEqual(['ontology:LogicalDataElement ontology:logicalMapsTo ontology:BusinessTerm']);
  });

  it('is not offered when either end is not a class yet', () => {
    expect(resolveEntry(draft({ object: 'Something new' }), store, SETTINGS).relationship).toBeUndefined();
    expect(resolveEntry(draft({ subject: 'Something new' }), store, SETTINGS).relationship).toBeUndefined();
  });

  it('is not offered for standard predicates or on the Data tab', () => {
    expect(resolveEntry(draft({ predicate: 'subclass of' }), store, SETTINGS).relationship).toBeUndefined();
    expect(resolveEntry(draft({ graph: 'data' }), store, SETTINGS).relationship).toBeUndefined();
  });

  it('skips triples already recorded, and says so when there is nothing new', () => {
    const once = enter(
      [{ graph: 'ontology', subject: 'logical maps to', predicate: 'domain', object: 'Logical Data Element' }],
      store,
    );
    expect(show(resolveEntry(draft({}), once, SETTINGS))).toEqual([
      'ontology:logicalMapsTo rdfs:range ontology:BusinessTerm',
    ]);
    const both = enter(
      [{ graph: 'ontology', subject: 'logical maps to', predicate: 'range', object: 'Business Term' }],
      once,
    );
    expect(resolveEntry(draft({}), both, SETTINGS).errors.predicate).toBe('This relationship is already recorded.');
  });

  it('draws one arrow between the classes', () => {
    const r = resolveEntry(draft({}), store, SETTINGS);
    const t = [...store, ...r.triples.map((x, i) => ({ ...x, id: `r${i}` }))];
    const m = buildGraph(t, 'ontology', 'separate');
    expect(m.edges.filter((e) => e.kind === 'relation').map((e) => e.labels)).toEqual([['logical maps to']]);
  });
});

describe('one class pairing per relationship (ENT-11)', () => {
  const three = enter([
    { graph: 'ontology', subject: 'Logical Data Element', predicate: 'subclass of', object: 'Data element' },
    { graph: 'ontology', subject: 'Business Term', predicate: 'subclass of', object: 'Concept' },
    { graph: 'ontology', subject: 'Data Domain', predicate: 'subclass of', object: 'Concept' },
    { graph: 'ontology', subject: 'Data Product', predicate: 'subclass of', object: 'Concept' },
  ]);
  const rel = (subject: string, object: string, store: Triple[]) =>
    resolveEntry(draft({ subject, predicate: 'belongs to', object }), store, SETTINGS);
  const add = (r: ReturnType<typeof resolveEntry>, store: Triple[]) => [
    ...store,
    ...r.triples.map((t, i) => ({ ...t, id: `${store.length + i}` })),
  ];

  it('refuses a second pair of classes that differs on both sides', () => {
    const first = add(rel('Business Term', 'Data Domain', three), three);
    const r = rel('Logical Data Element', 'Business Term', first);
    expect(r.triples).toEqual([]);
    expect(r.errors.predicate).toMatch(/“belongs to” already goes from Business Term to Data Domain/);
  });

  it('allows a shared range with several domains, as in the sample (TYPE-07)', () => {
    const first = add(rel('Business Term', 'Data Domain', three), three);
    expect(rel('Data Product', 'Data Domain', first).errors).toEqual({});
  });

  it('catches the same clash when domain and range are typed directly', () => {
    const first = add(rel('Business Term', 'Data Domain', three), three);
    const second = add(
      resolveEntry(
        draft({ subject: 'belongs to', predicate: 'domain', object: 'Logical Data Element' }),
        first,
        SETTINGS,
      ),
      first,
    );
    const r = resolveEntry(
      draft({ subject: 'belongs to', predicate: 'range', object: 'Business Term' }),
      second,
      SETTINGS,
    );
    expect(r.errors.subject).toMatch(/already goes from/);
  });
});
