# Trigger.dev: Review and Sherpa Agent Use Case

**Date:** 27 February 2026  
**Context:** Evaluation for replacing n8n in the Sherpa Agent Infrastructure  
**Related docs:** `hybrid-n8n-fastapi-architecture-briefing.md`, `fastapi-workmail-implementation-debrief.md`

---

## Part 1: Trigger.dev Review

### What It Is

Trigger.dev is an open-source platform for building and deploying background jobs and long-running workflows in TypeScript. The core idea is simple: you write tasks as ordinary TypeScript functions, deploy them via CLI, and the platform handles execution, durability, retries, observability, and scaling. There is no visual editor, no node-dragging, no proprietary DSL — it is just code.

It is YC W23, currently on v4, and explicitly positioning itself as the infrastructure layer for AI agents and agentic workflows.

---

### Architecture

Tasks are TypeScript functions decorated with `task()`:

```typescript
import { task } from "@trigger.dev/sdk/v3";

export const listInbox = task({
  id: "list-inbox",
  run: async (payload: { account: string; limit?: number; since?: string }) => {
    const auth = resolveAccount(payload.account);
    const messages = await callEWS(auth, payload.limit, payload.since);
    return { success: true, count: messages.length, messages };
  },
});
```

Tasks live in a `/trigger` folder in your repo. `npx trigger.dev@latest deploy` builds and deploys them to the platform. Triggering a task is a single SDK call from anywhere in your codebase:

```typescript
await listInbox.trigger({ account: "sherpa", limit: 10 });
// or wait for the result
const result = await listInbox.triggerAndWait({ account: "sherpa", limit: 10 });
```

---

### Key Features

**Durable execution** — if a task fails mid-run, it resumes from the last successful step, not from scratch. This is the fundamental difference from a plain async function or a serverless endpoint. For multi-step agentic workflows (read → classify → draft → screen → send), this matters enormously.

**No timeouts** — tasks can run for minutes, hours, or days. The platform suspends the process during `wait` calls and resumes it, so you are not burning compute while waiting.

**Wait primitives** — first-class support for pausing execution:

```typescript
// Wait for a duration
await wait.for({ minutes: 30 });

// Wait for an external event (human-in-the-loop)
const approval = await wait.forToken({ id: "security-review", timeout: "24h" });
```

**Steps and checkpointing** — wrap discrete units of work in `io.runTask()` to get per-step logging, retries, and idempotency:

```typescript
const auth = await io.runTask("resolve-account", () => resolveAccount(payload.account));
const raw = await io.runTask("call-ews", () => callEWS(auth, payload));
const parsed = await io.runTask("parse-response", () => parseEWSXML(raw));
```

Each step appears individually in the execution dashboard with its own timing, input, and output.

**Batch triggering** — fan-out patterns are first-class:

```typescript
// Trigger many tasks in parallel, wait for all results
const results = await screenMessages.batchTriggerAndWait(
  messages.map(msg => ({ payload: msg }))
);
```

**Schedules** — cron-style scheduling with no infrastructure:

```typescript
export const checkInbox = schedules.task({
  id: "check-inbox-scheduled",
  cron: "*/15 * * * *",
  run: async () => { /* ... */ },
});
```

**HTTP endpoints** — expose tasks as synchronous HTTP endpoints that Claude or any caller can hit directly:

```typescript
export const workmailEndpoint = endpoint({
  id: "workmail",
  source: http.onRequest(),
  run: async ({ request }) => {
    const body = await request.json();
    return await listInbox.triggerAndWait(body);
  },
});
```

---

### MCP Support

Trigger.dev released their official MCP server in August 2025. It is a first-class, production-supported integration, not an afterthought.

Install and configure in one command:

```bash
npx trigger.dev@latest mcp
```

The MCP server exposes tools for: initialising projects, creating tasks, triggering runs, monitoring run status, viewing logs, cancelling runs, deploying to environments, and searching documentation.

A dev-only mode prevents the MCP server from touching production data regardless of prompt content:

```bash
npx trigger.dev@latest dev --mcp --dev-only
```

This is the integration point for Claude — Claude calls the Trigger.dev MCP server, which triggers tasks and returns results, with full execution visibility in the dashboard.

---

### CI/CD Integration

Tasks are code in git. The deployment model is:

```bash
# In your CD pipeline
npx trigger.dev@latest deploy --env prod
```

Every branch automatically gets a preview environment. Every PR can be tested against its own isolated Trigger.dev instance before merging. The entire workflow is standard git-based CI/CD — no special tooling, no dashboard clicks, no export/import.

Runs in the DEV environment are not charged.

---

### Observability

The dashboard shows every run with: task name, environment, trigger time, duration, status, step-by-step execution trace, input payload, and output. You can filter, search, bulk-replay, and bulk-cancel. Alert destinations (email, Slack, webhooks) are configurable per task.

This is the feature that replaces what n8n's visual execution history provides — but it is richer because each step is individually inspectable, not just each node.

---

### Licensing and Hosting

**Licence:** Apache 2.0 — full open source, commercially usable, forkable, no restrictions.

**Hosting options:**

| Option | Description | Best for |
|---|---|---|
| Trigger.dev Cloud | Fully managed, zero ops | Getting started, most teams |
| Self-hosted (Docker) | Docker Compose on your own server | Data residency, cost control |
| Bring Your Own Cloud | Managed by Trigger.dev in your AWS/GCP/Azure account | SOC2/ISO27001/HIPAA compliance |

**Cloud pricing:**
- Free: $5/month usage included, Dev + Prod environments, 5 team members
- $10/month: $10 usage, 25 concurrent runs, Staging environment, 7-day log retention
- $50/month: $50 usage, 100 concurrent runs, 30-day log retention, dedicated Slack support

Compute is charged per second of actual execution — you do not pay for time spent in `wait` calls.

---

### What It Is Not

- Not a visual workflow builder — there is no canvas, no drag-and-drop nodes
- Not a SaaS connector platform — there are no pre-built Salesforce or Slack nodes
- Not a replacement for a message queue (Kafka, SQS) — it sits above that layer
- TypeScript only — Python is supported via a build extension for running scripts, but the orchestration layer is TypeScript

---

## Part 2: Sherpa Use Case — Replacing n8n

### Why n8n Needs Replacing

The full history is in `n8n-workmail-ews-claude-mcp-debrief.md` and `n8n-multi-account-refactor-debrief.md`. The summary:

- Workflows are untestable, unversioned visual blobs
- Complex logic (SOAP XML, XML parsing, credential management, input validation) lives in code nodes inside n8n's GUI
- n8n's data-flow quirks (`$json.body.*` vs `$json.*`) caused repeated silent bugs
- Every fix was irreversible — no git, no diff, no rollback
- The workflow grew to 13 nodes with embedded complexity; the trajectory was wrong

The hybrid n8n + FastAPI model (documented in `hybrid-n8n-fastapi-architecture-briefing.md`) was an improvement but still two systems. Trigger.dev collapses both into one.

---

### The New Stack

```
Claude (claude.ai)
  ↓  MCP
Trigger.dev MCP Server
  ↓
Trigger.dev Tasks (TypeScript, in git, CI/CD deployed)
  ├── workmail/list-inbox
  ├── workmail/get-message
  ├── workmail/send-email
  ├── workmail/reply
  ├── security/screen-content      (future)
  └── agent/draft-reply            (future)
  ↓
AWS WorkMail EWS (eu-west-1)
```

No n8n. No FastAPI. One language, one deployment, one dashboard.

---

### Project Structure

```
sherpa-agent/
├── trigger/
│   ├── workmail/
│   │   ├── list-inbox.ts
│   │   ├── get-message.ts
│   │   ├── send-email.ts
│   │   └── reply.ts
│   ├── security/
│   │   └── screen-content.ts      (future)
│   └── shared/
│       ├── ews-client.ts          # EWS HTTP calls
│       ├── ews-parser.ts          # XML response parsing
│       └── accounts.ts            # Account → credential resolution
├── trigger.config.ts
├── package.json
└── .env
```

All the EWS SOAP bodies, XML parser, and account credential logic from `fastapi-workmail-implementation-debrief.md` move directly into `ews-client.ts` and `ews-parser.ts` — plain TypeScript modules, fully unit-testable.

---

### Account and Credential Management

```typescript
// trigger/shared/accounts.ts

const ACCOUNTS: Record<string, string> = {
  sherpa: process.env.WORKMAIL_SHERPA_AUTH!,
  dinis:  process.env.WORKMAIL_DINIS_AUTH!,
};

export function resolveAccount(account: string): string {
  const auth = ACCOUNTS[account];
  if (!auth) throw new Error(`Invalid account '${account}'. Valid: ${Object.keys(ACCOUNTS).join(', ')}`);
  return auth;
}
```

Adding a new account (Villager, Townplanner) = one env var + one line in this object. No new workflows, no new sub-workflows, no new credential nodes in a GUI.

---

### Example Task: list-inbox

```typescript
// trigger/workmail/list-inbox.ts
import { task } from "@trigger.dev/sdk/v3";
import { resolveAccount } from "../shared/accounts";
import { buildFindItemSOAP } from "../shared/ews-client";
import { parseEWSResponse } from "../shared/ews-parser";

export const listInbox = task({
  id: "workmail-list-inbox",
  run: async (payload: {
    account: string;
    limit?: number;
    since?: string;
  }) => {
    const auth = resolveAccount(payload.account);

    const since = payload.since
      ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const soap = buildFindItemSOAP(payload.limit ?? 20, since);
    const xml = await callEWS(auth, soap);
    return parseEWSResponse(xml);
  },
});
```

Compare this to the n8n equivalent: a Switch node routing to an HTTP Request node containing raw SOAP XML with n8n expressions, whose output feeds into a Code node containing a hand-rolled XML parser, with credentials managed through a sub-workflow architecture. The TypeScript version is shorter, readable, testable, and in git.

---

### Multi-Step Agentic Workflow Example

The AppSec review workflow that motivated the hybrid architecture becomes clean and durable:

```typescript
// trigger/workflows/secure-send.ts
import { task } from "@trigger.dev/sdk/v3";
import { listInbox } from "../workmail/list-inbox";
import { screenContent } from "../security/screen-content";
import { sendEmail } from "../workmail/send-email";
import { wait } from "@trigger.dev/sdk/v3";

export const secureSend = task({
  id: "secure-send-workflow",
  run: async (payload: {
    account: string;
    to: string;
    subject: string;
    body: string;
  }) => {
    // Step 1: Screen content before sending
    const screening = await screenContent.triggerAndWait({
      content: payload.body,
      subject: payload.subject,
    });

    if (screening.output.flagged) {
      // Step 2: Wait for human approval (up to 24h)
      const approval = await wait.forToken({
        id: `security-review-${Date.now()}`,
        timeout: "24h",
      });

      if (!approval.ok) {
        return { success: false, reason: "Security review rejected or timed out" };
      }
    }

    // Step 3: Send
    return await sendEmail.triggerAndWait(payload);
  },
});
```

If this workflow fails at step 3 after step 1 and 2 have already completed, it resumes from step 3 — not from scratch. The security screening is not re-run. This is durable execution, and it is not possible in n8n or plain FastAPI without significant custom infrastructure.

---

### CI/CD Pipeline

```yaml
# .github/workflows/deploy.yml
name: Deploy Trigger.dev tasks

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm test                    # unit tests run against plain TypeScript
      - run: npx trigger.dev@latest deploy --env prod
        env:
          TRIGGER_ACCESS_TOKEN: ${{ secrets.TRIGGER_ACCESS_TOKEN }}
          WORKMAIL_SHERPA_AUTH: ${{ secrets.WORKMAIL_SHERPA_AUTH }}
          WORKMAIL_DINIS_AUTH: ${{ secrets.WORKMAIL_DINIS_AUTH }}
```

Every PR gets a preview environment automatically. Unit tests run in CI against plain TypeScript functions — no Trigger.dev runtime needed for testing the core logic.

---

### What Claude Sees via MCP

Claude connects to the Trigger.dev MCP server and can:

- List available tasks and their payload schemas
- Trigger `workmail-list-inbox` with `{ account: "sherpa", limit: 5 }`
- Trigger `workmail-send-email` with `{ account: "dinis", to: "...", subject: "...", body: "..." }`
- Monitor run status and retrieve results
- View execution logs for debugging

The MCP server is the only interface Claude needs. There is no webhook URL to manage, no n8n instance to keep published, no sub-workflow architecture to maintain.

---

### Migration Path from n8n

**Phase 1 — Set up Trigger.dev project**
- Create account on Trigger.dev Cloud (free tier)
- Initialise TypeScript project, install SDK
- Port `ews-client.ts` and `ews-parser.ts` from the FastAPI spec in `fastapi-workmail-implementation-debrief.md` — all SOAP bodies and parser logic are fully documented there
- Implement and test the four workmail tasks locally (`trigger dev`)

**Phase 2 — Deploy and validate**
- Deploy to Trigger.dev Cloud prod environment
- Connect Claude via Trigger.dev MCP server
- Validate all four operations against live WorkMail accounts
- Run the same curl-equivalent tests from the n8n debrief

**Phase 3 — Decommission n8n**
- Once Trigger.dev is validated, unpublish the n8n workflow
- Cancel n8n subscription if no other workflows remain

**Phase 4 — Add future capabilities**
- Security screening task
- Draft reply generation
- Human-in-the-loop approval gates
- Additional Sherpa identities (one env var each)

---

### Comparison: n8n vs Trigger.dev for Sherpa

| Concern | n8n | Trigger.dev |
|---|---|---|
| Version control | ❌ JSON export only | ✅ Git native |
| Testability | ❌ Not possible | ✅ Plain TypeScript unit tests |
| CI/CD | ❌ Manual publish | ✅ `trigger deploy` in pipeline |
| Execution history | ✅ Visual | ✅ Per-step dashboard |
| MCP support | ✅ (instance-level) | ✅ Official MCP server |
| Durable execution | ❌ | ✅ Resumable from any step |
| Multi-account credentials | ⚠️ Sub-workflow architecture | ✅ Plain dict + env vars |
| Adding new account | Add sub-workflow + Switch output | One env var + one line |
| Adding new capability | Duplicate entire workflow | New task file |
| TypeScript throughout | ❌ Expression language + JS blobs | ✅ |
| Open source | ✅ Apache 2.0 (fair-code) | ✅ Apache 2.0 |
| Self-hostable | ✅ | ✅ |
| Free tier | ✅ | ✅ |
| Pre-built SaaS connectors | ✅ (n8n strength) | ❌ |

The one genuine advantage n8n retains is pre-built connectors for SaaS tools. For the Sherpa use case — which is direct EWS SOAP calls to WorkMail — those connectors are irrelevant. If future Sherpa workflows need Slack, Notion, or CRM integrations, the connector question is worth revisiting. But for everything in the current and planned roadmap, Trigger.dev is the stronger choice.

---

## Summary

Trigger.dev is what n8n should be for developer-built agentic workflows: code-first, git-native, CI/CD deployable, fully observable, and durably executable. The MCP integration is first-class and explicitly designed for the Claude + agent workflow pattern.

For Sherpa specifically, it eliminates the sub-workflow credential architecture, the untestable code nodes, the `$json.body.*` expression fragility, and the manual publish-to-test cycle — replacing all of it with plain TypeScript in a git repo, unit-testable locally, and deployed automatically on merge.

The full implementation specification for the WorkMail tasks already exists in `fastapi-workmail-implementation-debrief.md` — all SOAP bodies, XML parser logic, and EWS gotchas apply directly. The only translation needed is from Python to TypeScript, which is mechanical.

---

*27 February 2026 — Sherpa Agent Infrastructure*
