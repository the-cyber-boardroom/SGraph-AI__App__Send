# PROPOSED — Payments / Metering Platform (payments.sgraph.ai)

**Status:** PROPOSED — does not exist yet. No payments, metering, gateway, or ledger code
exists in any SGraph repo as of 2026-08-06.
**Last updated:** 2026-08-06 (payment-architecture research session)

---

## What is proposed

A separate new service/repo (working name `SGraph-AI__App__Payments`, served at
**payments.sgraph.ai**) implementing a metering + billing platform, defined by three human
arch briefs of 6 August 2026 (v0.33.56 — "token-gateway", "vault-architecture-for-payments",
"payments-not-a-billing-system") and reviewed by the Architect:

- **Token gateway in the request path** (metering forces in-line; distinct from the
  governance product's never-in-line posture). Gateway plane is a plain FastAPI app,
  dual-deployable: LWA-on-Lambda (AWS Lambda Web Adapter gives Python response streaming)
  or container/long-running, chosen on measured streaming economics; billing plane on the
  house `Serverless__Fast_API` (Mangum) Lambda pattern.
- **Chat-completions compatibility contract** — the gateway's inline LLM surface is
  OpenAI/OpenRouter wire-compatible (`POST /v1/chat/completions`, SSE streaming), so
  consumers (including the vault UI's `sg.llm.*` host via its `SGLlm` client) work with
  only a base-URL + key swap and cannot tell the gateway from a provider endpoint. The
  payments platform is separate from, and invisible to, the current vault features.
- **Pattern source:** `the-cyber-boardroom/MGraph-AI__Service__LLMs` (pre-vault LLM
  service) carries provider/routing/caching patterns to reuse; vault storage is expected
  to simplify its storage layer.
- **Append-and-settle ledger** — no reservations; unit-typed usage events (tokens first,
  vault storage size next) appended under unique keys; balance derived by fold + snapshot;
  negative balances with per-customer thresholds; credit events carry
  `origin ∈ {purchase, grant, adjustment}` from v1.
- **Four-vault customer structure** — customer master / activity / data / billing vaults,
  least privilege on the hot path (gateway holds an append token to the billing vault only);
  customer-held provenance-of-inference record.
- **Credential ≠ address** — credential records `{account, scope, budget, expiry, status}`
  resolving many credentials to one account (generalises the shipped access-token metering;
  converges with the vault UI's PROPOSED Phase-4 minted credentials).
- **Rail-agnostic credit intake** — Stripe first (webhook, idempotent), European rails and
  stablecoins as later options; float inversion (customers prepay, suppliers bill in
  arrears).

## Standing decisions affected (correction pending)

The Token Gateway brief verifies that **OpenRouter's terms prohibit resale**, which
invalidates two recorded decisions/mechanisms:

- Key decision 2026-07-27: "OpenRouter carries both inference and billing — the markup is
  the issued key's credit limit" (the first-product commercialisation kit mechanism).
- The 5 August payment-to-funded-key fulfilment workflow (provisioning half only; payment
  handling, dedupe, send-based delivery survive).

The Librarian daily run should annotate these in the reality index when the 6 August briefs
land in `team/humans/dinis_cruz/briefs/`.

## Where the analysis lives

- Deep-dive (what shipped primitives a payment platform can rely on):
  `team/roles/architect/reviews/08/06/v0.33.56__architect-review__vault-platform-deep-dive-for-payments.md`
- Review of the three briefs + build plan for the new repo:
  `team/roles/architect/reviews/08/06/v0.33.56__architect-review__payments-first-pass-briefs.md`

## Related proposed items

P-299 (OpenRouter billing broker — BLOCKED on legal; superseded in shape by this platform),
P-385/P-386/P-388 (`openrouter.md`), billing/credits prior art (`billing-credits.md`),
vault append encrypt-on-write PKI layer (`../../vault/index.md` PROPOSED), vault UI Phase-4
minted credentials (`../../ui/index.md` PROPOSED).
