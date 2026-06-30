# vault/proposed — Public Vault Previews, Discovery & Compliance

**Domain:** `vault/` | **Last updated:** 2026-06-30 | **Maintained by:** Librarian
**Source:** briefs 05/16, 05/25, 05/30–06/01

**Note:** Public Vault Previews core features (P-166–P-177) are largely EXISTS in `ui/index.md`
(Vault Browser UI → Public Vault Previews, v0.2.3). The proposals are preserved here for
traceability. Timing/expiry controls (P-VERIFY) remain unconfirmed.

Dev pack: `library/sgraph-send/dev_packs/v0.27.62__public-vault-previews/`

---

## Public Vault Previews (05/25 brief — public-vault-previews)

| # | Feature | Status | One-Line Description |
|---|---------|--------|---------------------|
| P-166 | Public-vault-about-key + deterministic derivation | **EXISTS** | SHA-256 → 12-hex transfer-id + PBKDF2 AES read-only decrypt-only key |
| P-167 | Public-preview convention JSON (`sgraph-public-preview/v1`) | **EXISTS** | Deliberately-public title/description/thumbnail/disclaimer; field-name guard bans write_key/read_key |
| P-168 | Two access modes on `/en-gb/app/<public-id>` | **EXISTS (partial)** | No `#` → render preview + ask for key; `#key` → auto-load. CloudFront path rewrite pending |
| P-169 | Delete-then-recreate update via owner-held random `delete_auth` | **EXISTS** | Update/unpublish = DELETE transfer + recreate; same link across edits |
| P-170 | Crawler social-share cards via in-repo OG-render | **EXISTS** | Route derives + fetches + decrypts preview server-side; injects OG/Twitter meta tags; fails closed |
| P-171 | `sg-public-preview-editor` — embedded Settings tab | **EXISTS** | Lightweight vault-shell Settings tab; auto-loads existing preview for editing; live card preview |
| P-172 | Transparency: surface the SG/Send file | **EXISTS** | Transfer-id + RO key + direct link on tester page; not on public card |
| P-173 | `/en-gb/preview/<preview-key>` card-tester page | **EXISTS** | New page rendering preview as unfurl + debug strip; never opens vault |
| P-175 | "Key saved on this device" one-click open | **EXISTS** | Per-public-id key stored as `sg-pvp-key:<id>`; offered as one-click open |
| P-176 | Preview management list + delete | **EXISTS** | Lists all `.vault/owner/public-previews/` records; Unpublish vs Delete |
| P-177 | RO-token entry on `/en-gb/app/<public-id>` key prompt | **EXISTS** | Deterministic transfer-id from RO token; `SGVault.openReadOnly` path |
| — | Timing/expiry controls | **VERIFY** | Brief specifies; implementation status unconfirmed |

---

## Vault Discovery and Public Keys (05/16 briefs — doc 422)

**PROPOSED — does not exist yet.**

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-153 | Discovery endpoint at `/.well-known/vaults` | Returns structured JSON listing of public vaults with metadata | doc 422 |
| P-154 | Vault visibility model | Four levels: public / unlisted / private / count-only | doc 422 |
| P-155 | Ed25519 signing + X25519 encryption key pair per vault | New PKI layer — public key safe to expose; private key never leaves owner | doc 422 |
| P-156 | Public key in vault metadata for discovery and cryptographic addressing | Serialized in discovery endpoint output and vault metadata | doc 422 |
| P-157 | "Send content to a vault" via public-key encryption | One-way anonymous submission: encrypt to vault's X25519 public key; only owner can decrypt | doc 422 |
| P-158 | Self-contained demo server with vault catalogue UI | Portable Docker image or VM with bundled vaults; works offline/air-gapped | doc 422 |

---

## Compliance + Vulnerability Artefacts (05/30–06/01 briefs)

**PROPOSED — does not exist yet.**

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-281 | Vault-per-Standard Document-to-Graph Pipeline | Universal pipeline: document → structured form → semantic graph + ontologies → validation → feedback. GDPR as pilot standard; intersection vaults drawing on two parent per-standard vaults via VIV sub-vault link. | 05/30 brief |
| P-282 | Public Preview with Embedded Read-Only Key | Extends P-167 convention JSON with embedded `read_only_key` field so the public link carries the RO token. Auto-load path on `/en-gb/app/<public-id>` detects and uses the embedded RO token (resolves via deterministic transfer-id, P-177). Field-name guard extended to ban full vault keys — only RO token allowed. | 05/30 brief |
| P-284 | Vulnerability Debriefs as First-Class Platform Artefacts | Vault template + schema for vulnerability debriefs: `cve_id`/`title`/`severity`/`date`/`affected_versions`/`status`, timeline, IoCs, lessons learned. Published as public vault via public preview path (P-166–P-177). Version-controlled audit history. | 05/31 brief |
