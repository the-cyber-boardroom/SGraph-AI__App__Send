# AI Agents — Proposed: Automated Workflows and Agentic Patterns

**Domain:** ai-agents/proposed/workflows | **Last updated:** 2026-06-28 | **Maintained by:** Librarian (B-003)
**Parent index:** [`index.md`](index.md)

All items below are PROPOSED. None have been code-verified. Do not describe any of these as existing features.

---

## Scheduled and Autonomous Tasks

| Feature | One-Line Description | Monolith Section |
|---------|---------------------|-----------------|
| Daily briefing assembly | 9:30 AM daily: reads Librarian + QA vault outputs, assembles brief | Section 19 |
| Website stats collection | Daily CloudFront/S3/Lambda metrics collection via agent | Section 19 |
| Email digest | Daily WorkMail inbox summary via agent | Section 19 |
| OKR tracker | Weekly review of progress against objectives | Section 19 |
| Multi-repo status | Daily check across main, QA, tools, CLI repos | Section 19 |
| Vault cleanup | Weekly cleanup of expired transfers and temporary vaults | Section 19 |
| Security scan | Daily SSL cert, headers, dependency audit | Section 19 |
| Task launcher unified shell | Unified shell for launching agentic tasks (doc 319) | Section 31 |
| 7 task-focused LLM components | Specialised components for 7 distinct task types (doc 318) | Section 31 |
| Agentic team setup pack creator | One-click pack to set up new team vault + SKILL.md + roles (doc 243) | Section 23 |
| Vault-driven CI | Agent manages CI by pushing to vault rather than Git | Section 31 |

---

## Accountant Demo (05/16 briefs — doc 421)

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-147 | Side-by-side two-persona demo environment | Four-pane UI: Actions / Accountant view / Client view / Narrative | doc 421 |
| P-148 | FastAPI orchestration service for demo lifecycle | sessions, setup, step/N, state, teardown endpoints; holds AWS credentials; idempotent | doc 421 |
| P-149 | Accountant + client vault apps with role-based routing | Same vault; `/accountant` and `/client` routes; different UX per role | doc 421 |
| P-150 | 12-step demo workflow | Setup → provisioning → vault loading → role interactions → report → approval → submission → confirmation → teardown | doc 421 |
| P-151 | Auto-teardown after 15-20 min idle | Prevents orphan demo sessions; reuses reset-on-activity timeout pattern | doc 421 |
| P-152 | Demo framework pattern | Reusable template for recruitment/news/risk demos; content work once infrastructure established | doc 421 |

---

## Archiver-Cataloguer Pattern (06/15 briefs, v0.33.27)

All items below are PROPOSED — does not exist yet. Primitives are EXISTS (vault inbox, ephemeral compute, two-key model, vault CAS).

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-238 | Archiver-cataloguer generic workflow | Append to vault (two-key gating) → debounced trigger → ephemeral compute spins up → agent reads, catalogues, copies, appends, acts → result placed back in vault → ephemeral compute disappears | 06/15 arch-brief (archiver-cataloguer-pattern) |
| P-239 | Two-key-plus-authorised-keys ingestion gate | Ingestion gated by vault's accept-list of sender public keys; submitter must encrypt with vault PK and sign with sender PK; only pre-approved keys may append | 06/15 arch-brief (archiver-cataloguer-pattern) |
| P-240 | Debounced ephemeral-compute trigger | Interval or on-append trigger with debounce window to avoid multiple invocations from rapid successive uploads; per-use-case configurable | 06/15 arch-brief (archiver-cataloguer-pattern) |
| P-241 | Multi-vault chaining for cataloguer isolation | Source vault → cataloguing vault (transforms only; no full data access) → destination vault(s); prompt-injection blast radius limited to the cataloguing stage; enables multiple recipients without a single uber-vault | 06/15 arch-brief (archiver-cataloguer-pattern) |
| P-242 | Per-use-case cataloguing rules engine | Schema-based (not free-form prompt) rules defining what the agent does per use case: cataloguing, copying, appending, acting; one rules definition per deployment | 06/15 arch-brief (archiver-cataloguer-pattern) |
| P-243 | Transaction log archiving use case | Append-mode log entries → ephemeral compute → catalogued and indexed in destination vault; first use case (proves the generic loop) | 06/15 arch-brief (archiver-cataloguer-use-cases) |
| P-244 | Email and agent-messaging archiving use case | Incoming EML + sidecar → catalogued `mail/` tree in vault; agent-to-agent message ingestion path | 06/15 arch-brief (archiver-cataloguer-use-cases) |
| P-245 | Drag-drop file indexing (short-term and long-term modes) | Short-term: rapid indexing of dropped files in session vault; long-term: retention into Encrypted Spaces or persistent vault (depends on Encrypted Spaces PROPOSED); two distinct retention modes | 06/15 arch-brief (archiver-cataloguer-use-cases) |
| P-246 | Research ingestion use case | Document drops → chunked, catalogued knowledge base in destination vault; research ingestion pipeline | 06/15 arch-brief (archiver-cataloguer-use-cases) |

---

## Agentic Incident-Response Service (06/15 strategy brief, v0.33.27)

This is a service concept, not a build. No code deliverable until the workflow map is produced.

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-247 | Agentic compromise incident-response service | "Who you gonna call" service for users whose privileged AI agents are compromised; rootkit-style threat model (access, resources, credentials, persistence); when-not-if posture; rebuild-reset-monitor remediation; aligned with security companies; SGraph offering vs separate venture open; next step is workflow map | 06/15 strategy-brief (agentic-compromise-incident-response) |
