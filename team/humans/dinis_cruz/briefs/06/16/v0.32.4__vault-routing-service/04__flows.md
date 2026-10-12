# 04 — Flows: sequence and topology diagrams

**version** v0.32.4 · **date** 6 June 2026 · **from** Architect · **type** Implementation briefing (flows / ASCII)

Every flow below is content-blind at the relay. Where a step decrypts, it is explicitly a
*client* step (holds read access), never the relay.

---

## 1. Inbound — external → vault (no vault secret)

A sender (or the world, via SES) wants to deliver a message into a recipient vault. The relay
holds the recipient's **public** `append_token` and the comms credential. It never reads.

```
 SENDER CLIENT            SG/RELAY (inbound)               SG/API VAULT INBOX
 (seals to recip pubkey)  (append_token = H(pubkey))       (oblivious)
      │                          │                                │
      │  deliver(sealed .eml,    │                                │
      │          seq, msg_id) ──▶│                                │
      │                          │ 1. RESOLVE route → vault sink  │
      │                          │ 2. DEDUP seq? new → continue   │
      │                          │ 3. CAP size ≤ 5MB              │
      │                          │ 4. POST /vault/append/{vid}/   │
      │                          │        {append_token}          │
      │                          │        body: sealed bytes ─────▶│ store inbox/{token}/
      │                          │                                │   {epoch_ms}_{rand}.enc
      │                          │◀──── 200 { ok:true } ──────────│ (server names file;
      │                          │       (no file id)             │  returns nothing else)
      │                          │ 5. ack source (delete S3 obj)  │
      │◀── accepted ─────────────│                                │
      │                          │                                │
              if inbox full → 507 ─┐
                                   └─▶ relay backs off, retries (4) later
```

Notes: append-blindness intact — neither sender nor relay learns the filename. The relay's
only durable change is advancing its source cursor / deleting the consumed S3 object.

## 2. Recipient drains the inbox into the `mail/` tree (the store)

The inbox is **transit**, not storage. The recipient (holding `enum_key` + private key)
drains it into its own email-fs `mail/` tree, which is the system of record.

```
 RECIPIENT DRAIN CLIENT                 SG/API VAULT INBOX
 (enum_key + private key — local)       (oblivious)
      │                                       │
      │ POST /vault/inbox/{vid}               │
      │   x-sgraph-enum-key: <enum_key>       │
      │   { include_content:true,             │
      │     after_file_id:<cursor>, limit }──▶│ list inbox/{token}/* after cursor
      │◀── entries[ {file_id, content...} ] ──│ (content = sealed bytes; truncated flag)
      │                                       │
      │ for each entry:                       │
      │   decrypt(content, private_key) ───┐  │   ← CLIENT-SIDE decrypt (relay never does this)
      │   verify seq (gap/reorder/dupe)    │  │
      │   write mail/{from}/.eml + sidecar │  │   ← system of record lands here
      │                                    ▼  │
      │ POST /vault/inbox/{vid}/mark-processed │
      │   { inbox:<token>, file_ids:[...] } ──▶│ move inbox/.../X → processed/.../X
      │◀── ok ────────────────────────────────│ (reversible; only write_key purges)
      │                                       │
      │ advance cursor = last file_id         │
```

The drain client can be: the vault web app (browser, holds read key in session), the sgit CLI,
or the chrome extension (`05`). It is **not** the relay — it holds read access; the relay must
not.

## 3. Outbound — vault → external (drain client + relay)

For vault→world (e.g. send a real email out), the **drain client decrypts** and hands a
cleartext `.eml` to the relay's SES sink. The relay still never holds a read key.

```
 DRAIN CLIENT (read access)      SG/RELAY (outbound)          SES / external
      │                               │                            │
      │ drain outbox inbox folder     │                            │
      │ decrypt → cleartext .eml      │                            │
      │ POST relay /enqueue           │                            │
      │   { eml, to, route } ────────▶│ RESOLVE → SES__Outbound     │
      │                               │ send(.eml) ────────────────▶│ SES sendRawEmail
      │                               │◀──── 200 messageId ─────────│
      │                               │ ack (mark-processed source) │
      │◀── sent ──────────────────────│                            │
```

Boundary restated: confidentiality lives between *clients*. The relay sees cleartext here only
because the drain client (which legitimately holds read access) chose to emit a real email to
the world. The relay does not decrypt; it transports what it is handed.

## 4. The parent/child topology (the 06/03 forcing function)

One admin/comms vault (parent) ↔ N user vaults (children), bidirectional. The relay is the
single bridge; each leg uses the credential the direction requires.

```
                         ┌───────────────────────────┐
                         │     ADMIN / COMMS VAULT    │
                         │         (parent)           │
                         │  inbox/{H(parent_pub)}/    │
                         └───────────────────────────┘
                            ▲  append (child→parent)   │ drain (parent reads)
        child sealed bytes  │                          ▼
                         ┌───────────────────────────┐
                         │         SG/RELAY           │
                         │  • append_token per child  │  (public — inbound, no secret)
                         │  • enum_key per inbox it    │  (secret — outbound/drain)
                         │    drains                   │
                         └───────────────────────────┘
              append (parent→child) │        ▲ drain (child reads its own)
                                    ▼        │
   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
   │ USER VAULT 1 │   │ USER VAULT 2 │   │ USER VAULT N │   (children)
   │ inbox/{H(u1)}│   │ inbox/{H(u2)}│   │ inbox/{H(uN)}│
   └──────────────┘   └──────────────┘   └──────────────┘
```

- **Child → parent:** child seals to the parent's public key, appends to the parent inbox via
  the relay (or directly — the relay is only needed to bridge an external channel; vault→vault
  can append straight to SG/API). Routing address = `H(parent_pub)`, public.
- **Parent → child:** parent seals to child `i`'s public key, appends to that child's inbox.
- **Each side drains its own inbox** with its own `enum_key`. The relay holds `enum_key` only
  for inboxes it is asked to bridge to an *external* channel; pure vault↔vault needs no relay
  drain at all.
- **Token cardinality (D-1 in the v0.32.1 pack):** one `append_anchor` per child gives
  per-correspondent revocation (drop one list entry). Recommended for the rollout.

## 5. Dedup / sequencing (the blind-relay integrity story)

```
 sending client            relay (blind)             recipient (after decrypt)
   seq=7 ──────────────────▶ route(seq=7) ─────────────▶ store; last_seen=7
   seq=8 ──────────────────▶ route(seq=8) ─────────────▶ store; last_seen=8
   seq=8 (retry/dup) ──────▶ DEDUP seq=8 seen → DROP     (never reaches recipient twice)
   seq=10 ─────────────────▶ route(seq=10) ────────────▶ store; GAP (9 missing) → flag
```

- Relay dedup is best-effort (cursor of seen `seq` per source). It catches transport dupes.
- The **authoritative** check is at the recipient after decrypt: gaps (dropped/delayed),
  reorder (seq < last), dupes (seq already seen → idempotent drop). `epoch_ms` filenames give
  best-effort transport ordering; the in-payload counter gives verifiable completeness.

## 6. Retry / failure / dead-letter

```
   dispatch ──▶ sink.send()
                  │
        ┌─────────┼───────────────┬───────────────────────┐
        ▼         ▼               ▼                       ▼
   ok=true    transient        permanent              vault 507 (full)
   → ack      (ok=false,       (ok=false,             → transient:
     source    permanent=false) permanent=true)         back off, retry
              → retry w/        → dead-letter           later (cap pressure
                backoff           queue + alert;          eases as owner
                (n attempts)      do NOT ack source       drains/purges)
                                  (preserve for replay)
```

- **Never ack the source on permanent failure** — keep the message for replay/inspection.
- **Dead-letter carries envelope metadata only**, never payload bytes (`03` §5.1).
- **507 is not a failure**, it is back-pressure: the recipient inbox is full; retry after the
  owner drains. The relay must distinguish `507` (retry) from `403`/`413` (permanent).
