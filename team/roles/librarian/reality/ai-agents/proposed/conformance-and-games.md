# AI Agents — Proposed: Conformance Layer, Games, and Assessment Product

**Domain:** ai-agents/proposed/conformance-and-games | **Last updated:** 2026-09-15 | **Maintained by:** Librarian (daily run)
**Parent index:** [`index.md`](index.md)

All items below are PROPOSED. None have been code-verified in the SGraph Send app repository. Items marked "EXISTS in external vault" were built in an external vault ecosystem (pki.sgit.ai) and are not in this codebase. Do not describe any of these as shipped in the SGraph Send application.

This file covers items introduced by the 3–7 September 2026 brief series (docs 982–1012 in the master catalogue). See master index `team/roles/librarian/reviews/09/15/v0.33.66__master-index__briefs-03-07-sep-2026.md`.

---

## AIUC-1 Conformance Layer (09/04, v0.33.64)

EXISTS in external conformance vault fork at pki.sgit.ai. PROPOSED for any integration with the SGraph Send app. Sources: docs 989–992.

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-CONF-001 | AIUC-1 conformance layer with two-edge rule | `evidenced_by` (catalogue graph) and `attested_by` (layer graph) kept permanently apart by a test that goes red if a layer edge reaches a source observation; unevidenced is the default state; EXISTS in external vault fork | 09/04 dev-brief (conformance-layer) |
| P-CONF-002 | Conformance object schema v1 | Subject, control, release, as_of, state (evidenced/contradicted/unevidenced), level 0–5, observability field with cannot_observe_because, vacuous field; 17 new layer tests alongside 21 catalogue tests | 09/04 dev-brief (conformance-layer) |
| P-CONF-003 | Crosswalk resolution pipeline | 62 of 1,126 published crosswalks target EU AI Act; 1,064 point at frameworks with no published graph; paragraph-level resolution is manual; 8 target articles already amended by omnibus regulation | 09/04 dev-brief (conformance-layer) |
| P-CONF-004 | Export as citation artefact | Conformance layer output exportable as a structured citation document; format TBD; named in doc 991 as remaining work | 09/04 dev-brief (conformance-layer chat) |
| P-CONF-005 | Agent conformance measurement (D003 pattern) | One of five requirements evidenced at the observed tier; two requirements cannot be evidenced from inside the agent; one vacuous; grant measured per-tool not per-session; requires a party outside the agent for two requirements | 09/04 dev-brief (d003-measured) |

---

## Licence-To-Operate Vault App (09/03, v0.33.63)

PROPOSED — does not exist yet. Insurance primitives (policy object, verdict evaluator, grant/mandate schema) EXISTS in external vault at pki.sgit.ai. Sources: docs 982–983.

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-LTO-001 | Licence-to-operate vault app (two-store split) | Vault's JSON files hold terms (grants, mandates, policies, rate table, fixtures) version-controlled; browser local store holds run (events, requests, decisions, premium movements); app.json requests no write grant | 09/03 dev-brief (vault-agent) |
| P-LTO-002 | Derived licence display | Licence is computed from three inputs (mandate in force, policy covering it with paid premium, zone not outside), never stored; scope check precedes meter check; two check modes (inline cost declared / out-of-band meter read after) as first-class toggle | 09/03 dev-brief (vault-agent) |

---

## Self-Report Calibration (09/03, v0.33.63)

PROPOSED. Passive mode EXISTS (specified May 2026, six-step workflow). Source: doc 984.

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-OBS-001 | Self-report calibration instrument | Two producers of one status object (model self-report + harness measurement); gap between them is the product; the self-report was measured at ~4× low on tokens, consistently in one direction; baseline is the harness's to supply | 09/03 dev-brief (status-block) |

---

## Grant/Mandate Public Repository (09/04, v0.33.64)

PROPOSED — does not exist yet. Sources: docs 993–995.

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-REPO-001 | Grant/mandate public repository (probes not tables) | Unit of contribution is a probe (the command that establishes a grant claim), not a table row; challenge = rerun; grants measured per-tool and public; mandates elicited locally and never leave the clone | 09/04 dev-brief (grant-mandate-repo) |
| P-REPO-002 | SARIF/OSCAL output from conformance layer | One internal shape emitting SARIF (findings) and OSCAL (compliance plan); do not mint a third schema; adopt probe and finding vocabulary from published project (not minted here) | 09/04 research-brief; 09/05 research-brief |

---

## Assessment Product (09/05, v0.33.65)

PROPOSED — does not exist yet. Source: doc 1000.

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-ASMT-001 | Assessment product: one measurement, five artefacts | Five renderings of one measurement rather than five separate measurements; individual to corporate progression; each stage produces a finished artefact (no partial stages) | 09/05 research-brief (one-measurement) |
| P-ASMT-002 | OSCAL import path for existing registers | Import matters as much as export; a tool that cannot bring an existing register in forces a second register; hard requirement | 09/05 research-brief (one-measurement) |
| P-ASMT-003 | Mandate authoring step (no tool) | Writing down what an agent was expected to do is an authoring act; no tool can automate it; the UI must present this step clearly without attempting to automate it | 09/05 research-brief (one-measurement) |

---

## Game Series (09/04–09/05, v0.33.64–v0.33.65)

PROPOSED — no playable sessions yet. Arcade game prompt EXISTS as reference document (doc 1004). Sources: docs 996, 1001–1004.

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-GAME-001 | Guess-the-agent game (prediction gap) | Guessing inverts the burden; the prediction gap (between what the player predicted and what the tree found) is the product; NOT the guess itself | 09/04 dev-brief (guess-the-agent) |
| P-GAME-002 | Calibration game (proper scoring rule) | Score calibration rather than knowledge; level = number of moves from capability to consequence; ask "can it" beside "should it" to produce believed grant and intended mandate simultaneously; proper scoring rule fixes incentive without fixing content | 09/05 dev-brief (what-can-it-do) |
| P-GAME-003 | Prediction-gap game (reach as mesh node) | Reach is a node in a mesh, not a rung on a ladder; two question classes (identify vs. measure); only measure questions contribute to the finding; every answer carries a reliability (a wrong answer is the measurement) | 09/05 dev-brief (reach-is-a-node) |
| P-GAME-004 | Arcade game (40-item dataset, ceiling taxonomy) | Three inputs = three bins (let through / flag / shoot); dataset travels inside the prompt; impossible bin is the largest (16 of 40 items); six-reason ceiling taxonomy; three lazy strategies verified to lose | 09/05 dev-brief (arcade-mechanic); prompt in doc 1004 |

---

## Credentials and Keys Site (09/05, v0.33.65)

PROPOSED site. The underlying principle (host holds key, app never sees it) EXISTS in the vault browser. Sources: docs 998–999.

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-CRED-001 | Platforms/credentials site | Spine is four client-side key patterns (key in page with no bound → host holds key, app never sees it), not vendor list; one page per platform; commercial interest disclosed at top | 09/05 strategy-brief (platforms-shelf) |
| P-CRED-002 | Chrome sync as untrusted transport | 100KB budget across ~500 items; ciphertext only; origin binding is a usability control (prevents mistakes, not attacks); labelled as such | 09/05 dev-brief (chrome-sync) |

---

## New Sites and Playground (09/07, v0.33.66)

PROPOSED — does not exist yet. Sources: docs 1009–1011.

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-SITES-001 | Game primitives site | 12 primitives extracted from 9 existing game designs (not authored); 3 appear only as failure cases; strong threat with weak remedy produces denial (governs teaching games) | 09/07 strategy-brief (game-primitives) |
| P-SITES-002 | Providers pack site | Specification for the providers pack; ladder written March 2026; half the move is a write; sites are narrower than a vendor console, not better | 09/07 dev-brief (providers-pack) |
| P-SITES-003 | Playground as explorer artefact | A playground owes a failure ratio (record of what failed) and an exit (route for things to leave it); not open-ended | 09/07 strategy-brief (playground) |

---

## Vault Observability and Logging (09/07, v0.33.66)

PROPOSED pipeline. Append lane EXISTS. LETS pattern specified February 2026, never built. Sources: docs 1006–1007.

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-VTV-001 | Vault observability: append-lane events | Instrumented clients write events to a data vault over the vault-to-vault append channel; raw events in temporal folders; one flat put per event (append lane, not committed path) | 09/07 arch-brief (append-lane) |
| P-VTV-002 | LETS finality pipeline for vault analytics | Load-Extract-Transform-Save with finality model: time bucket is partial until period closes, then final (never recomputed); only calculate what is missing; time-sharded append tokens as rotation | 09/07 arch-brief (append-lane); Feb 2026 original spec |
| P-VTV-003 | Reply address in sealed first message | Sender seals its reply address inside the first message, encrypted to recipient public key; no directory needed; broadcast is the private option; blocks on client sealing layer | 09/07 dev-brief (reply-address) |
