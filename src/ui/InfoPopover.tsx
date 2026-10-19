// A small (i) button that opens a short help panel (in-app help, agreed 16 Oct 2026).

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

export function InfoPopover({ label, title, children }: { label: string; title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span className="info" ref={wrap}>
      <button
        ref={button}
        type="button"
        className="info-btn"
        aria-label={label}
        title={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
      >
        i
      </button>
      {open && (
        <div id={id} className="info-panel" role="dialog" aria-label={title}>
          <div className="info-title">{title}</div>
          {children}
        </div>
      )}
    </span>
  );
}
