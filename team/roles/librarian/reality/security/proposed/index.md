# Security — Proposed Items Index

**Domain:** security/proposed/ | **Last updated:** 2026-05-20 | **Maintained by:** Librarian (daily run)

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
