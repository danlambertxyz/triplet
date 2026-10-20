// TYPE-06: ontology terms are typed from how they are used, so the user never
// picks a type. A term used as a class (subclass of, or the object of a domain
// or range) is a class; a term given a domain or range is a property:
// owl:DatatypeProperty when its range is an xsd datatype, else
// owl:ObjectProperty. These types are added on export only; the store keeps
// the triples as typed.

import type { IriTerm, Triple } from './types';
import { isOwnNs, termKey } from './terms';
import { ONTOLOGY_TYPE_OBJECTS, OWL_CLASS, RDF_TYPE, RDFS_CLASS, RDFS_DOMAIN, RDFS_RANGE, RDFS_SUBCLASS_OF, vocabNs } from './vocab';

const K_TYPE = termKey(RDF_TYPE);
const K_SUBCLASS = termKey(RDFS_SUBCLASS_OF);
const K_DOMAIN = termKey(RDFS_DOMAIN);
const K_RANGE = termKey(RDFS_RANGE);
const K_SUBPROPERTY = termKey({ ns: vocabNs('rdfs'), local: 'subPropertyOf' });
const K_RDFS_LITERAL = termKey({ ns: vocabNs('rdfs'), local: 'Literal' });
const CLASS_TYPES = new Set([termKey(OWL_CLASS), termKey(RDFS_CLASS)]);
/** Types that already say which kind of property a term is. */
export const PROPERTY_KIND_TYPES = new Set(
  ['owl|ObjectProperty', 'owl|DatatypeProperty', 'owl|AnnotationProperty', 'rdf|Property'].map((s) => {
    const [p, l] = s.split('|');
    return termKey({ ns: vocabNs(p), local: l });
  }),
);
/** Any property type the Ontology tab understands by name (incl. FunctionalProperty). */
const ANY_PROPERTY_TYPES = new Set(ONTOLOGY_TYPE_OBJECTS.filter((t) => !CLASS_TYPES.has(termKey(t))).map(termKey));

export function isDatatypeTerm(t: IriTerm): boolean {
  return t.ns === vocabNs('xsd') || termKey(t) === K_RDFS_LITERAL;
}

export function isClassType(t: IriTerm): boolean {
  return CLASS_TYPES.has(termKey(t));
}

export function isPropertyType(t: IriTerm): boolean {
  return ANY_PROPERTY_TYPES.has(termKey(t));
}

/** Predicates whose subject is a property (so it gets a camelCase local name). */
export function predicateMakesSubjectAProperty(p: IriTerm): boolean {
  const k = termKey(p);
  return k === K_DOMAIN || k === K_RANGE || k === K_SUBPROPERTY;
}

export interface OntologyTyping {
  /** Every term used or declared as a class, in order of first appearance. */
  classes: IriTerm[];
  /** Types to add on export for the project's own terms that are not typed explicitly. */
  autoTypes: { term: IriTerm; type: 'Class' | 'ObjectProperty' | 'DatatypeProperty' }[];
}

export function inferOntologyTyping(triples: readonly Triple[]): OntologyTyping {
  const classes = new Map<string, IriTerm>();
  const explicitClass = new Set<string>();
  const explicitPropertyKind = new Set<string>();
  const properties = new Map<string, { term: IriTerm; ranges: IriTerm[] }>();

  const asClass = (t: IriTerm) => {
    if (isDatatypeTerm(t)) return;
    const k = termKey(t);
    if (!classes.has(k)) classes.set(k, t);
  };
  const asProperty = (t: IriTerm) => {
    const k = termKey(t);
    if (!properties.has(k)) properties.set(k, { term: t, ranges: [] });
    return properties.get(k)!;
  };

  for (const t of triples) {
    if (t.graph !== 'ontology' || t.o.kind !== 'iri') continue;
    const pk = termKey(t.p);
    if (pk === K_SUBCLASS) {
      asClass(t.s);
      asClass(t.o);
    } else if (pk === K_DOMAIN) {
      asProperty(t.s);
      asClass(t.o);
    } else if (pk === K_RANGE) {
      asProperty(t.s).ranges.push(t.o);
      asClass(t.o);
    } else if (pk === K_TYPE) {
      const ok = termKey(t.o);
      if (CLASS_TYPES.has(ok)) {
        explicitClass.add(termKey(t.s));
        asClass(t.s);
      } else if (PROPERTY_KIND_TYPES.has(ok)) {
        explicitPropertyKind.add(termKey(t.s));
      }
    }
  }

  const autoTypes: OntologyTyping['autoTypes'] = [];
  for (const [k, term] of classes) {
    if (isOwnNs(term.ns) && !explicitClass.has(k)) autoTypes.push({ term, type: 'Class' });
  }
  for (const [k, { term, ranges }] of properties) {
    if (!isOwnNs(term.ns) || explicitPropertyKind.has(k)) continue;
    const datatype = ranges.length > 0 && ranges.every(isDatatypeTerm);
    autoTypes.push({ term, type: datatype ? 'DatatypeProperty' : 'ObjectProperty' });
  }
  return { classes: [...classes.values()], autoTypes };
}

/** Classes offered by the Data tab's class picker (TYPE-01, TYPE-05), sorted by label. */
export function pickerClasses(triples: readonly Triple[]): IriTerm[] {
  return [...inferOntologyTyping(triples).classes].sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }),
  );
}

/**
 * The class a Data graph term already has, by the name typed for it (its
 * label), so the class picker can show it when that subject is typed again.
 * Returns the class's termKey, or undefined when the term is new or has none.
 */
export function currentClassOf(triples: readonly Triple[], typedName: string): string | undefined {
  const name = typedName.trim();
  if (!name) return undefined;
  const classes = new Set(inferOntologyTyping(triples).classes.map(termKey));
  const t = triples.find(
    (x) =>
      x.graph === 'data' &&
      x.s.ns === 'data' &&
      x.s.label === name &&
      termKey(x.p) === K_TYPE &&
      x.o.kind === 'iri' &&
      classes.has(termKey(x.o)),
  );
  return t && t.o.kind === 'iri' ? termKey(t.o) : undefined;
}
