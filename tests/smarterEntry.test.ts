// Milestone 4: dropdown suggestions (ENT-03, ENT-04), prefix suggestions
// (PFX-02), custom prefixes (PFX-04), identifier safety (ID-05) and the
// clash rule (ID-08).

import { Parser } from 'n3';
import { describe, expect, it } from 'vitest';
import { resolveEntry, suffixClash } from '../src/core/entry';
import { exportGraph, validateTurtle } from '../src/core/export';
import { toLocalName } from '../src/core/localName';
import { customPrefixUses, graphNamesOf, validateCustomPrefix, validateGraphNames, validateSettings, withGraphNames } from '../src/core/settings';
import { suggest, type SuggestArgs } from '../src/core/suggest';
import { fullIri, parsePrefixed, prefixedName } from '../src/core/terms';
import type { ProjectSettings } from '../src/core/types';
import { RDF_TYPE } from '../src/core/vocab';
import { DATA_ENTRIES, ONTOLOGY_ENTRIES } from './fixtures/sampleEntries';
import { enter, SETTINGS } from './helpers';

const store = enter([...ONTOLOGY_ENTRIES, ...DATA_ENTRIES]);
const FIBO: ProjectSettings = {
  ...SETTINGS,
  customPrefixes: [{ id: 'p1', prefix: 'fibo-fnd', namespace: 'https://spec.edmcouncil.org/fibo/ontology/FND/' }],
};

const run = (a: Partial<SuggestArgs> & Pick<SuggestArgs, 'field' | 'text'>) =>
  suggest({ graph: 'data', triples: store, settings: SETTINGS, ...a });
const labels = (a: Parameters<typeof run>[0]) => run(a).options.map((o) => o.label);

describe('dropdown suggestions (ENT-03, ENT-04)', () => {
  it('Data tab subject lists existing entities with their class', () => {
    const r = run({ field: 'subject', text: 'Client' });
    const opt = r.options.find((o) => o.label === 'Client ID');
    expect(opt).toMatchObject({ kind: 'term', value: 'Client ID', hint: 'Logical data element' });
    expect(r.heading).toBe('Existing in Data graph');
    // Names that start with the text come before those that only contain it.
    expect(r.options[0].label.startsWith('Client')).toBe(true);
    expect(labels({ field: 'subject', text: 'Client' })).toContain('Individual Client');
  });

  it('offers "+ Add as new" last, only when the text names nothing listed', () => {
    const opts = run({ field: 'subject', text: 'Client' }).options;
    expect(opts.at(-1)).toMatchObject({ kind: 'new', value: 'Client' });
    expect(run({ field: 'subject', text: 'CUST_ID' }).options.some((o) => o.kind === 'new')).toBe(false);
    expect(run({ field: 'subject', text: '' }).options.some((o) => o.kind === 'new')).toBe(false);
  });

  it('treats names as case-sensitive, so "date of birth" can be added beside "Date of Birth"', () => {
    const opts = run({ field: 'subject', text: 'date of birth' }).options;
    expect(opts.map((o) => o.label)).toContain('Date of Birth');
    expect(opts.at(-1)?.kind).toBe('new');
  });

  it('Data tab predicates: those used and declared, plus type, label and definition', () => {
    const all = labels({ field: 'predicate', text: '' });
    expect(all).toEqual(expect.arrayContaining(['implements', 'belongs to', 'last refreshed', 'type', 'label', 'definition']));
    // Built-in names match in any case, as the entry form reads them.
    expect(run({ field: 'predicate', text: 'Type' }).options.some((o) => o.kind === 'new')).toBe(false);
    const impl = run({ field: 'predicate', text: 'impl' }).options[0];
    expect(impl).toMatchObject({ value: 'implements', hint: 'ontology:implements' });
  });

  it('lists ontology properties on the Data tab even before they are used there', () => {
    const onlyOntology = enter(ONTOLOGY_ENTRIES);
    const r = suggest({ field: 'predicate', graph: 'data', text: '', triples: onlyOntology, settings: SETTINGS });
    expect(r.options.map((o) => o.label)).toContain('has physical data element');
    expect(r.options.map((o) => o.label)).not.toContain('Dataset');
  });

  it('after "type", the Data tab object lists the ontology classes', () => {
    const r = run({ field: 'object', text: '', predicate: RDF_TYPE });
    expect(r.heading).toBe('Classes in your Ontology graph');
    expect(r.options.map((o) => o.label)).toContain('Physical data element');
    expect(r.options.map((o) => o.label)).not.toContain('CUST_ID');
  });

  it('Ontology tab lists classes and properties, marked as which, and ontology predicates', () => {
    const subj = run({ graph: 'ontology', field: 'subject', text: '' }).options;
    expect(subj.find((o) => o.label === 'System')?.hint).toBe('Class');
    expect(subj.find((o) => o.label === 'implements')?.hint).toBe('Property');
    const preds = labels({ graph: 'ontology', field: 'predicate', text: '' });
    expect(preds.slice(0, 6)).toEqual(['subclass of', 'domain', 'range', 'type', 'label', 'definition']);
  });

  it('every suggested value resolves back to the term it names', () => {
    for (const graph of ['data', 'ontology'] as const) {
      for (const o of run({ graph, field: 'subject', text: '' }).options) {
        const r = resolveEntry({ graph, subject: o.value, predicate: 'label', objectKind: 'value', object: 'x', datatype: 'string' }, store, SETTINGS);
        expect(r.preview.subject && `${r.preview.subject.ns}|${r.preview.subject.local}`).toBe(o.id);
      }
    }
  });
});

describe('prefix suggestions (PFX-01, PFX-02)', () => {
  it('typing a prefix lists its vocabulary’s common terms', () => {
    const r = run({ field: 'predicate', text: 'foaf:' });
    expect(r.heading).toBe('foaf: People, organisations, relationships');
    expect(r.options.map((o) => o.value)).toEqual(expect.arrayContaining(['foaf:name', 'foaf:knows', 'foaf:Person']));
    expect(r.options.some((o) => o.kind === 'new')).toBe(false);
  });

  it('filters the terms by what follows the colon', () => {
    const values = run({ field: 'predicate', text: 'skos:pref' }).options.map((o) => o.value);
    expect(values[0]).toBe('skos:prefLabel');
    expect(values).not.toContain('skos:broader');
  });

  it('a partly typed prefix offers the prefix itself', () => {
    const opts = run({ field: 'predicate', text: 'sko' }).options;
    expect(opts.find((o) => o.kind === 'prefix')).toMatchObject({ value: 'skos:' });
    expect(opts.at(-1)?.kind).toBe('new');
  });

  it('own prefixes list the graph’s existing terms', () => {
    const values = run({ field: 'subject', text: 'data:CUST' }).options.map((o) => o.value);
    expect(values).toContain('data:CUST_ID');
  });

  it('custom prefixes give no term suggestions (PFX-04)', () => {
    const r = suggest({ field: 'predicate', graph: 'data', text: 'fibo-fnd:', triples: store, settings: FIBO });
    expect(r.options).toEqual([]);
  });
});

describe('custom prefixes (PFX-04, ID-04)', () => {
  it('typed with a custom prefix, a term keeps the prefix by id and exports with its namespace', () => {
    const r = resolveEntry(
      { graph: 'data', subject: 'CUST_ID', predicate: 'fibo-fnd:hasIdentifier', objectKind: 'value', object: 'x', datatype: 'string' },
      store,
      FIBO,
    );
    expect(r.errors).toEqual({});
    const p = r.triples[0].p;
    expect(p.ns).toBe('custom:p1');
    expect(fullIri(p, FIBO)).toBe('https://spec.edmcouncil.org/fibo/ontology/FND/hasIdentifier');
    const withIt = [...store, { ...r.triples[0], id: 'x' }];
    const out = exportGraph(withIt, FIBO, 'data');
    expect(out.valid).toBe(true);
    expect(out.prefixes).toContain('fibo-fnd');
    expect(out.turtle).toContain('fibo-fnd:hasIdentifier');
    expect(customPrefixUses(withIt, 'p1')).toBe(1);

    // Changing the prefix and namespace updates the IRI on export (ID-04).
    const moved: ProjectSettings = { ...FIBO, customPrefixes: [{ id: 'p1', prefix: 'fnd', namespace: 'https://example.com/fnd/' }] };
    expect(prefixedName(p, moved)).toBe('fnd:hasIdentifier');
    expect(exportGraph(withIt, moved, 'data').turtle).toContain('@prefix fnd: <https://example.com/fnd/>');

    // Removed (e.g. then brought back by Undo): no longer typed or declared, but still exported in full.
    const removed: ProjectSettings = { ...FIBO, customPrefixes: [{ ...FIBO.customPrefixes![0], removed: true }] };
    expect(parsePrefixed('fibo-fnd:x', removed)).toBeUndefined();
    const out2 = exportGraph(withIt, removed, 'data');
    expect(out2.valid).toBe(true);
    expect(out2.turtle).toContain('<https://spec.edmcouncil.org/fibo/ontology/FND/hasIdentifier>');
  });

  it('checks a custom prefix and its namespace', () => {
    const ok = { prefix: 'fibo-be', namespace: 'https://spec.edmcouncil.org/fibo/ontology/BE/' };
    expect(validateCustomPrefix(ok, FIBO)).toEqual({});
    expect(validateCustomPrefix({ ...ok, prefix: 'skos' }, FIBO).prefix).toMatch(/built-in/);
    expect(validateCustomPrefix({ ...ok, prefix: 'data' }, FIBO).prefix).toMatch(/your graphs/);
    expect(validateCustomPrefix({ ...ok, prefix: 'fibo-fnd' }, FIBO).prefix).toMatch(/already/);
    expect(validateCustomPrefix({ ...ok, prefix: 'fibo-fnd' }, FIBO, 'p1')).toEqual({});
    expect(validateCustomPrefix({ ...ok, prefix: '1x' }, FIBO).prefix).toBeDefined();
    expect(validateCustomPrefix({ ...ok, namespace: 'not a web address' }, FIBO).namespace).toBeDefined();
    expect(validateCustomPrefix({ ...ok, namespace: 'https://example.org/data/' }, FIBO).namespace).toMatch(/your graphs/);
    expect(validateCustomPrefix({ ...ok, namespace: 'http://xmlns.com/foaf/0.1/' }, FIBO).namespace).toMatch(/foaf:/);
    expect(validateCustomPrefix({ ...ok, namespace: FIBO.customPrefixes![0].namespace }, FIBO).namespace).toMatch(/fibo-fnd:/);
  });

  it('a graph prefix can’t take a custom prefix’s name', () => {
    const s: ProjectSettings = { ...FIBO, data: { ...FIBO.data, prefix: 'fibo-fnd' } };
    expect(validateSettings(s).dataPrefix).toMatch(/custom/);
    const foaf: ProjectSettings = { ...SETTINGS, data: { ...SETTINGS.data, namespace: 'http://xmlns.com/foaf/0.1/' } };
    expect(validateSettings(foaf).dataNamespace).toMatch(/foaf:/);
  });
});

describe('identifier safety (ID-05) and the clash rule (ID-08)', () => {
  it('turns any typed name into an IRI-safe local name', () => {
    expect(toLocalName('Q1 Revenue (EUR)', 'entity')).toBe('Q1RevenueEUR');
    expect(toLocalName('Q1 Revenue (EUR) / net', 'entity')).toBe('Q1RevenueEURNet');
  });

  it('composes accents the same way, however they were typed', () => {
    expect(toLocalName('Café au lait', 'entity')).toBe(toLocalName('Café au lait', 'entity'));
  });

  it('exports names with underscores, digits, spaces, symbols and accents as valid IRIs', () => {
    const names = ['CUST_ID', 'Individual Client 360', 'Q1 Revenue (EUR)', 'Café 360°', 'a/b#c?d', '3rd Party', 'x"y<z>'];
    const triples = enter(names.map((n) => ({ graph: 'data' as const, subject: n, predicate: 'label', value: n })));
    const out = exportGraph(triples, SETTINGS, 'data');
    expect(out.valid).toBe(true);
    const iris = new Parser().parse(out.turtle).map((q) => q.subject.value);
    for (const iri of iris) {
      expect(iri.startsWith('https://example.org/data/')).toBe(true);
      expect(iri.slice('https://example.org/data/'.length)).toMatch(/^[\p{L}\p{M}\p{N}_]+$/u);
    }
    expect(validateTurtle(out.turtle).valid).toBe(true);
  });

  it('a name with no letters or digits is refused', () => {
    const r = resolveEntry({ graph: 'data', subject: '🎉 !!', predicate: 'label', objectKind: 'value', object: 'x', datatype: 'string' }, [], SETTINGS);
    expect(r.errors.subject).toBeDefined();
  });

  it('says which existing term made a new name get a suffix', () => {
    const r = resolveEntry(
      { graph: 'data', subject: 'date of birth', predicate: 'label', objectKind: 'value', object: 'x', datatype: 'string' },
      store,
      SETTINGS,
    );
    const s = r.preview.subject!;
    expect(s.local).toBe('DateOfBirth_2');
    expect(suffixClash(s, store)?.label).toBe('Date of Birth');
    // A name that is itself typed with _2 isn't a clash.
    const own = resolveEntry({ graph: 'data', subject: 'CUST_2', predicate: 'label', objectKind: 'value', object: 'x', datatype: 'string' }, store, SETTINGS);
    expect(suffixClash(own.preview.subject!, store)).toBeUndefined();
    // Neither is an existing term.
    expect(suffixClash(store[0].s, store)).toBeUndefined();
  });
});

describe('Settings uses base address and graph names (SCR-09, ID-01)', () => {
  it('reads the base address and names back from the namespaces', () => {
    expect(graphNamesOf(SETTINGS)).toEqual({ base: 'https://example.org/', dataPath: 'data', ontologyPath: 'ontology' });
  });

  it('rebuilds both namespaces and prefixes together, keeping custom prefixes', () => {
    const next = withGraphNames(FIBO, { base: 'example.com', dataPath: 'inst', ontologyPath: 'onto' });
    expect(next.data).toEqual({ namespace: 'https://example.com/inst/', prefix: 'inst' });
    expect(next.ontology).toEqual({ namespace: 'https://example.com/onto/', prefix: 'onto' });
    expect(next.customPrefixes).toBe(FIBO.customPrefixes);
    expect(next.name).toBe(FIBO.name);
  });

  it('checks names as the setup screen does, and against custom prefixes', () => {
    expect(validateGraphNames({ base: 'https://example.org/', dataPath: 'x', ontologyPath: 'x' }, FIBO).ontologyPath).toBeDefined();
    expect(validateGraphNames({ base: 'https://a b/', dataPath: 'data', ontologyPath: 'ontology' }, FIBO).base).toBeDefined();
    expect(validateGraphNames({ base: 'https://example.org/', dataPath: 'fibo-fnd', ontologyPath: 'ontology' }, FIBO).dataPath).toMatch(/custom/);
    expect(validateGraphNames({ base: 'https://example.org/', dataPath: 'data', ontologyPath: 'ontology' }, FIBO)).toEqual({});
  });
});
