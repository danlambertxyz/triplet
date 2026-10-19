import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETUP, settingsFromSetup, setupFromSettings } from '../src/core/settings';
import { useApp } from '../src/ui/store';
import { DATA_ENTRIES, ONTOLOGY_ENTRIES } from './fixtures/sampleEntries';
import { enter, SETTINGS } from './helpers';

describe('setup answers for a new project (GEN-10)', () => {
  it('keeps the base address and graph names, and resets the name', () => {
    const settings = settingsFromSetup({
      name: 'Individual Client',
      base: 'https://bank.example/kg/',
      dataPath: 'inst',
      ontologyPath: 'dg',
    });
    expect(setupFromSettings(settings)).toEqual({
      name: 'My Project',
      base: 'https://bank.example/kg/',
      dataPath: 'inst',
      ontologyPath: 'dg',
    });
  });

  it('round-trips the default settings', () => {
    expect(setupFromSettings(SETTINGS)).toEqual(DEFAULT_SETUP);
  });

  it('falls back to the defaults when the two graphs have different base addresses', () => {
    const odd = { ...SETTINGS, ontology: { namespace: 'https://other.example/onto#', prefix: 'onto' } };
    expect(setupFromSettings(odd)).toEqual(DEFAULT_SETUP);
  });
});

describe('resetProject (GEN-10)', () => {
  beforeEach(() => useApp.getState().createProject(SETTINGS));

  it('clears every triple and the graph settings, and returns to setup', () => {
    const store = enter([...ONTOLOGY_ENTRIES, ...DATA_ENTRIES]);
    useApp.getState().addTriples(store);
    useApp.setState({ view: 'both', valuesMode: 'onNode', panelCollapsed: true, screen: 'export' });
    useApp.getState().setNodePositions('separate', { a: { x: 1, y: 2 } });

    useApp.getState().resetProject();

    const s = useApp.getState();
    expect(s.settings).toBeNull();
    expect(s.triples).toEqual([]);
    expect(s.lastAdded).toEqual([]);
    expect(s.nodePositions).toEqual({ separate: {}, onNode: {} });
    expect(s).toMatchObject({
      view: 'data',
      target: 'data',
      screen: 'main',
      valuesMode: 'separate',
      panelCollapsed: false,
    });
    expect(s.setupDraft).toEqual(DEFAULT_SETUP);
  });

  it('forgets the carried-over answers once the new project is created', () => {
    useApp.getState().resetProject();
    useApp.getState().createProject(SETTINGS);
    expect(useApp.getState().setupDraft).toBeNull();
  });
});
