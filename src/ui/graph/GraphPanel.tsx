// The graph view (FLOW-03): React Flow canvas laid out by dagre, with the
// toolbar (FLOW-08), class legend (TYPE-04), Literals switch (LIT-04), the
// Both view's Ontology area and class links (GRAPH-03) and the selection bar
// for a node or, since 16 Oct 2026, an arrow (FLOW-07). The selection's
// triples are highlighted in the list. Everything shown is derived from the triple store; the only
// thing kept here is where the user dragged nodes (FLOW-06).

import '@xyflow/react/dist/base.css';
import {
  applyNodeChanges,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type NodeChange,
} from '@xyflow/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Point, Route } from '../../core/graphLayout';
import { legendClasses, type EdgeModel, type NodeModel, type ValuesMode } from '../../core/graphModel';
import {
  classFocus,
  dragKey,
  focusFor,
  instancesOf,
  layoutBands,
  nodeIndex,
  placeBands,
  pushApart,
  type Band,
  type Box,
  type Focus,
  type GraphView,
} from '../../core/graphView';
import type { Conformance, Flag } from '../../core/conformance';
import { canRename, termUses } from '../../core/edit';
import { findDuplicates, setsWithTerm } from '../../core/duplicates';
import { collectTerms, objectText, prefixedName, sourceOf, termKey } from '../../core/terms';
import type { GraphName, IriTerm, ProjectSettings, Triple } from '../../core/types';
import { RDF_TYPE } from '../../core/vocab';
import { FlagItem } from '../FlagItem';
import { PanelCloseIcon, PanelOpenIcon, PencilIcon } from '../icons';
import { InfoPopover } from '../InfoPopover';
import { useApp, type View } from '../store';
import { useConformance } from '../useConformance';
import { EmptyGraph } from './EmptyGraph';
import { edgeTypes, FlagsContext, nodeTypes, type Emphasis, type FlagState, type FlowEdge, type FlowNode } from './GraphNodes';

const VIEWS: [View, string][] = [
  ['data', 'Data'],
  ['ontology', 'Ontology'],
  ['both', 'Both'],
];

const VALUE_MODES: [ValuesMode, string][] = [
  ['separate', 'Separate'],
  ['onNode', 'On node'],
];

const GRAPH_TITLES = { data: 'Data graph', ontology: 'Ontology graph' } as const;
const FIT = { padding: 0.12, maxZoom: 1.2, duration: 200 };
const FILL = { position: 'absolute', inset: 0 } as const;
const MARKER = { type: MarkerType.ArrowClosed, color: '#8a8a8a', width: 14, height: 14 };

export function GraphPanel({ settings }: { settings: ProjectSettings }) {
  return (
    <ReactFlowProvider>
      <GraphPanelInner settings={settings} />
    </ReactFlowProvider>
  );
}

function flowEdge(e: EdgeModel, bend: number, emphasis: Emphasis, colour?: string, route?: FlowRoute): FlowEdge {
  return {
    id: e.id,
    type: 'floating',
    source: e.source,
    target: e.target,
    markerEnd: e.kind === 'type' ? { ...MARKER, color: colour ?? MARKER.color } : MARKER,
    selectable: false,
    focusable: false,
    data: { labels: e.labels, kind: e.kind, tripleIds: e.tripleIds, bend, emphasis, colour, route },
  };
}

type FlowRoute = Route & { from: Point; to: Point };

function toFlow(view: GraphView, onFullView: (graph: GraphName) => void): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];
  for (const band of view.bands) {
    if (band.area) {
      nodes.push({
        id: 'area#ontology',
        type: 'area',
        position: { x: band.area.x, y: band.area.y },
        data: { width: band.area.width, height: band.area.height, onFullView: () => onFullView('ontology') },
        draggable: false,
        selectable: false,
        focusable: false,
        zIndex: -1,
      });
    } else if (band.labelAt) {
      nodes.push({
        id: `title#${band.graph}`,
        type: 'title',
        position: band.labelAt,
        data: { text: GRAPH_TITLES[band.graph], onFullView: () => onFullView(band.graph) },
        draggable: false,
        selectable: false,
        focusable: false,
        zIndex: -1,
      });
    }
    for (const m of band.model.nodes) {
      const common = { id: m.id, position: band.positions.get(m.id)!, ariaLabel: ariaLabel(m) };
      if (m.kind === 'entity') nodes.push({ ...common, type: 'entity', data: { model: m, offset: band.offset } });
      else nodes.push({ ...common, type: 'value', data: { model: m, offset: band.offset } });
    }
    const pairs = new Set(band.model.edges.map((e) => `${e.source}->${e.target}`));
    for (const e of band.model.edges) {
      // An arrow follows its layout path while both its cards are where the layout put them (18 Oct 2026).
      const r = band.routes.get(e.id);
      const route = r && { ...r, from: band.positions.get(e.source)!, to: band.positions.get(e.target)! };
      edges.push(flowEdge(e, pairs.has(`${e.target}->${e.source}`) ? 7 : 0, 'normal', undefined, route));
    }
  }
  return { nodes, edges };
}

/** Both view: keeps a card within its own graph's area. */
function clampX(band: Band, x: number, width: number): number {
  if (band.minX !== undefined) x = Math.max(x, band.minX);
  if (band.maxX !== undefined) x = Math.min(x, band.maxX - width);
  return x;
}

/** Both view: fades what isn't related to the selected node and adds its class links. */
function withFocus(edges: FlowEdge[], focus: Focus | undefined, colour: string | undefined): FlowEdge[] {
  if (!focus) return edges;
  const out: FlowEdge[] = edges.map((e) => {
    const emphasis: Emphasis = focus.highlighted.has(e.id) ? 'strong' : focus.edges.has(e.id) ? 'normal' : 'faded';
    return emphasis === e.data!.emphasis ? e : { ...e, data: { ...e.data!, emphasis } };
  });
  for (const t of focus.typeLinks) out.push(flowEdge(t, 0, 'normal', colour));
  return out;
}

function ariaLabel(m: NodeModel): string {
  if (m.kind === 'value') return `Literal ${m.literal.value} of ${m.subject.label}`;
  return m.classLabels.length ? `${m.label}, ${m.classLabels.join(', ')}` : m.label;
}

function GraphPanelInner({ settings }: { settings: ProjectSettings }) {
  const triples = useApp((s) => s.triples);
  const view = useApp((s) => s.view);
  const setView = useApp((s) => s.setView);
  const valuesMode = useApp((s) => s.valuesMode);
  const setValuesMode = useApp((s) => s.setValuesMode);
  const dragged = useApp((s) => s.nodePositions[s.valuesMode]);
  const setNodePositions = useApp((s) => s.setNodePositions);
  const collapsed = useApp((s) => s.panelCollapsed);
  const setCollapsed = useApp((s) => s.setPanelCollapsed);
  const { fitView, zoomIn, zoomOut } = useReactFlow();
  const conformance = useConformance();
  // CHK-06: each flagged triple's state, for markers on arrows and on-node rows.
  const flagStates = useMemo(() => {
    const out = new Map<string, FlagState>();
    for (const [id, fs] of conformance?.byTriple ?? []) out.set(id, fs.some((f) => !f.accepted) ? 'open' : 'accepted');
    return out;
  }, [conformance]);

  // Layout only re-runs when the triples or settings change, not on every drag.
  const autoBands = useMemo(() => layoutBands(triples, view, valuesMode), [triples, view, valuesMode]);
  const graphView = useMemo(() => placeBands(autoBands, dragged), [autoBands, dragged]);
  const derived = useMemo(() => toFlow(graphView, setView), [graphView, setView]);

  // React Flow needs to hold the nodes while they are dragged; they are
  // re-derived whenever the store changes, keeping what React Flow measured.
  const [nodes, setNodes] = useState<FlowNode[]>(derived.nodes);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  useEffect(() => {
    setNodes((prev) => {
      const measured = new Map(prev.map((n) => [n.id, n.measured]));
      return derived.nodes.map((n) => ({ ...n, measured: measured.get(n.id), selected: n.id === selectedRef.current }));
    });
  }, [derived]);

  const onNodesChange = useCallback((changes: NodeChange<FlowNode>[]) => {
    setNodes((ns) => applyNodeChanges(changes, ns));
    for (const c of changes) {
      if (c.type === 'select' && c.selected) {
        setSelectedId(c.id);
        setSelectedEdgeId(null);
      }
    }
    if (changes.some((c) => c.type === 'select') && !changes.some((c) => c.type === 'select' && c.selected)) {
      setSelectedId(null);
    }
  }, []);

  // On drop: keep the node in its own area (Both view), move any cards it
  // landed on out of the way, and save every position that changed (FLOW-06).
  const index = useMemo(() => nodeIndex(graphView), [graphView]);
  const onNodeDragStop = useCallback(
    (_: unknown, __: FlowNode, moved: FlowNode[]) => {
      const boxes = new Map<string, Box & { band: string }>();
      for (const n of nodes) {
        const at = index.get(n.id);
        if (!at) continue;
        const size = at.band.sizes.get(n.id)!;
        const width = n.measured?.width ?? size.width;
        const height = n.measured?.height ?? size.height;
        const { x, y } = (moved.find((m) => m.id === n.id) ?? n).position;
        boxes.set(n.id, { x: clampX(at.band, x, width), y, width, height, band: at.band.graph });
      }
      const out: Record<string, Point> = {};
      // Pushed cards are kept in their own area too.
      const save = (id: string, p: Point) => {
        const { band } = index.get(id)!;
        const x = clampX(band, p.x, boxes.get(id)!.width);
        out[dragKey(view, id)] = { x: Math.round(x - band.offset.x), y: Math.round(p.y - band.offset.y) };
      };
      const droppedIds = moved.map((m) => m.id).filter((id) => boxes.has(id));
      for (const id of droppedIds) save(id, boxes.get(id)!);
      // Each graph keeps to its own area, so cards only push cards of the same graph.
      for (const graph of new Set(droppedIds.map((id) => boxes.get(id)!.band))) {
        const same = new Map([...boxes].filter(([, b]) => b.band === graph));
        for (const [id, p] of pushApart(same, droppedIds)) save(id, p);
      }
      // The view is arranged by hand now: every other card keeps its place too,
      // so new cards go beside the cards they link to (agreed 18 Oct 2026).
      for (const [id, b] of boxes) if (!(dragKey(view, id) in out) && !(dragKey(view, id) in dragged)) save(id, b);
      setNodePositions(valuesMode, out);
    },
    [nodes, index, view, dragged, setNodePositions, valuesMode],
  );

  // Fit the graph when the view, the Values setting or the panel width changes, or a node is added.
  const seen = useRef<{ key: string; ids: Set<string>; pending: boolean }>({ key: '', ids: new Set(), pending: false });
  useEffect(() => {
    const key = `${view}|${valuesMode}|${collapsed}`;
    const ids = new Set(derived.nodes.map((n) => n.id));
    // A renamed card has a new id but isn't new, so the view stays put (18 Oct 2026).
    const renamed = useApp.getState().lastRename?.to;
    const grew = [...ids].some((id) => !seen.current.ids.has(id) && !(renamed && id.endsWith(`#${renamed}`)));
    const due = seen.current.pending || grew || key !== seen.current.key;
    seen.current = { key, ids, pending: due };
    if (!due) return;
    // Wait two frames so React Flow has measured new nodes; if this run is
    // superseded first, the next run still fits (pending stays true).
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        seen.current.pending = false;
        void fitView(FIT);
      });
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [derived, view, valuesMode, collapsed, fitView]);

  const selected = useMemo(() => {
    for (const b of graphView.bands) {
      const m = b.model.nodes.find((n) => n.id === selectedId);
      if (m) return m;
    }
    return undefined;
  }, [graphView, selectedId]);

  // Forget a selection whose node has gone (its triples were deleted), but
  // follow a node that was renamed, since its id comes from its name.
  const lastRename = useApp((s) => s.lastRename);
  useEffect(() => {
    if (!selectedId || selected) return;
    const from = lastRename?.from.find((k) => selectedId.endsWith(`#${k}`));
    const next = lastRename && from ? selectedId.slice(0, -from.length) + lastRename.to : null;
    const keep = next && index.has(next) ? next : null;
    setSelectedId(keep);
    if (keep) setNodes((ns) => ns.map((n) => (n.id === keep ? { ...n, selected: true } : n)));
  }, [selectedId, selected, lastRename, index]);

  // Selecting an arrow: its details replace the node's (FLOW-07, extended 16 Oct 2026).
  const selectEdge = useCallback((id: string) => {
    setSelectedEdgeId(id);
    setSelectedId(null);
    setNodes((ns) => ns.map((n) => (n.selected ? { ...n, selected: false } : n)));
  }, []);
  const selectedEdge = useMemo(() => {
    for (const b of graphView.bands) {
      const e = b.model.edges.find((x) => x.id === selectedEdgeId);
      if (e) return e;
    }
    return undefined;
  }, [graphView, selectedEdgeId]);
  useEffect(() => {
    if (selectedEdgeId && !selectedEdge) setSelectedEdgeId(null);
  }, [selectedEdgeId, selectedEdge]);

  // A class picked in the legend shows its cards (Data and Both views, agreed 18 Oct 2026). Not saved.
  const [legendKey, setLegendKey] = useState<string | null>(null);
  const pickLegend = (key: string) => {
    setLegendKey((k) => (k === key ? null : key));
    setSelectedId(null);
    setSelectedEdgeId(null);
    setNodes((ns) => ns.map((n) => (n.selected ? { ...n, selected: false } : n)));
  };
  useEffect(() => {
    if (selectedId || selectedEdgeId) setLegendKey(null);
  }, [selectedId, selectedEdgeId]);
  useEffect(() => setLegendKey(null), [view]);
  const legendCards = useMemo(() => {
    const data = graphView.bands.find((b) => b.graph === 'data');
    return legendKey === null || !data ? undefined : instancesOf(data.model, triples, legendKey);
  }, [graphView, legendKey, triples]);
  const legendTerms = useMemo(() => {
    if (!legendCards) return undefined;
    const ids = new Set(legendCards);
    const data = graphView.bands.find((b) => b.graph === 'data');
    return new Set(
      data?.model.nodes.flatMap((n) => (n.kind === 'entity' && ids.has(n.id) ? [termKey(n.term)] : [])) ?? [],
    );
  }, [graphView, legendCards]);

  // The triples behind the selection, highlighted in the list.
  const setHighlighted = useApp((s) => s.setHighlighted);
  useEffect(() => {
    let ids: string[] = [];
    if (selectedEdge) ids = selectedEdge.tripleIds;
    else if (selected?.kind === 'value') ids = [selected.tripleId];
    else if (selected) ids = termUses(triples, selected.term).all.map((t) => t.id);
    else if (legendKey !== null && legendTerms) {
      // A class's cards: their type triples; cards with no class: all their triples.
      const typeKey = termKey(RDF_TYPE);
      ids = triples
        .filter((t) => t.graph === 'data' && legendTerms.has(termKey(t.s)) && (!legendKey || termKey(t.p) === typeKey))
        .map((t) => t.id);
    }
    setHighlighted(ids);
  }, [selected, selectedEdge, triples, setHighlighted, legendKey, legendTerms]);
  useEffect(() => () => setHighlighted([]), [setHighlighted]);

  const focus = useMemo(
    () =>
      selectedId
        ? focusFor(graphView, selectedId, triples)
        : legendKey !== null
          ? classFocus(graphView, legendKey, triples, legendCards)
          : undefined,
    [graphView, selectedId, legendKey, triples, legendCards],
  );
  const selectedColour = selected?.kind === 'entity' ? selected.colour : undefined;
  const edges = useMemo(
    () =>
      withFocus(derived.edges, focus, selectedColour).map((e) =>
        // The Both view's dashed class links aren't triples, so they aren't selectable.
        e.data!.kind === 'type'
          ? e
          : {
              ...e,
              // The selected arrow, or the selected card's arrows, are drawn above the rest (18 Oct 2026).
              zIndex: e.id === selectedEdgeId || e.data!.emphasis === 'strong' ? 1 : undefined,
              data: { ...e.data!, selected: e.id === selectedEdgeId, onSelect: selectEdge },
            },
      ),
    [derived.edges, focus, selectedColour, selectedEdgeId, selectEdge],
  );
  const shownNodes = useMemo(
    () =>
      focus
        ? nodes.map((n) =>
            n.type === 'entity' || n.type === 'value'
              ? { ...n, className: focus.nodes.has(n.id) ? undefined : 'faded' }
              : n,
          )
        : nodes,
    [nodes, focus],
  );

  // Tidy layout (agreed 18 Oct 2026): forgets where this view's cards were dragged, as an undoable step.
  const tidyLayout = useApp((s) => s.tidyLayout);
  const tidyKeys = useMemo(
    () =>
      graphView.bands
        .flatMap((b) => b.model.nodes.map((n) => dragKey(view, n.id)))
        .filter((k) => k in dragged),
    [graphView, view, dragged],
  );
  const tidy = () => {
    tidyLayout(valuesMode, tidyKeys);
    requestAnimationFrame(() => requestAnimationFrame(() => void fitView(FIT)));
  };

  const showData = view !== 'ontology';
  const showOntologyLegend = view !== 'data';
  const dataBand = graphView.bands.find((b) => b.graph === 'data');
  const legend = dataBand ? legendClasses(dataBand.model) : [];
  const hasValueNodes = graphView.bands.some((b) => b.model.nodes.some((n) => n.kind === 'value'));
  const noTriples = triples.length === 0;
  const empty = graphView.bands.every((b) => b.model.nodes.length === 0);

  return (
    <>
      <div className="graph-top">
        <div className="graph-head">
          <div className="graph-head-left">
            <button
              type="button"
              className="icon-btn sm"
              aria-expanded={!collapsed}
              aria-controls="entry-panel"
              aria-label={collapsed ? 'Show entry form and triples' : 'Hide entry form and triples'}
              title={collapsed ? 'Show entry form and triples' : 'Hide entry form and triples'}
              onClick={() => setCollapsed(!collapsed)}
            >
              {collapsed ? <PanelOpenIcon /> : <PanelCloseIcon />}
            </button>
            <h2 className="t1">Graph</h2>
            <GraphHelp />
            {/* Filters the graph only; the triple list always shows both graphs (FLOW-02). */}
            <div className="seg" role="group" aria-label="Graph to show">
              {VIEWS.map(([v, label]) => (
                <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          {/* FLOW-08: these controls keep a fixed position at the right. */}
          <div className={`graph-tools${noTriples ? ' off' : ''}`}>
            <span className="tool-label" id="values-label">
              Literals
            </span>
            <div className="seg small" role="group" aria-labelledby="values-label">
              {VALUE_MODES.map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={valuesMode === m}
                  onClick={() => setValuesMode(m)}
                  disabled={noTriples}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="tidy-btn"
              onClick={tidy}
              disabled={noTriples || tidyKeys.length === 0}
              title={tidyKeys.length ? 'Lay the cards out again, compactly. You can undo this.' : 'Already laid out automatically'}
            >
              Tidy layout
            </button>
            <div className="zoom-group">
              <button
                type="button"
                aria-label="Zoom out"
                title="Zoom out"
                onClick={() => void zoomOut({ duration: 150 })}
                disabled={noTriples}
              >
                −
              </button>
              <button type="button" className="fit" onClick={() => void fitView(FIT)} disabled={noTriples}>
                Fit
              </button>
              <button
                type="button"
                aria-label="Zoom in"
                title="Zoom in"
                onClick={() => void zoomIn({ duration: 150 })}
                disabled={noTriples}
              >
                +
              </button>
            </div>
          </div>
        </div>
        {!noTriples && (legend.length > 0 || showOntologyLegend || (hasValueNodes && valuesMode === 'separate')) && (
          <ul className="legend" aria-label="Legend">
            {showData &&
              legend.map((l) => (
                <li key={l.key}>
                  {/* Picking a class shows its cards and fades the rest (18 Oct 2026). */}
                  <button
                    type="button"
                    className="legend-btn"
                    aria-pressed={legendKey === l.key}
                    title={legendKey === l.key ? 'Show all cards' : `Show the “${l.label}” cards`}
                    onClick={() => pickLegend(l.key)}
                  >
                    <span className="dot" style={{ background: l.colour }} aria-hidden="true" />
                    {l.label}
                  </button>
                </li>
              ))}
            {hasValueNodes && valuesMode === 'separate' && (
              <li>
                <span className="pill" aria-hidden="true" />
                Literal
              </li>
            )}
            {showOntologyLegend && (
              <li>
                <span className="ring" aria-hidden="true" />
                Ontology class
              </li>
            )}
          </ul>
        )}
      </div>

      <div className="graph-area">
        {noTriples ? (
          <EmptyGraph />
        ) : (
          <FlagsContext.Provider value={flagStates}>
          <ReactFlow<FlowNode, FlowEdge>
            nodes={shownNodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onNodeDragStop={onNodeDragStop}
            onPaneClick={() => {
              setSelectedId(null);
              setSelectedEdgeId(null);
              setLegendKey(null);
            }}
            onEdgeClick={(_, edge) => edge.data?.onSelect && selectEdge(edge.id)}
            nodesConnectable={false}
            edgesFocusable={false}
            selectionKeyCode={null}
            multiSelectionKeyCode={null}
            deleteKeyCode={null}
            minZoom={0.1}
            maxZoom={2.5}
            fitView
            fitViewOptions={FIT}
            aria-label="Graph"
            style={FILL}
          />
          </FlagsContext.Provider>
        )}
        {!noTriples && empty && (
          <div className="graph-empty">
            {view === 'both' ? 'No triples yet.' : `No triples in the ${GRAPH_TITLES[view]} yet.`}
          </div>
        )}
      </div>

      {!noTriples &&
        (selectedEdge ? (
          <EdgeBar edge={selectedEdge} triples={triples} settings={settings} conformance={conformance} />
        ) : !selected && legendKey !== null && legendCards ? (
          <div className="sel-bar" aria-live="polite">
            <div className="sel-info">
              <span className="sel-name">
                {legendKey ? `“${legend.find((l) => l.key === legendKey)?.label ?? ''}”` : 'No class'}
              </span>
              <span className="sel-meta">
                · {legendCards.length} {legendCards.length === 1 ? 'card' : 'cards'}
              </span>
            </div>
            <div className="sel-actions">
              <button type="button" className="btn xs quiet" onClick={() => setLegendKey(null)}>
                Show all
              </button>
            </div>
          </div>
        ) : (
          <SelectionBar selected={selected} settings={settings} conformance={conformance} />
        ))}
    </>
  );
}

/** FLOW-07, EDIT-08: name, class, IRI and usage of the selected node, plus its actions. */
function SelectionBar({
  selected,
  settings,
  conformance,
}: {
  selected: NodeModel | undefined;
  settings: ProjectSettings;
  conformance: Conformance | null;
}) {
  const openDialog = useApp((s) => s.openDialog);
  const triples = useApp((s) => s.triples);
  // The node's triples, already worked out for the list highlight (FLOW-07).
  const highlighted = useApp((s) => s.highlighted);
  if (!selected) {
    return (
      <div className="sel-bar">
        <span className="sel-hint">Select a node or an arrow to see its details.</span>
      </div>
    );
  }
  if (selected.kind === 'value') {
    return (
      <div className="sel-bar" aria-live="polite">
        <div className="sel-info">
          <span className="sel-name mono">"{selected.literal.value}"</span>
          <span className="sel-meta">Literal · {selected.literal.datatype}</span>
          <span className="sel-meta">
            {selected.subject.label} → {selected.predicate.label}
          </span>
        </div>
        <FlagReasons conformance={conformance} triples={triples} ids={[selected.tripleId]} />
        <div className="sel-actions">
          <button
            type="button"
            className="btn xs quiet"
            onClick={() => openDialog({ kind: 'edit', tripleId: selected.tripleId })}
          >
            Edit literal
          </button>
          <button
            type="button"
            className="btn xs"
            onClick={() => openDialog({ kind: 'deleteTriple', tripleId: selected.tripleId })}
          >
            Delete
          </button>
        </div>
      </div>
    );
  }
  const cls = [selected.classLabels.join(', ') || (selected.graph === 'data' ? 'No class' : ''), selected.note]
    .filter(Boolean)
    .join(' · ');
  const term = selected.term;
  const renameable = canRename(term);
  return (
    <div className="sel-bar" aria-live="polite">
      <div className="sel-info">
        <span className="sel-name">{selected.label}</span>
        {cls && <span className="sel-meta">{cls}</span>}
        <span className="sel-iri">{prefixedName(term, settings)}</span>
        <span className="sel-meta">
          · used in {selected.usage} {selected.usage === 1 ? 'triple' : 'triples'}
        </span>
      </div>
      {/* CHK-06: the selected node's reasons. */}
      <FlagReasons conformance={conformance} triples={triples} ids={highlighted} showTriple />
      {/* Move to the other graph was dropped (GRAPH-04, 16 Oct 2026). */}
      <div className="sel-actions">
        <button
          type="button"
          className="btn xs quiet"
          disabled={!renameable}
          title={renameable ? undefined : "Standard vocabulary terms can't be renamed"}
          onClick={() => openDialog({ kind: 'rename', term })}
        >
          Rename
        </button>
        {selected.graph === 'data' && selected.role === 'instance' && (
          <button type="button" className="btn xs quiet" onClick={() => openDialog({ kind: 'setClass', term })}>
            Set class
          </button>
        )}
        {/* FLOW-04: a flagged node opens its duplicate review; any other picks what to merge it with. */}
        <button
          type="button"
          className="btn xs quiet"
          disabled={!renameable}
          title={renameable ? undefined : "Standard vocabulary terms can't be merged"}
          onClick={() => {
            const { triples, distinctPairs } = useApp.getState();
            const flagged = setsWithTerm(findDuplicates(triples, distinctPairs), term)[0];
            openDialog(flagged ? { kind: 'duplicates', focus: flagged.key } : { kind: 'mergeWith', term });
          }}
        >
          Merge
        </button>
        <button type="button" className="btn xs" onClick={() => openDialog({ kind: 'delete', term })}>
          Delete
        </button>
      </div>
    </div>
  );
}

/**
 * FLOW-07, extended 16 Oct 2026: a selected arrow shows each term it stands
 * for, with its IRI and where it comes from (e.g. subclass of is
 * rdfs:subClassOf), and the triples behind it, each with Edit triple.
 */
function EdgeBar({
  edge,
  triples,
  settings,
  conformance,
}: {
  edge: EdgeModel;
  triples: readonly Triple[];
  settings: ProjectSettings;
  conformance: Conformance | null;
}) {
  const openDialog = useApp((s) => s.openDialog);
  const rows = edge.tripleIds.map((id) => triples.find((t) => t.id === id)).filter((t): t is Triple => !!t);
  const known = collectTerms(triples);
  // The relationship an Ontology arrow stands for, then the predicates its triples use.
  const terms = new Map<string, IriTerm>();
  for (const k of edge.predicateKeys) {
    const t = known.get(k);
    if (t) terms.set(k, t);
  }
  for (const t of rows) terms.set(termKey(t.p), t.p);
  return (
    <div className="sel-bar edge-bar" aria-live="polite">
      <div className="edge-terms">
        {[...terms.values()].map((t) => (
          <div key={termKey(t)} className="sel-info">
            <span className="sel-name">{t.label}</span>
            <span className="sel-iri">{prefixedName(t, settings)}</span>
            <span className="sel-meta">from {sourceOf(t.ns, settings)}</span>
          </div>
        ))}
      </div>
      <ul className="edge-triples" aria-label="Triples behind this arrow">
        {rows.map((t) => {
          const summary = `${t.s.label} · ${t.p.label} · ${objectText(t.o)}`;
          return (
            <li key={t.id}>
              <span>{t.s.label}</span>
              <span className="pred">{t.p.label}</span>
              <span className={t.o.kind === 'literal' ? 'mono' : undefined}>{objectText(t.o)}</span>
              <button
                type="button"
                className="row-icon"
                aria-label={`Edit triple ${summary}`}
                title="Edit triple"
                onClick={() => openDialog({ kind: 'edit', tripleId: t.id })}
              >
                <PencilIcon />
              </button>
              <FlagReasons conformance={conformance} triples={triples} ids={[t.id]} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * CHK-06, CHK-07: the reasons the given triples are flagged, each with Accept
 * as exception (or Flag again once accepted). Nothing in Sketch mode.
 */
function FlagReasons({
  conformance,
  triples,
  ids,
  showTriple,
}: {
  conformance: Conformance | null;
  triples: readonly Triple[];
  ids: readonly string[];
  /** Name the triple before its reason (a node's bar lists several triples). */
  showTriple?: boolean;
}) {
  if (!conformance) return null;
  const rows: { t: Triple; f: Flag }[] = [];
  const flagged = ids.filter((id) => conformance.byTriple.has(id));
  const byId = flagged.length > 0 ? new Map(triples.map((t) => [t.id, t])) : undefined;
  for (const id of flagged) {
    const t = byId!.get(id);
    for (const f of conformance.byTriple.get(id)!) if (t) rows.push({ t, f });
  }
  if (rows.length === 0) return null;
  return (
    <ul className="sel-flags" aria-label="Flags">
      {rows.map(({ t, f }) => (
        <FlagItem key={`${t.id}|${f.kind}|${f.rule}`} triple={t} flag={f} showTriple={showTriple} />
      ))}
    </ul>
  );
}

/** In-app help: how the graph is drawn (agreed 16 Oct 2026). */
function GraphHelp() {
  return (
    <InfoPopover label="How the graph is drawn" title="How the graph is drawn">
      <ul>
        <li>Data cards are coloured by their class (their “type”).</li>
        <li>
          In the Ontology graph, a relationship's domain and range triples are drawn as one arrow between the two
          classes. “Subclass of” is an arrow to the parent class.
        </li>
        <li>Relationships whose range is a literal type (string, date…) are listed inside the class card.</li>
        <li>In Both, select a data card to see its class and the class rules it follows, or a class card to see its data.</li>
        <li>Click a class in the legend to pick out its cards.</li>
        <li>
          Long arrows bend around cards while the cards are where the layout put them. Tidy layout puts dragged cards
          back; Undo reverses it.
        </li>
        <li>Select a card or an arrow to see its details; its triples are highlighted in the list.</li>
        <li>The triple list always shows every triple exactly as you typed it.</li>
      </ul>
    </InfoPopover>
  );
}
