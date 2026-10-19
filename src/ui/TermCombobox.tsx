// ENT-03: a text field with a dropdown of existing terms, filtered as the user
// types, ending with "+ Add as new" when the text names nothing listed.
// Picking a prefix (PFX-02) fills it in and keeps the list open on its terms.
// Used by the entry form and the Edit triple pop-up.

import { useEffect, useId, useRef, useState, type KeyboardEvent, type Ref } from 'react';
import type { Suggestion, Suggestions } from '../core/suggest';

export function TermCombobox(props: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  suggestions: Suggestions;
  placeholder?: string;
  inputRef?: Ref<HTMLInputElement>;
  invalid?: boolean;
  describedBy?: string;
}) {
  const { id, value, onChange, suggestions, placeholder, inputRef, invalid, describedBy } = props;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = `${id}-list`;
  const optId = `${useId()}-opt`;
  const { options, heading } = suggestions;
  const shown = open && options.length > 0;

  // Keep the highlighted option in view while moving through a long list.
  useEffect(() => {
    if (!shown || active < 0) return;
    listRef.current?.querySelector(`#${CSS.escape(`${optId}-${active}`)}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, shown, optId]);

  const pick = (o: Suggestion) => {
    onChange(o.value);
    // A prefix leads on to its terms; anything else completes the field.
    setOpen(o.kind === 'prefix');
    setActive(-1);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) setOpen(true);
      if (options.length === 0) return;
      const n = options.length;
      setActive((i) => (e.key === 'ArrowDown' ? (i >= n - 1 ? 0 : i + 1) : i <= 0 ? n - 1 : i - 1));
    } else if (e.key === 'Enter' && shown && active >= 0 && active < options.length) {
      // Picks the option rather than submitting the form.
      e.preventDefault();
      pick(options[active]);
    } else if (e.key === 'Escape' && shown) {
      // Closes the list, not the pop-up it is in.
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      setActive(-1);
    }
  };

  const activeId = shown && active >= 0 ? `${optId}-${active}` : undefined;
  const lower = value.trim().toLowerCase();

  return (
    <div className="combo">
      <input
        id={id}
        ref={inputRef}
        className="input"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={shown}
        aria-controls={listId}
        aria-activedescendant={activeId}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        // An empty field shows what it offers straight away; a filled one
        // (e.g. in Edit triple) waits for a click, typing or the arrow keys.
        onFocus={() => value.trim() === '' && setOpen(true)}
        onClick={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          setActive(-1);
        }}
        onKeyDown={onKeyDown}
      />
      <svg className="combo-caret" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 9l6 6 6-6" />
      </svg>
      <div id={listId} ref={listRef} role="listbox" aria-label={heading} className="combo-list" hidden={!shown}>
        {shown && (
          <>
            <div className="combo-heading" aria-hidden="true">
              {heading}
            </div>
            {options.map((o, i) => (
              <div
                key={o.id}
                id={`${optId}-${i}`}
                role="option"
                aria-selected={i === active}
                className={`combo-opt ${o.kind}${o.kind === 'term' && o.value.toLowerCase() === lower ? ' match' : ''}`}
                // Keeps focus in the field, so the list doesn't close before the pick.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(o)}
                onMouseMove={() => i !== active && setActive(i)}
              >
                <span className="combo-label">{o.label}</span>
                {o.hint && <span className="combo-hint">{o.hint}</span>}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
