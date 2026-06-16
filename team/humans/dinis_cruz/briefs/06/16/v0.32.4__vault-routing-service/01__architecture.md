# 01 — Architecture: the content-blind routing core

**version** v0.32.4 · **date** 6 June 2026 · **from** Architect · **type** Implementation briefing (architecture)

This is the **why** and the **how** at the system level. SG/Relay is a **separate service**
(its own repo, its own deploy), not a module inside `sgraph_ai_app_send`. It is a *client* of
the User Lambda inbox endpoints — it holds capabilities and calls them over HTTPS, exactly as
any other append/drain agent would. The vault codebase does not change.

All service code follows the same stack rules as the rest of the platform: schemas are
`Type_Safe` (never Pydantic), AWS calls go through `osbot-aws` (**never `boto3`** — the
sg-workmail precedent used `boto3` directly; that does not carry forward), the FastAPI app
extends `Serverless__Fast_API`, and tests run the full stack in-memory with no mocks.

---

## 1. Where it sits

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        EXTERNAL COMMS SYSTEMS                                  │
│     SES inbox · IMAP/POP3 · SMS (SNS/Twilio) · SQS · SNS · EventBridge · ...   │
└──────────────────────────────────────────────────────────────────────────────┘
                 │  receive(opaque)             ▲  send(opaque)
                 ▼                              │
┌──────────────────────────────────────────────────────────────────────────────┐
│                              SG/RELAY  (this service)                          │
│                            content-blind · stateless                           │
│   ┌────────────────────┐     ┌──────────────────────┐     ┌────────────────┐  │
│   │  Inbound Adapter   │ ──▶ │   ROUTING CORE       │ ──▶ │ Outbound       │  │
│   │  (external→bytes)  │     │  route · dedup · cap │     │ Adapter        │  │
│   └────────────────────┘     │  retry · seq-check   │     │ (bytes→target) │  │
│                              └──────────────────────┘     └────────────────┘  │
│                              routing config + cursor only                      │
└──────────────────────────────────────────────────────────────────────────────┘
                 │  append_token (write)        ▲  enum_key (drain)
                 ▼                              │
┌──────────────────────────────────────────────────────────────────────────────┐
│                       SG/API — VAULT INBOX  (shipped, oblivious)               │
│   POST /vault/append/{vault_id}/{append_token}      ← write-blind, token-gated │
│   POST /vault/inbox/{vault_id}                       ← list/fetch, enum-gated   │
│   POST /vault/inbox/{vault_id}/mark-processed        ← enum-gated               │
│   POST /vault/inbox/{vault_id}/purge                 ← write_key-gated          │
│        inbox/{append_token}/{epoch_ms}_{rand}.enc  →  processed/{...}           │
└──────────────────────────────────────────────────────────────────────────────┘
                 │  Storage_FS (memory │ disk │ S3)
                 ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│              ENCRYPTED CONTENT-ADDRESSED STORE (S3 in prod)                     │
└──────────────────────────────────────────────────────────────────────────────┘
```

**The vault inbox is just another adapter target.** It appears at the bottom only because it
is *our* transport; structurally it is symmetric with the external systems at the top. The
core does not know "vault" — it knows "a destination adapter that can `send` opaque bytes" and
"a source adapter that can `receive` opaque bytes."

## 2. The core does exactly four things

```
                    ┌─────────────────────────────────────────┐
   receive(bytes,   │             ROUTING CORE                 │
   envelope) ─────▶ │                                          │
                    │  1. RESOLVE   route(src) → [dst, ...]     │
                    │  2. DEDUP     seen(seq)? → drop           │
                    │  3. CAP       size / rate / inbox-full    │
                    │  4. DISPATCH  dst.send(bytes)  (+ retry)  │
                    │                                          │
                    └─────────────────────────────────────────┘
```

1. **Resolve** — map a source identity to one or more destinations from routing config.
   A route is `(source_adapter, match) → [destination_adapter, ...]`. Fan-out is N entries.
2. **Dedup / sequence** — read the **in-payload monotonic sequence number** (set by the
   sending client *inside* the ciphertext envelope's cleartext header — see `02` §envelope).
   The relay cannot read content but *can* read the envelope header it is handed. A seq it has
   already routed → idempotent drop. A gap → log + (optionally) flag; never block.
3. **Cap** — enforce payload size (vault `APPEND_MAX_PAYLOAD` = 5 MB), per-inbox file count
   (`INBOX_MAX_FILES` = 1000), and the relay's own per-source rate limit. On vault capacity
   the append endpoint returns `507`; the relay backs off and retries (`04`).
4. **Dispatch** — call `destination.send(bytes)`. On transient failure, retry with backoff;
   on permanent failure, dead-letter. The relay is **at-least-once**; idempotency comes from
   the in-payload seq, not from the transport.

That is the whole core. Everything channel-specific lives in adapters.

## 3. Ports and adapters (hexagonal)

```
                       ┌───────────────────────────────┐
                       │          ROUTING CORE         │
                       │     (no transport knowledge)  │
                       └───────────────────────────────┘
                          ▲                        ▲
        Source__Adapter   │   (port: receive)      │   (port: send)   Sink__Adapter
        ──────────────────┘                        └──────────────────
   ┌───────────────┐ ┌───────────────┐      ┌───────────────┐ ┌───────────────┐
   │ Vault__Inbox  │ │ SES__Inbound  │      │ Vault__Inbox  │ │ SES__Outbound │
   │  (drain)      │ │ (S3 event)    │      │  (append)     │ │ (SES API)     │
   └───────────────┘ └───────────────┘      └───────────────┘ └───────────────┘
   ┌───────────────┐ ┌───────────────┐      ┌───────────────┐ ┌───────────────┐
   │ IMAP__Inbound │ │ SQS__Inbound  │      │ SMS__Outbound │ │ SNS__Outbound │
   └───────────────┘ └───────────────┘      └───────────────┘ └───────────────┘
```

- **`Source__Adapter`** implements `receive() -> list[Envelope]` (pull/poll) **or** pushes
  envelopes into the core via an event entry point (webhook / S3 trigger / SQS consumer).
- **`Sink__Adapter`** implements `send(Envelope) -> Delivery_Result`.
- **The vault is symmetric**: `Vault__Inbox__Sink` does `append`; `Vault__Inbox__Source` does
  `inbox` (list+fetch) + `mark-processed`. Same adapter family, opposite direction.

The port contract is in `02`. The point of the hexagon: **adding SMS or a queue is a new
adapter class and a routing-config entry — zero core changes.** That is your "could also work
with queues and event systems," expressed structurally.

## 4. Dependency direction

```
   adapters  ──depend on──▶  core ports (abstract)
   core      ──depends on──▶  nothing channel-specific
   core      ──depends on──▶  Envelope (Type_Safe schema)  ◀── adapters also depend on this
```

Dependencies point **inward**. The core defines the `Source__Adapter` / `Sink__Adapter`
ports and the `Envelope` schema; adapters implement the ports. The core never imports `osbot-aws`,
an SMTP lib, or the vault HTTP client — those live in adapter packages. This is what lets the
core be tested entirely in-memory (a `Memory__Source` / `Memory__Sink` pair) with no mocks,
mirroring how the vault tests run on `Storage_FS__Memory`.

## 5. The Envelope (the one shared schema)

The core routes `Envelope`s, not raw bytes. The envelope is a thin, **content-blind** wrapper:
the relay reads only routing metadata; the `payload` is opaque ciphertext it never opens.

```python
class Envelope(Type_Safe):
    source        : Safe_Str__Id      # which source adapter / route key produced this
    seq           : int               # in-payload monotonic per-sender counter (dedup/ordering)
    message_id    : Safe_Str__Id      # stable id across the hop (RFC-2822 Message-ID for email)
    received_at   : Timestamp_Now
    payload       : bytes             # OPAQUE ciphertext — relay never inspects or decrypts
    routing_hint  : Safe_Str          # e.g. destination append_token (= H(pubkey)); non-secret
```

- `seq` and `message_id` are populated by the **sending client** (or by the inbound adapter
  reading them from the channel, e.g. an email `Message-ID`). They sit in the envelope header,
  **outside** the encrypted body — readable by the relay, which needs them to dedup and order,
  but carrying no content.
- `routing_hint` for the vault sink is the destination `append_token`. It is **non-secret**
  by construction (`H(pubkey)`), so it is safe to carry through an external transport.
- `payload` is whatever the source handed over. For the email adapter it is a sealed-box of
  the `.eml`; for an SMS adapter it is a sealed-box of the message text. The relay does not
  know or care.

## 6. Crux 1, resolved by this shape

Earlier the open question was: email-fs-lite delivers via a *mailroom* with sender-known ULID
filenames, but the inbox *hides* filenames (append-blindness). The relay dissolves it:

- **The inbox IS the mailroom** (transport). The relay appends into it; the server names the
  file; append-blindness holds unchanged.
- **email-fs's `Message-ID` and ordering move into the `Envelope` header** (and, end-to-end,
  inside the encrypted payload as the in-payload seq). The recipient's drain client reads the
  envelope/seq to reconstruct threads when it populates the `mail/` tree.

So email-fs-lite becomes the **payload schema of one adapter**, not the architecture of the
service. The service is schema-agnostic; email is `D-1`'s first instance.

## 7. What this is NOT

- **Not a message store.** The relay holds routing config + a dedup cursor. The store is the
  recipient vault's `mail/` tree (`04`).
- **Not a queue.** It can *consume from* and *produce to* queues via adapters, but the core is
  a router, not a broker with its own durable queue. (If you want durability between legs, that
  is an SQS adapter on both sides — config, not core.)
- **Not a crypto component.** No keys, no decryption. The sealed-box layer is on the clients.
- **Not part of the vault.** Separate service; the vault never learns a mailbox exists.
