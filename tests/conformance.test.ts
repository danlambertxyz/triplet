import { beforeEach, describe, expect, it } from 'vitest';
import {
  checkConformance,
  exceptionFor,
  pruneExceptions,
  repointExceptions,
  type AcceptedException,
} from '../src/core/conformance';
import { planRename } from '../src/core/edit';
import { exportGraph } from '../src/core/export';
import { collectTerms, objectText, termKey } from '../src/core/terms';
import type { IriTerm, Triple } from '../src/core/types';
import { useApp } from '../src/ui/store';
import { DATA_ENTRIES, ONTOLOGY_ENTRIES, type SampleEntry } from './fixtures/sampleEntries';
import { enter, SETTINGS } from './helpers';

const SAMPLE = enter([...ONTOLOGY_ENTRIES, ...DATA_ENTRIES]);

const show = (t: Omit<Triple, 'id'>) => `${t.s.label} · ${t.p.label} · ${objectText(t.o)}`;
function flagged(store: readonly Triple[], accepted: AcceptedException[] = []) {
  const c = checkConformance(store, accepted);
  return c.flags.map((f) => ({ triple: show(store.find((t) => t.id === f.tripleId)!), kind: f.kind, reason: f.reason, accepted: f.accepted }));
}
function term(store: readonly Triple[], label: string, ns: IriTerm['ns'] = 'data'): IriTerm {
  const t = [...collectTerms(store).values()].find((x) => x.ns === ns && x.label === label);
  if (!t) throw new Error(`No term "${label}" in ${ns}`);
  return t;
}
const d = (subject: string, predicate: string, object: string, cls?: string): SampleEntry => ({
  graph: 'data',
  subject,
  predicate,
  object,
  cls,
});
const o = (subject: string, predicate: string, object: string): SampleEntry => ({ graph: 'ontology', subject, predicate, object });

describe('sample domain in Validate mode (CHK-01–10)', () => {
  it('the clean sample has no flags: shared logical element and optional link are fine', () => {
    const c = checkConformance(SAMPLE);
    expect(c.hasRules).toBe(true);
    expect(c.flags).toEqual([]);
    // Shared logical element: CUST_ID and CLIENT_NO both implement Client ID.
    const clientId = SAMPLE.filter((t) => t.p.label === 'implements' && t.o.kind === 'iri' && t.o.label === 'Client ID');
    expect(clientId.map((t) => t.s.label).sort()).toEqual(['CLIENT_NO', 'CUST_ID']);
    // Optional link: Country of Residence has no physical data element.
    expect(SAMPLE.some((t) => t.p.label === 'implements' && t.o.kind === 'iri' && t.o.label === 'Country of Residence')).toBe(false);
  });

  it('sample test "Many-to-one violation": DOB also implements Client ID is flagged, not blocked (CHK-10)', () => {
    const store = enter([d('DOB', 'implements', 'Client ID')], SAMPLE);
    expect(store).toHaveLength(SAMPLE.length + 1);
    expect(flagged(store)).toEqual([
      {
        triple: 'DOB · implements · Birth Date',
        kind: 'functional',
        reason: '“implements” allows one value per subject; “DOB” has 2: “Birth Date” and “Client ID”.',
        accepted: false,
      },
      {
        triple: 'DOB · implements · Client ID',
        kind: 'functional',
        reason: '“implements” allows one value per subject; “DOB” has 2: “Birth Date” and “Client ID”.',
        accepted: false,
      },
    ]);
    expect(checkConformance(store).openTripleIds).toHaveLength(2);
  });

  it('CRM implements Client ID gets a domain flag (CHK-01, build brief M6 check)', () => {
    const store = enter([d('CRM', 'implements', 'Client ID')], SAMPLE);
    expect(flagged(store)).toEqual([
      {
        triple: 'CRM · implements · Client ID',
        kind: 'domain',
        reason: '“implements” expects a “Physical data element” as subject; “CRM” is a “System”.',
        accepted: false,
      },
    ]);
  });

  it('several domains match if any one does (CHK-01, TYPE-07)', () => {
    // belongs to: Business term or Data product.
    const ok = enter([d('Wealth 360', 'belongs to', 'Individual Client', 'Data product')], SAMPLE);
    expect(checkConformance(ok).flags).toEqual([]);
    const bad = enter([d('CRM', 'belongs to', 'Individual Client')], SAMPLE);
    expect(flagged(bad)[0].reason).toBe(
      '“belongs to” expects a “Business term” or a “Data product” as subject; “CRM” is a “System”.',
    );
  });

  it('flags an object of the wrong class (CHK-02)', () => {
    const store = enter([d('CUST_ID', 'implements', 'Full Name')], SAMPLE);
    const f = flagged(store).filter((x) => x.kind === 'range');
    expect(f).toEqual([
      {
        triple: 'CUST_ID · implements · Full Name',
        kind: 'range',
        reason: '“implements” expects a “Logical data element” as object; “Full Name” is a “Business term”.',
        accepted: false,
      },
    ]);
  });

  it('does not flag untyped subjects or objects, and counts untyped entities (CHK-05)', () => {
    const store = enter([d('Mystery', 'implements', 'Something')], SAMPLE);
    const c = checkConformance(store);
    expect(c.flags).toEqual([]);
    expect(c.untyped).toBe(2);
    expect(checkConformance(SAMPLE).untyped).toBe(0);
  });

  it('flags literal datatypes and literal/entity mix-ups (CHK-03)', () => {
    const store = enter(
      [
        { graph: 'data', subject: 'Client Master', predicate: 'last refreshed', value: 'yesterday', datatype: 'string' },
        d('DOB', 'contains PII', 'Client ID'),
        { graph: 'data', subject: 'CUST_ID', predicate: 'implements', value: 'Client ID', datatype: 'string' },
      ],
      SAMPLE,
    );
    const reasons = flagged(store)
      .filter((f) => f.kind === 'range')
      .map((f) => f.reason);
    expect(reasons).toEqual([
      '“last refreshed” expects “date” as object; "yesterday" is string.',
      '“contains PII” expects a literal (boolean) as object; “Client ID” is an entity.',
      '“implements” expects an entity (a “Logical data element”) as object, not a literal.',
    ]);
  });

  it('an integer fits a decimal range, and rdfs:Literal takes any literal (CHK-03)', () => {
    const store = enter(
      [
        o('amount', 'range', 'decimal'),
        o('note', 'range', 'rdfs:Literal'),
        { graph: 'data', subject: 'CRM', predicate: 'amount', value: '3', datatype: 'integer' },
        { graph: 'data', subject: 'CRM', predicate: 'note', value: 'true', datatype: 'boolean' },
      ],
      SAMPLE,
    );
    expect(checkConformance(store).flags).toEqual([]);
  });

  it('subclasses count, through any number of levels (CHK-01)', () => {
    const store = enter(
      [
        o('Column', 'subclass of', 'Physical data element'),
        o('Key column', 'subclass of', 'Column'),
        d('ACCT_ID', 'implements', 'Client ID', 'Key column'),
      ],
      SAMPLE,
    );
    expect(checkConformance(store).flags).toEqual([]);
  });

  it('flags the project’s own predicates the ontology does not declare; standard ones are exempt (CHK-04)', () => {
    const store = enter([d('CRM', 'hosted by', 'Core Banking'), d('CRM', 'foaf:knows', 'Core Banking')], SAMPLE);
    expect(flagged(store)).toEqual([
      {
        triple: 'CRM · hosted by · Core Banking',
        kind: 'undeclared',
        reason: '“hosted by” isn\'t declared in the Ontology graph: it has no domain, range, type or parent relationship there.',
        accepted: false,
      },
    ]);
    // Type, label and definition triples are never flagged in the clean sample either.
    const declared = enter([o('hosted by', 'type', 'ObjectProperty')], store);
    expect(flagged(declared)).toEqual([]);
  });

  it('checks a relationship against its parent’s domain and range (CHK-09)', () => {
    const store = enter([o('reads', 'rdfs:subPropertyOf', 'uses'), d('CRM', 'reads', 'DOB')], SAMPLE);
    expect(flagged(store)).toEqual([
      {
        triple: 'CRM · reads · DOB',
        kind: 'domain',
        reason: '“reads” is a kind of “uses”, which expects a “Process” as subject; “CRM” is a “System”.',
        accepted: false,
      },
    ]);
  });

  it('only checks functional relationships; repeated identical triples count once (CHK-10)', () => {
    // has dataset is not functional: two datasets are fine.
    expect(checkConformance(SAMPLE).flags.filter((f) => f.kind === 'functional')).toEqual([]);
    const literal = enter([o('contains PII', 'type', 'FunctionalProperty'), { graph: 'data', subject: 'DOB', predicate: 'contains PII', value: 'false', datatype: 'boolean' }], SAMPLE);
    expect(flagged(literal).map((f) => f.reason)).toEqual([
      '“contains PII” allows one value per subject; “DOB” has 2: "true" and "false".',
      '“contains PII” allows one value per subject; “DOB” has 2: "true" and "false".',
    ]);
  });

  it('checks nothing while the Ontology graph declares no relationships', () => {
    const store = enter([d('Alice', 'works for', 'Acme Bank')]);
    const c = checkConformance(store);
    expect(c.hasRules).toBe(false);
    expect(c.flags).toEqual([]);
  });

  it('only the Data graph is checked', () => {
    expect(checkConformance(SAMPLE).flags.every((f) => SAMPLE.find((t) => t.id === f.tripleId)!.graph === 'data')).toBe(true);
  });
});

describe('accepted exceptions (CHK-07)', () => {
  const store = enter([d('CRM', 'implements', 'Client ID')], SAMPLE);
  const t = store[store.length - 1];
  const flag = checkConformance(store).flags[0];
  const accepted = [exceptionFor(t, flag)];

  it('an accepted flag is kept but no longer counted', () => {
    const c = checkConformance(store, accepted);
    expect(c.flags).toHaveLength(1);
    expect(c.flags[0].accepted).toBe(true);
    expect(c.openTripleIds).toEqual([]);
  });

  it('covers only that reason: a new reason on the same triple flags it again', () => {
    // Client ID becomes a Data domain, so the range check fails too.
    const other = store.map((x) =>
      x.graph === 'data' && x.s.label === 'Client ID' && x.p.local === 'type' ? { ...x, o: term(store, 'Data domain', 'ontology') } : x,
    );
    const c = checkConformance(other, accepted);
    expect(c.flags.filter((f) => f.tripleId === t.id).map((f) => [f.kind, f.accepted])).toEqual([
      ['domain', true],
      ['range', false],
    ]);
    expect(c.openTripleIds).toContain(t.id);
  });

  it('follows a rename (agreed 17 Oct 2026)', () => {
    const plan = planRename(store, term(store, 'CRM'), 'CRM System');
    if (!plan.ok) throw new Error(plan.error);
    const to = termKey(plan.renamed);
    const moved = repointExceptions(accepted, [termKey(term(store, 'CRM'))], to);
    expect(checkConformance(plan.triples, moved).openTripleIds).toEqual([]);
  });

  it('Edit triple asks again: an exception whose triple changed is dropped', () => {
    const after = store.map((x) => (x.id === t.id ? { ...x, o: term(store, 'Given Name') } : x));
    expect(pruneExceptions(accepted, after)).toEqual([]);
    expect(pruneExceptions(accepted, store)).toBe(accepted);
  });

  it('is never exported', () => {
    const ttl = exportGraph(store, SETTINGS, 'data').turtle;
    expect(ttl).not.toMatch(/exception/i);
  });
});

describe('Validate mode in the store (MODE-02–05, CHK-07)', () => {
  const st = () => useApp.getState();
  const CRM_IMPLEMENTS = enter([d('CRM', 'implements', 'Client ID')], SAMPLE);
  const open = () => checkConformance(st().triples, st().exceptions).openTripleIds.length;
  const accept = () => {
    const c = checkConformance(st().triples, st().exceptions);
    const f = c.flags[0];
    st().acceptExceptions([exceptionFor(st().triples.find((t) => t.id === f.tripleId)!, f)]);
  };

  beforeEach(() => {
    st().createProject(SETTINGS);
    st().addTriples(CRM_IMPLEMENTS);
  });

  it('starts in Sketch; the mode is saved with the project and switching changes no triples', () => {
    expect(st().mode).toBe('sketch');
    const before = st().triples;
    st().setMode('validate');
    expect(st().triples).toBe(before);
    expect(st().history.past).toHaveLength(1);
    const saved = useApp.persist.getOptions().partialize!(st()) as Record<string, unknown>;
    expect(saved.mode).toBe('validate');
    st().createProject(SETTINGS);
    expect(st().mode).toBe('sketch');
  });

  it('accepting is one undoable step, saved with the project, and kept across mode switches', () => {
    expect(open()).toBe(1);
    accept();
    expect(open()).toBe(0);
    st().setMode('sketch');
    st().setMode('validate');
    expect(open()).toBe(0);
    const saved = useApp.persist.getOptions().partialize!(st()) as Record<string, unknown>;
    expect(saved.exceptions).toHaveLength(1);
    st().undo();
    expect(open()).toBe(1);
    st().redo();
    expect(open()).toBe(0);
    st().flagAgain([], st().exceptions);
    expect(open()).toBe(1);
    st().undo();
    expect(open()).toBe(0);
  });

  it('rename keeps the exception; Edit triple drops it, and Undo brings it back', () => {
    accept();
    const crm = term(st().triples, 'CRM');
    const plan = planRename(st().triples, crm, 'CRM System');
    if (!plan.ok) throw new Error(plan.error);
    st().renameTerm(plan.triples, termKey(crm), termKey(plan.renamed));
    expect(open()).toBe(0);
    const t = st().triples.find((x) => x.s.label === 'CRM System' && x.p.label === 'implements')!;
    st().replaceTriple(t.id, { ...t, o: term(st().triples, 'Given Name') });
    expect(st().exceptions).toEqual([]);
    expect(open()).toBe(1);
    st().undo();
    expect(st().exceptions).toHaveLength(1);
    expect(open()).toBe(0);
  });
});
