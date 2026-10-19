// Fields shared by the entry form and the Edit triple pop-up: the object's
// Entity / Literal switch and input (ENT-03, ENT-05, LIT-01–02), and the
// line under a field that shows the IRI it will get (ENT-06, ID-08).

import type { Ref } from 'react';
import { suffixClash, validateLiteral } from '../core/entry';
import type { Suggestions } from '../core/suggest';
import { isOwnNs, prefixedName, termKey } from '../core/terms';
import { DATATYPES, type Datatype, type IriTerm, type ProjectSettings, type Triple } from '../core/types';
import { TermCombobox } from './TermCombobox';

const LITERAL_PLACEHOLDERS: Partial<Record<Datatype, string>> = {
  string: 'e.g. VARCHAR(20)',
  integer: 'e.g. 42',
  decimal: 'e.g. 3.14',
};

export type ObjectKind = 'entity' | 'value';

/** LIT-01: the object can be an entity or a literal. */
export function ObjectKindToggle({ kind, onChange }: { kind: ObjectKind; onChange: (kind: ObjectKind) => void }) {
  return (
    <div className="seg small" role="group" aria-label="Object kind">
      {(['entity', 'value'] as const).map((k) => (
        <button key={k} type="button" aria-pressed={kind === k} onClick={() => k !== kind && onChange(k)}>
          {k === 'entity' ? 'Entity' : 'Literal'}
        </button>
      ))}
    </div>
  );
}

/**
 * The object input: a dropdown of existing terms for an entity (ENT-03), or a
 * literal input with a datatype selector and no dropdown (ENT-05).
 */
export function ObjectInput(props: {
  id: string;
  kind: ObjectKind;
  value: string;
  datatype: Datatype;
  onValue: (v: string) => void;
  onDatatype: (dt: Datatype) => void;
  suggestions: Suggestions;
  invalid: boolean;
  placeholder?: string;
}) {
  const { id, kind, value, datatype, onValue, onDatatype, suggestions, invalid, placeholder } = props;
  return (
    <div className="object-row">
      <div className="input-wrap">
        {kind === 'value' ? (
          <LiteralInput id={id} datatype={datatype} value={value} onChange={onValue} invalid={invalid} />
        ) : (
          <TermCombobox
            id={id}
            value={value}
            onChange={onValue}
            suggestions={suggestions}
            placeholder={placeholder}
            invalid={invalid}
            describedBy={invalid ? `${id}-err` : undefined}
          />
        )}
      </div>
      {kind === 'value' && (
        <>
          <label htmlFor={`${id}-dtype`} className="sr-only">
            Datatype
          </label>
          <select
            id={`${id}-dtype`}
            className="input"
            value={datatype}
            onChange={(e) => {
              const dt = e.target.value as Datatype;
              onDatatype(dt);
              // Keep what was typed only if it still fits the new datatype.
              if (value && 'error' in validateLiteral(value, dt)) onValue('');
            }}
          >
            {DATATYPES.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </>
      )}
    </div>
  );
}

/**
 * Literal input suited to its datatype (field checks): True/False choice for
 * booleans, date and date-time pickers, number keyboards for numbers.
 */
export function LiteralInput(props: {
  datatype: Datatype;
  value: string;
  onChange: (v: string) => void;
  invalid: boolean;
  /** The input's id; its error is `${id}-err`. */
  id: string;
  inputRef?: Ref<HTMLInputElement>;
}) {
  const { datatype, value, onChange, invalid, id, inputRef } = props;
  const common = {
    id,
    ref: inputRef,
    'aria-invalid': invalid,
    'aria-describedby': invalid ? `${id}-err` : undefined,
  };
  if (datatype === 'boolean') {
    return (
      <div className="radios" role="radiogroup" aria-label="Literal" aria-invalid={invalid}>
        {['true', 'false'].map((v, i) => (
          <label key={v} className="radio">
            <input
              type="radio"
              name={`${id}-bool`}
              id={i === 0 ? id : undefined}
              checked={value === v}
              onChange={() => onChange(v)}
            />
            {v === 'true' ? 'True' : 'False'}
          </label>
        ))}
      </div>
    );
  }
  if (datatype === 'date' || datatype === 'dateTime') {
    return (
      <input
        {...common}
        className="input mono"
        type={datatype === 'date' ? 'date' : 'datetime-local'}
        step={datatype === 'dateTime' ? 1 : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  return (
    <input
      {...common}
      className="input mono"
      autoComplete="off"
      inputMode={datatype === 'integer' ? 'numeric' : datatype === 'decimal' ? 'decimal' : undefined}
      placeholder={LITERAL_PLACEHOLDERS[datatype]}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/**
 * ENT-06: the IRI a field's term will have, and whether it exists already.
 * ID-08: a new name whose IRI is taken by a differently typed one says so.
 */
export function TermHint({
  term,
  triples,
  known,
  settings,
}: {
  term: IriTerm | undefined;
  triples: readonly Triple[];
  known: ReadonlyMap<string, IriTerm>;
  settings: ProjectSettings;
}) {
  if (!term) return null;
  const exists = known.has(termKey(term));
  const clash = !exists && isOwnNs(term.ns) ? suffixClash(term, triples) : undefined;
  return (
    <div className="hint" aria-live="polite">
      {prefixedName(term, settings)}
      {isOwnNs(term.ns) ? (exists ? ' · existing' : ' · new') : ''}
      {clash && (
        <span className="hint-note">
          {' '}
          {prefixedName(clash, settings)} is already “{clash.label}”, so this gets its own IRI.
        </span>
      )}
    </div>
  );
}
