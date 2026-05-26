# Gotchas — bugs we hit and how to recognise them

A field manual of every failure mode encountered while building the POCs.
Each entry: the symptom, why it happens, the fix. If your code is doing
something weird, scan this first — odds are good the bug is here.

## 1. `<link>` and `<script src>` tags 404

**Symptom.** The page renders without styles or behaviour. Network tab
shows 404s for `style.css`, `app.js` etc. against the iframe origin.

**Cause.** The HTML parser fires resource requests immediately when it
encounters `<link>` / `<script src>` tags. The vault bridge has not yet
patched `fetch`, so the requests go to the iframe's blob/server origin,
where no real files exist.

**Fix.** Never use declarative resource tags inside vault pages. Load all
CSS and JS at runtime via `sg.loadCss` / `sg.loadJs` in a head `<script>`.

## 2. Flash of unstyled content (FOUC)

**Symptom.** The page renders raw HTML for a moment, then snaps to its
styled form once `sg.loadCss` resolves.

**Cause.** CSS load is async. Without intervention the browser paints the
page before stylesheets arrive.

**Fix.** The two-line FOUC pattern:

```html
<style>body.loading { visibility: hidden; }</style>
...
<body class="loading">
```

Then `document.body.classList.remove('loading')` once `Promise.all` of all
your CSS / JS loads has resolved. The inline `<style>` is critical —
external CSS would have the same problem it is trying to solve. Always
also remove the class in a `.catch`, otherwise a load failure leaves a
permanently invisible page.

## 3. `location.pathname` returns `/`

**Symptom.** Code that derives the page's vault folder from
`location.pathname` produces `''` or `/`. Subsequent `sg.vfs.write` calls
either fail or — worse — succeed at the wrong path.

**Cause.** Inside the vault iframe, `location.href` is always the host
server's root, e.g. `http://localhost:10067/`. The path of the file you
loaded does not appear in the URL.

**Fix.** Use `sg.app.selfPath`. It returns the file's vault-relative path
(e.g. `'poc-09-vfs-lab/index.html'`). Strip the filename and prepend `/`:

```js
const dir = sg.app.selfPath.replace(/[^/]*$/, '');
const POC_BASE = '/' + dir.replace(/^\//, '');
```

This is the single most expensive bug in the project — every path-related
failure in POC-08 traced back to using `location.href` for path derivation.

## 4. Files written to `http:/localhost:10067/...`

**Symptom.** A folder tree appears at the top of the vault that mirrors
the current dev server URL: `http:/localhost:10067/responses/poc-08-...json`.

**Cause.** Code did `path = location.pathname.replace(/[^/]*$/, '')` to
derive the base path. Inside the iframe, `location.pathname` was actually
the entire `http://localhost:10067/...` URL string. The "directory" calc
returned `http://localhost:10067/`, and `sg.vfs.write` happily created
that as a folder structure.

**Fix.** Same as gotcha 3 — use `sg.app.selfPath`. To clean up an existing
mess, `rm -rf` the misplaced folder in your local clone, commit, push.

## 5. `sg.vfs.list('relative-path/')` silently returns `[]`

**Symptom.** Code that lists a folder gets an empty array even though the
file tree clearly shows files there. No error is thrown.

**Cause.** `sg.vfs.list` requires a vault-absolute path starting with `/`.
Relative paths like `'data/'` or paths without a leading slash silently
return `[]` instead of erroring or normalising.

**Fix.** Always pass absolute paths to `sg.vfs.list`:

```js
// Wrong — silent empty array
await sg.vfs.list('data/')

// Right
await sg.vfs.list('/my-app/data/')
```

This was the second-biggest debug session — POC-08 listed `'responses/'`
forever and got nothing. The first hint that anything was wrong was the
diagnostic dump in test 03 of `poc-09-vfs-lab`.

## 6. `sg.vfs.list` returns the folder itself in the listing

**Symptom.** Listing a folder returns one too many entries. Code that
displays the listing shows a phantom row whose name is the folder itself.

**Cause.** `sg.vfs.list` includes the directory entry as its first item,
with `type: 'folder'`.

**Fix.** Filter it out:

```js
const files = entries.filter(e => e && e.type !== 'folder');
```

## 7. `sg.vfs.readText('/path')` throws "Failed to parse URL"

**Symptom.** Path that works for `sg.vfs.write` and `sg.vfs.list` throws on
`sg.vfs.readText`. Error message reads `Failed to parse URL from /poc-...`

**Cause.** Asymmetric path handling between methods. In current builds
`readText` does not accept the leading slash; `write` and `list` do.

**Fix.** Wrap `readText` in a slash-fallback helper:

```js
async function safeReadText(absPath) {
    try {
        return await sg.vfs.readText(absPath);
    } catch (err) {
        if (/parse URL/i.test(err.message)) {
            return await sg.vfs.readText(absPath.replace(/^\//, ''));
        }
        throw err;
    }
}
```

Same applies to `sg.vfs.read` for binary reads.

## 8. Form values come back empty

**Symptom.** A form is filled in with values you can see on screen, but
`document.getElementById('name').value` returns `''`. Validation reports
"Name is empty" even though the visible field has text in it.

**Cause.** Two elements in the DOM share the same ID. `getElementById`
returns the first — which is usually a hidden static placeholder, not the
visible filled form.

**Fix.** Single source of truth. Pick one rendering path — either the form
is in the static HTML, or it's rendered by JS, never both. If you must
have both, use distinct IDs (`name` for the static one, `poc8-name` for
the dynamic one).

This bit POC-08 hard. The static HTML had a hidden `<form id="demo-form">`
and `data-writer.js` rendered another `<form id="demo-form">` into a
container. Validation grabbed the empty hidden one every time.

## 9. `sg is not defined` in the browser console

**Symptom.** Typing `sg.vfs` in DevTools throws `Uncaught ReferenceError:
sg is not defined`.

**Cause.** `sg` exists in the **iframe**'s window, not the top page's
window. By default the DevTools console runs in the top frame.

**Fix.** Switch the console execution context. In Chromium DevTools, click
the dropdown that says `top ▾` next to the filter box and select the vault
iframe (it appears as a `blob:` URL or vault host URL). All `sg` calls
work after that.

## 10. Writes appear to vanish on page reload

**Symptom.** Submit a form, see the success message and the new entry in
the in-page table. Reload the page — the entry is gone.

**Cause.** `sg.vfs.write` writes to the **local browser working copy** of
the vault. Reloading the page from the vault URL re-fetches the
server-side state, which has not been updated. The write is lost unless
`sgit commit` + `sgit push` ran in between.

**Fix.** Two parts:

1. Code-side: surface the model to the user. A "local-first" callout
   explaining "your edits live in your working copy until you `sgit
   commit + push`" prevents confusion.
2. Workflow-side: commit and push frequently when iterating.

## 11. `sg.vfs.delete` is not a function

**Symptom.** Calling `sg.vfs.delete(path)` throws TypeError.

**Cause.** `delete` is not yet implemented in the current vault bridge.

**Fix.** Detect at runtime and disable delete UI:

```js
const canDelete = typeof sg.vfs.delete === 'function';
if (canDelete) renderDeleteButton();
```

POC-09 includes a regression test that explicitly **passes** when
`sg.vfs.delete` is absent and will flip to fail when it is added — useful
as an API-change alarm after a vault upgrade.

## 12. POC-01 stops being POC-01

**Symptom.** "Inline everything" demo gets `sg.loadCss('../_shared/...')`
added to it during a refactor.

**Cause.** Refactor passes naturally pull every page into a shared design
system. POC-01's whole point is to demonstrate that an iframe page **can**
work with zero external resources.

**Fix.** POC-01 is the only page that should not load anything. If you
need it to look like the others, inline a copy of the shared CSS via
`<style>` rather than `sg.loadCss`. Check before "tidying up" small files —
they are sometimes deliberately small.

## 13. sgit commit reports "Committed 0/4 files" but everything works

**Symptom.** After staging changes, `sgit commit` reports a small or zero
file count, but `sgit status` shows the commit was made and `sgit history
diff` shows the full change set.

**Cause.** Misleading wording in the commit summary. The commit is real;
the count is not authoritative.

**Fix.** Trust `sgit status` and `sgit history` rather than the commit
output line. Push as normal.

## 14. Dotfiles can't be pushed

**Symptom.** Editing `.vault-settings.json` locally and committing has no
effect on the server.

**Cause.** Current sgit version excludes dotfiles from tracking. This is a
known limitation — fix is on the roadmap.

**Fix.** Edit dotfile-managed settings (vault name, vault id) through the
vault UI's Settings panel, not through file edits.

## 15. Iframe shows last good content while bridge initialises

**Symptom.** A test that calls `sg.vfs.list` immediately on script load
fails on a fresh page load but succeeds when you re-run it manually a
second later.

**Cause.** The vault bridge installs `window.sg` asynchronously after the
iframe content starts running. Synchronous script bodies that touch `sg`
can run before it exists.

**Fix.** All vault interaction goes inside async functions or `Promise.then`
chains kicked off from a head `<script>`. The `Promise.all([sg.loadCss,
sg.loadJs])` pattern naturally guarantees this — by the time your loaded
JS executes, `sg` is fully present.

## 16. POC-09 lab tests appear "stuck" with no feedback

**Symptom.** Click a test in the lab. The pill says `running`. Nothing
visible happens for 10+ seconds.

**Cause.** Some `sg.vfs.write` calls take meaningful time (encryption,
commit creation). Without a live progress log the user can't tell whether
the page has frozen.

**Fix.** All long-running tests use `ctx.log()` to write timestamped lines
into the card body in real time. If you are adding a new lab test, log
before and after every async call so the user sees progress.

## 17. The `_shared/` design system breaks if pulled into POC-01

The opposite of gotcha 12, but worth saying directly: the shared design
system at `/_shared/poc-styles.css` exists to be loaded by POCs 02–09
through `sg.loadCss('../_shared/poc-styles.css')`. POC-01 must not load
it — the pedagogical point of POC-01 is that nothing external is needed.

## What we learned from running the lab

After all the path bugs were fixed, running the 15-test lab end-to-end
established:

- All `sg.vfs.*` paths must be **vault-absolute and start with `/`**, with
  one exception: `readText` and `read` currently reject the leading slash
  in some builds (use the slash-fallback helper).
- Trailing slash on directory paths is required by `list`. Without it the
  call fails or returns ambiguous results.
- `write` is happy with anything that has the right shape — but if you
  give it a malformed path (URL fragments, etc.) it will create a folder
  that mirrors the malformed string. There is no validation.
- `list` returns the directory itself as the first entry. Filter on
  `type !== 'folder'`.
- `delete` is currently absent. Detect with `typeof sg.vfs.delete ===
  'function'` and degrade gracefully.
- `sg.app.selfPath` is the only reliable source of the current page's
  vault path. `location.*` is useless for this.
- `sg.app.writable` reflects whether the current session can persist
  changes. Hide write UI when it is `false`.
