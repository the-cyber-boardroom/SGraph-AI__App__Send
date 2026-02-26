# Research Brief: Claude MCP-Native Automation — Email & Beyond

## Objective

Identify the best **cloud/SaaS** solutions for building a general-purpose GenAI automation layer where Claude (claude.ai web) orchestrates business workflows via MCP — starting with email (send + inbox) as the first use case, but designed to scale across many future agent use cases.

**The non-negotiable starting point: the solution must have native MCP server support that works with Claude's custom connector setup today.**

Everything else — email backend, observability, CI/CD — is evaluated only after that filter is satisfied.

### Why MCP-First

MCP is the correct abstraction for this layer. Without it, Claude can only interact with external services by writing code (raw HTTP calls, parsing responses, handling auth) in the sandbox — which works, but is brittle, unreusable, and has to be reimplemented in every conversation. With MCP, capabilities are encapsulated once in a server and exposed as native tool calls (`send_email`, `list_inbox`, `get_email`) that Claude can call cleanly, with no code required on the conversation side. The SG/Send integration in this project is the proof of concept: what started as curl + Python became clean, reusable tool calls once the MCP server exposed the right methods.

### Target Architecture

```
Claude (claude.ai web)
    ↓ MCP tool call (SSE transport, custom connector)
Automation Platform (MCP-native, cloud/SaaS)
    ↓ workflow execution
AWS WorkMail / SES (or equivalent — not Gmail)
    ↓
Customer inbox
```

Email is the first use case. The automation platform in the middle is not just email middleware — it becomes the **connective tissue between Claude and the entire AWS stack**, reused across notifications, data writes, API calls, customer operations, and any future agent workflow. Getting the platform choice right now matters for everything that follows.

---

## Research Questions

### 1. MCP Server Ecosystem — What Has Native Claude Support Today

This is the primary filter. For each candidate platform, the first question is: **does it expose an MCP server that works with Claude's custom connector (`https://[server]/mcp` SSE transport) as of February 2026?**

- Which automation platforms (n8n, Zapier, Make, Pipedream, Activepieces, Temporal Cloud) have **shipping MCP server support** — not roadmap, not beta, but working today with Claude?
- For each that does:
  - Is it a proper MCP server (SSE transport) or webhook-only? Webhooks can be called from Claude but require manual tool definition and don't benefit from MCP's dynamic tool discovery.
  - What tools does it expose? Can it expose arbitrary workflow triggers as typed MCP tools?
  - Is there a hosted/managed MCP endpoint (SaaS), or does the operator have to run the MCP server themselves?
- Are there dedicated **email MCP servers** (not general automation platforms) that work with Claude and support a non-Gmail backend?
  - SendGrid MCP, Postmark MCP, AWS SES MCP — do any of these exist as of Feb 2026?
  - Any community MCP servers wrapping AWS WorkMail or Fastmail JMAP?
- What is Anthropic's own MCP connector registry / marketplace status as of Feb 2026 — are there officially vetted email or automation connectors beyond Gmail and Google Calendar?

### 2. Email Backend — WorkMail or Equivalent

Given an MCP-capable automation platform, which email backends does it support for both **sending and inbox access**?

- **AWS WorkMail** (preferred):
  - Does the platform support WorkMail SMTP for sending?
  - Does it support WorkMail inbox access (IMAP or EWS) for reading and replying?
  - Can WorkMail credentials be managed programmatically (not UI-only)?
- **Fastmail** — JMAP API is significantly cleaner than IMAP/EWS for programmatic access; any platform support?
- **Transactional APIs for sending only** (Postmark, SendGrid, Mailgun) — if inbox access is handled separately, are these better for the outbound sending leg?
- Gmail and Google Workspace are **explicitly out of scope**.

For each backend: can it be configured as a **dedicated agent identity** (`agent@company.com`) with send-only or scoped permissions — not a human user account?

### 3. CI/CD & Infrastructure as Code — Hard Requirement

The entire automation setup must be **version-controlled, deployable via CI pipeline, and not dependent on manual UI configuration.** This is not optional — it applies to workflows, credentials, environment configs, and the MCP server setup itself.

For each MCP-capable platform, research:

- **Workflows as code**: are workflow/automation definitions stored as code (JSON, YAML, TypeScript) that can be committed to git and diffed in PRs?
- **CLI / API for deployment**: can workflows be deployed programmatically from a CI pipeline (GitHub Actions, GitLab CI, AWS CodePipeline) without touching the UI?
- **Terraform / CDK provider**: does one exist for the platform?
- **Environment management**: can the same workflow be deployed to dev/staging/prod with environment-specific configs?
- **Secrets management**: can credentials be injected at deploy time from AWS Secrets Manager or Parameter Store?
- **Rollback**: can a broken workflow deployment be rolled back via git revert + redeploy?

Platforms that are UI-only with no programmatic management API should be flagged as likely incompatible with this requirement.

### 4. Observability & Control

- What audit trail does each platform provide for agent-triggered actions?
  - Per-execution logs with inputs, outputs, timestamp, and status?
  - Can logs be exported to CloudWatch or an existing AWS observability stack?
- Rate limiting and quotas: can sending be throttled per agent identity at the platform level?
- Recipient scoping: can the platform enforce an allowlist (specific addresses or domains) before executing an email workflow?
- Human-in-the-loop: is there a pattern for approval-gated execution — Claude triggers the workflow, a human approves, then it sends?

### 5. Platform Comparison — Leading Candidates

Evaluate the following specifically through the MCP + Claude + email + CI/CD lens:

- **n8n Cloud** — strong workflow-as-code story (JSON export), REST API for workflow management, AWS integrations; but is its MCP support shipping and Claude-compatible as of Feb 2026?
- **Zapier** — widest connector library, easiest setup; but historically UI-only with limited programmatic management; does Zapier have a proper MCP server and a CI/CD story as of Feb 2026?
- **Make (Integromat)** — scenario API exists; MCP support status?
- **Pipedream** — code-native (Node.js/Python workflows in git), strong API, good AWS integration; MCP support status?
- **Activepieces** — open-source, cloud hosted; MCP support status?
- **AWS-native path** — if no SaaS platform satisfies MCP + CI/CD + email, what is the effort to build a minimal custom MCP server on AWS Lambda + API Gateway, wrapping SES/WorkMail, deployed via CDK/Terraform? This is the fallback but sets the bar the SaaS options must beat.

---

## Evaluation Framework

Score each candidate across these dimensions (fill in as part of the research output):

| Capability | n8n Cloud | Zapier | Make | Pipedream | Custom AWS MCP |
|---|---|---|---|---|---|
| MCP server (SSE, works with Claude today) | ? | ? | ? | ? | ✅ if built |
| WorkMail / non-Gmail email support | ? | ? | ? | ? | ✅ |
| Workflows as code (git) | ? | ? | ? | ? | ✅ |
| CI/CD deploy (no UI required) | ? | ? | ? | ? | ✅ |
| Terraform / CDK provider | ? | ? | ? | ? | ✅ |
| CloudWatch / AWS observability export | ? | ? | ? | ? | ✅ |
| Managed/hosted (no self-hosting) | ✅ | ✅ | ✅ | ✅ | ❌ |
| Build/maintenance effort | low | low | low | low | high |

---

## Desired Output Format

1. **MCP Support Matrix** — which platforms have shipping, Claude-compatible MCP servers as of Feb 2026; rule out anything that doesn't
2. **Recommended Architecture** — the 1–2 platforms that best satisfy MCP + email + CI/CD, with rationale
3. **CI/CD Playbook** — for the recommended platform: specific steps to manage workflows as code, deploy via CI, inject secrets from AWS
4. **Email Backend Recommendation** — WorkMail vs. alternatives for the agent identity + send + inbox use case
5. **Observability Wiring** — how to connect platform execution logs to an existing AWS observability stack
6. **Custom AWS MCP Server** — effort estimate and reference architecture if no SaaS platform satisfies all requirements
7. **Sources** — Anthropic MCP docs, platform API/CLI docs, GitHub repos, practitioner write-ups from 2024–2026

---

## Scope Constraints

- **MCP-first**: any solution without native, working MCP support for Claude is out of scope
- **Cloud/SaaS only**: no self-hosted infrastructure; managed services only
- **Email backend**: AWS WorkMail preferred; Fastmail or transactional APIs acceptable; Gmail and Microsoft 365 explicitly excluded
- **AWS stack**: observability and secrets management should integrate with existing AWS tooling (CloudWatch, Secrets Manager, EventBridge)
- **Timeframe**: MCP launched November 2024 — focus on what is shipping and working in February 2026
- **Avoid**: self-hosted platforms, Gmail/Google Workspace, generic AI email marketing tools, solutions requiring custom infrastructure to expose MCP
