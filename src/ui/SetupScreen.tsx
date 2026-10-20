// SCR-01: project setup, shown once before the main screen.

import { useRef, useState, type FormEvent } from 'react';
import { declareClasses, parseClassList } from '../core/entry';
import { isParseError, planImport, readTurtle, type ParsedFile } from '../core/import';
import { toLocalName } from '../core/localName';
import {
  DEFAULT_SETUP,
  normaliseBase,
  settingsFromSetup,
  validateGraphNames,
  validateSetup,
  type SetupDraft,
  type SetupErrors,
  type SetupField,
} from '../core/settings';
import type { GraphName, ProjectSettings } from '../core/types';
import { BUILTIN_PREFIXES } from '../core/vocab';
import { FilePickers, ImportSummary, type PickedFile } from './ImportFiles';
import { useApp } from './store';

export function SetupScreen() {
  const createProject = useApp((s) => s.createProject);
  // After "Start a new project", the old base address and graph names are kept (GEN-10).
  const carried = useApp((s) => s.setupDraft);
  const [draft, setDraft] = useState<SetupDraft>(() => carried ?? DEFAULT_SETUP);
  const [errors, setErrors] = useState<SetupErrors>({});
  const [showVocab, setShowVocab] = useState(false);
  const [classText, setClassText] = useState('');
  const classList = parseClassList(classText);
  // IMP-01, IMP-02: start empty, or from Turtle files.
  const [start, setStart] = useState<'empty' | 'files'>('empty');
  const [files, setFiles] = useState<Partial<Record<GraphName, PickedFile>>>({});
  const [filesMissing, setFilesMissing] = useState(false);
  const importing = start === 'files';
  const hasFile = !!files.data || !!files.ontology;
  const fileError = Object.values(files).some((f) => f && isParseError(f.result));
  const [plan, setPlan] = useState<ReturnType<typeof planImport> | null>(null);

  /** The project the form describes; with files, their custom prefixes too (PFX-04). */
  const settingsOf = (d: SetupDraft): ProjectSettings => ({
    ...settingsFromSetup(d),
    ...(importing && plan ? { customPrefixes: plan.customPrefixes } : {}),
  });
  /** Setup's checks, plus clashes with the files' custom prefixes. */
  const check = (d: SetupDraft): SetupErrors => {
    const found = validateSetup(d);
    if (!importing || !plan || Object.keys(found).length > 0) return found;
    return validateGraphNames(d, settingsOf(d));
  };

  // IMP-03, IMP-04: read the files and fill in the namespaces they use.
  // Read from refs after the await, so two picks in flight don't drop each other's file.
  const filesRef = useRef(files);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const pick = async (graph: GraphName, file: File | null) => {
    const picked = file ? { fileName: file.name, result: readTurtle(file.name, await file.text()) } : undefined;
    const next = { ...filesRef.current };
    if (picked) next[graph] = picked;
    else delete next[graph];
    filesRef.current = next;
    setFiles(next);
    setFilesMissing(false);
    const ok: Partial<Record<GraphName, ParsedFile>> = {};
    for (const g of ['data', 'ontology'] as const) {
      const r = next[g]?.result;
      if (r && !isParseError(r)) ok[g] = r;
    }
    if (!ok.data && !ok.ontology) {
      setPlan(null);
      return;
    }
    const p = planImport(ok, draftRef.current);
    setPlan(p);
    setDraft((d) => ({ ...d, ...p.names }));
    setErrors({});
  };

  // Field checks run as you type; an empty field is only flagged on submit.
  const update = (field: SetupField, value: string) => {
    const next = { ...draft, [field]: value };
    setDraft(next);
    const found = check(next);
    setErrors((e) => {
      const out: SetupErrors = {};
      for (const f of Object.keys(next) as SetupField[]) {
        const filled = next[f].trim() !== '';
        if (found[f] && (filled || (f !== field && e[f]))) out[f] = found[f];
      }
      return out;
    });
  };

  const blocked = importing ? !hasFile || fileError || !plan : classList.errors.length > 0;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const found = check(draft);
    setErrors(found);
    if (importing && !hasFile) setFilesMissing(true);
    if (Object.keys(found).length > 0 || blocked) return;
    const settings = settingsOf(draft);
    createProject(settings, importing && plan ? plan.triples : declareClasses(classList.names, settings));
  };

  const input = (field: SetupField, id: string, className: string) => (
    <input
      id={id}
      className={className}
      value={draft[field]}
      onChange={(e) => update(field, e.target.value)}
      spellCheck={false}
      aria-invalid={!!errors[field]}
      aria-describedby={errors[field] ? `${id}-err` : undefined}
    />
  );
  const error = (field: SetupField, id: string) =>
    errors[field] && (
      <div id={`${id}-err`} className="error">
        {errors[field]}
      </div>
    );

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-title">
          <div className="brand">Triplet</div>
        </div>
      </header>
      <main className="setup">
        <form onSubmit={submit} noValidate>
          <p className="intro">
            Triplet helps you design knowledge graphs. Build RDF triples in a visual, interactive way: type a subject, a
            predicate and an object, see them as a list and a graph, and export Turtle files you can load into a graph
            database later. It is meant for learning and quick development, not as a production tool.
          </p>

          <div className="stack-8">
            <h1>Set up your project</h1>
            <p className="lead">
              Name your project and choose where your terms will live. The defaults work fine to start with, and you can
              change any of this later in Settings.
            </p>
          </div>

          <div className="start-choice">
            <div className="seg" role="group" aria-label="How to start">
              <button type="button" aria-pressed={!importing} onClick={() => setStart('empty')}>
                Start empty
              </button>
              <button type="button" aria-pressed={importing} onClick={() => setStart('files')}>
                Start from Turtle files
              </button>
            </div>
            <span className="start-note">
              {importing
                ? 'Pick up where you left off: open the .ttl files Triplet exported, or Turtle from elsewhere.'
                : 'Type your triples from scratch.'}
            </span>
          </div>

          <div className="explain">
            <div className="t1">Every project has two graphs</div>
            <div className="cols">
              <div className="col">
                <b>Ontology graph</b>
                <span>
                  Defines the classes and properties: the kinds of things you have and how they can relate. Examples
                  from financial services:
                </span>
                <ul>
                  <li>System</li>
                  <li>Physical data element</li>
                  <li>Business term</li>
                </ul>
              </div>
              <div className="col">
                <b>Data graph</b>
                <span>Holds the instances of those classes. Examples from financial services:</span>
                <ul>
                  <li>CRM, a System</li>
                  <li>CUST_ID, a Physical data element</li>
                  <li>Client Identifier, a Business term</li>
                </ul>
              </div>
            </div>
            <div className="foot">Each graph has its own namespace and exports as its own .ttl file.</div>
          </div>

          <div className="field">
            <label htmlFor="p-name" className="strong">
              Project name
            </label>
            {input('name', 'p-name', 'input lg')}
            {error('name', 'p-name')}
          </div>

          {importing && <FilePickers files={files} onPick={pick} missing={filesMissing} />}

          <section className="card" aria-labelledby="h-ns">
            <div className="card-head">
              <h2 id="h-ns">Namespaces</h2>
              <p>
                Every term gets a web address (IRI) made of a base address, the graph's name and the term's name. The
                graph's name is also its short prefix in exported files.
              </p>
              {importing && plan && (plan.detected.base || plan.detected.dataPath || plan.detected.ontologyPath) && (
                <p className="detected">
                  Filled in from your files. Changing them changes the IRIs of your own terms, as in Settings.
                </p>
              )}
            </div>
            <div className="field">
              <label htmlFor="ns-base">Base address</label>
              {input('base', 'ns-base', 'input mono')}
              {error('base', 'ns-base')}
            </div>
            <div className="row2">
              <div className="field">
                <label htmlFor="ns-data">Data graph name</label>
                {input('dataPath', 'ns-data', 'input mono')}
                {error('dataPath', 'ns-data')}
              </div>
              <div className="field">
                <label htmlFor="ns-ont">Ontology graph name</label>
                {input('ontologyPath', 'ns-ont', 'input mono')}
                {error('ontologyPath', 'ns-ont')}
              </div>
            </div>
            <Example graphName={draft.dataPath} base={draft.base} label="Data graph" term="Client Onboarding" />
            <Example
              graphName={draft.ontologyPath}
              base={draft.base}
              label="Ontology graph"
              term="Physical data element"
            />
          </section>

          {importing && plan && <ImportSummary plan={plan} />}

          <section className="card" aria-labelledby="h-classes" hidden={importing}>
            <div className="card-head">
              <h2 id="h-classes">
                Classes you already know <span className="opt">· optional</span>
              </h2>
              <p>
                Classes are the kinds of things in your knowledge graph, such as System or Business term. Each one you
                list becomes a class in the Ontology graph, and you can pick it straight away as the class of the
                entities you add to the Data graph (CRM is a System). You can add more classes later.
              </p>
            </div>
            <div className="field">
              <label htmlFor="p-classes">One class per line</label>
              <textarea
                id="p-classes"
                className="input textarea"
                rows={5}
                placeholder={'e.g. System\nDataset\nBusiness term'}
                value={classText}
                onChange={(e) => setClassText(e.target.value)}
                spellCheck={false}
                aria-invalid={classList.errors.length > 0}
                aria-describedby={classList.errors.length ? 'p-classes-err' : undefined}
              />
              {classList.errors.length > 0 ? (
                <div id="p-classes-err" className="error">
                  {classList.errors.join(' ')}
                </div>
              ) : (
                classList.names.length > 0 && (
                  <div className="hint">
                    {classList.names
                      .map((n) => `${draft.ontologyPath.trim() || 'ontology'}:${toLocalName(n, 'entity')}`)
                      .join('  ·  ')}
                  </div>
                )
              )}
            </div>
            <p className="case-note">
              Names are case-sensitive: “Business term” and “business term” are treated as two different terms, so type
              a name the same way each time.
            </p>
          </section>

          <div className="vocab-note">
            <span>
              {BUILTIN_PREFIXES.length} standard vocabularies are built in, including rdf, rdfs, owl, xsd and skos.{' '}
              <button type="button" onClick={() => setShowVocab((v) => !v)} aria-expanded={showVocab}>
                {showVocab ? 'Hide' : 'See all'}
              </button>
            </span>
            {showVocab && (
              <table className="vocab-table">
                <thead>
                  <tr>
                    <th>Prefix</th>
                    <th>Namespace</th>
                    <th>Used for</th>
                  </tr>
                </thead>
                <tbody>
                  {BUILTIN_PREFIXES.map((b) => (
                    <tr key={b.prefix}>
                      <td className="mono">{b.prefix}</td>
                      <td className="mono">{b.namespace}</td>
                      <td>{b.usedFor}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="setup-actions">
            {/* Greyed out while something needs fixing; a click still flags empty fields (ENT-08). */}
            <button
              type="submit"
              className="btn primary lg"
              aria-disabled={Object.keys(check(draft)).length > 0 || blocked}
            >
              {importing ? 'Create project from files' : 'Create project'}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}

/** Live preview of the IRI a typed name will get, e.g. Client Onboarding → …/data/ClientOnboarding. */
export function Example({ graphName, base, label, term }: { graphName: string; base: string; label: string; term: string }) {
  const name = graphName.trim();
  return (
    <div className="example">
      <span className="k">{label}</span>
      <span>{term}</span>
      <span className="arrow">→</span>
      <span className="mono">
        {normaliseBase(base)}
        {name}/{toLocalName(term, 'entity')}
      </span>
    </div>
  );
}
