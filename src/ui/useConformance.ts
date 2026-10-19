// The conformance check as the UI sees it (CHK-01–10): derived from the triple
// store on every change, never stored (CHK-07). In Sketch mode there are no
// flags to show (MODE-04).

import { useMemo } from 'react';
import { checkConformance, type Conformance } from '../core/conformance';
import { useApp } from './store';

export function useConformance(): Conformance | null {
  const triples = useApp((s) => s.triples);
  const exceptions = useApp((s) => s.exceptions);
  const validate = useApp((s) => s.mode === 'validate');
  return useMemo(() => (validate ? checkConformance(triples, exceptions) : null), [validate, triples, exceptions]);
}
