// App state. The triple list is the single source of truth: the list, the
// graph and the export all read from it. Saved to localStorage (GEN-01).

import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { exceptionKey, pruneExceptions, repointExceptions, type AcceptedException } from '../core/conformance';
import { repointPairs, type DistinctPair } from '../core/duplicates';
import type { Point } from '../core/graphLayout';
import type { ValuesMode } from '../core/graphModel';
import { emptyHistory, record, redo, undo, type History } from '../core/history';
import { setupFromSettings, type SetupDraft } from '../core/settings';
import type { GraphName, IriTerm, ProjectSettings, Triple } from '../core/types';

export type View = GraphName | 'both';
export type Screen = 'main' | 'export';
/** MODE-01–05: Sketch checks nothing; Validate checks the Data graph against the Ontology graph. */
export type Mode = 'sketch' | 'validate';

/** The editing pop-up that is open, if any (SCR-05–07, TYPE-08). */
export type DialogState =
  | { kind: 'edit'; tripleId: string }
  | { kind: 'rename'; term: IriTerm }
  | { kind: 'delete'; term: IriTerm }
  | { kind: 'deleteTriple'; tripleId: string }
  | { kind: 'setClass'; term: IriTerm }
  | { kind: 'settings' }
  /** SCR-08: the duplicate review, opened at a set (by key) or at a pair chosen with Merge. */
  | { kind: 'duplicates'; focus?: string; pair?: [IriTerm, IriTerm] }
  /** FLOW-04: Merge from the selected-node bar, for a term that isn't flagged: pick what to merge it with. */
  | { kind: 'mergeWith'; term: IriTerm }
  /** The user guide, from the "?" in the top bar (added 17 Oct 2026). */
  | { kind: 'help' };

/**
 * What Undo and Redo step through (EDIT-06): the triples, the pairs kept as
 * different things (DUP-07) and the accepted exceptions (CHK-07).
 */
export interface Snapshot {
  triples: Triple[];
  distinctPairs: DistinctPair[];
  exceptions: AcceptedException[];
  /**
   * Only on the step before a Tidy layout (agreed 18 Oct 2026): where the
   * nodes were, so Undo puts them back. Dragging isn't an Undo step.
   */
  positions?: AppState['nodePositions'];
}

interface AppState {
  settings: ProjectSettings | null;
  triples: Triple[];
  view: View;
  target: GraphName;
  screen: Screen;
  /** Ids of the triples added by the last entry, highlighted in the list (ENT-07). */
  lastAdded: string[];
  /** True when the browser refused to save (storage full or blocked). */
  saveFailed: boolean;
  /** Whether the entry form and triple list are folded away to give the graph more room. */
  panelCollapsed: boolean;
  /** How the graph shows values: separate dashed nodes or listed on their subject (LIT-04). */
  valuesMode: ValuesMode;
  /**
   * Where the user dragged graph nodes (FLOW-06), by node id, relative to their
   * band. Kept per Values mode, since the two modes lay nodes out differently.
   */
  nodePositions: Record<ValuesMode, Record<string, Point>>;
  /** Setup answers carried over from the project that was cleared (GEN-10). */
  setupDraft: SetupDraft | null;
  /** DUP-07: pairs of terms the user kept as different things, by termKey. Saved; never exported. */
  distinctPairs: DistinctPair[];
  /** CHK-07: flags accepted as exceptions. Saved and part of Undo; never exported. */
  exceptions: AcceptedException[];
  /** MODE-05: saved with the project; Sketch by default (MODE-02). Not part of Undo (MODE-04). */
  mode: Mode;
  /** Validate mode: the triple list shows only triples with open flags (CHK-06). Not saved. */
  flaggedOnly: boolean;
  /** EDIT-06: earlier and undone versions of the project. Not saved: this visit only. */
  history: History<Snapshot>;
  dialog: DialogState | null;
  /** The last rename or merge, by termKey, so the graph can keep the renamed node selected. Not saved. */
  lastRename: { from: string[]; to: string } | null;
  /** Triples involved in the selected graph node or arrow, highlighted in the list. Not saved. */
  highlighted: string[];
  /** Which sections of the triple list are folded away. */
  listCollapsed: Record<GraphName, boolean>;

  /** Starts a project; `triples` are the classes named on the setup screen (SCR-01). */
  createProject: (settings: ProjectSettings, triples?: Omit<Triple, 'id'>[]) => void;
  /**
   * SCR-09: new namespaces and prefixes. Triples keep their terms by namespace
   * key, so every IRI follows on export (ID-04). Not part of Undo, which steps
   * through the triples (EDIT-06).
   */
  updateSettings: (settings: ProjectSettings) => void;
  /** GEN-10: clears the whole project and returns to the setup screen. The UI confirms first. */
  resetProject: () => void;
  addTriples: (triples: Omit<Triple, 'id'>[]) => void;
  deleteTriple: (id: string) => void;
  /** Removes several triples as one step (deleting an entity, EDIT-04). */
  deleteTriples: (ids: readonly string[]) => void;
  /** EDIT-02: replaces one triple in place, keeping its id and position. */
  replaceTriple: (id: string, triple: Omit<Triple, 'id'>) => void;
  /** Applies a renamed triple list as one step (ID-07); `from` and `to` are the term's old and new termKeys. */
  renameTerm: (triples: Triple[], from: string, to: string) => void;
  /** TYPE-08: removes the node's other type triples and adds the new one, as one step. */
  setClass: (remove: readonly string[], add?: Omit<Triple, 'id'>) => void;
  /** CHK-11 fix: replaces a plain class-to-class triple with domain and range triples, as one step. */
  replaceWithTriples: (id: string, add: readonly Omit<Triple, 'id'>[]) => void;
  /** Tidy layout: forgets the dragged positions under `keys` (the current view), as an undoable step. */
  tidyLayout: (mode: ValuesMode, keys: readonly string[]) => void;
  /** DUP-05: applies a merged triple list as one step; pairs kept apart follow the survivor. */
  mergeTerms: (triples: Triple[], from: readonly string[], to: string) => void;
  /** DUP-06: adds one triple as an undoable step without the entry form's "Added" confirmation (ENT-07). */
  linkTriple: (triple: Omit<Triple, 'id'>) => void;
  /** DUP-07: keeps a pair as different things, as an undoable step. */
  keepDistinct: (a: string, b: string) => void;
  /**
   * SCR-09: forgets pairs kept as different things and accepted exceptions,
   * so they are flagged again; one undoable step.
   */
  flagAgain: (pairs: readonly DistinctPair[], exceptions?: readonly AcceptedException[]) => void;
  /** CHK-07: accepts flags as exceptions, as one undoable step. */
  acceptExceptions: (list: readonly AcceptedException[]) => void;
  /** CHK-07, SCR-09: forgets accepted exceptions, so they are flagged again; one undoable step. */
  unacceptExceptions: (list: readonly AcceptedException[]) => void;
  setMode: (mode: Mode) => void;
  setFlaggedOnly: (on: boolean) => void;
  undo: () => void;
  redo: () => void;
  openDialog: (dialog: DialogState | null) => void;
  setView: (view: View) => void;
  setTarget: (target: GraphName) => void;
  setScreen: (screen: Screen) => void;
  dismissLastAdded: () => void;
  setPanelCollapsed: (collapsed: boolean) => void;
  setValuesMode: (mode: ValuesMode) => void;
  setNodePositions: (mode: ValuesMode, positions: Record<string, Point>) => void;
  setHighlighted: (ids: string[]) => void;
  setListCollapsed: (graph: GraphName, collapsed: boolean) => void;
}

const STORAGE_KEY = 'triplet-project';

function snapshot(s: AppState): Snapshot {
  return { triples: s.triples, distinctPairs: s.distinctPairs, exceptions: s.exceptions };
}

/**
 * A change to the triple list that can be undone (EDIT-06). Exceptions whose
 * triple is gone or was edited are dropped, so an edited triple is asked
 * about again (CHK-07); Undo brings them back with the triple.
 */
function change(
  s: AppState,
  triples: Triple[],
  distinctPairs = s.distinctPairs,
  exceptions = s.exceptions,
): Partial<AppState> {
  const kept = pruneExceptions(exceptions, triples);
  if (
    distinctPairs === s.distinctPairs &&
    kept === s.exceptions &&
    triples.length === s.triples.length &&
    triples.every((t, i) => t === s.triples[i])
  ) {
    return {};
  }
  return { triples, distinctPairs, exceptions: kept, history: record(s.history, snapshot(s)), lastAdded: [] };
}

/** The state a snapshot stands for; positions only come back with a Tidy layout step. */
function restore({ positions, ...rest }: Snapshot): Partial<AppState> {
  return positions ? { ...rest, nodePositions: positions } : rest;
}

/** Exceptions in `list` that aren't in `except`, by content and check (CHK-07). */
function without(list: readonly AcceptedException[], except: readonly AcceptedException[]): AcceptedException[] {
  const gone = new Set(except.map(exceptionKey));
  return list.filter((e) => !gone.has(exceptionKey(e)));
}
const NO_POSITIONS: AppState['nodePositions'] = { separate: {}, onNode: {} };

/**
 * A renamed or merged node keeps where it was dragged (18 Oct 2026): node ids
 * end in the term's key, so its saved positions are copied to the new key.
 * The old ones stay, so Undo finds the node where it was too.
 */
function carryPositions(
  positions: AppState['nodePositions'],
  from: readonly string[],
  to: string,
): AppState['nodePositions'] {
  const out = { ...positions };
  for (const mode of Object.keys(positions) as ValuesMode[]) {
    const next = { ...positions[mode] };
    for (const [key, p] of Object.entries(positions[mode])) {
      const k = from.find((f) => key.endsWith(`#${f}`));
      if (!k) continue;
      const moved = key.slice(0, -k.length) + to;
      if (!(moved in next)) next[moved] = p;
    }
    out[mode] = next;
  }
  return out;
}

/** The snapshot to set aside when stepping to `next`: with positions when that step is a Tidy layout. */
function current(s: AppState, next: Snapshot | undefined): Snapshot {
  return next?.positions ? { ...snapshot(s), positions: s.nodePositions } : snapshot(s);
}

export function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

// localStorage can throw (private windows, full storage). Report it rather
// than lose work silently.
const safeStorage: StateStorage = {
  getItem: (name) => {
    try {
      return localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, value);
      if (useApp.getState().saveFailed) useApp.setState({ saveFailed: false });
    } catch {
      // persist saves again on every setState, so only flip the flag once.
      if (!useApp.getState().saveFailed) useApp.setState({ saveFailed: true });
    }
  },
  removeItem: (name) => {
    try {
      localStorage.removeItem(name);
    } catch {
      /* nothing to do */
    }
  },
};

export const useApp = create<AppState>()(
  persist(
    (set) => ({
      settings: null,
      triples: [],
      view: 'data',
      target: 'data',
      screen: 'main',
      lastAdded: [],
      saveFailed: false,
      panelCollapsed: false,
      valuesMode: 'separate',
      nodePositions: NO_POSITIONS,
      setupDraft: null,
      distinctPairs: [],
      exceptions: [],
      mode: 'sketch',
      flaggedOnly: false,
      history: emptyHistory(),
      dialog: null,
      lastRename: null,
      highlighted: [],
      listCollapsed: { data: false, ontology: false },

      createProject: (settings, triples = []) =>
        set({
          settings,
          triples: triples.map((t) => ({ ...t, id: newId() })),
          lastAdded: [],
          view: 'data',
          target: 'data',
          screen: 'main',
          nodePositions: NO_POSITIONS,
          setupDraft: null,
          distinctPairs: [],
          exceptions: [],
          mode: 'sketch',
          flaggedOnly: false,
          history: emptyHistory(),
          dialog: null,
        }),

      updateSettings: (settings) => set({ settings }),

      resetProject: () =>
        set((s) => ({
          settings: null,
          triples: [],
          lastAdded: [],
          view: 'data',
          target: 'data',
          screen: 'main',
          panelCollapsed: false,
          valuesMode: 'separate',
          nodePositions: NO_POSITIONS,
          setupDraft: s.settings ? setupFromSettings(s.settings) : s.setupDraft,
          distinctPairs: [],
          exceptions: [],
          mode: 'sketch',
          flaggedOnly: false,
          // A new project starts with nothing to undo (GEN-10).
          history: emptyHistory(),
          dialog: null,
        })),

      addTriples: (incoming) =>
        set((s) => {
          if (incoming.length === 0) return {};
          const added = incoming.map((t) => ({ ...t, id: newId() }));
          const graph = incoming[0]?.graph;
          // Show the just-added graph in the graph view, unless both are already shown.
          const view = s.view === 'both' || !graph ? s.view : graph;
          return {
            triples: [...s.triples, ...added],
            lastAdded: added.map((t) => t.id),
            view,
            history: record(s.history, snapshot(s)),
          };
        }),

      // Every other change records the step and ends the "Added" confirmation,
      // whose Undo would otherwise undo this change instead (ENT-07).
      deleteTriple: (id) => set((s) => change(s, s.triples.filter((t) => t.id !== id))),
      deleteTriples: (ids) =>
        set((s) => {
          const gone = new Set(ids);
          return change(s, s.triples.filter((t) => !gone.has(t.id)));
        }),
      replaceTriple: (id, triple) => set((s) => change(s, s.triples.map((t) => (t.id === id ? { ...triple, id } : t)))),
      renameTerm: (triples, from, to) =>
        set((s) => ({
          ...change(s, triples, repointPairs(s.distinctPairs, [from], to), repointExceptions(s.exceptions, [from], to)),
          lastRename: { from: [from], to },
          nodePositions: carryPositions(s.nodePositions, [from], to),
        })),
      setClass: (remove, add) =>
        set((s) => {
          const gone = new Set(remove);
          const kept = s.triples.filter((t) => !gone.has(t.id));
          return change(s, add ? [...kept, { ...add, id: newId() }] : kept);
        }),
      mergeTerms: (triples, from, to) =>
        set((s) => {
          const pairs = repointPairs(s.distinctPairs, from, to);
          // A selected node of either term follows the survivor; so do accepted exceptions.
          const exceptions = repointExceptions(s.exceptions, from, to);
          const gone = from.filter((k) => k !== to);
          return {
            ...change(s, triples, pairs, exceptions),
            lastRename: { from: gone, to },
            nodePositions: carryPositions(s.nodePositions, gone, to),
          };
        }),
      replaceWithTriples: (id, add) =>
        set((s) => change(s, [...s.triples.filter((t) => t.id !== id), ...add.map((t) => ({ ...t, id: newId() }))])),
      tidyLayout: (mode, keys) =>
        set((s) => {
          const kept = { ...s.nodePositions[mode] };
          let removed = false;
          for (const k of keys) {
            if (k in kept) {
              delete kept[k];
              removed = true;
            }
          }
          if (!removed) return {};
          return {
            nodePositions: { ...s.nodePositions, [mode]: kept },
            history: record(s.history, { ...snapshot(s), positions: s.nodePositions }),
            lastAdded: [],
          };
        }),
      flagAgain: (pairs, exceptions = []) =>
        set((s) => {
          const gone = new Set(pairs.map(([x, y]) => [x, y].sort().join('||')));
          const kept = s.distinctPairs.filter(([x, y]) => !gone.has([x, y].sort().join('||')));
          const keptExceptions = without(s.exceptions, exceptions);
          return change(
            s,
            s.triples,
            kept.length === s.distinctPairs.length ? s.distinctPairs : kept,
            keptExceptions.length === s.exceptions.length ? s.exceptions : keptExceptions,
          );
        }),
      acceptExceptions: (list) =>
        set((s) => {
          const fresh = [...new Map(without(list, s.exceptions).map((e) => [exceptionKey(e), e])).values()];
          return fresh.length === 0 ? {} : change(s, s.triples, s.distinctPairs, [...s.exceptions, ...fresh]);
        }),
      unacceptExceptions: (list) =>
        set((s) => {
          const kept = without(s.exceptions, list);
          return kept.length === s.exceptions.length ? {} : change(s, s.triples, s.distinctPairs, kept);
        }),
      // MODE-04: switching never changes triples; Sketch only hides the flags.
      setMode: (mode) => set((s) => ({ mode, flaggedOnly: mode === 'validate' ? s.flaggedOnly : false })),
      setFlaggedOnly: (flaggedOnly) => set({ flaggedOnly }),
      linkTriple: (triple) => set((s) => change(s, [...s.triples, { ...triple, id: newId() }])),
      keepDistinct: (a, b) =>
        set((s) =>
          s.distinctPairs.some(([x, y]) => (x === a && y === b) || (x === b && y === a))
            ? {}
            : change(s, s.triples, [...s.distinctPairs, [a, b]]),
        ),

      undo: () =>
        set((s) => {
          const r = undo(s.history, current(s, s.history.past[s.history.past.length - 1]));
          return r ? { ...restore(r.present), history: r.history, lastAdded: [] } : {};
        }),
      redo: () =>
        set((s) => {
          const r = redo(s.history, current(s, s.history.future[0]));
          return r ? { ...restore(r.present), history: r.history, lastAdded: [] } : {};
        }),
      openDialog: (dialog) => set({ dialog }),

      setView: (view) => set({ view }),
      setTarget: (target) => set({ target }),
      setScreen: (screen) => set({ screen }),
      dismissLastAdded: () => set({ lastAdded: [] }),
      setPanelCollapsed: (panelCollapsed) => set({ panelCollapsed }),
      setValuesMode: (valuesMode) => set({ valuesMode }),
      setNodePositions: (mode, positions) =>
        set((s) => ({ nodePositions: { ...s.nodePositions, [mode]: { ...s.nodePositions[mode], ...positions } } })),
      // Unchanged ids keep the same array, so the list doesn't scroll again on every edit.
      setHighlighted: (highlighted) =>
        set((s) =>
          highlighted.length === s.highlighted.length && highlighted.every((id, i) => id === s.highlighted[i])
            ? {}
            : { highlighted },
        ),
      setListCollapsed: (graph, collapsed) => set((s) => ({ listCollapsed: { ...s.listCollapsed, [graph]: collapsed } })),
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({
        settings: s.settings,
        triples: s.triples,
        distinctPairs: s.distinctPairs,
        exceptions: s.exceptions,
        mode: s.mode,
        view: s.view,
        target: s.target,
        panelCollapsed: s.panelCollapsed,
        valuesMode: s.valuesMode,
        nodePositions: s.nodePositions,
        setupDraft: s.setupDraft,
        listCollapsed: s.listCollapsed,
      }),
    },
  ),
);
