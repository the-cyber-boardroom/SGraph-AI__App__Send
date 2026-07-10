# Reality — Changelog

**Format:** `Date | Domain file(s) updated | One-line description`

This is a pointer log, not a content log. For full delta detail, see the master index for
that date in `team/roles/librarian/reviews/MM/DD/`.

---

## 2026-07-10

9 human briefs from `briefs/07/05/` processed across four threads: AWS configuration risk engine (3 briefs: Python engine + browser rating layer + ontology), agent-risk thesis and communication (2 strategy briefs), Risk Mandate experience loop (1 arch brief), evidence economy (3 strategy briefs). 31 new PROPOSED items. 0 new EXISTS items.

- `index.md` — Version v0.33.42 → v0.33.43; last updated 2026-07-06 → 2026-07-10; PROPOSED ~780+ → ~811+; total docs 810 → 820 (+10: 9 briefs + 1 day-index).

New EXISTS items: 0.
New PROPOSED items: ~31 (AWS engine 14, agent-risk thesis 5, experience loop 6, evidence economy 12).

Role reviews produced:
- `team/roles/architect/reviews/07/10/v0.33.43__architect-review__briefs-5-july-2026.md`
- `team/roles/dev/reviews/07/10/v0.33.43__dev-review__briefs-5-july-2026.md`

Master index (07/10): `team/roles/librarian/reviews/07/10/v0.33.43__master-index__briefs-5-july-2026.md`
Processed: 9 new human briefs + 1 day-index | New EXISTS items: 0 | New PROPOSED items: ~31 | Cumulative docs: 820

Key architectural flags: JSON schema undefined (blocks AWS engine build — immediate blocker); IAM action-to-effect table unspecified (blocks closure computation); deny/condition modelling undecided (blocks ontology code). AWS engine has 10 acceptance criteria and is the most implementable spec in the corpus to date; ready to build once blockers are resolved.

---

## 2026-07-05

4 human briefs from `briefs/07/02/` subdirectories missed by the 07/04 Librarian session, now processed. Subdirectories: `authorization-and-maturity-model/` (2 arch briefs), `root-cause-and-accountability/accountability-paradox` (1 strategy brief), `product-roadmap/` (roadmap md + visual assets). 34 new PROPOSED items across three themes: agent authorization/closure (6), RAMM entity model + agentic overlay (10), accountability paradox patterns (5), roadmap phases 1–3 items (13). 0 new EXISTS items.

- `index.md` — Version v0.33.40 → v0.33.41; last updated 2026-07-04 → 2026-07-05; PROPOSED ~710+ → ~744+; total docs 798 → 803 (+5 files: 4 text + 1 visual).

New EXISTS items: 0.
New PROPOSED items: ~34 (authorization closure, CapabilityCertificate, MomentOfAuthorization, RAMM entity classes 1–10, RAMM level predicates, Agentic RAMM overlay, RAMM OWASP submission, vault-loader library, Phase 1–3 roadmap items).

Master index (07/05): `team/roles/librarian/reviews/07/05/v0.33.41__master-index__briefs-2-july-2026-missed-subdirs.md`
Session: 4 missed briefs | New EXISTS items: 0 | New PROPOSED items: ~34 | Cumulative docs: 803

---

## 2026-07-04

13 human briefs processed (same batch as 07/03 — second Librarian session run on 4 July). ~46 new PROPOSED items (more detailed count than the 07/03 session). Five themes: ontology/data quality, partners/market, product definition/demo, risk acceptance psychology/appetite, and the question-engine/near-misses/"how long" trio.

- `index.md` — Version v0.33.39 → v0.33.40; last updated 2026-07-03 → 2026-07-04; PROPOSED 702+ → ~710+ (refined count); docs unchanged at 798.

New EXISTS items: 0.
New PROPOSED items: ~46 (refined from 07/03 session's 38 — same items, more granular breakdown).

Master index (07/04): `team/roles/librarian/reviews/07/04/v0.33.40__master-index__briefs-30-june-and-2-july-2026.md`
Second pass: 13 briefs | New EXISTS items: 0 | Refined PROPOSED count: ~46 | Cumulative docs: 798

---

## 2026-07-03

13 human briefs from 30 June 2026 (9 docs) and 02 July 2026 (3 docs + 1 day-index) processed. 38 new PROPOSED items across five themes: product/black-box (7), partners/library (6), risk acceptance/appetite (8), ontology/confidence/underwriting (8), near-misses/scenarios/question-engine (9). 0 new EXISTS items.

- `index.md` — Version v0.33.38 → v0.33.39; last updated 2026-07-02 → 2026-07-03; total docs 785 → 798 (+13 briefs); PROPOSED 664+ → 702+; test count unchanged at ~2015+.

New EXISTS items: 0 (no code delivered in this batch — all PROPOSED).
New PROPOSED items: 38 across five themes.

Role reviews produced:
- `team/roles/architect/reviews/07/03/v0.33.39__architect-review__briefs-30-june-02-july-2026.md`
- `team/roles/dev/reviews/07/03/v0.33.39__dev-review__briefs-30-june-02-july-2026.md`

Master index (07/03): `team/roles/librarian/reviews/07/03/v0.33.39__master-index__briefs-30-june-02-july-2026.md`
Processed: 13 new human briefs | New EXISTS items: 0 | New PROPOSED items: 38 | Cumulative docs: 798

Key architectural flags: confidence propagation operator UNSPECIFIED (blocks all confidence work); PKI attestation format needed for underwriting; accountability map schema needed for question engine. 2FA MVP (June 26) remains primary implementation priority.

---

## 2026-07-02

13 human briefs from 28 June 2026 processed (committed by Dinis Cruz on 30 June 22:51 BST, after the 06/30 session — missed by the 07/01 session which only checked the 07/01 folder). 25 new PROPOSED items across three themes.

- `index.md` — Version v0.33.37 → v0.33.38; last updated 2026-07-01 → 2026-07-02; total docs 772 → 785 (+13 briefs); PROPOSED 422 → 447+; test count unchanged at ~2015+ (already updated by 07/01 session).
- `qa/index.md` — Last updated 2026-07-01 → 2026-07-02; note added re duplicate static-mode entry removed (07/01 session already added both sgsend-static-mode and bridge-build tests).

New EXISTS items: 0 (code items already catalogued by 07/01 session).
New PROPOSED items: 25 (mini-sites 10, use-case program 6, ontology/NTF 9).

Master index (07/02): `team/roles/librarian/reviews/07/02/v0.33.38__master-index__briefs-28-june-2026.md`
Processed: 13 new human briefs | New EXISTS items: 0 | New PROPOSED items: 25 | Cumulative docs: 785

---

## 2026-07-01

No new human briefs (07/01 folder does not exist; briefs/06/28/ missed — 13 briefs committed by Dinis on 30 June 22:51 BST were not seen by this session). 2 EXISTS items from June 30 code changes. No backlog task this session (B-002 tools PROPOSED at 182 lines — under 300-line split threshold).

- `index.md` — Version v0.33.35 → v0.33.37; last updated 2026-06-30 → 2026-07-01; unit tests ~1994+ → ~2015+ (ViV loader 352+ → 373+: +12 sgsend-static-mode + 9 app-shell-bridge-build).
- `qa/index.md` — Last updated 2026-06-30 → 2026-07-01; added `test__sgsend_static_mode.js` (12 assertions) and `test__app_shell_bridge_build.js` (9 assertions) to ViV loader suite table; suite total 352+ → 373+; total ~1994+ → ~2015+.
- `vault/index.md` — Last updated corrected 2026-06-10 → 2026-07-01; section date corrected 2026-06-15 → 2026-06-30 (content was already added in commit `74d5444` on June 30 but date was wrong).

New EXISTS items: 2 (SGSend static-host mode + 12 tests; `_buildVfsBridgeScript` bare-call fix + 9-assertion regression guard).
New PROPOSED items: 0.

Master index (07/01): `team/roles/librarian/reviews/07/01/v0.33.37__master-index__no-new-briefs-code-30-june.md`
Processed: 0 new human briefs | New EXISTS items: 2 | New PROPOSED items: 0

---

## 2026-06-30

No new human briefs (06/27–06/30 all empty). 3 EXISTS items from June 29 code changes. Backlog task B-001 completed: vault/proposed/index.md (244 lines) split into six topic files.

- `index.md` — Version v0.33.34 → v0.33.35; last updated 2026-06-29 → 2026-06-30; unit tests ~1960+ → ~1994+ (Python 957→977; ViV loader 335+→352+ with sg-embed-helpers).
- `qa/index.md` — Last updated 2026-06-08 → 2026-06-30; Python count 957 → 977 (commit `66ce528`, osbot-fast-api 0.39.0 + FastAPI 0.138.1); added `test__sg_embed_helpers.js` (17 assertions) to ViV loader suite (now 352+); total headline ~1556+ → ~1994+.
- `vault/proposed/index.md` — Replaced 244-line content monolith with ~65-line TOC linking to 6 new topic files. No content changed — pure structural split.
- `vault/proposed/vault-architecture.md` — NEW: architecture overhaul, PKI modes 2–4, multi-remote, collaboration, simple-token future items (monolith-sourced).
- `vault/proposed/vault-platform.md` — NEW: vault hub, publishing layer, GitHub-as-vault-projection, manager vaults, credential manager, customer workflow primitives, vault-as-operational-substrate (P-302, P-307, P-311, P-313).
- `vault/proposed/vault-ux.md` — NEW: vault browser UI, browser VFS, SGit Web Components, demo capabilities (P-128–P-132), testing framework (P-133–P-137).
- `vault/proposed/vault-sub-vaults.md` — NEW: sub-vaults & external resources convention (P-159–P-165, P-174); notes that P-159–P-163 and P-174 now EXISTS in ui/index.md.
- `vault/proposed/vault-previews.md` — NEW: public vault previews (P-166–P-177 — largely EXISTS in ui/index.md), vault discovery & public keys (P-153–P-158), compliance artefacts (P-281–P-282, P-284).
- `vault/proposed/vault-content.md` — NEW: vault chat / Talk to the vault (P-248–P-249).

New EXISTS items: 3 (sg-embed-helpers module + 17 tests, AUTHORING.md guide, Python 977).
New PROPOSED items: 0.

Master index (06/30): `team/roles/librarian/reviews/06/30/v0.33.35__master-index__no-new-briefs-code-29-june.md`
Processed: 0 new human briefs | New EXISTS items: 3 | New PROPOSED items: 0 | Structural: B-001 vault/proposed split

---

## 2026-06-29

Brief-processing session: 18 human brief files from 06/24 (addendum) and 06/26 (new batch) processed. Added in commit `8f6705e7` on 2026-06-28 but not seen by the June 28 Librarian session. 12 new PROPOSED items (P-411 through P-422). 0 new EXISTS items. New version: v0.33.34.

- `reality/index.md` — Version v0.33.33 → v0.33.34; last updated 2026-06-25 → 2026-06-29; PROPOSED count 627+ → 639+; total docs 754 → 772.
- `ai-agents/proposed/risk-mandate.md` — Last updated 2026-06-28 → 2026-06-29; added June 24-26 section: P-411 (Calendly review template), P-413 (risk register as graph), P-414 (five whys as domain translator), P-415 (digital twins integration layer), P-416 (2FA demo twins as actors), P-417 (twin of anything), P-418 (world model simulation), P-419 (2FA ontology 22 nodes 35 edges), P-420 (directed edges + query engine), P-421 (paths as language + ontology of ontologies), P-422 (2FA end-to-end MVP).
- `ai-agents/proposed/index.md` — Last updated 2026-06-28 → 2026-06-29; topic file table updated to include June 24-26 items; P-number lookup table extended (P-411–P-422).
- `security/proposed/index.md` — Last updated 2026-05-24 → 2026-06-29; added healthcare data-protection section: P-412 (healthcare data-protection pattern — 10 principles, medical analogies, 50-min presentation).

Role reviews produced:
- `team/roles/architect/reviews/06/29/v0.33.34__architect-review__briefs-24-26-june-2026.md`
- `team/roles/dev/reviews/06/29/v0.33.34__dev-review__briefs-24-26-june-2026.md`

Master index (06/29): `team/roles/librarian/reviews/06/29/v0.33.34__master-index__briefs-24-26-june-2026.md`
Processed: 18 new human briefs | New EXISTS items: 0 | New PROPOSED items: 12 (P-411–P-422)

Key strategic context: June 26 series completes the Risk Mandate.ai architecture spec — formal 22-node/35-edge ontology, directed-edge query engine, digital twins integration layer, and a 2FA end-to-end MVP plan with 7-layer architecture, 6-phase build order, and 10 acceptance criteria. Machine-readable 2FA mappings JSON (doc 771) is immediately usable as test fixture.

---

## 2026-06-28

No new human briefs (06/25–06/28 all empty). Backlog task B-003 completed: ai-agents/proposed/index.md (408 lines) split into five topic files.

- `ai-agents/proposed/index.md` — Replaced 408-line content monolith with ~65-line table of contents pointing to five topic files. No content changed — pure structural split.
- `ai-agents/proposed/llm-components.md` — NEW: sg-llm family, agentic tool execution, multi-agent, developer experience, observable LLM orchestration tool, unified observability REPL, Bedrock CLI, observability pipeline sources, AgentCore resell products, Nova + AgentCore POC.
- `ai-agents/proposed/agent-communication.md` — NEW: MCP gaps, sgit CLI extensions, communication vault pattern, QA stack on SG/Compute, AppSec mini-tools (P-159–P-164), vault comms demo + PKI (P-312, P-315, P-316).
- `ai-agents/proposed/workflows.md` — NEW: Scheduled and autonomous tasks, accountant demo (P-147–P-152), archiver-cataloguer pattern (P-238–P-247), agentic incident-response service (P-247).
- `ai-agents/proposed/skills-economy.md` — NEW: Partner integrations (P-288–P-298), skills creator economy (P-294–P-305), skills deepened June 4 (P-317–P-321), NHI 2.0 ai-agents cross-domain items (P-325, P-328, P-332).
- `ai-agents/proposed/risk-mandate.md` — NEW: Agent blast-radius service (P-353–P-357), assessment template (P-376–P-379), Odysseus vault + formal ontology (P-387–P-393), authorization ontology + delegation (P-394–P-397), mandate architecture (P-399–P-403), Wardley maps + risk acceptance services + personal scenario (P-404–P-409).

Master index (06/28): `team/roles/librarian/reviews/06/28/v0.33.33__master-index__no-new-briefs-backlog-b003-28-june.md`
Processed: 0 new human briefs | New EXISTS items: 0 | New PROPOSED items: 0 | Structural: B-003 ai-agents proposed split

---

## 2026-06-19

Brief-processing session: 18 human brief files from 06/18 processed (1 day-index + 17 in
`agentic-permissions/` subfolder). All are PROPOSED — no new code shipped on June 18.
Version v0.33.28 (current). 17 new PROPOSED items registered (P-353 to P-369).

The June 18 series is a single sustained 18-brief series on agent authorisation blast radius,
the PBOM (permissions bill of materials), and the company/commercial strategy built around
the vault technology. No code deliverables. Strongest single-thread investor narrative in corpus.

- `index.md` — Version v0.33.26 → v0.33.28; last updated 2026-06-18 → 2026-06-19; docs 685 → 703; PROPOSED 570+ → 587+ (P-353 to P-369).
- `ai-agents/proposed/index.md` — Added June 18 section: P-353 (blast-radius mapping service phase 1), P-354 (multi-party risk acceptance flow), P-355 (enterprise semantic graph for permissions), P-356 (proactive evidence database), P-357 (paid agent-intel feed).
- `security/proposed/index.md` — Added June 18 section: P-358 (agent blast-radius map artefact), P-359 (PBOM), P-360 (PBOM-SBOM compatibility), P-361 (skills-as-code permission declaration), P-362 (just-in-time granular grants beyond OAuth), P-363 (risk acceptance as underwriting), P-364 (T&C blast-radius framing).
- `alchemist/proposed/index.md` — Added June 18 section: P-365 (Agent Mandate naming), P-366 (open-source-everything strategy), P-367 (commercial model), P-368 (vault strategy three roles), P-369 (customised-analysis-as-a-service).

Master index (06/19): `team/roles/librarian/reviews/06/19/v0.33.28__master-index__briefs-18-june-2026.md`
Processed: 18 new human briefs | New EXISTS items: 0 | New PROPOSED items: 17 (P-353–P-369)

Key open items: OQ-agent-mandate-name-1 (name needed before any investor materials),
OQ-first-build-priority-1 (engineering focus for next session), OQ-pbom-scan-1 (standards
scan blocks PBOM schema design).

---

## 2026-06-16

Brief-recovery session: 20 human brief files from 06/11 and 06/13 processed for the first time
(missed by sessions 06/13 through 06/15 which incorrectly reported those folders as non-existent).
Version v0.33.26 unchanged. No new EXISTS items (code verification outstanding for vault-creates-vault
and access-key-embedded). 23+ new PROPOSED items registered.

- `index.md` — Document count 649 → 669 (+20 briefs); PROPOSED count 499+ → 522+; last updated 2026-06-14 → 2026-06-16.
- No domain `index.md` files updated (no new code-verified EXISTS items this session).
- PROPOSED items distributed across: `ai-agents/`, `vault/`, `ui/`, `send-api/`, `tools/`, `website/`, `alchemist/` (not yet written to domain files; catalogued in master index).

Master index (06/16): `team/roles/librarian/reviews/06/16/v0.33.26__master-index__briefs-11-13-june-2026.md`
Processed: 20 new human briefs | New EXISTS items: 0 | New PROPOSED items: 23+

Key open items: OQ-vault-creates-vault-1 (must be code-verified), OQ-audio-transcribe-1,
OQ-access-key-embedded-1.

---

## 2026-06-14

Code-change-only session: 0 new human briefs; 1 substantive commit since the 06/13 librarian session (`c32bfed6`: sg-print WYSIWYG margin parity fix). v0.33.25 → v0.33.26.

- `ui/index.md` — Added `sg-print.js` v1.0.3 entry in the v0.3.1 section: `PAGE_MARGIN` single-constant fix, WYSIWYG screen-preview ↔ print parity, open follow-up for wide-`<pre>` overflow; last updated 06/12 → 06/14.
- `index.md` — Version v0.33.25 → v0.33.26; last updated 2026-06-13 → 2026-06-14.

Master index (06/14): `team/roles/librarian/reviews/06/14/v0.33.26__master-index__code-changes-13-june.md`
Processed: 0 new human briefs | New EXISTS items: 1 (sg-print v1.0.3) | New PROPOSED items: 0

---

## 2026-06-13

Code-change-only session: 0 new human briefs; 3 substantive commits since the 06/12 librarian session (2 missed from June 11, 1 new from June 12). v0.33.23 → v0.33.25.

- `ui/index.md` — Added: EFBIG guard for `sg.vfs.write` (b3987ba3); `sg.app.writable` parity fix + `writableCrypto`/`writableAuth` debug state (0c34e1c9); null-origin localStorage crash fix + `VaultLoaderStorage.available()` (b3987ba3); send-browse v0.3.3 IFD overlay — Copy contents button (0c34e1c9); P-269 presigned-PUT write path (PROPOSED); open item for send-browse _write encoder 8192 chunk bug.
- `index.md` — Version v0.33.23 → v0.33.25; last updated 2026-06-12 → 2026-06-13; PROPOSED 496+ → 499+.

Master index (06/13): `team/roles/librarian/reviews/06/13/v0.33.25__master-index__code-changes-11-12-june.md`
Processed: 0 new human briefs | New EXISTS items: 6 | New PROPOSED items: 3 (P-269 + 2 open items)

---

## 2026-06-12

Code-change-only session: 0 new human briefs; 1 substantive commit since the 06/11 librarian session (VFS write bridge fix + privileges chip colour, v0.33.22 → v0.33.23).

- `ui/index.md` — Added: VFS write bridge base64 chunking fix (chunk 8192→8190, EBADENC diagnostic); privileges chip colour update (default slate, destructive grants amber; popover rows amber not red); last updated 05/31 → 06/12
- `index.md` — Version v0.33.22 → v0.33.23; last updated 2026-06-11 → 2026-06-12

Master index (06/12): `team/roles/librarian/reviews/06/12/v0.33.23__master-index__no-new-briefs-code-11-june.md`
Processed: 0 new human briefs | New EXISTS items: 2 (VFS write fix + privileges chip colour) | New PROPOSED items: 0

---

## 2026-06-11

Brief-processing session: 22 new human briefs (June 8: 7 docs; June 10: 13 docs + 1 artifact); plus Librarian memo and 10 Issues-FS import documents.

- `index.md` — Version v0.33.16 → v0.33.22; last updated 06/10 → 06/11; docs 617 → 649; PROPOSED 469+ → 496+.
- **No domain-level reality updates** — all features in the June 8–10 briefs are PROPOSED and do not yet appear in domain index files (they are logged in the master index).
- **Library additions** — `library/concepts/` created (3 foundational Issues-FS docs imported); `library/guides/agentic-setup/` (3 role coordination docs imported); `team/roles/cartographer/REFERENCE__from-issues-fs.md`, `team/roles/historian/REFERENCE__from-issues-fs.md`, `team/roles/journalist/REFERENCE__from-issues-fs.md` (role reference docs imported).

Master index (06/11): `team/roles/librarian/reviews/06/11/v0.33.22__master-index__briefs-08-10-june-2026.md`
Processed: 22 new human briefs (June 8–10) + 10 Issues-FS imports | New EXISTS items: 0 | New PROPOSED items: 27

---

## 2026-06-09

Brief-processing session: 20 new human briefs (06/05: 11 docs; 06/07: 9 docs); plus 6 new code commits (vault-inbox C1/C2/C3 foundation + CLI interop fix + vault refresh fix + rollback fix).

- `vault/index.md` — Added EXISTS: vault inbox foundation (C1 sg-inbox.js transport client, C2 sg-inbox-checker.js check-on-events, C3 host-events + sg.on/off + inbox perms); last updated 04/28 → 06/09. Added PROPOSED: vault inbox full spec (CLI + UI section + app methods), deterministic value indexes (value-derived file naming), PKI public key registry (two-level trust, graph DB, federation), large-file chunked vault upload (chunk+hash+resume), central key management (OpenRouter distribution to child vaults).
- `index.md` — Version v0.33.5 → v0.33.14; last updated 06/08 → 06/09; unit tests ~1600+ → ~1950+; docs 594 → 614; PROPOSED 455+ → 469+.

Master index (06/09): `team/roles/librarian/reviews/06/09/v0.33.14__master-index__briefs-05-07-june-2026.md`
Processed: 20 new human briefs (06/05–07/07) | New EXISTS items: 3 (inbox C1/C2/C3 foundation) | New PROPOSED items: 14

---

## 2026-06-08

Code-change-only session: 0 new briefs; 9 substantive commits since the 06/07 librarian session (plus CI version bumps → v0.33.5).

- `ui/index.md` — Added: vault-embed postMessage handshake (embed-protocol.js, _initEmbed, _initWithKey embed gating, deepLink memory path, _setCachedAccessKey gate); sg-vault-object-store.js typeof-caches sandbox fix + bundle rebuild; favicon.ico + `<link rel="icon">` tags in 5 HTML files; last updated 05/31 → 06/08
- `qa/index.md` — Added: test__embed_protocol.js (37 assertions, run-all.sh suite → ~113); browser integration extended to 8 tests (test__embed_handshake.py: 4 tests — handshake + deep-link + sandboxed iframe + storage isolation); last updated 06/05 → 06/08
- `security/index.md` — Added: Vault-Embed Security Model section (key in memory, one-shot listener, sibling rejection, origin validation, unresolved consent gap); sg-vault-object-store.js sandbox safety note; last updated 06/05 → 06/08
- `index.md` — Version v0.32.4 → v0.33.5; last updated 06/06 → 06/08; unit tests ~1556+ → ~1600+; docs 594 (unchanged); PROPOSED 455+ (unchanged)

Master index (06/08): `team/roles/librarian/reviews/06/08/v0.33.5__master-index__code-changes-07-june-2026.md`
Processed: 0 new human briefs | New EXISTS items: 7 (embed-protocol module, 3 embed browser tests, sandboxed regression test, favicon.ico, caches guard fix) | New PROPOSED items: 0

---

## 2026-06-06

Brief-processing session: 27 new human briefs from 06/04 (1 day-index + 8 skills + 2 research + 16 NHI 2.0).

- `index.md` — Version v0.32.3 → v0.32.4; last updated 06/05 → 06/06; docs 567 → 594; PROPOSED 433+ → 455+ (P-317–P-338)
- `identity/proposed/index.md` — NHI 2.0 platform section added: P-322 through P-336 (15 new items)
- `ai-agents/proposed/index.md` — Skills economy section added (P-317–P-321); NHI 2.0 cross-domain items added (P-325, P-328, P-332)

Master index (06/06): `team/roles/librarian/reviews/06/06/v0.32.4__master-index__briefs-04-june-2026.md`
Processed: 27 new human briefs | New EXISTS items: 0 | New PROPOSED items: 22 (P-317–P-338)

---

## 2026-06-05

Code-change-only session: 0 new briefs; 4 commits since the 06/04 session (`57edba8`, `e365c60`, `2539220`, `33dc551`).

- `security/index.md` — Added "Vault Inbox Hardening" section: B-1 S3 silent-empty fix; B-2 path traversal closed via `Safe_Str__Vault__Append_Token` + `Safe_Str__Vault__Inbox__File_Id`; I-1/2/3 perf/DoS mitigations; batch cap 100 file_ids (commit `e365c60`)
- `send-api/index.md` — Vault inbox section updated: hardening note, Safe_Str schemas, revised test count
- `qa/index.md` — Test count updated to 957 Python (confirmed via commit `e365c60`); total ~1556+ with JS suites
- `index.md` — Version v0.32.2 → v0.32.3; last updated 06/04 → 06/05; unit tests ~1358+ → ~1556+

Master index (06/05): `team/roles/librarian/reviews/06/05/v0.32.3__master-index__no-new-briefs-05-june.md`
Processed: 0 new human briefs | New EXISTS items: Safe_Str vault inbox primitives, S3 folder__folders fix | New PROPOSED items: 0

---

## 2026-06-04 *(retroactive — omitted from prior session)*

- `index.md` — Version v0.31.18 → v0.32.2; date 06/03 → 06/04; docs 546 → 567; PROPOSED 416+ → 433+ (P-300–P-316); vault inbox EXISTS (+6 endpoints, +101 tests); unit tests ~1257+ → ~1358+
- `send-api/index.md` — Vault inbox endpoints section added (6 endpoints, 101 tests, commit `9d727b5`)
- `ai-agents/proposed/index.md` — P-300, P-301, P-303, P-304, P-305, P-312, P-315, P-316 added
- `vault/proposed/index.md` — P-302, P-307, P-311, P-313 added
- `identity/proposed/index.md` — P-314 added
- `alchemist/index.md` — P-309, P-310 added
- `website/proposed/index.md` — P-306, P-308 added

Master index (06/04): `team/roles/librarian/reviews/06/04/v0.32.2__master-index__briefs-02-to-03-june.md`
Processed: 21 new human briefs (06/02 × 12, 06/03 × 9) | New EXISTS items: 6 vault inbox endpoints | New PROPOSED items: 17 (P-300–P-316)

---

## 2026-06-03

Second librarian session on the same briefs (first was 06/02, ref `team/roles/librarian/reviews/06/02/`). This session produced more detailed architect/dev reviews and a debrief; the reality document updates were carried forward from the 06/02 session (canonical P-numbers). Index date updated to 06/03.

- `index.md` — Date updated 06/02 → 06/03 (second session); all other stats from 06/02 session retained
- `vault/proposed/index.md` — Added P-281 (vault-per-standard pipeline), P-282 (public preview + embedded RO key), P-284 (vulnerability debriefs as vault artefacts); already carried from 06/02 session

Master index (06/03 session): `team/roles/librarian/reviews/06/03/v0.31.18__master-index__briefs-30-may-to-01-june.md`
Architect review: `team/roles/architect/reviews/06/03/v0.31.18__architect-review__briefs-30-may-to-01-june.md`
Dev review: `team/roles/dev/reviews/06/03/v0.31.18__dev-review__briefs-30-may-to-01-june.md`

## 2026-06-02

- `index.md` — Updated: version v0.31.15 → v0.31.18; date 06/01 → 06/02; PROPOSED 397+ → 416+ (P-281–P-299 canonical); total docs 524 → 546 (22 new human briefs from 05/30, 05/31, 06/01)
- `vault/proposed/index.md` — Added P-281 (vault-per-standard pipeline), P-282 (public preview + embedded RO key), P-284 (vulnerability debriefs); last updated 05/25 → 06/02
- `ai-agents/proposed/index.md` — Added P-283 (library as shop front + FS email), P-286 (per-page semantic graphs), P-288–P-299 (Netlify, Daytona, Convex, Pi, HeyGen, Tavon, skills graph, base vaults, creator economy, marketplace, comparison, OpenRouter broker); last updated 05/21 → 06/02
- `website/proposed/index.md` — Added P-283 (library as shop front), P-285 (agent-controlled website + vault CI), P-286 (per-page semantic graphs), P-287 (industry use-case pages); last updated 05/17 → 06/02
- `identity/proposed/index.md` — Added P-299 (OpenRouter key/credit/billing broker service); last updated (previous) → 06/02

Master index (06/02 session): `team/roles/librarian/reviews/06/02/v0.31.18__master-index__briefs-30-31-may-01-june.md`
Processed: 22 new human briefs (05/30 ×5, 05/31 ×4, 06/01 ×13) | New PROPOSED: 19 (P-281–P-299 canonical)

---

## 2026-06-01

- `index.md` — Updated: version v0.31.12 → v0.31.15; date 05/31 → 06/01; unit tests ~1240+ → ~1257+; PROPOSED 395+ → 397+ (P-279–P-280)
- `ui/index.md` — Added: deep-link HTML fix (CSS/JS loading in `/en-gb/app/#deep-link`); AppNavHelpers test count 35→47; last updated 05/31 → 06/01
- `qa/index.md` — Added: browser integration harness (5 pytest functions, 4 files, Python+Playwright+sgit-ai); test count ~1139+ → ~1257+; last updated 05/30 → 06/01
- `security/index.md` — Added: SEC-VIV-002 (popup capability over-grant to inner vaults — OPEN, Medium); last updated 05/29 → 06/01
- `infra/index.md` — Added: `_test-ui-vault.yml` reusable vault UI test workflow (4-job pipeline); `test:vault-browser-integration` npm script; last updated 05/13 → 06/01
- `ui/proposed/index.md` — Added P-279 (kernel path unification) + P-280 (popup gate fix); last updated 05/31 → 06/01

Master index: `team/roles/librarian/reviews/06/01/v0.31.15__master-index__no-new-briefs-code-31-may.md`
Processed: 0 new human briefs (no June briefs yet — first day of month)
New EXISTS items: 7 (deep-link fix, AppNavHelpers 35→47, browser integration harness ×4 files, CI reusable workflow) | New PROPOSED items: 2 (P-279, P-280)

---

## 2026-05-29

- `index.md` — Updated: version v0.28.7 → v0.31.3; date 05/28 → 05/29; doc count 493 → 504; JS assertions +152; API endpoints +1 (Routes__Info__SGraph); PROPOSED 366+ → 379+
- `ui/index.md` — Added: ViV kernel modules (SecureChannel, KernelMounts, KernelBroker, KernelAppHandlers, KernelBootstrap, sg-app-stub, kernel-shell-bundle); P-250 through P-262; 10 bugs fixed notation
- `security/index.md` — Added: Vault App Trust Model section (SEC-VIV-001 same-origin bypass; trust assumption caveat; CORS fix); last updated 04/28 → 05/29
- `qa/index.md` — Updated: test count ~760+ → ~912+; added ViV loader suite table (152 jsdom-free assertions across 10 test files); last updated 04/28 → 05/29

Master index: `team/roles/librarian/reviews/05/29/v0.31.3__master-index__briefs-viv-28-29-may.md`
Processed: 11 new human briefs (briefs/05/vault-in-vault/version-1 × 3 + version-2 × 8)
New EXISTS items: 14 (ViV kernel modules, CORS fix, Routes__Info, Container, 152 JS tests) | New PROPOSED items: 13 (P-250–P-262)

---

## 2026-05-28

- `index.md` — Updated: version v0.27.79 → v0.28.7; date 05/26 → 05/28; doc count 488 → 493; PROPOSED 365+ → 366+; P-231 resolved to EXISTS
- `ui/index.md` — Added: Public Vault Previews (full set); Sub-Vaults Phases 1–3; App-Mode Permissions Phases 1–4B; vault header pill; sg.history.* API
- `vault/index.md` — Added: P-231 resolved EXISTS (Web UI); P-248 (sub-vaults CLI) PROPOSED

Master index: `team/roles/librarian/reviews/05/28/v0.28.7__master-index__briefs-25-may-and-code-25-27-may.md`
Processed: 5 new human briefs (briefs/05/25/)
New EXISTS items: 6 | New PROPOSED items: 2 (P-248, P-249)

---

## 2026-05-26

- `index.md` — Updated: version v0.27.61 → v0.27.79; date 05/25 → 05/26; doc count 463 → 488; PROPOSED count 341+ → 365+
- `identity/index.md` — Added: P-223 to P-226, P-230, P-233 (SG/Send tiered business model, identity-creation rule, OAuth + user-dedicated mode)
- `vault/index.md` — Added: P-227 (vault-per-user storage substrate), P-231 (vaults within vaults)
- `security/proposed/index.md` — Added: SG/Sentinel batch-2 section (P-234 to P-247): test-driving, cost attribution, UX designer role, control-flow graphs, passive mode, SGS portable spec, development workflow, surrogate dependencies, rule packs, MVA + feature flags, vault-aware logging, agent governance, interoperability, commercial model
- `ai-agents/index.md` — Added: P-240 (SG/Sentinel in development workflow), P-245 (agent governance as coherent capability)

Master index: `team/roles/librarian/reviews/05/26/v0.27.79__master-index__briefs-24-may.md`
Processed: 25 new human briefs (briefs/05/24/ — sg-send-thread + sg-sentinel-batch2 + day-wrap)
New EXISTS items: 1 (Wardley map render toolchain via Mermaid v11.14.0 + Playwright Chromium — verified) | New PROPOSED items: 24 (P-223 to P-246; note P-247 = commercial model)

---

## 2026-05-25

- `index.md` — Updated: version v0.27.60 → v0.27.61; date 05/23 → 05/25
- `ui/index.md` — Added: app.json resource injection into vault HTML preview (commit `09288b20`); E2E test alignment note for /en-gb/app routing

Master index: `team/roles/librarian/reviews/05/25/v0.27.61__master-index__code-changes-24-25-may.md`
Processed: 0 new human briefs; 1 code commit scanned (vault UI app.json resource injection + 2 E2E test files aligned)
New EXISTS items: 1 | New PROPOSED items: 0

---

## 2026-05-23

- `index.md` — Updated: version v0.27.55 → v0.27.59; date 05/22 → 05/23; Browser UIs 6 → 7 (added vault app /en-gb/app/)
- `ui/index.md` — Added: 10 new EXISTS items (SG/App hosting page, <app-shell>, <app-hud>, <app-debug-pane>, 4 debug tab components, routing changes)

Master index: `team/roles/librarian/reviews/05/23/v0.27.59__master-index__code-changes-22-23-may.md`
Processed: 0 new human briefs; 10 code commits scanned (vault UI v0.2.3 additions 22 May)
New EXISTS items: 10 | New PROPOSED items: 0

---

## 2026-05-20

- `index.md` — Updated: version v0.27.53 → v0.27.54; date 05/19 → 05/20; PROPOSED count 205+ → 237+; documents 405 → 415
- `infra/proposed/index.md` — Added: Firecracker substrate section (9 items: PoC, microVM substrate option, vault-attached compute, AI sandbox, Playwright fleet, fourth density mode, Podman default, firecracker-containerd, benchmark)
- `security/proposed/index.md` — Added: Nitro Enclaves section (12 items: three-tier key arch, server-side search, AI inference, MPC, verifiable ops, signing, confidential cred mgr, async sharing, SG-vault-enclave EIF, PCR-based KMS policy, CLI primitives, enclave-protected density tier)
- `ai-agents/proposed/index.md` — Added: Observability pipeline concrete sources (6 items) and AgentCore resell products (5 items)
- `identity/proposed/index.md` — Added: USDC and agentic commerce section (3 items: AgentCore Payments prototype, x402 receiver, USDC backend treasury)

Master index: `team/roles/librarian/reviews/05/20/v0.27.54__master-index__briefs-15-may.md`
Processed: 10 new human briefs (05/15 new files); 0 code commits scanned
New EXISTS items: 0 | New PROPOSED items: 32

---

## 2026-05-19

- `ui/index.md` — Major update: v0.4.0 Share + Open trees folded from "Recent Activity" into EXISTS; Vault UI v0.2.3 additions (App Mode loading overlay, auth re-activation, Remove from saved vaults, Open in new window); v0.2.2 iframe bug fixes folded into EXISTS; legacy v0.3.x section clearly labelled; PROPOSED cleaned (sg-vault-picker removed — now EXISTS)
- `infra/index.md` — Updated: Docker Hub CI now documents parallel matrix strategy (push-by-digest + manifest merge, commit `c21cb5c`)
- `index.md` — Updated: Browser UIs count 4→6 (share, open, admin, workspace, vault + user legacy)

Master index: `team/roles/librarian/reviews/05/19/v0.27.53__master-index__code-changes-14-15-may.md`
Processed: 0 new human briefs; code-verified 5 commits from 05/14–05/15 (v0.27.29–v0.27.45 range)
New EXISTS items: v0.4.0 Share UI, v0.4.0 Open UI, Vault UI v0.2.3 additions
New PROPOSED items: 0

---

## 2026-05-17

- `index.md` — Updated: version v0.27.18 → v0.27.52, date 05/09 → 05/17, PROPOSED count 117+ → 164+, documents 350 → 382
- `infra/proposed/index.md` — Added: SG/Compute package manager (5 items), EC2 image build CLI (2 items), publishing/subdomain infrastructure (5 items) — 12 new PROPOSED
- `vault/proposed/index.md` — Added: publishing layer (5 items), GitHub-as-vault-projection (3 items), customer workflow primitives (3 items) — 11 new PROPOSED
- `ai-agents/proposed/index.md` — Added: communication vault pattern (3 items), observable LLM orchestration tool (6 items), QA stack on SG/Compute (4 items) — 13 new PROPOSED
- `website/proposed/index.md` — Added: agentic newsroom (5 items), CV/portfolio products (5 items), Portugal publication (4 items), sg-video (1 item) — 15 new PROPOSED (note: `<sg-video>` logically belongs in ui/proposed but recorded here with publishing products)

Master index: `team/roles/librarian/reviews/05/17/v0.27.52__master-index__briefs-10-13-may.md`
Processed: 32 new human briefs (05/10–05/13); no code changes verified (aspirational/strategy batch)
New EXISTS items: 0 | New PROPOSED items: 47

---

## 2026-05-09

- `index.md` — Updated: version v0.27.4 → v0.27.18, date, browser UIs count (3→4), PROPOSED count (118+→117+)
- `ui/index.md` — Updated: latest user UI v0.3.1 → v0.3.2; added v0.3.2 section (Share a Secret, Options step, sg-vault-picker, VFS inlining, Secret tab UX); added Vault Browser UI v0.2.2 section (sg-app-banner, vault-browse-edit App Mode + HTML split-view editor + New File button)
- `ui/proposed/index.md` — `sg-vault-picker` marked EXISTS (shipped in v0.3.2)
- `infra/index.md` — Added: SnapStart boto3 lazy client fix in `Storage_FS__S3` (commit `b61a181`)

Master index: `team/roles/librarian/reviews/05/09/v0.27.18__master-index__code-changes-08-09-may.md`
Processes: 0 new human briefs; code-verified 10 version increments (v0.27.8 → v0.27.18)

---

## 2026-05-04

- No domain files updated — no new briefs or code changes
- `activity-log.md` — Backlog task B-010 complete: 33 entries added covering 04/01–05/04

Master index: `team/roles/librarian/reviews/05/04/v0.27.2__master-index__no-new-briefs-04-may.md`
Processes: no new docs (brief scan came up empty)

---

## 2026-05-03

- `index.md` — Updated: version v0.22.18 → v0.27.2, date, doc count (336), PROPOSED count (115+)
- `infra/index.md` — Added: CI note — admin lambda deploy skipped on main/prod (commits `c792383`, `a06a112`)
- `infra/proposed/index.md` — Added: 7 ephemeral infra next-phase features (AMI management, vault server, Docker containers, remote shell, Prometheus, stacks) + Firefox browser plugin (7 sub-features) — all PROPOSED
- `cli/proposed/index.md` — Added: SGit four-layer refactoring (Crypto/Core/Network/Plugins), transaction logging, step-based decomposition, feature flags for plugins — all PROPOSED; two open decisions (#29, #30) catalogued

Master index: `team/roles/librarian/reviews/05/03/v0.27.2__master-index__briefs-29-apr-late-batch.md`
Processes: docs 333–336 (04/29 late batch committed to repo on 01 May)

---

## 2026-04-28

- `index.md` — NEW: master domain index created (reality document refactored from monolith into domain tree)
- `send-api/index.md` — NEW: User Lambda domain index (26 endpoints extracted from monolith)
- `send-api/proposed/index.md` — NEW: SgSend JS API, large blob phases 2–4, four upload modes
- `admin-api/index.md` — NEW: Admin Lambda domain index (51 endpoints extracted)
- `admin-api/proposed/index.md` — NEW: backend storage restructuring, MCP rooms, vault bundle
- `vault/index.md` — NEW: vault crypto + storage domain index (key derivation, object CAS, current encryption state)
- `vault/proposed/index.md` — NEW: vault proposed items overview (9 themes)
- `vault/proposed/structure-key-split.md` — NEW: 04/28 architect review content (docs 323–324, four-team change)
- `cli/index.md` — NEW: sgit CLI domain index (20+ commands, verified integrations)
- `cli/proposed/index.md` — NEW: delta-share fallback, CLI extensions, MCP transport
- `website/index.md` — NEW: sgraph.ai website domain index (21 pages, 11 components, CI)
- `website/proposed/index.md` — NEW: website repo extraction (BLOCKED), redesign themes
- `ui/index.md` — NEW: three browser UIs domain index (user v0.3.1, admin v0.1.7, workspace v0.1.0)
- `ui/proposed/index.md` — NEW: upload UX redesign, gallery editor, vault upload beta
- `tools/index.md` — NEW: tools.sgraph.ai domain index (4 live tools)
- `tools/proposed/index.md` — NEW: video editing tools, WASM tools, PlaybookLM
- `infra/index.md` — NEW: infrastructure domain index (7 targets, CI/CD, Docker)
- `infra/proposed/index.md` — NEW: AMI marketplace, ephemeral infra, Playwright service
- `security/index.md` — NEW: security properties + violations domain index
- `security/proposed/index.md` — NEW: security monitoring proposals
- `identity/index.md` — NEW: identity domain index (token auth exists; OAuth/billing PROPOSED)
- `identity/proposed/index.md` — NEW: Google OAuth, billing credits, OpenRouter
- `ai-agents/index.md` — NEW: agentic workflows domain index (MCP + Claude vault access verified)
- `ai-agents/proposed/index.md` — NEW: LLM components, workflow automation, task system
- `qa/index.md` — NEW: QA domain index (~602 tests passing)
- `qa/proposed/index.md` — NEW: browser automation, Playwright service, evidence packs
- `alchemist/index.md` — NEW: Alchemist/investor materials domain index
- `alchemist/proposed/index.md` — NEW: investor site proposals
- `team/roles/librarian/DAILY_RUN.md` — NEW: daily Librarian playbook + important-but-not-urgent task backlog (B-001 through B-010)

Master index: `team/roles/librarian/reviews/04/28/v0.22.18__master-index__briefs-28-apr.md`

---

## 2026-04-27

- No domain files updated (quiescent day, no new briefs or code)

Master index: `team/roles/librarian/reviews/04/27/v0.22.17__master-index__briefs-27-apr.md`

---

## 2026-04-26

- No domain files updated (no new briefs; website repo extraction dev pack catalogued)

Master index: `team/roles/librarian/reviews/04/26/v0.22.17__master-index__briefs-26-apr.md`

---

## 2026-04-25

- No domain files yet (pre-split monolith was updated instead)
- `v0.16.26__what-exists-today.md` — 11 docs from 04/21 catalogued (docs 312–322); Section 31 added (31 PROPOSED items)

Master index: `team/roles/librarian/reviews/04/25/v0.22.17__master-index__briefs-21-apr.md`

---

## 2026-04-24

- `v0.16.26__what-exists-today.md` — sg-site-header v1.0.4–v1.0.6, 10 homepage components, jsUrl fix

Master index: `team/roles/librarian/reviews/04/24/v0.22.6__master-index__code-delivery-23-24-apr.md`

---

*For older history, see the archived monolith `v0.16.26__what-exists-today.md` — "Changes Since" sections cover 02/26 through 04/28.*
