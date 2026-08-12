# Publishing an sgit vault to GitHub

**Purpose:** use git as a backup, distribution and collaboration medium for sgit vaults —
keeping the full sgit history and all sgit branches, exposing the vault contents as raw
readable files, and supporting edits made on GitHub that flow back into the vault — while
never leaking key material.
**Status:** v1.0, 10 Aug 2026. Based on a hands-on audit of a live vault (see §2).
**Applies to:** sgit / SG-Send vaults with the `.sg_vault/{local,bare,work}` layout.

---

## 1 · Why this works: security by key, not by access

The sgit `bare/` store is designed from scratch to live in public locations. Everything
in it is protected by the vault key, not by where it sits:

- `bare/data/` — content-addressed, immutable, **encrypted** CAS objects
- `bare/indexes/` — **encrypted**; even file paths and vault structure are ciphertext
- `bare/keys/` — **wrapped** keys (encrypted under the vault key), never raw
- `bare/branches/`, `bare/pending/` — sync metadata

The server the vault syncs to is untrusted by design, and `bare/` is byte-parity with
what that server holds. Therefore: **git exposure of `bare/` ≡ server exposure**, which
the zero-knowledge model already accepts. A git remote is just a second untrusted
server — one that also happens to give you distribution, replication and history for
free.

The tier that must NEVER be committed is `.sg_vault/local/`:

| file | contains |
|---|---|
| `local/vault_key` | the full vault key, `<secret>:<vault_id>`, **plaintext** — read+write on everything |
| `local/token` | the push token, plaintext |
| `local/key-rnd-*.pem` | **unwrapped** private keys (`BEGIN PRIVATE KEY`) |
| `local/config.json` | identifier pairs; treat as sensitive |

The telltale pattern that confirms the boundary: the same key id appears twice — as a
plaintext PEM in `local/`, and as a binary wrapped blob in `bare/keys/`. `local/` is
the unwrapped working tier; `bare/` is the wrapped, public-safe tier. `work/` is a
scratch/checkout area that can hold plaintext transiently — exclude it too.

### The `.gitignore`

That boundary reduces to three rules. This is the whole of it:

```gitignore
# sgit local credential tier — plaintext vault key, push token, unwrapped private keys.
# NEVER commit. The rest of .sg_vault/ (bare/) is the encrypted server-parity store and is safe.
.sg_vault/local/

# scratch/checkout area — may hold plaintext transiently during sgit operations
.sg_vault/work/

# defence in depth: no unwrapped key material anywhere, ever
*.pem
```

Everything else is committed: the **working tree in plaintext** (the point of the
exercise — see below) and `.sg_vault/bare/` (the encrypted replica).

And a `.gitattributes`, so git never tries to diff ciphertext:

```gitattributes
# encrypted CAS objects, indexes and wrapped keys — treat as opaque binary
.sg_vault/bare/** binary -diff -merge
```

### Why the plaintext working tree is the point

Committing only the encrypted store would be pointless — if all you wanted was sealed
bytes, you could zip `bare/` and be done. The reason to use git is **access to the raw
files**: the vault's contents readable, searchable, reviewable and editable on GitHub,
with git's own tooling on top — blame, PRs, diffs, code review, CI.

That makes repo visibility a content decision, not a crypto one: **the working tree is
plaintext, so the repo should be private unless the content itself is meant to be
public.** `bare/` would be safe either way; your documents are what you are choosing
to expose.

### The round trip: edit on GitHub, pull back into the vault

This is the powerful part. Because the working tree is real files, the flow runs both
ways:

```
vault  ──sgit push──▶  server
  │                       
  └──git commit/push──▶  GitHub  ──edit / PR / merge──▶  changed files
                            │
                            └──git pull──▶  local clone  ──▶  sgit detects the changes
                                                              (sgit status → sgit commit → sgit push)
```

Edit a file in the GitHub web editor, merge a colleague's PR, let a CI job rewrite a
document — then `git pull` into the local clone and **sgit sees exactly what changed**,
the same way it sees your own edits. `sgit status` reports them, `sgit commit` records
them in the vault's own history, `sgit push` seals them to the server.

So GitHub becomes a collaboration surface for an encrypted vault: contributors work in
the tooling they already have, and every accepted change flows back into the vault's
authoritative, encrypted history. Two provenance trails, both kept: git records who
proposed and reviewed a change; sgit records it landing in the vault.

One discipline: **don't let the two diverge silently.** Pull from GitHub before making
local edits, and after every `sgit push`, sync git (§3.2). If both sides changed the
same file, git's merge resolves it in the working tree first — sgit then commits the
resolved result, not a conflict.

## 2 · The audit that backs this up (repeat it on your vault)

Run before first publication, from the vault root:

```bash
KEY_SECRET=$(cut -d: -f1 .sg_vault/local/vault_key)

# 1. the key must not appear anywhere in the working tree
grep -rl "$KEY_SECRET" --exclude-dir=.sg_vault . && echo LEAK || echo OK

# 2. no unwrapped key material outside local/
grep -rl "BEGIN PRIVATE KEY" --exclude-dir=.sg_vault . && echo LEAK || echo OK

# 3. bare/ must contain no readable structure or content
grep -rl -e "$(ls | head -1)" -e "index.html" .sg_vault/bare/ && echo LEAK || echo OK

# 4. generic credential-pattern sweep of the working tree
grep -rniE "(api[_-]?key|secret|password|bearer )" --exclude-dir=.sg_vault \
  --include="*.md" --include="*.json" --include="*.js" . | grep -viE "prose-mention-allowlist"
```

Findings on the reference vault (9 Aug 2026): working tree clean; `bare/` fully opaque
(no greppable paths, filenames or content); the only plaintext credentials in the tree
were exactly the four files in `local/`.

**One standing confirmation:** that every blob in `bare/keys/` is wrapped, never raw,
is an assumption from design intent + observed structure, confirmed appropriate for
publication by the vault owner. If you maintain a fork of sgit, re-verify against
`app-shell`/sgit source after key-handling changes — it is the one file class where a
mistake in a public repo is unrecoverable.

## 3 · How to publish

### 3.1 New or existing vault, same steps

From the vault root — an existing `sgit clone` directory:

```bash
cd voice-debrief__fractal-semantic-graphs      # your local clone of the vault

# 1. protection files FIRST — before any git add
cat > .gitignore <<'EOF'
.sg_vault/local/
.sg_vault/work/
*.pem
EOF
cat > .gitattributes <<'EOF'
.sg_vault/bare/** binary -diff -merge
EOF

# 2. run the §2 audit — all OK before proceeding

# 3. publish
git init
git branch -M main                              # git may default to 'master'
git remote add origin git@github.com:<org>/<vault-repo>.git
git add -A
git status                                      # EYES ON: no .sg_vault/local paths
git commit -m "first commit with contents of sgit vault"
git push -u origin main                         # -u sets upstream; later pushes are just 'git push'
```

**Three things people get wrong here:**

- `git push main` is not valid — `main` is read as the *remote* name. It is
  `git push -u origin main` the first time, then `git push`.
- `git init` may create `master` depending on git version and config; `git branch -M main`
  normalises it before the first push, so it matches GitHub's default.
- Write `.gitignore` **before** the first `git add -A`. Once `local/` is in a commit it
  is in the history, and removing it later means a history rewrite plus key rotation.

For an **existing vault with history you care about**: the sgit history is *inside*
`bare/` — every past sgit commit, snapshot and branch is in the CAS objects and
indexes. Git does not need to replay it; committing `bare/` as-is carries the entire
sgit history and all sgit branches in one git commit. Git's own history then records
the vault's evolution from publication day forward.

### 3.2 Sync discipline

The two histories are parallel: sgit commits are the fine-grained content history
(inside `bare/`); git commits are replication points. Practical rhythm — after each
`sgit push`, run:

```bash
git add -A && git commit -m "vault sync: $(date -u +%F)" && git push
```

CAS objects are immutable and append-only, so git storage grows monotonically and
never diff-churns (`.gitattributes` above disables diff/merge on them anyway).

## 4 · The VaultKey and GitHub Secrets

The key never goes in the repo — not in files, not in commit messages, not in issues,
not in workflow YAML. For CI that needs vault access (scheduled backups, restore
tests, publishing jobs), store it as an **Actions secret**:

`Repo → Settings → Secrets and variables → Actions → New repository secret`
- `SGIT_VAULT_KEY` = `<secret>:<vault_id>`
- `SGIT_PUSH_TOKEN` = the push token (only if CI writes)

Usage sketch:

```yaml
jobs:
  vault-sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: sync vault
        env:
          SGIT_VAULT_KEY: ${{ secrets.SGIT_VAULT_KEY }}
        run: |
          # install sgit, then reattach using the key — never echo it
          mkdir -p .sg_vault/local
          printf '%s' "$SGIT_VAULT_KEY" > .sg_vault/local/vault_key
          sgit pull
          # git add/commit/push as in §3.2
```

Cautions: fork PRs and Dependabot do not receive secrets (good); anyone with write
access to workflows can exfiltrate secrets, so protect the repo and consider an
Environment with required reviewers for the key; rotate the key if it ever appears in
a log.

## 5 · Restore / disaster recovery

With a git clone of the repo and the key from GitHub Secrets (or a password manager):

```bash
git clone git@github.com:<org>/<vault-repo>.git && cd <vault-repo>
mkdir -p .sg_vault/local
printf '%s' "$VAULT_KEY" > .sg_vault/local/vault_key   # from secret storage
sgit status        # sgit operates against the local bare store
sgit pull          # reattach to the server if it exists; bare/ alone suffices if not
```

The git replica plus the key reconstitutes everything — content, sgit history, all
sgit branches — even if the sync server is gone. (Exact reattach behaviour of your
sgit version should be smoke-tested once: do a restore drill into a clean directory
before you need it in anger.)

## 6 · Publishing the vault's own app to GitHub Pages

Once the vault is on GitHub (§3), the working tree is servable as-is by Pages — see
**[HOSTING-ON-STATIC-STORAGE.md](HOSTING-ON-STATIC-STORAGE.md)** for the two patterns this
enables: a plain plaintext static export (no encryption, no `window.sg` — for content with
nothing to protect), or the real static-hosting mode (`SGSend.staticMode`, `SG_STATIC`/
`SG_ENDPOINT`) which serves the **encrypted** `bare/` tree from Pages and decrypts
client-side, so the app stays zero-knowledge even when hosted on a public CDN with no
backend. Both patterns depend on this guide's `.gitignore`/`.gitattributes` boundary being
in place first — Pages will happily serve whatever the repo contains, so the credential
boundary in §1 is what keeps `local/vault_key` off the public web, not anything Pages-side.

## 7 · Checklist

- [ ] Repo visibility set to match the content (working tree is plaintext → private unless the content is meant to be public)
- [ ] `.gitignore` excludes `.sg_vault/local/`, `.sg_vault/work/`, `*.pem`
- [ ] `.gitattributes` marks `bare/` binary
- [ ] §2 audit run, all OK
- [ ] `git status` eyeballed before first commit — no `local/` paths
- [ ] VaultKey in GitHub Secrets (and password manager), never in the repo
- [ ] Restore drill performed once (§5)
- [ ] After each `sgit push`: git sync commit (§3.2)
- [ ] Round trip smoke-tested once: edit a file on GitHub → `git pull` → `sgit status` shows it
