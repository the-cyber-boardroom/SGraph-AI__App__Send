# 03 — Provisioning, the drain loop, and the two topologies

**version** v0.32.1 · **date** 3 June 2026 · **from** Architect · **type** Implementation briefing (flows)

How vaults are wired up to talk, the loop that moves messages, and the two deployment shapes the primitive supports — including why a plain email server can be one of the transports.

---

## 1. Template-vault provisioning

The "very simple link" for the ~100 users is, behind the scenes, a **template vault** wired for communication. Provisioning a child vault:

```
PROVISION(child):
  1. create child vault (existing vault init)
  2. generate child's own X25519 key pair          → private key written INTO the child vault
                                                       (encrypted under the child's read tree)
  3. give the child:
       • PARENT comms vault's PUBLIC key            → to encrypt messages up to the parent
       • PARENT's APPEND TOKEN ( = H(parent pubkey))→ to append those messages to the parent
  4. (parent side) add an append_anchor for the child IF using per-child tokens (D-1)
```

A freshly provisioned child therefore holds exactly: **(parent public key, parent append token, its own keypair)** — enough to send to the parent and to receive replies. Nothing else.

**Reply path bootstrapping.** A child's *first* message carries, inside the encrypted payload, its **own public key** (and, if per-child tokens are used, its append token). The parent, after decrypt, now has everything to reply: encrypt to the child's public key, append via the child's append token. The conversation is self-bootstrapping and fully vault-to-vault.

## 2. The drain loop (the recipient/relay side)

The drainer holds `enum_key` (+ the target's private key when it is the actual recipient). Incremental, idempotent, resumable by cursor:

```
DRAIN(vault, enum_key, private_key):
  cursor = load_last_processed_id()                  # persisted by the drainer
  loop:
    listing = POST /vault/inbox { include_content:true, after_file_id:cursor, limit:N }
    for entry in listing.entries:                    # sorted == chronological
        msg   = SEAL_OPEN(private_key, entry.content) # client-side decrypt (recipient only)
        check_sequence(msg.seq)                        # gap/reorder/dup detection (02 §5)
        commit_into_real_tree(msg)                     # owner write path (write_key)
    POST /vault/inbox/mark-processed { file_ids:[…processed…] }   # reversible move → processed/
    cursor = last(listing.entries).file_id
    if not listing.truncated: break
```

- **`mark-processed` (enum-gated, reversible)** is the loop's cleanup — it does *not* destroy.
- **`purge` (write_key-gated, irreversible)** is a separate, owner-driven housekeeping step over `processed/` — run on a schedule or manually, never inside the hot drain loop.
- A **relay** runs the same loop but **stops after fetch** — it has no private key, does not decrypt, does not commit-to-tree; it re-appends the still-encrypted payload onward (§4) then marks-processed on the shared inbox.

## 3. Topology A — inbox-in-target (prove this first)

The inbox lives inside the recipient's own vault.

```
  SENDER(child)                              RECIPIENT(parent)
    encrypt_to(parent_pubkey, msg)
    POST /vault/append/{parent}/{H(parent_pubkey)}  ─────▶  inbox/{H(parent_pubkey)}/…
                                                            DRAIN(parent, enum_key, parent_priv)
                                                            decrypt → commit → mark-processed
```

Simplest shape; the 2-vault and 5-vault proofs (`04`) run here. One parent, N senders, all writing to the parent's single inbox folder (shared token) or to per-correspondent folders (per-child tokens, D-1).

## 4. Topology B — three-vault blind relay (the strong result)

Separates "where everyone sends" from "where the recipient reads," with a **content-blind relay** between them.

```
   SENDERS                       SHARED INBOX VAULT                 TARGET INBOX VAULT(s)        TARGET VAULT
   encrypt_to(target_pubkey,msg)
   append(H(target_pubkey),ct) ─▶ inbox/{H(target_pubkey)}/…
                                        │
                 RELAY DRAINER          │ enum_key(shared): list + fetch CIPHERTEXT
                 holds: enum_key(shared)│ route by folder name ( = H(target_pubkey) )
                        append_token(each target)
                        NO private key  ▼ append(H(target_pubkey), same ciphertext)
                                                          inbox/{H(target_pubkey)}/… ──▶ recipient
                                                                                         DRAIN with
                                                                                         target_priv
                                        ▲ mark-processed(shared)   (delivery receipt)
```

- The relay **routes by a non-secret address** and **never decrypts** — "can't read contents" is structural (no private key), not a policy it could violate.
- `mark-processed` on the shared inbox doubles as the relay's **delivery receipt**.
- This is the capability inversion: the busiest component holds the least secret.

## 5. Email/SMTP as a transport backend

Because a message is **opaque ciphertext addressed by a non-secret token**, anything that moves blobs by address is a valid transport. A standard MTA can carry it: ciphertext as the body, `H(pubkey)` as (or mapped to) the envelope address; a small bridge dequeues mail and `append`s to the right inbox folder (or vice-versa).

- **Why this matters as a proof, not just a feature:** if a content-blind MTA can relay correctly, there is provably **no hidden place where the transport needs to decrypt**. SG/Send's append surface and an MTA become interchangeable backends.
- **Ship it as a bridge/fallback, not the primary health path** (D-3). Email widens metadata exposure (SMTP envelopes leak to every hop, transit TLS isn't guaranteed hop-to-hop, mail servers log aggressively). Confidentiality still holds end-to-end; metadata does not. See `04`.

## 6. Scale notes (toward 100, then beyond)

- The **parent/shared append surface is the one shared write point.** It is append-only and CAS-addressed, so writes are conflict-free; the cap (`01 §5`) bounds a single rogue token.
- **Per-child tokens (D-1)** give per-correspondent rate accounting and surgical revocation (remove one anchor; the other 99 are unaffected). **Shared token** is simpler to provision but revocation is a re-provisioning event for all children.
- Drain throughput scales by running multiple `enum_key`-holding drainers over disjoint inbox folders, or by sharding senders across multiple shared-inbox vaults — both are pure topology, no new server mechanism.
