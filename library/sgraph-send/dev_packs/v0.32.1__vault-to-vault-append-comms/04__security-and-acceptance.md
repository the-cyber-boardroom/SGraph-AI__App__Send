# 04 — Security conditions, phased plan, acceptance criteria

**version** v0.32.1 · **date** 3 June 2026 · **from** AppSec + Architect · **type** Implementation briefing (sign-off + plan)

AppSec's conditions for sign-off, the resolved capability decisions, the honest residual risks, and a phased build plan ending in the N-vault proof.

---

## 1. AppSec sign-off conditions (each is blocking unless marked non-blocking)

1. **Append must be provably weaker than `write_key`.** The append path must be a distinct, CAS-confined endpoint that can reach **no** mutable ref/index and **no** delete. If a review shows the append capability can touch `refs/`/`indexes/` or overwrite an existing object, it is **High** and blocks. (Implemented as: server-assigned filename into `inbox/{token}/`, no caller-named id — `01 §3.1`.)
2. **Store hashes only.** `append_anchors` = `H(token)`, `enum_key_hash` = `H(enum_key)`, never the token / pubkey / enum_key. Server compromise leaks nothing usable. (`01 §2`.)
3. **Confidentiality is from the keys, never the token.** Document the append token as non-secret everywhere; do not let any downstream feature build on token secrecy. (`02 §2`.)
4. **Entropy in the random filename suffix ≥ 96 bits.** This carries append-blindness at the ciphertext layer once the `epoch_ms` prefix narrows the window. Not the 8-hex default. (`02 §4`.)
5. **Domain separation on `enum_key`.** Distinct HKDF `info` label; test that `enum_key != structure_key`. (`02 §1`.)
6. **The append ack is a pure boolean; reasons go in status codes.** `ok:false` must not reveal bad-token vs cap-full in the body (`403` vs `507`). The appender must not be able to probe inbox state. (`01 §3.1`, `§4`.)
7. **Capacity cap on the write side is mandatory** (the 3.75 MB limit is read-side only). Plus the forthcoming agent budget. Confidentiality survives flooding; availability needs the cap. (`01 §5`.)
8. **In-payload per-sender sequence numbers** to make drop/reorder/duplicate by a blind relay detectable end-to-end. (`02 §5`.)
9. *(Non-blocking)* **Move `append_token` to a header** if clean logs are wanted; it is non-secret, so path-logging is low-risk and acceptable. (`01 §7`.)

## 2. Resolved capability decisions (do not re-litigate)

- **Delete is split into two operations, by tier:**
  - `mark-processed` — **reversible move** to `processed/`, **`enum_key`-gated** (so a relay can clean up without the owner key). This is the drainer's "delete the read ones."
  - `purge` — **irreversible unlink**, **`write_key`-gated** (owner only). The single destructive capability handed to no non-owner.
  This resolves the earlier open question (enum-gated delete risked a silent-drop attack by any read-capable holder). Soft-delete + owner-only purge is the safe posture, and it mirrors the existing `/vault/destroy` tombstone/`purge` precedent.
- **`enum_key` grants enumerate+fetch+mark-processed but not decrypt and not purge** — the drainer tier. Decryption needs the private key; purge needs `write_key`.

## 3. Honest residual risks (decisions, not flaws)

- **Metadata under the relay topology (B).** Contents stay encrypted, but the relay (and any email hop) sees the **traffic graph**: "fingerprint Y → target X at time Z, ~N bytes." For a health partner this is communication-pattern metadata about patients and a clinician. In Topology A only the owner saw counts/timing; a relay moves that visibility to an intermediary. **This is a deliberate trade — rule on it explicitly for kneescore (D-3).** Mitigations: prefer Topology A for the health path; if a relay is used, keep it first-party and minimise its logging.
- **Email backend degrades metadata, not confidentiality.** End-to-end ciphertext is safe and a spoofed sender can still only write encrypted-to-recipient garbage. But SMTP envelopes + hop TLS
  + mail logs widen metadata further than the SG/Send append path. Bridge/fallback only for health.
- **Blind relay integrity (drop/reorder/dup).** Covered by in-payload sequence numbers (§1.8); the relay cannot defeat a check it cannot read.
- **Shared-token blast radius (D-1).** A leaked shared parent token can flood (not read) the parent and forces re-provisioning on rotation. Per-child tokens make this surgical.

## 4. Phased build plan

| Phase | Scope | Surfaces | Exit |
|---|---|---|---|
| **P0 — server primitive** | `append`, `inbox` list/fetch, `mark-processed`, `purge`; manifest `append_anchors` + `enum_key_hash`; caps; status codes; idempotency | User Lambda | endpoints tested in-memory (no mocks), gates enforced, caps fire |
| **P1 — derivations** | `enum_key` HKDF (both langs) + cross-lang KAT; `append_token = H(pubkey)`; `H(...)` storage | sgit + vault web | KAT green; domain-sep + entropy tests green |
| **P2 — PKI encrypt-to-vault (P-157)** | X25519 keygen; private key as in-vault file; seal/open; payload framing; negative tests | sgit + vault web | Python-seals→JS-opens and vice-versa |
| **P3 — drain loop** | incremental cursor drain; seq-number check; mark-processed; owner purge housekeeping | sgit + vault web | round-trip: append → drain → decrypt → commit → mark-processed |
| **P4 — provisioning** | template-vault flow; parent pubkey + append token injection; reply-key bootstrap in first message | vault web (+ CLI) | a provisioned child sends and receives a reply unaided |
| **P5 — N-vault proof** | 2 then 5 vaults, bidirectional, append-gated, encrypted; both topologies | all | proof harness green (§5) |
| **P6 — relay + email bridge** | content-blind relay (Topology B); optional MTA bridge | new relay component | relay moves ciphertext with no private key; (opt.) MTA round-trip |

P0–P1 are independent and can run in parallel. P2 is the largest net-new piece (PKI does not exist today). Nothing ships to production from this pack — Explorer builds the primitive; Villager hardens for the rollout.

## 5. The N-vault proof harness (the decisive first milestone)

The first deliverable is **not** the 100-user rollout — it is proof that N vaults hold a bidirectional, encrypted, append-gated conversation. Concretely:

- **2-vault:** A and B each provisioned with the other's public key + append token. A→B and B→A each: encrypt-to-recipient, append, drain, decrypt, verify plaintext + sequence. Assert the appender cannot list/fetch/decrypt the recipient's inbox (append-blindness).
- **5-vault:** 4 children + 1 parent (Topology A), then re-run via a content-blind relay (Topology B) and assert the relay decrypts nothing. Verify ordering and gap-detection across interleaved senders.
- Run the whole harness against the **in-memory** stack (no mocks), then once against a deployed vault for the browser/CLI integration pass.

## 6. Acceptance criteria (from the brief, mapped to this design)

| # | Criterion | Verified by |
|---|---|---|
| 1 | SG/Send supports an append-only token | `POST /vault/append` gated by `append_anchors`; write-blind (P0) |
| 2 | Encrypt-on-write enforced (honest client) | seal-to-pubkey before append; server stores opaque bytes; negative tests (P2) |
| 3 | Both sides validated | append token gates write; PKI gates read; capability-tier tests (P0–P2) |
| 4 | Template-vault provisioning works | provisioned child holds parent pubkey + append token + own keypair (P4) |
| 5 | Bidirectional messaging works | child↔parent round-trips, reply-key bootstrapped in first message (P3–P4) |
| 6 | N-vault communication proven | 2-then-5 harness green, both topologies (P5) |
| 7 | kneescore rollout supported | a simple provisioning link; comms architecture only (Villager, post-proof) |
| 8 | Medical confidentiality boundary holds | comms architecture only; encrypt-on-write; no clinical specifics in this pack |

---

**Stack reminders (non-negotiable):** `Type_Safe` not Pydantic; `Storage_FS` not direct S3/boto3; `osbot-aws` for any AWS; tests use the real in-memory stack (no mocks, no patches); cross-language KAT for every derivation and the seal/open envelope; update the reality domain indexes (`send-api/`, `vault/`, `cli/`, `security/`) in the same commit that ships each phase.
