// SCR-04: per-graph Turtle preview, editable file names, prefixes declared,
// validity check, and downloads (GRAPH-05, FLOW-05, PFX-03).

import { useMemo, useState } from 'react';
import { defaultFileName, exportGraph, type ExportResult } from '../core/export';
import type { GraphName, ProjectSettings } from '../core/types';
import { BackIcon, CheckIcon, DownloadIcon } from './icons';
import { useApp } from './store';

const TITLES: Record<GraphName, string> = { data: 'Data graph', ontology: 'Ontology graph' };

function withTtl(name: string, graph: GraphName, projectName: string): string {
  const trimmed = name.trim();
  if (!trimmed) return defaultFileName(projectName, graph);
  return /\.ttl$/i.test(trimmed) ? trimmed : `${trimmed}.ttl`;
}

function download(fileName: string, turtle: string) {
  const url = URL.createObjectURL(new Blob([turtle], { type: 'text/turtle;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser a moment to start the download before releasing the file.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ExportScreen({ settings }: { settings: ProjectSettings }) {
  const triples = useApp((s) => s.triples);
  const setScreen = useApp((s) => s.setScreen);
  const results = useMemo(
    () => ({ data: exportGraph(triples, settings, 'data'), ontology: exportGraph(triples, settings, 'ontology') }),
    [triples, settings],
  );
  const [names, setNames] = useState<Record<GraphName, string>>({
    data: defaultFileName(settings.name, 'data'),
    ontology: defaultFileName(settings.name, 'ontology'),
  });

  const downloadable = (g: GraphName) => results[g].valid && results[g].storeTripleCount > 0;
  const downloadGraph = (g: GraphName) => download(withTtl(names[g], g, settings.name), results[g].turtle);
  const graphs = (['data', 'ontology'] as const).filter(downloadable);

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-title">
          <div className="brand">Triplet</div>
          <div className="project-name">{settings.name}</div>
        </div>
        <button type="button" className="btn quiet sm" onClick={() => setScreen('main')}>
          <BackIcon />
          Back to editor
        </button>
      </header>

      <main className="export-main">
        <div className="export-head">
          <div className="stack-8" style={{ gap: 6 }}>
            <h1>Export</h1>
            <p>Each graph downloads as its own Turtle file, ready to upload to your graph database.</p>
          </div>
          <button
            type="button"
            className="btn primary lg"
            disabled={graphs.length === 0}
            // Space the downloads out: browsers may drop a second one started in the same moment.
            onClick={() => graphs.forEach((g, i) => setTimeout(() => downloadGraph(g), i * 400))}
          >
            {graphs.length > 0 && <DownloadIcon />}
            {graphs.length === 1 ? `Download ${TITLES[graphs[0]]}` : 'Download both'}
          </button>
        </div>

        <div className="export-grid">
          {(['data', 'ontology'] as const).map((g) => (
            <GraphExport
              key={g}
              graph={g}
              result={results[g]}
              fileName={names[g]}
              onFileName={(v) => setNames((n) => ({ ...n, [g]: v }))}
              onDownload={() => downloadGraph(g)}
              canDownload={downloadable(g)}
            />
          ))}
        </div>
      </main>
    </div>
  );
}

function GraphExport(props: {
  graph: GraphName;
  result: ExportResult;
  fileName: string;
  onFileName: (v: string) => void;
  onDownload: () => void;
  canDownload: boolean;
}) {
  const { graph, result, fileName, onFileName, onDownload, canDownload } = props;
  const id = `x-${graph}`;
  const empty = result.storeTripleCount === 0;
  return (
    <section className="export-card" aria-labelledby={id}>
      <div className="export-card-head">
        <div className="top">
          <h2 id={id}>{TITLES[graph]}</h2>
          {empty ? (
            <span className="validity none">No triples yet</span>
          ) : result.valid ? (
            <span className="validity">
              <CheckIcon />
              Valid Turtle
            </span>
          ) : (
            <span className="validity bad" role="alert">
              Not valid Turtle
            </span>
          )}
        </div>
        <div className="field">
          <label htmlFor={`${id}-file`}>File name</label>
          <div className="file-row">
            <input
              id={`${id}-file`}
              className="input mono"
              value={fileName}
              spellCheck={false}
              onChange={(e) => onFileName(e.target.value)}
            />
            <button type="button" className="btn" disabled={!canDownload} onClick={onDownload}>
              Download .ttl
            </button>
          </div>
        </div>
        <div className="chips">
          <span className="k">Prefixes declared</span>
          {result.prefixes.length === 0 && <span className="note">none</span>}
          {result.prefixes.map((p) => (
            <span key={p} className="chip">
              {p}
            </span>
          ))}
          {result.prefixes.length > 0 && <span className="note">only the ones used</span>}
        </div>
      </div>
      {!result.valid && result.error && <p className="export-error">{result.error}</p>}
      <div className="preview-label" id={`${id}-preview-label`}>
        Preview
      </div>
      {empty ? (
        <div className="preview empty-preview">
          Nothing to export yet. Add triples to the {TITLES[graph]} and they will appear here.
        </div>
      ) : (
        <pre className="preview" tabIndex={0} aria-labelledby={`${id}-preview-label`}>
          {result.turtle}
        </pre>
      )}
    </section>
  );
}
