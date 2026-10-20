// Milestone 8: import from Turtle (IMP-01–09).

import { readFileSync } from 'node:fs';
import { Parser } from 'n3';
import { isomorphic } from 'rdf-isomorphic';
import { describe, expect, it } from 'vitest';
import { exportGraph } from '../src/core/export';
import { isParseError, planImport, readTurtle, type ImportPlan, type ParsedFile } from '../src/core/import';
import { DEFAULT_SETUP, settingsFromSetup } from '../src/core/settings';
import { termKey } from '../src/core/terms';
import type { GraphName, ObjectTerm, ProjectSettings, Triple } from '../src/core/types';
import { DATA_ENTRIES, ONTOLOGY_ENTRIES } from './fixtures/sampleEntries';
import { enter, SETTINGS } from './helpers';

const SAMPLE = enter([...ONTOLOGY_ENTRIES, ...DATA_ENTRIES]);

function parsed(name: string, text: string): ParsedFile {
  const r = readTurtle(name, text);
  if (isParseError(r)) throw new Error(r.message);
  return r;
}
function settingsOf(plan: ImportPlan, name = 'Imported'): ProjectSettings {
  return { ...settingsFromSetup({ ...plan.names, name }), customPrefixes: plan.customPrefixes };
}
const objText = (o: ObjectTerm) => (o.kind === 'iri' ? `${termKey(o)}(${o.label})` : `"${o.value}"^^${o.datatype}`);
const content = (ts: readonly Omit<Triple, 'id'>[]) =>
  ts.map((t) => `${t.graph} ${termKey(t.s)}(${t.s.label}) ${termKey(t.p)}(${t.p.label}) ${objText(t.o)}`).sort();
const quads = (turtle: string) => new Parser({ format: 'text/turtle' }).parse(turtle);
const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

function importSample() {
  const files = {
    data: parsed('data.ttl', exportGraph(SAMPLE, SETTINGS, 'data').turtle),
    ontology: parsed('ontology.ttl', exportGraph(SAMPLE, SETTINGS, 'ontology').turtle),
  };
  return planImport(files, { ...DEFAULT_SETUP, base: 'https://other.org/', dataPath: 'x', ontologyPath: 'y' });
}

describe('import: round trip of the sample (IMP-06)', () => {
  it('gives back the same stored triples, by content', () => {
    const plan = importSample();
    expect(content(plan.triples)).toEqual(content(SAMPLE));
    expect(plan.customPrefixes).toEqual([]);
    expect(plan.notes.filter((n) => n.kind !== 'handled')).toEqual([]);
  });

  it('reads the base address and graph names from the files (IMP-04)', () => {
    const plan = importSample();
    expect(plan.names).toEqual({ base: 'https://example.org/', dataPath: 'data', ontologyPath: 'ontology' });
    expect(plan.detected).toEqual({ base: true, dataPath: true, ontologyPath: true });
  });

  it('exports again to Turtle isomorphic with the expected files', () => {
    const plan = importSample();
    const triples = plan.triples.map((t, i) => ({ ...t, id: String(i) }));
    const s = settingsOf(plan);
    expect(isomorphic(quads(exportGraph(triples, s, 'ontology').turtle), quads(fixture('sample-ontology.ttl')))).toBe(true);
    expect(isomorphic(quads(exportGraph(triples, s, 'data').turtle), quads(fixture('sample-data.ttl')))).toBe(true);
  });

  it('imports the hand-written sample files too', () => {
    const plan = planImport(
      { data: parsed('d.ttl', fixture('sample-data.ttl')), ontology: parsed('o.ttl', fixture('sample-ontology.ttl')) },
      DEFAULT_SETUP,
    );
    expect(content(plan.triples)).toEqual(content(SAMPLE));
    // The file's own dg: prefix is the Ontology graph's namespace, named "ontology" after its path.
    expect(plan.prefixes.find((p) => p.prefix === 'dg')?.role).toBe('ontology');
  });

  it('notes what it handled: labels, types and unions', () => {
    const notes = importSample().notes;
    const n = (graph: GraphName, what: string) => notes.find((x) => x.graph === graph && x.what === what)?.count;
    expect(n('ontology', 'Either/or domains and ranges')).toBe(2);
    expect(n('ontology', 'Labels used as names')).toBe(17);
    expect(n('ontology', 'Types Triplet adds itself')).toBe(17);
    expect(n('data', 'Labels used as names')).toBe(34);
  });

  it('counts triples per graph', () => {
    const plan = importSample();
    expect(plan.perGraph.data?.stored).toBe(SAMPLE.filter((t) => t.graph === 'data').length);
    expect(plan.perGraph.ontology?.stored).toBe(SAMPLE.filter((t) => t.graph === 'ontology').length);
  });
});

describe('import: one file only', () => {
  it('a Data file alone finds the Ontology namespace from its classes and relationships', () => {
    const plan = planImport({ data: parsed('d.ttl', fixture('sample-data.ttl')) }, DEFAULT_SETUP);
    expect(plan.names).toEqual({ base: 'https://example.org/', dataPath: 'data', ontologyPath: 'ontology' });
    const belongs = plan.triples.find((t) => t.p.local === 'belongsTo')!;
    // No Ontology file, so the relationship is named after its local name.
    expect(belongs.p).toMatchObject({ ns: 'ontology', label: 'belongsTo' });
  });
  it('an Ontology file alone keeps the form’s Data graph name', () => {
    const plan = planImport(
      { ontology: parsed('o.ttl', fixture('sample-ontology.ttl')) },
      { ...DEFAULT_SETUP, dataPath: 'instances' },
    );
    expect(plan.names).toEqual({ base: 'https://example.org/', dataPath: 'instances', ontologyPath: 'ontology' });
    expect(plan.detected.dataPath).toBe(false);
  });
});

const OUTSIDE = `
@prefix ex:   <http://acme.com/model#> .
@prefix id:   <https://acme.com/id/> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix owl:  <http://www.w3.org/2002/07/owl#> .
@prefix xsd:  <http://www.w3.org/2001/XMLSchema#> .

id:Alice a ex:Person ;
  rdfs:label "Alice"@en , "Alicia"@es ;
  ex:age "42"^^xsd:int ;
  ex:height "1.7E0"^^xsd:double ;
  ex:born "1990"^^xsd:gYear ;
  ex:joined "2026-02-30"^^xsd:date ;
  ex:address [ ex:city "Leeds" ] ;
  ex:knows id:Bob .
id:Bob rdfs:label "Bob" ; ex:nick "Bobby"@en .
[] ex:note "anonymous" .
ex:Person rdfs:subClassOf [ a owl:Restriction ; owl:onProperty ex:age ; owl:maxCardinality 1 ] .
id:Alice ex:tags ( "a" "b" ) .
`;

describe('import: a Turtle file from elsewhere (IMP-07)', () => {
  const plan = planImport({ data: parsed('people.ttl', OUTSIDE) }, DEFAULT_SETUP);
  const note = (what: string) => plan.notes.find((n) => n.what === what);
  const lit = (local: string) => plan.triples.find((t) => t.p.local === local)?.o;

  it('uses the most common subject namespace as the Data graph', () => {
    expect(plan.names).toMatchObject({ base: 'https://acme.com/', dataPath: 'id' });
  });
  it('makes an unknown namespace a custom prefix with the file’s own name', () => {
    expect(plan.customPrefixes).toEqual([{ id: 'imported-1', prefix: 'ex', namespace: 'http://acme.com/model#' }]);
    expect(plan.triples.find((t) => t.p.local === 'knows')?.p).toMatchObject({ ns: 'custom:imported-1', label: 'knows' });
  });
  it('drops language tags, preferring the English label as the name', () => {
    const alice = plan.triples.find((t) => t.s.local === 'Alice')!.s;
    expect(alice.label).toBe('Alice');
    // The Spanish label stays as a triple, as text.
    expect(plan.triples.some((t) => t.p.local === 'label' && t.o.kind === 'literal' && t.o.value === 'Alicia')).toBe(true);
    expect(note('Language tags')?.count).toBe(3);
    expect(lit('nick')).toEqual({ kind: 'literal', value: 'Bobby', datatype: 'string' });
  });
  it('maps or simplifies datatypes Triplet lacks', () => {
    expect(lit('age')).toEqual({ kind: 'literal', value: '42', datatype: 'integer' });
    expect(lit('height')).toEqual({ kind: 'literal', value: '1.7E0', datatype: 'string' });
    expect(lit('born')).toEqual({ kind: 'literal', value: '1990', datatype: 'string' });
    expect(lit('joined')).toEqual({ kind: 'literal', value: '2026-02-30', datatype: 'string' });
    expect(note('Datatype xsd:int')?.example).toBe('id:Alice ex:age "42"^^xsd:int');
    expect(note('Datatype xsd:gYear')?.count).toBe(1);
    expect(note("Values that don't fit xsd:date")?.count).toBe(1);
  });
  it('leaves out blank nodes, restrictions and lists, each listed with an example', () => {
    expect(note('Blank nodes')?.count).toBe(2);
    expect(note('Blank nodes')?.example).toBe('id:Alice ex:address […]');
    expect(note('OWL restrictions')).toMatchObject({ kind: 'left-out', count: 1 });
    expect(note('RDF lists')?.count).toBe(1);
    expect(plan.triples.some((t) => t.p.local === 'city' || t.p.local === 'note')).toBe(false);
  });
  it('names Bob, who has only a label in his own graph, and keeps his triples', () => {
    expect(plan.triples.find((t) => t.p.local === 'knows')?.o).toMatchObject({ local: 'Bob', label: 'Bob' });
  });
});

describe('import: other rules', () => {
  it('refuses a file that isn’t Turtle, with the parser’s line (IMP-03)', () => {
    const r = readTurtle('bad.ttl', '@prefix ex: <http://x.org/> .\n\nex:a ex:b ;; nonsense');
    expect(isParseError(r) && r.line).toBe(3);
  });
  it('a namespace both files use goes to the Ontology graph', () => {
    const t = '@prefix ex: <https://acme.com/core/> .\nex:A ex:rel ex:B .';
    const plan = planImport({ data: parsed('d', t), ontology: parsed('o', t) }, DEFAULT_SETUP);
    expect(plan.names).toEqual({ base: 'https://acme.com/', dataPath: 'data', ontologyPath: 'core' });
    expect(plan.triples.every((t2) => t2.s.ns === 'ontology')).toBe(true);
  });
  it('keeps a relationship with several domains and ranges, with a note (IMP-08, ENT-11)', () => {
    const t = `@prefix o: <https://example.org/ontology/> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
o:rel rdfs:domain o:A , o:B ; rdfs:range o:C , o:D .`;
    const plan = planImport({ ontology: parsed('o', t) }, DEFAULT_SETUP);
    expect(plan.triples).toHaveLength(4);
    expect(plan.notes.find((n) => n.what.startsWith('Relationships with several'))?.count).toBe(1);
  });
  it('keeps explicit types the export wouldn’t add', () => {
    const t = `@prefix o: <https://example.org/ontology/> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
o:Loose a owl:Class .
o:p a owl:ObjectProperty , owl:DatatypeProperty ; rdfs:domain o:A .`;
    const plan = planImport({ ontology: parsed('o', t) }, DEFAULT_SETUP);
    const types = plan.triples.filter((x) => x.p.local === 'type').map((x) => `${x.s.local} ${(x.o as { local: string }).local}`);
    expect(types.sort()).toEqual(['Loose Class', 'p DatatypeProperty', 'p ObjectProperty']);
  });
  it('stores a repeated triple once (DUP-01)', () => {
    const t = '@prefix d: <https://example.org/data/> .\nd:A d:p "x" , "x"@en .';
    const plan = planImport({ data: parsed('d', t) }, DEFAULT_SETUP);
    expect(plan.triples).toHaveLength(1);
  });
  it('leaves out IRIs with no namespace a prefix could stand for (urn:, relative), without hanging', () => {
    const t = '@prefix d: <https://example.org/data/> .\n<urn:isbn:1> d:p "x" .\nd:A <rel> d:B .\nd:A d:q d:B .';
    const plan = planImport({ data: parsed('d', t) }, DEFAULT_SETUP);
    expect(plan.triples.map((x) => x.p.local)).toEqual(['q']);
    expect(plan.notes.find((n) => n.what === "IRIs Triplet can't name")?.count).toBe(2);
    expect(plan.customPrefixes).toEqual([]);
  });
  it('keeps a typed label as a triple, so its datatype isn’t lost', () => {
    const t = '@prefix d: <https://example.org/data/> .\n@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\nd:A rdfs:label 42 ; d:p d:B .';
    const plan = planImport({ data: parsed('d', t) }, DEFAULT_SETUP);
    expect(plan.triples.find((x) => x.p.local === 'label')?.o).toEqual({ kind: 'literal', value: '42', datatype: 'integer' });
    expect(plan.triples.find((x) => x.p.local === 'p')?.s.label).toBe('A');
  });
  it('keeps the entry form’s names for standard terms, whatever a file labels them', () => {
    const t = `@prefix o: <https://example.org/ontology/> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
rdfs:subClassOf rdfs:label "subClassOf" .
o:A rdfs:subClassOf o:B .`;
    const plan = planImport({ ontology: parsed('o', t) }, DEFAULT_SETUP);
    expect(plan.triples.find((x) => x.s.local === 'A')?.p.label).toBe('subclass of');
  });
});
