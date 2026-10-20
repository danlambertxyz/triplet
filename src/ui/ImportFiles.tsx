// Milestone 8: "Start from Turtle files" on the setup screen (IMP-02, IMP-03).
// There is no design for import; it follows the setup screen's cards.

import { useRef } from 'react';
import type { ImportNote, ImportPlan, ParseError, ParsedFile } from '../core/import';
import type { GraphName } from '../core/types';

export type PickedFile = { fileName: string; result: ParsedFile | ParseError };

const GRAPH_TITLE: Record<GraphName, string> = { data: 'Data graph', ontology: 'Ontology graph' };

/** IMP-02: one optional file picker per graph; the user decides which graph a file goes into. */
export function FilePickers({
  files,
  onPick,
  missing,
}: {
  files: Partial<Record<GraphName, PickedFile>>;
  onPick: (graph: GraphName, file: File | null) => void;
  missing: boolean;
}) {
  return (
    <section className="card" aria-labelledby="h-files">
      <div className="card-head">
        <h2 id="h-files">Turtle files</h2>
        <p>
          Choose the .ttl files to start from, such as the two files Triplet exported. Pick the graph each file goes into:
          Triplet doesn't guess. You need at least one file.
        </p>
      </div>
      <div className="row2">
        {(['data', 'ontology'] as const).map((g) => (
          <FilePicker key={g} graph={g} picked={files[g]} onPick={(f) => onPick(g, f)} />
        ))}
      </div>
      {missing && (
        <div className="error" id="files-err">
          Choose a Data graph file, an Ontology graph file, or both.
        </div>
      )}
    </section>
  );
}

function FilePicker({ graph, picked, onPick }: { graph: GraphName; picked?: PickedFile; onPick: (f: File | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const id = `file-${graph}`;
  const error = picked && 'message' in picked.result ? picked.result : undefined;
  return (
    <div className="field file-field">
      <label htmlFor={id}>
        {GRAPH_TITLE[graph]} file <span className="opt">· optional</span>
      </label>
      <div className="file-row">
        <input
          ref={input}
          id={id}
          type="file"
          accept=".ttl,.turtle,.nt,text/turtle"
          className="file-input"
          onChange={(e) => onPick(e.target.files?.[0] ?? null)}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-err` : undefined}
        />
        {picked && (
          <button
            type="button"
            className="btn xs quiet"
            onClick={() => {
              if (input.current) input.current.value = '';
              onPick(null);
            }}
            aria-label={`Remove the ${GRAPH_TITLE[graph]} file`}
          >
            Remove
          </button>
        )}
      </div>
      {error && (
        <div className="error" id={`${id}-err`}>
          <span>
            Not valid Turtle, so it can't be imported. {error.message}
          </span>
        </div>
      )}
    </div>
  );
}

const ROLE: Record<ImportPlan['prefixes'][number]['role'], string> = {
  data: 'Data graph',
  ontology: 'Ontology graph',
  'built-in': 'built in',
  custom: 'custom prefix',
  unused: 'not used',
};

/** IMP-03: what will be imported and what is left out, before anything is created. */
export function ImportSummary({ plan }: { plan: ImportPlan }) {
  const graphs = (['data', 'ontology'] as const).filter((g) => plan.perGraph[g]);
  const section = (kind: ImportNote['kind'], title: string, lead: string) => {
    const notes = plan.notes.filter((n) => n.kind === kind);
    if (notes.length === 0) return null;
    return (
      <div className="import-notes">
        <h3>{title}</h3>
        <p>{lead}</p>
        <ul>
          {notes.map((n) => (
            <li key={`${n.graph}|${n.what}`}>
              <div className="what">
                <b>{n.what}</b> <span className="count">· {n.count}</span>{' '}
                <span className="where">in the {GRAPH_TITLE[n.graph]}</span>
              </div>
              <div className="why">{n.why}</div>
              {n.example && <div className="example-line mono">{n.example}</div>}
            </li>
          ))}
        </ul>
      </div>
    );
  };
  const leftOut = plan.notes.some((n) => n.kind !== 'handled');
  return (
    <section className="card" aria-labelledby="h-summary">
      <div className="card-head">
        <h2 id="h-summary">What will be imported</h2>
        <p>Nothing is created until you click “Create project from files”.</p>
      </div>
      <table className="vocab-table import-counts">
        <thead>
          <tr>
            <th>Graph</th>
            <th>File</th>
            <th>Triples in the file</th>
            <th>Triples imported</th>
          </tr>
        </thead>
        <tbody>
          {graphs.map((g) => (
            <tr key={g}>
              <td>{GRAPH_TITLE[g]}</td>
              <td className="mono">{plan.perGraph[g]!.fileName}</td>
              <td>{plan.perGraph[g]!.fileTriples}</td>
              <td>{plan.perGraph[g]!.stored}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="import-why">
        Triplet stores fewer triples than the file holds because it writes some of them itself on export: names
        (rdfs:label), types it works out from use, and either/or domains and ranges. They come back when you export.
      </p>
      {plan.prefixes.length > 0 && (
        <div className="chips">
          <span className="k">Prefixes found</span>
          {plan.prefixes.map((p) => (
            <span key={`${p.prefix}|${p.namespace}`} className="chip" title={p.namespace}>
              {p.prefix}: <span className="role">{p.renamedTo ? `custom prefix, renamed ${p.renamedTo}:` : ROLE[p.role]}</span>
            </span>
          ))}
        </div>
      )}
      {section('left-out', 'Left out', "Triplet can't show these yet, so they aren't imported.")}
      {section('simplified', 'Simplified', 'Imported in a form Triplet can show.')}
      {section('handled', 'Handled for you', 'Nothing is lost here.')}
      {!leftOut && <p className="import-ok">Everything in the files can be imported.</p>}
      <p className="import-why">
        A .ttl file holds only triples, so accepted exceptions, pairs kept as different things and where you dragged
        the cards aren't restored.
      </p>
    </section>
  );
}
