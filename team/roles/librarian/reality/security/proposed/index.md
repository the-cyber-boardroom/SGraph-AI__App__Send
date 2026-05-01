# Security — Proposed Items Index

**Domain:** security/proposed/ | **Last updated:** 2026-04-28 | **Maintained by:** Librarian (daily run)

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

*Full content for all items: `../v0.16.26__what-exists-today.md` (Sections 10, 11, 16, 17, 31)*
