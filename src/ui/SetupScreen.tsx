// SCR-01: project setup, shown once before the main screen.

import { useState, type FormEvent } from 'react';
import { declareClasses, parseClassList } from '../core/entry';
import { toLocalName } from '../core/localName';
import {
  DEFAULT_SETUP,
  normaliseBase,
  settingsFromSetup,
  validateSetup,
  type SetupDraft,
  type SetupErrors,
  type SetupField,
} from '../core/settings';
import { BUILTIN_PREFIXES } from '../core/vocab';
import { OpenProject } from './OpenProject';
import { useApp } from './store';

export function SetupScreen() {
  const createProject = useApp((s) => s.createProject);
  // After "Start a new project", the old base address and graph names are kept (GEN-10).
  const carried = useApp((s) => s.setupDraft);
  const [draft, setDraft] = useState<SetupDraft>(() => carried ?? DEFAULT_SETUP);
  const [errors, setErrors] = useState<SetupErrors>({});
  const [showVocab, setShowVocab] = useState(false);
  const [classText, setClassText] = useState('');
  const [opening, setOpening] = useState(false);
  const classList = parseClassList(classText);

  // Field checks run as you type; an empty field is only flagged on submit.
  const update = (field: SetupField, value: string) => {
    const next = { ...draft, [field]: value };
    setDraft(next);
    const found = validateSetup(next);
    setErrors((e) => {
      const out: SetupErrors = {};
      for (const f of Object.keys(next) as SetupField[]) {
        const filled = next[f].trim() !== '';
        if (found[f] && (filled || (f !== field && e[f]))) out[f] = found[f];
      }
      return out;
    });
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const found = validateSetup(draft);
    setErrors(found);
    if (Object.keys(found).length > 0 || classList.errors.length > 0) return;
    const settings = settingsFromSetup(draft);
    createProject(settings, declareClasses(classList.names, settings));
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
        <div className="setup-col">
          <p className="intro">
            Triplet helps you design knowledge graphs. Build RDF triples in a visual, interactive way: type a subject, a
            predicate and an object, see them as a list and a graph, and export Turtle files you can load into a graph
            database later. It is meant for learning and quick development, not as a production tool.
          </p>

          <div className="stack-8">
            <h1>Set up your project</h1>
            <p className="lead">
              {opening ? (
                <>Open a project file you downloaded earlier to carry on where you left off.</>
              ) : (
                <>
                  Name your project and choose where your terms will live. The defaults work fine to start with, and you
                  can change any of this later in Settings.
                </>
              )}
            </p>
          </div>

          {/* PRJ-03: or pick up where you left off, from a project file. */}
          <div className="start-choice">
            <div className="seg" role="group" aria-label="How to start">
              <button type="button" aria-pressed={!opening} onClick={() => setOpening(false)}>
                New project
              </button>
              <button type="button" aria-pressed={opening} onClick={() => setOpening(true)}>
                Open a project file
              </button>
            </div>
            <span className="start-note">
              {opening ? 'Pick up where you left off, from a file saved on the Export screen.' : 'Start from scratch.'}
            </span>
          </div>

          {opening ? (
            <OpenProject />
          ) : (
            <form onSubmit={submit} noValidate className="stack-28">
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

              <section className="card" aria-labelledby="h-ns">
                <div className="card-head">
                  <h2 id="h-ns">Namespaces</h2>
                  <p>
                    Every term gets a web address (IRI) made of a base address, the graph's name and the term's name. The
                    graph's name is also its short prefix in exported files.
                  </p>
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

              <section className="card" aria-labelledby="h-classes">
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
                  aria-disabled={Object.keys(validateSetup(draft)).length > 0 || classList.errors.length > 0}
                >
                  Create project
                </button>
              </div>
            </form>
          )}
        </div>
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
