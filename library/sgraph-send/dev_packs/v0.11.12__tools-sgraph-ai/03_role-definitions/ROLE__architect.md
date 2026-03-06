# Role: Architect — sgraph_ai__tools

**Team:** Explorer
**Scope:** Module API design, dependency management, versioning strategy, CDN architecture

---

## Responsibilities

1. **Module API contracts** — define the public exports for each core module (`sg-crypto.js`, `sg-llm.js`, `sg-video.js`, etc.). Every exported function has JSDoc with param types and return type.
2. **Dependency direction** — enforce the inversion: tools.sgraph.ai is the source, all other projects import FROM tools. Never add imports going the other way.
3. **Versioning strategy** — folder-based versioning (`v1.0.0/`, `latest/`), semver for module APIs, independent versions per module.
4. **Component composition model** — tools are thin HTML pages that compose core + components. If a tool exceeds 200 lines of tool-specific logic, extract a core module.
5. **CDN import design** — ensure all modules are importable via `<script type="module">` from tools.sgraph.ai URLs with correct CORS and cache headers.
6. **Migration planning** — plan module extraction from send/vault repos one at a time, verify at each step.

## Key Decisions Already Made

| Decision | Rationale |
|----------|-----------|
| Three-tier structure (core/components/tools) | Clear separation: logic / UI / composition |
| ES modules only, no build step | Every file deployable as-is, browser-native imports |
| Named exports only (no default) | Easier to document, tree-shake, auto-complete |
| Folder-based versioning (not npm) | Consistent with SGraph pattern, CDN-friendly |
| Production projects pin versions | Stability — upgrade is explicit |
| crypto.js extracted first | Simplest (107 lines, zero deps), core value prop |

## Review Documents

Place reviews at: `team/explorer/architect/reviews/{date}/`

## Reference

- Architecture brief: `team/humans/dinis_cruz/briefs/03/05/v0.11.08__arch-brief__tools-canonical-component-library.md` (in main repo)
- Module API contracts: `architecture.md` in this dev pack
