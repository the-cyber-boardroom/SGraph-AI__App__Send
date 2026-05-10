# Project debrief — vault POC redesign session

A narrative record of the session that produced the current state of this
vault, written for a Claude session picking up the project later. If you
want canonical patterns, read `01-field-guide.md`. If you are debugging,
read `02-gotchas.md`. This document explains the project's history — what
was here when we started, what we changed, and why.

## Starting state

The vault `hard-desk-8916` already contained:

- A POC hub at `_poc-hub/index.html` linking to six POCs
- POCs 01–06 covering inline → simple CSS → simple JS → multiple JS →
  data fetch → production patterns
- POCs 07 (read data) and 08 (write data) with partial implementations
- A `demo-cities/` folder with a more elaborate working example
- `POC_STRUCTURE.md` and `README.md` documentation

Visual style was a purple-gradient theme with white cards. Functional but
a bit generic. The user wanted it ready for a recorded video walkthrough,
which meant raising the visual quality and making the POC navigation
flow well.

## What we built

### A shared design system (`/_shared/poc-styles.css`)

Replaced eight per-POC stylesheet copies with one canonical stylesheet.
The aesthetic is "technical refined" — Inter for body, Instrument Serif
for italic accents, JetBrains Mono for code. Cream-on-light surfaces with
a deep ink-coloured panel for emphasis. Teal as the primary accent, violet
secondary, rose for code highlights. The system covers:

- A `poc-shell` container, topbar with breadcrumb and step counter
- Hero header pattern (`poc-hero` with `poc-hero__eyebrow` /
  `poc-hero__title`)
- Four callout variants (concept / warn / ok / err)
- Status pills with state colors and a pulsing "loading" animation
- Buttons (primary / accent / ghost), forms, code blocks
- A bottom step-nav for prev/next POC navigation

POC-01 is the deliberate exception: it inlines a trimmed copy of the
design tokens via `<style>` rather than loading the shared CSS, because
its whole point is "this page has zero external dependencies."

### Redesigned hub (`_poc-hub/`)

A dark hero with a subtle animated grid texture and pulsing teal status
dot. Branded with `SG / VAULT · DEVELOPER REFERENCE`. The hero gives way
to a numbered step grid (Instrument Serif numerals like a magazine
contents page) and a dark API reference panel at the bottom listing the
six core `sg.*` calls.

A "Why your `<link>` and `<script src>` tags 404" section was originally
at the top of the hub explaining the vault's loading model with a
side-by-side bad/good code comparison. The user removed it because that
deeper explanation belongs in a reference library elsewhere; the hub
stays focused on the steps.

A full-width dark "VFS Lab" card sits below the 8 step cards, spanning
the full row, marked `09 · DIAGNOSTIC` with a violet→teal gradient
stripe. It links to `poc-09-vfs-lab/`.

### POCs 1–8 reworked

Every POC now follows the same shell:

```
poc-topbar:    [← All POCs]              [STEP N / 8]
poc-hero:      coloured hero with eyebrow + serif title + sub
status pill:   live status of the load / page state
prose body:    "How it works" / "Key points" / code blocks
poc-stepnav:   [← prev]                          [next →]
```

Each POC has:

- An `index.html` that loads `../_shared/poc-styles.css` then a tiny
  `style.css` for one or two POC-specific tweaks (usually a hero gradient
  variant)
- The POC-specific JS modules with `[poc-NN]` console logging and clean
  module patterns

### POC-08 — the write-data POC

The most heavily worked-on POC. Has two parts:

- **Part 1 — submit form.** A feedback form (Name / Feedback / Rating)
  that writes a JSON file to `/poc-08-write-data/responses/poc-08-<ts>.json`.
  Form is rendered exclusively by JS (after the hidden-form-twin bug from
  the early version, see gotcha 8).
- **Part 2 — manage saved responses.** A table of all
  `poc-08-*.json` files in `responses/`, with inline edit (name, feedback,
  rating, timestamp), an expandable raw JSON editor with JSON validation,
  optional delete (only shown if `sg.vfs.delete` is available), and a
  "Reload from vault" button with a spin animation.

A "local-first" callout warns viewers that writes live in the local
working copy until pushed — important context for the video.

### POC-09 — the VFS Lab

Built mid-session as a diagnostic harness when path bugs were
proliferating. The hypothesis was: instead of guessing at `sg.vfs`
behaviour, instrument it. Test it the way you'd test a black-box library.

The lab is one HTML page with a live test runner. Each of 15 tests is a
self-contained card that shows:

- The exact code that ran (with resolved path arguments)
- The raw result, JSON-stringified (handling `ArrayBuffer` /
  `Uint8Array` specially)
- A live progress log written via `ctx.log()` during execution
- Per-assertion pass/fail with detail strings
- Runtime in milliseconds

Tests cover: API surface check, list root, list this POC folder, write
string, read text, list lab folder, JSON round-trip, write to nested
folder, list nested, overwrite, binary write/read, error on nonexistent
file, error on nonexistent folder, delete availability check, path
variants comparison.

The lab also displays an environment readout panel showing
`location.href`, `location.pathname`, `sg.app.selfPath`, the computed
POC base, and the keys exposed on `sg.vfs` and `sg.app`. This panel is
the first thing to read when debugging.

## What we discovered

The major findings, in roughly the order we found them.

### `sg.vfs.list` needs absolute paths starting with `/`

The first major path bug. Earlier code was passing `'responses/'` to
`sg.vfs.list` and getting back `[]`. The user manually probed the iframe
console and discovered:

- `sg.vfs.list('/poc-08-write-data/responses/')` → returns the files
- `sg.vfs.list('responses/')` → returns `[]`
- `sg.vfs.list('../responses/')` → returns `[]`

So path resolution in `list` is **vault-absolute, no implicit base**.

### `location.pathname` is useless inside the vault iframe

We tried to derive the page's POC base from `location.pathname`. It
worked briefly, then writes started landing at
`http:/localhost:10067/responses/...`. Investigation showed that
`location.pathname` inside the iframe was returning the **full URL** as a
string in some cases, or just `/` in others. Both were wrong.

The fix was `sg.app.selfPath`, which the lab discovered by enumerating
keys on `sg.app`. The environment readout panel in POC-09 now shows
`sg.app.selfPath` prominently because it is the only reliable source of
the current page's vault path.

### `readText` and `write` have asymmetric path handling

After the absolute-path fix, `write` and `list` worked but `readText`
threw `Failed to parse URL from /poc-09-vfs-lab/lab/hello.txt`. We
narrowed it down by adding a path-variant comparison test (test 15) and
a "try both forms" wrapper in test 05 — confirming that `readText`
currently rejects the leading slash on some paths even though `write`
accepts it.

The workaround is the `safeReadText` helper in the field guide.

### `sg.vfs.list` includes the directory itself

A small quirk that produces phantom rows in any naïve UI rendering of a
file listing. Filter on `type !== 'folder'` and the problem goes away.

### Writes are local-first

The user demonstrated this empirically by submitting from a browser
session, then opening the vault from a fresh URL — the new entry was
gone. After running `sgit commit + sgit push` from the local clone, the
entry persisted. This shaped the POC-08 messaging and the documentation.

### `sg.vfs.delete` does not exist yet

Detected via the lab's API surface enumeration. Test 14 was originally
written to fail when `delete` was missing; the user pointed out this is
backwards — currently the **expected** state is for `delete` to be
absent, and the test should fail when it appears. The test now passes
when `delete` is missing and acts as a future API-change alarm.

## Bugs we caused along the way

Worth recording so the next person doesn't repeat them:

- **Duplicate `<form id="demo-form">` in POC-08.** Initial implementation
  had a hidden static form plus a JS-rendered form with the same ID.
  `getElementById` resolved to the empty hidden one. Fix: render the
  form in JS only.
- **Misplaced `http:/localhost:10067/...` folder.** Caused by writing a
  bad path computed from `location.href`. Cleaned up locally with `rm
  -rf`, then committed and pushed. Don't trust `location.*` for paths.
- **Broken POC-08 next-button.** The hub-grid refactor briefly removed
  the POC-09 entry; POC-08's next-link still pointed to it. Easy to
  miss because nav links are only checked when you click them.

## File map

```
vault/
├── _docs/
│   ├── 01-field-guide.md       # patterns to write vault iframe code by
│   ├── 02-gotchas.md           # every bug we hit and how to spot it
│   └── 03-debrief.md           # this file
├── _poc-hub/                   # the redesigned landing page
│   ├── hub.css
│   └── index.html
├── _shared/
│   └── poc-styles.css          # shared design system
├── poc-01-inline/              # baseline — fully inline by design
├── poc-02-simple-css/          # sg.loadCss + FOUC pattern
├── poc-03-simple-js/           # sg.loadJs + Promise.all
├── poc-04-multiple-js/         # ordered JS dependency loading
├── poc-05-data-fetch/          # fetch() interception
├── poc-06-complex/             # production patterns: retry, error
├── poc-07-read-data/           # read methods comparison
├── poc-08-write-data/          # write + manage responses table
├── poc-09-vfs-lab/             # diagnostic harness
│   ├── index.html
│   ├── style.css
│   ├── vfs-lab.js              # 15-test runner with live logging
│   └── lab/                    # files created live by the tests
│       ├── bytes.bin
│       ├── config.json
│       ├── hello.txt
│       └── nested/deep.json
├── demo-cities/                # pre-existing app — left intact
├── app.json                    # entry: _poc-hub/index.html
├── README.md                   # the original vault README
└── POC_STRUCTURE.md            # the original POC documentation
```

`app.json` points at `_poc-hub/index.html`, so opening the vault drops
you straight on the hub.

## Workflow notes for the next session

- This vault is on the `branch-named-a2a8f4569449ea88` named branch on
  `dev.send.sgraph.ai`. Auth token is whatever `sgit auth` was set with
  — passing `--token aws` worked through the session.
- Standard cycle: edit → `sgit status` to confirm changes → `sgit
  commit "<message>"` → `sgit --token aws push`. Pull before push if
  there is divergence.
- The vault UI commits `.vault-settings.json` and the in-page test
  artifacts in `poc-09-vfs-lab/lab/` whenever the user runs the lab.
  Pull before assuming the local state matches the server.
- Dotfiles (`.vault-settings.json` etc.) cannot be pushed via sgit
  currently. Edit them through the vault UI's Settings panel.
- The vault is open in the user's browser at `localhost:10067/en-gb/vault/`.
  After every commit + push, the user refreshes and screenshots — fast
  feedback loop, but the iframe caches CSS/JS sometimes. If a change
  doesn't appear, ask the user to hard-reload.

## Recording-day reminders

The video walkthrough is the deliverable that drove this work. Things
to remember:

- The hub is the entry point. Open it first; the dark hero and step
  cards are the strongest visual.
- POC-01 → POC-09 is the suggested click-through. The prev/next nav
  makes this one click per page.
- POC-09 is the most demo-friendly because the live progress logs and
  graded pass/fail look like real test output. The environment readout
  panel is a good thing to call out — it makes the abstract "vault
  bridge" concrete.
- POC-08's "PART 2" responses table is the most impressive because it
  exercises read + write + edit + reload all in one screen.
- The DevTools console with the iframe context selected is worth
  showing once — it grounds the whole `sg` object as a real, callable
  thing you can poke at live.
