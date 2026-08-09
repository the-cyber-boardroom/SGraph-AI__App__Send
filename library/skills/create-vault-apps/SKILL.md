---
name: vault-html-app
description: Build a polished, self-contained HTML application that lives inside an SG/Send vault and renders from index.html — a photo gallery, strategy microsite, dashboard, report, journal, or any single-page experience. Use this whenever the user wants to create a vault app, build an HTML app for a vault, make a website inside a vault, render a page from a vault, or auto-open a vault as an app — even when they only describe the content (gallery, report, microsite, slide deck, form, presentation) without saying "app". Covers the authoring contract all vault HTML must follow, the data-plus-app project shape that works, the patterns that survive both the SG/App host and the vault browser preview, the sgit commit-and-push workflow, calling an LLM from inside a vault app via sg.llm.* without ever holding an API key, and cross-references the canonical window.sg API reference (library/guides/vault-html/AUTHORING.md) and the sg-playwright screenshot guide.
---

# Building HTML Apps That Live Inside an SG/Vault

> **Canonical source:** `library/skills/create-vault-apps/SKILL.md` in the
> `SGraph-AI__App__Send` repo. **Last verified:** 2026-08-03 against app-shell v0.2.3 and
> sgit-ai v0.14.27. If your copy of this skill came from anywhere else (a vault, a manual
> upload), check the repo for a newer version before trusting details.

A vault app is a single `index.html` (plus its data and assets) that lives inside an SG/Send vault and renders straight from it. When the vault opens, the app launches: full-screen, talking to the vault through a bridge, with the encrypted blob serving as both the storage and the distribution mechanism. The medium is the message — sharing the vault link *is* sharing the app.

This skill captures the techniques that work, the contract you must follow, and the traps to avoid. It is written from real experience building three production apps (a photo gallery, an event report, a strategy microsite) inside the dev vault server, with one full revision cycle each — the patterns here have all been bug-fixed against actual vault behaviour, not just inferred from docs.

## Canonical references

This file is the agent-facing **how-to** — patterns, traps, sample skeletons. For the
**authoritative platform reference**, two docs are kept in lockstep with the
`app-shell`/`app-hud` source code:

- **`library/guides/vault-html/AUTHORING.md`** — the full `window.sg.*` runtime API,
  every namespace (`vfs`, `fs`, `vault`, `history`, `sync`, `auth`, `ui`, `state`, `llm`,
  `loadCss`/`loadJs`, `app`), what the host does automatically (nav, hash anchors,
  external links, friendly 404, print, consent overlays), and the `app.json`
  `hud.{mode, show.*}` config schema for the chrome.
- **`library/skills/use-sg-playwright/SKILL.md`** — how to drive `sg-playwright` from a
  Claude session to screenshot a live vault app (no local Chromium required).

**Cross-check AUTHORING.md before you write any `sg.*` call from this skill.** Some
samples in this file pre-date 2026-05-30 — when in doubt, the AUTHORING.md is the
ground truth.

## When to reach for this

Use this skill whenever the deliverable is *both* the content and the experience of viewing it, and the user wants that experience to live securely with the data. A few telltale signs:

- The user has photos / a report / a writeup / a deck / a set of files and wants them shareable as a polished page rather than a folder of files.
- The user mentions sending the result to someone external, and the data is private or sensitive — they want it encrypted, with a key in the URL.
- The user references SG/Send, SG/Vault, "App Mode", `app.json`, `_page.json`, the `app-shell` or `app-banner` custom elements, or the dev/prod vault domains.
- The user already has a vault and wants to "do more with it" than just file storage.

If the work is just file storage, file sharing, or version control of files, this is the wrong skill — `sgit` alone is enough. Reach for this skill when an experience needs to be authored on top of the files.

## The non-negotiable authoring contract

This is the part you cannot skip. Vault HTML runs inside an iframe loaded from a `blob:` URL, which means the browser fetches resources *before* the vault's bridge script can install. Anything declarative against a vault-relative path will 404. The contract is therefore:

1. **No `<link rel="stylesheet" href="…">` against vault files.** Inline all CSS, or use a `data:` URI, or call `window.sg.loadCss(path)` after `DOMContentLoaded`.
2. **No `<script src="…">` against vault files.** Inline all JS, or use `window.sg.loadJs(path)`.

> Note on what's verified: in all three apps this session I **inlined** all CSS and JS, and that is the path I can vouch for. The `window.sg.loadCss` / `loadJs` alternatives come from the vault's AUTHORING.md guide and are the documented mechanism, but I did not exercise them — prefer inlining unless you have a reason to load lazily, and verify the `sg.*` calls if you do.
>
> **Verified against source (2026-08-09): `loadCss`/`loadJs` require no separate grant.** Both are
> `_readText(path)` under the hood — the identical bridge call `sg.vfs.readText` makes — plus a DOM
> injection step. There is no `load` permission verb; they ride `fs.read`, which is default-allow
> today. If one of them fails, the promise rejects with `ENOENT` (bad path, or the file was written
> locally but never `sgit commit` + `sgit push`ed) or a script error — not `EPERM`. See
> AUTHORING.md §2 and `MIGRATING-TO-THE-PERMISSION-MODEL.md` for the forward-looking `fs.read`
> deny-by-default flip, which will apply to these loaders too since they share the verb.
3. **No `<img src="…">` in markup against vault files.** Set `img.src = '…'` from JS once the bridge is up. (A `MutationObserver` does intercept `<img>` markup in the SG/App host, but it is not guaranteed in the vault-browser preview — set `src` from JS to be safe everywhere.)
4. **No `<iframe src>`, no `<source src>`, no CSS `@import`, no ESM `import`, no `new Worker()` against vault files.** These all run too early.
5. **`fetch('something.json')` does NOT work** — `window.fetch` is **not** patched; a vault-relative fetch resolves against the iframe's opaque origin and 404s. Load data with `await sg.vfs.readText('content.json')` (or `.read` for binary). Plain `fetch` is only useful as the first hop of a fallback chain that catches the failure and uses an inlined copy (see below, and the "Heads-up" section).
6. **`<a href="vault-path">` works** — clicks are postMessage-intercepted by the host.

Two more things that follow from the contract:

- **Always provide an inlined fallback for the data file.** Anyone who saves the HTML standalone or opens it outside the vault still gets a working page. Pattern:
  ```js
  const FALLBACK = /*__DATA__*/{};
  async function getData(){
    try { const r = await fetch('content.json',{cache:'no-store'});
          if (r.ok) { const j = await r.json(); if (j && j.sections) return j; } }
    catch(e){}
    return FALLBACK;
  }
  ```
  Then inject the real JSON into `FALLBACK` at build time, replacing the `{}`. This is also what lets the page render in the vault-browser *preview* (which doesn't always run the same code path as the SG/App host).

- **Signal `sg-app-ready` once the page has rendered.** The SG/App host shows a "Loading app…" overlay until it gets this message:
  ```js
  try { window.parent && window.parent.postMessage({type:'sg-app-ready'},'*'); } catch(e){}
  ```
  Call it at the end of your build function. Skipping this leaves users staring at a spinner.

## What the SG/App host gives you (so apps don't reinvent it)

The host chrome (`<app-shell>` + `<app-hud>`) does a lot of work for you. **Reach for
these before building your own version** — apps that duplicate host capabilities tend
to ship redundant UI that ages out of sync with the platform. As of 2026-05-30:

| Capability | Where it lives | What it means for your app |
|---|---|---|
| **Hash anchors** in vault links — `<a href="page.html#section">` | Host click interceptor + parent scroll-to-anchor postMessage | Just write the link; the host strips the fragment for the path lookup, then scrolls the new doc to the anchor on `DOMContentLoaded`. (Used to be broken — 403'd against the static host.) |
| **External links** — `<a href="https://example.com">` | **Default-deny with a one-click host confirm** (updated 2026-06-15): the click posts to the host, which shows a confirm bar in the HUD and opens the link in a new tab with `noopener,noreferrer`. The app sandbox does NOT get `allow-popups-to-escape-sandbox` by default. | Don't add `target="_blank"`. For frictionless in-frame `window.open`, declare `"externalLinks": true` in `app.json` `permissions` — only then does the sandbox gain the popup tokens. |
| **Back / forward / Home / Reload / Recent pages** | The `<app-hud>` nav row above your iframe | Don't build app-side back buttons. The HUD has a browser-style toolbar with a parent-side history stack, a recent-pages dropdown (last 15, chronological), and an editable URL bar (click → type vault-absolute path → Enter). |
| **Friendly 404 / access-denied overlay** | `_renderBrokenLinkOverlay` in `app-shell.js` | A click on a missing or `.vault/**`-floored path lands on a host-rendered dead-end page with a ‹ back arrow. You don't need to handle broken-link routing. |
| **Print** | HUD "🖨 Print" button → bridge RPC → DOM snapshot with `blob:`→`data:` inlining → `SgPrint.printHtml` | Hide it via `hud.show.print: false` if your app shouldn't be printed; otherwise it just works. (Restored 2026-05-30 — was broken under null-origin srcdoc.) |
| **Toast notifications** | `sg.ui.message(text, type, opts)` → `<app-hud>` toast row | Don't build your own notification UI. The HUD has one. |
| **Consent prompts** for grant-gated verbs (`sg.fs.*`, `sg.vault.*`) | Host HUD overlay + `sg.ui.requestPermission(verb, path)` | Apps that declare permissions in `app.json` get the consent UI for free. Don't build a homegrown "are you sure?" modal. |
| **Device-local prefs** — theme, panel widths, "don't show again" | `sg.state.{get,set,remove,clear,keys}` (NEW 2026-05-30) | Namespaced top-level-kernel `localStorage`, 64 KiB/value. Survives reload, NOT a vault write. For vault-persistent state use `sg.fs.write('.app-state/...')` instead. |
| **Hide / dim the chrome** | `app.json` `hud.mode: "minimal" \| "hidden" \| "none"` (`none` added 2026-06-11) | Declare in `app.json`; don't try to suppress the HUD from inside the iframe (it's not reachable from your DOM and you shouldn't). Even `"none"` keeps the sovereignty rail (consent prompts, external-link confirms). See AUTHORING.md → "Configuring the host chrome". |
| **Append-only inbox** — receive messages/files from other agents or vaults | `sg.append.{configure,write,list,fetch,markProcessed,purge}` (renamed from `sg.inbox.*` 2026-06-15; the write verb is `write`, not `append`) | Requires an `append.*` grant in `app.json` `permissions`. See AUTHORING.md. |
| **Static-host / read-only mode** | `SGSend.staticMode` (`window.SG_STATIC === true`) — vault served from GitHub Pages / S3 with no backend | Reads work identically; every write rejects with `{code:'EREADONLY'}`. Check `sg.app.writable` and degrade gracefully. See `library/guides/vault-html/HOSTING-ON-STATIC-STORAGE.md`. |
| **File downloads** — save a vault file to the user's device | `sg.vfs.download(path, {filename?})` (NEW 2026-07-31) — host-fulfilled: the save happens in the host document, so the app sandbox never needs `allow-downloads` | Don't build blob-URL + programmatic-anchor downloads in-frame (Chromium silently drops them — no `allow-downloads` token). Default: one-click HUD confirm per file; `"permissions": {"downloads": true}` for frictionless. Direct hrefs to vault paths (`<a href="/exports/x.pdf" download>`) can never work — vault files aren't URLs. |
| **In-page anchors** — `<a href="#section">` | Host interceptor scrolls in-frame (fixed 2026-07-31) | Just write the anchor. Never assign `location.hash` from JS (srcdoc frames re-navigate). Opt out of interception with `data-sg-native` or window-capture `preventDefault` if your app routes clicks itself. |
| **Voice input** — speak instead of type | `sg.llm.listen()` (NEW 2026-08-03) → `{text,…}` — the HOST opens the mic (a sandboxed frame has no `navigator.mediaDevices`), shows a recording bar, transcribes with the vault key | Requires `"llm": {"listen": true}` — a **separate grant, never implied by `chat`**, and consented per use by default. Audio never enters your frame. Works on iPad (records `m4a`, sent as-is); Chrome records `webm` and the host transcodes to WAV for you. Codes: `ENOMIC`, `EINSECURE`, `EABORT`, `EMODEL`. Don't build your own recorder — a sandboxed frame cannot reach the microphone. **If you render your own record button, drive the take with `sg.llm.listenStop()` / `sg.llm.listenCancel()`** (same grant, no consent prompt); the transcript comes back through the original `listen()` promise. `sg.llm.listening()` → `{recording}` for button state. A second `listen()` while one is running is refused with `EBUSY`. **Don't pass `model` either**: transcription uses an audio-capable model (default `google/gemini-3.5-flash`), not the vault's chat model — chat models 404 with "No endpoints found that support input audio". |
| **AI Chat beside your app** — the user asks a model about this vault, by text or voice | A `✨ AI` button in the HUD opens the host's own chat panel (NEW 2026-08-03) | **You get this for free and must not rebuild it.** It is host chrome: it runs at the real origin, holds the vault key and the microphone directly, and your frame sees neither and cannot read the conversation. No permission needed. Hide it with `hud.show.llm: false` if a chat control would clash with your UI; force it on in `minimal` with `true` (off there by default). Use `sg.llm.*` below only when you want AI *inside* your own UI. |
| **Sending an image to a model** — a screenshot, a chart, a scan | `sg.llm.imagePart(blob\|bytes\|dataURL)` → a content part for `chat()` (NEW 2026-08-03) | No new grant — an image is an ordinary `llm.chat` call. **Use the helper, don't encode it yourself**: it chunks base64 at 8190, not 8192 (`8192 % 3 === 2` puts `=` padding mid-string and `atob()` rejects it — shipped three times in this repo). png/jpeg/webp/gif only. The host checks the model can actually READ images from the live catalogue and returns `EMODEL` naming it, rather than letting the provider answer with an error that names nothing; it also caps the payload (`EIMGSIZE`). |
| **Calling an LLM** — chat/summarise/extract, streaming | `sg.llm.{available,models,chat,cancel,usage}` (NEW 2026-08-02) — the vault's key stays in the HOST; your frame never sees it | Requires `"llm": {"chat": true}` in `app.json` `permissions`. **Always call `sg.llm.available()` first** and degrade on `ENOKEY`/`EPERM`/`EREADONLY` — unlike other namespaces this depends on runtime state (key configured? budget left?). Host clamps `maxTokens`, filters `models()` by the vault allow-list, enforces spend caps (`EBUDGET`), and raises the consent prompt. Costs are labelled `estimated` — render those with `~`. See AUTHORING.md "Calling an LLM". |
| **File preview (incl. PDFs)** — quick-look overlay | `sg.ui.preview(path)` (NEW 2026-07-31) — host-rendered at the real origin, so Chrome's native PDF viewer works (it is BLOCKED inside the app sandbox — don't build blob-iframe PDF previews in-frame) | One call, no grant, no confirm (same permission chain as `vfs.read`). Previews pdf/image/video/audio/text. For a PDF inside your own layout, bundle PDF.js to canvas — see AUTHORING.md "Displaying PDFs inline". |

> **Permissions are deny-by-default.** All mutation namespaces (`sg.vfs.write`, `sg.fs.*`,
> `sg.vault.*`, `sg.append.*`, `sg.llm.*`) must be declared in `app.json` `permissions` or they
> throw `EPERM`; `.vault/**` is always off-limits (`EPROTECTED`). See
> `library/guides/vault-html/MIGRATING-TO-THE-PERMISSION-MODEL.md`.
>
> **Reads — including `sg.loadCss`/`sg.loadJs` — are the one exception, and only for now.**
> `sg.vfs.read`/`readText`/`list` and both loaders share a single `fs.read` grant that is
> **default-allow** today (no `app.json` declaration needed). It is planned to flip to
> deny-by-default in a later phase, so scope it explicitly if you want the app to keep working
> unchanged after that flip:
> ```json
> { "permissions": { "fs": { "read": ["theme.css", "app-src/"] } } }
> ```
> Grant syntax is **not glob** — a trailing `/` means "this path and everything under it" (folder
> prefix), no trailing slash means an exact file. `"app-src/**"` is not valid; use `"app-src/"`.

### Heads-up: `fetch()` of vault paths is NOT patched

A common mistake: writing `fetch('content.json')` and expecting the bridge to route it.
It doesn't — `window.fetch` is **not** patched. The relative URL resolves against the
iframe's opaque blob origin, finds nothing, and 404s.

The right call is `await sg.vfs.readText('content.json')` (or `.read` for binary). The
inlined `FALLBACK` pattern below works as a *fallback* (catches the 404 and uses the
embedded copy) but the "fetch-first, fallback second" sample in this skill is a
**fallback chain**, not a "fetch works" claim. AUTHORING.md is the ground truth here.

## The project shape that works

For any non-trivial vault app, lay it out like this:

```
/                    (vault root)
  index.html         — the app: inlined CSS + inlined JS + inlined fallback data
  app.json           — auto-launch config (see below)
  content.json       — editable content catalogue (or gallery.json, data.json — pick a clear name)
  README.md          — what's in the vault and how to edit
  NARRATIVE.md       — long-form prose if relevant (gallery / report)
  photos/            — for galleries: web/ thumbs/ originals/ (three sizes)
   web/              — ~1600px max, WebP at q≈82 — used in lightbox
   thumbs/           — ~760px max, WebP at q≈80 — used in grid
   originals/        — full-res, renamed to slugs, preserved
  maps/  diagrams/   — for non-photo content, the same three-size pattern still pays off
  social/            — derived assets (collages, contact sheets, OG images)
```

Why this shape:

- **Content lives in JSON, not in HTML.** It lets the user (or you in a later turn) edit captions, reorder sections, rewrite prose, without touching the app. The app reads it from `fetch('content.json')` and falls back to the inlined copy.
- **Three image sizes** keep the gallery responsive *and* keep the page weight reasonable. Don't try to use the originals; the page will be ~50 MB and slow.
- **Originals are preserved, renamed to slugs.** Never overwrite or delete the user's source images. If they uploaded `IMG_0184.webp`, keep a copy in `photos/originals/04-opening-keynote.webp` so nothing is lost.
- **`social/` is separate** so derived images don't get confused with source content.

### `app.json` — auto-launch

```json
{
  "entry": "index.html",
  "present": true,
  "auto_open": true,
  "title": "Whatever the page is called"
}
```

With `present:true`, opening the vault boots straight into App Mode rather than the file browser. I set `auto_open:true` as well in every app this session and they did auto-launch, but I confirmed only `present` against the host source — treat `auto_open` as belt-and-braces until verified. Without `app.json` at all, the user lands on the file browser and has to click `index.html` manually.

## The proven layout & UX patterns

Across the three apps I shipped, these patterns held up:

### For photo galleries: justified rows, not row-span masonry

I started with a CSS-grid masonry using `grid-auto-rows: 1px` and `grid-row: span N`. **Don't do this.** The row span multiplies through every `gap` between tracks, so each tile ends up hundreds of pixels too tall, and `object-fit: cover` then shows a near-solid colour slice. The fix is a **JS-driven justified-rows layout** (Flickr/Google Photos style):

```js
const GAP = 14;
function targetRowHeight(){
  const w = window.innerWidth;
  if (w <= 560) return 99999;       // one photo per row on phones
  if (w <= 980) return 240;
  return 300;
}
function layoutChapter(grid, items){
  grid.innerHTML = '';
  const cw = grid.clientWidth;
  const target = targetRowHeight();
  let row = [], aspectSum = 0;
  const flush = (isLast)=>{
    if (!row.length) return;
    let h = (cw - GAP*(row.length-1)) / aspectSum;
    if (isLast) h = Math.min(h, target * 1.5);
    h = Math.min(h, target * 1.6);
    const rowEl = document.createElement('div'); rowEl.className='grid-row';
    row.forEach(p => rowEl.appendChild(makeFigure(p, Math.round(h*(p.w/p.h)), Math.round(h))));
    grid.appendChild(rowEl); row = []; aspectSum = 0;
  };
  items.forEach(p => {
    row.push(p); aspectSum += p.w / p.h;
    const h = (cw - GAP*(row.length-1)) / aspectSum;
    if (h <= target) flush(false);
  });
  flush(true);
}
```

This preserves true aspect ratios, reads strictly left-to-right (top-to-bottom), and re-flows on resize. The photo's `w` and `h` come from `content.json` (capture them when you process the images).

### For long-form / strategy content: scrollytelling layout

For a strategy essay, report, or microsite, use a single-column reading layout with sticky section navigation and a scroll-progress bar:

- `--measure: 680px` for prose width (any wider is unreadable).
- Each section gets a `scroll-margin-top` so anchor links don't slide under the sticky nav.
- One `IntersectionObserver` highlights the active nav link; another reveals figures as they scroll into view.
- Don't lazy-load images — see "Eager loading" below.

### Eager image loading (always)

I tried lazy-loading thumbnails with an `IntersectionObserver` that set `img.src` on intersection. **This caused the bug where the vault-browser preview rendered placeholder blocks** while the App Mode page rendered correctly: the two run with different scroll/observer contexts. The lazy observer fires reliably in one but not the other.

Fix: set `img.src` *eagerly* when each tile is built. The thumbnails are tiny (~50 KB each, ~1 MB total) so the cost is negligible, and the behaviour is now identical in both environments:

```js
const img = document.createElement('img');
img.alt = photo.title;
img.loading = 'lazy';                       // native lazy is fine
img.src = photo.thumb;                      // set immediately — the bridge will route it
fig.appendChild(img);
```

The `IntersectionObserver` is still useful, but only for the fade-in reveal animation, not for setting the `src`.

### Lightbox

Every gallery/report wants click-to-zoom. The pattern:
- A single fixed `<div class="lb">` with an `<img>` inside, hidden by default.
- Click any thumbnail → set the lightbox img `src` to the web (~1600px) version, add `.open` class.
- `Escape` / click outside / close button to dismiss.
- For galleries, support `←` / `→` to step through.

Hardcode no images in the lightbox markup — they get set from JS like everything else.

### Inlined data URI tricks

Two cheap wins that are safe inside the iframe:

- **Faint paper grain** for editorial layouts: an SVG noise filter as a `background-image: url("data:image/svg+xml,…")`. No file needed.
- **Drawn icons** (e.g. a padlock): a small `<svg>` inline rather than an emoji. Emojis render inconsistently across fonts on the server-side (DejaVu shows tofu); inline SVG is reliable.

## The build-and-publish workflow

The full loop, condensed:

1. **Clone the vault** with `sgit`:
   ```
   sgit clone <simple-token> <local-dir>
   ```
   The simple token alone is enough for read access; the keys are derived from it.

2. **Process the source files**. For photos: write a small Python/Pillow script that renames originals to slugs, generates web and thumb sizes, and emits a `content.json` (or `gallery.json`) with each item's `id`, `title`, `caption`, `thumb`, `web`, `original`, `w`, `h`, `chapter`, etc. Don't try to do this by hand for 20 photos.

3. **Read the relevant skills first.** Before writing the app, `view` `/mnt/skills/public/frontend-design/SKILL.md` (the design tokens and constraints for this environment). If the user gave you a vault to start from, also read `/mnt/skills/user/sgit/SKILL.md` and `/mnt/skills/user/create-vault-content/SKILL.md`.

4. **Build `index.html`** as a single self-contained file: inlined CSS, inlined JS, an `{}` placeholder for the data fallback.

5. **Inject the data.** Crucially, when inlining the data as the `FALLBACK` object literal, use `json.dumps(obj)` — *not* the pretty-printed file text. Multi-line strings in JSON contain literal newlines, which are valid in `.json` but break a JS object literal. `json.dumps` produces a compact string with `\n` escape sequences. Pattern:
   ```python
   obj = json.load(open('content.json'))
   compact = json.dumps(obj, ensure_ascii=False)
   assert "\n" not in compact, "raw newline leaked"
   html = open('index.html').read()
   new = html.replace('const FALLBACK = /*__DATA__*/{}',
                      'const FALLBACK = /*__DATA__*/'+compact)
   open('index.html','w').write(new)
   ```
   I burned a real bug on this with the Mermaid-source appendix — the multi-line code blocks made the inlined JS unparseable until I switched from raw JSON to `json.dumps`. Keep the placeholder marker (`/*__DATA__*/{}`) on a single distinctive line so the replace can be exact, not regex.

6. **Validate before pushing.** Three quick checks:
   - **JS syntax**: `node -e "…compileFunction(scriptBody)…"` to catch any inlining bugs.
   - **Contract**: regex-scan the HTML for `<link href|<script src|<img src` against vault paths; should be zero.
   - **Paths**: walk the data and confirm every referenced file exists on disk.

7. **Write `app.json`** to auto-launch (above), and a `README.md` describing the structure.

8. **Commit and push:**
   ```
   sgit commit "<message>"
   sgit push --token <access-token>     # token goes after the subcommand
   sgit status                          # confirm "in sync with remote"
   ```
   Both token positions work in current sgit (verified v0.14.27): `sgit push --token X` and `sgit --token X push` are equivalent (the per-command flag overrides the global one). Older versions only accepted the after-subcommand form, so prefer `sgit push --token X` for maximum compatibility.

9. **Screenshot it yourself with `sg-playwright`, then ask the user to confirm.** The
   long-standing assumption that agents "can't render the page" is **no longer
   universally true** — when the operator has spun up an `sg-playwright` service,
   you can drive a real Chromium over HTTP with no local install (`library/skills/use-sg-playwright/SKILL.md`
   is the operator-and-agent guide). Take a screenshot of the live vault URL, eyeball
   it, fix obvious layout / contrast / overflow issues yourself, and **then** hand to
   the user for a human-eyes pass on subjective quality (does the grid actually look
   good, are the captions readable, etc.). If `sg-playwright` is not available in this
   session, fall back to the older flow: ask the user to hard-refresh and screenshot
   anything that looks wrong. Static validation catches contract violations and JS
   errors but not visual quality.

## A working `index.html` skeleton

A minimum viable vault app, with the contract followed and the patterns above wired up:

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>My Vault App</title>
<style>
  /* ALL CSS inlined here — no <link> tags */
  :root { --paper:#fbfaf7; --ink:#1a1b1e; --accent:#c0392b; }
  body { margin:0; background:var(--paper); color:var(--ink); font-family: ui-serif, Georgia, serif; }
  .hero { padding: 4rem 2rem; }
  .grid { display:flex; flex-direction:column; gap:1rem; }
  figure { margin:0; opacity:0; transition: opacity .8s ease; }
  figure.in { opacity:1; }
  figure img { width:100%; height:auto; display:block; }
</style>
</head>
<body>
  <header class="hero">
    <h1 id="hTitle"></h1>
    <p id="hTag"></p>
  </header>
  <main class="grid" id="grid"></main>

<script>
const FALLBACK = /*__DATA__*/{};

async function getData(){
  try {
    const r = await fetch('content.json', { cache: 'no-store' });
    if (r.ok) { const j = await r.json(); if (j && j.items) return j; }
  } catch (e) {}
  return FALLBACK;
}

function el(tag, cls, html){
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

function build(data){
  document.getElementById('hTitle').textContent = data.title || 'Untitled';
  document.getElementById('hTag').textContent   = data.tagline || '';
  const grid = document.getElementById('grid');
  data.items.forEach(item => {
    const fig = el('figure');
    const img = el('img');
    img.alt = item.title;
    img.loading = 'lazy';
    img.src = item.thumb;              // SET FROM JS — never in markup
    fig.appendChild(img);
    grid.appendChild(fig);
  });
  // reveal animation
  if ('IntersectionObserver' in window){
    const io = new IntersectionObserver((es,o) => es.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('in'); o.unobserve(e.target); }
    }), { threshold: .08 });
    document.querySelectorAll('figure').forEach(f => io.observe(f));
  } else {
    document.querySelectorAll('figure').forEach(f => f.classList.add('in'));
  }
  // tell the SG/App host we're done
  try { window.parent && window.parent.postMessage({ type: 'sg-app-ready' }, '*'); } catch (e) {}
}

getData().then(build).catch(err => {
  console.error('[app] build failed', err);
  document.getElementById('grid').innerHTML = '<p>Could not load content.</p>';
  try { window.parent && window.parent.postMessage({ type: 'sg-app-ready' }, '*'); } catch (e) {}
});
</script>
</body>
</html>
```

## Common failure modes and how to recognise them

| What you see | What it usually is |
|--------------|----------------------|
| Grid tiles are absurdly tall (hundreds of px) showing a near-solid colour | `grid-row: span N` masonry with `grid-auto-rows: 1px` and a non-zero `gap`. Switch to justified rows or column masonry. |
| Vault browser preview shows placeholder blocks; App Mode shows photos | Lazy-loading via `IntersectionObserver`. Set `img.src` eagerly instead. |
| App stuck on "Loading app…" overlay | You didn't post `{type:'sg-app-ready'}` to the parent. Add it at the end of `build()`. |
| `Uncaught SyntaxError` in inlined script, often pointing to the data block | You inlined the pretty-printed JSON (with raw newlines). Use `json.dumps(obj)` to get a compact, properly-escaped string. |
| "Could not load content" or blank page in some contexts | You only `fetch('content.json')` with no fallback. Always provide the inlined `FALLBACK`. |
| Drop cap appears on every intro paragraph instead of just the first | Your selector is `.intro p::first-letter` rather than `.intro p:first-of-type::first-letter`. |
| Emojis render as boxes in collages or stamped images | The server-side font (DejaVu) lacks the glyph. Draw the shape in SVG or skip the emoji. |
| `sgit push` says "no access token configured" even with `--token X` | On older sgit versions only `sgit push --token X` worked. Current sgit (v0.14.27+) accepts both positions; `sgit update` if you hit this. |
| App renders blank or unstyled after `sg.loadCss`/`sg.loadJs` | **Usually not a permission problem** — `fs.read` (which these loaders use) is default-allow today. Check the console for the actual rejection: `ENOENT` means the path is wrong or the file was written locally but never `sgit commit` + `sgit push`ed; a thrown script error means the loaded JS itself failed. Always chain `.catch(err => console.error(...))` on the load promise so the real code surfaces instead of a silent spinner. |

## The medium is the argument

One small but powerful technique: when the user wants to *demo* the vault to someone, lean into the meta-point in the app's footer. Something like:

> 🔒 Delivered as an encrypted SG/Vault — this page is a little HTML on top of a vault, rendered straight from it. The link-holder holds the key; SGraph never sees the contents. The experience and the security are the same artifact.

That single paragraph turns "here are some photos" into "and by the way, here's what SG/Send does." Use it when the recipient is a potential user, partner, or investor; tone it down when it's a personal share.

## Notes on what this skill doesn't cover yet

- **`_page.json` layouts** for content that isn't a single-page app — the `create-vault-content` skill covers that; cross-reference rather than duplicate.
- ~~**The full `window.sg` runtime API.**~~ **Now covered by `library/guides/vault-html/AUTHORING.md`** — that doc is the authoritative reference for every namespace (`vfs`, `fs`, `vault`, `history`, `sync`, `auth`, `ui`, `state`, `loadCss`/`loadJs`, `app`), with shapes, return types, and consent semantics. Don't duplicate it here.
- **Service-worker upgrade path.** When the vault ships a service worker, the declarative restrictions in the contract lift — `<link>` and `<script src>` against vault paths will start working. Until then, the JS-only approach is what's safe. (See `library/guides/vault-html/service-worker-future.md`.)
- **Multi-app vaults** (more than one `app.json` / multiple entries). Not yet shipped in the version I worked against.
- ~~**Screenshotting the live app for visual review.**~~ **Now covered by `library/skills/use-sg-playwright/SKILL.md`** — drive a real Chromium over HTTP, no local install. Use it before falling back to "ask the user to screenshot".

When any of those become relevant, add a reference file and link to it from here rather than expanding the body.
