// User guide (added 17 Oct 2026 on review), opened from the "?" in
// the top bar. A short, plain-language account of how Triplet behaves,
// including the rules agreed in the requirements' decision log. Keep it in
// step when behaviour changes. Sections fold, so the guide stays scannable.

import { useRef } from 'react';
import { CloseButton, Dialog } from './Dialog';

export function HelpDialog({ onClose }: { onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  return (
    <Dialog titleId="help-title" className="help" onClose={onClose}>
      <div className="dialog-head row">
        <div className="dialog-head-text">
          <h2 id="help-title">How Triplet works</h2>
          <p>A short guide to building a knowledge graph here. Click a section to open it.</p>
        </div>
        <CloseButton onClick={onClose} />
      </div>
      <div className="dialog-body help-body">
        <details open>
          <summary>The basics</summary>
          <p>
            You build the graph one <b>triple</b> at a time: a <b>subject</b>, a <b>predicate</b> (the relationship)
            and an <b>object</b>, e.g. CRM · has dataset · Client Master.
          </p>
          <ul>
            <li>
              The <b>Data graph</b> holds the actual things (instances): your systems, data elements, processes.
            </li>
            <li>
              The <b>Ontology graph</b> holds the model: the classes (kinds of thing) and the relationships allowed
              between them.
            </li>
            <li>
              Everything you add appears in the triple list, in the graph and in the export. They all read the same
              triples, so they always agree.
            </li>
            <li>Your work saves automatically in this browser. Nothing is sent anywhere.</li>
          </ul>
        </details>

        <details>
          <summary>Predicates you can use</summary>
          <ul>
            <li>
              <b>Data tab:</b> your own relationships (e.g. has dataset), plus the common ones <i>type</i>,{' '}
              <i>label</i> and <i>definition</i>.
            </li>
            <li>
              <b>Ontology tab:</b> <i>subclass of</i>, <i>domain</i>, <i>range</i>, <i>type</i>, <i>label</i>,{' '}
              <i>definition</i>, plus your own relationships.
            </li>
            <li>
              Any standard term can be typed as a prefixed name, e.g. <span className="mono">skos:prefLabel</span>.
              Typing a prefix and a colon lists its common terms. Your own prefixes are added under Settings (⚙).
            </li>
          </ul>
        </details>

        <details>
          <summary>Names and IRIs</summary>
          <ul>
            <li>
              Every name you type becomes an IRI, the term's identity in the export. Things and classes are joined
              in capitalised words (Client ID → <span className="mono">data:ClientID</span>); relationships start
              lower case (works for → <span className="mono">worksFor</span>). The text you typed is kept as its
              label.
            </li>
            <li>
              The dropdowns reuse terms you already have. Pick “+ Add as new” to create a new one.
            </li>
            <li>
              Names are case-sensitive: “date of birth” is a different term from “Date of Birth”. As both would give
              the same IRI, the newer one gets a number (<span className="mono">DateOfBirth_2</span>) and the pair is
              flagged as a possible duplicate. Two terms never silently share an IRI.
            </li>
            <li>
              The IRIs start with your project's base address and graph name, set when you start a project and
              changeable under Settings. Changing them updates every IRI in the next export.
            </li>
          </ul>
        </details>

        <details>
          <summary>Classes and relationships</summary>
          <ul>
            <li>
              On the Data tab, the <b>Class</b> picker says what kind of thing the subject (or object) is. It adds
              “… · type · Class” to the Data graph. Typing a subject or object that already has a class fills the picker
              in; you can still change it.
            </li>
            <li>
              On the Ontology tab, tick <b>Class</b> beside a name to record it as a class.
            </li>
            <li>
              Class · relationship · Class (e.g. System · has dataset · Dataset) is recorded as the relationship's{' '}
              <i>domain</i> and <i>range</i>: it goes from that class to that one. You can choose a plain triple
              instead.
            </li>
            <li>
              A relationship may go from several classes or to several classes, but not both, so its meaning stays
              clear. Several are exported as one “either/or” statement.
            </li>
            <li>Classes and properties are typed automatically in the export; you never pick owl:Class yourself.</li>
          </ul>
        </details>

        <details>
          <summary>Literals</summary>
          <p>
            Switch the object to <b>Literal</b> for a value rather than a thing, e.g. a date or a number. Pick its
            datatype (string, integer, decimal, boolean, date, dateTime) and it exports with it, e.g.{' '}
            <span className="mono">"2026-10-14"^^xsd:date</span>. The graph shows literals as small dashed nodes, or
            listed on their subject with <b>On node</b>.
          </p>
        </details>

        <details>
          <summary>Editing and Undo</summary>
          <ul>
            <li>
              The pencil in the list edits one triple. Selecting a node in the graph offers <b>Rename</b> (updates
              every triple that uses it, and its IRI), <b>Set class</b>, <b>Merge</b> and <b>Delete</b>. Selecting an
              arrow shows the triples behind it.
            </li>
            <li>
              Nothing is removed, merged or renamed until you confirm, and the pop-up always lists the triples
              affected.
            </li>
            <li>
              <b>Undo</b> and <b>Redo</b> (⌘Z, ⇧⌘Z) step through your changes, including duplicate choices. The
              history lasts until you close the page.
            </li>
            <li>The same triple can't be added twice; the form says so.</li>
          </ul>
        </details>

        <details>
          <summary>Duplicates</summary>
          <p>
            Triplet looks for possible duplicates every time something changes. A notice above the triple list says
            how many there are; <b>Review</b> shows each pair side by side with the triples that use them.
          </p>
          <h3>What it spots</h3>
          <ul>
            <li>The same triple entered more than once (in older projects; new entries are refused).</li>
            <li>
              Names that differ only by capital letters, spacing or punctuation: Acme Bank, ACME bank and Acme-Bank.
            </li>
            <li>A name that got a number because another had its IRI (DateOfBirth and DateOfBirth_2).</li>
            <li>
              Relationships that are different forms of the same words: works for, worked for, working for; uses and
              used.
            </li>
          </ul>
          <h3>What it doesn't spot (yet)</h3>
          <ul>
            <li>Different words for the same thing: works for and employed by; DOB and Date of Birth.</li>
            <li>Spelling mistakes: Adress and Address.</li>
            <li>
              A thing in the Data graph and a class of the same name in the Ontology graph (usually on purpose), a
              thing and a relationship, or standard terms such as rdfs:label.
            </li>
          </ul>
          <h3>Your choices</h3>
          <ul>
            <li>
              <b>Merge into one:</b> pick the name to keep. Every triple of the other moves onto it, and triples that
              become identical are combined. The kept term keeps its IRI, except that a numbered name such as
              DateOfBirth_2 takes back the plain DateOfBirth once the other is gone.
            </li>
            <li>
              <b>Keep one, remove the other:</b> deletes one of them and every triple that uses it. You see the list
              first.
            </li>
            <li>
              <b>Keep both and mark them as the same thing:</b> both stay, and a link is added saying they are the
              same: <span className="mono">owl:sameAs</span> for two things,{' '}
              <span className="mono">owl:equivalentClass</span> for two classes,{' '}
              <span className="mono">owl:equivalentProperty</span> for two relationships. It is a triple like any
              other, in the list and the export. Graph databases that reason over OWL then treat the two as one. Use
              it when both names are needed, e.g. because other systems already use them.
            </li>
            <li>
              <b>Keep both as different things:</b> nothing changes and the pair isn't flagged again. The choice is
              saved with the project but not exported. Settings lists these pairs, so you can have them flagged again.
            </li>
            <li>
              <b>Decide later:</b> moves on; the pair stays flagged.
            </li>
          </ul>
          <p>
            <b>Merge</b> on a selected node opens its flagged pair, or lets you pick any term of the same kind in the
            same graph to merge it with.
          </p>
        </details>

        <details>
          <summary>Sketch and Validate</summary>
          <p>
            The <b>Mode</b> switch in the top bar decides whether your Data graph is checked against your Ontology
            graph. Switching never changes your triples.
          </p>
          <ul>
            <li>
              <b>Sketch</b> (the default): type anything; nothing is checked.
            </li>
            <li>
              <b>Validate</b>: every Data graph triple is checked against what your Ontology graph says. A triple that
              doesn't fit is <b>flagged</b> with a reason, never blocked or changed. Checks rerun after every change.
              Until your Ontology graph gives a relationship a domain or range, the notice says “Nothing to check yet”.
            </li>
          </ul>
          <h3>What is checked</h3>
          <ul>
            <li>
              <b>Domain:</b> the subject's class must be one the relationship expects, e.g. “implements” expects a
              “Physical data element”, so “CRM” (a “System”) · “implements” · “Client ID” is flagged. A subclass counts, through
              any number of levels. If a relationship has several domains, any one will do.
            </li>
            <li>
              <b>Range:</b> the same for the object's class. For a literal range (e.g. date), the literal must have
              that datatype; an integer also fits decimal, and <span className="mono">rdfs:Literal</span> takes any
              literal. A thing where a literal is expected, or the reverse, is flagged too.
            </li>
            <li>
              <b>Undeclared relationships:</b> one of your own relationships that the Ontology graph never mentions (no
              domain, range, type or parent) is flagged. Standard ones such as “type”, “label” and “definition” aren't.
            </li>
            <li>
              <b>One value only:</b> a relationship typed <span className="mono">FunctionalProperty</span> in the
              Ontology graph allows one value per subject. If a subject has two (“DOB” “implements” both “Birth
              Date” and “Client ID”), both triples are flagged, since Triplet can't tell which is wrong.
            </li>
            <li>
              <b>Parent relationships:</b> a relationship that is a <span className="mono">rdfs:subPropertyOf</span>{' '}
              another is also checked against its parent's rules.
            </li>
            <li>
              <b>Relationship used two ways (Ontology graph):</b> if “belongs to” has a domain or range and is also used
              in a plain triple between two classes (“Business term” · “belongs to” · “Data domain”), the plain one is
              flagged, with the domain and range triples shown beside it. A plain triple between classes says
              something about the classes themselves, not their data, so it isn't checked as a rule. Choose{' '}
              <b>Make it domain and range</b> to turn it into a rule, or <b>Remove</b>.
            </li>
          </ul>
          <h3>What isn't checked</h3>
          <ul>
            <li>
              Things with no class: they can't be checked, so they are never flagged. The notice says how many there
              are.
            </li>
            <li>Missing links: a thing that lacks a relationship its class usually has isn't flagged. Every link is optional.</li>
            <li>“Type”, “label” and “definition” triples. In the Ontology graph, only relationships used two ways.</li>
            <li>Nothing, while your Ontology graph has no relationship with a domain, range or type yet.</li>
          </ul>
          <h3>Where flags show</h3>
          <ul>
            <li>
              A notice above the triple list counts the flagged triples. <b>Show flagged only</b> narrows the list to
              them.
            </li>
            <li>
              Each flagged triple has a ⚠ marker and its reason in the list. In the graph its arrow (or its row on a
              node) carries the marker, and selecting a node or arrow lists its reasons. Edit triple shows them too.
            </li>
            <li>
              When a thing has the wrong class for a relationship, its flag offers <b>Set class of “…”</b>. The new class
              applies wherever that thing is used.
            </li>
          </ul>
          <h3>Accepting an exception</h3>
          <p>
            If a flagged triple is right as it is, choose <b>Accept as exception</b>. It is then shown muted and no
            longer counted. The exception covers that triple and that reason only: if the triple later breaks a
            different rule, it is flagged again. Renaming or merging a term keeps the exception; editing the triple
            with the pencil asks again. Exceptions are part of Undo, saved with the project, kept when you switch to
            Sketch and back, and never exported. Settings lists them, so you can flag any of them again.
          </p>
        </details>

        <details>
          <summary>The graph</summary>
          <ul>
            <li>
              Show the Data graph, the Ontology graph (drawn as a class diagram) or Both. The triple list always
              shows both.
            </li>
            <li>
              Nodes are coloured by class. Drag them to arrange the graph; Fit brings everything into view. Once you
              have arranged a view, cards stay where you put them and new cards appear beside a card they link to.
            </li>
            <li>
              <b>Tidy layout</b> lays the view out again, compactly. Undo puts your arrangement back. While cards are
              where the layout put them, long arrows bend around the cards in between.
            </li>
            <li>Selecting a node or arrow highlights its triples in the list; a selected arrow is drawn on top.</li>
            <li>
              Click a class in the legend to pick out its cards (subclasses too). In Both, selecting a class card does
              the same. Click again or on empty space to see everything.
            </li>
          </ul>
        </details>

        <details>
          <summary>Settings and export</summary>
          <ul>
            <li>
              <b>Settings (⚙):</b> the base address and graph names, your own prefixes, the built-in vocabularies, the
              pairs you kept as different things, and the triples you accepted as exceptions.
            </li>
            <li>
              <b>Export .ttl:</b> each graph downloads as its own Turtle file, checked before download, ready for your
              graph database.
            </li>
            <li>Starting a new project (from the project name) clears this one; it can't be undone.</li>
          </ul>
        </details>

        <details>
          <summary>Saving and opening a project file</summary>
          <ul>
            <li>
              Your project lives only in this browser. Clearing the browser's site data deletes it, and it doesn't move
              to another browser or computer.
            </li>
            <li>
              To keep a copy, click <b>Export .ttl</b>, then <b>Download project file</b>. It saves one .triplet.json
              file with both graphs, your settings, the mode, the pairs you kept as different things, the exceptions
              you accepted and where you dragged the cards. It also holds both graphs' Turtle, for reading.
            </li>
            <li>
              To carry on, start a new project and choose <b>Open a project file</b> on the setup screen. Triplet shows
              what the file holds before it opens anything, and the project comes back exactly as saved. Undo history
              isn't saved, so Undo starts fresh.
            </li>
            <li>
              Only Triplet's own project files open. Triplet is for designing from scratch or carrying on with your
              own projects; it doesn't open Turtle files written elsewhere.
            </li>
          </ul>
        </details>
      </div>
      <div className="dialog-foot end">
        <div className="dialog-btns">
          <button ref={close} type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </Dialog>
  );
}
