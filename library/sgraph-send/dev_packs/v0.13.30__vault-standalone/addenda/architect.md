# Architect Summary for SGraph Vault Standalone Library

---

## Key Architecture Decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| AD-50 | Vault is a standalone Python library; SG/Send is one remote backend | Decouples vault logic from any single deployment target. The vault works locally, against S3, against a zip file, or against SG/Send. |
| AD-51 | Content-addressed storage (blob ID = SHA-256 of encrypted content) | Deduplication for free. Integrity verification built-in. Blob IDs are deterministic. |
| AD-52 | Type_Safe for all schemas (never Pydantic) | Consistency with osbot ecosystem. Type_Safe provides the same validation without the Pydantic dependency. |
| AD-53 | osbot-aws for S3 operations (never boto3 directly) | Consistent abstraction layer. All AWS calls go through osbot-aws across the entire SGraph ecosystem. |
| AD-54 | Branch model with PKI per branch (every clone = new branch + key pair) | Every participant has cryptographic identity. No shared keys between branches. Clone is a first-class operation. |
| AD-55 | Commits always signed by branch key | Tamper-evident history. Every commit can be verified against the branch's public key. |
| AD-56 | Merge-only main (no direct writes to main branch) | Main branch is an integration point, not a workspace. All work happens on branches and merges into main. |
| AD-57 | Unified vault format (server-side = clone-side = bare format) | No format conversion needed. A vault on disk looks identical to a vault on S3 or inside SG/Send. Simplifies syncing. |
| AD-58 | Offline-first (all operations work without network) | Create, commit, branch, merge — all local. Network is only needed for push/pull. |
| AD-59 | Pluggable remote backends (SG/Send API, local folder, S3, zip, URL) | The vault doesn't know or care where its storage lives. Backend is injected at initialisation. |
| AD-60 | Pre-launch format (no backwards compatibility debt, break freely) | Until v1.0, the on-disk format can change without migration tooling. This enables rapid iteration. |

---

## Vault Data Model

```
vault/
  refs/
    heads/
      main          -> commit-id
      branch-a      -> commit-id
  objects/
    blobs/
      {sha256-id}   -> encrypted content
    trees/
      {sha256-id}   -> tree structure (path -> blob-id mapping)
    commits/
      {sha256-id}   -> signed commit (tree-id, parent-id, author, timestamp, signature)
  keys/
    {branch-name}.pub  -> branch public key
  config              -> vault metadata (name, remotes, settings)
```

The format is Git-inspired but not Git-compatible. Blobs are encrypted. Commits are signed. Trees may have encrypted names (open question — see appsec.md).

---

## Migration Principles

Same principles as the tools pack (AD-40 through AD-48):

### 1. Copy First, Then Delete

When moving vault logic out of App__Send into the standalone library:
1. Copy the code to sgraph-vault
2. Write tests in sgraph-vault
3. Verify tests pass
4. Update App__Send to import from sgraph-vault
5. Verify App__Send tests pass
6. Delete the local copy from App__Send

Never skip step 5. Never do step 6 before step 5 is verified.

### 2. One Module at a Time

Extract storage abstraction first (simplest, fewest dependencies), verify the full pipeline, then proceed to crypto, then commits, then branches, then sync.

### 3. Backward Compatibility During Migration

During the transition period, both the local copy in App__Send AND the sgraph-vault import will work. Temporary code duplication is acceptable. The goal is zero-downtime migration, not zero-duplication.

---

## Remote Backend Interface

Every remote backend implements the same interface:

```python
class Vault_Remote:
    def push_blob(self, blob_id: str, data: bytes) -> bool
    def pull_blob(self, blob_id: str) -> bytes
    def push_ref(self, ref_name: str, commit_id: str) -> bool
    def pull_ref(self, ref_name: str) -> str
    def list_refs(self) -> list[str]
    def push_key(self, branch_name: str, public_key: bytes) -> bool
    def pull_key(self, branch_name: str) -> bytes
```

Backend implementations:
- `Vault_Remote__SG_Send` — uses SG/Send HTTP API
- `Vault_Remote__Local` — reads/writes to a local folder
- `Vault_Remote__S3` — reads/writes to an S3 bucket (via osbot-aws)
- `Vault_Remote__Zip` — reads/writes to a zip file
- `Vault_Remote__URL` — read-only, pulls from an HTTP URL

---

## Integration with App__Send

App__Send provides HTTP routes that delegate to the vault library:

```
App__Send vault routes  ->  sgraph-vault library  ->  Storage_FS (memory/disk/S3)
```

The vault library owns all logic: encryption, signing, tree building, commit creation, merge resolution. App__Send is a thin HTTP wrapper that authenticates requests and calls vault methods.
