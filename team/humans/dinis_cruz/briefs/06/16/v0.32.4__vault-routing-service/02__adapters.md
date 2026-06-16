# 02 — Adapters: the port contract and the channel implementations

**version** v0.32.4 · **date** 6 June 2026 · **from** Architect · **type** Implementation briefing (adapters / technical)

This is the **what**. Every channel — including the vault — is an adapter behind two ports.
Adapters are the only place transport-specific code (HTTP to the inbox endpoints, `osbot-aws`
SES/SQS/SNS clients, an IMAP library) is allowed to live. The core imports none of it.

---

## 1. The port contract (`Type_Safe`)

```python
class Delivery_Result(Type_Safe):
    ok          : bool
    permanent   : bool            # true → do not retry (dead-letter); false → transient, retry
    detail      : Safe_Str        # log/dead-letter context only — never content

class Source__Adapter(Type_Safe):                 # produces envelopes into the core
    name        : Safe_Str__Id

    def receive(self, cursor: Safe_Str = None) -> list:   # -> list[Envelope]; pull/poll model
        ...
    def ack(self, envelope) -> Delivery_Result:           # mark consumed at the source
        ...

class Sink__Adapter(Type_Safe):                   # consumes envelopes from the core
    name        : Safe_Str__Id

    def send(self, envelope) -> Delivery_Result:          # deliver one envelope to the channel
        ...
```

- **Pull sources** implement `receive()` (poll IMAP, drain a vault inbox, read SQS).
- **Push sources** (SES→S3 event, a webhook) do not poll; their entry point constructs an
  `Envelope` and calls the core's `route(envelope)` directly. They still implement `ack()` so
  the trigger source (S3 object, SQS message) can be deleted/acked after successful routing.
- `send` is **idempotent at the channel where possible**, but the *system's* idempotency
  guarantee is the in-payload `seq` (`01` §2), not the transport. Adapters may be at-least-once.
- **No adapter ever returns content in `detail`.** Errors carry transport status only.

## 2. The vault-inbox adapter (reference implementation)

This is the adapter that wraps the **shipped** SG/API inbox. It is two classes, one per
direction, sharing an HTTP client. It is the canonical example every other adapter mirrors.

### 2.1 `Vault__Inbox__Sink` — append (inbound leg: external → vault)

Holds the destination's **`append_token`** (`= H(recipient_public_key)`, non-secret). Maps
`send` onto the shipped append endpoint:

```
POST /vault/append/{vault_id}/{append_token}
body: { "payload": <opaque ciphertext bytes> }
→ 200 { "ok": true }            accepted (no file id returned — append-blind)
→ 403                            H(token) ∉ append_anchors
→ 413                            payload > APPEND_MAX_PAYLOAD (5 MB)
→ 507                            inbox at capacity (INBOX_MAX_FILES = 1000) → back off, retry
```

```python
class Vault__Inbox__Sink(Sink__Adapter):
    vault_url     : Safe_Str
    vault_id      : Safe_Str__Id
    append_token  : Safe_Str__Vault__Append_Token     # H(pubkey) — NOT a secret

    def send(self, envelope) -> Delivery_Result:
        # POST envelope.payload to the append endpoint; map status → Delivery_Result
        # 507 → ok=False, permanent=False (retry);  413/403 → ok=False, permanent=True
        ...
```

- **No vault secret required.** The token is public. A compromised inbound relay can only
  write encrypted-to-recipient bytes — the principle-3 property from `00`.
- The sink never sets the filename; the server assigns `{epoch_ms}_{rand_hex}.enc`. The relay
  does not learn it. Append-blindness is preserved end to end.

### 2.2 `Vault__Inbox__Source` — drain (outbound leg: vault → external)

Holds the source vault's **`enum_key`** (the one real vault-side secret; inbox-drain only).
Maps `receive` + `ack` onto the shipped list / fetch / mark-processed endpoints:

```
POST /vault/inbox/{vault_id}                    header: x-sgraph-enum-key: <enum_key>
body: { "include_content": true, "after_file_id": <cursor>, "limit": 200 }
→ 200 { "entries": [ {inbox, file_id, size, received, content}, ... ], "truncated": bool }
→ 403                                            H(enum_key) ≠ enum_key_hash

POST /vault/inbox/{vault_id}/mark-processed     header: x-sgraph-enum-key
body: { "inbox": <append_token>, "file_ids": [ ... up to 100 ... ] }
→ moves inbox/.../X → processed/.../X  (reversible; not a delete)
```

```python
class Vault__Inbox__Source(Source__Adapter):
    vault_url   : Safe_Str
    vault_id    : Safe_Str__Id
    enum_key    : Safe_Str          # HKDF(read_key,'sg-vault-v1:inbox-enum-key') — SECRET, drain-only
    cursor      : Safe_Str          # last file_id processed (lexical == chronological)

    def receive(self, cursor=None) -> list:
        # POST /vault/inbox with include_content + after_file_id=cursor + limit
        # each entry → Envelope(payload=entry.content, message_id=entry.file_id, ...)
        # advance cursor to the last file_id; honour `truncated` for paging
        ...

    def ack(self, envelope) -> Delivery_Result:
        # POST mark-processed for envelope.message_id (batched up to INBOX_BATCH_MAX_FILE_IDS=100)
        ...
```

- **Cursor paging works because filenames are fixed-width `epoch_ms`** → lexical sort equals
  chronological sort. The source pages with `after_file_id` and stops on `truncated == false`.
- **`mark-processed` is the ack** — it moves the file to `processed/`, reversibly. Only the
  vault owner's `write_key` can `purge`. So a misbehaving relay can move things to processed
  but never destroy them; the owner retains recovery.
- **Drains only what it holds the key for.** `enum_key` is per-vault; the relay sees only the
  inboxes it was provisioned for. This is the outbound blast-radius bound (`03`).

## 3. External adapters (instances — build per `D-3`)

All AWS adapters use **`osbot-aws`**, never `boto3`.

### 3.1 SES inbound — `SES__Inbound` (push)
SES receipt rule → S3 drop → S3 event → relay entry point. The adapter reads the raw `.eml`
from S3, wraps it as `Envelope(payload=<sealed-box of eml>, message_id=<RFC-2822 Message-ID>,
seq=<from header or assigned>, routing_hint=<dest append_token>)`, calls `core.route(...)`,
then `ack` deletes the S3 object. **No always-on receiver** — runs only on the S3 event.

> Encryption note: on inbound, the relay receives an already-sealed payload from the sending
> client *or* a cleartext `.eml` from SES. If the latter (a real-world sender with no PKI), the
> relay cannot seal it (it has no recipient private key and must not hold read keys). For
> cleartext-from-the-world, sealing must happen at an **edge client** the recipient trusts
> (the chrome extension, `05`), or the route is explicitly marked "transport-encrypted only,
> not E2E" in config. Do not let the relay silently downgrade. State it in the route.

### 3.2 SES outbound — `SES__Outbound` (sink)
`send` calls the SES send API (`osbot-aws`) with the `.eml` recovered by the *drain client*
after decryption. Note the boundary: the relay carries ciphertext; the **decrypt-then-resend**
for a vault→world email happens in the drain client that holds the vault's read key, which
then hands the cleartext `.eml` to this sink. The relay proper still never decrypts; the drain
client is a *separate* trusted component co-located with the recipient (`04` §outbound).

### 3.3 IMAP/POP3 inbound — `IMAP__Inbound` (pull)
Polls every N minutes (scheduled invocation). `receive` fetches new messages since the stored
UID cursor; `ack` marks them seen/moves them. Ephemeral compute, schedule-triggered.

### 3.4 SMS — `SMS__Outbound` / `SMS__Inbound`
Outbound via SNS publish (or Twilio API). Inbound via SNS subscription → webhook entry point.
Demonstrates the channel-agnosticism: an SMS body is just `payload` bytes with a different
schema; the core is unchanged.

### 3.5 Queue / event adapters — `SQS__*`, `SNS__*`, `EventBridge__*`
`SQS__Source.receive` long-polls a queue; `ack` deletes the message. `SNS__Sink.send`
publishes. `EventBridge__Sink.send` puts an event. These exist to show the model carries
**events**, not just messages — your "all sorts of comms/events." A vault append event can
fan out to an EventBridge bus for downstream automation, with the relay as the only bridge.

## 4. Adapter test obligations (no mocks)

- **Core in isolation** — `Memory__Source` + `Memory__Sink` pair; assert routing, dedup
  (replayed `seq` dropped), fan-out, capacity back-off. Runs in-memory, ~100 ms.
- **Vault adapter** — against an in-memory `Service__Vault__Inbox` instance (same pattern the
  vault's own 957 tests use); plus a LocalStack-S3 leg so the S3 `folder__folders` path
  (the B-1 class of bug) cannot hide behind the memory backend.
- **SES/SQS/SNS adapters** — LocalStack. **IMAP** — a real test server (greenmail or similar).
- **Cross-direction round-trip** — append via `Vault__Inbox__Sink`, drain via
  `Vault__Inbox__Source`, assert envelope equality and cursor advance.
