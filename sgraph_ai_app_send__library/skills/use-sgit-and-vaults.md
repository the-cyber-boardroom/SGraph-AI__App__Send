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

### Share a one-shot snapshot (Simple Token)
```bash
sgit share                              # generates a new token
sgit share --token river-cloud-3847     # use a specific token
```
- Zips vault files, encrypts with token-derived key, uploads to SG/Send
- Recipient needs only the token (no vault key) to download and decrypt
- **No sgit installation needed on recipient side** — works via SG/Send web UI

### Publish a multi-layer encrypted archive
```bash
sgit publish                            # generates token, uploads to SG/Send
sgit publish --token river-cloud-3847
sgit publish --no-inner-encrypt         # outer token encryption only
```
- Outer layer: encrypted with Simple Token key (for transport)
- Inner layer: encrypted with random key, wrapped with vault read-key (for at-rest)
- Recipient needs both token AND vault key for inner contents

### Export to local file
```bash
sgit export --output archive.zip
sgit export --token river-cloud-3847 --output archive.zip
```
- Same as publish but writes to a local file instead of uploading

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

7. **Share a snapshot back to a human**
   ```bash
   sgit share
   # → Token: river-cloud-3847
   ```

---

## Agentic Patterns

### Stateless agent (Simple Token only, no vault key needed)
1. Human runs `sgit share` → sends token to agent
2. Agent downloads and decrypts snapshot via SG/Send API
3. Agent modifies files, re-shares with a new token
4. Human receives updated files

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