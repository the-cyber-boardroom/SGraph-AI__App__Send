# Architecture Briefing: Hybrid n8n + FastAPI Agentic Infrastructure

**Date:** 27 February 2026  
**Project:** Sherpa Agent Infrastructure — sgraph.ai  
**Status:** Decision document — approved direction  
**Prerequisite reading:**
- `n8n-workmail-ews-claude-mcp-debrief.md` — how the current n8n WorkMail workflow was built and all the bugs encountered
- `n8n-multi-account-refactor-debrief.md` — why and how we refactored to multi-account routing
- `fastapi-workmail-implementation-debrief.md` — full spec for migrating WorkMail EWS to FastAPI

---

## 1. The Problem With the Current Approach

The previous two sessions (documented in the debrief files above) produced a working but architecturally uncomfortable system. The n8n workflow does too many things: it manages credentials, constructs SOAP XML, parses XML responses, validates inputs, routes operations, and orchestrates flow — all in a single visual workflow with embedded code nodes.

The specific pain points that led to this decision:

**Version control doesn't exist.** Every fix in both sessions was made by editing live nodes with no git history, no diff, no rollback. The only record of what changed is the session transcripts.

**Code nodes are untestable blobs.** The XML parser, the account validator, and the SOAP body templates all live inside n8n text fields. There is no way to write a unit test for them, run them locally, or lint them.

**The `$json.body.*` boundary problem hit 6+ times.** This is a fundamental n8n data-flow quirk — the webhook wraps input under `body`, but downstream nodes after sub-workflow calls see a flat structure. Every new node added to the workflow risks getting this wrong silently.

**Complexity grew with every fix.** The workflow started as 6 nodes and ended at 13. Each new capability (multi-account, validation, error handling) added nodes and expressions. The trajectory is wrong — workflows should get simpler as they mature, not more complex.

**n8n is fighting us, not helping us.** n8n's genuine strengths are connecting SaaS tools with pre-built nodes. What we built is a hand-coded EWS SOAP client inside a visual workflow tool. That's the wrong layer for that complexity.

---

## 2. What n8n Is Actually Good At

Before replacing everything, it's worth being precise about what n8n does well and should keep doing:

- **Visual execution history** — every workflow run is logged with inputs, outputs, and timing per node. This is genuinely valuable for an agentic system.
- **Agentic workflow representation** — the directed graph is a readable architecture diagram. Non-engineers can understand what the agent is doing.
- **Orchestration primitives** — triggers, branching, retry, error handling, parallel execution — all visual, all without code.
- **MCP exposure** — n8n's instance-level MCP integration lets Claude discover and call workflows directly. This is the right integration point.
- **Audit trail** — the execution log is a compliance asset. You can answer "what did the agent do at 01:07 on 27 Feb?" without any additional instrumentation.

The conclusion is not "replace n8n" — it is "use n8n only for what it's good at."

---

## 3. The Hybrid Architecture

### 3.1 Core Principle

**n8n is the orchestration plane. FastAPI is the execution plane.**

They have completely different responsibilities and should never blur:

| Concern | Owner |
|---|---|
| Workflow triggers (MCP, webhook, schedule) | n8n |
| Visual execution flow and audit trail | n8n |
| Agentic branching decisions | n8n |
| Retry logic and error routing | n8n |
| Business logic and computation | FastAPI |
| Credential management | FastAPI |
| External API calls (EWS, etc.) | FastAPI |
| Input validation and auth | FastAPI |
| Data transformation | FastAPI |
| Security screening | FastAPI |
| Sensitive data handling | FastAPI + SG/Send |

### 3.2 What n8n Nodes Become

In this model, every n8n node is one of exactly three types:

**Trigger** — MCP call, webhook, schedule, event. No logic.

**HTTP call to FastAPI** — one endpoint, one responsibility, clean JSON in and out. No expressions beyond passing through the previous node's output.

**Routing decision** — an IF or Switch node that branches based on a field in the FastAPI response (`success`, `flagged`, `requires_review`, etc.). The decision logic is in FastAPI — n8n just acts on the result.

No code nodes. No SOAP. No XML. No credential references. No complex expressions.

### 3.3 What the Current WorkMail Workflow Becomes

Before (13 nodes, multiple code nodes, credential management, SOAP XML):
```
MCP Trigger → Check valid accounts (code) → IF → Switch (account)
  → Execute Sub-workflow (sherpa) → Route by Operation → EWS: List Inbox (SOAP)
  → Parse EWS XML Response (code) → Respond to Webhook
```

After (3 nodes, zero code, zero credentials):
```
MCP Trigger
  ↓
HTTP: POST /workmail/{account}/{operation}   [FastAPI handles everything]
  ↓
Respond to Webhook
```

The visual flow is now the actual architecture. The execution log shows exactly what was called and what came back. The complexity lives where it belongs — in versioned, testable Python.

### 3.4 A Future AppSec Review Workflow

This is the motivating example for the hybrid model. An AppSec/security review step that would be extremely difficult to implement cleanly in n8n becomes trivial:

```
MCP Trigger
  ↓
HTTP: POST /workmail/{account}/list_inbox
  ↓
HTTP: POST /security/screen-messages
  ↓
IF: response.flagged_count > 0
  ├── true  → HTTP: POST /notify/security-team
  │              ↓
  │           Respond (flagged)
  └── false → HTTP: POST /workmail/{account}/send_email
                 ↓
              Respond (sent)
```

Every node is a single clean API call. The graph is the documentation. The security screening logic — whatever it is (LLM classification, regex patterns, blocklists, external scanning APIs) — lives entirely in FastAPI, testable and versionable independently.

### 3.5 Sensitive Data and SG/Send

n8n Cloud stores execution history in Anthropic's infrastructure. Email bodies, personally identifiable information, and security findings should not be stored there in plaintext.

FastAPI can optionally encrypt sensitive return values via SG/Send before responding to n8n. n8n stores and logs only the encrypted blob. The plaintext is retrievable only by authorised callers with the decryption key.

This means the n8n audit trail remains complete (you can see that an email was processed, when, by which account, with what outcome) without the actual content being exposed in n8n's storage.

---

## 4. FastAPI Service Structure

The service is a single deployable unit that grows with the agent's capabilities:

```
/workmail/{account}/list_inbox        # EWS: list messages
/workmail/{account}/get_message       # EWS: get full message + body
/workmail/{account}/send_email        # EWS: send new email
/workmail/{account}/reply             # EWS: reply to message

/security/screen-content              # AppSec content screening
/security/classify-sensitivity        # Data sensitivity classification

/agent/summarise-thread               # LLM-assisted operations
/agent/draft-reply

/vault/encrypt                        # SG/Send wrapper
/vault/decrypt
```

The WorkMail endpoints are fully specified in `fastapi-workmail-implementation-debrief.md` — all four SOAP bodies, the XML parser logic, all EWS gotchas, and the environment variable scheme are documented there.

**Key properties of the service:**
- All credentials in environment variables, never in n8n
- Webhook secret validated as FastAPI middleware on all routes
- Account validation is a FastAPI dependency, not an n8n code node
- `httpx.AsyncClient` for async EWS calls
- `lxml` or `xml.etree.ElementTree` for XML parsing
- Pydantic models for all request/response schemas
- Full test coverage possible — n8n workflows are not testable, Python functions are

---

## 5. Migration Plan

The migration is designed to be incremental. Each phase is independently deployable and testable. The n8n workflow gets simpler with each phase.

### Phase 1 — Extract WorkMail logic to FastAPI
*Prerequisite: `fastapi-workmail-implementation-debrief.md`*

Deploy the FastAPI WorkMail service. In n8n, replace the 4 EWS HTTP Request nodes with 4 HTTP calls to FastAPI. The sub-workflow credential architecture and the code nodes still exist at this point — this phase just moves the EWS SOAP layer out.

n8n workflow: 13 nodes → 10 nodes  
Risk: low — identical behaviour, just a different HTTP endpoint

### Phase 2 — Remove n8n code nodes
Move account validation and XML parsing into FastAPI (already done in Phase 1 implicitly). Remove the Check valid accounts code node, the Parse EWS XML Response code node, and the sub-workflow architecture entirely.

n8n workflow: 10 nodes → 5 nodes  
Result: n8n contains zero code, zero credentials, zero business logic

### Phase 3 — Add security screening
Add `/security/screen-messages` endpoint to FastAPI. Add one HTTP call node and one IF branch in n8n. The AppSec logic (whatever form it takes) is entirely in FastAPI.

n8n workflow: 5 nodes → 7 nodes (clean addition, no complexity increase)

### Phase 4 — Add SG/Send encryption for sensitive payloads
Wrap sensitive FastAPI responses in SG/Send encryption before returning to n8n. n8n logs only encrypted blobs. Implement `/vault/encrypt` and `/vault/decrypt` FastAPI endpoints.

n8n workflow: unchanged  
Result: compliance-safe execution history

---

## 6. What This Enables Long-Term

The hybrid model is not just a refactor — it's a foundation for the full Sherpa agent infrastructure:

**Multiple Sherpa identities** (Explorer, Villager, Townplanner) each get their own account in FastAPI config — one line per identity. n8n workflows reference them by name as path parameters. No new sub-workflows, no new credential nodes.

**Multiple capability workflows** (read-only, send, admin, AppSec review) are separate n8n workflows that each call the same FastAPI service with different endpoints. The visual graphs clearly show what each workflow is authorised to do. The authorisation logic is in FastAPI middleware.

**Agentic loops** become readable. A multi-step agent action (read inbox → classify → draft reply → screen → send) is a linear sequence of HTTP call nodes in n8n. The execution log shows every step with timing. FastAPI handles all the intelligence.

**Testing** becomes possible. The FastAPI service has unit tests. The n8n workflows are so simple they barely need testing — they're just wiring.

**Onboarding** a new developer means: read the FastAPI codebase (normal Python), look at the n8n graph (visual architecture diagram). Not: decipher 13-node workflows with embedded SOAP XML and understand n8n's `$json.body.*` quirks.

---

## 7. Reference Documents

| Document | Purpose |
|---|---|
| `n8n-workmail-ews-claude-mcp-debrief.md` | Full history of the original n8n build — all 7 bugs, all fixes, the MCP wiring |
| `n8n-multi-account-refactor-debrief.md` | Why and how we added multi-account routing — the architecture decisions and tradeoffs |
| `fastapi-workmail-implementation-debrief.md` | Complete FastAPI implementation spec — all SOAP bodies, XML parser, EWS gotchas, env vars |
| This document | Architecture decision and migration plan for the hybrid model |

---

## 8. Decision Summary

| Question | Answer |
|---|---|
| Replace n8n entirely? | No — keep it for orchestration, triggers, visual audit trail |
| Keep logic in n8n code nodes? | No — all logic, credentials, and complexity move to FastAPI |
| Keep EWS SOAP in n8n? | No — FastAPI handles all EWS calls |
| Keep sub-workflow credential architecture? | No — credentials live in FastAPI env vars |
| What does n8n contain after migration? | Triggers, HTTP calls to FastAPI, IF/Switch routing on response fields |
| What does FastAPI contain? | All business logic, all credentials, all external API calls, all validation |
| How does Claude interact? | Via n8n MCP (unchanged) — Claude calls n8n workflows, n8n calls FastAPI |
| Where does sensitive data live? | FastAPI + SG/Send encryption — never in n8n execution history in plaintext |

---

*27 February 2026 — Sherpa Agent Infrastructure*
