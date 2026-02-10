# Architecture Documents

**Status:** DRAFT (Plan Mode — awaiting comparison with implementation plan)
**Author:** Claude (Architect / Cartographer roles)

---

## Documents

| Document | Role | Purpose |
|----------|------|---------|
| [FastAPI Service Plan](fastapi-service-plan.md) | Architect | API contracts, data models, endpoint specs, authentication, error handling, Lambda handler design |
| [Frontend UI Plan](frontend-ui-plan.md) | Architect | Page breakdown, encryption flow, component structure, UX design, static hosting model |
| [System Landscape Map](system-landscape-map.md) | Cartographer | Full system topology, data flows, environment separation, security boundaries, IAM roles, risk register |
| [Issues FS Improvements](issues-fs-improvements.md) | Librarian | Friction points and improvement proposals for Issues FS |

---

## Plan Mode Status

These documents are the **Architect's independent plans** (Tasks 3, 4, 5 from the brief). They define WHAT should be built and WHY.

A separate **implementation plan** will be produced independently. The Human (Conductor) will compare both plans, resolve conflicts, and merge them into a final authoritative spec.

### Key Architectural Decisions in These Plans

| Decision | Choice | Documented In |
|----------|--------|---------------|
| S3 as database (not DynamoDB) | JSON files for MVP, DynamoDB migration path | FastAPI Plan §8 |
| Pre-signed URLs for all file transfer | Lambda never touches file bytes | FastAPI Plan §4 |
| Hash-based client-side routing | No server-side routing needed | Frontend Plan §1.2 |
| Vanilla JS (no framework) | Sufficient for 6 pages, zero build step | Frontend Plan §2.2 |
| XMLHttpRequest for upload | fetch() lacks upload progress events | Frontend Plan §4.1 |
| payload.enc = IV + ciphertext | 12-byte IV prepended to GCM output | Frontend Plan §3.5 |
| 100MB max file size | Avoids multipart upload complexity | FastAPI Plan §8 |
| 3 isolated environments | No shared resources between dev/qa/prod | System Map §4 |
