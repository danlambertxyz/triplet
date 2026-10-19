// ID-06: readable local names generated from what the user types.
//
// Split the typed name into words at spaces and at any punctuation other than
// "_"; capitalise the first letter of each word and keep the rest exactly as
// typed; join them. For predicates the first letter of the result is then
// made lower case. Underscores, digits and existing capitals are kept.
//
// Anything that is not a letter, digit, combining mark or underscore counts as
// a separator, so symbols never end up in an IRI (ID-05). The text is first
// put in its composed Unicode form (NFC), so "é" typed either way gives the
// same IRI.

export type NameKind = 'entity' | 'predicate';

const SEPARATOR = /[^\p{L}\p{M}\p{N}_]+/u;

export function toLocalName(typed: string, kind: NameKind): string {
  const words = typed.normalize('NFC').split(SEPARATOR).filter((w) => w.length > 0);
  const joined = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
  if (kind === 'predicate' && joined.length > 0) {
    return joined.charAt(0).toLowerCase() + joined.slice(1);
  }
  return joined;
}
