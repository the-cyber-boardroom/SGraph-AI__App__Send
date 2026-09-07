# Identity — Proposed: Agent Enrolment Architecture

**Domain:** identity/proposed/agent-enrolment | **Last updated:** 2026-08-22 | **Maintained by:** Librarian (daily run)
**Parent index:** [`index.md`](index.md)

All items below are PROPOSED. None have been code-verified. Do not describe any of these as existing features.

Source briefs: docs 956–958, 960 (19 August 2026, v0.33.60)

---

## P-ENR-001 — Bootstrap Trap (strategy context)

**Status:** PROPOSED — strategic framing document; no code
**Source:** doc 956 — `v0.33.60__strategy-brief__bootstrap-trap-every-workaround-hands-over-a-larger-identity.md`

Agent identity is a loop, not a missing feature:

- Creating a keypair is trivial. Getting it *recognised* requires reaching a trusted authority.
- Every route to a trusted authority requires an identity the agent doesn't yet have.
- Every common workaround escapes the loop by handing over a credential broader than the identity being created.

| Workaround | What it grants |
|------------|---------------|
| Platform credential | Full platform-scoped access |
| Repository write access | Write to the project (and all its secrets) |
| Shared bot token | Reuse of an existing, registered identity |
| Vendor integration | Third-party account with its own broad scope |
| Cloud credential | IAM role or service account |
| Signing secret | Every future signature attributed to a shared identity |
| Bespoke enrolment server | Another bootstrap loop one layer up |

Real-world evidence documented in brief:
1. A coding assistant held a token scoped to every repository its developer had authorised (over-scoped ambient authority)
2. 5 August 2026 Black Hat disclosure: unprivileged account → CI pipeline secrets in three vendors' own repos under default configurations (ambient authority at platform-default-configuration level)

Core claim: "A system can use excellent cryptography and still have a weak bootstrap if the first instruction is to hand over a platform token."

Gradient: key possession → project recognition → delegated mandate. Each step adds strictly more authority than the last.

**Use as developer context documentation.** No code deliverable. Unblocks the conceptual foundation for P-ENR-002.

---

## P-ENR-002 — Agent Enrolment Architecture

**Status:** PROPOSED — architecture design; no code
**Source:** doc 957 — `v0.33.60__arch-brief__agent-enrolment-without-borrowed-authority-append-lane-is-the-narrow-door.md`

An agent that starts with only a keypair can acquire a project-recognised identity via the vault append lane — no broader credential required.

### Starting State

What the agent has: computation, randomness, its own newly generated private key, and nothing else.

What the agent does NOT have (and must not be given to bootstrap): repository credential, project token, CA key, vault key.

### Enrolment Request Schema

```json
{
  "type": "enrolment-request",
  "version": "1",
  "project": "<project identifier>",
  "subject": {
    "public_key": "<PEM or JWK>",
    "fingerprint": "<SHA-256 fingerprint>"
  },
  "requested_identity": "<human-readable label>",
  "requested_mandate": "<optional — what the agent wishes to be permitted to do>",
  "created_at": "<ISO 8601 UTC>",
  "nonce": "<UUID>",
  "proof_of_possession": "<signature over canonical serialisation of this object, minus this field, using the subject private key>"
}
```

Canonical serialisation: deterministic JSON (sorted keys, no whitespace, no trailing comma, UTF-8). The canonical form MUST be specified precisely — signature over ambiguous encoding is signature over nothing.

The proof of possession proves the submitter controls the private key. It does NOT prove the project should trust the agent. This distinction must be enforced in the trusted processor's policy gate.

### Delivery Channel

The agent posts the enrolment request to the project's append lane:
- Write-only: agent can post, cannot read the inbox, cannot see what else was submitted
- Account-less: only the append token is required (no access token, no prior identity)
- Blind acknowledgement: the sender learns only that the write succeeded (no id, no count returned)
- Already EXISTS server-side: `Service__Vault__Append.py`, 133 tests — this is the sixth write-only channel in the corpus

### Trusted Side Architecture

All components below are PROPOSED:

| Component | Description | Holds |
|-----------|-------------|-------|
| Enrolment inbox | An append lane configured for enrolment submissions | Only hashes of accepted senders; the inbox content |
| Trusted processor | Reads inbox; verifies signatures; applies policy gate | Read access to inbox; policy rules; does NOT hold CA key |
| Certificate authority | Issues identity certificates; signs with CA private key | CA private key (never sent to untrusted side) |
| Registry | Publishes recognised agent identities | Issued certificates; CA public key for verification |

Referee-and-player separation: the CA key and registry are on the trusted side. The agent can reach the inbox and nothing else.

### Identity vs. Mandate (Separation Principle)

Identity and mandate are separate signed statements that revoke independently:
- **Identity**: who this agent is (keypair + certificate from CA)
- **Mandate**: what this agent is permitted to do (separate signed delegation)

Compromise of a key does not leak what was permitted. Change in permissions does not require a new identity.

### Return Path (Architectural Open Item)

The append lane covers ingress only. How does the issued certificate get back to the agent?

Options (none selected):
- Separate read lane (agent must find its own lane address)
- Out-of-band delivery (manual; blocks automation)
- Registry polling (agent checks the registry when it has an address)

This is an architectural decision, not a code question. Must be resolved before Phase 5 can be built.

### Build Phases

| Phase | Deliverable | Prerequisite |
|-------|------------|-------------|
| Phase 0 | Decide what honest claim is at each milestone | Nothing |
| Phase 1 | Canonical enrolment object (deterministic JSON, nonce, proof of possession) | Canonical serialisation spec |
| Phase 2 | Enrolment client (agent generates keypair, builds and signs request, posts to lane) | Phase 1; append lane EXISTS |
| Phase 3 | Trusted processor (reads inbox, verifies signature, applies policy) | Phase 2; trusted infrastructure |
| Phase 4 | Certificate authority (issues certificate, signs with CA key) | Phase 3 |
| Phase 5 | Registry (publishes recognised identities; returns certificate to agent) | Phase 4; return path answer |
| Phase 6 | Mandates (issue/revoke permissions independently from identity) | Phase 5; P-MEB-001 |
| Phase 7 | First attributable action (third party verifies who caused what, after the fact) | Phase 6 |

**Effort estimate (Phases 1–5):** 4–6 weeks.

**Blockers before dev starts:**
1. Return path answer (architectural decision)
2. Canonical serialisation spec (what was signed must be reproducible)
3. Trust root declaration policy (who may be a root?)
4. Rename: "Service Twin" → "Mandate Broker" or "Mandate Execution Broker" (naming collision, see P-MEB-001)

---

## P-ENR-003 — PKI Registry (Missing Half of Shipped PKI)

**Status:** PROPOSED — architecture design; no code
**Source:** doc 960 — `v0.33.60__cross-team-brief__pki-site-review-mandate-is-the-gap-registry-is-the-missing-half.md`

The shipped PKI (`sgit keygen`, `sgit sign`, `sgit verify`) provides key generation and signature verification but has no revocation mechanism and no directory. A registry supplies both — it is the missing half of a shipped feature, not a new project.

### What a Registry Provides

| Gap in Shipped PKI | Registry Solution |
|--------------------|-----------------|
| No revocation | Signed revocation statements (append, not delete) |
| No directory | Addressable index of recognised public keys |
| No trust chain evaluation | Trust root declarations per registry |

### Registry Rules (Derived from 2019 Keyserver Failure)

The 2019 keyserver was destroyed because three properties combined: unlimited signatures per certificate, universal rights to append to anyone's certificate, and no way to distinguish legitimate from garbage. The registry must enforce, from the start:

1. **Owner-writes-own-record** — enforced by signature verification, not convention
2. **Revocation is a signed append statement** — not a deletion; the append lane pattern applies
3. **Record size is bounded** — prevents a replay of the unlimited-append failure mode

These rules must be built in, not added later. The keyserver failure demonstrates they cannot be retrofitted.

### Fractal Registry Trust Roots (Open Item)

For a single-organisation deployment: one root, declared at setup.
For federated deployment: explicit cross-registry trust declarations required.

Each registry must declare which roots it accepts. An unresolvable trust chain is a denial-of-service against verification. This policy must be stated before any registry is deployed.

### Relationship to Shipped PKI

| Shipped (EXISTS) | Proposed (P-ENR-003) |
|-----------------|---------------------|
| `sgit keygen` — generate RSA-OAEP 4096 + ECDSA P-256 keypair | Directory of registered public keys |
| `sgit sign` — sign a file with private key | Revocation mechanism (signed append) |
| `sgit verify` — verify a signature against a public key | Trust chain evaluation against declared roots |
| No directory, no revocation, no chain | All three |

**Effort estimate:** 2–3 weeks for registry MVP (after P-ENR-002 Phases 1–5).

---

## P-FIX-001 — Fixture Keypair Class

**Status:** PROPOSED — architecture design; no code
**Source:** doc 962 (20 August 2026, v0.33.61) — `v0.33.61__arch-brief__register-was-designed-in-june-published-keypairs-are-fixtures-not-identities.md`
**Last updated:** 2026-09-07 (Librarian daily run, 20 Aug batch)

A keypair whose private half is published provides no authentication and no confidentiality. These
objects need their own class — **fixture** — that is bounded structurally rather than by convention.

### What a Fixture Is

| Property | With private key held | With private key published |
|----------|-----------------------|---------------------------|
| Signature proves signer | Yes | No — anybody can produce it |
| Sealed message is confidential | Yes | No — anybody can open it |
| Revocation means something | Yes | No — there is no holder |
| Can be promoted to a real key | Yes | **No — permanently spent** |

### The Fixture Class Rules

1. A fixture is never reachable from the real trust graph
2. A fixture's append lane is a public inbox (key is public → anyone can decrypt)
3. `private_key_published: bool` is a required field in the register entry (no default; read before verifying signature)
4. A fixture cannot be revoked through the register's revocation mechanism (revocation is a signed append; the signing key is public)
5. A fixture is marked in the register itself, not only in prose beside it

### Fixture Material Layout

```
REGISTER (vault, public content)
  entry: fingerprint, public key, metadata, relationships
  entry: private_key_published = true   <- required field, first-class

  pointer to →

FIXTURE MATERIAL (separate, clearly named vault)
  private half, role definition, worked examples
```

### What a Fixture Is For

Exercising the choreography end-to-end: generate → publish → discover → fetch card → verify → seal → write lane → list → fetch → decrypt. Every step has a shipped command. No sequence has ever been run by an agent starting from nothing.

**Effort estimate:** 1–2 days to define class + publish one persona (librarian).

---

## P-GRANT-001 — Five-Field Mandate Declaration Format

**Status:** PROPOSED — vocabulary/schema design; no code
**Source:** doc 961 (20 August 2026, v0.33.61) — `v0.33.61__strategy-brief__grant-is-not-the-mandate-the-gap-between-them-is-the-exposure-nobody-accepted.md`
**Last updated:** 2026-09-07 (Librarian daily run, 20 Aug batch)

A mandate is a durable statement that can be checked by somebody who was not present. It requires five fields before it earns the word. A mandate with no interval is architecturally indistinguishable from a grant.

| Field | Why required |
|-------|-------------|
| **Issuer** | Somebody authorised this, and their key says so |
| **Subject** | The identity it binds, by fingerprint rather than name |
| **Scope** | What may be done, as an allow-list (deny-lists widen silently on provider releases) |
| **Interval** | When it expires — a mandate with no interval is a grant |
| **Revocation path** | How it is withdrawn before expiry, and where a checker looks |

**Key architectural rule:** Scope must be an allow-list, not a deny-list. A deny-list mandate
widens silently whenever the provider adds a capability, because the new capability is absent
from the list and is therefore not prohibited.

**Published home:** Agent cards (A2A v1.0) already declare scope of authority, spend caps,
and what requires human approval. The missing half is an issuer signature and an interval.

**Effort estimate:** Schema definition only; no new infrastructure beyond agent cards + register.

---

## P-FIX-002 — Agent Persona as Signed Agent Card

**Status:** PROPOSED — no code
**Source:** doc 962 (20 August 2026, v0.33.61) — `v0.33.61__arch-brief__register-was-designed-in-june-published-keypairs-are-fixtures-not-identities.md`
**Last updated:** 2026-09-07 (Librarian daily run, 20 Aug batch)

Personas (librarian, cartographer, and others) published as signed agent cards using the A2A v1.0
format, with a companion fixture object marking that the private half is published.

### Format

- **Agent card** (A2A v1.0, JSON manifest, well-known path): identity, capabilities, skills, endpoint, auth requirements, signed using JSON Web Signature
- **Companion fixture object**: keypair + role definition + worked examples; clearly marked as fixture; lives in separate vault (never the register itself)
- **Register entry**: `private_key_published = true`; pointer to companion fixture vault

### Discovery Flow

A fresh agent given the machine-readable index must be able to:
1. Discover → fetch agent card
2. Verify card signature (workflow identity; reveals repository + workflow)
3. Seal a message to the persona's public key
4. Write to the persona's append lane
5. List, fetch, decrypt

### Build Order

1. Fixture class rules written (P-FIX-001 complete)
2. Librarian persona first (least likely to be mistaken for operational)
3. Run full choreography once from scratch
4. Cartographer persona second, only after choreography runs clean

**Note:** The A2A canonical discovery path changed once in 2026. Pin to the current path and
add a test that fails if the path returns 404 before assuming stability.
