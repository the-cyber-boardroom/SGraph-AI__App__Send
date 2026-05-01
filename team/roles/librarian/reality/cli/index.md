# cli — Reality Index

**Domain:** `cli/` | **Last updated:** 2026-04-28 | **Maintained by:** Librarian (daily run)

The sgit CLI: an external PyPI package (`sgit-ai`) that is the primary tool for vault operations
from the command line and agent environments. **Not part of this repo's codebase** — lives at
`SGit-AI/SGit-AI__CLI` on GitHub. Documented here because it is a core part of the SGraph
Send product surface and is used extensively in agent workflows.

**Migration note (20 March 2026):** `sg-send-cli` (PyPI: `sg-send-cli`) is superseded and
no longer maintained. Use `sgit-ai` for all new work.

---

## EXISTS (Code-Verified)

**Install:** `pip install sgit-ai`
**GitHub:** `https://github.com/SGit-AI/SGit-AI__CLI`
**PyPI:** `sgit-ai`
**Website:** sgit.ai (static S3 + CloudFront)

### Core Vault Commands

| Command | Status | What It Does |
|---------|--------|-------------|
| `sgit clone <vault-key>` | **Working** | Clone encrypted vault to local filesystem |
| `sgit pull` | **Working** | Pull remote changes to local clone |
| `sgit push` | **Working** | Push local changes back to server (auth required) |
| `sgit status` | **Working** | Show local vs remote diff |
| `sgit init` | **Working** | Create new vault (local or on server) |
| `sgit commit "message"` | **Working** | Snapshot all changed files (no staging area) |
| `sgit remote add <url>` | **Working** | Connect to a remote server |

### Extended Commands (not in sg-send-cli)

| Command | Status | What It Does |
|---------|--------|-------------|
| `sgit log` | **Working** | View commit history |
| `sgit diff` | **Working** | Show changes since last commit |
| `sgit branch new <name>` / `sgit switch <name>` | **Working** | Branch management |
| `sgit share` | **Working** ⚠️ | Generate sharing token. **KNOWN FAILURE:** fails with HTTP 503 "DNS cache overflow" on vaults > ~4MB from egress-controlled environments (Claude Web). Workaround: `sgit push` + share vault key out-of-band. Fix: delta-share fallback (PROPOSED). |
| `sgit keygen` / `sgit sign` / `sgit verify` | **Working** | PKI operations |
| `sgit encrypt` / `sgit decrypt` | **Working** | File-level encryption |
| `sgit contacts` | **Working** | PKI contact directory |
| `sgit inspect` / `sgit cat-object` / `sgit fsck` | **Working** | Vault inspection tools |
| `sgit uninit` | **Working** | Remove vault from folder (creates backup zip) |
| `sgit export --output file.zip` | **Working** | Export vault as distributable zip |

### Verified Integrations

| Environment | Status |
|-------------|--------|
| Claude.ai bash_tool (with `send.sgraph.ai` on domain allowlist) | **Verified** |
| Claude Code (with PyPI access) | **Verified** |
| Local machine (macOS, Linux) | **Verified** |

### Branch Model (EXISTS in sgit)

- **Named branch:** per-device signing key (PKI), named (e.g., `laptop`, `claude`)
- **Clone branch:** auto-created on `sgit clone`, tracks remote
- `bare/` folder structure with opaque IDs and encrypted refs
- Offline mode: commit, branch, diff, log all work without network

---

## DOES NOT EXIST (Commonly Confused)

| Claimed | Reality |
|---------|---------|
| `sgit upload <file>` (file transfer, not vault) | PROPOSED — not in sgit |
| `sgit download <transfer-id>` | PROPOSED — not in sgit |
| `sgit secrets store/get/list/delete` (OS keychain) | PROPOSED — not in sgit |
| Merge and conflict resolution | PROPOSED — architecture simulated, no code |
| Nested vaults (vault-inside-vault) | PROPOSED |
| `sg-send-cli` (old package) | Deprecated — use `sgit-ai` |

---

## PROPOSED

Full list: [proposed/index.md](proposed/index.md)

- **`sgit share` delta-share fallback** — fix 503 on large vaults from egress-controlled environments
- **sgit CLI extensions** — client passphrase flag, batch push, secrets OS keychain integration
- **`sgit derive-keys` output** — expose `structure_key` via CLI once split implemented (OQ-1)
- **MCP transport backend** — sgit operations via MCP protocol
