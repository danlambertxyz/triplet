import { readFileSync } from 'node:fs';
import { Parser } from 'n3';
import { isomorphic } from 'rdf-isomorphic';
import { describe, expect, it } from 'vitest';
import { defaultFileName, exportGraph, validateTurtle } from '../src/core/export';
import { DATA_ENTRIES, ONTOLOGY_ENTRIES, type SampleEntry } from './fixtures/sampleEntries';
import { enter, SETTINGS } from './helpers';

const parseFile = (name: string) =>
  new Parser({ format: 'text/turtle' }).parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const parse = (ttl: string) => new Parser({ format: 'text/turtle' }).parse(ttl);

const store = enter([...ONTOLOGY_ENTRIES, ...DATA_ENTRIES]);

describe('sample domain export', () => {
  // The sample uses the prefix dg:, the app defaults to ontology:. Both name
  // https://example.org/ontology/, so the graphs compare equal by IRI.
  it('Ontology graph matches the sample Turtle (TYPE-06, TYPE-07)', () => {
    const r = exportGraph(store, SETTINGS, 'ontology');
    expect(r.valid).toBe(true);
    expect(isomorphic(parse(r.turtle), parseFile('sample-ontology.ttl'))).toBe(true);
  });

  it('Data graph matches the sample Turtle', () => {
    const r = exportGraph(store, SETTINGS, 'data');
    expect(r.valid).toBe(true);
    expect(isomorphic(parse(r.turtle), parseFile('sample-data.ttl'))).toBe(true);
  });

  it('declares only the prefixes used (PFX-03)', () => {
    expect(exportGraph(store, SETTINGS, 'data').prefixes).toEqual(['data', 'ontology', 'rdfs', 'skos', 'xsd']);
    expect(exportGraph(store, SETTINGS, 'ontology').prefixes).toEqual(['ontology', 'owl', 'rdfs', 'xsd']);
  });

  it('writes a typed date value (LIT-03, typed value test)', () => {
    const { turtle } = exportGraph(store, SETTINGS, 'data');
    expect(turtle).toMatch(/data:ClientMaster[^.]*ontology:lastRefreshed "2026-10-14"\^\^xsd:date/s);
  });

  it('writes the class picked on entry as rdf:type in the Data graph (TYPE-02, class picker test)', () => {
    const { turtle } = exportGraph(store, SETTINGS, 'data');
    expect(turtle).toMatch(/data:CUST_ID a ontology:PhysicalDataElement/);
  });

  it('combines two domains into one owl:unionOf (TYPE-07)', () => {
    const { turtle } = exportGraph(store, SETTINGS, 'ontology');
    expect(turtle).toContain('owl:unionOf (ontology:BusinessTerm ontology:DataProduct)');
    expect(turtle).toContain('owl:unionOf (ontology:DataProduct ontology:System)');
  });

  it('uses the current namespace and prefix on export (ID-04)', () => {
    const settings = {
      ...SETTINGS,
      ontology: { namespace: 'https://example.com/onto#', prefix: 'dg' },
    };
    const r = exportGraph(store, settings, 'data');
    expect(r.valid).toBe(true);
    expect(r.turtle).toContain('@prefix dg: <https://example.com/onto#>');
    expect(r.turtle).toContain('a dg:PhysicalDataElement');
    expect(r.turtle).not.toContain('example.org/ontology');
  });

  it('identifier safety: underscores, digits and spaces give valid IRIs (ID-05)', () => {
    const { turtle } = exportGraph(store, SETTINGS, 'data');
    expect(validateTurtle(turtle).valid).toBe(true);
    expect(turtle).toContain('data:CUST_ID');
    expect(turtle).toContain('data:IndividualClient360');
  });
});

describe('export rules', () => {
  const ont = (s: string, p: string, o: string): SampleEntry => ({ graph: 'ontology', subject: s, predicate: p, object: o });

  it('keeps a single domain as a plain triple', () => {
    const st = enter([ont('uses', 'domain', 'Process')]);
    const { turtle } = exportGraph(st, SETTINGS, 'ontology');
    expect(turtle).not.toContain('unionOf');
    expect(turtle).toContain('rdfs:domain ontology:Process');
  });

  it('makes several datatype ranges an rdfs:Datatype union', () => {
    const st = enter([ont('amount', 'range', 'integer'), ont('amount', 'range', 'decimal')]);
    const r = exportGraph(st, SETTINGS, 'ontology');
    expect(r.valid).toBe(true);
    expect(r.turtle).toMatch(/a rdfs:Datatype;\s*owl:unionOf \(xsd:integer xsd:decimal\)/);
    expect(r.turtle).toContain('a owl:DatatypeProperty');
  });

  it('does not add a type the user already stated (TYPE-06)', () => {
    const st = enter([ont('Person', 'type', 'Class'), ont('Employee', 'subclass of', 'Person')]);
    const quads = parse(exportGraph(st, SETTINGS, 'ontology').turtle);
    const types = quads.filter((q) => q.predicate.value.endsWith('#type') && q.subject.value.endsWith('/Person'));
    expect(types).toHaveLength(1);
    const employeeTypes = quads.filter((q) => q.predicate.value.endsWith('#type') && q.subject.value.endsWith('/Employee'));
    expect(employeeTypes.map((q) => q.object.value)).toEqual(['http://www.w3.org/2002/07/owl#Class']);
  });

  it('does not redeclare vocabulary terms such as foaf:Person', () => {
    const st = enter([ont('Employee', 'subclass of', 'foaf:Person')]);
    const { turtle } = exportGraph(st, SETTINGS, 'ontology');
    expect(turtle).not.toMatch(/foaf:Person a/);
    expect(turtle).toContain('@prefix foaf:');
  });

  it('escapes quotes and new lines in values', () => {
    const st = enter([{ graph: 'data', subject: 'Note', predicate: 'text', value: 'He said "hi"\nthen left' }]);
    const r = exportGraph(st, SETTINGS, 'data');
    expect(r.valid).toBe(true);
    const lit = parse(r.turtle).find((q) => q.predicate.value.endsWith('/text'));
    expect(lit?.object.value).toBe('He said "hi"\nthen left');
  });

  it('writes non-ASCII names as full IRIs when a prefix cannot hold them', () => {
    const st = enter([{ graph: 'data', subject: 'Café', predicate: 'serves', object: 'Crème brûlée' }]);
    const r = exportGraph(st, SETTINGS, 'data');
    expect(r.valid).toBe(true);
    expect(r.tripleCount).toBe(3);
  });

  it('an empty graph exports as an empty, valid file', () => {
    const r = exportGraph([], SETTINGS, 'data');
    expect(r.valid).toBe(true);
    expect(r.tripleCount).toBe(0);
    expect(r.prefixes).toEqual([]);
  });

  it('suggests file names from the project name', () => {
    expect(defaultFileName('Individual Client', 'data')).toBe('individual-client-data.ttl');
    expect(defaultFileName('  ', 'ontology')).toBe('triplet-ontology.ttl');
  });
});
