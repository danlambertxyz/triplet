import { describe, expect, it } from 'vitest';
import { DEFAULT_SETUP, normaliseBase, settingsFromSetup, validateSettings, validateSetup } from '../src/core/settings';
import { DEFAULT_SETTINGS } from '../src/core/types';

describe('validateSettings', () => {
  it('accepts the defaults (ID-03)', () => {
    expect(validateSettings(DEFAULT_SETTINGS)).toEqual({});
  });

  it('rejects bad namespaces and prefixes', () => {
    const e = validateSettings({
      name: ' ',
      data: { namespace: 'example.org/data', prefix: '1data' },
      ontology: { namespace: 'https://example.org/ontology', prefix: 'rdfs' },
    });
    expect(Object.keys(e).sort()).toEqual(['dataNamespace', 'dataPrefix', 'name', 'ontologyNamespace', 'ontologyPrefix']);
  });

  it('requires the two graphs to differ', () => {
    const e = validateSettings({
      name: 'x',
      data: { namespace: 'https://ex.org/', prefix: 'ex' },
      ontology: { namespace: 'https://ex.org/', prefix: 'ex' },
    });
    expect(e.ontologyNamespace).toBeTruthy();
    expect(e.ontologyPrefix).toBeTruthy();
  });

  it('accepts a # namespace and the sample prefix dg', () => {
    expect(
      validateSettings({ ...DEFAULT_SETTINGS, ontology: { namespace: 'https://example.org/onto#', prefix: 'dg' } }),
    ).toEqual({});
  });
});

describe('setup: shared base address plus a name per graph', () => {
  it('builds the default namespaces and prefixes (ID-03)', () => {
    expect(settingsFromSetup(DEFAULT_SETUP)).toEqual({ ...DEFAULT_SETTINGS, name: 'My Project' });
    expect(validateSetup(DEFAULT_SETUP)).toEqual({});
  });

  it('accepts a bare domain and adds https:// and the slash', () => {
    const s = settingsFromSetup({ ...DEFAULT_SETUP, base: 'example.com' });
    expect(s.data).toEqual({ namespace: 'https://example.com/data/', prefix: 'data' });
    expect(s.ontology.namespace).toBe('https://example.com/ontology/');
    expect(normaliseBase('localhost:8080/kg')).toBe('https://localhost:8080/kg/');
    expect(normaliseBase('http://example.com')).toBe('http://example.com/');
  });

  it('rejects clashing or invalid names', () => {
    expect(validateSetup({ ...DEFAULT_SETUP, ontologyPath: 'data' }).ontologyPath).toBeTruthy();
    expect(validateSetup({ ...DEFAULT_SETUP, dataPath: 'rdfs' }).dataPath).toBeTruthy();
    expect(validateSetup({ ...DEFAULT_SETUP, dataPath: 'my data' }).dataPath).toBeTruthy();
    expect(validateSetup({ ...DEFAULT_SETUP, base: '  ' }).base).toBeTruthy();
    expect(validateSetup({ ...DEFAULT_SETUP, base: 'https://exa mple.org' }).base).toBeTruthy();
  });

  it('builds settings that pass the full settings check', () => {
    const s = settingsFromSetup({ ...DEFAULT_SETUP, base: 'https://bank.example/kg#' });
    expect(s.data.namespace).toBe('https://bank.example/kg/data/');
    expect(validateSettings(s)).toEqual({});
  });
});
