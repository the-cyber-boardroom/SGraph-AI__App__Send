# Provenance Through PKI

**version** v0.13.30
**date** 14 Mar 2026
**audience** Team, security reviewers, anyone evaluating trust properties

---

## The Problem with Traditional Authorship

In Git, authorship is metadata:

```
author: alice@example.com
committer: bob@example.com
```

This is trivially forgeable. Anyone can set `git config user.email` to any
value. Platforms like GitHub map commits to accounts via email matching,
but this is platform trust — not cryptographic proof.

If the platform is compromised, all authorship claims become unreliable.

---

## How SG Vault Handles Provenance

SG Vault makes every commit cryptographically attributable. The mechanism
is straightforward: every branch has a key pair, every commit is signed by
the branch key that created it, and the signature chain is embedded in the
commit graph itself.

### What Gets Signed

Each commit's signature covers:

- **`tree_id`** — the root tree hash, which is a cryptographic commitment
  to the exact contents of every file in the snapshot
- **`parents`** — parent commit IDs, which chain the history
- **`timestamp`** — uint milliseconds since epoch
- **`message`** — the commit message
- **`branch_id`** — which branch created this commit

If any of these fields are changed after signing, the signature becomes
invalid. Tampering with any historical commit invalidates all descendant
commit IDs as well.

### The Signature Lineage

```
init commit:          signed by clone branch key
file commits:         signed by clone branch key
merge into clone:     signed by clone branch key
merge into named:     signed by named branch key
```

The named branch's signature chain starts at its first merge. All commits
on the named branch are signed by the named branch key. All commits on a
clone branch are signed by that clone's unique key.

This means you can look at any commit in the graph and immediately know:

- Which branch created it
- Which key signed it
- Whether the signature is valid

---

## Branch = Cryptographic Identity

Every `clone()` auto-generates an EC P-256 key pair. The branch IS the
clone's identity.

```
clone()  →  generate EC P-256 key pair
         →  branch_id = "branch-clone-" + random_id
         →  publish public key to vault
         →  all commits signed by this key
```

The clone branch private key lives only at `local/branch_key.pem`. It
**never leaves the device**. It is never synced to the server, never
included in a zip export, never shared with collaborators.

This gives you:

| Property | How |
|----------|-----|
| Provenance | Every commit traces to a branch → key pair → device |
| Isolation | You can only sign commits for your own branch |
| Push always succeeds | Your branch is yours alone — no remote conflicts |
| Anonymous by default | The key proves "same entity" without revealing identity |
| Agent-native | AI agents get the same first-class identity as humans |

**Beyond device provenance.** Branch keys prove which device made a commit.
For workflows that require proving which *person* made a commit — audit
trails, compliance, data rooms — the architecture supports an additional
user-level signature using the person's own key pair. Only the user's
public key enters the vault (for verification); the private key is managed
entirely outside the vault. This is documented in the companion PKI
Workflows document (`v0.13.32__pki-workflows__operating-modes.md`).

---

## Two Kinds of Private Keys (Plus User Keys)

| Key | Leaves device? | Stored where | If lost |
|-----|---------------|-------------|---------|
| Clone branch private key | **Never** | `local/branch_key.pem` | Branch permanently locked |
| Named branch private key | In vault (encrypted) | `bare/keys/key-{id}` | Can be recovered with vault key |
| User private key | **Never in the vault** | `~/.sg-send/keys/` (user-managed) | User re-imports from backup |

The clone key is deliberately local-only because it IS the provenance
record for this specific device/session. If the same key appeared on two
devices, provenance is broken — you couldn't distinguish which device
made a given commit.

The user private key is deliberately **outside the vault entirely**. The
vault holds only the user's public key (for signature verification by
other participants). The private key lives in the user's own key store,
OS keychain, or hardware token — never in any vault the user signs
commits in. This separation means compromising a vault does not
compromise the user's identity.

Permanently locking a branch is simply deleting the private key. No
ceremony required. The branch history remains intact and verifiable
forever. This is a normal lifecycle event.

---

## Named Branch Trust Levels

Named branches (like "current") have their own key pair. Their private
key has two possible storage modes:

**Open** — encrypted with the vault's `read_key`:

```
bare/keys/key-{id} = ENC(read_key, named_branch_private_key)
```

Anyone with the vault key can decrypt it and perform merges into the
named branch. This is the common case for team collaboration.

**Locked** — additionally wrapped with a specific user's public key:

```
bare/keys/key-{id} = ENC(read_key, ENC(user_pub_key, named_branch_private_key))
```

Only that specific user can decrypt the named branch key and merge.
Even someone with the vault key cannot forge a merge into a locked
named branch.

---

## Trust Without Servers

Because signatures are embedded directly in the commit graph:

- **Verification happens locally.** No server call needed. Decrypt the
  commit, read the signature, verify against the branch's public key.
- **Servers cannot fake authorship.** The server stores opaque encrypted
  blobs. It can't even tell which objects are commits, let alone forge
  a valid signature.
- **History integrity survives server compromise.** Even if an attacker
  gains full server access, they see only encrypted blobs. They can
  delete data (denial of service) but cannot forge valid signed commits.
- **Offline verification.** Given a zip export of a vault, you can verify
  the entire commit history without any network access.

---

## What This Enables

**Auditable collaboration.** For every file in the vault, you can trace
the exact chain of commits, branches, and signatures that produced the
current version. The audit trail is cryptographic, not a log file.

**Agent accountability.** AI agents, CI pipelines, and automated tools
get the same first-class identity model as human contributors. An agent's
commits are signed by the agent's branch key. There is no second-class
citizenship.

**Regulatory compliance.** For environments that require provenance
records (financial services, healthcare, government), the commit graph
IS the compliance record. It doesn't rely on a separate audit system —
the version control system is inherently auditable.

---

*SGraph Send — v0.13.30 — 14 March 2026*
