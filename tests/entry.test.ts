import { describe, expect, it } from 'vitest';
import { resolveEntry, type EntryDraft } from '../src/core/entry';
import { prefixedName } from '../src/core/terms';
import { pickerClasses } from '../src/core/typing';
import { DATA_ENTRIES, ONTOLOGY_ENTRIES } from './fixtures/sampleEntries';
import { enter, SETTINGS } from './helpers';

const draft = (d: Partial<EntryDraft>): EntryDraft => ({
  graph: 'data',
  subject: '',
  predicate: '',
  objectKind: 'entity',
  object: '',
  datatype: 'string',
  ...d,
});

describe('resolveEntry', () => {
  it('turns one entry into one triple (FLOW-01) with readable IRIs (ID-06)', () => {
    const r = resolveEntry(draft({ subject: 'Alice', predicate: 'works for', object: 'Acme Bank' }), [], SETTINGS);
    expect(r.errors).toEqual({});
    expect(r.triples).toHaveLength(1);
    const [t] = r.triples;
    expect(prefixedName(t.s, SETTINGS)).toBe('data:Alice');
    expect(prefixedName(t.p, SETTINGS)).toBe('ontology:worksFor');
    expect(t.o.kind === 'iri' && prefixedName(t.o, SETTINGS)).toBe('data:AcmeBank');
    expect(t.p.label).toBe('works for');
  });

  it('reuses an existing term with the same typed name', () => {
    const st = enter([{ graph: 'data', subject: 'CRM', predicate: 'uses', object: 'Oracle' }]);
    const r = resolveEntry(draft({ subject: 'CRM', predicate: 'uses', object: 'Postgres' }), st, SETTINGS);
    expect(r.triples[0].s).toBe(st[0].s);
    expect(r.triples[0].p).toBe(st[0].p);
  });

  it('gives a clashing new name a numbered suffix (ID-08)', () => {
    const st = enter([{ graph: 'data', subject: 'Date of Birth', predicate: 'belongs to', object: 'Individual Client' }]);
    const r = resolveEntry(draft({ subject: 'date of birth', predicate: 'belongs to', object: 'Individual Client' }), st, SETTINGS);
    expect(r.triples[0].s.local).toBe('DateOfBirth_2');
    expect(r.triples[0].s.label).toBe('date of birth');
  });

  it('names ontology properties in camelCase and classes in PascalCase', () => {
    const r = resolveEntry(draft({ graph: 'ontology', subject: 'has dataset', predicate: 'range', object: 'Data set' }), [], SETTINGS);
    expect(r.triples[0].s.local).toBe('hasDataset');
    expect(r.triples[0].o.kind === 'iri' && r.triples[0].o.local).toBe('DataSet');
    const typed = resolveEntry(draft({ graph: 'ontology', subject: 'belongs to', predicate: 'type', object: 'FunctionalProperty' }), [], SETTINGS);
    expect(typed.triples[0].s.local).toBe('belongsTo');
    expect(prefixedName(typed.triples[0].p, SETTINGS)).toBe('rdf:type');
  });

  it('maps the Data tab common predicates to standard terms (ENT-04)', () => {
    const r = resolveEntry(draft({ subject: 'X', predicate: 'definition', objectKind: 'value', object: 'An X.' }), [], SETTINGS);
    expect(prefixedName(r.triples[0].p, SETTINGS)).toBe('skos:definition');
  });

  it('reads "type" on the Data tab as rdf:type with an ontology class as object', () => {
    const st = enter(ONTOLOGY_ENTRIES);
    const r = resolveEntry(draft({ subject: 'CRM', predicate: 'type', object: 'System' }), st, SETTINGS);
    expect(prefixedName(r.triples[0].p, SETTINGS)).toBe('rdf:type');
    expect(r.triples[0].o.kind === 'iri' && prefixedName(r.triples[0].o, SETTINGS)).toBe('ontology:System');
  });

  it('accepts prefixed names such as skos:prefLabel', () => {
    const r = resolveEntry(draft({ subject: 'X', predicate: 'skos:prefLabel', objectKind: 'value', object: 'Ex' }), [], SETTINGS);
    expect(prefixedName(r.triples[0].p, SETTINGS)).toBe('skos:prefLabel');
  });

  it('adds subject rdf:type Class when a class is picked (TYPE-02), and allows skipping it (TYPE-03)', () => {
    const st = enter(ONTOLOGY_ENTRIES);
    const pde = pickerClasses(st).find((c) => c.label === 'Physical data element')!;
    const r = resolveEntry(
      draft({ subject: 'CUST_ID', classKey: `${pde.ns}|${pde.local}`, predicate: 'implements', object: 'Client ID' }),
      st,
      SETTINGS,
    );
    expect(r.triples.map((t) => `${prefixedName(t.s, SETTINGS)} ${prefixedName(t.p, SETTINGS)}`)).toEqual([
      'data:CUST_ID ontology:implements',
      'data:CUST_ID rdf:type',
    ]);
    const skip = resolveEntry(draft({ subject: 'CUST_ID', predicate: 'implements', object: 'Client ID' }), st, SETTINGS);
    expect(skip.triples).toHaveLength(1);
  });

  it('types an entity object with the class picked for it', () => {
    const st = enter(ONTOLOGY_ENTRIES);
    const key = (label: string) => {
      const c = pickerClasses(st).find((x) => x.label === label)!;
      return `${c.ns}|${c.local}`;
    };
    const r = resolveEntry(
      draft({
        subject: 'CUST_ID',
        classKey: key('Physical data element'),
        predicate: 'implements',
        object: 'Client ID',
        objectClassKey: key('Logical data element'),
      }),
      st,
      SETTINGS,
    );
    expect(r.triples.map((t) => `${t.s.local} ${t.p.local} ${t.o.kind === 'iri' ? t.o.local : ''}`)).toEqual([
      'CUST_ID implements ClientID',
      'CUST_ID type PhysicalDataElement',
      'ClientID type LogicalDataElement',
    ]);
    const asValue = resolveEntry(
      draft({ subject: 'X', predicate: 'p', objectKind: 'value', object: 'v', objectClassKey: key('Process') }),
      st,
      SETTINGS,
    );
    expect(asValue.triples).toHaveLength(1);
  });

  it('lists ontology classes in the picker, typed from use (TYPE-05, TYPE-06)', () => {
    expect(pickerClasses([])).toEqual([]);
    const labels = pickerClasses(enter(ONTOLOGY_ENTRIES)).map((c) => c.label);
    expect(labels).toEqual([
      'Business term',
      'Data domain',
      'Data product',
      'Dataset',
      'Logical data element',
      'Physical data element',
      'Process',
      'System',
    ]);
  });

  it('checks values against their datatype (LIT-02)', () => {
    const v = (object: string, datatype: EntryDraft['datatype']) =>
      resolveEntry(draft({ subject: 'X', predicate: 'p', objectKind: 'value', object, datatype }), [], SETTINGS);
    expect(v('2026-10-14', 'date').errors).toEqual({});
    expect(v('2026-02-30', 'date').errors.object).toBeTruthy();
    expect(v('14/10/2026', 'date').errors.object).toBeTruthy();
    expect(v('TRUE', 'boolean').triples[0].o).toMatchObject({ value: 'true' });
    expect(v('yes', 'boolean').errors.object).toBeTruthy();
    expect(v('42', 'integer').errors).toEqual({});
    expect(v('4.2', 'integer').errors.object).toBeTruthy();
    expect(v('4.2', 'decimal').errors).toEqual({});
    expect(v('2026-10-14T09:30:00Z', 'dateTime').errors).toEqual({});
    expect(v('2026-10-14 09:30', 'dateTime').errors.object).toBeTruthy();
    expect(v('  ', 'string').errors.object).toBeTruthy();
  });

  it('reports missing fields and names without letters or digits', () => {
    expect(Object.keys(resolveEntry(draft({}), [], SETTINGS).errors).sort()).toEqual(['object', 'predicate', 'subject']);
    expect(resolveEntry(draft({ subject: '!!', predicate: 'p', object: 'o' }), [], SETTINGS).errors.subject).toBeTruthy();
  });

  it('accepts the sample test cases: shared logical element and optional link', () => {
    const st = enter([...ONTOLOGY_ENTRIES, ...DATA_ENTRIES]);
    const implementsClientId = st.filter(
      (t) => t.p.local === 'implements' && t.o.kind === 'iri' && t.o.local === 'ClientID',
    );
    expect(implementsClientId.map((t) => t.s.local)).toEqual(['CUST_ID', 'CLIENT_NO']);
    expect(st.some((t) => t.o.kind === 'iri' && t.o.local === 'CountryOfResidence')).toBe(false);
  });
});
