# 05 — UX mockups (ASCII wireframes)

**version** v0.32.4 · **date** 6 June 2026 · **from** Architect + Designer · **type** Implementation briefing (UX)

These are **wireframes, not visual design** — they fix layout, state, and the data each surface
binds to, so Dev and Designer share one reference. Two clients render the same underlying
email-fs `mail/` tree: (3a) the **vault-native inbox** (browser / vault web app), and (3b) the
**chrome-extension bridge** to a real webmail inbox. Both decrypt client-side; neither is the
relay.

---

## 1. Vault-native inbox — list view (3a)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  SG/Mail   ·  vault: dinis (parent)                       🔒 read key in session│
├───────────────┬──────────────────────────────────────────────────────────────┤
│  FOLDERS      │   INBOX                                  [ ↻ drain ]  [ compose ]│
│               │  ┌────────────────────────────────────────────────────────────┐│
│  ▸ Inbox  (3) │  │ ●  user-0042   Re: onboarding step 2        seq 12   2m ago ││
│  ▸ Threads    │  │    user-0017   intake form attached         seq  3   1h ago ││
│  ▸ Sent       │  │ ●  user-0091   question about results       seq  1   3h ago ││
│  ▸ Processed  │  │    relay/ses   bounce: user-0033@…          —      yesterday││
│               │  └────────────────────────────────────────────────────────────┘│
│  CORRESPONDS  │   ●  = undrained (still in vault inbox)   plain = drained to mail/│
│   100 children│                                                                  │
│   1 admin     │   ⚠ 1 sequence gap detected on user-0042 (seq 9 missing) — verify │
└───────────────┴──────────────────────────────────────────────────────────────┘
```

- **`●` undrained** rows come straight from `POST /vault/inbox` (still in `inbox/{token}/`);
  plain rows are already in the `mail/` tree. **[↻ drain]** runs the §2 drain loop, decrypts,
  writes to `mail/`, and `mark-processed`.
- **Sequence gap banner** surfaces the `04` §5 recipient-side check. This is a real, vault-
  grounded property a normal mail client cannot offer.
- Folder counts bind to inbox folder enumeration (`folder__folders`, the S3-safe path).

## 2. Thread view

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  ‹ Inbox      Re: onboarding step 2   ·   user-0042 ⇄ dinis        🔒 verified  │
├──────────────────────────────────────────────────────────────────────────────┤
│  user-0042 · seq 9 · 09:14 · Message-ID a1b2…                                   │
│  ┌────────────────────────────────────────────────────────────────────────┐   │
│  │ Hi — I finished step 1 but the link for step 2 expired. Can you resend? │   │
│  └────────────────────────────────────────────────────────────────────────┘   │
│  🔓 decrypted locally · sealed to your vault pubkey · history: v3 in mail/      │
│                                                                                 │
│  dinis (you) · seq 10 · 09:31                                                   │
│  ┌────────────────────────────────────────────────────────────────────────┐   │
│  │ New link below, valid 24h. Reply here if it still fails.               │   │
│  └────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  [ reply ]   [ forward → SES ]   [ view raw .eml ]   [ history (sgit) ]        │
└──────────────────────────────────────────────────────────────────────────────┘
```

- **`[forward → SES]`** is the outbound path (`04` §3): decrypt locally → hand cleartext `.eml`
  to the relay SES sink. The button is the explicit moment content leaves the vault to the
  world — label it so the user knows E2E ends here.
- **`[history (sgit)]`** exposes the versioned `.eml` + sidecar — vault-native provenance.

## 3. Compose

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Compose                                                          [ ✕ ]         │
├──────────────────────────────────────────────────────────────────────────────┤
│  To:   user-0042            🔒 pubkey known → seals E2E to their vault          │
│        ─────────────────────────────────────────────────────────────────────  │
│        (or)  external@gmail.com   ⚠ no vault pubkey → sends via SES, not E2E     │
│  Subj: Re: onboarding step 2                                                    │
│  ┌────────────────────────────────────────────────────────────────────────┐   │
│  │                                                                        │   │
│  │   message body …                                                       │   │
│  │                                                                        │   │
│  └────────────────────────────────────────────────────────────────────────┘   │
│  Route: ⦿ vault append (E2E)   ○ SES (transport-encrypted only)                 │
│                                                                                 │
│                                            [ discard ]   [ send ]               │
└──────────────────────────────────────────────────────────────────────────────┘
```

- The **To: field resolves a vault pubkey** → `append_token = H(pubkey)`; if known, the client
  seals E2E and appends (no relay needed for vault→vault). If the recipient is a plain external
  address, the route flips to SES and the UI **states plainly it is not E2E** (`03` §5.3 — no
  silent downgrade, surfaced in the UI not just config).

## 4. Chrome-extension bridge to a real inbox (3b)

The extension injects into existing webmail (e.g. Gmail) and does the sealing/opening at the
edge, so PKI email flows in and out of an inbox the user already has. The **private key is
loaded into the extension from the user's vault read access**, never to a server.

### 4a. Reading a PKI message that arrived in real webmail

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Gmail  ›  Inbox  ›  [SG] sealed message from user-0042                         │
├──────────────────────────────────────────────────────────────────────────────┤
│  ╭──────────────────────── SG/Relay extension ───────────────────────────╮     │
│  │ 🔒 This message is sealed to your vault.                              │     │
│  │ [ unlock with vault key ]                                            │     │
│  ╰──────────────────────────────────────────────────────────────────────╯     │
│  (raw body shows base64 sealed-box: ephemeral_pubkey||iv||ciphertext||tag)      │
│                                                                                 │
│  — after unlock —                                                               │
│  ╭──────────────────────────────────────────────────────────────────────╮     │
│  │ 🔓 decrypted locally · seq 12 · verified · written to vault mail/      │     │
│  │  Hi — I finished step 1 but the link for step 2 expired …             │     │
│  ╰──────────────────────────────────────────────────────────────────────╯     │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 4b. Composing a PKI message from real webmail

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Gmail  ›  Compose                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│  To: user-0042@sg   ╭── SG ──────────────────────────────────────────────╮     │
│                     │ 🔒 vault pubkey found → will seal before send       │     │
│                     │ Route: vault inbox (append_token = H(pubkey))       │     │
│                     ╰─────────────────────────────────────────────────────╯     │
│  [ type normally ]                                                              │
│  On [Send]: extension seals body → appends to vault inbox via relay;            │
│             Gmail's own send is intercepted/suppressed for SG recipients.       │
└──────────────────────────────────────────────────────────────────────────────┘
```

- The extension is a **client/edge adapter**, not the relay: it holds the user's read access to
  load the private key and seal/open at the edge. It depends on the **PROPOSED** encrypt-on-
  write half (P-157) — this is the dependency `00`/D-2 flags. Build 3a first; 3b lands when the
  sealed-box client crypto is ready.

## 5. Provisioning (admin onboards a child vault)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Admin · onboard correspondent                                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│  1. child generates vault + X25519 keypair (private stays in child vault)       │
│  2. child shares PUBLIC key  ─────────────▶  admin                              │
│  3. admin computes append_token = H(child_pubkey)                               │
│  4. admin adds H(token) to its manifest append_anchors  [ + add anchor ]        │
│  5. relay route created: SES/world → this child inbox (append_token)            │
│                                                                                 │
│  Correspondents (100):  [user-0042 ✓]  [user-0017 ✓]  [user-0091 ✓]  …          │
│  Revoke = remove one anchor (surgical, per-correspondent).   [ revoke ]         │
└──────────────────────────────────────────────────────────────────────────────┘
```

- Only **public** keys move during provisioning. No secret is exchanged for the inbound path.
- Revocation is a one-entry edit to the `append_anchors` list — the per-correspondent blast
  radius from `03`.
