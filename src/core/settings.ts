// Validation for the project setup screen (SCR-01, ID-01, ID-03).

import { activeCustomPrefixes, customNs } from './terms';
import type { CustomPrefix, ProjectSettings, Triple } from './types';
import { BUILTIN_PREFIXES } from './vocab';

export type SettingsField = 'name' | 'dataNamespace' | 'dataPrefix' | 'ontologyNamespace' | 'ontologyPrefix';
export type SettingsErrors = Partial<Record<SettingsField, string>>;

const ABSOLUTE_IRI = /^[A-Za-z][A-Za-z0-9+.-]*:[^\s<>"{}|\\^`]+$/;
const PREFIX = /^[A-Za-z][A-Za-z0-9_-]*$/;

function namespaceError(ns: string): string | undefined {
  if (!ns) return 'Enter a namespace.';
  if (!ABSOLUTE_IRI.test(ns)) return 'Use a full web address, e.g. https://example.org/data/';
  if (!ns.endsWith('/') && !ns.endsWith('#')) return 'End the namespace with / or #.';
  const builtin = BUILTIN_PREFIXES.find((b) => b.namespace === ns);
  if (builtin) return `This namespace is built in as ${builtin.prefix}:.`;
  return undefined;
}

function prefixError(prefix: string): string | undefined {
  if (!prefix) return 'Enter a prefix.';
  if (!PREFIX.test(prefix)) return 'Start with a letter; use only letters, digits, - and _.';
  if (BUILTIN_PREFIXES.some((b) => b.prefix === prefix)) return `"${prefix}" is a built-in vocabulary prefix.`;
  return undefined;
}

export function validateSettings(s: ProjectSettings): SettingsErrors {
  const errors: SettingsErrors = {};
  if (!s.name.trim()) errors.name = 'Enter a project name.';
  const dn = namespaceError(s.data.namespace);
  const on = namespaceError(s.ontology.namespace);
  if (dn) errors.dataNamespace = dn;
  if (on) errors.ontologyNamespace = on;
  if (!dn && !on && s.data.namespace === s.ontology.namespace) {
    errors.ontologyNamespace = 'The two graphs need different namespaces.';
  }
  const dp = prefixError(s.data.prefix);
  const op = prefixError(s.ontology.prefix);
  if (dp) errors.dataPrefix = dp;
  if (op) errors.ontologyPrefix = op;
  if (!dp && !op && s.data.prefix === s.ontology.prefix) {
    errors.ontologyPrefix = 'The two graphs need different prefixes.';
  }
  // PFX-04: a custom prefix can't share a name with a graph's prefix.
  const customs = activeCustomPrefixes(s);
  if (!errors.dataPrefix && customs.some((c) => c.prefix === s.data.prefix))
    errors.dataPrefix = `"${s.data.prefix}" is already one of your custom prefixes.`;
  if (!errors.ontologyPrefix && customs.some((c) => c.prefix === s.ontology.prefix))
    errors.ontologyPrefix = `"${s.ontology.prefix}" is already one of your custom prefixes.`;
  const taken = (ns: string) => customs.find((c) => c.namespace === ns);
  if (!errors.dataNamespace && taken(s.data.namespace))
    errors.dataNamespace = `This namespace already has the custom prefix ${taken(s.data.namespace)!.prefix}:.`;
  if (!errors.ontologyNamespace && taken(s.ontology.namespace))
    errors.ontologyNamespace = `This namespace already has the custom prefix ${taken(s.ontology.namespace)!.prefix}:.`;
  return errors;
}

export type CustomPrefixErrors = Partial<Record<'prefix' | 'namespace', string>>;

/**
 * PFX-04: checks a custom prefix against the graphs' own prefixes, the
 * built-in vocabularies and the other custom prefixes in `s` (the one with
 * `id` itself excluded). Namespaces must differ too, so every IRI has one
 * prefix.
 */
export function validateCustomPrefix(
  c: Pick<CustomPrefix, 'prefix' | 'namespace'>,
  s: ProjectSettings,
  id?: string,
): CustomPrefixErrors {
  const errors: CustomPrefixErrors = {};
  const others = activeCustomPrefixes(s).filter((x) => x.id !== id);
  const pe = prefixError(c.prefix);
  if (pe) errors.prefix = pe;
  else if (c.prefix === s.data.prefix || c.prefix === s.ontology.prefix)
    errors.prefix = `"${c.prefix}" is the prefix of one of your graphs.`;
  else if (others.some((x) => x.prefix === c.prefix)) errors.prefix = `"${c.prefix}" is already in the list.`;

  const ne = namespaceError(c.namespace);
  if (ne) errors.namespace = ne;
  else if (c.namespace === s.data.namespace || c.namespace === s.ontology.namespace)
    errors.namespace = 'This is the namespace of one of your graphs.';
  else {
    const dup = others.find((x) => x.namespace === c.namespace);
    if (dup) errors.namespace = `This namespace already has the prefix ${dup.prefix}:.`;
  }
  return errors;
}

/** PFX-04: how many triples use a custom prefix; one in use can't be removed. */
export function customPrefixUses(triples: readonly Triple[], id: string): number {
  const ns = customNs(id);
  return triples.filter((t) => t.s.ns === ns || t.p.ns === ns || (t.o.kind === 'iri' && t.o.ns === ns)).length;
}

// The setup screen asks for one shared base address and a short path name for
// each graph. Each graph's namespace is base + path + "/", and its prefix is
// the path name, so nothing has to be typed twice (ID-01, ID-03).

/** Longest project name accepted (field checks). */
export const MAX_PROJECT_NAME = 80;

export interface SetupDraft {
  name: string;
  base: string;
  dataPath: string;
  ontologyPath: string;
}

export type SetupField = keyof SetupDraft;
export type SetupErrors = Partial<Record<SetupField, string>>;

export const DEFAULT_SETUP: SetupDraft = {
  name: 'My Project',
  base: 'https://example.org/',
  dataPath: 'data',
  ontologyPath: 'ontology',
};

/** "example.com" → "https://example.com/". The graph name follows, so the base always ends in "/". */
export function normaliseBase(base: string): string {
  let b = base.trim();
  if (!b) return '';
  // Add https:// unless a scheme is given ("example.com:8080" has a port, not a scheme).
  if (!/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(b) && !/^urn:/i.test(b)) b = `https://${b}`;
  b = b.replace(/#+$/, '');
  if (!b.endsWith('/')) b += '/';
  return b;
}

export function settingsFromSetup(d: SetupDraft): ProjectSettings {
  const base = normaliseBase(d.base);
  const graph = (path: string) => ({ namespace: `${base}${path.trim()}/`, prefix: path.trim() });
  return { name: d.name.trim(), data: graph(d.dataPath), ontology: graph(d.ontologyPath) };
}

function pathError(path: string): string | undefined {
  if (!path) return 'Enter a name.';
  if (!PREFIX.test(path)) return 'Start with a letter; use only letters, digits, - and _.';
  if (BUILTIN_PREFIXES.some((b) => b.prefix === path)) return `"${path}" is already used by a built-in vocabulary.`;
  return undefined;
}

export function validateSetup(d: SetupDraft): SetupErrors {
  const errors: SetupErrors = {};
  if (!d.name.trim()) errors.name = 'Enter a project name.';
  else if (d.name.trim().length > MAX_PROJECT_NAME)
    errors.name = `Keep the name to ${MAX_PROJECT_NAME} characters or fewer.`;
  const base = normaliseBase(d.base);
  if (!base) errors.base = 'Enter a base address, e.g. https://example.org/';
  else if (/\s/.test(base)) errors.base = "The base address can't contain spaces.";
  else if (/[#?]/.test(base)) errors.base = "The base address can't contain # or ?.";
  else if (!ABSOLUTE_IRI.test(base)) errors.base = 'Use a web address, e.g. https://example.org/';
  const dp = pathError(d.dataPath.trim());
  const op = pathError(d.ontologyPath.trim());
  if (dp) errors.dataPath = dp;
  if (op) errors.ontologyPath = op;
  if (!dp && !op && d.dataPath.trim() === d.ontologyPath.trim()) {
    errors.ontologyPath = 'The two graphs need different names.';
  }
  return errors;
}

/**
 * Setup answers for a new project that reuses the current project's base
 * address and graph names (GEN-10), so they need not be typed again. Falls
 * back to the defaults when the namespaces don't share one base address.
 */
export function setupFromSettings(s: ProjectSettings): SetupDraft {
  const baseOf = (g: ProjectSettings['data']) => {
    const tail = `${g.prefix}/`;
    return g.namespace.endsWith(tail) ? g.namespace.slice(0, -tail.length) : undefined;
  };
  const base = baseOf(s.data);
  if (!base || base !== baseOf(s.ontology)) return DEFAULT_SETUP;
  return { name: DEFAULT_SETUP.name, base, dataPath: s.data.prefix, ontologyPath: s.ontology.prefix };
}

// SCR-09 (changed 16 Oct 2026 on review): Settings edits the graphs'
// namespaces the way the setup screen does, as one base address plus a name
// per graph that is also its prefix, so a namespace and its prefix can't
// disagree. Changes ID-01's "changed separately later in Settings".

export type GraphNames = Omit<SetupDraft, 'name'>;
export type GraphNamesErrors = Partial<Record<keyof GraphNames, string>>;

/**
 * The base address and graph names behind a project's namespaces. A namespace
 * that doesn't end in "<prefix>/" (only possible in older projects) falls back
 * to its own address minus the last part.
 */
export function graphNamesOf(s: ProjectSettings): GraphNames {
  const tail = `${s.data.prefix}/`;
  const base = s.data.namespace.endsWith(tail)
    ? s.data.namespace.slice(0, -tail.length)
    : s.data.namespace.replace(/[^/#]*[/#]?$/, '');
  return { base, dataPath: s.data.prefix, ontologyPath: s.ontology.prefix };
}

/** The project's settings with new graph namespaces; name and custom prefixes are kept. */
export function withGraphNames(s: ProjectSettings, names: GraphNames): ProjectSettings {
  const next = settingsFromSetup({ ...names, name: s.name });
  return { ...s, data: next.data, ontology: next.ontology };
}

/** Setup's checks for the base address and graph names, plus clashes with custom prefixes (PFX-04). */
export function validateGraphNames(names: GraphNames, s: ProjectSettings): GraphNamesErrors {
  const { name: _name, ...errors } = validateSetup({ ...names, name: s.name || 'x' });
  if (Object.keys(errors).length > 0) return errors;
  const e = validateSettings(withGraphNames(s, names));
  const out: GraphNamesErrors = {};
  if (e.dataPrefix || e.dataNamespace) out.dataPath = e.dataPrefix ?? e.dataNamespace;
  if (e.ontologyPrefix || e.ontologyNamespace) out.ontologyPath = e.ontologyPrefix ?? e.ontologyNamespace;
  return out;
}
