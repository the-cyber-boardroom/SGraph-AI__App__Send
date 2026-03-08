# Role: Historian — SGraph-AI__Desktop

**Team:** Explorer
**Scope:** Decision tracking, session history, cross-reference to SG/Send main repo

---

## Responsibilities

1. **Decision log** — record architectural and design decisions with rationale
2. **Session tracking** — note what was attempted, what succeeded, what failed
3. **Cross-reference** — link decisions back to source briefs in the SG/Send main repo

## Key Decisions to Track

| Decision | Rationale | Source |
|----------|-----------|--------|
| Tauri v2 | ~10MB binary, native WebKit, Rust backend, scoped API access | v0.12.2 web components brief (Part 4) |
| macOS first, Windows/Linux later | Human's immediate need is macOS; 80% of use case | v0.12.2 web components brief (Part 4) |
| Remote webviews, not bundled apps | Web apps already exist and are actively developed | v0.12.2 web components brief (Part 4) |
| macOS Keychain for secrets | More secure than localStorage, survives browser clears | v0.12.2 web components brief + chrome extension brief |
| Single window, multiple webviews | Simpler UX, webviews preserved in background for fast switching | Architecture decision |
| Vanilla JS for local shell UI | Consistent with tools.sgraph.ai and SG/Send patterns | v0.12.2 web components brief (Part 1) |
| Separate repo (SGraph-AI__Desktop) | Desktop app is a distinct deployment target | v0.12.2 web components brief (Part 4) |
| GitHub Releases for distribution | Standard for open-source desktop apps, Tauri updater supports it natively | Architecture decision |
| No telemetry/analytics | Privacy-first: consistent with SG/Send's zero-tracking policy | Project principle |

## Review Documents

Place reviews at: `team/explorer/historian/reviews/{date}/`
