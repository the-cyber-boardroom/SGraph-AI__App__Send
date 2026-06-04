# 02 — Crypto, keys, and PKI: derivations, encrypt-on-write, sequencing

**version** v0.32.1 · **date** 3 June 2026 · **from** Architect + AppSec · **type** Implementation briefing (client crypto — sgit CLI + vault web, in lockstep)

All crypto here is **client-side**, implemented **twice and identically**: Python (`sgit-ai` CLI, `Vault__Crypto`) and JavaScript (vault web, `sg-vault-crypto.js`, Web Crypto API). The server never derives, holds, or inspects any key. The two implementations must agree byte-for-byte or cross-vault messages won't decrypt — treat a cross-language Known-Answer-Test (KAT) suite as part of the deliverable (precedent: the public-preview cross-language derivation parity tests).

---

## 1. The new derivation: `enum_key` (sibling of `structure_key`)

`enum_key` slots into the **existing** derivation family. It is an HKDF child of `read_key`, with its **own** info label:

```
read_key        EXISTS  = PBKDF2(passphrase|token, salt, 600k)
structure_key   EXISTS  = HKDF(read_key, info='sg-vault-v1:structure-key')
enum_key        NEW     = HKDF(read_key, info='sg-vault-v1:inbox-enum-key')   ← add this
```

- **Domain separation is mandatory.** The `info` label must be distinct from `structure-key` and every other label. A copy-paste of the `structure-key` label silently couples the two keys and is a real bug, not a style nit. Add a test asserting `enum_key != structure_key` for the same `read_key`.
- **One-way property buys a capability tier.** `enum_key` cannot be reversed to `read_key`, so you can hand a drainer/relay `enum_key` (enumerate + fetch + mark-processed) **without** granting full vault read. That is exactly the budgeted-agent posture: a processing agent gets `enum_key`, never `read_key`.
- The server stores `H(enum_key)` in the manifest (`01 §2`) and checks presented `enum_key` against it, identical to the `write_key_hash` mechanism. The server cannot derive `enum_key` (it never holds `read_key`), so the recipient/owner supplies it per request via header.

## 2. The append token: `append_token = H(recipient public key)`

- **Deterministic, publicly derivable, not a secret.** Anyone with the recipient's public key can compute the token. That is fine and intended — the token gates *write*, not *read*.
- Use a fixed hash (`SHA-256` of the canonical serialized public key) and a stable encoding so CLI and web compute the identical token. Pin the public-key serialization format in the KAT.
- The server stores `H(append_token)` as an `append_anchor` (so the stored value is `H(H(pubkey))`). Presented token is single-hashed and compared. Never store the token or the pubkey server-side.
- **Folder name = the token** (`01 §1`). So the token simultaneously: authorizes the write, names the destination folder, and tells the recipient *which keypair* decrypts what landed there.

## 3. Encrypt-on-write (the PKI half — P-155 / P-157, PROPOSED, no code yet)

This is the larger net-new build. Per-vault PKI does **not exist** today (doc 422). You are implementing it.

- **Key pair per vault:** X25519 for encryption (and Ed25519 for signing if/when provenance is added — out of scope here). The **public key** is safe to expose (it *is* the routing address); the **private key never leaves the owner** and is stored **as a file inside the target vault**, encrypted under the vault's own `read_key`/tree like any other content. So "only the recipient can decrypt" reduces to "only holders of the target vault's read access can load its private key" — a property the vault model already guarantees.
- **Encrypt-to-vault (`P-157`):** sender does X25519 ECDH to the recipient's public key → HKDF → AES-256-GCM data key → encrypts the message. Standard sealed-box / ECIES shape. The appended `.enc` payload is `ephemeral_pubkey || iv || ciphertext || tag` (pin the exact framing in the KAT; reuse the existing AES-GCM envelope conventions — 12-byte IV from `crypto.getRandomValues` / `os.urandom`, IV prepended, no IV reuse).
- **The server enforces none of this.** It sees opaque bytes. "You cannot write unencrypted" is true of the honest client only. Write it that way in code comments and user docs — do not imply server validation that does not (and cannot) exist.

## 4. Append-blindness — how it actually holds

Two independent mechanisms, both required:

1. **Cryptographic:** the appender encrypts to a public key whose private half it does not hold, and holds no read key for anything else in the vault → any ciphertext it could fetch is undecryptable to it.
2. **Filename-level:** the server assigns `{epoch_ms}_{rand_hex}.enc` and returns it to no one, so the appender cannot name (and therefore cannot `GET`) even its own write.

Mechanism (2) is why the **random suffix must carry ≥ 96 bits of entropy** (`01 §1`): with the `epoch_ms` prefix narrowing the time window, all unguessability lives in `rand_hex`. If it were the 8-hex (32-bit) `Obj_Id` default, an appender could brute-force-confirm its own (or others') deliveries within a known time window — losing append-blindness at the ciphertext layer. Spend the entropy here.

## 5. In-payload sequence numbers (integrity against a blind relay)

A relay (or any append-capable mover) **cannot read** content, but it **can drop, reorder, or duplicate** files — an availability/integrity vector, not a confidentiality one. The clean mitigation lives *inside the encrypted payload*, where no relay can touch it:

- Each sender includes a **monotonic per-sender sequence number** (and optionally a prior-message hash) inside the plaintext before encryption.
- The recipient, after decrypt, detects **gaps** (dropped/delayed), **reordering** (seq < last seen), and **duplicates** (seq already seen → idempotent drop; pairs with server-side `missing` semantics in `01 §6`).
- `epoch_ms` filename ordering gives best-effort transport ordering; the in-payload counter gives **verifiable** completeness end-to-end. Use both.

## 6. What each surface implements

| Surface | Implements |
|---|---|
| **sgit CLI** (`Vault__Crypto`, new vault-comms module) | `enum_key` derivation; `append_token` computation; X25519 keygen + seal/open; the drain loop (`03`); in-payload seq numbers |
| **vault web** (`sg-vault-crypto.js`, `sg-vault.js`) | identical derivations + seal/open via Web Crypto; the same drain loop for browser drainers; provisioning UI (`03`) |
| **server (User Lambda)** | stores `H(enum_key)`, `H(append_token)`; assigns filenames; **no crypto** |

## 7. Test obligations (crypto)

- **Cross-language KAT:** same inputs → identical `enum_key`, `append_token`, and a payload sealed in Python that opens in JS and vice-versa. This is the lockstep guarantee; it is non-optional.
- **Domain-separation test:** `enum_key != structure_key` for a shared `read_key`.
- **Entropy test:** generated `rand_hex` ≥ 96 bits; no collisions across a large sample.
- **Negative tests:** wrong private key → clean `OperationError`/`InvalidTag`, never a partial / corrupt plaintext; tampered ciphertext → auth failure.
