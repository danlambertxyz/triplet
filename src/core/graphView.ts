// Puts the graph view together for the Data / Ontology / Both toggle
// (FLOW-02, GRAPH-03). In Both, the Ontology graph sits in a tinted area on
// the left, showing only the classes the data uses, and the Data graph sits to
// its right; selecting a data node links it to its class (agreed 16 Oct 2026).
// Positions the user dragged to (FLOW-06) are kept relative to their band, so
// adding triples elsewhere never moves them. Once a view has been arranged by
// hand, a new card is placed next to a card it links to (agreed 18 Oct 2026),
// and Tidy layout forgets the arrangement.

import {
  buildGraph,
  classNodeId,
  entityNodeId,
  ontologyForData,
  type EdgeModel,
  type GraphModel,
  type NodeModel,
  type ValuesMode,
} from './graphModel';
import { bounds, layoutWithRoutes, nodeSize, type Point, type Route, type Size } from './graphLayout';
import { termKey } from './terms';
import type { GraphName, Triple } from './types';
import { RDFS_SUBCLASS_OF } from './vocab';

export type GraphViewName = GraphName | 'both';

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Band {
  graph: GraphName;
  model: GraphModel;
  /** Absolute top-left of each node. */
  positions: Map<string, Point>;
  sizes: Map<string, Size>;
  /** Where the band's title sits (Both view only). */
  labelAt?: Point;
  /** Both view, Ontology only: the tinted area behind it. */
  area?: Box;
  /** Offset added to band-relative positions; subtract it to store a dragged position. */
  offset: Point;
  /** Arrows drawn along their layout path, in absolute coordinates: those whose two cards haven't moved. */
  routes: Map<string, Route>;
  /** Both view: how far left (Data) or right (Ontology) a node may be dropped, in absolute x. */
  minX?: number;
  maxX?: number;
}

export interface GraphView {
  view: GraphViewName;
  bands: Band[];
}

/** Both view spacing: padding inside the Ontology area, the gap to the Data graph, and room for titles. */
export const AREA_PAD = 24;
export const AREA_GAP = 80;
export const TITLE_SPACE = 56;
const AREA_MIN = { width: 240, height: 140 };

/** Key under which a dragged position is saved. Both view lays nodes out differently, so it keeps its own. */
export function dragKey(view: GraphViewName, nodeId: string): string {
  return view === 'both' ? `both|${nodeId}` : nodeId;
}

/** The automatic layout of each graph in the view; depends only on the triples. */
export interface AutoBand {
  graph: GraphName;
  model: GraphModel;
  auto: Map<string, Point>;
  autoRoutes: Map<string, Route>;
  sizes: Map<string, Size>;
}

export interface AutoLayout {
  view: GraphViewName;
  bands: AutoBand[];
}

function autoBand(graph: GraphName, model: GraphModel, direction: 'LR' | 'TB' = 'LR'): AutoBand {
  const { positions, routes } = layoutWithRoutes(model, direction);
  return {
    graph,
    model,
    auto: positions,
    autoRoutes: routes,
    sizes: new Map(model.nodes.map((n) => [n.id, nodeSize(n)])),
  };
}

const SPOT_GAP = 16;

/** Nudges a box up or down, a step at a time, until it overlaps none of `taken`. */
function freeSpot(at: Point, size: Size, taken: readonly Box[]): Point {
  const hits = (y: number) =>
    taken.some(
      (b) =>
        at.x < b.x + b.width + SPOT_GAP &&
        b.x < at.x + size.width + SPOT_GAP &&
        y < b.y + b.height + SPOT_GAP &&
        b.y < y + size.height + SPOT_GAP,
    );
  const step = 24;
  for (let i = 0; i < 200; i++) {
    const dy = Math.ceil(i / 2) * step * (i % 2 ? 1 : -1);
    if (!hits(at.y + dy)) return { x: at.x, y: at.y + dy };
  }
  return at;
}

/**
 * Band-relative positions: dragged ones as saved; the rest from the automatic
 * layout, unless the band has been arranged by hand. Then a card without a
 * saved position goes beside a card it links to, keeping the offset the
 * layout gave them, and moves up or down out of the way of other cards
 * (agreed 18 Oct 2026). A card linked to nothing placed keeps its layout spot,
 * moved out of the way too.
 */
function relativePositions(b: AutoBand, saved: (id: string) => Point | undefined): Map<string, Point> {
  const out = new Map<string, Point>();
  for (const n of b.model.nodes) {
    const p = saved(n.id);
    if (p) out.set(n.id, p);
  }
  if (out.size === 0) return new Map(b.auto);
  const neighbours = new Map<string, string[]>();
  for (const e of b.model.edges) {
    (neighbours.get(e.source) ?? neighbours.set(e.source, []).get(e.source)!).push(e.target);
    (neighbours.get(e.target) ?? neighbours.set(e.target, []).get(e.target)!).push(e.source);
  }
  const boxes = () => [...out].map(([id, p]) => ({ ...p, ...b.sizes.get(id)! }));
  const place = (id: string, at: Point) => out.set(id, freeSpot(at, b.sizes.get(id)!, boxes()));
  // Breadth first from the placed cards, so a chain of new cards follows its placed end.
  const queue = [...out.keys()];
  while (queue.length > 0) {
    const from = queue.shift()!;
    for (const id of neighbours.get(from) ?? []) {
      if (out.has(id)) continue;
      const a = b.auto.get(id)!;
      const af = b.auto.get(from)!;
      const pf = out.get(from)!;
      place(id, { x: pf.x + a.x - af.x, y: pf.y + a.y - af.y });
      queue.push(id);
    }
  }
  for (const n of b.model.nodes) if (!out.has(n.id)) place(n.id, b.auto.get(n.id)!);
  return out;
}

/** The layout paths of arrows whose two cards are where the layout put them, moved by `offset`. */
function liveRoutes(b: AutoBand, relative: Map<string, Point>, offset: Point): Map<string, Route> {
  const still = (id: string) => {
    const p = relative.get(id);
    const a = b.auto.get(id);
    return !!p && !!a && p.x === a.x && p.y === a.y;
  };
  const shift = (p: Point) => ({ x: p.x + offset.x, y: p.y + offset.y });
  const out = new Map<string, Route>();
  for (const e of b.model.edges) {
    const r = b.autoRoutes.get(e.id);
    if (r && still(e.source) && still(e.target)) out.set(e.id, { points: r.points.map(shift), label: shift(r.label) });
  }
  return out;
}

export function layoutBands(triples: readonly Triple[], view: GraphViewName, valuesMode: ValuesMode): AutoLayout {
  if (view !== 'both') return { view, bands: [autoBand(view, buildGraph(triples, view, valuesMode))] };
  const data = buildGraph(triples, 'data', valuesMode);
  const ontology = ontologyForData(buildGraph(triples, 'ontology', valuesMode), data);
  // Ontology first, as a narrow column on the left.
  return { view, bands: [autoBand('ontology', ontology, 'TB'), autoBand('data', data)] };
}

/** Places the laid-out bands, applying dragged positions. */
export function placeBands(layout: AutoLayout, dragged: Readonly<Record<string, Point>> = {}): GraphView {
  const { view } = layout;
  const relative = new Map(layout.bands.map((b) => [b.graph, relativePositions(b, (id) => dragged[dragKey(view, id)])]));
  const place = (b: AutoBand, offset: Point) => {
    const positions = new Map<string, Point>();
    for (const [id, p] of relative.get(b.graph)!) positions.set(id, { x: p.x + offset.x, y: p.y + offset.y });
    return positions;
  };
  const routes = (b: AutoBand, offset: Point) => liveRoutes(b, relative.get(b.graph)!, offset);

  if (view !== 'both') {
    const [b] = layout.bands;
    const offset = { x: 0, y: 0 };
    return { view, bands: [{ ...b, positions: place(b, offset), offset, routes: routes(b, offset) }] };
  }

  const [ont, data] = layout.bands;
  // The Data graph starts right of the Ontology area's automatic layout, so
  // dragging an ontology node never moves the data.
  const autoBox = bounds(ont.auto, ont.sizes);
  const ontOffset = { x: AREA_PAD, y: TITLE_SPACE };
  const areaWidth = Math.max(AREA_MIN.width, autoBox.width + 2 * AREA_PAD);
  const dataX = areaWidth + AREA_GAP;
  const dataOffset = { x: dataX, y: TITLE_SPACE };

  const ontPositions = place(ont, ontOffset);
  const box = bounds(ontPositions, ont.sizes);
  // The area always wraps its cards, even ones dragged left or up.
  const left = Math.min(0, box.x - AREA_PAD);
  const top = Math.min(0, box.y - TITLE_SPACE);
  const right = Math.max(areaWidth, box.x + box.width + AREA_PAD);
  const bottom = Math.max(top + AREA_MIN.height, box.y + box.height + AREA_PAD);
  const area = { x: left, y: top, width: right - left, height: bottom - top };

  return {
    view,
    bands: [
      {
        ...ont,
        positions: ontPositions,
        offset: ontOffset,
        routes: routes(ont, ontOffset),
        labelAt: { x: AREA_PAD, y: 14 },
        area,
        maxX: dataX - AREA_GAP / 2,
      },
      {
        ...data,
        positions: place(data, dataOffset),
        offset: dataOffset,
        routes: routes(data, dataOffset),
        labelAt: { x: dataX, y: 14 },
        minX: dataX,
      },
    ],
  };
}

export function composeGraphView(
  triples: readonly Triple[],
  view: GraphViewName,
  valuesMode: ValuesMode,
  dragged: Readonly<Record<string, Point>> = {},
): GraphView {
  return placeBands(layoutBands(triples, view, valuesMode), dragged);
}

export interface Focus {
  /** Dashed links from the selected data node to its classes. */
  typeLinks: EdgeModel[];
  /** Ontology arrows drawn dark: the class's parent, then the class rules the node's triples follow. */
  highlighted: Set<string>;
  /** Nodes and edges left at full strength; everything else fades. */
  nodes: Set<string>;
  edges: Set<string>;
}

/** How many ontology arrows are highlighted besides the class link. */
export const MAX_HIGHLIGHTED = 6;

/**
 * Both view: selecting a data node links it to its class and highlights the
 * related ontology arrows: the class's parent first, then, for each of the
 * node's own triples, the arrow for that relationship between the two cards'
 * classes (agreed 18 Oct 2026; before, only the first arrow of a relationship
 * was found). The rest fades, so the picture isn't swamped. Selecting a class
 * card shows its data instead (classFocus).
 */
export function focusFor(view: GraphView, selectedId: string | null, triples: readonly Triple[] = []): Focus | undefined {
  if (view.view !== 'both' || !selectedId) return undefined;
  const ont = view.bands.find((b) => b.graph === 'ontology');
  const data = view.bands.find((b) => b.graph === 'data');
  const ontNode = ont?.model.nodes.find((n) => n.id === selectedId);
  if (ontNode?.kind === 'entity' && ontNode.role === 'class') return classFocus(view, termKey(ontNode.term), triples);
  const selected = data?.model.nodes.find((n) => n.id === selectedId);
  if (!ont || !data || !selected || selected.kind !== 'entity') return undefined;

  const ontIds = new Set(ont.model.nodes.map((n) => n.id));
  const classIds = selected.classKeys.map(classNodeId).filter((id) => ontIds.has(id));
  const typeLinks: EdgeModel[] = classIds.map((c) => ({
    id: `type#${selectedId}->${c}`,
    graph: 'data',
    source: selectedId,
    target: c,
    kind: 'type',
    labels: ['type'],
    predicateKeys: [],
    tripleIds: [],
  }));

  const dataNodes = new Map(data.model.nodes.map((n) => [n.id, n]));
  const classesOf = (id: string) => {
    const n = dataNodes.get(id);
    return n?.kind === 'entity' ? n.classKeys.map(classNodeId) : [];
  };
  const ownEdges = data.model.edges.filter((e) => e.source === selectedId || e.target === selectedId);
  const highlighted: EdgeModel[] = [];
  const pick = (e: EdgeModel | undefined) => {
    if (e && highlighted.length < MAX_HIGHLIGHTED && !highlighted.includes(e)) highlighted.push(e);
  };
  for (const c of classIds) {
    pick(ont.model.edges.find((e) => e.kind === 'parent' && e.source === c));
  }
  for (const own of ownEdges) {
    const from = classesOf(own.source);
    const to = classesOf(own.target);
    for (const k of own.predicateKeys) {
      const rules = ont.model.edges.filter((e) => e.kind === 'relation' && e.predicateKeys.includes(k));
      // The arrow between the two cards' classes; failing that, one touching the selected card's class.
      const exact = rules.filter((e) => from.includes(e.source) && to.includes(e.target));
      if (exact.length > 0) exact.forEach(pick);
      else pick(rules.find((e) => classIds.includes(e.source) || classIds.includes(e.target)));
    }
  }

  const nodes = new Set<string>([selectedId, ...classIds]);
  for (const e of ownEdges) nodes.add(e.source).add(e.target);
  for (const e of highlighted) nodes.add(e.source).add(e.target);
  // A class's own literal rows and literal nodes stay visible with it.
  for (const n of ont.model.nodes) {
    if (n.kind === 'value' && nodes.has(entityNodeId('ontology', n.subject))) nodes.add(n.id);
  }
  const edges = new Set<string>([...ownEdges, ...highlighted, ...typeLinks].map((e) => e.id));
  for (const e of ont.model.edges) if (e.kind === 'literal' && nodes.has(e.target)) edges.add(e.id);
  return { typeLinks, highlighted: new Set(highlighted.map((e) => e.id)), nodes, edges };
}

/** A class and every class below it through "subclass of", at any depth, by termKey. */
export function withSubclasses(triples: readonly Triple[], classKey: string): Set<string> {
  const sub = termKey(RDFS_SUBCLASS_OF);
  const children = new Map<string, string[]>();
  for (const t of triples) {
    if (t.graph !== 'ontology' || t.o.kind !== 'iri' || termKey(t.p) !== sub) continue;
    const parent = termKey(t.o);
    (children.get(parent) ?? children.set(parent, []).get(parent)!).push(termKey(t.s));
  }
  const out = new Set([classKey]);
  for (const k of out) for (const c of children.get(k) ?? []) out.add(c);
  return out;
}

/** The Data graph cards of a class (or its subclasses), or with no class when `classKey` is ''. */
export function instancesOf(model: GraphModel, triples: readonly Triple[], classKey: string): string[] {
  const keys = classKey ? withSubclasses(triples, classKey) : undefined;
  return model.nodes
    .filter(
      (n): n is Extract<NodeModel, { kind: 'entity' }> =>
        n.kind === 'entity' &&
        n.role === 'instance' &&
        (keys ? n.classKeys.some((k) => keys.has(k)) : !n.colourClassKey),
    )
    .map((n) => n.id);
}

/**
 * A class picked in the legend (Data and Both views) or as a card (Both view):
 * its Data graph cards stay at full strength with their literals and the
 * arrows between them, and the rest fades (agreed 18 Oct 2026).
 */
export function classFocus(
  view: GraphView,
  classKey: string,
  triples: readonly Triple[],
  /** The class's cards, when already worked out (instancesOf). */
  cards?: readonly string[],
): Focus | undefined {
  const data = view.bands.find((b) => b.graph === 'data');
  if (!data) return undefined;
  const nodes = new Set(cards ?? instancesOf(data.model, triples, classKey));
  if (classKey) {
    const ont = view.bands.find((b) => b.graph === 'ontology');
    const card = ont?.model.nodes.find((n) => n.id === classNodeId(classKey));
    if (card) nodes.add(card.id);
  }
  for (const n of data.model.nodes) {
    if (n.kind === 'value' && nodes.has(entityNodeId('data', n.subject))) nodes.add(n.id);
  }
  const edges = new Set<string>();
  for (const e of data.model.edges) if (nodes.has(e.source) && nodes.has(e.target)) edges.add(e.id);
  return { typeLinks: [], highlighted: new Set(), nodes, edges };
}

/**
 * After a drop, moves the nodes the dropped ones now overlap out of the way,
 * along whichever direction needs the smaller move, and repeats for any node
 * that is pushed onto another (agreed 16 Oct 2026). Returns new positions for
 * the nodes that moved; the dropped nodes stay where they were put.
 */
export function pushApart(boxes: ReadonlyMap<string, Box>, dropped: readonly string[], gap = 16): Map<string, Point> {
  const live = new Map([...boxes].map(([id, b]) => [id, { ...b }]));
  // Dropped nodes stay put; pushed nodes may be pushed again by others.
  const fixed = new Set(dropped);
  const queue = [...dropped];
  const moved = new Map<string, Point>();
  for (let steps = 0; queue.length > 0 && steps < 2000; steps++) {
    const a = live.get(queue.shift()!)!;
    for (const [id, b] of live) {
      if (fixed.has(id) || b === a) continue;
      const right = a.x + a.width + gap - b.x;
      const left = b.x + b.width + gap - a.x;
      const down = a.y + a.height + gap - b.y;
      const up = b.y + b.height + gap - a.y;
      if (right <= 0 || left <= 0 || down <= 0 || up <= 0) continue;
      // Push the smaller way, away from the node that landed on it.
      const dx = right < left ? right : -left;
      const dy = down < up ? down : -up;
      if (Math.abs(dx) < Math.abs(dy)) b.x += dx;
      else b.y += dy;
      moved.set(id, { x: b.x, y: b.y });
      queue.push(id);
    }
  }
  return moved;
}

/** Every node in the view with its band, for looking one up by id. */
export function nodeIndex(view: GraphView): Map<string, { band: Band; node: NodeModel }> {
  const out = new Map<string, { band: Band; node: NodeModel }>();
  for (const band of view.bands) for (const node of band.model.nodes) out.set(node.id, { band, node });
  return out;
}
