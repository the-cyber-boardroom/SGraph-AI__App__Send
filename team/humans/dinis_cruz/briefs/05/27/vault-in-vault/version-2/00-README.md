# Vault-in-Vault (ViV) — Architect Brief Pack

**Pack version** v0.28.7 · **Date** 2026-05-28 · **From** Architect (Explorer team)
**Status** PROPOSED — design converged with project lead; gated on one server-side CORS change (Appendix, §06).
**Supersedes** `v0.27.79__architect-briefing__viv-isolated-kernel-spawn.md` (the prior implementer briefing — two of its mechanisms are wrong; see §01 "What changed and why").

---

## Why this pack exists

ViV is, per the project lead, **probably the most important vault feature after `sgit`** — it makes a vault usable in real-world multi-party workflows (clinician↔patient, tenant↔project, agent↔data). The first implementation attempt showed the core risk: **ViV is very easy to make complex.** This pack is the simplest model we believe is correct, written to give the implementing Claude-code agents maximum context so they build the right thing once.

The governing discipline: **one primitive, applied fractally.** Accessing data *within* a vault and *across* vaults is the **same operation**. What differs is capability, what you get back, and who is asking — never the code path.

## The design in five sentences

1. The only construct is a **kernel** (trusted shell code bound to one vault, holding that vault's secrets) exposing a **capability port** to its **app** (the vault's `app.json` HTML in a `null`-origin iframe).
2. A **mount** — a child vault — *is just an app*: a `null`-origin iframe hosting another kernel, reached by the parent over a port; crossing a mount relays the request to the child kernel, which **recurses**.
3. **Trust is directional: parent→child only.** The parent holds the capability to the child and initiates; the child only responds and holds *no reference back* — no port, no `window`.
4. **Every kernel talks to the SG/API directly and identically** (bearer-token header); the only thing the top kernel has extra is an *origin*, used solely to read the URL hash + `localStorage` at bootstrap.
5. A **per-kernel broker** mediates and logs the inter-kernel edge (the capability invocations a parent makes on its children); **PKI** on every inter-kernel message gives confidentiality, integrity, and fail-safe misrouting.

## Read in this order

| # | File | What it gives you | Audience |
|---|------|-------------------|----------|
| **00** | `00-README.md` (this) | Pack map, the design in brief, decisions log | everyone |
| **01** | `01-architecture-review.md` | **The master design.** Normative. Every invariant, the two edges, the broker, PKI, credential model, what changed from the prior briefing | all implementers — read first |
| **02** | `02-architecture-diagrams.md` | ASCII topology, frame tree, the two-edge picture, spawn handshake, cross-vault read/write sequences, fractal nesting | all implementers |
| **03** | `03-ux-mockups.md` | Vault-in-vaults page, broker log + authorise prompts, tree-view expand, CLI/REPL, embedded-vault credential entry | UI/UX + frontend agents |
| **04** | `04-message-protocol-spec.md` | SecureChannel API, message envelope, the `sg.*` capability surface, broker interface, capability matrix | the agent building the channel + bridge |
| **05** | `05-implementation-plan.md` | Phasing with gating checks, **verified `file:line` targets in the shipped code**, verification/test matrix, breakage + migration | the agent doing the refactor |
| **06** | `06-appendix-cors-change.md` | The one server-side change that unblocks everything; concrete AWS/Starlette + CloudFront diff | Dinis / server + DevOps |

## Decisions log (resolved with project lead, 2026-05-27/28)

| # | Decision | Resolution |
|---|----------|------------|
| D1 | Broker placement | **Per-kernel.** Each kernel runs its own broker for the children *it* mounted. No global broker. It is the only place a child's key is known (the parent provisions it), which makes per-kernel both the *simple* and the *secure* choice. The vault-in-vaults page aggregates by querying each kernel's broker. |
| D2 | Trust direction | **Parent→child only (A→B, never B→A).** Capability flows down; a child has no reference to its parent. |
| D3 | Origin model | **Only the top vault has an origin** (to read hash + `localStorage`). Every nested vault is `null`-origin and parent-provisioned. |
| D4 | Server traffic | **Each kernel talks to SG/API directly and identically**, root and nested. The broker is NOT a network proxy and is NOT in the server path. |
| D5 | Server unblock | Set `allow_credentials = False` on the User-Lambda CORS (→ clean `Access-Control-Allow-Origin: *`) + ensure CloudFront forwards `Origin`. **Dinis to apply in AWS** (§06). |
| D6 | Key custody / monitoring | **Isolation is the default and production posture** (child generates its own non-extractable keypair from a one-use bootstrap key; parent never holds the child private key). **Monitoring mode** (parent can read child messages) is a **debug-build capability, off in prod, and must be visible** in the vault-in-vaults page when on. |
| D7 | Per-request credentials | Supported. Standing least-privilege (e.g. read-only) + momentary elevation (a higher token passed inline for one request, then gone — safe because the platform is no-storage). Authority = (parent grants capability) ∩ (child policy permits) — **two-sided**. |
| D8 | UI consumers | The vault-in-vaults page, tree-view-expand, and CLI/REPL are **consumers** of the primitive and sequence *after* the primitive proves out end-to-end. |

## The one open external dependency

Everything in this pack assumes a `null`-origin frame can reach the SG/API. Today it cannot — not for any fundamental reason, but because of a CORS misconfiguration (`allow_credentials=True` alongside `allow_origins=["*"]` makes Starlette reflect the request `Origin`, emitting `Access-Control-Allow-Origin: null`, which browsers reject). **§06 is the fix.** Until it lands in `dev`, agents can build and unit-test the client model but cannot prove the real nested-kernel-to-server path. This is the single gating prerequisite.

## Provenance

- Project-lead briefs: `Vault-In-Vault: The Kernel Model, Brokered Access, And PKI Between Vaults` (v0.27.64) and `SPEC-viv-nested-kernel-architecture.md`.
- Security finding driving the hardening: `SECURITY-same-origin-app-bypass.md`.
- Prior implementer briefing (superseded in part): `v0.27.79__architect-briefing__viv-isolated-kernel-spawn.md`.
- Code verified against `SGraph-AI__App__Send` **v0.28.7**, paths under `sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/`. All `file:line` in §05 re-pinned to HEAD on 2026-05-28.
