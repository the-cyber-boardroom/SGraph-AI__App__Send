# The Browser Is The Database: Local Databases As The Query Engine, The Vault As The Source Of Truth

**version** v0.33.48
**date** 12 July 2026
**from** Human (project lead)
**to** Architect, @Dev, Product, Strategy

**type** Arch brief

---

## What This Is

The pattern that turns the vault into a queryable database without a backend: **the vault is already the source of truth and the file system is already the database, so the missing piece was never storage but querying, and the answer is to let the browser be the database; on first load, copy the vault's issues, risks, business risks, stakeholders, facts, and the first-class digital twin into a client-side database the browser already provides, IndexedDB natively and real SQL through SQLite compiled to WebAssembly, so the data becomes indexed, filterable, and reachable by SQL and by direct key lookup with no backend and no always-on service to maintain; the first version ran a Python script on every update, which meant running it all the time, and this replaces that with a load-once, sync-incrementally model, because if the vault's commit id is stored alongside the loaded data, the next page load only has to apply the changes since that commit rather than rebuild everything; the result is a local-storage-powered issue tracker whose source of truth is whichever vault you open, so coordination across people and across time becomes synchronising data between vaults, in batches, or by dumping the client-side database straight into the vault as a snapshot of a particular release, since a SQLite database is a single file that can be exported and re-imported; it is the same pattern a conventional database uses, an ephemeral engine loaded from a durable source of truth, only here the durable source is the versioned vault and the engine is the browser, and the immediate build is an MVP of this together with the tools to visualise the local database, which will be reusable everywhere.** It is the first brief of 12 July (cross-ref: the v0.33.46 MVP build-architecture brief, the v0.33.45 deterministic-execution brief, the v0.33.45 personalised-vaults brief, and the v0.33.44 ontology brief). New contributions: **the browser's own databases as the query engine loaded from the vault, incremental sync keyed to the vault commit id, the dump-to-vault snapshot, and the reframing of the vault as a local-storage-powered issue tracker with no backend database.**

## No Database Means The File System Is The Source Of Truth

The starting clarification matters, because it is easy to misread. The project lead: **"although we are not using databases in the natural sense, an always-on database that needs to be maintained, when I say we do not use databases, we use a file system as a database, it does not mean the system has no databases, it just means the source of data is the file system that gets loaded."** The system can have as many databases as it likes; what it does not have is a database as the source of truth. That role belongs to the vault. The project lead: **"what we are doing is a pattern a lot of databases do too, it is just where the source of truth exists, we could have a database that gets loaded and is ephemeral, and it is the one that holds the information."** A conventional database also separates a durable store from a working engine; the difference here is only that the durable store is a versioned file system rather than a data directory nobody sees.

## The Data Is Already There; The Missing Piece Was Querying

The corpus of nodes already exists as files. The project lead: **"we already have a good set of issues, risks, business risks, stakeholders, all the way back to facts, even a first-class digital twin, all the issues are already loaded into the file system, so we have the beginning of that issues database."** What was missing was not the data but a way to ask questions of it at scale. The project lead: **"the piece that was missing is the querying, the first version ran a Python script on updates, but that has the problem that you need to run the Python script all the time."** A build step that has to run on every change is a maintenance burden and a source of staleness, and it is exactly the piece this brief replaces.

## Use The Browser's Own Databases

The insight is that the query engine can be the browser itself. The project lead: **"when we loaded this in the browser we already had the issues decoupled to local storage, which lets users experiment, and then I realised, let us use the local databases in the browser, we have three or four, super powerful, why not use those as our database?"** Concretely, the browser already ships IndexedDB as a general-purpose store, and real SQL is available by compiling SQLite to WebAssembly, either in memory with the database rebuilt on each visit, or persisted through the Origin Private File System for larger sets, with WebSQL long since removed and not a candidate. That gives both of the access patterns the design wants. The project lead: **"when you load the vault for the first time, you copy all the issues and data to local storage, the core data becomes local storage data, indexed and filtered, and we do not have complexity accessing it because we are using SQL and direct hash access, and even if we need indexes, we store the indexes there."** SQLite over WebAssembly supplies the SQL, joins, and full-text search; IndexedDB supplies the direct key lookup; and any indexes the queries need are built once and kept in the same local store.

## Incremental Sync By Commit Id

The move that makes this efficient rather than wasteful is to tie the loaded database to the vault's version. The project lead: **"because we can hash it, we should also commit the sgit hash, the commit id, so we can update it incrementally, so the next time the page loads, a process updates the local storage from the latest changes that have happened."** Storing the vault commit id alongside the local database turns every subsequent load into a delta: the client compares its stored commit against the vault's head and applies only the changes in between, rather than rebuilding the whole database. This is the same discipline a replicating database uses to stay in sync with a log, and it is what removes the run-the-script-every-time problem for good.

## The Vault Becomes A Local-Storage-Powered Issue Tracker

Seen from the outside, the result is a familiar kind of application with an unfamiliar backend. The project lead: **"what we have is a local-storage-powered issue tracking system, but the source of the data is the vault you happen to open, and then it is just synchronising the data between the vaults."** The tracker runs entirely in the browser, but its source of truth is whichever vault the user opened, so multi-user and multi-session collaboration reduces to keeping vaults in sync rather than to operating a shared server. Because the vault is versioned, the same mechanism naturally spans time as well as people.

## Snapshots: Dump The Database Into The Vault

There is a second sync path worth building alongside the incremental one. The project lead: **"when you open vaults across time and across multiple people, it becomes a question of synchronising the data to a vault, we can sync in batches, or save a copy of IndexedDB by extracting a dump, a mode where we save a dump in the vault of a whole chunk or a particular release of the issues."** Since a SQLite database is a single file, the client can export the whole database and commit that dump into the vault as a snapshot of a particular version or release, and a later session can open that snapshot directly instead of reloading and re-indexing every file. Batch synchronisation and dump-and-restore are two ends of the same idea, one incremental and one wholesale, and both keep the vault as the durable record.

## Build The Visualisation Tools Now

One build item is called out as immediate and reusable. The project lead: **"we need to immediately build tools to visualise the local storage, which are tools we can reuse in all sorts of other places."** Being able to inspect what is actually in the client-side database, the tables, the indexes, the loaded nodes, and the current commit id, is both a debugging necessity for this MVP and a component that every future vault app will want, so it is worth building properly the first time rather than as a throwaway.

## Why This Fits The Architecture

This slots cleanly into the build already described. It keeps the file system as the source of truth and the LLM out of the query path, so it stays deterministic, and it replaces the Python-index step from the MVP architecture with a browser-native engine that needs no server. In a nutshell, the goal is the one the project lead states plainly. The project lead: **"use the browser's local databases, the browser's capabilities, to give us a database, instead of having to have a backend one."** The vault remains the graph of graphs; the browser becomes the place that graph is queried; and nothing durable moves off the versioned file system.

## What This Does Not Try To Be

- **Not a backend database.** The durable source of truth stays the versioned vault; the browser database is ephemeral and rebuildable.
- **Not a build step on every change.** Incremental sync by commit id removes the run-the-Python-script-always problem.
- **Not an LLM in the query path.** The query engine is deterministic SQL and key lookup, with no model inline.
- **Not WebSQL.** That API is removed; the SQL comes from SQLite compiled to WebAssembly.

## Honest Tensions

| Tension | Note |
|---------|------|
| Browser storage limits versus data size | IndexedDB scales but can be evicted unless persistence is requested, and in-memory SQLite is bounded by memory |
| Incremental sync versus correctness | A delta keyed to the commit id is fast but must handle deletes, merges, and conflicts across vaults carefully |
| Client-side database versus multi-tab | SQLite over WebAssembly has real concurrency limits across tabs and workers that the design must respect |
| Snapshot dumps versus drift | A committed database dump is convenient but can drift from the files it was built from unless regenerated |

## Open Questions

| Question | Notes |
|----------|-------|
| SQLite in memory versus persisted to OPFS? | Rebuild-on-load simplicity against persisted performance for larger issue sets |
| How is the delta computed from the commit id? | The diff between the stored commit and the vault head, including deletes and moves |
| What is the dump format committed to the vault? | The exported database file or serialisation, and how a session opens it directly |
| How do two vaults reconcile on sync? | Batch synchronisation and conflict handling when many people edit across time |

## Relationship To Previous Briefs

| Date | Document | Relationship |
|---|---|---|
| 7 Jul | `v0.33.46__arch-brief__sg-send-riskmandate-mvp-build-architecture-vault-backend-llm-deterministic-ui-frontend-llm-billable-unit.md` | Evolves the Python-index query layer into a browser-native database |
| 6 Jul | `v0.33.45__arch-brief__sg-send-deterministic-execution-llms-out-of-the-production-path-graph-backed-translations-transparent-integration.md` | Keeps the file system as source of truth and the model out of the query path |
| 6 Jul | `v0.33.45__arch-brief__sg-send-personalised-vaults-experiments-risk-acceptance-underwriting-chain-scenarios-impact-cia-cost.md` | Builds on the local-browser decoupling that lets users experiment |
| 5 Jul | `v0.33.44__arch-brief__sg-send-aws-iam-config-risk-ontology-taxonomy-nodes-edges-formulas-bridges.md` | The node types, one file each, that are loaded into the browser database |

---

## Key Claims

| # | Claim |
|---|-------|
| 1 | The vault is the source of truth; no-database means the file system holds the truth, not that there are no databases |
| 2 | The data already exists as files; the missing piece was querying |
| 3 | The first version ran a Python script on every update, which had to run all the time |
| 4 | The browser is the query engine: IndexedDB natively, and SQL via SQLite compiled to WebAssembly |
| 5 | On first load the vault's nodes are copied into the client-side database, indexed and filterable |
| 6 | SQL supplies joins and search; direct key lookup supplies hash access; indexes are stored locally |
| 7 | Storing the vault commit id turns every later load into an incremental delta, not a rebuild |
| 8 | The result is a local-storage-powered issue tracker whose source of truth is the vault you open |
| 9 | A SQLite database is a single file, so it can be dumped into the vault as a release snapshot |
| 10 | Build the local-database visualisation tools now; they are reusable everywhere |

---

## Sources

- Comparison of localStorage, IndexedDB, OPFS, and SQLite over WebAssembly, and why WebSQL was removed: https://rxdb.info/articles/localstorage-indexeddb-cookies-opfs-sqlite-wasm.html
- The state of SQLite persistence on the web, OPFS and IndexedDB VFS options and their trade-offs: https://powersync.com/blog/sqlite-persistence-on-the-web
- SQLite Wasm backed by the Origin Private File System, persistent client-side SQL: https://developer.chrome.com/blog/sqlite-wasm-in-the-browser-backed-by-the-origin-private-file-system
- Choosing between sql.js in memory and SQLite Wasm with OPFS for persistence: https://recca0120.github.io/en/2026/03/06/browser-storage-comparison/
- The official SQLite WebAssembly and JavaScript API documentation: https://sqlite.org/wasm

---

This document is released under the Creative Commons Attribution 4.0 International licence (CC BY 4.0).
