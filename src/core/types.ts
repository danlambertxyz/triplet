// Core data model. Terms are stored as namespace key + local name + label,
// never as full IRIs, so changing a namespace or prefix updates every IRI on
// export (ID-04).

export type GraphName = 'data' | 'ontology';

/**
 * Which namespace a term lives in: the project's own Data or Ontology
 * namespace, a built-in vocabulary prefix such as "rdfs" or "skos", or one of
 * the user's custom prefixes by its id (so editing the prefix or its
 * namespace updates every IRI on export, ID-04, PFX-04).
 */
export type NsKey = 'data' | 'ontology' | `vocab:${string}` | `custom:${string}`;

export interface IriTerm {
  kind: 'iri';
  ns: NsKey;
  local: string;
  /** The text the user typed; exported as rdfs:label for the project's own terms (ID-06). */
  label: string;
}

export const DATATYPES = ['string', 'integer', 'decimal', 'boolean', 'date', 'dateTime'] as const;
export type Datatype = (typeof DATATYPES)[number];

export interface LiteralTerm {
  kind: 'literal';
  value: string;
  datatype: Datatype;
}

export type ObjectTerm = IriTerm | LiteralTerm;

export interface Triple {
  id: string;
  graph: GraphName;
  s: IriTerm;
  p: IriTerm;
  o: ObjectTerm;
}

export interface GraphSettings {
  namespace: string;
  prefix: string;
}

/** PFX-04: a prefix the user added, e.g. fibo-fnd: for https://spec.edmcouncil.org/fibo/ontology/FND/. */
export interface CustomPrefix {
  /** Stable id; terms refer to the prefix by it (NsKey `custom:<id>`). */
  id: string;
  prefix: string;
  namespace: string;
  /**
   * Removed in Settings. Kept so that triples brought back by Undo still have
   * a namespace; a removed prefix is no longer offered or recognised as typed.
   */
  removed?: boolean;
}

export interface ProjectSettings {
  name: string;
  data: GraphSettings;
  ontology: GraphSettings;
  /** PFX-04. Missing in projects saved before Milestone 4. */
  customPrefixes?: CustomPrefix[];
}

export const DEFAULT_SETTINGS: ProjectSettings = {
  name: 'My Project',
  data: { namespace: 'https://example.org/data/', prefix: 'data' },
  ontology: { namespace: 'https://example.org/ontology/', prefix: 'ontology' },
};
