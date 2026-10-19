// Dropdown suggestions for the subject, predicate and object fields (ENT-03,
// ENT-04) and terms of a vocabulary after its prefix is typed (PFX-02). Every
// option comes from the triple store or the built-in vocabularies; nothing
// here knows about any domain (GEN-04).

import type { GraphName, IriTerm, ProjectSettings, Triple } from './types';
import { DATATYPES } from './types';
import { activeCustomPrefixes, collectTerms, isOwnNs, knownPrefixes, prefixedName, termKey } from './terms';
import { inferOntologyTyping, isPropertyType, pickerClasses, predicateMakesSubjectAProperty } from './typing';
import {
  BUILTIN_PREFIXES,
  DATA_COMMON_PREDICATES,
  ONTOLOGY_PREDICATES,
  ONTOLOGY_TYPE_OBJECTS,
  RDF_TYPE,
  RDFS_RANGE,
  commonTerms,
  xsdTerm,
} from './vocab';

export type SuggestField = 'subject' | 'predicate' | 'object';

export interface Suggestion {
  /** Unique within one list. */
  id: string;
  kind: 'term' | 'prefix' | 'new';
  /** Text put in the field when the option is picked. */
  value: string;
  label: string;
  /** The term's class, kind or prefixed name (ENT-03). */
  hint: string;
}

export interface Suggestions {
  heading: string;
  options: Suggestion[];
}

export interface SuggestArgs {
  field: SuggestField;
  graph: GraphName;
  text: string;
  triples: readonly Triple[];
  settings: ProjectSettings;
  /** The predicate the entry has so far; narrows the object's list (e.g. classes after "type"). */
  predicate?: IriTerm;
}

interface Item {
  key: string;
  value: string;
  label: string;
  hint: string;
  /** Matched without regard to case, as the entry form does for built-in names such as "type". */
  anyCase?: boolean;
}

const K_TYPE = termKey(RDF_TYPE);
const K_RANGE = termKey(RDFS_RANGE);
const GRAPH_TITLE: Record<GraphName, string> = { data: 'Data graph', ontology: 'Ontology graph' };
/** Longest list shown; typing narrows it. */
const MAX_OPTIONS = 50;
const PREFIX_ONLY = /^[A-Za-z][\w-]*$/;
const PREFIXED = /^([A-Za-z][\w-]*):(.*)$/;

const byLabel = (a: Item, b: Item) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });

/** What the store knows about each term: its classes (Data graph) and whether it is a class or property. */
function describe(triples: readonly Triple[]) {
  const classOf = new Map<string, string>();
  const properties = new Set<string>();
  for (const t of triples) {
    properties.add(termKey(t.p));
    if (t.o.kind !== 'iri') continue;
    if (t.graph === 'data' && termKey(t.p) === K_TYPE && !classOf.has(termKey(t.s))) classOf.set(termKey(t.s), t.o.label);
    if (t.graph === 'ontology') {
      if (predicateMakesSubjectAProperty(t.p)) properties.add(termKey(t.s));
      if (termKey(t.p) === K_TYPE && isPropertyType(t.o)) properties.add(termKey(t.s));
    }
  }
  const classes = new Set(inferOntologyTyping(triples).classes.map(termKey));
  return { classOf, properties, classes };
}

export function suggest(args: SuggestArgs): Suggestions {
  const { text, settings } = args;
  const typed = text.trim();
  const m = PREFIXED.exec(typed);
  const prefix = m && knownPrefixes(settings).find((k) => k.prefix === m[1]);
  const { heading, items } = prefix ? prefixPool(args, prefix.prefix, prefix.ns) : pool(args);
  const query = (prefix ? m![2] : typed).toLowerCase();

  const unique = new Map<string, Item>();
  for (const it of items) if (!unique.has(it.key)) unique.set(it.key, it);
  const matches = [...unique.values()].filter(
    (it) => !query || it.label.toLowerCase().includes(query) || it.value.toLowerCase().includes(query),
  );
  // Names that start with what was typed come first.
  const starts = (it: Item) => it.label.toLowerCase().startsWith(query) || it.value.toLowerCase().startsWith(query);
  const ordered = query ? [...matches.filter(starts), ...matches.filter((it) => !starts(it))] : matches;

  const options: Suggestion[] = ordered
    .slice(0, MAX_OPTIONS)
    .map((it) => ({ id: it.key, kind: 'term', value: it.value, label: it.label, hint: it.hint }));

  // PFX-02: a word that could be a prefix offers the prefix, which then lists its terms.
  if (!prefix && PREFIX_ONLY.test(typed) && typed.length >= 2) {
    const lower = typed.toLowerCase();
    for (const k of knownPrefixes(settings)) {
      if (!k.prefix.toLowerCase().startsWith(lower)) continue;
      options.push({ id: `prefix:${k.prefix}`, kind: 'prefix', value: `${k.prefix}:`, label: `${k.prefix}:`, hint: prefixNote(k.prefix, settings) });
    }
  }

  // ENT-03: "+ Add as new" when the typed text names nothing in the list.
  // Names are case-sensitive, so "date of birth" is new beside "Date of Birth" (ID-08).
  const exact = [...unique.values()].some((it) =>
    it.anyCase ? it.value.toLowerCase() === typed.toLowerCase() : it.value === typed,
  );
  if (typed && !exact && !(prefix && !m![2])) {
    options.push({ id: 'new', kind: 'new', value: typed, label: `+ Add “${typed}” as new`, hint: '' });
  }
  return { heading, options };
}

function prefixNote(prefix: string, settings: ProjectSettings): string {
  if (prefix === settings.data.prefix) return 'Your Data graph';
  if (prefix === settings.ontology.prefix) return 'Your Ontology graph';
  return BUILTIN_PREFIXES.find((b) => b.prefix === prefix)?.usedFor ?? 'Custom prefix';
}

/** Existing terms with this prefix, then the vocabulary's common terms (PFX-02). Custom prefixes have none (PFX-04). */
function prefixPool(args: SuggestArgs, prefix: string, ns: IriTerm['ns']): { heading: string; items: Item[] } {
  const { triples, settings } = args;
  const used = [...collectTerms(triples).values()].filter((t) => t.ns === ns);
  const common = activeCustomPrefixes(settings).some((c) => c.prefix === prefix) ? [] : commonTerms(prefix);
  const item = (t: IriTerm, hint: string): Item => ({
    key: termKey(t),
    value: prefixedName(t, settings),
    label: prefixedName(t, settings),
    hint,
  });
  return {
    heading: `${prefix}: ${prefixNote(prefix, settings)}`,
    items: [
      ...used.map((t) => item(t, isOwnNs(t.ns) ? t.label : 'In use')),
      ...common.map((t) => item(t, 'Built in')),
    ],
  };
}

/** ENT-04: the terms each field offers on each tab. */
function pool(args: SuggestArgs): { heading: string; items: Item[] } {
  const { field, graph, triples, settings, predicate } = args;
  const info = describe(triples);
  const terms = [...collectTerms(triples).values()];
  const name = (t: IriTerm) => prefixedName(t, settings);

  // A term typed by its label when that finds it, else by its prefixed name.
  const own = (t: IriTerm, hint: string): Item => ({ key: termKey(t), value: t.label, label: t.label, hint });
  const builtin = (t: IriTerm): Item => ({ key: termKey(t), value: t.label, label: t.label, hint: name(t), anyCase: true });
  const other = (t: IriTerm): Item => ({ key: termKey(t), value: name(t), label: name(t), hint: 'In use' });

  // Vocabulary or custom terms already used in this position on this tab.
  const usedElsewhere = (pick: (t: Triple) => IriTerm | undefined) => {
    const out: Item[] = [];
    for (const t of triples) {
      const x = t.graph === graph ? pick(t) : undefined;
      if (x && !isOwnNs(x.ns)) out.push(other(x));
    }
    return out;
  };
  const asSubject = (t: Triple) => t.s;
  const asObject = (t: Triple) => (t.o.kind === 'iri' ? t.o : undefined);

  if (field === 'predicate') {
    const common = graph === 'data' ? [RDF_TYPE, ...DATA_COMMON_PREDICATES] : ONTOLOGY_PREDICATES;
    const commonKeys = new Set(common.map(termKey));
    // Your own relationships: those used as predicates, and those the ontology declares.
    const mine = terms
      .filter((t) => t.ns === 'ontology' && info.properties.has(termKey(t)) && !info.classes.has(termKey(t)))
      .filter((t) => graph === 'data' || triples.some((x) => x.graph === 'ontology' && termKey(x.p) === termKey(t)))
      .map((t) => own(t, name(t)))
      .sort(byLabel);
    const vocab = usedElsewhere((t) => t.p).filter((it) => !commonKeys.has(it.key));
    return {
      heading: graph === 'data' ? 'Predicates already used, and common ones' : 'Ontology predicates',
      items: graph === 'data' ? [...mine, ...common.map(builtin), ...vocab] : [...common.map(builtin), ...mine, ...vocab],
    };
  }

  const pk = predicate ? termKey(predicate) : undefined;
  if (graph === 'data') {
    if (field === 'object' && pk === K_TYPE) {
      return {
        heading: 'Classes in your Ontology graph',
        items: pickerClasses(triples).map((c) => (isOwnNs(c.ns) ? own(c, name(c)) : other(c))),
      };
    }
    const entities = terms
      .filter((t) => t.ns === 'data')
      .map((t) => own(t, info.classOf.get(termKey(t)) ?? name(t)))
      .sort(byLabel);
    return {
      heading: `Existing in ${GRAPH_TITLE.data}`,
      items: [...entities, ...usedElsewhere(field === 'subject' ? asSubject : asObject)],
    };
  }

  // Ontology tab: classes and properties, each marked as which.
  const kindOf = (t: IriTerm) =>
    info.classes.has(termKey(t)) ? 'Class' : info.properties.has(termKey(t)) ? 'Property' : name(t);
  const mine = terms
    .filter((t) => t.ns === 'ontology')
    .map((t) => own(t, kindOf(t)))
    .sort(byLabel);
  const extra: Item[] = [];
  if (field === 'object' && pk === K_TYPE) extra.push(...ONTOLOGY_TYPE_OBJECTS.map(builtin));
  if (field === 'object' && pk === K_RANGE) extra.push(...DATATYPES.map((d) => builtin(xsdTerm(d))));
  return {
    heading: `Existing in ${GRAPH_TITLE.ontology}`,
    items: [...extra, ...mine, ...usedElsewhere(field === 'subject' ? asSubject : asObject)],
  };
}
