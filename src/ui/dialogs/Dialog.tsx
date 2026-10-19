// Shared pop-up shell: a modal <dialog> keeps focus inside and closes on
// Escape. `initialFocus` says which control starts focused (Cancel for
// destructive pop-ups, EDIT-04).

import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { objectText, sameTerm } from '../../core/terms';
import type { IriTerm, ObjectTerm, Triple } from '../../core/types';

export function Dialog({
  titleId,
  descId,
  role = 'dialog',
  className,
  initialFocus,
  onClose,
  children,
}: {
  titleId: string;
  descId?: string;
  role?: 'dialog' | 'alertdialog';
  className?: string;
  initialFocus?: RefObject<HTMLElement | null>;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    const d = ref.current;
    opener.current = document.activeElement;
    if (d && !d.open) d.showModal();
    initialFocus?.current?.focus();
    return () => {
      d?.close();
      // Back to whatever opened the pop-up, if it is still on the page.
      const back = opener.current;
      // Not when another pop-up has taken over (Edit triple → Rename).
      requestAnimationFrame(() => {
        if (back instanceof HTMLElement && back.isConnected && !document.querySelector('dialog[open]')) back.focus();
      });
    };
    // Runs once per pop-up.
  }, []);

  return (
    <dialog
      ref={ref}
      className={`dialog${className ? ` ${className}` : ''}`}
      role={role}
      aria-labelledby={titleId}
      aria-describedby={descId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      {children}
    </dialog>
  );
}

export function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="dialog-close" aria-label="Close" onClick={onClick}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  );
}

/** Triples as subject · predicate · object rows, with `term` in bold wherever it appears (SCR-06, SCR-07). */
export function TripleRows({ triples, term, label }: { triples: readonly Triple[]; term?: IriTerm; label: string }) {
  const cell = (x: ObjectTerm, muted = false) => {
    const strong = term && x.kind === 'iri' && sameTerm(x, term);
    const text = objectText(x);
    if (strong) return <b>{text}</b>;
    return <span className={x.kind === 'literal' ? 'mono' : muted ? 'pred' : undefined}>{text}</span>;
  };
  return (
    <ul className="drows" aria-label={label}>
      {triples.map((t) => (
        <li key={t.id}>
          {cell(t.s)}
          {cell(t.p, true)}
          {cell(t.o)}
        </li>
      ))}
    </ul>
  );
}

export function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}
