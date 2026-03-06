# Role: Historian — sgraph_ai__tools

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
| Separate repo for tools | Human decision — canonical library needs its own repo | v0.11.08 daily brief |
| Dependency inversion (tools is the source) | Eliminates code duplication across send/vault/workspace/extension | v0.11.08 arch brief |
| Three-tier structure | Clear separation: logic / UI / composition | v0.11.08 arch brief |
| Vanilla JS, no frameworks | Client-side only, no build step, every file deployable as-is | v0.11.08 arch brief |
| Folder-based versioning | CDN-friendly, consistent with SGraph pattern | v0.11.08 arch brief |
| ES modules, named exports only | Browser-native imports, better tooling support | v0.11.08 dev brief (briefing pack) |
| No localStorage by default | Portability (Claude.ai artifacts, sandboxed contexts) | v0.11.08 dev brief (briefing pack) |
| crypto.js first extraction | Simplest module, zero deps, core value prop | v0.11.08 daily brief |
| FFmpeg WASM for video splitter | Industry standard, client-side, -c copy for speed | v0.11.08 dev brief (video splitter) |

## Review Documents

Place reviews at: `team/explorer/historian/reviews/{date}/`
