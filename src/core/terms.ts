// Helpers for naming, looking up and displaying terms.

import type { CustomPrefix, IriTerm, NsKey, ObjectTerm, ProjectSettings, Triple } from './types';
import { BUILTIN_PREFIXES, builtinNamespace, vocabNs } from './vocab';

/** Stable identity of an IRI term, independent of namespace settings (ID-04). */
export function termKey(t: Pick<IriTerm, 'ns' | 'local'>): string {
  return `${t.ns}|${t.local}`;
}

export function sameTerm(a: ObjectTerm, b: ObjectTerm): boolean {
  if (a.kind === 'iri' && b.kind === 'iri') return a.ns === b.ns && a.local === b.local;
  if (a.kind === 'literal' && b.kind === 'literal') return a.value === b.value && a.datatype === b.datatype;
  return false;
}

/** Key of an object: its termKey, or its value and datatype for a literal. */
export function objectKey(o: ObjectTerm): string {
  return o.kind === 'iri' ? termKey(o) : `"${o.value}"^^${o.datatype}`;
}

export function sameTriple(a: Omit<Triple, 'id'>, b: Omit<Triple, 'id'>): boolean {
  return a.graph === b.graph && sameTerm(a.s, b.s) && sameTerm(a.p, b.p) && sameTerm(a.o, b.o);
}

export function isOwnNs(ns: NsKey): ns is 'data' | 'ontology' {
  return ns === 'data' || ns === 'ontology';
}

export function vocabPrefixOf(ns: NsKey): string | undefined {
  return ns.startsWith('vocab:') ? ns.slice('vocab:'.length) : undefined;
}

export function customNs(id: string): NsKey {
  return `custom:${id}`;
}

/** PFX-04: the user's custom prefixes still in use (not removed). */
export function activeCustomPrefixes(settings: ProjectSettings): CustomPrefix[] {
  return (settings.customPrefixes ?? []).filter((c) => !c.removed);
}

function customOf(ns: NsKey, settings: ProjectSettings): CustomPrefix | undefined {
  if (!ns.startsWith('custom:')) return undefined;
  const id = ns.slice('custom:'.length);
  return settings.customPrefixes?.find((c) => c.id === id);
}

export function namespaceOf(ns: NsKey, settings: ProjectSettings): string {
  if (ns === 'data') return settings.data.namespace;
  if (ns === 'ontology') return settings.ontology.namespace;
  const ns2 = customOf(ns, settings)?.namespace ?? builtinNamespace(vocabPrefixOf(ns) ?? '');
  if (!ns2) throw new Error(`Unknown namespace ${ns}`);
  return ns2;
}

export function prefixOf(ns: NsKey, settings: ProjectSettings): string {
  if (ns === 'data') return settings.data.prefix;
  if (ns === 'ontology') return settings.ontology.prefix;
  return customOf(ns, settings)?.prefix ?? vocabPrefixOf(ns) ?? '';
}

/**
 * Every prefix that can be typed, with its namespace key: the project's own
 * two, the built-in vocabularies and the custom ones (PFX-01, PFX-04).
 */
export function knownPrefixes(settings: ProjectSettings): { prefix: string; ns: NsKey; namespace: string }[] {
  return [
    { prefix: settings.data.prefix, ns: 'data' as NsKey, namespace: settings.data.namespace },
    { prefix: settings.ontology.prefix, ns: 'ontology' as NsKey, namespace: settings.ontology.namespace },
    ...BUILTIN_PREFIXES.map((b) => ({ prefix: b.prefix, ns: vocabNs(b.prefix), namespace: b.namespace })),
    ...activeCustomPrefixes(settings).map((c) => ({ prefix: c.prefix, ns: customNs(c.id), namespace: c.namespace })),
  ];
}

export function fullIri(t: IriTerm, settings: ProjectSettings): string {
  return namespaceOf(t.ns, settings) + t.local;
}

/** Short form for display, e.g. "data:CUST_ID". */
export function prefixedName(t: Pick<IriTerm, 'ns' | 'local'>, settings: ProjectSettings): string {
  return `${prefixOf(t.ns, settings)}:${t.local}`;
}

/** Every IRI term used in the store, keyed by termKey, with the first label seen. */
export function collectTerms(triples: readonly Triple[]): Map<string, IriTerm> {
  const out = new Map<string, IriTerm>();
  const add = (t: ObjectTerm) => {
    if (t.kind !== 'iri') return;
    const k = termKey(t);
    if (!out.has(k)) out.set(k, t);
  };
  for (const t of triples) {
    add(t.s);
    add(t.p);
    add(t.o);
  }
  return out;
}

/**
 * Resolves "prefix:local" typed text to a namespace key, using the project's
 * own prefixes and the built-in vocabularies. Returns undefined when the text
 * is not in that form or the prefix is unknown.
 */
export function parsePrefixed(
  text: string,
  settings: ProjectSettings,
): { ns: NsKey; local: string } | undefined {
  const m = /^([A-Za-z][\w-]*):([^\s:/]*)$/.exec(text);
  if (!m) return undefined;
  const [, prefix, local] = m;
  const ns = knownPrefixes(settings).find((k) => k.prefix === prefix)?.ns;
  return ns ? { ns, local } : undefined;
}

/** Display text for an object: values are quoted. */
export function objectText(o: ObjectTerm): string {
  return o.kind === 'literal' ? `"${o.value}"` : o.label;
}

/** Where a term comes from, for the graph's details bar, e.g. "built-in vocabulary rdfs". */
export function sourceOf(ns: NsKey, settings: ProjectSettings): string {
  if (ns === 'data') return 'your Data graph';
  if (ns === 'ontology') return 'your Ontology graph';
  if (ns.startsWith('custom:')) return `your custom prefix ${prefixOf(ns, settings)}:`;
  const b = BUILTIN_PREFIXES.find((x) => x.prefix === vocabPrefixOf(ns));
  return b ? `built-in vocabulary ${b.prefix} (${b.usedFor.toLowerCase()})` : prefixOf(ns, settings);
}
