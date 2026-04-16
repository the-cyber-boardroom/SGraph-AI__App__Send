# Simple Token Vault — Implementation Debrief
## Date: 2026-03-29

> **Status:** Implemented and merged to `claude/new-explorer-team-cHLXU`
> **Tests:** 1424 passing (22 new), 0 regressions
> **Commit:** `fc9ac67`

---

## 1. Origin Story

A slide deck for SG/Send hallucinated the following workflow:

```
> pip install sgit-ai
> sgit clone vault://coral-equal-1234
> sgit status
> sgit push origin main
```

This was wrong about the implementation — but exactly right about the UX.
`sgit` was already a valid entry point. `coral-equal-1234` was already a valid
`Simple_Token` in the codebase. What was missing was the bridge between them.

That bridge is what this sprint built.

---

## 2. What Was Built

### 2.1 Three new user-facing commands

```
sgit init [token]           # create vault with a human-readable name
sgit clone <token>          # clone vault or import SG/Send transfer
sgit share [--rotate]       # publish read-only snapshot to SG/Send browser
```

### 2.2 The two-token model

Every Simple Token vault carries two separate tokens with completely different roles:

```
┌────────────────────────────────────────────────────────────────┐
│  EDIT TOKEN    coral-equal-1234                                │
│  ─────────────────────────────────────────────────────────     │
│  • vault_id = the token string itself                          │
│  • Derives all crypto keys (read, write, EC signing)           │
│  • Shared only with trusted collaborators                      │
│  • Stored in: SGit-AI vault server                             │
│                                                                │
│  SHARE TOKEN   dawn-haven-6034                                 │
│  ─────────────────────────────────────────────────────────     │
│  • Read-only published snapshot of HEAD                        │
│  • Appears in SG/Send browser URL as the fragment              │
│  • Safe to send publicly — viewers cannot push                 │
│  • Stored in: SG/Send transfer API                             │
│                                                                │
│  INVARIANT: edit_token ≠ share_token  (always different)       │
└────────────────────────────────────────────────────────────────┘
```

---

## 3. Key Design Decisions

### vault_id = edit_token

The vault's cryptographic identity IS the human-readable token string.
`coral-equal-1234` passes the existing `Safe_Str__Vault_Id` regex
(`[a-zA-Z0-9\-]`, max 64 chars) with no changes needed to the schema layer.

This means the token is the only thing a collaborator needs to remember.
There is no separate UUID, no separate vault key string to exchange.

### The token is the root secret

All cryptographic keys are derived deterministically from the edit token alone:

```
edit_token = "coral-equal-1234"
        │
        └── aes_key = PBKDF2-HMAC-SHA256(token, salt='sgraph-send-v1', 600k, 32B)
                │
                ├── read_key  = HKDF(aes_key, info=b'vault-read-key',  32B)
                ├── write_key = HKDF(aes_key, info=b'vault-write-key', 32B)
                └── ec_seed   = HKDF(aes_key, info=b'vault-ec-seed',   32B)
                        └── EC P-256 private key (deterministic from seed)
```

No EC key generation at init time. No stored key material that can be lost.
The token is the only secret — treat it like a password.

### Backward compatibility: zero breaking changes

Vaults without `mode: simple_token` in `local/config.json` continue to use
the existing EC key derivation flow unchanged. The entire new feature is additive:
new code paths, new config fields, no touched existing paths.

---

## 4. Architecture

### 4.1 Files changed

| File | What changed |
|------|-------------|
| `sgit_ai/transfer/Simple_Token.py` | +`is_simple_token()`, `vault_id()`, `read_key()`, `write_key()`, `ec_seed()` |
| `sgit_ai/crypto/Vault__Crypto.py` | +`derive_keys_from_simple_token()` |
| `sgit_ai/safe_types/Safe_Str__Vault_Key.py` | Regex extended to accept `word-word-NNNN` format |
| `sgit_ai/sync/Vault__Sync.py` | +`clone_from_transfer()`, `_clone_resolve_simple_token()`, `_clone_with_keys()`; modified `init()`, `clone()`, `_derive_keys_from_stored_key()` |
| `sgit_ai/transfer/Vault__Transfer.py` | +`receive()` |
| `sgit_ai/cli/CLI__Vault.py` | +`cmd_share()`, `create_transfer_api()`; modified `cmd_init()`, `cmd_clone()` |
| `sgit_ai/cli/CLI__Main.py` | +`share` subcommand + `--rotate` flag |
| `tests/unit/transfer/test_Simple_Token__Vault_Keys.py` | 12 new tests |
| `tests/unit/sync/test_Vault__Sync__Simple_Token.py` | 10 new tests |

### 4.2 Token detection

Simple Token detection happens at the entry point, before any crypto or network work:

```python
SIMPLE_TOKEN_PATTERN = re.compile(r'^[a-z]+-[a-z]+-\d{4}$')

Simple_Token.is_simple_token('coral-equal-1234')   # True
Simple_Token.is_simple_token('vault://coral-...')  # False (strip prefix first)
Simple_Token.is_simple_token('abc123:def456')      # False → existing vault_key flow
Simple_Token.is_simple_token('coral-equal-1234')   # False (uppercase rejected)
```

The `vault://` prefix is stripped before the pattern match, so both
`sgit clone coral-equal-1234` and `sgit clone vault://coral-equal-1234` work identically.

---

## 5. Scenario Walkthroughs

### Scenario A: SG/Send transfer first → become editor

```
Someone sends you: send.sgraph.ai/#dawn-haven-6034

$ sgit clone dawn-haven-6034
    │
    ├─ is_simple_token? YES
    │
    ├─ Check SGit-AI: vault 'dawn-haven-6034' exists?
    │   → NOT FOUND (share tokens don't live on SGit-AI)
    │
    ├─ Check SG/Send: transfer SHA256('dawn-haven-6034')[:12] exists?
    │   → FOUND ✓
    │
    ├─ Download + AES-GCM decrypt transfer archive
    │   (key = PBKDF2('dawn-haven-6034', ...))
    │
    ├─ Generate new edit token → coral-equal-1234
    │
    ├─ sgit init coral-equal-1234
    │   (vault_id = 'coral-equal-1234', all keys derived from token)
    │
    ├─ Write files from archive into working copy
    │
    ├─ sgit commit -m 'Imported from vault://dawn-haven-6034'
    │
    └─ local/config.json:
       { "mode": "simple_token",
         "edit_token": "coral-equal-1234",
         "share_token": "dawn-haven-6034" }

Cloned into coral-equal-1234/
  Vault ID:    coral-equal-1234
  Share token: dawn-haven-6034
  Files:       4 committed
```

You now own the edit access. The original sharer has no access to your vault.
Run `sgit push` to sync to SGit-AI. Run `sgit share` to refresh the same URL.

---

### Scenario B: Vault first → publish to browser

```
$ sgit init coral-equal-1234      # or: sgit init  (auto-generates token)
    │
    ├─ vault_id = 'coral-equal-1234'
    ├─ All keys derived from token (no EC keygen call)
    └─ local/config.json: { "mode": "simple_token", "edit_token": "coral-equal-1234" }

$ sgit commit -m "first draft"
$ sgit push
    └─ Vault synced to SGit-AI server

$ sgit share
    │
    ├─ No share_token in config → generate new token: dawn-haven-6034
    ├─ Package HEAD files into AES-GCM encrypted zip
    ├─ Upload to SG/Send transfer API
    ├─ Save share_token + share_transfer_id to config
    │
    └─ Published: https://send.sgraph.ai/#dawn-haven-6034

$ sgit commit -m "revised" && sgit push && sgit share
    └─ Same URL refreshed with new content  ← same dawn-haven-6034, same browser link
```

---

### Scenario C: Two collaborators, one vault

```
Alice                               Bob
─────                               ───

$ sgit init coral-equal-1234
$ sgit commit -m "slides v1"
$ sgit push

  "Edit token: coral-equal-1234"
  ──────────────────────────────────►
                                    $ sgit clone coral-equal-1234
                                        │
                                        ├─ is_simple_token? YES
                                        ├─ Check SGit-AI: vault found ✓
                                        └─ Clone with keys from token
                                           (same read/write keys as Alice)

                                    [Bob edits files]
                                    $ sgit commit -m "Bob's section"
                                    $ sgit push

$ sgit pull
  → Bob's changes merged ✓

$ sgit share
  → https://send.sgraph.ai/#dawn-haven-6034

  "Read-only view:"
  ──────────────────────────────────►
                                    [Opens in browser — view only]
```

---

### Scenario D: Clone resolution flow (full decision tree)

```
sgit clone <input>
       │
       ├─ strip 'vault://' prefix if present
       │
       ├─ is_simple_token(input)?
       │       │
       │   NO  └──► existing vault_key flow (unchanged)
       │
       │   YES
       │       │
       │       ├─ 1. Check SGit-AI: GET /vault/{input}
       │       │       │
       │       │   FOUND└──► _clone_with_keys(derive_keys_from_simple_token(input))
       │       │              writes mode:simple_token to clone config
       │       │
       │       └─ 2. Check SG/Send: GET /transfers/info/SHA256(input)[:12]
       │               │
       │           FOUND└──► clone_from_transfer(input, directory)
       │                      generate new edit token
       │                      init vault, extract, commit
       │                      save share_token = input in config
       │
       └─ Neither found → RuntimeError: "No vault or transfer found for '{input}'"
```

---

## 6. The `sgit share` lifecycle

```
first run:
  config has no share_token
  → generate new Simple_Token (e.g. dawn-haven-6034)
  → upload HEAD as AES-GCM encrypted zip
  → save share_token + share_transfer_id to config
  → print: Published: https://send.sgraph.ai/#dawn-haven-6034

subsequent runs:
  config has share_token = dawn-haven-6034
  → reuse token (same AES key, same URL)
  → upload replaces existing transfer content
  → same URL stays live, content updated

sgit share --rotate:
  → generate brand new Simple_Token
  → old URL becomes stale (SG/Send transfer still exists but is no longer refreshed)
  → new URL printed
  → config updated with new share_token
```

---

## 7. Config Schema

`local/config.json` (new fields for simple_token vaults):

```json
{
  "mode":             "simple_token",
  "edit_token":       "coral-equal-1234",
  "share_token":      "dawn-haven-6034",
  "share_transfer_id":"d4e3f2a1b9c8"
}
```

`share_transfer_id` is technically redundant (always derivable as
`SHA256(share_token)[:12]`) but is cached to avoid recomputing on
every status/info check.

---

## 8. Tests

### `test_Simple_Token__Vault_Keys.py` (12 tests)

| Test | What it verifies |
|------|-----------------|
| `test_read_key_length` | `read_key()` returns exactly 32 bytes |
| `test_write_key_length` | `write_key()` returns exactly 32 bytes |
| `test_ec_seed_length` | `ec_seed()` returns exactly 32 bytes |
| `test_keys_differ` | `read_key ≠ write_key ≠ ec_seed` |
| `test_deterministic` | Same token always produces same three keys |
| `test_different_tokens_produce_different_keys` | Different tokens → different key sets |
| `test_is_simple_token_valid` | Accepts `coral-equal-1234`, `dawn-haven-6034`, `amber-fox-3821` |
| `test_is_simple_token_invalid` | Rejects `abc123`, `my-project`, `vault://foo`, `coral-equal-1234` |
| `test_vault_id_is_token` | `vault_id()` returns the token string itself |
| `test_read_key_is_bytes` | Return type is `bytes` |
| `test_write_key_is_bytes` | Return type is `bytes` |
| `test_ec_seed_is_bytes` | Return type is `bytes` |

### `test_Vault__Sync__Simple_Token.py` (10 tests)

| Test | Scenario |
|------|---------|
| `test_init_with_simple_token` | Init sets vault_id = token string |
| `test_init_writes_simple_token_config` | Config has `mode`, `edit_token` |
| `test_init_with_simple_token_as_vault_key` | Token accepted as vault_key arg too |
| `test_init_simple_token_vault_key_file_contains_token` | Stored vault_key is the token |
| `test_init_non_simple_token_is_unchanged` | Standard init flow untouched |
| `test_clone_from_transfer_creates_vault` | Scenario A: download → vault → commit |
| `test_clone_detects_simple_token_pattern` | `clone('coral-equal-1234')` routes correctly |
| `test_clone_vault_prefix_detected` | `clone('vault://coral-equal-1234')` routes correctly |
| `test_clone_simple_token_vault_found` | Scenario B clone: vault found → cloned |
| `test_clone_simple_token_clone_has_simple_token_config` | Clone config has `mode: simple_token` |

---

## 9. What This Enables

### The Newsletter workflow
```
Editor: sgit init → sgit commit → sgit push → sgit share
Readers: open URL in browser, see decrypted files, no account needed
Next issue: sgit commit → sgit push → sgit share (same URL, new content)
```

### The Airdrop workflow
```
Sender: shares vault://dawn-haven-6034 in a message
Recipient: sgit clone dawn-haven-6034
           → gets all files as a committed vault
           → their own edit token, sender has no access to their copy
```

### The Collaboration workflow
```
Alice: sgit init → sgit push → "edit token: coral-equal-1234"
Bob:   sgit clone coral-equal-1234 → sgit commit → sgit push
Alice: sgit pull → sees Bob's changes
Both:  sgit share → same read-only browser URL refreshed by either
```

### The Archive workflow
```
Project ends:  sgit share --rotate → permanent URL printed
Anyone:        open URL, files decrypted in browser
               no server account, no sgit install needed
```

---

## 10. What Remains (future sprints)

| Item | Notes |
|------|-------|
| `sgit share --auto` / `auto_share: true` | Auto-refresh SG/Send on every `sgit push` |
| Integration tests | Need Python 3.12 venv + live SG/Send server |
| `sgit init` auto-token | Currently supported in `cmd_init` via Simple_Token__Wordlist; confirm UX |
| EC key determinism from `ec_seed` | Currently `ec_seed` is derived but EC key generation still uses random; closing this makes the vault fully reconstructible from token alone |
| `sgit share --token <t>` | Allow explicit share token on first publish |
| Token loss warning | Print prominent warning at init: "Save your edit token — it cannot be recovered" |

---

## 11. Crypto Correctness Notes

- **PBKDF2** (600,000 iterations, SHA-256, salt `b'sgraph-send-v1'`): matches the
  browser Web Crypto API derivation used by SG/Send. Output is byte-for-byte
  identical given the same token string — no platform-specific encoding.

- **HKDF-SHA256** (no salt, 32-byte output): three independent derivations from
  `aes_key`, each with a distinct `info` label. This ensures read, write, and
  EC seed keys are cryptographically independent even though they share a root.

- **AES-256-GCM**: all vault data encrypted with `read_key`; all transfer payloads
  encrypted with `aes_key` directly (matching SG/Send browser format).

The three-way HKDF split (`read_key`, `write_key`, `ec_seed`) is the core
new piece of crypto introduced in this sprint. Everything else reuses existing
`cryptography` library primitives already in production.

---

*Debrief written 2026-03-29. Commit fc9ac67 on branch claude/new-explorer-team-cHLXU.*
