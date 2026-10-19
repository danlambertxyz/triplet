// Classes decided up front (SCR-01) and ticked on the Ontology tab (ENT-10).
import { describe, expect, it } from 'vitest';
import { declareClasses, parseClassList, resolveEntry, type EntryDraft } from '../src/core/entry';
import { prefixedName, termKey } from '../src/core/terms';
import { currentClassOf, pickerClasses } from '../src/core/typing';
import type { Triple } from '../src/core/types';
import { enter, SETTINGS } from './helpers';

const show = (ts: Omit<Triple, 'id'>[]) =>
  ts.map((t) => [t.s, t.p, t.o].map((x) => (x.kind === 'iri' ? prefixedName(x, SETTINGS) : x.value)).join(' '));
const withIds = (ts: Omit<Triple, 'id'>[]): Triple[] => ts.map((t, i) => ({ ...t, id: `c${i}` }));

const draft = (d: Partial<EntryDraft>): EntryDraft => ({
  graph: 'ontology',
  subject: '',
  predicate: '',
  objectKind: 'entity',
  object: '',
  datatype: 'string',
  ...d,
});

describe('classes named on the setup screen (SCR-01)', () => {
  it('reads one class per line, ignoring blank lines', () => {
    expect(parseClassList('System\n\n  Dataset  \nBusiness term\n')).toEqual({
      names: ['System', 'Dataset', 'Business term'],
      errors: [],
    });
  });

  it('flags duplicates and names with no letters', () => {
    const r = parseClassList('System\nsystem\n!!!');
    expect(r.names).toEqual(['System']);
    expect(r.errors).toEqual(['"system" is listed twice.', '"!!!" needs at least one letter or number.']);
  });

  it('declares each as an owl:Class, so the class pickers list them at once', () => {
    const triples = declareClasses(['System', 'Business term'], SETTINGS);
    expect(show(triples)).toEqual(['ontology:System rdf:type owl:Class', 'ontology:BusinessTerm rdf:type owl:Class']);
    expect(pickerClasses(withIds(triples)).map((c) => c.label)).toEqual(['Business term', 'System']);
  });
});

describe('class tick boxes on the Ontology tab (ENT-10)', () => {
  const store = withIds(declareClasses(['Logical Data Element'], SETTINGS));

  it('a subject ticked as a class is a complete entry on its own', () => {
    const r = resolveEntry(draft({ subject: 'Data Domain', subjectIsClass: true }), store, SETTINGS);
    expect(show(r.triples)).toEqual(['ontology:DataDomain rdf:type owl:Class']);
  });

  it('asks for a predicate when the ticked subject is already a class', () => {
    const r = resolveEntry(draft({ subject: 'Logical Data Element', subjectIsClass: true }), store, SETTINGS);
    expect(r.errors).toEqual({ predicate: 'Enter a predicate.' });
    expect(r.alreadyClass.subject).toBe(true);
  });

  it('ticking the object as a class turns the entry into a relationship (ENT-09)', () => {
    const r = resolveEntry(
      draft({
        subject: 'Logical Data Element',
        predicate: 'logical maps to',
        object: 'Business Term',
        objectIsClass: true,
      }),
      store,
      SETTINGS,
    );
    expect(r.relationship?.recorded).toBe(true);
    expect(show(r.triples)).toEqual([
      'ontology:BusinessTerm rdf:type owl:Class',
      'ontology:logicalMapsTo rdfs:domain ontology:LogicalDataElement',
      'ontology:logicalMapsTo rdfs:range ontology:BusinessTerm',
    ]);
  });

  it('without ticks, a new object is not treated as a class', () => {
    const r = resolveEntry(
      draft({ subject: 'Logical Data Element', predicate: 'logical maps to', object: 'Business Term' }),
      store,
      SETTINGS,
    );
    expect(r.relationship).toBeUndefined();
    expect(r.triples).toHaveLength(1);
  });

  it('a ticked subject keeps a class name even with a property-making predicate', () => {
    const r = resolveEntry(
      draft({ subject: 'Asset', subjectIsClass: true, predicate: 'subclass of', object: 'Thing' }),
      [],
      SETTINGS,
    );
    expect(show(r.triples)).toEqual([
      'ontology:Asset rdf:type owl:Class',
      'ontology:Asset rdfs:subClassOf ontology:Thing',
    ]);
  });
});

describe('the class picker follows the subject', () => {
  it("finds an existing subject's class by its typed name", () => {
    const store = enter(
      [{ graph: 'data', subject: 'CRM', cls: 'System' }],
      withIds(declareClasses(['System'], SETTINGS)),
    );
    const system = pickerClasses(store).find((c) => c.label === 'System')!;
    expect(currentClassOf(store, 'CRM')).toBe(termKey(system));
    expect(currentClassOf(store, ' CRM ')).toBe(termKey(system));
    expect(currentClassOf(store, 'crm')).toBeUndefined();
    expect(currentClassOf(store, 'New thing')).toBeUndefined();
  });
});
