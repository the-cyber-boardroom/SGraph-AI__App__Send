---
name: sgit
description: >
  Use this skill whenever you need to interact with a zero-knowledge encrypted vault
  via sgit (formerly sg-send-cli). Triggers include: creating a vault, committing changes,
  pushing files to a vault, pulling changes, cloning a vault, checking vault status,
  branching, sharing snapshots via tokens, diffing, stashing, reverting, exporting,
  publishing, or any mention of sgit, SG/Send, encrypted vault, vault key, Simple Token,
  or encrypted vault sync. This skill enables persistent state and bidirectional
  communication between Claude sessions and human collaborators through a shared
  zero-knowledge encrypted object store with git-like versioning.
---

# SKILL: sgit — Zero-Knowledge Encrypted Vault Operations

> **Canonical source:** `library/skills/use_sgit-and-vaults/SKILL.md` in the
> `SGraph-AI__App__Send` repo (also published as `library/reference/sgit-skill.md` in the
> sgraph.ai library vault). **Last verified:** 2026-07-30 against sgit-ai v0.14.27. If your
> copy came from a manual upload, check for a newer version before trusting details —
> notably: `share send`/`share publish` are currently disabled.

## Overview

`sgit` is a CLI tool for creating and managing **encrypted vaults** — versioned, encrypted
folders you can push to a server, share with a token, and collaborate on. The server never
sees plaintext: everything is encrypted on your device before it leaves (AES-256-GCM).

Think of it as "git for encrypted files" but simpler: no staging area, no index, and
snapshot-the-whole-folder semantics.

This skill enables a Claude session to read from and write to shared vaults, allowing
persistent state and communication across isolated sessions.

---

## Setup

### Install
```bash
pip3 install sgit-ai --break-system-packages
```

### Access Token
Write operations require a token. Pass it with `--token`:
```bash
sgit --token <token> <command>
```

The token is saved to `.sg_vault/token` after first use, so subsequent commands
don't need `--token` again. If you don't have a token, ask the user.

---

## Core Commands

### Create a new vault
```bash
sgit init [directory]
sgit init --existing                    # vault-ify a folder that already has files
sgit init --vault-key pass:id           # use a specific vault key
sgit init --restore backup.zip          # restore from an uninit backup
```
- Creates `.sg_vault/`, generates a vault key and initial branches
- Outputs a vault key — **save it**, it's the only way to access this vault later
- With `--existing`, all current files are committed as the first snapshot

### Commit local changes
```bash
sgit commit "description of changes"
sgit commit                             # auto-generates message
sgit commit -d /path/to/vault
```
- Snapshots **all** changed files (no staging area — like `git commit -a`)
- Empty commits (no changes) are skipped

### Check status
```bash
sgit status
sgit status --explain                   # longer explanation of branch model
```
- Shows modified, added, deleted files
- Current clone branch and named branch
- Whether you are ahead of remote
- Next recommended command

### Push to remote
```bash
sgit push
sgit push --branch-only                 # push branch metadata only
```
- Re-encrypts objects from clone branch key → named branch key
- Uploads only changed objects (delta push)

### Pull remote changes
```bash
sgit pull
```
- Downloads new commits, decrypts, fast-forward merges into clone branch

### Clone an existing vault
```bash
sgit clone <vault-key> [directory]
# e.g. sgit clone mypassphrase:vault-abc123
```
- Creates a new directory, downloads named branch, decrypts, checks out HEAD

### Read-only clone with a read key (v0.14.27+)
```bash
sgit clone --read-key <64-hex> <vault-id> [directory]
# or the shorthand:  sgit clone "<64-hex>:<vault-id>"
```
- Decrypt-only access — you can read everything, write nothing. The right way to consume
  **public vaults** (e.g. the ones listed in `sgraph.ai/core/public-vaults.json`).
- Read keys are published as **base64url** in some registries; the CLI wants **hex**. Convert:
  ```bash
  python3 -c "import base64,sys;print(base64.urlsafe_b64decode(sys.argv[1]+'=').hex())" <b64url-key>
  ```
- Variants: `sgit clone-branch` (thin: history + HEAD only), `sgit clone-headless`
  (credentials only, no data), `sgit clone-range` (a commit range), `--sparse`
  (structure now, file content on demand via `sgit fetch`).

---

## Branching

sgit has a **two-layer branch model** — you always work on a local **clone branch**
(private key never leaves your machine). `sgit push` forwards commits to the shared
**named branch** on the server.

```bash
sgit branches                           # list all branches
sgit branch new <name>                  # create a named + clone branch pair
sgit switch <name>                      # switch to a named branch (reuses or creates clone branch)
```

---

## Diff, Revert, Stash

```bash
sgit diff                               # working copy vs HEAD
sgit diff --remote                      # HEAD vs remote named branch
sgit diff --commit <id>                 # vs a specific commit
sgit diff --files-only                  # list changed files only

sgit revert                             # revert all files to HEAD
sgit revert notes.md                    # revert one file
sgit revert --commit <id>              # revert to a specific commit

sgit stash                              # save uncommitted changes
sgit stash pop                          # restore last stash
sgit stash list                         # show saved stashes
sgit stash drop                         # discard last stash
```

---

## Sharing & Publishing

> **Publishing a whole vault to a GitHub repo** (as a backup/collaboration medium, or to serve
> its app from GitHub Pages) is a different thing from the `sgit share` commands below — it's a
> `git`-level operation on the `.sg_vault/{local,bare,work}` layout, not an sgit subcommand. See
> **`library/guides/vault-html/PUBLISHING-SGIT-VAULT-TO-GITHUB.md`** for the `.gitignore` boundary
> that keeps `local/vault_key` out of the repo, the plaintext-working-tree-plus-encrypted-`bare/`
> pattern, and the GitHub Pages hosting follow-on.

> **⚠️ DISABLED in current CLI (verified against sgit-ai v0.14.27):** `sgit share send` and
> `sgit share publish` are disabled *"pending Simple Token security rework"*. Only
> `sgit share receive` (download a transfer) still works. Until the rework ships, share
> content by giving collaborators a **read-only clone** (`--read-key`, above) or the full
> vault key out-of-band. The sections below describe the pre-rework behaviour and will
> return when the feature is re-enabled.

### Receive a transfer (still works)
```bash
sgit share receive <token>
```

### Share a one-shot snapshot (Simple Token) — DISABLED
```bash
sgit share send                         # [disabled] pending Simple Token security rework
```
- (When enabled) Zips vault files, encrypts with token-derived key, uploads to SG/Send;
  recipient needs only the token — works via SG/Send web UI, no sgit install.

### Publish a multi-layer encrypted archive — DISABLED
```bash
sgit share publish                      # [disabled] pending Simple Token security rework
```
- (When enabled) Outer layer: Simple Token key (transport); inner layer: random key wrapped
  with the vault read-key (at-rest); recipient needs both token AND vault key.

---

## Vault Key Format

```
mypassphrase:vault-abc123
└── passphrase ──┘ └ vault_id ┘
```

- The passphrase derives encryption keys via PBKDF2 (600k iterations) — the server never sees it
- The vault ID identifies the vault on the server
- **Save the vault key** — without it, the vault contents are unrecoverable (no password reset)

---

## Typical Workflow for a Claude Session

1. **Install**
   ```bash
   pip3 install sgit-ai --break-system-packages
   ```

2. **Create or clone a vault**
   ```bash
   # Create new:
   sgit init my-vault

   # Or clone existing:
   sgit clone passphrase:vault-id
   ```

3. **Read content** — browse files normally with `cat`, `ls`, etc.

4. **Make changes** — create/edit/delete files in the vault directory

5. **Commit and push**
   ```bash
   cd <vault-dir>
   sgit commit "session update"
   sgit push
   ```

6. **Pull updates from others**
   ```bash
   sgit pull
   ```

7. **Hand results back to a human** — commit + push, then share the vault key (or a
   read key for read-only access) out-of-band. (`sgit share send` snapshot tokens are
   currently disabled — see "Sharing & Publishing".)

---

## Agentic Patterns

### Read-only consumer agent (read key, no write access)
1. Human (or a public registry like `sgraph.ai/core/public-vaults.json`) provides
   `vault_id` + read key
2. Agent runs `sgit clone --read-key <hex> <vault_id>` and reads the content
3. Agent can never modify the vault — safe default for reference/library vaults

### Stateless agent via snapshot token — CURRENTLY DISABLED
(`sgit share send` is disabled pending the Simple Token security rework; use the
read-only consumer pattern above instead.)

### Multi-agent collaboration
```
Agent A (branch: feature-analysis)  →  push  →  server
Agent B (branch: feature-report)    →  push  →  server
Human   (branch: main)              →  pull from A and B
```
Each agent has its own clone branch — private key never leaves that session.

---

## Remote Management

```bash
sgit remote add <url>                   # e.g. https://dev.send.sgraph.ai
sgit remote list
sgit remote remove <url>
```

---

## Vault Key Store

```bash
sgit vault add <alias> <vault-key>      # store under a name
sgit vault list
sgit vault show <alias>
sgit vault remove <alias>
```

---

## PKI (Sign & Encrypt Files)

```bash
sgit pki keygen --label "My Keys"
sgit pki list
sgit pki export <fingerprint>
sgit pki import <file>
sgit pki sign <file> --fingerprint <fp>
sgit pki verify <file> <signature-file>
sgit pki encrypt <file> --recipient <fp>
sgit pki decrypt <file> --fingerprint <fp>
```

---

## Diagnostics

```bash
sgit dump                               # full structural JSON dump of vault
sgit dump --output dump.json
sgit dump --remote
sgit diff-state dump-a.json dump-b.json # compare two vault dumps
sgit fsck                               # verify encrypted object integrity
```

---

## Safe Removal

```bash
sgit uninit
```
- Creates backup zip `.vault__foldername__TIMESTAMP.zip` in parent directory
- Removes `.sg_vault/` — your files are untouched
- Restore later with `sgit init --restore backup.zip`

---

## Key Facts

- **Zero-knowledge**: the server never sees plaintext — all encryption/decryption is local (AES-256-GCM)
- **No staging area**: `sgit commit` always snapshots the whole folder
- **Commit before push**: like git, you must commit before push will upload
- **Delta push**: only changed objects are uploaded
- **Two-layer branches**: clone branch key (local only) + named branch key (shared on server)
- **Content-addressable**: object IDs are SHA-256 of plaintext; deduplication works across commits
- **Browser interop**: encryption params match Web Crypto API exactly
- **Cross-session communication**: commit + push at session end; next session pulls and continues