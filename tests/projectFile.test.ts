// Milestone 8: the Triplet project file (PRJ-01–06).

import { readFileSync } from 'node:fs';
import { Parser } from 'n3';
import { isomorphic } from 'rdf-isomorphic';
import { describe, expect, it } from 'vitest';
import { checkConformance, exceptionFor } from '../src/core/conformance';
import { findDuplicates, type TermPair } from '../src/core/duplicates';
import { exportGraph } from '../src/core/export';
import { projectFileName, readProjectFile, writeProjectFile, type ProjectContent } from '../src/core/projectFile';
import { termKey } from '../src/core/terms';
import { DATA_ENTRIES, ONTOLOGY_ENTRIES } from './fixtures/sampleEntries';
import { enter, SETTINGS } from './helpers';

const SAMPLE = enter([...ONTOLOGY_ENTRIES, ...DATA_ENTRIES]);
const quads = (t: string) => new Parser({ format: 'text/turtle' }).parse(t);
const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

/** The sample in Validate mode with an accepted exception, a pair kept apart and a dragged card. */
function sampleProject(): ProjectContent {
  const triples = enter(
    [
      { graph: 'data', subject: 'DOB', predicate: 'implements', object: 'Client ID' },
      { graph: 'data', subject: 'date of birth', cls: 'Business term', predicate: 'belongs to', object: 'Individual Client' },
    ],
    SAMPLE,
  );
  const flag = checkConformance(triples).flags[0];
  const pair = findDuplicates(triples)[0] as TermPair;
  return {
    settings: { ...SETTINGS, customPrefixes: [{ id: 'c1', prefix: 'fibo', namespace: 'https://spec.edmcouncil.org/fibo/' }] },
    mode: 'validate',
    triples,
    distinctPairs: [[termKey(pair.a), termKey(pair.b)]],
    exceptions: [exceptionFor(triples.find((t) => t.id === flag.tripleId)!, flag)],
    nodePositions: { separate: { 'data#data|DOB': { x: 120, y: 40 } }, onNode: {} },
    valuesMode: 'onNode',
  };
}

describe('project file: save and open (PRJ-01–04)', () => {
  it('opens exactly the project that was saved', () => {
    const project = sampleProject();
    const r = readProjectFile(writeProjectFile(project, new Date('2026-10-20T14:05:00Z')));
    expect(r).toEqual({ project, savedAt: '2026-10-20T14:05:00.000Z' });
  });

  it('opened decisions still apply: the exception is accepted and the pair stays apart', () => {
    const r = readProjectFile(writeProjectFile(sampleProject()));
    if ('error' in r) throw new Error(r.error);
    const { triples, exceptions, distinctPairs } = r.project;
    const flags = checkConformance(triples, exceptions).flags;
    expect(flags.filter((f) => f.accepted)).toHaveLength(1);
    expect(findDuplicates(triples, distinctPairs)).toEqual([]);
  });

  it('holds both graphs’ Turtle as a readable copy', () => {
    const file = JSON.parse(writeProjectFile({ ...sampleProject(), triples: SAMPLE }));
    expect(file).toMatchObject({ format: 'triplet-project', version: 1 });
    expect(isomorphic(quads(file.turtle.data), quads(fixture('sample-data.ttl')))).toBe(true);
    expect(isomorphic(quads(file.turtle.ontology), quads(fixture('sample-ontology.ttl')))).toBe(true);
  });

  it('reads the stored triples, not the Turtle copy (PRJ-03)', () => {
    const file = JSON.parse(writeProjectFile({ ...sampleProject(), triples: SAMPLE }));
    file.turtle.data = '';
    const r = readProjectFile(JSON.stringify(file));
    expect('project' in r && r.project.triples).toEqual(SAMPLE);
  });

  it('a second export after opening matches the first', () => {
    const project = { ...sampleProject(), triples: SAMPLE };
    const r = readProjectFile(writeProjectFile(project));
    if ('error' in r) throw new Error(r.error);
    for (const g of ['data', 'ontology'] as const) {
      expect(exportGraph(r.project.triples, r.project.settings, g).turtle).toBe(exportGraph(SAMPLE, project.settings, g).turtle);
    }
  });

  it('names the file after the project', () => {
    expect(projectFileName('Individual Client')).toBe('individual-client.triplet.json');
  });
});

describe('project file: refused files (PRJ-04, PRJ-05)', () => {
  const good = () => JSON.parse(writeProjectFile(sampleProject()));
  const error = (text: string) => {
    const r = readProjectFile(text);
    return 'error' in r ? r.error : undefined;
  };
  it('refuses a Turtle file or other JSON', () => {
    expect(error(fixture('sample-data.ttl'))).toMatch(/isn't a Triplet project file/);
    expect(error('{"name": "x"}')).toMatch(/isn't a Triplet project file/);
  });
  it('refuses a file from a newer version', () => {
    expect(error(JSON.stringify({ ...good(), version: 2 }))).toMatch(/newer version/);
  });
  it('refuses damaged parts with a plain explanation', () => {
    const f = good();
    f.triples[0].s.ns = 'custom:missing';
    expect(error(JSON.stringify(f))).toBe("This project file is damaged: its triples can't be read.");
    const g = good();
    g.triples[1].id = g.triples[0].id;
    expect(error(JSON.stringify(g))).toMatch(/its triples/);
    const h = good();
    h.triples.find((t: { o: { kind: string } }) => t.o.kind === 'literal').o.datatype = 'gYear';
    expect(error(JSON.stringify(h))).toMatch(/its triples/);
    const i = good();
    i.settings.data.prefix = 'rdf';
    expect(error(JSON.stringify(i))).toMatch(/its settings/);
    const k = good();
    k.triples.find((t: { o: { datatype?: string } }) => t.o.datatype === 'date').o.value = '2026-13-01';
    expect(error(JSON.stringify(k))).toMatch(/its triples/);
    const l = good();
    l.triples[0].s.local = 'has space';
    expect(error(JSON.stringify(l))).toMatch(/its triples/);
    const m = good();
    m.settings.customPrefixes.push({ id: 'c2', prefix: 'fibo', namespace: 'https://other.org/' });
    expect(error(JSON.stringify(m))).toMatch(/custom prefixes/);
    const j = good();
    j.exceptions[0].kind = 'other';
    expect(error(JSON.stringify(j))).toMatch(/accepted exceptions/);
  });
  it('fills in optional parts that are missing', () => {
    const f = good();
    delete f.nodePositions;
    delete f.distinctPairs;
    delete f.valuesMode;
    const r = readProjectFile(JSON.stringify(f));
    expect('project' in r && r.project).toMatchObject({ distinctPairs: [], valuesMode: 'separate', nodePositions: { separate: {}, onNode: {} } });
  });
});
