// Entry form (ENT-01–07, LIT-01–02, TYPE-01–03). Subject, predicate and an
// entity object are dropdowns of existing terms (ENT-03, ENT-04, PFX-02).

import { useMemo, useRef, useState, type FormEvent } from 'react';
import { literalPreview, resolveEntry, type EntryDraft, type EntryField, type RelationshipOffer } from '../core/entry';
import { suggest } from '../core/suggest';
import { collectTerms, objectText, termKey } from '../core/terms';
import { currentClassOf, pickerClasses } from '../core/typing';
import type { GraphName, IriTerm, ProjectSettings, Triple } from '../core/types';
import { ObjectInput, ObjectKindToggle, TermHint } from './fields';
import { InfoPopover } from './InfoPopover';
import { useApp } from './store';
import { TermCombobox } from './TermCombobox';

type Draft = Omit<EntryDraft, 'graph'>;

const EMPTY: Draft = {
  subject: '',
  classKey: '',
  objectClassKey: '',
  predicate: '',
  objectKind: 'entity',
  object: '',
  datatype: 'string',
};

const PLACEHOLDERS: Record<GraphName, { subject: string; predicate: string; object: string }> = {
  data: { subject: 'e.g. CRM', predicate: 'e.g. has physical data element', object: 'e.g. CUST_ID' },
  ontology: { subject: 'e.g. Physical data element', predicate: 'e.g. domain', object: 'e.g. System' },
};

const GRAPH_TITLE: Record<GraphName, string> = { data: 'Data graph', ontology: 'Ontology graph' };

export function EntryForm({ settings }: { settings: ProjectSettings }) {
  const triples = useApp((s) => s.triples);
  const target = useApp((s) => s.target);
  const setTarget = useApp((s) => s.setTarget);
  const addTriples = useApp((s) => s.addTriples);
  const lastAdded = useApp((s) => s.lastAdded);
  const undo = useApp((s) => s.undo);

  const [drafts, setDrafts] = useState<Record<GraphName, Draft>>({ data: EMPTY, ontology: EMPTY });
  const [shownErrors, setShownErrors] = useState<Partial<Record<EntryField, string>>>({});
  const predicateRef = useRef<HTMLInputElement>(null);

  const draft = drafts[target];
  const isData = target === 'data';
  const classes = useMemo(() => pickerClasses(triples), [triples]);
  const known = useMemo(() => collectTerms(triples), [triples]);
  const result = useMemo(
    () => resolveEntry({ ...draft, graph: target }, triples, settings),
    [draft, target, triples, settings],
  );
  // ENT-03, ENT-04: what each dropdown offers for the text typed so far.
  const base = { graph: target, triples, settings };
  const subjectOptions = useMemo(
    () => suggest({ ...base, field: 'subject', text: draft.subject }),
    [target, triples, settings, draft.subject],
  );
  const predicateOptions = useMemo(
    () => suggest({ ...base, field: 'predicate', text: draft.predicate }),
    [target, triples, settings, draft.predicate],
  );
  const objectOptions = useMemo(
    () => suggest({ ...base, field: 'object', text: draft.object, predicate: result.preview.predicate }),
    [target, triples, settings, draft.object, result.preview.predicate],
  );

  // Field checks: a field's error shows as soon as it has content; empty
  // fields are only flagged when the user presses Add.
  const filled: Record<EntryField, boolean> = {
    subject: draft.subject.trim() !== '',
    predicate: draft.predicate.trim() !== '',
    object: draft.object.trim() !== '',
  };
  const errors: Partial<Record<EntryField, string>> = { ...shownErrors };
  for (const f of ['subject', 'predicate', 'object'] as const) {
    if (filled[f] && result.errors[f]) errors[f] = result.errors[f];
  }

  // The class picker follows the subject: typing a subject that already has a
  // class shows that class; one picked for a new subject stays until changed.
  const setSubject = (text: string) => {
    const existing = currentClassOf(triples, text);
    const before = currentClassOf(triples, draft.subject);
    setDrafts((d) => {
      const cur = d[target];
      const next: Draft = { ...cur, subject: text };
      if (target === 'data') {
        if (existing) next.classKey = existing;
        else if (before && cur.classKey === before) next.classKey = '';
      }
      return { ...d, [target]: next };
    });
    setShownErrors((e) => ({ ...e, subject: undefined }));
  };

  // The object's class picker follows a known object the same way (18 Oct 2026).
  const setObject = (text: string) => {
    const following = target === 'data' && draft.objectKind === 'entity';
    const existing = following ? currentClassOf(triples, text) : undefined;
    const before = following ? currentClassOf(triples, draft.object) : undefined;
    setDrafts((d) => {
      const cur = d[target];
      const next: Draft = { ...cur, object: text };
      if (existing) next.objectClassKey = existing;
      else if (before && cur.objectClassKey === before) next.objectClassKey = '';
      return { ...d, [target]: next };
    });
    setShownErrors((e) => ({ ...e, object: undefined }));
  };

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDrafts((d) => ({ ...d, [target]: { ...d[target], [key]: value } }));
    const field: EntryField | undefined =
      key === 'subject' || key === 'classKey' ? 'subject' : key === 'predicate' ? 'predicate' : 'object';
    setShownErrors((e) => ({
      ...e,
      [field]: undefined,
      ...(key === 'classKey' ? { predicate: undefined, object: undefined } : {}),
    }));
  };

  const switchTab = (g: GraphName) => {
    setTarget(g);
    setShownErrors({});
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (Object.keys(result.errors).length > 0) {
      setShownErrors(result.errors);
      return;
    }
    addTriples(result.triples);
    // Keep the subject so several triples about it can be added in a row.
    setDrafts((d) => ({
      ...d,
      [target]: {
        ...d[target],
        // The subject and its class are kept for the next entry. A ticked subject
        // is a class now (shown as "already"), so the tick can clear for the next one.
        subjectIsClass: false,
        objectClassKey: '',
        predicate: '',
        object: '',
        asRelationship: undefined,
        objectIsClass: undefined,
      },
    }));
    setShownErrors({});
    predicateRef.current?.focus();
  };

  const iriHint = (term: IriTerm | undefined) => (
    <TermHint term={term} triples={triples} known={known} settings={settings} />
  );

  const objectHint = (() => {
    if (isData || draft.objectKind === 'value' || errors.object || filled.object) return null;
    const p = result.preview.predicate;
    if (p?.ns === 'vocab:rdf' && p.local === 'type')
      return 'Class, ObjectProperty, DatatypeProperty, FunctionalProperty, or a prefixed name.';
    if (p?.ns === 'vocab:rdfs' && p.local === 'range')
      return 'A class, or a datatype: string, integer, decimal, boolean, date, dateTime.';
    return null;
  })();

  // Only confirm additions to the tab being shown, so the target graph is never in doubt (ENT-02).
  const added = lastAdded
    .map((id) => triples.find((t) => t.id === id))
    .filter((t) => t !== undefined && t.graph === target) as Triple[];
  const placeholders = PLACEHOLDERS[target];
  const objectClassPicker = isData && draft.objectKind === 'entity';

  return (
    <form className={`entry ${target}`} onSubmit={submit} noValidate>
      <div role="tablist" aria-label="Graph to add to" className="tabs">
        {(['data', 'ontology'] as const).map((g) => (
          <button
            key={g}
            type="button"
            role="tab"
            className="tab"
            aria-selected={target === g}
            onClick={() => switchTab(g)}
          >
            <span className="t1">{GRAPH_TITLE[g]}</span>
            <span className="t2">{g === 'data' ? 'Instances' : 'Classes and properties'}</span>
          </button>
        ))}
      </div>

      <div className="entry-body" role="tabpanel" aria-label={GRAPH_TITLE[target]}>
        <div className={`strip${isData ? '' : ' inverted'}`}>
          <span className="t1">Adding to {GRAPH_TITLE[target]}</span>
          <span className="t2">
            {settings[target].prefix}: {settings[target].namespace}
          </span>
        </div>

        <div className={isData ? 'row2' : undefined}>
          <div className="field">
            <div className="field-head">
              <label htmlFor="f-subj">Subject</label>
              {!isData && (
                <ClassTick
                  id="f-subj-class"
                  already={result.alreadyClass.subject}
                  checked={!!draft.subjectIsClass}
                  onChange={(v) => set('subjectIsClass', v)}
                />
              )}
            </div>
            <TermCombobox
              id="f-subj"
              placeholder={placeholders.subject}
              value={draft.subject}
              onChange={setSubject}
              suggestions={subjectOptions}
              invalid={!!errors.subject}
              describedBy={errors.subject ? 'f-subj-err' : undefined}
            />
            {errors.subject ? (
              <div id="f-subj-err" className="error">
                {errors.subject}
              </div>
            ) : (
              iriHint(result.preview.subject)
            )}
          </div>
          {isData && (
            <div className="field">
              <label htmlFor="f-class">
                Class <span className="opt">· optional, from your ontology</span>
              </label>
              <ClassSelect
                id="f-class"
                classes={classes}
                value={draft.classKey ?? ''}
                onChange={(v) => set('classKey', v)}
              />
            </div>
          )}
        </div>

        <div className="field">
          <div className="label-row">
            <label htmlFor="f-pred">Predicate</label>
            <PredicateHelp />
          </div>
          <TermCombobox
            id="f-pred"
            inputRef={predicateRef}
            placeholder={placeholders.predicate}
            value={draft.predicate}
            onChange={(v) => set('predicate', v)}
            suggestions={predicateOptions}
            invalid={!!errors.predicate}
            describedBy={errors.predicate ? 'f-pred-err' : undefined}
          />
          {errors.predicate ? (
            <div id="f-pred-err" className="error">
              {errors.predicate}
            </div>
          ) : (
            draft.predicate.trim() !== '' && iriHint(result.preview.predicate)
          )}
        </div>

        <div className={objectClassPicker ? 'row2' : undefined}>
          <div className="field">
            <div className="field-head">
              <div className="label-row">
                <label htmlFor="f-obj">Object</label>
                <ObjectKindToggle
                  kind={draft.objectKind}
                  onChange={(k) => {
                    set('objectKind', k);
                    // An entity name and a literal rarely make sense as each other; a class
                    // filled in from the old object goes with it.
                    setObject('');
                  }}
                />
              </div>
              {!isData && draft.objectKind === 'entity' && (
                <ClassTick
                  id="f-obj-class-tick"
                  already={result.alreadyClass.object}
                  checked={!!draft.objectIsClass}
                  onChange={(v) => set('objectIsClass', v)}
                />
              )}
            </div>
            <ObjectInput
              id="f-obj"
              kind={draft.objectKind}
              value={draft.object}
              datatype={draft.datatype}
              onValue={setObject}
              onDatatype={(dt) => set('datatype', dt)}
              suggestions={objectOptions}
              invalid={!!errors.object}
              placeholder={placeholders.object}
            />
            {errors.object && (
              <div id="f-obj-err" className="error">
                {errors.object}
              </div>
            )}
            {objectHint && <div className="hint plain">{objectHint}</div>}
            {/* ENT-06: preview of the object's IRI, or of the literal as exported. */}
            {!errors.object && result.preview.object && iriHint(result.preview.object)}
            {!errors.object && result.preview.literal && filled.object && (
              <div className="hint" aria-live="polite">
                {literalPreview(result.preview.literal)}
              </div>
            )}
          </div>
          {/* TYPE-01: an entity object on the Data tab can be given a class too, labelled like the subject's. */}
          {objectClassPicker && (
            <div className="field">
              <label htmlFor="f-obj-class">
                Class <span className="opt">· optional, from your ontology</span>
              </label>
              <ClassSelect
                id="f-obj-class"
                classes={classes}
                value={draft.objectClassKey ?? ''}
                onChange={(v) => set('objectClassKey', v)}
              />
            </div>
          )}
        </div>

        {/* ENT-12: a gentle hint when the user's own relationship links two terms that aren't classes. */}
        {result.classHint && !errors.subject && !errors.object && (
          <p className="class-hint" role="status">
            “{result.classHint.subject.label}” and “{result.classHint.object.label}” aren't classes. If they're kinds of
            things, tick “Class” beside them to record “{draft.predicate.trim()}” as a relationship between them.
          </p>
        )}

        {/* Hidden while the predicate has a problem, e.g. a clashing pairing (ENT-11). */}
        {result.relationship && !errors.predicate && (
          <RelationshipNotice
            offer={result.relationship}
            onChoose={(asRelationship) => set('asRelationship', asRelationship)}
          />
        )}

        <div className="actions-right">
          {/* Greyed out until the entry can be added; a click still shows what's missing (agreed 17 Oct 2026). */}
          <button
            type="submit"
            className="btn primary"
            aria-disabled={Object.keys(result.errors).length > 0 || result.triples.length === 0}
          >
            {result.relationship?.recorded ? 'Add relationship to Ontology graph' : `Add to ${GRAPH_TITLE[target]}`}
          </button>
        </div>

        {/* ENT-07: confirmation of what was added, with Undo. Any later change ends it (store). */}
        {added.length > 0 && (
          <div className="confirm" role="status">
            <span>
              Added to {GRAPH_TITLE[added[0].graph]}: <b>{added[0].s.label}</b> · {added[0].p.label} ·{' '}
              <b>{objectText(added[0].o)}</b>
              {added.slice(1).map((t) => (
                <span key={t.id}>
                  ; {t.s.label} · {t.p.label} · {objectText(t.o)}
                </span>
              ))}
            </span>
            <button type="button" className="btn xs" onClick={undo}>
              Undo
            </button>
          </div>
        )}
      </div>
    </form>
  );
}

/** Optional class picker listing the Ontology graph's classes (TYPE-01, TYPE-05). */
function ClassSelect(props: { id: string; classes: IriTerm[]; value: string; onChange: (v: string) => void }) {
  const { id, classes, value, onChange } = props;
  return (
    <select
      id={id}
      className="input"
      value={value}
      disabled={classes.length === 0}
      onChange={(e) => onChange(e.target.value)}
    >
      {classes.length === 0 ? (
        <option value="">No classes yet</option>
      ) : (
        <>
          <option value="">No class</option>
          {classes.map((c) => (
            <option key={termKey(c)} value={termKey(c)}>
              {c.label}
            </option>
          ))}
        </>
      )}
    </select>
  );
}

/** In-app help: the predicates with a standard meaning and what Triplet does with them (agreed 16 Oct 2026). */
function PredicateHelp() {
  return (
    <InfoPopover label="Predicates with a special meaning" title="Predicates with a special meaning">
      <p>Most predicates mean what you say they mean. These come from standard vocabularies and carry extra meaning:</p>
      <dl>
        <dt>type</dt>
        <dd>
          Says what class something is, e.g. “CRM · type · System”. You rarely type it yourself: picking a class in the
          Class picker adds this triple for you, and it's what gives a data card its class colour. On the Ontology tab
          it says what kind of term something is, e.g. Class, or ObjectProperty for a relationship between two classes.
        </dd>
        <dt>subclass of</dt>
        <dd>One class is a kind of another, its parent. For example, every Savings account is also an Account.</dd>
        <dt>domain</dt>
        <dd>
          The class a relationship starts from. Its subjects are of this class: “belongs to · domain · Account” means
          only Accounts belong to things.
        </dd>
        <dt>range</dt>
        <dd>
          The class a relationship points to (or a literal type such as date). Its objects are of this class: “belongs
          to · range · Customer” means things belong to Customers. Together they read as one arrow: Account → belongs to
          → Customer. A relationship links one pairing of classes, so give each pairing its own name.
        </dd>
        <dt>rdfs:subPropertyOf</dt>
        <dd>One relationship is a kind of another.</dd>
        <dt>label, definition</dt>
        <dd>A readable name and a one-line description. Your own terms get a label automatically.</dd>
      </dl>
      <p>
        Each statement is one triple. Saying “an Account belongs to a Customer” takes two: one domain and one range. The
        graph draws them as one arrow.
      </p>
      <p>
        On the Ontology tab, tick “Class” beside the subject or object when it is a class (a kind of thing). When both
        are classes, Triplet offers to do this for you: type “Account · belongs to · Customer” and it records the domain
        and range.
      </p>
    </InfoPopover>
  );
}

/**
 * ENT-09: when the subject and object are both classes, the entry is recorded
 * as a relationship (its domain and range). Says so plainly and lets the user
 * add the plain triple instead.
 */
function RelationshipNotice({
  offer,
  onChoose,
}: {
  offer: RelationshipOffer;
  onChoose: (asRelationship: boolean) => void;
}) {
  const { property: p, domain, range, recorded, newClasses } = offer;
  const alsoClasses = newClasses.length > 0 && (
    <>
      {' '}
      Also records {newClasses.map((c) => `“${c.label}”`).join(' and ')} as {newClasses.length === 1 ? 'a class' : 'classes'}.
    </>
  );
  return (
    <div className="rel-notice" role="status">
      <p>
        <b>“{domain.label}”</b> and <b>“{range.label}”</b> are both classes, so this can be recorded as a relationship: “
        {p.label}” goes from “{domain.label}” to “{range.label}”.
      </p>
      <div className="radios" role="radiogroup" aria-label="How to record this entry">
        <label className="radio">
          <input type="radio" name="rel-choice" checked={recorded} onChange={() => onChoose(true)} />
          Record as a relationship (recommended)
        </label>
        <label className="radio">
          <input type="radio" name="rel-choice" checked={!recorded} onChange={() => onChoose(false)} />
          Add as a plain triple
        </label>
      </div>
      {recorded ? (
        <p className="rel-detail">
          Adds two triples:{' '}
          <span className="mono">
            {p.label} · domain · {domain.label}
          </span>{' '}
          and{' '}
          <span className="mono">
            {p.label} · range · {range.label}
          </span>
          . The graph shows them as one arrow.{alsoClasses}
        </p>
      ) : (
        <p className="rel-detail">
          Adds one triple, exactly as typed. Graph tools won't read it as a rule for “{domain.label}” data.{alsoClasses}
        </p>
      )}
    </div>
  );
}

/**
 * ENT-10: "Class" tick box beside the Ontology tab's subject and object. Ticked
 * and greyed out when the term is already a class.
 */
function ClassTick(props: { id: string; already: boolean; checked: boolean; onChange: (v: boolean) => void }) {
  const { id, already, checked, onChange } = props;
  return (
    <label
      className={`tick${already ? ' already' : ''}`}
      htmlFor={id}
      title={already ? 'Already a class in your ontology' : 'Tick if this is a class, a kind of thing'}
    >
      <input
        id={id}
        type="checkbox"
        checked={already || checked}
        disabled={already}
        onChange={(e) => onChange(e.target.checked)}
      />
      {already ? 'Class (already)' : 'Class'}
    </label>
  );
}
