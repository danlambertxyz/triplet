// Automatic layout of the graph view with dagre, left to right like the
// design. Node sizes are estimated from their text here; the UI draws edges
// from the measured sizes, so a rough estimate only affects spacing.

import dagre from '@dagrejs/dagre';
import type { GraphModel, NodeModel } from './graphModel';

export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export const ENTITY_WIDTH = 168;
export const VALUE_MIN_WIDTH = 96;
export const VALUE_MAX_WIDTH = 220;
const NAME_CHARS_PER_LINE = 19;
const LINE = 17;

/** Estimated node size, matching the node cards in src/ui/graph. */
export function nodeSize(n: NodeModel): Size {
  if (n.kind === 'value') {
    const chars = n.literal.value.length + n.literal.datatype.length + 2;
    return { width: Math.min(VALUE_MAX_WIDTH, Math.max(VALUE_MIN_WIDTH, chars * 7 + 28)), height: 34 };
  }
  const lines = Math.max(1, Math.ceil(n.label.length / NAME_CHARS_PER_LINE));
  const rows = n.values.length + n.attributes.length;
  const values = rows ? 12 + rows * 18 : 0;
  const note = n.note ? 15 : 0;
  return { width: ENTITY_WIDTH, height: 20 + 15 + lines * LINE + values + note };
}

/**
 * The path dagre found for an arrow, around the cards in between, and where
 * its label goes (agreed 18 Oct 2026). Only valid while both ends are where
 * the layout put them.
 */
export interface Route {
  points: Point[];
  label: Point;
}

export interface Layout {
  /** Top-left of each node. */
  positions: Map<string, Point>;
  /** By edge id. */
  routes: Map<string, Route>;
}

/** Top-left positions for every node, from (0, 0). Left to right by default; top to bottom for the Both view's Ontology area. */
export function layoutGraph(model: GraphModel, direction: 'LR' | 'TB' = 'LR'): Map<string, Point> {
  return layoutWithRoutes(model, direction).positions;
}

export function layoutWithRoutes(model: GraphModel, direction: 'LR' | 'TB' = 'LR'): Layout {
  const g = new dagre.graphlib.Graph({ multigraph: true });
  const tb = direction === 'TB';
  g.setGraph({ rankdir: direction, nodesep: tb ? 40 : 28, ranksep: tb ? 70 : 90, edgesep: 14, marginx: 0, marginy: 0 });
  g.setDefaultEdgeLabel(() => ({}));
  const sizes = new Map<string, Size>();
  for (const n of model.nodes) {
    const size = nodeSize(n);
    sizes.set(n.id, size);
    g.setNode(n.id, { ...size });
  }
  for (const e of model.edges) {
    // Room for the predicate label between the two nodes.
    const text = e.labels.join(' · ');
    g.setEdge(e.source, e.target, { width: Math.min(110, text.length * 6), height: 14, labelpos: 'c' }, e.id);
  }
  dagre.layout(g);

  const positions = new Map<string, Point>();
  for (const n of model.nodes) {
    const p = g.node(n.id);
    const s = sizes.get(n.id)!;
    positions.set(n.id, { x: Math.round(p.x - s.width / 2), y: Math.round(p.y - s.height / 2) });
  }
  const routes = new Map<string, Route>();
  for (const e of model.edges) {
    if (e.source === e.target) continue;
    const d = g.edge({ v: e.source, w: e.target, name: e.id }) as { points?: Point[]; x?: number; y?: number } | undefined;
    if (!d?.points || d.points.length < 2 || d.x === undefined || d.y === undefined) continue;
    routes.set(e.id, { points: d.points.map((p) => ({ x: p.x, y: p.y })), label: { x: d.x, y: d.y } });
  }
  return { positions, routes };
}

/** Bounding box of placed nodes. */
export function bounds(
  positions: Iterable<[string, Point]>,
  sizes: Map<string, Size>,
): { x: number; y: number; width: number; height: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [id, p] of positions) {
    const s = sizes.get(id);
    if (!s) continue;
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x + s.width);
    maxY = Math.max(maxY, p.y + s.height);
  }
  if (minX === Infinity) return { x: 0, y: 0, width: 0, height: 0 };
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
