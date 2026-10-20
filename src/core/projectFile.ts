// Milestone 8: the Triplet project file (PRJ-01–06, agreed 20 Oct 2026). One
// JSON file holding the project exactly as stored (settings, mode, triples and
// the decisions made), plus both graphs' Turtle as a readable copy. Opening a
// file reads the stored data, never the Turtle copy (PRJ-03), so the project
// comes back exactly as saved. Undo history isn't saved (EDIT-06).

import { CHECK_KINDS, type AcceptedException, type CheckKind } from './conformance';
import type { DistinctPair } from './duplicates';
import { validateLiteral } from './entry';
import { exportGraph, fileSlug } from './export';
import type { Point } from './graphLayout';
import type { ValuesMode } from './graphModel';
import { validateCustomPrefix, validateSettings } from './settings';
import { DATATYPES, type CustomPrefix, type Datatype, type IriTerm, type ObjectTerm, type ProjectSettings, type Triple } from './types';
import { BUILTIN_PREFIXES } from './vocab';

export const PROJECT_FORMAT = 'triplet-project';
/** Bump when the stored shape changes, and teach readProjectFile to migrate older files. */
export const PROJECT_VERSION = 1;

/** What a project file restores. */
export interface ProjectContent {
  settings: ProjectSettings;
  mode: 'sketch' | 'validate';
  triples: Triple[];
  distinctPairs: DistinctPair[];
  exceptions: AcceptedException[];
  nodePositions: Record<ValuesMode, Record<string, Point>>;
  valuesMode: ValuesMode;
}

/** PRJ-02: the file as written. */
export interface ProjectFile extends ProjectContent {
  format: typeof PROJECT_FORMAT;
  version: number;
  savedAt: string;
  /** A readable copy for use elsewhere; not read back on open (PRJ-03). */
  turtle: { data: string; ontology: string };
}

/** PRJ-01: e.g. "individual-client.triplet.json". */
export function projectFileName(projectName: string): string {
  return `${fileSlug(projectName)}.triplet.json`;
}

/** `turtle` saves exporting again when the caller already has both graphs' Turtle. */
export function writeProjectFile(
  content: ProjectContent,
  now = new Date(),
  turtle?: ProjectFile['turtle'],
): string {
  const file: ProjectFile = {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    savedAt: now.toISOString(),
    settings: content.settings,
    mode: content.mode,
    triples: content.triples,
    distinctPairs: content.distinctPairs,
    exceptions: content.exceptions,
    nodePositions: content.nodePositions,
    valuesMode: content.valuesMode,
    turtle: turtle ?? {
      data: exportGraph(content.triples, content.settings, 'data').turtle,
      ontology: exportGraph(content.triples, content.settings, 'ontology').turtle,
    },
  };
  return `${JSON.stringify(file, null, 2)}\n`;
}

export type ReadResult = { project: ProjectContent; savedAt?: string } | { error: string };

const NOT_A_PROJECT = "This isn't a Triplet project file. Choose a .triplet.json file downloaded from Triplet's Export screen.";

const LOCAL_OK = /^[^\s<>"{}|\\^`]+$/;

/** Thrown inside readProjectFile when a part of the file doesn't have the expected shape. */
class Damaged extends Error {}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
function str(v: unknown, what: string): string {
  if (typeof v !== 'string') throw new Damaged(what);
  return v;
}
function arr(v: unknown, what: string): unknown[] {
  if (!Array.isArray(v)) throw new Damaged(what);
  return v;
}

function readSettings(v: unknown): ProjectSettings {
  if (!isObject(v) || !isObject(v.data) || !isObject(v.ontology)) throw new Damaged('its settings');
  const graph = (g: Record<string, unknown>) => ({
    namespace: str(g.namespace, 'its settings'),
    prefix: str(g.prefix, 'its settings'),
  });
  const customPrefixes: CustomPrefix[] = arr(v.customPrefixes ?? [], 'its custom prefixes').map((c) => {
    if (!isObject(c)) throw new Damaged('its custom prefixes');
    const out: CustomPrefix = {
      id: str(c.id, 'its custom prefixes'),
      prefix: str(c.prefix, 'its custom prefixes'),
      namespace: str(c.namespace, 'its custom prefixes'),
    };
    if (c.removed === true) out.removed = true;
    return out;
  });
  const settings = { name: str(v.name, 'its settings'), data: graph(v.data), ontology: graph(v.ontology), customPrefixes };
  if (Object.keys(validateSettings(settings)).length > 0) throw new Damaged('its settings');
  // PFX-04: each custom prefix has its own id, and the ones in use their own prefix and namespace.
  if (new Set(customPrefixes.map((c) => c.id)).size !== customPrefixes.length) throw new Damaged('its custom prefixes');
  for (const c of customPrefixes) {
    if (!c.removed && Object.keys(validateCustomPrefix(c, settings, c.id)).length > 0)
      throw new Damaged('its custom prefixes');
  }
  return settings;
}

function readTriples(v: unknown, settings: ProjectSettings): Triple[] {
  const builtin = new Set(BUILTIN_PREFIXES.map((b) => `vocab:${b.prefix}`));
  const custom = new Set((settings.customPrefixes ?? []).map((c) => `custom:${c.id}`));
  const iri = (t: unknown): IriTerm => {
    if (!isObject(t) || t.kind !== 'iri') throw new Damaged('its triples');
    const ns = str(t.ns, 'its triples');
    if (ns !== 'data' && ns !== 'ontology' && !builtin.has(ns) && !custom.has(ns)) throw new Damaged('its triples');
    const local = str(t.local, 'its triples');
    // Anything Turtle can't write in an IRI would make the export invalid.
    if (!LOCAL_OK.test(local)) throw new Damaged('its triples');
    return { kind: 'iri', ns: ns as IriTerm['ns'], local, label: str(t.label, 'its triples') };
  };
  const object = (t: unknown): ObjectTerm => {
    if (isObject(t) && t.kind === 'literal') {
      if (!(DATATYPES as readonly unknown[]).includes(t.datatype)) throw new Damaged('its triples');
      const value = str(t.value, 'its triples');
      const datatype = t.datatype as Datatype;
      // LIT-02: a value must fit its datatype, as on entry (text may be anything, even empty).
      if (datatype !== 'string') {
        const ok = validateLiteral(value, datatype);
        if (!('value' in ok) || ok.value !== value) throw new Damaged('its triples');
      }
      return { kind: 'literal', value, datatype };
    }
    return iri(t);
  };
  const ids = new Set<string>();
  return arr(v, 'its triples').map((t) => {
    if (!isObject(t) || (t.graph !== 'data' && t.graph !== 'ontology')) throw new Damaged('its triples');
    const id = str(t.id, 'its triples');
    if (ids.has(id)) throw new Damaged('its triples');
    ids.add(id);
    return { id, graph: t.graph, s: iri(t.s), p: iri(t.p), o: object(t.o) };
  });
}

function readPositions(v: unknown): ProjectContent['nodePositions'] {
  const out: ProjectContent['nodePositions'] = { separate: {}, onNode: {} };
  if (v === undefined) return out;
  if (!isObject(v)) throw new Damaged('its card positions');
  for (const mode of ['separate', 'onNode'] as const) {
    const m = v[mode] ?? {};
    if (!isObject(m)) throw new Damaged('its card positions');
    for (const [k, p] of Object.entries(m)) {
      if (!isObject(p) || typeof p.x !== 'number' || typeof p.y !== 'number') throw new Damaged('its card positions');
      out[mode][k] = { x: p.x, y: p.y };
    }
  }
  return out;
}

/**
 * PRJ-03, PRJ-04: reads a project file. Refuses, with a plain explanation, a
 * file that isn't one, comes from a newer version, or is damaged.
 */
export function readProjectFile(text: string): ReadResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { error: NOT_A_PROJECT };
  }
  if (!isObject(json) || json.format !== PROJECT_FORMAT) return { error: NOT_A_PROJECT };
  const version = json.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1)
    return { error: 'This project file is damaged: its version number is missing.' };
  if (version > PROJECT_VERSION)
    return { error: 'This project file was saved by a newer version of Triplet. Open it in the latest Triplet.' };
  try {
    const settings = readSettings(json.settings);
    const triples = readTriples(json.triples, settings);
    const distinctPairs = arr(json.distinctPairs ?? [], 'its pairs kept apart').map((p) => {
      const pair = arr(p, 'its pairs kept apart');
      if (pair.length !== 2) throw new Damaged('its pairs kept apart');
      return [str(pair[0], 'its pairs kept apart'), str(pair[1], 'its pairs kept apart')] as DistinctPair;
    });
    const exceptions = arr(json.exceptions ?? [], 'its accepted exceptions').map((e): AcceptedException => {
      if (!isObject(e) || !CHECK_KINDS.includes(e.kind as CheckKind)) throw new Damaged('its accepted exceptions');
      const w = 'its accepted exceptions';
      return { s: str(e.s, w), p: str(e.p, w), o: str(e.o, w), kind: e.kind as CheckKind, rule: str(e.rule, w) };
    });
    const mode = json.mode === 'validate' ? 'validate' : 'sketch';
    const valuesMode = json.valuesMode === 'onNode' ? 'onNode' : 'separate';
    const savedAt = typeof json.savedAt === 'string' ? json.savedAt : undefined;
    return {
      project: { settings, mode, triples, distinctPairs, exceptions, nodePositions: readPositions(json.nodePositions), valuesMode },
      savedAt,
    };
  } catch (e) {
    if (e instanceof Damaged) return { error: `This project file is damaged: ${e.message} can't be read.` };
    throw e;
  }
}
