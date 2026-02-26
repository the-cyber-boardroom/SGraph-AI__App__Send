# Dev Brief: Password Generator Tool — Create and Store Passwords in the Vault

**version** v0.6.30  
**date** 25 Feb 2026  
**from** Human (project lead)  
**to** Developer (lead), Designer  
**type** Dev brief — new tool, immediate implementation  

---

## The Concept

A tool at `send.sgraph.ai/tools/password-generator` that generates cryptographically strong passwords in the browser and stores them directly in the user's encrypted vault. Same pattern as the SSH keygen and PGP keygen tools — standalone, client-side, zero server involvement.

This serves two purposes simultaneously:

| Purpose | Value |
|---|---|
| **Utility** | A fast, no-friction way to generate strong passwords. No account needed. Works immediately. Replaces the dozens of password-generator websites users currently visit — most of which are ad-laden, poorly maintained, and of unknown trustworthiness. |
| **Vault adoption** | Every password saved goes directly into the SG/Send vault. This is the most natural on-ramp to vault usage — users who would never think to store documents in an encrypted vault will happily save passwords in one. |

The tool is independently useful. Vault storage is the compelling upgrade. The combination is a DRU driver.

---

## Where We Beat the Incumbents

LastPass, Bitwarden, and 1Password all offer password generators. Ours should be noticeably better in ways that matter. LastPass's generator reveals the gaps clearly:

| Dimension | LastPass (and most incumbents) | SG/Send |
|---|---|---|
| **Account required** | Yes — you must sign up to save | No — generate and copy with zero account. Save to vault when you're ready. |
| **Tracking** | Cookies banner on the generator page itself. GA, analytics, marketing pixels present. | Zero cookies. Zero tracking. The transparency panel proves it. |
| **Vault encryption model** | Keys held by LastPass. The 2022 breach exposed encrypted vaults — when their key management fails, your passwords are at risk. | Keys held by you. Server stores a blob it cannot read. A full server breach exposes nothing. |
| **Entropy display** | "Strong" label — vague, non-technical, not actionable | Entropy in bits — honest, educational, verifiable |
| **Strength indicator** | Green bar + a word. Looks good, means little. | Bits of entropy displayed. Users learn what strong actually means. |
| **Open source** | No — you trust their implementation | Yes — the generation code is auditable. `crypto.getRandomValues()`, rejection sampling, no `Math.random()`. |
| **Share a password** | Copy → paste into email/Slack (insecure) | One-time secret link built in — generate, save, share securely in one flow |
| **Passphrase mode** | Not prominently featured | First-class: EFF large wordlist, configurable separator, entropy shown |
| **Cross-device sync** | Via LastPass cloud (they hold the keys) | Via your vault, your keys — or browser credential sync for the key itself |
| **Ambiguous characters** | Not present in the standard generator | Explicit toggle — no more confusion between O/0, l/1/\| |

### The Headline Differentiator

LastPass had a major breach in 2022. Attackers stole encrypted password vaults. The encryption was only as strong as LastPass's key management — which failed. Users who trusted "your passwords are encrypted" discovered that "encrypted by us" and "encrypted by you" are completely different security properties.

SG/Send's vault is encrypted with keys that never leave the user's browser. A complete breach of our infrastructure — servers, databases, backups, logs — exposes zero plaintext passwords. This is not a marketing claim. It is a verifiable architectural property. The code is public. The key never touches the server.

### What the Generator Page Should Say

Not aggressively, but accurately:

> "Generated in your browser. Stored in your encrypted vault. The server never sees your passwords — not even encrypted. Your key never leaves your device."

One paragraph. No asterisks. No "we take security seriously." Just the verifiable fact.

---

## The Tool: Password Generator

### Generator UI

```
🔐 Password Generator

  ── Options ──────────────────────────────────────────

  Length:   [16  ▲▼]   (min: 8, max: 128)

  Include:
    [✓] Uppercase  (A-Z)
    [✓] Lowercase  (a-z)
    [✓] Numbers    (0-9)
    [✓] Symbols    (!@#$%^&*...)
    [ ] Exclude ambiguous characters  (O, 0, l, 1, |)

  ── Generated Password ───────────────────────────────

  ┌────────────────────────────────────────────────────┐
  │  kR7#mP2$vX9@nQ4!                                  │
  │                                          [↺ Again] │
  └────────────────────────────────────────────────────┘
  
  Strength: ████████████████ Very Strong (entropy: 104 bits)

  [Copy]    [Save to Vault]

  ── Passphrase Mode ──────────────────────────────────

  [ ] Generate passphrase instead  (e.g. correct-horse-battery-staple)

  Word count: [4 ▲▼]    Separator: [ -  ]

  Words from: [EFF Large Wordlist (7,776 words) ▼]
```

### Generation

All generation uses the **Web Crypto API** (`crypto.getRandomValues()`). No `Math.random()`. No server calls. The entropy is local and cryptographically sound.

| Mode | Approach | Notes |
|---|---|---|
| **Random characters** | Draw from character pool using rejection sampling (avoids modulo bias) | Standard approach. Rejection sampling ensures uniform distribution. |
| **Passphrase** | Pick words uniformly from the EFF large wordlist | EFF large wordlist ships with the tool. No network call to fetch words. |

**Strength display**: show estimated bits of entropy, not just a colour bar. A password is strong when the entropy is high — not because it contains a symbol. Display the number so users learn what "strong" actually means.

### Entropy Display

```
Length 8, lowercase only:   entropy ~37 bits   ⚠️ Weak
Length 12, mixed case:       entropy ~68 bits   ⚠️ Fair
Length 16, full charset:     entropy ~104 bits  ✅ Very Strong
4 words, EFF list:           entropy ~51 bits   ✅ Strong (for passphrases)
6 words, EFF list:           entropy ~77 bits   ✅ Very Strong
```

---

## Save to Vault

### The Flow

```
User generates password
User clicks [Save to Vault]

  ┌──────────────────────────────────────────────┐
  │  Save to Vault                               │
  │                                              │
  │  Label:    [ Gmail — work account      ]     │
  │  Username: [ alice@example.com          ]     │
  │  URL:      [ https://mail.google.com    ]     │
  │  Notes:    [                            ]     │
  │                                              │
  │  Password: kR7#mP2$vX9@nQ4!            [👁️]  │
  │                                              │
  │                      [Cancel]  [Save]        │
  └──────────────────────────────────────────────┘

Saved. The vault entry is encrypted with the user's private key.
The server stores a blob it cannot read.
```

### Vault Entry Structure

Each saved password is a vault file with a structured JSON payload:

```json
{
  "type": "password",
  "label": "Gmail — work account",
  "username": "alice@example.com",
  "password": "kR7#mP2$vX9@nQ4!",
  "url": "https://mail.google.com",
  "notes": "",
  "created": "2026-02-25T11:00:00Z",
  "generator_settings": {
    "length": 16,
    "charset": "full",
    "entropy_bits": 104
  }
}
```

The `generator_settings` field is useful context: if the user needs to regenerate a similar password later (or understand what rules they used), the settings are preserved alongside the credential.

### Vault View: Passwords

The vault already shows all file types. Password entries should render with a dedicated display — not as a raw JSON file:

```
🔑 Gmail — work account

  Username:  alice@example.com           [Copy]
  Password:  ••••••••••••••••            [Copy] [👁️ Reveal]
  URL:       mail.google.com             [Open]
  Created:   25 Feb 2026
  Strength:  Very Strong (104 bits)

  [Edit]  [Regenerate]  [Delete]
```

Password masked by default. Reveal on explicit click. Copy without revealing. This is the standard pattern from password managers — users understand it immediately.

---

## Existing Passwords: Import

Users who already have passwords stored elsewhere should be able to bring them in. Import is not the priority for this brief (generate-and-save is the MVP), but the vault structure must not make import impossible later.

The `type: "password"` schema above is compatible with standard export formats:

| Source | Export Format | Import Path |
|---|---|---|
| **1Password** | 1PIF / CSV | Parse → vault entries |
| **Bitwarden** | JSON / CSV | Parse → vault entries |
| **LastPass** | CSV | Parse → vault entries |
| **KeePass** | KDBX / CSV | Parse → vault entries |
| **Browser passwords** | CSV (Chrome, Firefox, Safari) | Parse → vault entries |

Import can be a follow-on brief. Flag it here so the schema doesn't drift from compatibility.

---

## Why This Is a Good On-Ramp

The vault today holds arbitrary files. That's powerful but abstract. Most users don't have an immediate reason to store an encrypted document — but virtually every user has passwords they need to manage. Password storage is the most relatable encrypted-vault use case that exists.

The generator tool makes vault adoption frictionless:

```
Without the tool:
  User thinks: "I should store my passwords more securely."
  User searches for a password manager.
  User evaluates options.
  User never gets around to it.

With the tool:
  User needs a new password.
  User visits send.sgraph.ai/tools/password-generator.
  User generates a password.
  User clicks [Save to Vault].
  User has an encrypted password vault.
  
  This took 30 seconds.
```

The DRU implication: every password generated and saved is a vault usage event. Every vault usage event is a reason for the user to return to SG/Send.

---

## Connection to Existing Architecture

| Document | Connection |
|---|---|
| **Browser Storage Viewer** (v0.6.30) | Password vault entries appear in the storage viewer. Users can inspect and export their stored passwords alongside keys and other vault data. |
| **Key Portability** (v0.6.14) | The same import/export mechanisms (drag-and-drop, password manager autofill) that work for keys work for vault contents. |
| **Zero Lock-In** (v0.6.14) | Vault contents are exportable as standard JSON. Users are never trapped. The "without SG/Send" path: any password manager that imports CSV or JSON works. |
| **DRU/MRU/ARU** (v0.6.14) | Password generation and vault storage are direct usage events. The tool drives return visits: users come back each time they need a new password. |
| **URL Architecture** (v0.6.30) | Tool lives at `/{locale}/tools/password-generator`. Static page served from S3/CloudFront, no Lambda involvement. |
| **One-Time Secret Link** (v0.6.30) | A generated password can be shared via a one-time secret link (e.g., sharing a credential with a colleague). The two tools complement each other. |

---

## Acceptance Criteria

| # | Criterion |
|---|---|
| 1 | Tool available at `send.sgraph.ai/tools/password-generator` |
| 2 | Random character password generation using `crypto.getRandomValues()` (no `Math.random()`) |
| 3 | Configurable: length (8-128), character sets (upper, lower, digits, symbols), exclude ambiguous |
| 4 | Passphrase mode: EFF large wordlist, configurable word count and separator |
| 5 | Entropy displayed in bits (not just a colour bar) |
| 6 | [Copy] button: copies to clipboard without requiring manual selection |
| 7 | [Save to Vault]: label, username, URL, notes, saves as encrypted vault entry |
| 8 | Vault renders password entries with dedicated UI (masked password, copy, reveal, open URL) |
| 9 | Password never sent to server in cleartext |
| 10 | Works without a vault/account (generate + copy only, no save) |
| 11 | Works on mobile (Android Chrome, iOS Safari) |
| 12 | Vault entry schema compatible with future import from 1Password, Bitwarden, browser CSV exports |

---

This document is released under the Creative Commons Attribution 4.0 International licence (CC BY 4.0). You are free to share and adapt this material for any purpose, including commercially, as long as you give appropriate credit.
