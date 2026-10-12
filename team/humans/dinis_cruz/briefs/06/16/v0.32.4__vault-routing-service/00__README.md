# 00 — README: SG/Relay — the vault routing service (transport-agnostic, content-blind)

**version** v0.32.4 · **date** 6 June 2026 · **from** Architect · **type** Implementation briefing pack (overview)

---

## What you are building

A **separate service** whose only job is **routing**. It moves opaque payloads between an
*external comms system* (email/SES, IMAP, SMS, a queue, an event bus) and a *vault inbox*,
in either direction. It never reads content, never derives a read key, never owns the
semantics of what it carries. It is a **content-blind relay** with **pluggable transport
adapters** on both sides.

The vault inbox shipped in v0.29.1 (`Service__Vault__Inbox.py`). It was deliberately built
to be oblivious: it enforces capability gates and append-blindness, and has no concept of a
"mailbox," "thread," or "message." **SG/Relay is the component that turns a dumb append/read
target into a real comms channel — without the vault ever knowing.** All the mailbox
semantics live in the relay and in the recipient's drain client, never in the vault.

This is the generalisation of **sg-workmail** (the 28 Feb FastAPI service brief), which was
the same shape hard-wired to one channel — "fundamentally: read inbox, send email." That
brief already foreshadowed this: it noted the pattern "extends beyond email — the same
approach works for WhatsApp and other messaging channels." SG/Relay pulls the channel out
into an adapter and makes the service's only responsibility the routing core.

> **Naming (D-0):** this pack uses **SG/Relay** / `sg-relay`. Open for the project lead to
> override (`sg-router`, `sg-comms`, …). The name does not affect any contract here.

## Why this shape (the architectural payoff)

1. **The vault stays a primitive.** SG/API exposes append + inbox-drain and nothing else.
   No comms logic ever enters the vault codebase. The blast radius of "email" is contained
   entirely in a service the vault has never heard of.
2. **One core, many channels.** Because the core only routes opaque bytes, the *same*
   service carries email today and SMS, webhooks, SQS, SNS, or EventBridge tomorrow — by
   writing an adapter, not by changing the core. "As long as there is a way to write/read
   the data" is literally the adapter port contract (`02`).
3. **The relay is already in the threat model.** The shipped crypto brief designed the
   `enum_key` tier *for this actor* — "hand a drainer/relay `enum_key` … without granting
   full vault read … exactly the budgeted-agent posture." The in-payload sequence numbers
   exist because "a relay cannot read content but can drop, reorder, or duplicate." We are
   not inventing a new trusted component; we are building the relay the model anticipated.
4. **The most-trusted-looking component holds the least secret.** Inbound routing needs no
   vault secret at all (see below). That inversion is the security result.

## The two-resource model (your point a + b, made exact)

The relay holds, per route, **two resources** — but the vault-side one is **direction-
dependent**, and the asymmetry is the whole security story:

| Direction | External resource (a) | Vault resource (b) | Is (b) a secret? |
|---|---|---|---|
| **Inbound** (external → vault) | comms-system credential (SES IAM / IMAP creds / SMS API key) | recipient's **append_token** = `H(recipient_public_key)` | **No** — publicly derivable from the pubkey |
| **Outbound** (vault → external) | same comms-system credential | source vault's **enum_key** = `HKDF(read_key, 'sg-vault-v1:inbox-enum-key')` | **Yes** — but it is *inbox-drain only*, never `read_key` |

So a **pure inbound relay holds no vault secret whatsoever**: it writes blind ciphertext to
an inbox addressed by a public value, and can do nothing else. A **bidirectional relay**
additionally holds an `enum_key` per source vault, which lets it *drain* those inboxes and
nothing more. A compromised relay can therefore: (inbound) write encrypted-to-recipient
garbage; (outbound) read the *inboxes it was handed keys for* — never the vault's real tree,
never any plaintext. This bound is precise and it is what AppSec signs off against (`03`).

## The four principles (do not violate)

1. **The relay never decrypts.** It routes ciphertext. Sealed-box encryption happens on the
   *sending client*, decryption on the *receiving client*. The relay sees opaque bytes on
   both sides. State it that way in code comments and docs — there is no server validation
   of encryption, and there cannot be.
2. **The relay is stateless w.r.t. content.** Its only durable state is routing config
   (which source maps to which destination) and a dedup cursor. It holds no message store;
   the system of record is the recipient vault's `mail/` tree, populated by the drain client,
   not by the relay.
3. **Routing is by non-secret address.** Inbound destination = `append_token = H(pubkey)`.
   Because the address is public and the relay cannot read, a standard email/SMTP server can
   stand in for the relay on the inbound leg — the proof that the transport has zero
   read-dependency.
4. **One adapter port, both sides.** Vault and external systems are *both* adapters behind
   the same `receive`/`send` port. The core does not special-case the vault. (See `02`.)

## EXISTS vs PROPOSED — be honest about size

| Piece | Status | Where |
|---|---|---|
| Vault inbox: `append` / `inbox` (list+fetch) / `mark-processed` / `purge`, four-tier gates | **EXISTS** | User Lambda `Service__Vault__Inbox.py`, `Routes__Vault__Inbox.py` (v0.29.1; 957 tests green; B-1/B-2 resolved) |
| `enum_key` derivation, `append_anchors` + `enum_key_hash` in the vault manifest | **EXISTS (server side)** | manifest is `manifest.json` in code (the v0.32.1 pack's `vault_pointer.json` was a doc error) |
| Storage_FS S3 / disk / memory backends incl. `folder__folders` on S3 | **EXISTS** | `Storage_FS__S3` (B-1 fix) |
| Per-vault X25519 keypair + encrypt-to-vault (sealed box) | **PROPOSED — no code** | P-155 / P-157, doc 422 |
| email-fs-lite payload schema (sessions / mailroom / `.eml` + sidecar) | **SPEC EXISTS, manual use** | `briefs/05/06/email-fs-lite-v0.6.md` |
| **SG/Relay service: routing core + adapter port** | **NET-NEW** | this pack, `01` / `02` |
| **Adapters: vault-inbox (reference), SES, IMAP, SMS, SQS, SNS** | **NET-NEW** | `02` |
| **Drain client → `mail/` tree population** | **NET-NEW** | `04` |
| **Vault-native inbox UX + chrome-extension bridge** | **NET-NEW** | `05` |

Routing works against the *shipped* inbox **today**, carrying opaque bytes. End-to-end
confidentiality across the bridge depends on the PROPOSED encrypt-on-write half (P-157). The
two can land in parallel: build the relay against opaque bytes now; the sealed-box layer
plugs into the *clients*, not the relay.

## Assumed scope for v1 (flip if wrong)

Per the 06/03 parent/child forcing function (one admin/comms vault ↔ ~100 → thousands of
user vaults, **bidirectional**), this pack designs for **bidirectional**, sequenced:

- **v1.0** — inbound adapter (external → vault), no vault secret. Prove on 2 vaults.
- **v1.1** — outbound/drain (vault → external), adds `enum_key`. Prove parent/child on 5.

If you meant **inbound-only** for v1, drop everything `enum_key`-related and §-outbound in
`03`/`04` and the pack still stands.

## Open decisions for the project lead

| # | Decision | Default if unspecified |
|---|---|---|
| D-0 | Service name | `sg-relay` |
| D-1 | First payload schema | email-fs-lite (RFC-2822-compatible `.eml`) |
| D-2 | Chrome extension role: vault-native inbox UX (3a) vs real-inbox bridge (3b) as first-class | Both documented; build 3a first, 3b rides on P-157 |
| D-3 | Adapter set for v1 | vault-inbox (reference) + SES inbound/outbound only |
| D-4 | Relay deployment | SG/Compute serverless (Lambda/Fargate), event/schedule-triggered |

## Reading order

- `01__architecture.md` — the WHY/HOW at architecture level: stateless blind relay,
  ports-and-adapters, the adapter port, the core routing engine, where it sits, dependency
  directions. **ASCII architecture diagrams.**
- `02__adapters.md` — the adapter port contract (`Type_Safe`), the vault-inbox reference
  adapter mapped to the shipped endpoints, then SES / IMAP / SMS / SQS / SNS as instances.
- `03__credentials-and-capability-model.md` — the two-resource decomposition by direction,
  blast radius, STS/Secrets Manager tie-in, threat model.
- `04__flows.md` — **ASCII flow + sequence diagrams**: inbound, outbound/drain, the
  parent/child topology, dedup/sequencing, retry/failure.
- `05__ux-mockups.md` — **ASCII UX wireframes**: vault-native inbox, compose, the
  chrome-extension bridge, provisioning.
- `06__deployment-and-acceptance.md` — SG/Compute deployment, triggers, `osbot-aws`, phased
  plan, acceptance criteria, test obligations, handoffs, risks.
