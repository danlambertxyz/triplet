// Built-in vocabularies (PFX-01) and the handful of standard terms the entry
// form understands by their plain-English name (ENT-04). These are RDF/OWL
// vocabulary, not domain rules (GEN-04).

import type { Datatype, IriTerm, NsKey } from './types';

export interface BuiltinPrefix {
  prefix: string;
  namespace: string;
  usedFor: string;
}

export const BUILTIN_PREFIXES: BuiltinPrefix[] = [
  { prefix: 'rdf', namespace: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#', usedFor: 'Core data model (rdf:type)' },
  { prefix: 'rdfs', namespace: 'http://www.w3.org/2000/01/rdf-schema#', usedFor: 'Classes, labels, domain, range' },
  { prefix: 'owl', namespace: 'http://www.w3.org/2002/07/owl#', usedFor: 'Richer ontology definitions' },
  { prefix: 'xsd', namespace: 'http://www.w3.org/2001/XMLSchema#', usedFor: 'Literal datatypes (dates, numbers)' },
  { prefix: 'skos', namespace: 'http://www.w3.org/2004/02/skos/core#', usedFor: 'Concepts, taxonomies, preferred labels' },
  { prefix: 'foaf', namespace: 'http://xmlns.com/foaf/0.1/', usedFor: 'People, organisations, relationships' },
  { prefix: 'dcterms', namespace: 'http://purl.org/dc/terms/', usedFor: 'Metadata: title, creator, dates' },
  { prefix: 'dc', namespace: 'http://purl.org/dc/elements/1.1/', usedFor: 'Legacy Dublin Core metadata' },
  { prefix: 'schema', namespace: 'https://schema.org/', usedFor: 'General-purpose web vocabulary' },
  { prefix: 'prov', namespace: 'http://www.w3.org/ns/prov#', usedFor: 'Provenance and lineage' },
  { prefix: 'dcat', namespace: 'http://www.w3.org/ns/dcat#', usedFor: 'Datasets and data catalogues' },
  { prefix: 'org', namespace: 'http://www.w3.org/ns/org#', usedFor: 'Organisational structures' },
  { prefix: 'sh', namespace: 'http://www.w3.org/ns/shacl#', usedFor: 'Shape constraints (for later validation)' },
  { prefix: 'time', namespace: 'http://www.w3.org/2006/time#', usedFor: 'Time intervals and instants' },
  { prefix: 'vcard', namespace: 'http://www.w3.org/2006/vcard/ns#', usedFor: 'Contact details' },
];

export function vocabNs(prefix: string): NsKey {
  return `vocab:${prefix}`;
}

export function builtinNamespace(prefix: string): string | undefined {
  return BUILTIN_PREFIXES.find((b) => b.prefix === prefix)?.namespace;
}

function v(prefix: string, local: string, label: string): IriTerm {
  return { kind: 'iri', ns: vocabNs(prefix), local, label };
}

export const RDF_TYPE = v('rdf', 'type', 'type');
export const RDFS_LABEL = v('rdfs', 'label', 'label');
export const RDFS_DOMAIN = v('rdfs', 'domain', 'domain');
export const RDFS_RANGE = v('rdfs', 'range', 'range');
export const RDFS_SUBCLASS_OF = v('rdfs', 'subClassOf', 'subclass of');
export const SKOS_DEFINITION = v('skos', 'definition', 'definition');

export const OWL_CLASS = v('owl', 'Class', 'Class');
export const RDFS_CLASS = v('rdfs', 'Class', 'Class');
export const OWL_OBJECT_PROPERTY = v('owl', 'ObjectProperty', 'ObjectProperty');
export const OWL_DATATYPE_PROPERTY = v('owl', 'DatatypeProperty', 'DatatypeProperty');

/** Common predicates offered on the Data graph tab (ENT-04). */
export const DATA_COMMON_PREDICATES: IriTerm[] = [RDFS_LABEL, SKOS_DEFINITION];

/** Ontology predicates offered on the Ontology graph tab (ENT-04). */
export const ONTOLOGY_PREDICATES: IriTerm[] = [
  RDFS_SUBCLASS_OF,
  RDFS_DOMAIN,
  RDFS_RANGE,
  RDF_TYPE,
  RDFS_LABEL,
  SKOS_DEFINITION,
];

/** Names accepted as the object of "type" on the Ontology tab. */
export const ONTOLOGY_TYPE_OBJECTS: IriTerm[] = [
  OWL_CLASS,
  OWL_OBJECT_PROPERTY,
  OWL_DATATYPE_PROPERTY,
  v('owl', 'FunctionalProperty', 'FunctionalProperty'),
  v('owl', 'InverseFunctionalProperty', 'InverseFunctionalProperty'),
  v('owl', 'TransitiveProperty', 'TransitiveProperty'),
  v('owl', 'SymmetricProperty', 'SymmetricProperty'),
  v('owl', 'AnnotationProperty', 'AnnotationProperty'),
  v('rdf', 'Property', 'Property'),
];

export const XSD_NAMESPACE = 'http://www.w3.org/2001/XMLSchema#';

export function xsdTerm(dt: Datatype): IriTerm {
  return v('xsd', dt, dt);
}

/**
 * PFX-02: common terms of each built-in vocabulary, suggested after its
 * prefix is typed (e.g. "foaf:"). A starting set, not the whole vocabulary;
 * any other term can still be typed in full.
 */
const COMMON_LOCALS: Record<string, string> = {
  rdf: 'type Property Statement subject predicate object value first rest nil List langString',
  rdfs: 'label comment subClassOf subPropertyOf domain range Class Resource Literal Datatype seeAlso isDefinedBy member Container',
  owl:
    'Class ObjectProperty DatatypeProperty AnnotationProperty FunctionalProperty InverseFunctionalProperty ' +
    'TransitiveProperty SymmetricProperty Thing Nothing Ontology Restriction inverseOf equivalentClass ' +
    'equivalentProperty sameAs differentFrom disjointWith imports versionInfo unionOf intersectionOf ' +
    'onProperty someValuesFrom allValuesFrom hasValue cardinality minCardinality maxCardinality deprecated',
  xsd:
    'string integer decimal boolean date dateTime time double float int long anyURI duration gYear ' +
    'nonNegativeInteger positiveInteger',
  skos:
    'Concept ConceptScheme Collection prefLabel altLabel hiddenLabel definition note scopeNote example ' +
    'editorialNote changeNote historyNote notation broader narrower related broaderTransitive ' +
    'narrowerTransitive inScheme hasTopConcept topConceptOf exactMatch closeMatch broadMatch narrowMatch ' +
    'relatedMatch member',
  foaf:
    'Person Organization Agent Group Document Image Project OnlineAccount name givenName familyName nick ' +
    'title mbox homepage page knows member depiction account age birthday gender made maker based_near ' +
    'topic primaryTopic logo phone',
  dcterms:
    'title description creator contributor publisher created modified issued date identifier subject ' +
    'language license rights rightsHolder source type format isPartOf hasPart references isReferencedBy ' +
    'relation coverage spatial temporal conformsTo abstract valid accessRights Agent LicenseDocument ' +
    'Location PeriodOfTime Standard',
  dc: 'title creator subject description publisher contributor date type format identifier source language relation coverage rights',
  schema:
    'Thing Person Organization Place Event Product CreativeWork Dataset DataCatalog PostalAddress ' +
    'ContactPoint Offer name description url identifier address email telephone birthDate givenName ' +
    'familyName jobTitle worksFor memberOf member parentOrganization subOrganization location startDate ' +
    'endDate dateCreated dateModified datePublished author creator publisher sameAs image keywords license ' +
    'version streetAddress postalCode addressLocality addressCountry price priceCurrency',
  prov:
    'Entity Activity Agent Person Organization SoftwareAgent Plan Bundle wasGeneratedBy used wasDerivedFrom ' +
    'wasAttributedTo wasAssociatedWith actedOnBehalfOf wasInformedBy wasStartedBy wasEndedBy ' +
    'wasInvalidatedBy wasRevisionOf wasQuotedFrom hadPrimarySource generatedAtTime invalidatedAtTime ' +
    'startedAtTime endedAtTime atLocation value hadPlan',
  dcat:
    'Catalog Dataset Distribution DataService CatalogRecord Resource Relationship dataset distribution ' +
    'service record accessURL downloadURL mediaType byteSize keyword theme themeTaxonomy landingPage ' +
    'contactPoint temporalResolution endpointURL endpointDescription servesDataset accessService ' +
    'compressFormat packageFormat version hasVersion qualifiedRelation hadRole',
  org:
    'Organization FormalOrganization OrganizationalUnit Site Post Role Membership ChangeEvent ' +
    'subOrganizationOf hasSubOrganization unitOf hasUnit memberOf hasMember member organization role ' +
    'holds heldBy postIn hasPost reportsTo headOf hasSite siteOf hasPrimarySite hasRegisteredSite ' +
    'identifier classification purpose linkedTo changedBy resultedFrom originalOrganization',
  sh:
    'NodeShape PropertyShape targetClass targetNode targetSubjectsOf targetObjectsOf property path datatype ' +
    'class nodeKind minCount maxCount minLength maxLength pattern in hasValue node name description message ' +
    'severity Violation Warning Info IRI Literal BlankNode closed ignoredProperties or and not xone ' +
    'minInclusive maxInclusive uniqueLang languageIn equals disjoint lessThan',
  time:
    'Instant Interval ProperInterval TemporalEntity Duration DurationDescription DateTimeDescription ' +
    'TemporalUnit hasBeginning hasEnd hasTime inXSDDate inXSDDateTime inXSDDateTimeStamp inside before ' +
    'after intervalBefore intervalAfter intervalContains intervalDuring intervalEquals intervalMeets ' +
    'intervalOverlaps hasDuration hasXSDDuration numericDuration unitType year month day hour minute second',
  vcard:
    'Individual Organization Group Kind Location Address Email Tel Name fn hasName given-name family-name ' +
    'nickname title role hasEmail hasTelephone hasAddress street-address locality region postal-code ' +
    'country-name hasURL organization-name hasPhoto bday note hasUID',
};

/** PFX-02: the common terms of a built-in vocabulary, by prefix; empty for any other prefix. */
export function commonTerms(prefix: string): IriTerm[] {
  const locals = COMMON_LOCALS[prefix];
  return locals ? locals.split(' ').map((l) => v(prefix, l, l)) : [];
}
