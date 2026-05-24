# Security — Proposed Items Index

**Domain:** security/proposed/ | **Last updated:** 2026-05-24 | **Maintained by:** Librarian (daily run)

All items below are PROPOSED. None have been code-verified. Do not describe any of these as existing features.

Full content for each item is in the archived monolith: `../v0.16.26__what-exists-today.md` (sections noted).

---

## Monitoring and Visibility

| Feature | One-Line Description | Monolith Section |
|---------|---------------------|-----------------|
| CloudFront/S3/CloudWatch/X-Ray logging | Phase 1 visibility strategy — configuration only, no code changes required | Section 16 |
| GuardDuty evaluation | Threat detection service evaluation and configuration | Section 16 |
| WAF evaluation | Web Application Firewall evaluation and configuration | Section 16 |
| Security Hub evaluation | Centralised security findings aggregation evaluation | Section 16 |
| Agent-consumable security findings | Security findings exported as JSON in vaults for agent review | Section 16 |
| Amazon Managed Grafana + CloudWatch | Infrastructure and security monitoring dashboard (~$78/month) | Sections 16, 17 |
| Agentic QA performance framework | Automated performance testing with agent-driven analysis | Section 17 |

## Access Control Architecture

| Feature | One-Line Description | Monolith Section |
|---------|---------------------|-----------------|
| Four-layer security model Mode B | Device provenance — mandatory branch signing via PKI | Section 16 |
| Four-layer security model Mode C | Author-identified — user keys for all writes | Section 16 |
| Four-layer security model Mode D | Countersigned — third-party attestation for regulated use | Section 16 |
| Client-side recipient restrictions | Recipient policy: allowed countries, timezones, browser types | Section 16 |
| `<sg-policy-editor>` Web Component | UI for creating and editing recipient restriction policies | Section 16 |
| `<sg-policy-evaluator>` Web Component | Runtime policy enforcement in browser at decryption time | Section 16 |
| Browser fingerprinting (anonymous free tier) | Device fingerprint for anonymous free tier credit allocation | Section 16 |

## Evidence and Compliance

| Feature | One-Line Description | Monolith Section |
|---------|---------------------|-----------------|
| Evidence packs + risk acceptance workflow | Structured evidence collection and formal risk acceptance process | Section 31 |
| OWASP submission: "Cambrian Explosion of AppSec Startups" | Conference presentation with SG/Send as AppSec case study | Section 20 |

## PKI Extensions

| Feature | One-Line Description | Monolith Section |
|---------|---------------------|-----------------|
| Key rotation for user keys | Mechanism for users to rotate their PKI key pairs | Section 16 |
| Hardware key support (YubiKey, TPM) | Hardware security key integration for PKI operations | Section 16 |
| Mandatory branch signing (PKI Mode 2) | All vault commits signed with device-specific key pair | Section 16 |

## Known Violations — Remediation Backlog

| Violation | Status | Notes |
|-----------|--------|-------|
| Google Fonts in 9 UI files | PROPOSED fix — remove and vendor locally | Monolith Section 10 |
| Absolute path nav links in older pages | PROPOSED fix — convert to relative paths | Monolith Section 10 |
| cdn.sgraph.ai (zero-dep requirement) | DOES NOT EXIST — no timeline | v0.7.6 brief |

---

---

## Nitro Enclaves — Confidential Computing (05/15 briefs — docs 409, 414)

All items below are PROPOSED — does not exist yet.

| Feature | One-Line Description | Source |
|---------|---------------------|--------|
| Three-tier vault key architecture | Customer key client-side / vault key in enclave / KMS-wrapped service keys — fourth ZK boundary | doc 414 |
| Server-side vault search via Nitro Enclave | Vault key sent to attested enclave; decryption + in-memory search index; never on parent | doc 414 |
| Server-side AI inference via Nitro Enclave | LLM features for regulated/high-trust customers; enclave holds vault key for duration of inference session | doc 414 |
| Multi-party vault computation via Nitro Enclave | Two parties' inputs decrypted in enclave; neither sees the other's data; no party sees either input | doc 414 |
| Verifiable vault operations | PCR0 of signing enclave recorded in vault commit; auditors can verify exact code that ran | doc 414 |
| Server-side signing via Nitro Enclave | Customer signing key sealed in enclave; customer verifies via attestation; no key on parent | doc 414 |
| Confidential credential manager via Nitro Enclave | Proxy-mode decryption inside enclave; API keys never in plaintext on parent EC2 | doc 414 |
| Async vault sharing via Nitro Enclave | Re-encryption of data keys under recipient's public key while sender is offline | doc 414 |
| Open-source SG-vault-enclave EIF | Takes vault key, decrypts S3 content, exposes vsock read/write/search API; PCR values published | doc 414 |
| PCR-based KMS key policy for service keys | Credential manager service keys only decryptable by specific verified enclave image (PCR0/PCR8 condition) | doc 414 |
| Nitro Enclaves CLI primitives | `sg-compute aws nitro-enclaves run`, `build`, `describe` etc. following established CLI pattern | doc 414 |
| Enclave-protected tier in vault hosting density modes | Fourth density tier: highest cost, cryptographic isolation from platform operator | doc 414 |

*Full content for all items: `../v0.16.26__what-exists-today.md` (Sections 10, 11, 16, 17, 31)*

---

## SG/Sentinel — Edge Security, Logging, and Routing Layer (05/22 briefs — Day 68, docs 445–463)

All items below are PROPOSED — does not exist yet.

**SG/Sentinel** is the edge security, logging, and routing layer designed to sit in front of all SGraph servers (via CloudFront). Complete design corpus produced in Day 68 (19 documents). MVP scope scoped and ready to implement.

### Architecture Principles and Execution Model

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-204 | SG/Sentinel founding principles | Substrate-independent; sits-in-front-of-everything; controllable/refactorable; best-layer-for-each-job; make-site-hostile-to-bad-traffic; runaway-cost insurance; PKI + bot-detection + LLM-driven | doc 445 |
| P-205 | Layered execution model | Layer 1 (CloudFront Functions, sub-ms, no I/O, easy wins), Layer 2 (Lambda@Edge, capable, app-coupled), Layer 3 (async/Nova, off-hot-path); no-invalid-request principle; symmetry principle | doc 446 |
| P-206 | SG/Sentinel MVP scope | Logging (clean, real-time, to S3, replacing Firehose), blocking (easy-win deterministic), deployment lifecycle; app-coupled WAF; two-way conversation API (ping/query/admin, API-key-protected) | doc 447 |

### Rules Engine

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-207 | SG/Sentinel rules engine | Rules are 98% of code; engine is tiny + high-privilege; rule spectrum (deterministic to LLM); per-rule least privilege (function + IAM scope); rule-set-as-vault; LLM heavy in dev, minimal in prod, NEVER inline; semantic knowledge graphs | doc 448 |
| P-215 | SG/Sentinel rule architecture (fractal graph) | Rules within rule-sets; packs activated by triggers; rules selecting next rules; rich metadata (semantic, standard, attack-tree, confidence, layer); IDs everywhere; deterministic-to-opinion spectrum | doc 456 |

### Rules Lifecycle and Developer Model

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-208 | SG/Sentinel interactivity and deployment phases | Two-way layer invocation; lambda-as-container local run; dangerous dev-only rules (enable/disable); minimal bundles; dev/main/prod phases (main = production = QA) | doc 449 |
| P-209 | SG/Sentinel as codebase extension | Python same-code-everywhere (killer feature); Type_Safe runtime validation; security zones/trust boundaries; agentic dev team (AppSec + developer + QA + architect agents) | doc 450 |
| P-210 | SG/Sentinel delegation and choke-points | No-404s-at-API-layer as correctness signal; every request improves the system; progressive lock-down; deploy-parity (QA-vs-prod diff = major bug) | doc 451 |
| P-211 | SG/Sentinel time as first-class dimension | Multiple timelines (immediate to historical); fingerprint allowlisting (good-users-faster); detect-before-damage; success = damage prevented, not requests blocked | doc 452 |
| P-212 | SG/Sentinel developer friendliness and evidence graph | LLM interpretation-based checks; "what do you know about me?" (dev-only); evidence graph (semantic, async-agent-built, per-user/IP vaults); anonymity modes; zero-knowledge bound | doc 453 |

### Standards and Compliance

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-213 | SG/Sentinel standards compatibility | MITRE ATT&CK (T1190), OWASP CRS + SecLang, Coraza (Go, ModSecurity-compatible), STIX/TAXII; AbuseIPDB/GreyNoise/Spamhaus threat-intel on async timelines; IP reputation = context not verdict (residential-proxy finding) | doc 454 |
| P-214 | SG/Sentinel compliance-as-living-graph | GDPR, ISO 27001, OWASP Top 10, OWASP AI mapped to deployment; dynamic posture (rules enable/disable compliance standards); per-deployment view; standards-as-vaults | doc 455 |

### Architecture and Operator Surfaces

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-216 | SG/Sentinel architecture and data flows | Full component map; logging flow (Layer 1 → S3, Sentinel ends at S3); blocking flow (easy wins L1, app-coupled L2, async L3 feedback); rule engines across layers; dev environment with deploy parity | doc 457 |
| P-217 | SG/Sentinel TUI mockups (9 surfaces) | Deployment reality, live traffic, blocks, logs+S3, rules management, rule detail+test, deployed code, threat intel, deploy; all TUI-API-friendly; Textual-based | doc 458 |

### Validation (Tabletop Simulations)

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-218 | SG/Sentinel behavioural spec | Packet through Steps 0-8; fingerprint/fast-track, anomaly-scoring, detect-before-damage behaviours; the answer key for tabletop simulations | doc 459 |
| P-219 | SG/Sentinel tabletop simulation 1 (generic + logging) | 5 traced requests; 11 gaps found (2 major: fingerprint-storage-at-L1, symmetry-blocks-new-deploys); gap resolutions documented | doc 460 |
| P-220 | SG/Sentinel tabletop simulation 2 (blocking) | 6 attack scenarios; 14 gaps (7 major); fast-track reconceived as zero-trust acceleration; per-IP detection defeated by residential proxies; app-must-report-auth-outcomes; in-profile exploits need content rules; defence in depth | doc 461 |

### Consolidation and MVP Path

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-221 | SG/Sentinel prior art and gap resolutions | OPA/Rego, Detection-as-Code/Sigma, deception technology (honeytokens), zero-trust; three graphs are one; replay-from-S3 as test corpus; Sentinel guards its own control plane | doc 462 |
| P-222 | SG/Sentinel path to MVP (10-step sequence) | L1 logging + easy-win blocks, L2 observe-mode, fingerprint object, 4 TUI surfaces, TUI API foundation, rule engine core, dev environment; 7 memos to record; 5 prior-art deep-dives; parked items | doc 463 |
