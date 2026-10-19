// Field checks agreed in the M2 review (16 Oct 2026): every free-text field is checked.
import { describe, expect, it } from 'vitest';
import { literalPreview, MAX_NAME_LENGTH, resolveEntry, validateLiteral, type EntryDraft } from '../src/core/entry';
import { DEFAULT_SETUP, MAX_PROJECT_NAME, validateSetup } from '../src/core/settings';
import { prefixedName } from '../src/core/terms';
import { SETTINGS } from './helpers';

const draft = (d: Partial<EntryDraft>): EntryDraft => ({
  graph: 'data',
  subject: 'CRM',
  predicate: 'has dataset',
  objectKind: 'entity',
  object: 'Client Master',
  datatype: 'string',
  ...d,
});

describe('setup field checks', () => {
  const setup = (d: Partial<typeof DEFAULT_SETUP>) => validateSetup({ ...DEFAULT_SETUP, ...d });

  it('refuses spaces in the base address', () => {
    expect(setup({ base: 'https://bank example.org/' }).base).toBe("The base address can't contain spaces.");
    expect(setup({ base: 'https://example.org/my kg/' }).base).toBe("The base address can't contain spaces.");
    expect(setup({ base: '  https://example.org/  ' }).base).toBeUndefined();
  });

  it('refuses # and ? inside the base address', () => {
    expect(setup({ base: 'https://example.org/a?b/' }).base).toBeTruthy();
    expect(setup({ base: 'https://example.org/a#b/' }).base).toBeTruthy();
  });

  it('limits the project name length', () => {
    expect(setup({ name: 'x'.repeat(MAX_PROJECT_NAME) }).name).toBeUndefined();
    expect(setup({ name: 'x'.repeat(MAX_PROJECT_NAME + 1) }).name).toBeTruthy();
  });
});

describe('entry field checks', () => {
  it('limits the length of names', () => {
    expect(resolveEntry(draft({ subject: 'a'.repeat(MAX_NAME_LENGTH) }), [], SETTINGS).errors).toEqual({});
    expect(resolveEntry(draft({ subject: 'a'.repeat(MAX_NAME_LENGTH + 1) }), [], SETTINGS).errors.subject).toBeTruthy();
    expect(resolveEntry(draft({ object: 'a'.repeat(MAX_NAME_LENGTH + 1) }), [], SETTINGS).errors.object).toBeTruthy();
  });

  it('refuses a name that is only punctuation', () => {
    expect(resolveEntry(draft({ predicate: '!!!' }), [], SETTINGS).errors.predicate).toBeTruthy();
  });

  it('refuses an unknown prefix instead of making a name from it', () => {
    const r = resolveEntry(draft({ predicate: 'foo:bar' }), [], SETTINGS);
    expect(r.errors.predicate).toMatch(/"foo:" isn't a known prefix/);
    expect(resolveEntry(draft({ predicate: 'skos:prefLabel' }), [], SETTINGS).errors).toEqual({});
    // A name that merely contains a colon is still a name.
    expect(resolveEntry(draft({ subject: 'Q1:Revenue' }), [], SETTINGS).errors).toEqual({});
  });

  it('previews the object IRI (ENT-06)', () => {
    const r = resolveEntry(draft({}), [], SETTINGS);
    expect(r.preview.object && prefixedName(r.preview.object, SETTINGS)).toBe('data:ClientMaster');
  });

  it('previews a literal as it will be exported', () => {
    const r = resolveEntry(draft({ objectKind: 'value', object: '2026-10-14', datatype: 'date' }), [], SETTINGS);
    expect(r.preview.literal && literalPreview(r.preview.literal)).toBe('"2026-10-14"^^xsd:date');
    expect(literalPreview({ kind: 'literal', value: 'VARCHAR(20)', datatype: 'string' })).toBe('"VARCHAR(20)"');
  });
});

describe('literal checks', () => {
  it('asks for true or false', () => {
    expect(validateLiteral('', 'boolean')).toEqual({ error: 'Choose true or false.' });
    expect(validateLiteral('TRUE', 'boolean')).toEqual({ value: 'true' });
  });

  it('hints at a dot when a decimal uses a comma', () => {
    expect(validateLiteral('3,14', 'decimal')).toEqual({ error: 'Use a dot for decimals, e.g. 3.14.' });
  });

  it('accepts the date-time picker value without seconds', () => {
    expect(validateLiteral('2026-10-14T09:30', 'dateTime')).toEqual({ value: '2026-10-14T09:30:00' });
    expect(validateLiteral('2026-10-14T09:30:15', 'dateTime')).toEqual({ value: '2026-10-14T09:30:15' });
  });
});
