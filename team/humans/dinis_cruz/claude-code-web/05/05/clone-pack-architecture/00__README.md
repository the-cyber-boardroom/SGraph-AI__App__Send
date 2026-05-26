# Clone Pack Architecture — Briefing Pack

**For:** Architecture conversation about Brief 08b (SG/Send Backend: Clone Pack Endpoints)
**Repo:** `sgraph-ai-app-send`
**Date:** 2026-05-05

This folder is a self-contained briefing pack for a fresh Claude session.
Read in order. You do not need to read any other files in the repo first.

---

## Reading Order

| File | What it covers | Read time |
|------|---------------|-----------|
| `01__vault-server-architecture.md` | How vaults work server-side — storage paths, auth model, object model, service classes | ~10 min |
| `02__existing-api-flows.md` | All current API flows with ASCII sequence diagrams — push, read, clone, CAS, presigned | ~10 min |
| `03__clone-pack-brief-summary.md` | Distilled requirements from Brief 08b — wire format, new endpoints, pack builder, cache | ~8 min |
| `04__open-architecture-questions.md` | The decisions that must be made before implementation — with trade-offs for each | ~10 min |

---

## Context in One Paragraph

SGit-AI vaults store encrypted Git-like objects on SG/Send. A real vault with 42 commits
and 2,375 tree objects currently takes **202 seconds to clone** because the client does
3–4 BFS waves of HTTP requests, one request per wave (~600 objects each, each object
requiring a separate S3 GET on the server). Brief 08b asks for a server-side "clone pack"
— a single binary file containing all encrypted objects for a clone — so that an entire
vault can be downloaded in **one HTTP request** (~40–100× speedup).

The architecture conversation needed is: how does the pack builder fit into the existing
storage abstraction, where do packs live, how does pre-warming hook into the existing
push flow, and should we use the spec's proposed paths/auth or adapt to the existing
conventions?

---

## The Brief (source of truth)

`team/humans/dinis_cruz/briefs/05/05/brief__08b__sg-send-backend-spec.md`
