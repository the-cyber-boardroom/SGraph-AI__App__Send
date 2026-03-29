# sgit User Guide

sgit is a command-line tool for creating and managing **encrypted vaults** — versioned, encrypted folders you can push to a server, share with a token, and collaborate on. The server never sees your plaintext files: everything is encrypted on your device before it leaves.

Think of it as "git for encrypted folders," but simpler: there is no staging area, no index, and no need to understand branching to get started.

---

## Quick Start

```bash
# 1. Create a new vault in your current folder
sgit init

# 2. Create or edit some files, then snapshot them
sgit commit "first snapshot"

# 3. Connect to a remote server (optional)
sgit remote add https://dev.send.sgraph.ai

# 4. Push your snapshot to the server
sgit push

# 5. Share with someone (or another agent) via a one-time token
sgit share
```

That's the core loop. Everything else builds on these five steps.

---

## Core Concepts

### Vault
A vault is a folder with a hidden `.sg_vault/` directory inside it. That directory stores your commit history, encryption keys, and configuration. Your actual files live alongside it, unchanged. Running `sgit uninit` removes `.sg_vault/` (creating a backup zip first) and returns the folder to a plain directory.

### Vault Key
When you run `sgit init`, a **vault key** is generated and printed:

```
Vault key:  mypassphrase:vault-abc123
```

**Save this.** It is the only way to decrypt your vault or clone it on another machine. If you lose it, your encrypted data is unrecoverable. The vault key has two parts separated by `:`:
- `mypassphrase` — a human-readable passphrase
- `vault-abc123` — the vault ID

### Commit
A commit is a snapshot of all files in the vault directory. Unlike git, there is no staging area — `sgit commit` always captures every changed file. Each commit gets a hash ID you can reference later.

### Branch Model
Every vault has two kinds of branches:

| Branch type | Where the private key lives | Shared? |
|---|---|---|
| **Named branch** | Inside `.sg_vault/bare/keys/` | Yes — pushed to server |
| **Clone branch** | Inside `.sg_vault/local/` | No — stays on your device |

You always work on a **clone branch**. When you push, your clone branch's commits go to the named branch. When you switch named branches, a new clone branch is created for you automatically (or an existing one is reused if you have its private key).

This means: the server always stores encrypted data under named branch keys, while your local work key never leaves your machine.

### Simple Token
A Simple Token looks like `word-word-NNNN` (e.g. `river-cloud-3847`). It derives both the upload identifier and the encryption key entirely on the client — no password is sent to the server. Tokens are used for `sgit share`, `sgit publish`, and `sgit export`.

---

## All Commands

### `sgit init [directory]`
Create a new vault.

```bash
sgit init                          # init current directory
sgit init my-project               # init a new subdirectory
sgit init --existing               # init a folder that already has files
sgit init --vault-key pass:id      # use a specific vault key
sgit init --restore backup.zip     # restore from an uninit backup
```

**What it does:** Creates `.sg_vault/`, generates a vault key and initial named + clone branches, and prints the vault key. With `--existing`, all current files are committed automatically as the first snapshot.

**What next:** `sgit commit` to snapshot changes, then `sgit push` to upload.

---

### `sgit commit [message]`
Snapshot all changed files.

```bash
sgit commit "added README"
sgit commit                        # auto-generates message
sgit commit -d /path/to/vault
```

**What it does:** Hashes every file in the vault directory, compares to the previous commit, and writes a new commit object. Empty commits (no changes) are skipped.

**What next:** `sgit status` to confirm, `sgit push` to upload.

---

### `sgit status [directory]`
Show what has changed since the last commit.

```bash
sgit status
sgit status --explain              # prints a longer explanation of the branch model
```

**Output includes:**
- Modified, added, and deleted files
- Current clone branch and named branch
- Whether you are ahead of the remote (commits not yet pushed)
- Next recommended command

---

### `sgit push [directory]`
Upload your commits to the server.

```bash
sgit push
sgit push --branch-only            # push branch metadata only, not objects
```

**What it does:** Encrypts all new commit and file objects with the named branch key, then uploads them. The server sees only opaque encrypted blobs.

**Requires:** A remote must be configured (`sgit remote add`).

---

### `sgit pull [directory]`
Download changes from the server and merge into your clone branch.

```bash
sgit pull
```

**What it does:** Fetches new commits from the named branch on the server, decrypts them, and fast-forward merges into your clone branch.

---

### `sgit clone <vault-key> [directory]`
Clone a vault from the server.

```bash
sgit clone mypassphrase:vault-abc123
sgit clone mypassphrase:vault-abc123 my-folder
```

**What it does:** Creates a new directory, downloads the named branch, decrypts all objects, and checks out the latest commit.

---

### `sgit diff [directory]`
Show file-level and line-level changes.

```bash
sgit diff                          # diff working copy vs HEAD commit
sgit diff --remote                 # diff HEAD vs remote named branch
sgit diff --commit abc123          # diff vs a specific commit
sgit diff --files-only             # list changed files without content
```

---

### `sgit revert [files...]`
Restore files to a past commit.

```bash
sgit revert                        # revert all files to HEAD
sgit revert notes.md               # revert one file
sgit revert --commit abc123        # revert to a specific commit
sgit revert --force                # revert even with uncommitted changes
```

---

### `sgit stash`
Temporarily save uncommitted changes.

```bash
sgit stash                         # stash all changes, revert to HEAD
sgit stash pop                     # restore last stash
sgit stash list                    # show saved stashes
sgit stash drop                    # discard last stash
```

---

### `sgit share [directory]`
Share a snapshot via a Simple Token.

```bash
sgit share                         # generates a new token automatically
sgit share --token river-cloud-3847
```

**What it does:** Zips all current vault files, encrypts with the token's derived key, uploads to SG/Send, and prints the token. Anyone with the token can download and decrypt the snapshot — no vault key required.

**Use case:** Quick one-shot sharing with a collaborator or an AI agent (e.g. Claude Code web).

---

### `sgit publish [directory]`
Publish a multi-layer encrypted archive to SG/Send.

```bash
sgit publish
sgit publish --token river-cloud-3847
sgit publish --no-inner-encrypt    # outer token encryption only
```

**What it does:** Creates a two-layer encrypted zip:
- **Outer layer** — encrypted with the Simple Token key (for transport)
- **Inner layer** — encrypted with a random key, which itself is encrypted with the vault read-key (for at-rest protection)

The recipient needs both the Simple Token and the vault key to read the inner contents.

---

### `sgit export [directory]`
Export a self-contained encrypted archive to a local file.

```bash
sgit export --output archive.zip
sgit export --token river-cloud-3847 --output archive.zip
```

**What it does:** Same as `sgit publish` but writes to a local file instead of uploading.

---

### `sgit branches [directory]`
List all branches.

```bash
sgit branches
```

Shows all named branches and clone branches, with their IDs and head commit hashes.

---

### `sgit switch <name-or-id>`
Switch to a different named branch.

```bash
sgit switch main
sgit switch branch-named-deadbeef
```

**What it does:** Checks out a named branch by creating a new clone branch (or reusing an existing clone branch if the private key is already local). Your working copy is updated to the named branch's latest commit.

---

### `sgit remote add <url>`
Register a remote server.

```bash
sgit remote add https://dev.send.sgraph.ai
```

### `sgit remote list`
List configured remotes.

### `sgit remote remove <url>`
Remove a remote.

---

### `sgit vault add <alias> <vault-key>`
Store a vault key locally under an alias.

```bash
sgit vault add myproject mypassphrase:vault-abc123
sgit vault list
sgit vault show myproject
sgit vault remove myproject
```

---

### `sgit uninit [directory]`
Remove vault metadata from a folder.

```bash
sgit uninit
```

**What it does:** Creates a backup zip named `.vault__foldername__TIMESTAMP.zip` in the parent directory, then removes `.sg_vault/`. Your files are untouched. Restore with `sgit init --restore backup.zip`.

---

### `sgit dump [directory]`
Print a complete structural dump of the vault as JSON (diagnostic).

```bash
sgit dump
sgit dump --output dump.json
sgit dump --remote
```

---

### `sgit diff-state [dump_a] [dump_b]`
Compare two vault state dumps.

```bash
sgit diff-state dump-a.json dump-b.json
sgit diff-state --local --remote
```

---

### `sgit pki`
Public-key cryptography operations.

```bash
sgit pki keygen --label "my key"
sgit pki list
sgit pki export <fingerprint>
sgit pki import contacts.json
sgit pki sign file.txt --fingerprint abc123
sgit pki verify file.txt file.txt.sig
sgit pki encrypt file.txt --recipient <fingerprint>
sgit pki decrypt file.txt.enc --fingerprint <fingerprint>
```

---

### `sgit fsck [directory]`
Verify vault integrity (checks all objects, refs, branches).

---

## Human Workflows

### Working Alone (local encrypted versioning)

```bash
# Set up
sgit init my-notes
cd my-notes
echo "meeting notes" > notes.md

# Snapshot regularly
sgit commit "meeting notes week 1"
# ... edit more files ...
sgit commit "added action items"

# View history
sgit status
sgit diff
```

You get a full encrypted version history even without ever pushing to a server.

---

### Sharing a One-Shot Snapshot

```bash
# Inside a vault
sgit share

# Output:
# Token: river-cloud-3847
# Share this token to give access to the current snapshot.
```

Send `river-cloud-3847` to your collaborator. They can access it via the SG/Send web UI or via an API client — no sgit installation needed on their side.

---

### Collaborating Ongoing (push / pull)

```bash
# Person A: set up and push
sgit init shared-project
sgit remote add https://dev.send.sgraph.ai
sgit commit "initial files"
sgit push
# → prints vault key: passA:vault-xyz

# Person B: clone and work
sgit clone passA:vault-xyz
cd vault-xyz
# edit files...
sgit commit "B's changes"
sgit push

# Person A: pull B's changes
sgit pull
```

---

### Working on an Existing Folder

```bash
cd ~/my-existing-project
sgit init --existing
# → commits all existing files as the first snapshot
sgit remote add https://dev.send.sgraph.ai
sgit push
```

---

### Ephemeral Vault (work, export, clean up)

```bash
# Create vault
sgit init scratch

# Do work, commit
cd scratch
sgit commit "draft"

# Export encrypted archive locally
sgit export --output scratch-backup.zip

# Remove vault metadata (creates auto-backup zip first)
sgit uninit
# → .vault__scratch__1711540000.zip created

# Later: restore
sgit init --restore .vault__scratch__1711540000.zip
```

---

### Publishing to SG/Send

```bash
sgit publish
# → Token: ocean-lamp-7291
# → Uploaded to SG/Send. Share the token to give access.
```

Recipients with the token can download the outer layer. To read the inner layer they also need the vault key.

---

## Agentic Workflows

sgit is designed for AI agents (like Claude) to use. A vault is just a folder — the agent reads and writes files normally. sgit handles the versioning, encryption, and sharing.

### Claude Code Web: Accessing a Vault via Share Token

When a human shares a vault with a Simple Token, an AI agent can receive the files through the SG/Send API:

1. Human runs `sgit share` and sends the token to the AI
2. AI uses the token to derive the download identifier and decryption key
3. AI downloads and decrypts the snapshot
4. AI modifies files and uploads a new snapshot with the same or a new token
5. Human runs `sgit share --token <token>` to receive the updated files back

The AI never handles the vault key — only the Simple Token, which grants access to a single snapshot.

### Multi-Agent Collaboration

Multiple agents can work on different named branches of the same vault:

```
Agent A (branch: feature-analysis)  →  push  →  server
Agent B (branch: feature-report)    →  push  →  server
Human   (branch: main)              →  pull from A and B, merge, push
```

Each agent has its own clone branch (private key never leaves that agent's session). Named branches are shared on the server.

### Agent Session Pattern

```python
# In an agent session:
# 1. Receive vault key from human
vault_key = "passphrase:vault-abc123"

# 2. Clone the vault
# sgit clone passphrase:vault-abc123

# 3. Work on files normally
# (read, edit, create files in the vault directory)

# 4. Commit and push work
# sgit commit "agent improvements"
# sgit push

# 5. Optionally share a token back to the human
# sgit share
```

### Stateless Agent Pattern (share token only)

For agents that should not have permanent vault access:

```python
# Human provides token
token = "river-cloud-3847"

# Agent downloads snapshot, works on it
# (no sgit needed — use SG/Send API directly)

# Agent re-shares with a new snapshot
# sgit share --token new-token-1234
```

This pattern is useful when you want to give an AI temporary access to files without sharing your vault key.

---

## Tips

- **Always save your vault key** when you run `sgit init`. There is no recovery mechanism.
- **`sgit status` is your dashboard.** Run it to see what's changed, whether you're ahead of remote, and what command to run next.
- **Commits are local until you push.** You can commit as many times as you like without network access.
- **`sgit uninit` is safe.** It always creates a backup zip before removing `.sg_vault/`.
- **Simple Tokens are single-use by design.** After sharing, rotate to a new token for the next snapshot.
- **`sgit diff` before commit** to review exactly what changed.
- **`sgit stash` before switching branches** to avoid losing uncommitted work.
