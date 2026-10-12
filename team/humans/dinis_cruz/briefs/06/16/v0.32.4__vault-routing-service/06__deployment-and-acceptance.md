# 06 — Deployment, phasing, and acceptance

**version** v0.32.4 · **date** 6 June 2026 · **from** Architect + DevOps + QA · **type** Implementation briefing (deployment / acceptance)

How SG/Relay runs, in what order it gets built, and the bar it must clear. The relay is a
SG/Compute citizen: ephemeral, event- or schedule-triggered, no always-on infrastructure.

---

## 1. Deployment shape

```
   trigger                         compute                        holds
 ┌──────────────────────┐   ┌────────────────────────┐   ┌────────────────────────┐
 │ SES receipt → S3 →    │──▶│ Lambda: SES__Inbound    │──▶│ append_token (public)   │
 │   S3 event            │   │   adapter + core         │   │ STS role (s3:Get, ses)  │
 ├──────────────────────┤   ├────────────────────────┤   ├────────────────────────┤
 │ schedule (N min)      │──▶│ Lambda/Fargate: IMAP    │──▶│ IMAP creds (Secrets Mgr)│
 │                       │   │   poll + core            │   │                         │
 ├──────────────────────┤   ├────────────────────────┤   ├────────────────────────┤
 │ SQS message           │──▶│ Lambda: SQS__Source +   │──▶│ STS role (sqs:*queue)   │
 │                       │   │   core                   │   │                         │
 ├──────────────────────┤   ├────────────────────────┤   ├────────────────────────┤
 │ UI "send" / drain     │──▶│ Lambda/Fargate: outbound│──▶│ enum_key (Secrets Mgr)  │
 │                       │   │   drain + SES sink       │   │ STS role (ses:Send)     │
 └──────────────────────┘   └────────────────────────┘   └────────────────────────┘
```

- **No always-on receiver.** Inbound is event-driven (S3/webhook/SQS); polling adapters run on
  a schedule; outbound runs on a send/drain trigger. Matches the serverless framing — SES
  inbound is roughly free at low volume; SES outbound ≈ $0.10 / 1000; storage is cents/GB.
- **EC2 is out of scope here.** The EC2/ECR path was removed (v0.27.45) and now belongs to the
  separate **SG/Compute** project; if a warm host is ever needed for the vault web app, that is
  SG/Compute's call, not the relay's.
- **Stack rules apply unchanged:** `osbot-aws` for every AWS call (the sg-workmail precedent's
  direct `boto3` does **not** carry forward), `Type_Safe` schemas, `Serverless__Fast_API` base
  for any HTTP entry point (webhook/enqueue), Mangum via osbot for the Lambda adapter.

## 2. Phased plan

| Phase | Deliverable | Proof | Depends on |
|---|---|---|---|
| **P0** | Routing core + `Memory__Source`/`Memory__Sink`; `Envelope`; dedup; fan-out; caps | core unit tests, in-memory, no mocks | nothing |
| **P1** | `Vault__Inbox__Sink` (append); inbound route world→vault | append round-trips against in-memory inbox **and** LocalStack-S3 | shipped inbox |
| **P2** | `SES__Inbound` (S3-event); end-to-end world→vault on 2 vaults | a real SES message lands sealed in a vault inbox | P1 |
| **P3** | `Vault__Inbox__Source` (drain) + drain client → `mail/` tree; `enum_key` path | bidirectional on 5 vaults (parent + 4 children) | P1; enum_key provisioning |
| **P4** | `SES__Outbound` + outbound drain; vault→world email | a vault reply leaves via SES; bounce handled | P3 |
| **P5** | Vault-native inbox UX (3a) | inbox/thread/compose render the `mail/` tree; drain button works | P3 |
| **P6** | Chrome-extension bridge (3b) | seal-on-send / open-on-receive in real webmail | **P-157 sealed-box client crypto** |
| **P7** | Second channel (SMS or SQS) | one new adapter, zero core changes — proves generality | P0 |

P0–P2 ship against opaque bytes and the shipped inbox, **independent of the PROPOSED PKI half**.
True E2E confidentiality (and P6) wait on P-157; routing does not.

## 3. Acceptance criteria

**Core**
- [ ] A replayed `seq` is dropped (idempotent); a gap is flagged, never blocks; fan-out delivers
      to all destinations or dead-letters the failures independently.
- [ ] The core has **zero** imports of `osbot-aws`, SMTP/IMAP libs, or the vault HTTP client.
- [ ] Payload bytes never appear in logs, metrics, traces, or dead-letter records.

**Vault adapters**
- [ ] Append returns no file id; the relay cannot enumerate or fetch with only an `append_token`.
- [ ] Drain works on **S3** (not just memory) — explicit LocalStack/S3 test exercising
      `folder__folders` (guards the B-1 class of silent-empty bug).
- [ ] `mark-processed` moves files reversibly; the relay cannot `purge` (no `write_key`).
- [ ] Untrusted `file_id` / `append_token` / `inbox` values are rejected (no path traversal —
      relies on the shipped B-2 coercion; relay passes values through the endpoints unmodified).

**Security (AppSec sign-off)**
- [ ] Inbound-only relay holds no vault secret; verified by config + a negative test (no
      `enum_key` present → drain calls 403).
- [ ] A compromised relay cannot produce plaintext: round-trip test seals on client A, routes
      through a relay with **no** private key, fails to decrypt at the relay, decrypts only at
      client B.
- [ ] STS roles are least-privilege per adapter action; scope catalogue versioned in a vault.
- [ ] No silent downgrade: a cleartext-from-world route is flagged not-E2E in config **and** UI.

**Channel generality**
- [ ] Adding the P7 channel touches only a new adapter class + one routing-config entry; the
      core diff is empty.

## 4. Test obligations (no mocks, house pattern)

- In-memory core + `Memory__*` adapters → ~100 ms full-stack run.
- LocalStack for SES / SQS / SNS / S3; a real IMAP test server (greenmail) for the IMAP adapter.
- Cross-direction round-trip: `Vault__Inbox__Sink` → inbox → `Vault__Inbox__Source` → envelope
  equality + cursor advance.
- Cross-component E2E (when P-157 lands): seal (client) → route (relay) → open (client) KAT, plus
  negative tests (wrong key → clean `InvalidTag`, never partial plaintext; tampered ciphertext →
  auth failure).
- Playwright E2E for the inbox UX (3a) and the extension (3b).

## 5. Handoffs

| To | What |
|---|---|
| **Dev** | Build P0 core first (pure, in-memory). Then `Vault__Inbox__Sink`/`Source` mapping the shipped endpoints (`02`). New repo `sg-relay`; do not add to `sgraph_ai_app_send`. |
| **AppSec** | Own the §3 security criteria and the `03` threat model. Sign off the inbound-no-secret property and the no-plaintext-at-relay round-trip before P4. |
| **DevOps** | Wire SES→S3→Lambda, schedule triggers, STS roles (least-privilege per adapter), Secrets Manager for `enum_key`/IMAP creds. SG/Compute alignment. |
| **Designer** | Take the `05` wireframes to visual; the drain button, sequence-gap banner, and not-E2E warning are required states. |
| **Cartographer** | Add SG/Relay as a new node bridging external comms ↔ vault inbox; mark it content-blind. |
| **Librarian** | Catalogue this pack; add SG/Relay (NET-NEW), the adapter set, and the 3a/3b UX to the reality `proposed/` index; cross-reference P-155/P-157, P-166, doc 397, doc 425, sg-workmail. |

## 6. Risks / blockers

| # | Item | Status |
|---|---|---|
| R-1 | Encrypt-on-write (P-155/P-157) is PROPOSED — gates true E2E and P6 | Build P0–P2 against opaque bytes in parallel; do not block routing on it |
| R-2 | `enum_key` provisioning/rotation flow into the relay's secret store | Needs the credential-delivery proposal (doc 397) decided |
| R-3 | Cleartext-from-world cannot be sealed by the relay | Edge sealing in the extension, or explicit not-E2E route flag |
| R-4 | Email deliverability / DKIM/SPF/DMARC for SES outbound | Out of scope — "we are not building email infrastructure" (doc 425); SES owns it |
| R-5 | Naming / service ownership boundary vs SG/Compute and sg-workmail | D-0 + a one-line ownership note from the project lead |
