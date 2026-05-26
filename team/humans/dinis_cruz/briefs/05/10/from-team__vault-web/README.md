# Documentation for this vault

For Claude sessions or human collaborators picking up this project. Read
in order:

1. **[`01-field-guide.md`](01-field-guide.md)** — The canonical patterns
   for coding inside a vault iframe. The page skeleton, path resolution,
   read/write/list patterns, FOUC prevention, the DevTools workflow.
   Copy-pasteable snippets. Read this first if you are about to write or
   modify a vault page.

2. **[`02-gotchas.md`](02-gotchas.md)** — Every bug we hit while building
   the POCs, why it happens, and how to recognise the symptom. Read this
   when something is misbehaving — odds are very good that the bug is in
   here.

3. **[`03-debrief.md`](03-debrief.md)** — Project narrative. What was
   here when the redesign session started, what was changed, what was
   discovered. Read this for context on why the codebase looks the way it
   does.

## TL;DR for the next Claude session

You are working in a vault at `vault/`. Pages run inside an iframe served
by the vault host. The vault bridge installs a global `sg` object inside
the iframe with three namespaces:

- `sg.loadCss(path)` / `sg.loadJs(path)` — load vault-stored resources at
  runtime. Required because `<link href>` and `<script src>` tags 404
  before the bridge intercepts them.
- `sg.vfs.read` / `readText` / `write` / `list` — encrypted file system.
  Always use vault-absolute paths starting with `/`. Get the current
  page's vault folder from `sg.app.selfPath`, not `location.*`.
- `sg.app.writable` — whether this session can persist writes.

Workflow: edit → `sgit status` → `sgit commit "msg"` → `sgit --token aws
push`. Refresh the user's browser tab to see changes.

If you are debugging path issues, open `poc-09-vfs-lab/index.html` in the
vault — the environment readout panel and 15-test harness will tell you
ground truth.
