# What to Clone from SG/Send Main Repo

**Version:** v0.13.30

The vault project is a standalone repo, but it references source code, briefs, and architecture decisions from the SG/Send main repo. Clone it for read access.

---

## How to Access

```bash
git clone https://github.com/the-cyber-boardroom/SGraph-AI__App__Send.git /tmp/sgraph-send-ref
```

---

## What to READ (Reference Only)

### Source Code (patterns to extract)

| What | Path | Why |
|------|------|-----|
| **Vault pointer routes** | `sgraph_ai_app_send/lambda__user/routes/Routes__Vault__Pointer.py` | HTTP API layer — data model to port |
| **vault-crypto.js** | `sgraph_ai_app_send__ui__admin/` area | Browser AES-256-GCM format (must be compatible) |
| **Storage_FS usage** | Various test files | Pluggable storage pattern |

### Vault Briefs (20 documents)

| What | Path | Why |
|------|------|-----|
| **Branch Model** | `team/humans/dinis_cruz/briefs/03/12/v0.13.30__arch-brief__branch-model-multi-user.md` | Core architecture: PKI per branch, signed commits |
| **Bare Vault Unification** | `team/humans/dinis_cruz/briefs/03/12/v0.13.30__arch-brief__bare-vault-unification.md` | Format convergence, nested vaults |
| **CLI Standalone** | `team/humans/dinis_cruz/briefs/03/12/v0.13.30__arch-brief__cli-standalone-remotes.md` | Remote model, offline mode |
| **Encrypt for Reader** | `team/humans/dinis_cruz/briefs/03/11/v0.13.29__arch-brief__encrypt-for-reader.md` | Security paradigm |
| **Lambda Vault Logging** | `team/humans/dinis_cruz/briefs/03/11/v0.13.29__dev-brief__lambda-vault-logging.md` | Headless mode requirements |
| **PKI Document Identity** | `team/humans/dinis_cruz/briefs/03/11/v0.13.29__arch-brief__pki-document-identity.md` | Document signing |
| **Vault UI Components** | `team/humans/dinis_cruz/briefs/03/11/v0.13.29__dev-brief__vault-ui-components.md` | Pack manifest spec |
| **Vault Access from Claude** | `team/humans/dinis_cruz/briefs/03/12/v0.13.30__dev-brief__vault-access-from-claude.md` | Download endpoint |
| **Vault Website + Billing** | `team/humans/dinis_cruz/briefs/03/12/v0.13.30__dev-brief__vault-website-billing.md` | Billable units |

### Synthesis Documents

| What | Path | Why |
|------|------|-----|
| **Vault Comprehensive Debrief** | `team/humans/dinis_cruz/debriefs/03/12/v0.13.30__debrief__vault-architecture-comprehensive.md` | Full synthesis of all 65 vault documents |
| **Reality Document** | `team/roles/librarian/reality/v0.13.22__what-exists-today.md` | What actually exists in App__Send |
| **CLI PKI Algorithm Decisions** | `team/roles/architect/reviews/03/11/v0.13.19__guidance__cli-pki-algorithm-decisions.md` | Ed25519 vs ECDSA analysis |
| **CLI PKI Implementation** | `team/roles/dev/reviews/03/11/v0.13.19__guidance__cli-pki-implementation-patterns.md` | Code patterns |
| **Architect Review Mar 10-12** | `team/roles/architect/reviews/03/12/v0.13.30__architect-review__march-10-12-briefs.md` | Feasibility assessment |
| **AppSec Review Mar 10-12** | `team/roles/appsec/reviews/03/12/v0.13.30__appsec-review__march-10-12-briefs.md` | Security findings |
| **Dev Review Mar 10-12** | `team/roles/dev/reviews/03/12/v0.13.30__dev-review__march-10-12-briefs.md` | Implementation assessment |

### Dev Pack (this pack)

| What | Path | Why |
|------|------|-----|
| **Full dev pack** | `library/sgraph-send/dev_packs/v0.13.30__vault-standalone/` | This bootstrap pack |

### Architecture References

| What | Path | Why |
|------|------|-----|
| **IFD guide** | `library/guides/development/ifd/v1.2.1__ifd__intro-and-how-to-use.md` | IFD methodology |
| **Main CLAUDE.md** | `.claude/CLAUDE.md` | SG/Send conventions (for reference) |

---

## What to COPY (Into Vault Repo)

| What | Source | Destination | Why |
|------|--------|-------------|-----|
| CLAUDE.md template | This dev pack `claude-md-templates/CLAUDE.md` | `.claude/CLAUDE.md` | Project guidance |
| Explorer CLAUDE.md | This dev pack `claude-md-templates/explorer__CLAUDE.md` | `.claude/explorer/CLAUDE.md` | Team instructions |
| Role definitions | This dev pack `03_role-definitions/` | `team/explorer/{role}/ROLE__{name}.md` | Role setup |
| CI/CD pattern | App__Send `.github/workflows/` | `.github/workflows/` (adapted) | pytest + PyPI pipeline |

---

## What NOT to Copy

- **FastAPI routes** — the vault repo is a library, not a web server
- **Lambda code** — no serverless deployment
- **UI code** — the vault UI components are a future phase (may go in a separate UI repo)
- **Mangum adapter** — no Lambda
- **osbot-fast-api** — no web framework
- **Transfer API** — transfers are App__Send's responsibility, not vault's
- **Admin UI** — separate project
- **Pydantic anything** — we use Type_Safe
