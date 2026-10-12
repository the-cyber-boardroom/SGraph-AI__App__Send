# 03 — Credentials and the capability model

**version** v0.32.4 · **date** 6 June 2026 · **from** Architect + AppSec · **type** Implementation briefing (security)

This is the **why** behind the security shape. The relay is the component that handles the
most traffic and looks the most trusted. The design goal is that it holds the **least** that
matters: it can move ciphertext, and nothing else. This doc states exactly what it holds, what
that lets a compromised relay do, and how the credentials are delivered.

---

## 1. The two resources, per route, per direction

| | External resource (a) | Vault resource (b) | (b) secret? | Held continuously? |
|---|---|---|---|---|
| **Inbound** (external → vault) | comms credential (SES IAM role / IMAP creds / SMS key) | `append_token = H(recipient_public_key)` | **No** (public) | token: yes, but non-secret |
| **Outbound** (vault → external) | comms credential | `enum_key = HKDF(read_key,'sg-vault-v1:inbox-enum-key')` | **Yes** | yes (drain-only) |

Two facts do the heavy lifting:

1. **`append_token` is not a secret.** It is `H(pubkey)`; anyone with the recipient's public
   key derives it. It gates *write*, never *read*. A leaked token lets an attacker append
   encrypted-to-recipient bytes — garbage to everyone but the recipient. So the **entire
   inbound leg requires no vault secret.**
2. **`enum_key` is one-way and lower-tier than read.** It is an HKDF child of `read_key` with a
   distinct `info` label; it cannot be reversed to `read_key`. It grants list + fetch +
   mark-processed on the inbox **only** — never decryption, never the vault's real content
   tree, never purge.

## 2. Blast radius of a compromised relay

```
                 a compromised relay can ...                  ... and CANNOT
 ┌──────────────────────────────────────────┬──────────────────────────────────────────┐
 │ INBOUND-ONLY relay                        │                                          │
 │  • append ciphertext to inboxes whose     │  • read anything (holds no enum_key)     │
 │    pubkey it knows                        │  • decrypt anything (holds no priv key)  │
 │  • flood an inbox up to INBOX_MAX_FILES   │  • touch the vault's real content tree   │
 │    (availability only; 507 then caps)     │  • purge (needs write_key)               │
 ├──────────────────────────────────────────┼──────────────────────────────────────────┤
 │ BIDIRECTIONAL relay (adds enum_key)       │                                          │
 │  • everything above, plus:                │  • decrypt drained ciphertext            │
 │  • list/fetch ciphertext from the         │    (no private key — that lives inside   │
 │    inboxes it was provisioned for         │    the target vault, under read access)  │
 │  • mark those files processed             │  • read any vault it lacks enum_key for  │
 │  • (cannot purge — reversible only)       │  • reach the real content tree           │
 └──────────────────────────────────────────┴──────────────────────────────────────────┘
```

The worst case for a bidirectional relay is: it can hold or mishandle **ciphertext it cannot
read**, from the **specific inboxes it was keyed for**. It cannot turn that into plaintext and
cannot escalate to the vault. That is the exact capability the four-tier model exists to
bound, and it is why the `enum_key` tier was created in the first place.

## 3. Why the relay never decrypts (and how E2E still holds)

- **Sealed-box on the client.** Encrypt-to-vault (P-155 / P-157, PROPOSED) does X25519 ECDH to
  the recipient's public key → HKDF → AES-256-GCM, framing
  `ephemeral_pubkey || iv || ciphertext || tag`. This runs on the *sending client*.
- **Private key lives inside the target vault**, stored under that vault's own read tree. "Only
  the recipient can decrypt" reduces to "only holders of the target vault's read access can
  load its private key" — a property the vault model already guarantees.
- **The relay holds neither.** It carries the sealed bytes. Confidentiality is independent of
  the relay's integrity. A fully compromised relay is a *traffic* problem (drop/reorder/delay/
  duplicate), never a *confidentiality* problem. The in-payload sequence numbers (`02` envelope,
  `04` dedup) are the integrity mitigation for the traffic vector.

## 4. Credential delivery (no long-lived secrets baked in)

The relay should not carry static AWS keys or a permanently-mounted `enum_key`. Tie into the
proposed credential machinery:

- **AWS side** — STS `AssumeRole`, just-in-time, narrowly-scoped per operation (the dynamic
  credential-delivery proposal, doc 397). The SES/SQS/SNS adapters assume a role scoped to
  exactly the actions they call (`ses:SendRawEmail`, `s3:GetObject` on the receipt bucket,
  `sqs:ReceiveMessage`/`DeleteMessage` on the named queue). Scope catalogue versioned in a
  vault for audit/rollback.
- **Vault side** — `enum_key` for outbound routes provisioned out-of-band into the relay's
  secret store (AWS Secrets Manager or equivalent), **per source vault**, rotatable by the
  owner (rotate `read_key` derivation → `enum_key_hash` in the manifest changes → old key
  fails the gate). `append_token`s need no protection (public) and can sit in plain config.
- **Rotation is cheap on the vault side.** Revoking a relay's drain access = the owner removing
  / rotating the inbox `enum_key_hash`. Revoking append access = removing that `append_anchor`
  from the manifest list (per-correspondent revocation, surgical).

## 5. What the relay must NOT do (AppSec sign-off conditions)

1. **Never log payload bytes**, even truncated, even on error. `Delivery_Result.detail` is
   transport status only.
2. **Never attempt to decrypt**, infer content, or branch routing on payload contents. Routing
   keys off the envelope header (`source`, `routing_hint`), never the body.
3. **Never downgrade silently.** If an inbound message arrives cleartext-from-the-world (no PKI
   sender), the route must be explicitly flagged transport-encrypted-only; the relay must not
   pretend it is E2E. (See `02` §3.1.)
4. **Never hold `read_key` or a private key.** If a route needs decrypt-then-resend
   (vault→world email), that step runs in a *separate* drain client co-located with the
   recipient's read access, not in the relay (`04` §outbound). Keep the two components and
   their credentials disjoint.
5. **Validate identifiers before path use** — the vault already coerces `append_token` /
   `file_id` to traversal-proof forms (B-2 fix); the relay must not reconstruct raw paths or
   pass un-coerced values. Use the endpoints as designed.
6. **At-least-once + idempotent.** Retries are expected; correctness must not depend on
   exactly-once transport. Dedup is the in-payload `seq`.

## 6. Residual risks (carry into the threat model)

| Risk | Severity | Mitigation |
|---|---|---|
| Relay drops/reorders/duplicates ciphertext | Integrity/availability | in-payload monotonic `seq`; recipient detects gaps/reorder/dupes after decrypt |
| Inbound flood to `INBOX_MAX_FILES` | Availability | `507` cap + relay rate-limit per source; owner `purge` recovers |
| `enum_key` leak from relay store | Confidentiality of *that inbox's ciphertext* (still undecryptable) | Secrets Manager + rotation; bound is "ciphertext of provisioned inboxes," never plaintext |
| Cleartext-from-world not E2E | Confidentiality expectation mismatch | explicit route flag; edge-client sealing (chrome ext) for true E2E |
| Comms-credential over-scope | Lateral AWS movement | STS least-privilege per adapter action; versioned scope catalogue |
