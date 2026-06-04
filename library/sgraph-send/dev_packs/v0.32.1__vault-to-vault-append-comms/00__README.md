# 00 — README: Vault-to-Vault Append Communication (append-only token + encrypt-on-write)

**version** v0.32.1 · **date** 3 June 2026 · **from** Architect + AppSec · **type** Implementation briefing pack (overview)

---

## What you are building

A primitive that lets **one vault write (append) to another vault** without being able to read it, and a layer on top that makes those writes **encrypted to the recipient's public key**. Together these give bidirectional, end-to-end-encrypted, **broker-less** vault-to-vault messaging. The driving deployment is the kneescore.com rollout (~100 user/child vaults talking to an admin/doctor parent vault), but the deliverable is the **general primitive**, proven on 2-then-5 vaults before any rollout.

This pack is the buildable contract distilled from the 3 June dev brief (`vault-to-vault append-only token and encrypt-on-write`). It supersedes nothing; it makes the brief concrete enough to implement.

## The four principles (do not violate)

1. **Append is blind.** The holder of the append capability can write, and can do *nothing* else — no list, no fetch, no decrypt, no delete. It cannot even read back the file it just wrote. This is enforced by **server-assigned filenames** (the appender never learns the id) and by **encryption to a key it does not hold**.
2. **Encrypt-on-write.** Appended payloads are AES/PKI ciphertext addressed to the recipient's public key. The server stores opaque bytes and never inspects them. "You cannot write unencrypted" is a property of the honest client, **not** something the server enforces — the server cannot tell ciphertext from plaintext. State it that way everywhere.
3. **Confidentiality comes from the keys, never from the token.** The append token is deterministically derived from the (non-secret) public key, so it is **not a secret**. It gates *who may write*; the PKI gates *who may read*. A leaked token lets an attacker write encrypted-to-recipient garbage — never readable data.
4. **Capability tiers are non-overlapping and enforced by distinct gates.** Four roles, four gates (see table). No operation is reachable by more than its intended tier.

## The four-tier capability model

| Capability | Derivation / form | Held by | CAN | CANNOT |
|---|---|---|---|---|
| **append token** | `H(recipient public key)` — deterministic, non-secret | any sender / relay | append ciphertext into the inbox | list · fetch · decrypt · mark-processed · purge |
| **enum key** | `HKDF(read_key, info='sg-vault-v1:inbox-enum-key')` | drainer / relay process | list pending · fetch ciphertext · **mark-processed** (move pending→processed) | decrypt content · purge |
| **private key** | per-vault PKI private key (a file *inside* the target vault) | recipient only | decrypt payloads (client-side) | — (never a server gate) |
| **write_key** (vault key) | EXISTS — PBKDF2, hash in `vault_pointer.json` | vault owner | **purge** inbox/processed files · write the real tree | — |

The component that handles the *most* traffic (a relay) holds the *least* secret (no private key). That inversion is the security result, not a side effect.

## The two topologies this enables

**A. Inbox-in-target (simplest, prove this first).** The inbox lives inside the recipient's own vault. Senders append; the recipient (holding `enum_key` + its private key) drains.

**B. Three-vault blind relay (the strong result).** A shared inbox vault receives from everyone; a **relay drainer** — holding `enum_key` on the shared inbox and an `append_token` on each target, but **no private key** — routes ciphertext by folder name (`= H(pubkey)`) into each target's inbox vault, where only the target's private key can decrypt. Because routing is by a non-secret address and the relay never decrypts, **a standard email/SMTP server can stand in for the relay** — which is the proof that the transport has zero read-dependency. See `03`.

## Build ledger — EXISTS vs PROPOSED (be honest about size)

| Piece | Status | Where |
|---|---|---|
| `vault_pointer.json` manifest, `write_key_hash`, write/delete double-gating | **EXISTS** | User Lambda `Routes__Vault__Pointer.py` |
| CAS storage model, tombstone-on-destroy (`deleted.json` / `purge`) | **EXISTS** | User Lambda + Storage_FS |
| `structure_key = HKDF(read_key, …)` derivation pattern | **EXISTS** | vault crypto (sibling of the new `enum_key`) |
| Deterministic-id credential → capability pattern | **EXISTS** | P-177 ro-token (`SGVaultCrypto.deriveRoTokenTransferId`) |
| Token issuance / rotation machinery | **EXISTS** | Admin API |
| Per-vault X25519 keypair + encrypt-to-vault (`P-155` / `P-157`) | **PROPOSED — no code** | doc 422 "Vault Discovery and Public Keys" |
| `append` / `inbox` (list+fetch) / `processed` (list+delete) / `purge` endpoints | **NET-NEW server work** | this pack, `01` |
| `enum_key` derivation + `H(enum_key)` / `H(token)` manifest fields | **NET-NEW** | `01`, `02` |
| Write-side capacity cap (the 3.75 MB limit is **read-side only**) | **NET-NEW** | `01` |
| Template-vault provisioning flow | **NET-NEW** | `03` |

So this proposal is effectively **P-157 (encrypt-to-vault) + a new append/inbox transport on top.** Neither half exists yet.

## Open decisions for the project lead (only these remain)

| # | Decision | Default if unspecified |
|---|---|---|
| D-1 | **Token cardinality** — one shared parent append token vs. one per child. `append_anchors` is a *list*, so the schema supports either; this is a business/ops call (revocation blast radius, time-windowed receipt). | Per-correspondent (surgical revocation) for kneescore |
| D-2 | **Inline content ceiling** — max summed ciphertext for `include_content:true` before the caller must page or fetch-by-id (Lambda 3.75 MB response cap). | 3 MB summed; over → `413`, page it |
| D-3 | **Email-relay backend** — ship as a fallback/bridge only, or a first-class transport for the health rollout? | Bridge/fallback only; SG/Send append is primary (metadata, see `04`) |

## Reading order

- `01__server-api.md` — the net-new endpoints, `Type_Safe` contracts, manifest delta, storage layout, status codes, caps, idempotency, log hygiene.
- `02__crypto-keys-and-pki.md` — `enum_key` derivation, `append_token = H(pubkey)`, encrypt-on-write, entropy + domain-separation requirements, in-payload sequence numbers.
- `03__provisioning-and-topologies.md` — template-vault provisioning, the drain loop, both topologies, the email-relay backend.
- `04__security-and-acceptance.md` — AppSec sign-off conditions, the resolved delete gate, the metadata trade, phased plan, acceptance criteria, the N-vault proof harness.
