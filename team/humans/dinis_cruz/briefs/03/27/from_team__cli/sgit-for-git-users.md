# sgit for Git Users

If you already know git, this document maps sgit concepts to what you know, highlights key differences, and explains why those differences exist.

---

## Command Equivalence Table

| git | sgit | Notes |
|---|---|---|
| `git init` | `sgit init` | sgit also generates an encryption key |
| `git clone <url>` | `sgit clone <vault-key>` | vault-key contains both auth and encryption |
| `git add . && git commit -m "msg"` | `sgit commit "msg"` | No staging area in sgit |
| `git status` | `sgit status` | Shows branch model + push status |
| `git diff` | `sgit diff` | Working copy vs HEAD |
| `git diff HEAD~1` | `sgit diff --commit <id>` | Diff vs a specific commit |
| `git push` | `sgit push` | Re-encrypts objects for named branch key |
| `git pull` | `sgit pull` | Decrypts and fast-forward merges |
| `git log` | (use `sgit dump` for now) | Full log view not yet in CLI |
| `git checkout -- file` | `sgit revert file` | Restore file to HEAD |
| `git checkout <commit>` | `sgit revert --commit <id>` | Restore working copy to a commit |
| `git stash` | `sgit stash` | Same semantics |
| `git stash pop` | `sgit stash pop` | Same |
| `git branch -a` | `sgit branches` | Lists named + clone branches |
| `git checkout -b feature` | `sgit branch new feature` | Creates named + clone branch pair |
| `git checkout feature` | `sgit switch feature` | Reuses existing clone if possible |
| `git remote add origin <url>` | `sgit remote add <url>` | |
| `git remote -v` | `sgit remote list` | |
| `git fsck` | `sgit fsck` | Verifies encrypted object integrity |
| `git archive` | `sgit export --output file.zip` | Produces encrypted multi-layer zip |
| — | `sgit share` | No git equivalent; one-shot token share |
| — | `sgit publish` | No git equivalent; upload to SG/Send |
| — | `sgit uninit` | No git equivalent; safe removal with backup |
| — | `sgit pki` | No git equivalent; asymmetric crypto operations |

---

## Key Differences

### 1. No Staging Area

In git, you explicitly stage files with `git add` before committing. In sgit, `sgit commit` always captures **every changed file** in the vault directory.

```
git:   edit → git add → git commit
sgit:  edit → sgit commit
```

**Why:** The vault model is "snapshot the whole folder" — similar to how backup tools work. This keeps the UX simpler and reduces the chance of accidentally leaving sensitive files out of a commit.

---

### 2. Two-Layer Branch Model

Git has one kind of branch. sgit has two:

```
git:
  main  ──────── origin/main
  (local == remote, same key)

sgit:
  clone branch (local only, private key never shared)
       │
       └── push ──► named branch (on server, shared key)
```

**Why:** The server must only ever receive content encrypted for the named branch key. Your local work-in-progress is encrypted with a different key (the clone branch key) that stays on your machine. This means even if someone intercepts your push, they only see opaque re-encrypted blobs, not a re-keying of your local private state.

When you run `sgit push`, sgit:
1. Decrypts objects with your clone branch key
2. Re-encrypts them with the named branch key
3. Uploads only the named-branch-encrypted versions

---

### 3. Vault Key = URL + Credentials + Encryption Key

In git, you authenticate to a remote with a username/token/SSH key, separately from the repo URL. In sgit, the **vault key** bundles everything:

```
git:   git clone https://github.com/user/repo  (+ separate auth)
sgit:  sgit clone mypassphrase:vault-abc123    (auth + decryption in one)
```

**Format:** `{passphrase}:{vault_id}`

The passphrase is used via PBKDF2 to derive the master encryption key. The vault_id identifies the vault on the server. Together they are sufficient to decrypt every object in the vault.

**Consequence:** **Losing the vault key means losing all access to the vault.** There is no password reset. Store it securely (password manager, etc.).

---

### 4. Server Blindness

In git, the server stores your file content in plaintext (unless you use a separate encryption layer). In sgit, **the server never sees plaintext**:

```
git server:   stores file contents (readable by server operator)
sgit server:  stores AES-256-GCM ciphertext only
```

The server only knows:
- The vault ID
- The sizes of encrypted blobs
- When objects were last modified

It does not know filenames, file contents, commit messages, or how many files are in the vault.

---

### 5. No Merge Conflicts (Yet)

Git has three-way merge and merge conflict resolution. sgit currently supports only fast-forward merges. If the named branch has diverged from your clone branch, `sgit pull` will fail and ask you to resolve manually.

```
git:   git merge feature  (three-way merge, conflict markers)
sgit:  sgit pull          (fast-forward only for now)
```

---

### 6. Object Addressing

Both git and sgit use content-addressable storage: object IDs are SHA-256 hashes of the content. The difference is that in sgit, the **ID is computed over the plaintext** but the **stored bytes are ciphertext**.

```
git:   object_id = SHA-1(content)   stored as zlib-compressed plaintext
sgit:  object_id = SHA-256(content) stored as AES-256-GCM ciphertext
```

This means deduplication works correctly: two identical files in different commits share the same blob object, even though that blob is encrypted.

---

### 7. Cloning Creates a Clone Branch

In git, `git clone` gives you a local copy of the default branch, directly tracking `origin/main`.

In sgit, `sgit clone` downloads the named branch and creates a **new clone branch** for your local work. You never commit directly to the named branch — your commits go to the clone branch, and `sgit push` forwards them to the named branch.

```
git clone:   local main ──tracks──► origin/main
sgit clone:  named-main (on server)
             clone-main-{id} (local, fresh key, your workspace)
```

---

### 8. Branch Switching Always Provisions a Key

In git, `git checkout feature` just moves HEAD. In sgit, `sgit switch feature` may also generate a new clone branch with a fresh cryptographic key pair — unless you already have a clone branch pointing to that named branch locally.

```
git switch feature:   HEAD = feature tip, same working tree
sgit switch feature:  1. look for existing clone branch with local private key
                      2. if found: reuse it (fast)
                      3. if not: create new clone branch + key pair (slow)
                      4. check out named branch HEAD to working copy
```

---

## Workflow Comparison

### Solo Development

```bash
# git
git init
git add . && git commit -m "initial"
git remote add origin https://github.com/user/repo
git push -u origin main

# sgit
sgit init
sgit commit "initial"
sgit remote add https://dev.send.sgraph.ai
sgit push
```

### Cloning and Working

```bash
# git
git clone https://github.com/user/repo
cd repo
# edit...
git add . && git commit -m "changes"
git push

# sgit
sgit clone passphrase:vault-id
cd vault-id
# edit...
sgit commit "changes"
sgit push
```

### Sharing a Snapshot (no git equivalent)

```bash
# sgit only — share a one-time snapshot via token
sgit share
# → Token: river-cloud-3847
# Send this token to your collaborator or AI agent.
# They download and decrypt without needing the vault key.
```

### Branching

```bash
# git
git checkout -b feature
# edit...
git add . && git commit -m "feature work"
git push -u origin feature

# sgit
sgit branch new feature
# edit...
sgit commit "feature work"
sgit push
```

---

## Things That Don't Exist in sgit (Yet)

| git feature | sgit equivalent | Status |
|---|---|---|
| `git log` | `sgit dump` (raw JSON) | Full log viewer planned |
| `git merge` | `sgit pull` (fast-forward only) | Three-way merge planned |
| `git rebase` | — | Not planned |
| `git tag` | — | Not planned |
| `git submodule` | — | Not planned |
| `git bisect` | — | Not planned |
| `git blame` | — | Not planned |
| Merge conflicts | — | In progress |
| `.gitignore` | — | Planned (`.sgitignore`) |
| Partial commit | — | Not planned (whole-folder model) |
| `git cherry-pick` | — | Not planned |

---

## Things That Exist in sgit but Not git

| sgit feature | Description |
|---|---|
| `sgit share` | One-shot token-based snapshot sharing (no vault key needed) |
| `sgit publish` | Multi-layer encrypted archive upload to SG/Send |
| `sgit export` | Multi-layer encrypted archive to local file |
| `sgit uninit` | Safe vault removal with automatic backup |
| `sgit vault` | Local vault key store (alias → vault key) |
| `sgit pki` | Built-in asymmetric key management (keygen, sign, verify, encrypt, decrypt) |
| `sgit dump` | Full structural JSON dump of vault internals (diagnostic) |
| `sgit diff-state` | Compare two vault dumps |
| Simple Token | `word-word-NNNN` token that derives both address and key client-side |
| Server blindness | Server never sees plaintext — encrypted before upload |
| Clone branch isolation | Local work key never sent to server |

---

## Mental Model Shift

The most important mindset shift coming from git:

> **In git, "remote" is a mirror of your history.**
> **In sgit, "remote" is an encrypted dead-drop that only you (and people with your vault key) can read.**

Git trusts the server with your content. sgit treats the server as untrusted storage — a reliable but blind object store. The encryption and access control are entirely client-side.

This is why vault keys are so important: there is no server-side account, no password reset, no "forgot my password" flow. The key is the vault.
