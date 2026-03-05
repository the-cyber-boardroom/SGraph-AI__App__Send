# What to Clone from SG/Send Main Repo

**Version:** v0.11.12

The extension project is a standalone repo, but it references source code and briefs from the SG/Send main repo.

---

## How to Access

```bash
git clone https://github.com/the-cyber-boardroom/SGraph-AI__App__Send.git /tmp/sgraph-send-ref
```

---

## What to READ (Reference Only)

### Source Brief (the requirements)

| What | Path | Why |
|------|------|-----|
| **Chrome Extension brief** | `team/humans/dinis_cruz/briefs/03/04/v0.11.1__dev-brief__chrome-extension-key-vault.md` | Full 11-part brief: architecture, security, cross-device, corporate |

### Crypto Source Code (must interoperate)

| What | Path | Why |
|------|------|-----|
| **Vault crypto** | `sgraph_ai_app_send__ui__vault/v0/v0.1/v0.1.1/_common/js/lib/sg-vault/sg-vault-crypto.js` | PBKDF2 KDF — **must match exactly** |
| **Send crypto** | `sgraph_ai_app_send__ui__user/v0/v0.2/v0.2.0/_common/js/crypto.js` | AES-256-GCM encrypt/decrypt pattern |
| **Vault logic** | `sgraph_ai_app_send__ui__vault/v0/v0.1/v0.1.1/_common/js/lib/sg-vault/sg-vault.js` | Vault key format, tree structure |
| **Send crypto (vault ver)** | `sgraph_ai_app_send__ui__vault/v0/v0.1/v0.1.1/_common/js/lib/sg-send/sg-send-crypto.js` | Vault-specific encryption |

### Architecture References

| What | Path | Why |
|------|------|-----|
| **Main CLAUDE.md** | `.claude/CLAUDE.md` | SG/Send conventions for reference |
| **Dev pack** | `library/sgraph-send/dev_packs/v0.11.12__chrome-extension-key-vault/` | This bootstrap pack |

---

## What to COPY (Into Extension Repo)

| What | Source | Destination | Why |
|------|--------|-------------|-----|
| Vault crypto (reference) | `sg-vault-crypto.js` | `tests/reference/sg-vault-crypto.js` | Interop test reference |
| Send crypto (reference) | `crypto.js` | `tests/reference/sg-send-crypto.js` | Interop test reference |
| CLAUDE.md template | This dev pack `claude-md-templates/CLAUDE.md` | `.claude/CLAUDE.md` | Project guidance |
| Explorer CLAUDE.md | This dev pack `claude-md-templates/explorer__CLAUDE.md` | `.claude/explorer/CLAUDE.md` | Team instructions |
| Role definitions | This dev pack `03_role-definitions/` | `team/explorer/{role}/ROLE__{name}.md` | Role setup |

---

## What NOT to Copy

- **Python code** — extension is pure JS
- **Lambda code** — no server-side code
- **FastAPI routes** — extension is a client, not a server
- **osbot-utils, osbot-aws** — not applicable (JS project)
- **Type_Safe guides** — Python-specific
- **Admin UI** — separate project
- **CI/CD pipelines** — extension needs different pipeline (Chrome Web Store, not Lambda)
