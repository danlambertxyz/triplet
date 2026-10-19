// Milestone 7 full pass: every test case in the sample domain, in the
// order of its "Test cases" table, entered through the same path as the entry form.
// Each case also has detailed tests next to the feature it checks (duplicates,
// conformance, edit, export); this file runs them together on one project.

import { readFileSync } from 'node:fs';
import { Parser, type Quad } from 'n3';
import { isomorphic } from 'rdf-isomorphic';
import { describe, expect, it } from 'vitest';
import { checkConformance } from '../src/core/conformance';
import { findDuplicates, type TermPair } from '../src/core/duplicates';
import { termUses } from '../src/core/edit';
import { exportGraph } from '../src/core/export';
import { collectTerms } from '../src/core/terms';
import type { GraphName, IriTerm, Triple } from '../src/core/types';
import { DATA_ENTRIES, ONTOLOGY_ENTRIES, type SampleEntry } from './fixtures/sampleEntries';
import { enter, SETTINGS } from './helpers';

const DATA = 'https://example.org/data/';
const ONT = 'https://example.org/ontology/';
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const XSD_DATE = 'http://www.w3.org/2001/XMLSchema#date';

const SAMPLE = enter([...ONTOLOGY_ENTRIES, ...DATA_ENTRIES]);
const d = (subject: string, predicate: string, object: string, cls?: string): SampleEntry => ({
  graph: 'data',
  subject,
  predicate,
  object,
  cls,
});

function term(store: readonly Triple[], label: string): IriTerm {
  const t = [...collectTerms(store).values()].find((x) => x.ns === 'data' && x.label === label);
  if (!t) throw new Error(`No term "${label}" in the Data graph`);
  return t;
}
/** Exports one graph and parses it back, failing if the file isn't valid Turtle. */
function exported(store: readonly Triple[], graph: GraphName): Quad[] {
  const r = exportGraph(store, SETTINGS, graph);
  expect(r.valid).toBe(true);
  return new Parser({ format: 'text/turtle' }).parse(r.turtle);
}
const fixture = (name: string) =>
  new Parser({ format: 'text/turtle' }).parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const has = (quads: Quad[], s: string, p: string, o: string) =>
  quads.some((q) => q.subject.value === s && q.predicate.value === p && q.object.value === o);

describe('sample domain: the clean sample', () => {
  it('both exports load cleanly and match the expected Turtle', () => {
    expect(isomorphic(exported(SAMPLE, 'ontology'), fixture('sample-ontology.ttl'))).toBe(true);
    expect(isomorphic(exported(SAMPLE, 'data'), fixture('sample-data.ttl'))).toBe(true);
  });
});

describe('sample domain: every test case', () => {
  it('Duplicate: "date of birth" beside "Date of Birth" is flagged as a possible duplicate (DUP-01)', () => {
    const store = enter(
      [{ graph: 'data', subject: 'date of birth', cls: 'Business term', predicate: 'belongs to', object: 'Individual Client' }],
      SAMPLE,
    );
    const pairs = findDuplicates(store) as TermPair[];
    expect(pairs.map((p) => [p.a.label, p.b.label])).toEqual([['Date of Birth', 'date of birth']]);
  });

  it('Many-to-one violation: DOB also implements Client ID is flagged, not blocked (CHK-10)', () => {
    const store = enter([d('DOB', 'implements', 'Client ID')], SAMPLE);
    expect(store).toHaveLength(SAMPLE.length + 1);
    const flags = checkConformance(store).flags;
    expect(flags).toHaveLength(2);
    expect(flags.every((f) => f.kind === 'functional' && !f.accepted)).toBe(true);
  });

  it('Shared logical element: CUST_ID and CLIENT_NO both implement Client ID, with no flag', () => {
    const shared = SAMPLE.filter((t) => t.p.label === 'implements' && t.o.kind === 'iri' && t.o.label === 'Client ID');
    expect(shared.map((t) => t.s.label).sort()).toEqual(['CLIENT_NO', 'CUST_ID']);
    expect(checkConformance(SAMPLE).flags).toEqual([]);
    expect(findDuplicates(SAMPLE)).toEqual([]);
  });

  it('Optional link: Country of Residence has no physical data element, with no flag', () => {
    const cor = term(SAMPLE, 'Country of Residence');
    expect(termUses(SAMPLE, cor).asObject).toEqual([]);
    expect(checkConformance(SAMPLE).flags).toEqual([]);
  });

  it('Identifier safety: underscores, numbers and spaces give valid IRIs on export (ID-05)', () => {
    const quads = exported(SAMPLE, 'data');
    const subjects = new Set(quads.map((q) => q.subject.value));
    for (const local of ['CUST_ID', 'ADDR_LN1', 'IndividualClient360', 'AddressLine1']) {
      expect(subjects).toContain(DATA + local);
    }
  });

  it('Typed value: Client Master last refreshed 2026-10-14 exports as "2026-10-14"^^xsd:date (LIT-03)', () => {
    const q = exported(SAMPLE, 'data').find(
      (x) => x.subject.value === DATA + 'ClientMaster' && x.predicate.value === ONT + 'lastRefreshed',
    );
    if (q?.object.termType !== 'Literal') throw new Error('Client Master has no last refreshed value');
    expect(q.object.value).toBe('2026-10-14');
    expect(q.object.datatype.value).toBe(XSD_DATE);
  });

  it('Class picker: picking Physical data element for CUST_ID writes data:CUST_ID a dg:PhysicalDataElement (TYPE-02)', () => {
    const store = enter([d('CUST_ID', 'implements', 'Client ID', 'Physical data element')], enter(ONTOLOGY_ENTRIES));
    const typed = store.filter((t) => t.graph === 'data' && t.s.label === 'CUST_ID' && t.p.local === 'type');
    expect(typed).toHaveLength(1);
    expect(has(exported(store, 'data'), DATA + 'CUST_ID', RDF_TYPE, ONT + 'PhysicalDataElement')).toBe(true);
  });

  it('Delete warning: deleting DOB lists every triple using it, and nothing goes until confirmed (EDIT-04)', () => {
    const uses = termUses(SAMPLE, term(SAMPLE, 'DOB'));
    // Four as subject and three as object; labels are written on export, not stored (M3 hand-over).
    expect(uses.asSubject).toHaveLength(4);
    expect(uses.asObject.map((t) => t.s.label).sort()).toEqual(['CRM', 'Client Onboarding', 'KYC Periodic Review']);
    // Confirming removes exactly those triples, and the export stays valid.
    const gone = new Set(uses.all.map((t) => t.id));
    const after = SAMPLE.filter((t) => !gone.has(t.id));
    expect(after).toHaveLength(SAMPLE.length - 7);
    expect(exported(after, 'data').some((q) => q.subject.value === DATA + 'DOB' || q.object.value === DATA + 'DOB')).toBe(
      false,
    );
  });
});

describe('sample domain: all test cases on one project', () => {
  it('both exports still load cleanly', () => {
    let store = enter(
      [
        { graph: 'data', subject: 'date of birth', cls: 'Business term', predicate: 'belongs to', object: 'Individual Client' },
        d('DOB', 'implements', 'Client ID'),
      ],
      SAMPLE,
    );
    const gone = new Set(termUses(store, term(store, 'DOB')).all.map((t) => t.id));
    store = store.filter((t) => !gone.has(t.id));
    const data = exported(store, 'data');
    const ontology = exported(store, 'ontology');
    // Deleting DOB doesn't touch the Ontology graph.
    expect(isomorphic(ontology, fixture('sample-ontology.ttl'))).toBe(true);
    expect(has(data, DATA + 'DateOfBirth_2', RDF_TYPE, ONT + 'BusinessTerm')).toBe(true);
  });
});
