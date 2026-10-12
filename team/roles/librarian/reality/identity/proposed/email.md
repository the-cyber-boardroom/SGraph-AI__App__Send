# Identity — Proposed: Email and Communications

**Domain:** identity/proposed/ | **Last updated:** 2026-07-21 | **Maintained by:** Librarian (daily run)

All items below are PROPOSED — does not exist yet. Do not describe any of these as existing features.

Source documents: archived monolith `../v0.16.26__what-exists-today.md` Section 16;
05/16 brief (doc 425). See index.md for full P-number inventory.

---

## Email and Outreach

| Feature | One-Line Description | Source |
|---------|---------------------|--------|
| Sherpa CLI | Email campaigns and WorkMail integration for outreach workflows | Section 16 |
| Move from WorkMail to SES | Replace WorkMail sending with Amazon SES | Section 16 |
| Email pipeline: Composer→Reviewer→Sender | Three-agent email pipeline for outbound communications | Section 16 |

---

## SG Mail Email Client (05/16 brief — doc 425)

All items below are PROPOSED — does not exist yet.

SG Mail is a vault-native email client. The existing WorkMail + n8n pipeline (EXISTS for Early
Access signups) handles inbound notification email only. SG Mail is a full email client built
on `email-fs` (vault-based email store), distinct from the notification pipeline.

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-165 | SG Mail email client core | Vault client on email-fs; standard inbox/threads/compose/search UX; vault-grounded properties (versioned history, cross-vault references, per-message audit trail, encrypted at rest) | doc 425 |
| P-166 | AWS SES connectors v1 | SES inbound (SES → S3 event trigger → email-fs reader → vault) + SES outbound (vault compose → SES API → recipient); domain MX → SES; DKIM/SPF/DMARC via SES | doc 425 |
| P-167 | Cloudflare Email Service connector v2 | Agent-native; April 2026 launch; Email Routing → Worker → POST EML to endpoint | doc 425 |
| P-168 | Gmail API connector v2 | Bidirectional sync; OAuth scoped to read + send; mirrors Gmail mailbox into vault | doc 425 |
| P-169 | WorkMail migration tool | Export mbox/maildir from WorkMail → parse → commit to email-fs vault; reusable for future customers | doc 425 |
| P-170 | Private email vault isolation | Dedicated vault per user; separate encryption key, S3 bucket/account, access path, and backup cadence from public vaults | doc 425 |
