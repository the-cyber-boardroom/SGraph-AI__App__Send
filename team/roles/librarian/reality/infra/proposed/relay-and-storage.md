# Infrastructure — Relay, Storage, and IAM Proposed Items

**Domain:** infra/proposed/ | **Last updated:** 2026-07-14 | **Maintained by:** Librarian (daily run)

All items below are PROPOSED. None have been code-verified. Do not describe any of these as existing features.

Source briefs: docs 400, 402 (05/17), 06/16 pack (v0.32.4), 06/23 brief (v0.33.33).

---

## SG/Relay — Vault Routing Service (06/16 briefs — implementation pack v0.32.4)

The vault inbox foundation EXISTS (shipped v0.29.1). The relay layer built on top is PROPOSED.

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-337 | SG/Relay routing core | Content-blind stateless relay; ports-and-adapters; receive→route→dedup→fan-out→send; `Envelope` Type_Safe schema; dedup cursor; separate new service/repo | 06/16 pack doc 00, 01 |
| P-338 | SG/Relay vault-inbox reference adapter | Maps relay adapter port to shipped `POST /vault/append` and `POST /vault/inbox` endpoints; holds append_token (public) or enum_key (outbound only) | 06/16 pack doc 02 |
| P-339 | SG/Relay SES inbound adapter | SES receipt → S3 → S3 event → Lambda; reads `.eml`; wraps in Envelope; routes to vault inbox | 06/16 pack doc 02 |
| P-340 | SG/Relay SES outbound adapter | Drain vault inbox → wrap → SES `send_email`; bounce handling | 06/16 pack doc 02 |
| P-341 | SG/Relay IMAP polling adapter | Schedule-triggered; poll IMAP; wrap messages in Envelope; route to vault inbox | 06/16 pack doc 02 |
| P-342 | SG/Relay SQS/SNS/EventBridge adapters | SQS message → Envelope → vault inbox; SNS/EventBridge variants | 06/16 pack doc 02 |
| P-343 | SG/Relay drain client + mail/ tree population | Drains vault inbox using enum_key; populates `mail/` tree in recipient vault; implements mailbox semantics | 06/16 pack doc 04 |
| P-344 | Vault-native inbox UX | Browser inbox/thread/compose UI rendering the `mail/` tree; drain button | 06/16 pack doc 05 |
| P-345 | Chrome-extension bridge | Seal-on-send / open-on-receive in real webmail (Gmail, Outlook); depends on PROPOSED P-157 sealed-box client crypto | 06/16 pack doc 05 |
| P-346 | email-fs-lite Type_Safe schema | RFC-2822-compatible `.eml` + sidecar formalised as a `Type_Safe` `Email_FS_Lite__Envelope`; currently spec-only in markdown | 06/16 pack doc 00 |

---

## S3 Native CLI (05/17 brief — doc 402)

| Feature | One-Line Description | Source |
|---------|---------------------|--------|
| S3 native CLI commands | ls, view, edit, cat, tail, head, cp, mv, rm, stat, presign, search, bucket-create, bucket-list, bucket-stat, bucket-config | doc 402 |
| S3 vim edit integration | Download S3 object → open `$EDITOR` → re-upload with ETag conflict detection | doc 402 |
| S3 rsync-style sync primitive | Compare source/destination, transfer changed, checksums, --delete, --dry-run, --reverse | doc 402 |
| Vault-aware S3 wrappers | vault-open, vault-sync, vault-diff, vault-ls — thin wrappers over S3 CLI with vault semantics | doc 402 |

---

## IAM Graph Visualisation and Lockdown (05/17 brief — doc 400)

| Feature | One-Line Description | Source |
|---------|---------------------|--------|
| IAM graph visualisation | Discovery pass → graph data structure (role, policy, resource, action tuples) → vault-stored; cleanup and expansion commands | doc 400 |
| CloudTrail evidence layer for IAM | Per-role: observed actions vs granted permissions over N days; drives evidence-based permission tightening | doc 400 |

---

## S3-Compatible Vault Container for SG Compute (06/23 brief — v0.33.33)

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-407 | S3-compatible vault container for SG compute | Docker container presenting the same S3-compatible API as real S3 (a digital twin); existing services keep using boto3, the AWS CLI, or any S3 SDK unchanged — only the S3 endpoint is repointed at the container; files served from a selectable backend: vault (the eventual goal), local disk, or memory; AWS access key and secret fields reused as container header name and header value for transparent auth compatibility — the calling code cannot tell it is not talking to real S3; turns the vault into a drop-in transparent storage backend for the entire S3 ecosystem with no code change in consuming services; most code already exists from the v0.27.2 S3-compatible API work; this packages it as a Docker container for the SG compute service; effort: low to moderate (code mostly exists) | 06/23 compute-and-storage/s3-compatible-vault-container-brief |
