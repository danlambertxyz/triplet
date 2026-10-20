# Triplet

Design a knowledge graph by typing it, one triple at a time.

Triplet is a small app that runs in your browser. You type **subject · predicate · object** statements, such as “CRM · has dataset · Client Master”, into two graphs:

- an **Ontology graph** for your classes and relationships (System, Dataset, “has dataset” …)
- a **Data graph** for the things themselves (CRM, Client Master …)

You see them as a list and as a graph, edit them, and export each one as a Turtle (`.ttl`) file, ready to load into a graph database.

**Try it now: https://danlambertxyz.github.io/triplet/**

<!-- Screenshot: ![Triplet](images/triplet.png) -->

## What it does

- **Typed entry with help as you go.** Dropdowns reuse the names you already have, names become valid IRIs automatically, and common vocabularies (RDFS, OWL, SKOS, Dublin Core, schema.org …) are suggested by prefix.
- **List and graph views.** Data, Ontology or both side by side, coloured by class, with nodes you can drag and a Tidy layout button.
- **Editing with Undo.** Rename, merge, set a class, or delete with a warning that lists every triple affected.
- **Duplicate spotting.** “Date of Birth” and “date of birth” are flagged so you can merge them, keep one, link them, or keep them apart.
- **Sketch and Validate modes.** Sketch lets you type anything. Validate checks your Data graph against your own Ontology graph (wrong class, wrong value type, a single-value relationship with two values …) and flags problems without blocking you.
- **Start from Turtle files.** Open the files Triplet exported to pick up where you left off, or Turtle from elsewhere: what Triplet can't show (blank nodes, OWL restrictions, language tags …) is listed before you import.
- **Clean Turtle export.** Written and re-checked with [N3.js](https://github.com/rdfjs/N3.js); only the prefixes you use are declared.

A built-in guide (the **?** button) explains everything in plain language.

## Your data stays with you

Triplet has no server, no account and no tracking. Your project is saved **only in the browser you use it in**, on that computer.

- Clearing your browser's site data deletes your project.
- It doesn't move between browsers or computers.
- **Export your `.ttl` files to keep a copy.** To carry on from them, start a new project and choose **Start from Turtle files**: pick the Data and Ontology graph files, check the summary, and create the project. Names, literals, classes and relationships come back as they were, so exporting again gives the same Turtle. Accepted exceptions, pairs kept as different things, card positions and Undo history aren't in a `.ttl` file, so they aren't restored.

## Three ways to use it

### 1. In your browser (easiest)

Open **https://danlambertxyz.github.io/triplet/**. Nothing to install.

### 2. Download one file (works offline)

1. Go to [Releases](https://github.com/danlambertxyz/triplet/releases) and download `triplet.html` from the latest release.
2. Double-click it. It opens in your browser and works without an internet connection.

Projects are saved per browser *and* per file location, so keep the file in one place.

### 3. Run it from the source code (for developers)

You need [Node.js](https://nodejs.org/) 22 or later.

```bash
git clone https://github.com/danlambertxyz/triplet.git
cd triplet
npm install
npm run dev
```

Then open http://localhost:5173.

| Command | What it does |
| --- | --- |
| `npm run dev` | Starts the app at http://localhost:5173, reloading as you edit. |
| `npm test` | Runs the unit tests. |
| `npm run build` | Builds `dist/index.html`, a single file that runs without Node. |

## Built with

React, TypeScript and Vite · [Zustand](https://github.com/pmndrs/zustand) for state · [N3.js](https://github.com/rdfjs/N3.js) for Turtle · [React Flow](https://reactflow.dev/) and [dagre](https://github.com/dagrejs/dagre) for the graph · [Vitest](https://vitest.dev/) for tests.

The core RDF logic lives in `src/core/` as plain TypeScript with no UI code, and is covered by the tests in `tests/`.

## Status

Triplet is a working first version (MVP). Planned next: drafting an ontology from a data file, and loading a published ontology to check against.

Desktop and laptop browsers only.

## Licence

[MIT](LICENSE)
