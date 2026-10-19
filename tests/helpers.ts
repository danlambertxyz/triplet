import { resolveEntry, type EntryDraft } from '../src/core/entry';
import { termKey } from '../src/core/terms';
import { pickerClasses } from '../src/core/typing';
import { DEFAULT_SETTINGS, type ProjectSettings, type Triple } from '../src/core/types';
import type { SampleEntry } from './fixtures/sampleEntries';

export const SETTINGS: ProjectSettings = { ...DEFAULT_SETTINGS, name: 'Individual Client' };

export function draftFor(e: SampleEntry, store: readonly Triple[]): EntryDraft {
  const cls = e.cls ? pickerClasses(store).find((c) => c.label === e.cls) : undefined;
  if (e.cls && !cls) throw new Error(`Class "${e.cls}" is not in the picker`);
  return {
    graph: e.graph,
    subject: e.subject,
    classKey: cls ? termKey(cls) : undefined,
    predicate: e.predicate ?? '',
    objectKind: e.value !== undefined ? 'value' : 'entity',
    object: e.value ?? e.object ?? '',
    datatype: e.datatype ?? 'string',
  };
}

/** Enters each item through the same path as the entry form; fails on any error. */
export function enter(entries: SampleEntry[], store: Triple[] = [], settings = SETTINGS): Triple[] {
  const out = [...store];
  for (const e of entries) {
    const r = resolveEntry(draftFor(e, out), out, settings);
    if (Object.keys(r.errors).length) {
      throw new Error(`Entry ${JSON.stringify(e)} failed: ${JSON.stringify(r.errors)}`);
    }
    for (const t of r.triples) out.push({ ...t, id: String(out.length + 1) });
  }
  return out;
}
