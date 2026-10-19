// Class colours for Data graph rows and nodes (TYPE-04, GEN-09). Colours are
// handed out by the order classes appear in the Ontology graph, so no class
// is hard-coded (GEN-04). Palette from the design's Main screen.

import type { Triple } from './types';
import { termKey } from './terms';
import { inferOntologyTyping } from './typing';
import { RDF_TYPE } from './vocab';

export const CLASS_PALETTE = [
  '#2563EB',
  '#15803D',
  '#92400E',
  '#C2410C',
  '#6D28D9',
  '#0F766E',
  '#BE185D',
  '#0369A1',
  '#4D7C0F',
  '#A21CAF',
];

/** Colour for a Data graph node with no class. */
export const UNTYPED_COLOUR = '#8a8a8a';

export function classColours(triples: readonly Triple[]): Map<string, string> {
  const out = new Map<string, string>();
  inferOntologyTyping(triples).classes.forEach((c, i) => out.set(termKey(c), CLASS_PALETTE[i % CLASS_PALETTE.length]));
  return out;
}

/** Each Data graph subject's class colour, from its first rdf:type that is a known class. */
export function subjectColours(triples: readonly Triple[]): Map<string, string> {
  const colours = classColours(triples);
  const out = new Map<string, string>();
  const typeKey = termKey(RDF_TYPE);
  for (const t of triples) {
    if (t.graph !== 'data' || termKey(t.p) !== typeKey || t.o.kind !== 'iri') continue;
    const sk = termKey(t.s);
    const c = colours.get(termKey(t.o));
    if (c && !out.has(sk)) out.set(sk, c);
  }
  return out;
}
