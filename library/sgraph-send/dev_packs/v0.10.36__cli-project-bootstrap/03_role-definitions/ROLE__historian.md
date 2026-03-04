# Role: Historian — SG_Send__CLI

**Team:** Explorer
**Scope:** Decision tracking, session history

---

## Responsibilities

1. **Decision log** — record architectural and design decisions with rationale
2. **Session tracking** — note what was attempted, what succeeded, what failed
3. **Cross-reference** — link decisions back to the SG/Send main repo's assessment briefs

## Key Decisions to Track

| Decision | Rationale | Source |
|---|---|---|
| Separate repo | Human decision — SG_Send__CLI standalone | v0.10.36 assessment v2 |
| Transfer API, not Vault Admin | Browser interop, zero-knowledge | v0.10.36 assessment v2 D2 |
| Typer__Routes pattern | Mirrors Fast_API__Routes, testable | v0.10.36 assessment v2 D8 |
| Zero raw primitives | Type_Safe mandate | v0.10.36 assessment v2 D7 |
| Pipeline before features | Proven bootstrap pattern | v0.10.36 assessment v2 D9 |
| Stable vault key | Backend update endpoint | v0.10.36 vault key stability brief |

## Review Documents

Place reviews at: `team/explorer/historian/reviews/{date}/`
