# AppSec Summary for SGraph Vault Standalone Library

---

## Security Model: Zero-Knowledge

The vault's fundamental security property is that the **server only stores ciphertext**. The decryption key is never transmitted to any backend. All encryption and decryption happens on the client (Python library consumer).

### 1. Encryption Primitives

| Purpose | Algorithm | Notes |
|---------|-----------|-------|
| Blob encryption | AES-256-GCM | Content-addressed: blob ID = SHA-256 of ciphertext |
| Signing (commits, branches) | ECDSA P-256 or Ed25519 | Every commit signed by branch key |
| Encrypt-for-reader | Reader's public key wraps a per-blob symmetric key | Enables sharing without exposing branch key |

**Encrypt-for-reader pattern:** When sharing data with a specific reader, the blob's symmetric key is encrypted with the reader's public key. The reader decrypts the key with their private key, then decrypts the blob. The server never sees either key.

### 2. Key Management Risks (Critical)

The vault has multiple key types, each with distinct lifecycle risks:

| Key Type | Generation | Storage | Rotation Risk |
|----------|-----------|---------|---------------|
| **Branch key pair** | Generated on clone (every clone = new branch = new key pair) | Local disk, encrypted at rest | Revocation requires updating all peers |
| **Lambda identity key** | Generated per Lambda deployment | Lambda environment (encrypted) | Rotation requires re-registering with all vaults |
| **Nested vault key** | Independent of outer vault key | Inside outer vault (encrypted blob) | Inner key compromise does not compromise outer; outer key compromise exposes encrypted inner key blob |

**Branch key lifecycle:**
1. **Generation** — created locally when a branch is created or a vault is cloned
2. **Storage** — private key stored on local disk, encrypted at rest; public key published to vault metadata
3. **Rotation** — new key pair generated, old public key retained for signature verification of historical commits
4. **Revocation** — public key marked revoked in vault metadata; peers must pull updated metadata to honour revocation

### 3. File Name Encryption (Open Question)

**Current state:** File names appear as plaintext in the tree structure. The tree maps human-readable paths to blob IDs.

**Risk:** An attacker with access to the server can see the directory structure and file names, even though file contents are encrypted.

**Options under consideration:**
- Encrypt file names in the tree (names become opaque blob references)
- Keep plaintext names (simpler, enables server-side search/indexing)
- Hybrid: encrypt names but store an encrypted index for authorised readers

**Decision needed** before v1.0. For pre-launch, plaintext names are acceptable since we can break format freely.

### 4. Nested Vault Isolation

Inner vault keys are **independent** of outer vault keys. Compromising the outer vault's encryption reveals the inner vault as an encrypted blob — the attacker still needs the inner vault's key to read its contents. This provides defence-in-depth: sensitive material can be double-wrapped by nesting vaults.

### 5. Offline Mode Security

When operating offline, all keys reside on local disk.

**Risks:**
- Local disk compromise exposes all key material
- No ability to check revocation status of peer keys while offline

**Mitigations:**
- Keys encrypted at rest (passphrase-protected or OS keychain integration)
- Revocation checks performed on next sync
- Offline operations are signed with the local branch key; peers verify signatures on sync

### 6. Trust Model for Signed Commits

Every commit is signed by the branch key that created it.

| Model | Description | Trust Level |
|-------|-------------|-------------|
| **Self-signed** | Branch key signs its own commits; peers verify the signature matches the published public key | Proves authorship by key holder; no identity binding |
| **Authority-signed** | A trusted authority co-signs or endorses a branch key, binding it to an identity | Proves authorship by a known entity; requires trust infrastructure |

For pre-launch, self-signed is sufficient. Authority-signed is a future consideration for enterprise use cases.

### 7. Content Security Policy

**Not applicable.** SGraph Vault is a Python library, not a web application. There are no HTML pages, no browser context, and no CSP headers to configure. Security is enforced at the cryptographic layer, not the transport layer.

---

## Already Handled by Architecture

| Concern | How It's Addressed |
|---------|-------------------|
| Data exfiltration from server | Server only has ciphertext — nothing useful to exfiltrate |
| Key exposure on server | Keys never sent to server — encryption/decryption is client-side |
| Replay attacks on commits | Commits are content-addressed (SHA-256) and signed |
| Tampering with blobs | Blob ID = SHA-256 of content; any modification changes the ID |
| Unauthorised branch writes | Commits must be signed by a recognised branch key |

---

## References

- AppSec review of March 10-12 briefs: `team/roles/appsec/reviews/03/12/v0.13.30__appsec-review__march-10-12-briefs.md`
- AppSec review of AI agents as vault peers: `team/roles/appsec/reviews/03/11/v0.13.22__appsec-review__ai-agents-as-vault-peers.md`
