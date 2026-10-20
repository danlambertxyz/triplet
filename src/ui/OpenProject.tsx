// PRJ-03, PRJ-04: "Open a project file" on the setup screen. There is no
// design for it; it follows the setup screen's cards.

import { useRef, useState, type FormEvent } from 'react';
import { readProjectFile, type ReadResult } from '../core/projectFile';
import { activeCustomPrefixes } from '../core/terms';
import { useApp } from './store';

type Picked = { fileName: string; result: ReadResult };

export function OpenProject() {
  const openProject = useApp((s) => s.openProject);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [missing, setMissing] = useState(false);
  // The latest pick wins, even if an earlier file is still being read.
  const latest = useRef(0);

  const pick = async (file: File | undefined) => {
    setMissing(false);
    const n = ++latest.current;
    if (!file) {
      setPicked(null);
      return;
    }
    const result = readProjectFile(await file.text());
    if (n === latest.current) setPicked({ fileName: file.name, result });
  };

  const project = picked && 'project' in picked.result ? picked.result : undefined;
  const error = picked && 'error' in picked.result ? picked.result.error : undefined;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!picked) setMissing(true);
    if (project) openProject(project.project);
  };

  const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  const p = project?.project;
  const saved = project?.savedAt ? new Date(project.savedAt) : undefined;
  return (
    <form onSubmit={submit} noValidate className="stack-28">
      <section className="card" aria-labelledby="h-open">
        <div className="card-head">
          <h2 id="h-open">Project file</h2>
          <p>
            Choose a .triplet.json file downloaded from Triplet's Export screen. It brings back the whole project: both
            graphs, your settings and the decisions you made.
          </p>
        </div>
        <div className="field">
          <label htmlFor="project-file">Project file</label>
          <input
            id="project-file"
            type="file"
            accept=".json,application/json"
            className="file-input"
            onChange={(e) => pick(e.target.files?.[0])}
            aria-invalid={!!error || missing}
            aria-describedby={error || missing ? 'project-file-err' : undefined}
          />
          {(error || missing) && (
            <div className="error" id="project-file-err">
              {error ?? 'Choose a project file.'}
            </div>
          )}
        </div>
      </section>

      {p && (
        <section className="card" aria-labelledby="h-holds">
          <div className="card-head">
            <h2 id="h-holds">What the file holds</h2>
            <p>Nothing changes until you click “Open project”.</p>
          </div>
          <table className="vocab-table project-facts">
            <tbody>
              <tr>
                <th scope="row">Project</th>
                <td>{p.settings.name}</td>
              </tr>
              {saved && !Number.isNaN(saved.getTime()) && (
                <tr>
                  <th scope="row">Saved</th>
                  <td>{saved.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</td>
                </tr>
              )}
              <tr>
                <th scope="row">Data graph</th>
                <td>
                  {count(p.triples.filter((t) => t.graph === 'data').length, 'triple')} ·{' '}
                  <span className="mono">{p.settings.data.namespace}</span>
                </td>
              </tr>
              <tr>
                <th scope="row">Ontology graph</th>
                <td>
                  {count(p.triples.filter((t) => t.graph === 'ontology').length, 'triple')} ·{' '}
                  <span className="mono">{p.settings.ontology.namespace}</span>
                </td>
              </tr>
              <tr>
                <th scope="row">Mode</th>
                <td>{p.mode === 'validate' ? 'Validate' : 'Sketch'}</td>
              </tr>
              <tr>
                <th scope="row">Decisions</th>
                <td>
                  {count(activeCustomPrefixes(p.settings).length, 'custom prefix', 'custom prefixes')} ·{' '}
                  {count(p.distinctPairs.length, 'pair kept apart', 'pairs kept apart')} ·{' '}
                  {count(p.exceptions.length, 'accepted exception')}
                </td>
              </tr>
            </tbody>
          </table>
          <p className="project-note">Undo history isn't saved in the file, so Undo starts fresh.</p>
        </section>
      )}

      <div className="setup-actions">
        {/* Greyed out until a project file is read; a click still says what's missing (ENT-08). */}
        <button type="submit" className="btn primary lg" aria-disabled={!project}>
          Open project
        </button>
      </div>
    </form>
  );
}
