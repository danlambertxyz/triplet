// The sample domain (a small data governance ontology) as a user would type it
// into the entry form. Sample-specific knowledge lives here, never in app code (GEN-04).

import type { Datatype, GraphName } from '../../src/core/types';

export interface SampleEntry {
  graph: GraphName;
  subject: string;
  /** Class picked in the Data tab's class picker, by label. */
  cls?: string;
  predicate?: string;
  object?: string;
  value?: string;
  datatype?: Datatype;
}

const o = (subject: string, predicate: string, object: string): SampleEntry => ({ graph: 'ontology', subject, predicate, object });

export const ONTOLOGY_ENTRIES: SampleEntry[] = [
  o('implements', 'domain', 'Physical data element'),
  o('implements', 'range', 'Logical data element'),
  o('implements', 'type', 'FunctionalProperty'),
  o('represents', 'domain', 'Logical data element'),
  o('represents', 'range', 'Business term'),
  o('represents', 'type', 'FunctionalProperty'),
  o('belongs to', 'domain', 'Business term'),
  o('belongs to', 'domain', 'Data product'),
  o('belongs to', 'range', 'Data domain'),
  o('belongs to', 'type', 'FunctionalProperty'),
  o('has physical data element', 'domain', 'System'),
  o('has physical data element', 'range', 'Physical data element'),
  o('uses', 'domain', 'Process'),
  o('uses', 'range', 'Physical data element'),
  o('has dataset', 'domain', 'Data product'),
  o('has dataset', 'domain', 'System'),
  o('has dataset', 'range', 'Dataset'),
  o('data type', 'domain', 'Physical data element'),
  o('data type', 'range', 'string'),
  o('contains PII', 'domain', 'Physical data element'),
  o('contains PII', 'range', 'boolean'),
  o('last refreshed', 'domain', 'Dataset'),
  o('last refreshed', 'range', 'date'),
];

const d = (subject: string, predicate: string, object: string, cls?: string): SampleEntry => ({
  graph: 'data',
  subject,
  cls,
  predicate,
  object,
});
const val = (subject: string, predicate: string, value: string, datatype: Datatype = 'string', cls?: string): SampleEntry => ({
  graph: 'data',
  subject,
  cls,
  predicate,
  value,
  datatype,
});

const businessTerms: [string, string][] = [
  ['Client Identifier', 'A unique reference assigned to an individual client.'],
  ['Full Name', "The client's legal name."],
  ['Date of Birth', 'The date the client was born.'],
  ['Residential Address', 'The address where the client normally lives.'],
  ['Tax Identification Number', 'The identifier issued to the client by a tax authority.'],
  ['KYC Risk Rating', "The client's assessed money-laundering and financial-crime risk level."],
];

const logical: [string, string][] = [
  ['Client ID', 'Client Identifier'],
  ['Given Name', 'Full Name'],
  ['Family Name', 'Full Name'],
  ['Birth Date', 'Date of Birth'],
  ['Address Line 1', 'Residential Address'],
  ['Postal Code', 'Residential Address'],
  ['Country of Residence', 'Residential Address'],
  ['Tax ID Number', 'Tax Identification Number'],
  ['Risk Rating Code', 'KYC Risk Rating'],
];

const datasets: [string, string][] = [
  ['Client Master', '2026-10-14'],
  ['Client Account Register', '2026-10-14'],
  ['KYC Profiles', '2026-10-01'],
];

const systems: [string, string, string[]][] = [
  ['CRM', 'Client Master', ['CUST_ID', 'FIRST_NM', 'LAST_NM', 'DOB']],
  ['Core Banking', 'Client Account Register', ['CLIENT_NO', 'ADDR_LN1', 'POST_CD']],
  ['KYC Platform', 'KYC Profiles', ['RISK_SCORE', 'TIN']],
];

const physical: [string, string, string, boolean][] = [
  ['CUST_ID', 'Client ID', 'VARCHAR(20)', false],
  ['FIRST_NM', 'Given Name', 'VARCHAR(100)', true],
  ['LAST_NM', 'Family Name', 'VARCHAR(100)', true],
  ['DOB', 'Birth Date', 'DATE', true],
  ['CLIENT_NO', 'Client ID', 'CHAR(12)', false],
  ['ADDR_LN1', 'Address Line 1', 'VARCHAR(200)', true],
  ['POST_CD', 'Postal Code', 'VARCHAR(10)', true],
  ['RISK_SCORE', 'Risk Rating Code', 'INTEGER', false],
  ['TIN', 'Tax ID Number', 'VARCHAR(20)', true],
];

const processes: [string, string[]][] = [
  ['Client Onboarding', ['CUST_ID', 'FIRST_NM', 'LAST_NM', 'DOB']],
  ['KYC Periodic Review', ['RISK_SCORE', 'DOB']],
];

export const DATA_ENTRIES: SampleEntry[] = [
  // Subject + class alone is a complete entry.
  { graph: 'data', subject: 'Individual Client', cls: 'Data domain' },
  d('Individual Client 360', 'belongs to', 'Individual Client', 'Data product'),
  d('Individual Client 360', 'has dataset', 'Client Master'),
  d('Individual Client 360', 'has dataset', 'KYC Profiles'),
  ...businessTerms.flatMap(([name, def]) => [
    val(name, 'definition', def, 'string', 'Business term'),
    d(name, 'belongs to', 'Individual Client'),
  ]),
  ...logical.map(([name, term]) => d(name, 'represents', term, 'Logical data element')),
  ...datasets.map(([name, date]) => val(name, 'last refreshed', date, 'date', 'Dataset')),
  ...systems.flatMap(([name, ds, pdes]) => [
    d(name, 'has dataset', ds, 'System'),
    ...pdes.map((p) => d(name, 'has physical data element', p)),
  ]),
  ...physical.flatMap(([name, impl, type, pii]) => [
    d(name, 'implements', impl, 'Physical data element'),
    val(name, 'data type', type),
    val(name, 'contains PII', String(pii), 'boolean'),
  ]),
  ...processes.flatMap(([name, uses]) => uses.map((u, i) => d(name, 'uses', u, i === 0 ? 'Process' : undefined))),
];
