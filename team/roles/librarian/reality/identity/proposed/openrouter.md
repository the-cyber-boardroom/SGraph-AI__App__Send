# Identity — Proposed: OpenRouter Integration

**Domain:** identity/proposed/ | **Last updated:** 2026-07-21 | **Maintained by:** Librarian (daily run)

All items below are PROPOSED — does not exist yet. Do not describe any of these as existing features.

Source documents: 06/01 brief; 06/20 openrouter-platform brief (v0.33.30). See index.md for full P-number inventory.

**Note:** Basic OpenRouter API key provisioning with a £5 credit cap (Section 20, doc 214) is listed
under `billing-credits.md`. Items here are distinct: the OAuth flow, native billing metering, and
assessment-specific capabilities not in the basic provisioning item.

---

## LLM API Billing Broker (06/01 brief)

All items below are PROPOSED — does not exist yet.

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-299 | OpenRouter Key/Credit/Billing Broker | Vault for secrets + auth (Google OAuth, PROPOSED) as foundation. New build: credit-purchase layer, payment-brokering layer (Stripe — do not build custom payment processing). BLOCKED on financial/legal requirements analysis. Payment brokering is regulated. | 06/01 brief |

---

## OpenRouter Platform Expansion (06/20 series, v0.33.30)

All items below are PROPOSED — does not exist yet.

OpenRouter raised a $113M Series B (CapitalG-led, ~$1.3B valuation). SGraph currently uses
only two features (model execution + key management) of a wide platform surface. The June 20
research brief maps the full feature set and recommends five adoption priority tiers.

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-385 | OpenRouter OAuth (PKCE) user key acquisition | Redirect user to OpenRouter via PKCE OAuth flow; return user-controlled API key to the app; SGraph never holds user credentials; the native answer to the key-acquisition journey; complements P-299 (billing broker); key storage decision (localStorage vs vault vs session) pending Architect sign-off | 06/20 openrouter-platform |
| P-386 | OpenRouter structured outputs + tool calling for assessment platform | Strict JSON-schema mode (`response_format.type=json_schema`) for assessment output, blast-radius map, risk-factorisation matrix, and compliance subset graph; normalised tool calling across models for vault agents; schema must be co-designed with P-391 (formal ontology); version-pin schema to avoid drift | 06/20 openrouter-platform |
| P-388 | OpenRouter ZDR + sovereign routing | Zero-data-retention routing and sovereign-region routing per request (`provider.data_collection=deny`); must be default-on for all assessment-class requests (not opt-in); resolves no-tracking claim (parked since day index); AppSec constraint: ZDR must take priority over cost-routing | 06/20 openrouter-platform |
