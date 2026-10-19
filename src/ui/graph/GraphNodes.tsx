// Node cards and the floating edge for the graph view, matching
// the design (Main screen). Colour only on Data graph nodes (GEN-09, TYPE-04).

import {
  BaseEdge,
  EdgeLabelRenderer,
  Handle,
  Position,
  useInternalNode,
  type Edge,
  type EdgeProps,
  type InternalNode,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import { createContext, useContext, type CSSProperties } from 'react';
import type { EdgeKind, EntityNodeModel, ValueNodeModel } from '../../core/graphModel';
import { FlagIcon } from '../icons';

/** Validate mode: each flagged triple's state, by triple id (CHK-06). Empty in Sketch mode. */
export type FlagState = 'open' | 'accepted';
export const FlagsContext = createContext<ReadonlyMap<string, FlagState>>(new Map());

/** The strongest state among some triples: open beats accepted. */
export function flagStateOf(flags: ReadonlyMap<string, FlagState>, tripleIds: readonly string[]): FlagState | undefined {
  let out: FlagState | undefined;
  for (const id of tripleIds) {
    const f = flags.get(id);
    if (f === 'open') return f;
    if (f) out = f;
  }
  return out;
}

type Offset = { x: number; y: number };
export type EntityFlowNode = Node<{ model: EntityNodeModel; offset: Offset }, 'entity'>;
export type ValueFlowNode = Node<{ model: ValueNodeModel; offset: Offset }, 'value'>;
export type TitleFlowNode = Node<{ text: string; onFullView: () => void }, 'title'>;
export type AreaFlowNode = Node<{ width: number; height: number; onFullView: () => void }, 'area'>;
export type FlowNode = EntityFlowNode | ValueFlowNode | TitleFlowNode | AreaFlowNode;

/** strong: highlighted for the selected node; faded: not related to it (Both view). */
export type Emphasis = 'normal' | 'strong' | 'faded';
export type FlowEdge = Edge<
  {
    labels: string[];
    kind: EdgeKind;
    /** The triples behind the edge, for its flag marker (CHK-06). */
    tripleIds: string[];
    bend: number;
    emphasis: Emphasis;
    colour?: string;
    /** The arrow the user selected for its details (FLOW-07, extended 16 Oct 2026). */
    selected?: boolean;
    /** Selects the arrow; also reachable from its label. Absent for the Both view's class links. */
    onSelect?: (id: string) => void;
    /**
     * The layout's path around the cards in between, and where the two cards
     * were then (top-left); used only while they are still there (18 Oct 2026).
     */
    route?: { points: { x: number; y: number }[]; label: { x: number; y: number }; from: Offset; to: Offset };
  },
  'floating'
>;

// Edges are drawn centre to centre, so the handles only need to exist.
function Handles() {
  return (
    <>
      <Handle type="target" position={Position.Left} className="ghandle" isConnectable={false} />
      <Handle type="source" position={Position.Right} className="ghandle" isConnectable={false} />
    </>
  );
}

export function EntityNode({ data }: NodeProps<EntityFlowNode>) {
  const m = data.model;
  const flags = useContext(FlagsContext);
  const isData = m.graph === 'data';
  const style = isData && m.colour ? ({ '--node-colour': m.colour } as CSSProperties) : undefined;
  const cls = m.classLabels.length ? m.classLabels.join(', ') : isData ? 'No class' : '';
  const rows: { key: string; p: string; v: string; title: string; flag?: FlagState }[] = [
    ...m.attributes.map((a) => ({
      key: `${a.propertyKey}|${a.range}`,
      p: a.property,
      v: a.range,
      title: `${a.property}: ${a.range}`,
    })),
    ...m.values.map((v) => ({
      key: v.tripleId,
      p: v.predicate,
      v: v.value,
      title: `${v.predicate}: "${v.value}" (${v.datatype})`,
      flag: flags.get(v.tripleId),
    })),
  ];
  return (
    <div className={`gnode ${isData ? 'data' : 'ontology'}${m.role === 'property' ? ' loose' : ''}`} style={style}>
      <Handles />
      {cls && (
        <span className="gnode-class">
          {isData ? <span className="dot" aria-hidden="true" /> : <span className="ring" aria-hidden="true" />}
          {cls}
        </span>
      )}
      <span className="gnode-name">{m.label}</span>
      {m.note && <span className="gnode-note">{m.note}</span>}
      {rows.length > 0 && (
        <span className="gnode-values">
          {rows.map((r) => (
            <span key={r.key} className={`gnode-value${r.flag ? ` flag-${r.flag}` : ''}`} title={r.flag ? `${r.title} · flagged` : r.title}>
              <span className="p">
                {r.flag && <FlagIcon size={10} />}
                {r.p}
              </span>
              <span className="v">{r.v}</span>
            </span>
          ))}
        </span>
      )}
    </div>
  );
}

export function ValueNode({ data }: NodeProps<ValueFlowNode>) {
  const m = data.model;
  return (
    <div className="gvalue" title={`"${m.literal.value}" (${m.literal.datatype})`}>
      <Handles />
      <span className="v">{m.literal.value}</span>
      <span className="dt">{m.literal.datatype}</span>
    </div>
  );
}

/** A Both-view area title with a button to that graph's own view (GRAPH-03). */
function AreaTitle({ text, onFullView }: { text: string; onFullView: () => void }) {
  return (
    <div className="garea-head">
      <span className="gband">{text}</span>
      <button type="button" className="garea-full nodrag" onClick={onFullView}>
        Full view
      </button>
    </div>
  );
}

/** "Data graph" title in the Both view (GRAPH-03). */
export function TitleNode({ data }: NodeProps<TitleFlowNode>) {
  return <AreaTitle text={data.text} onFullView={data.onFullView} />;
}

/** Both view: the tinted Ontology area, behind its class cards (GRAPH-03). */
export function AreaNode({ data }: NodeProps<AreaFlowNode>) {
  return (
    <div className="garea" style={{ width: data.width, height: data.height }}>
      <AreaTitle text="Ontology graph" onFullView={data.onFullView} />
    </div>
  );
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function box(n: InternalNode): Box {
  return {
    x: n.internals.positionAbsolute.x,
    y: n.internals.positionAbsolute.y,
    w: n.measured.width ?? 0,
    h: n.measured.height ?? 0,
  };
}

/** Distance along (dx, dy) from a box's centre to its edge, as a fraction. */
function toEdge(b: Box, dx: number, dy: number): number {
  const tx = Math.abs(dx) < 0.01 ? Infinity : b.w / 2 / Math.abs(dx);
  const ty = Math.abs(dy) < 0.01 ? Infinity : b.h / 2 / Math.abs(dy);
  return Math.min(tx, ty);
}

/** Whether a card is still where the layout put it. */
function near(b: Box, p: Offset): boolean {
  return Math.abs(b.x - p.x) < 1 && Math.abs(b.y - p.y) < 1;
}

/** Where the line from a card's centre towards `p` leaves the card, `gap` pixels out. */
function border(b: Box, p: Offset, gap: number): Offset {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const dx = p.x - cx;
  const dy = p.y - cy;
  const len = Math.hypot(dx, dy) || 1;
  const t = toEdge(b, dx, dy);
  return { x: cx + dx * t + (dx / len) * gap, y: cy + dy * t + (dy / len) * gap };
}

const DASH: Partial<Record<EdgeKind, string>> = { literal: '3 3', type: '6 4' };

/** Straight edge between node borders that follows nodes as they move (FLOW-06). */
export function FloatingEdge({ id, source, target, data, markerEnd }: EdgeProps<FlowEdge>) {
  const flags = useContext(FlagsContext);
  const flag = data ? flagStateOf(flags, data.tripleIds) : undefined;
  const sn = useInternalNode(source);
  const tn = useInternalNode(target);
  if (!sn || !tn || !data) return null;
  const a = box(sn);
  const b = box(tn);
  const strong = data.emphasis === 'strong' || !!data.selected;
  const stroke = data.kind === 'type' ? (data.colour ?? '#111111') : strong ? '#111111' : '#9a9a9a';
  const style: CSSProperties = {
    stroke,
    strokeWidth: strong || data.kind === 'type' ? 2 : data.kind === 'parent' ? 1.6 : 1.2,
    strokeDasharray: DASH[data.kind],
    opacity: data.emphasis === 'faded' ? 0.2 : 1,
  };
  const label = data.labels.join(' · ');

  let path: string;
  let lx: number;
  let ly: number;
  if (source === target) {
    // A term related to itself: a small loop above the node's top-right corner.
    const x = a.x + a.w - 24;
    const y = a.y;
    path = `M ${x} ${y} C ${x - 6} ${y - 44}, ${x + 46} ${y - 44}, ${x + 18} ${y - 1}`;
    lx = x + 12;
    ly = y - 40;
  } else if (data.route && near(a, data.route.from) && near(b, data.route.to)) {
    // Along the layout's path, so a long arrow bends around the cards in between (18 Oct 2026).
    const pts = data.route.points;
    const start = border(a, pts[1], 3);
    const end = border(b, pts[pts.length - 2], 4);
    const inner = pts.slice(1, -1);
    path = `M ${start.x} ${start.y}`;
    for (let i = 0; i < inner.length; i++) {
      const next = inner[i + 1] ?? end;
      const mid = i + 1 < inner.length ? { x: (inner[i].x + next.x) / 2, y: (inner[i].y + next.y) / 2 } : next;
      path += ` Q ${inner[i].x} ${inner[i].y} ${mid.x} ${mid.y}`;
    }
    if (inner.length === 0) path += ` L ${end.x} ${end.y}`;
    lx = data.route.label.x;
    ly = data.route.label.y;
  } else {
    const ax = a.x + a.w / 2;
    const ay = a.y + a.h / 2;
    const bx = b.x + b.w / 2;
    const by = b.y + b.h / 2;
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    // Two nodes linked both ways: shift each line sideways so both show.
    const ox = (-dy / len) * data.bend;
    const oy = (dx / len) * data.bend;
    const ta = toEdge(a, dx, dy);
    const tb = toEdge(b, dx, dy);
    const ux = dx / len;
    const uy = dy / len;
    const x1 = ax + dx * ta + ux * 3 + ox;
    const y1 = ay + dy * ta + uy * 3 + oy;
    const x2 = bx - dx * tb - ux * 4 + ox;
    const y2 = by - dy * tb - uy * 4 + oy;
    path = `M ${x1} ${y1} L ${x2} ${y2}`;
    lx = (x1 + x2) / 2;
    ly = (y1 + y2) / 2;
  }

  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={{ ...style, ...(data.selected ? { strokeWidth: 2.4 } : {}) }} interactionWidth={data.onSelect ? 14 : 0} />
      <EdgeLabelRenderer>
        <div
          className={`gedge-label ${data.selected ? 'strong selected' : data.emphasis}${data.kind === 'parent' ? ' parent' : ''}${data.onSelect ? ' clickable nopan' : ''}${flag ? ` flag-${flag}` : ''}`}
          style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)` }}
          onClick={data.onSelect ? () => data.onSelect!(id) : undefined}
        >
          {flag && <FlagIcon size={10} />}
          {label}
          {flag && <span className="sr-only">{flag === 'open' ? ' (flagged)' : ' (accepted exception)'}</span>}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export const nodeTypes = { entity: EntityNode, value: ValueNode, title: TitleNode, area: AreaNode };
export const edgeTypes = { floating: FloatingEdge };
