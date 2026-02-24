# Architecture Vision: PKI-Secured Agentic Workflows — Supply Chain Patterns for Multi-Agent Coordination

**version** v0.6.14  
**date** 24 Feb 2026  
**from** Human (project lead)  
**to** Architect (lead), AppSec, Developer, Alchemist  
**type** Architecture vision — cross-domain insight (supply chain → agentic workflows)  

---

## The Insight

Replace "Supplier" with "Agent" in the portable data room architecture. The patterns are isomorphic:

| Supply Chain | Agentic Workflow |
|---|---|
| Manufacturer → Assembler → Distributor → Retailer | Orchestrator → Research Agent → Code Agent → Review Agent |
| Each supplier has a PKI key pair | Each agent has a PKI key pair |
| Each supplier sees only data encrypted for their key | Each agent sees only context encrypted for their key |
| Each supplier adds signed data to the .sgroom | Each agent adds signed outputs to the shared workspace |
| Provenance: who added what, when, signed | Provenance: which agent produced what output, when, signed |
| A compromised supplier can only access their portion | A compromised agent can only access their portion |
| The ZIP travels through the supply chain | The workspace (ZIP / SQLite / shared folder) is the coordination medium |

**The same infrastructure that prevents Supplier C from reading Supplier A's proprietary data prevents Agent C from reading secrets that only Agent A should have.**

---

## Why This Matters: Prompt Injection Blast Radius

The biggest unsolved problem in multi-agent systems is: **what happens when one agent is compromised by prompt injection?**

### Today's Model (No Isolation)

```
Orchestrator gives Agent A:
  - The task description
  - API keys for the database
  - Customer PII for the query
  - Full conversation history from all other agents
  - Access to all shared memory

Agent A gets prompt-injected via malicious content in a web page it fetched.

Blast radius: EVERYTHING.
  - Agent A can exfiltrate API keys
  - Agent A can read all customer PII
  - Agent A can read other agents' outputs
  - Agent A can poison the shared memory for downstream agents
  - Agent A can impersonate the orchestrator
```

### The PKI-Secured Model

```
Orchestrator gives Agent A:
  - The task description (signed by orchestrator)
  - Database API key encrypted ONLY for Agent A's key (not visible to other agents)
  - Customer name (only what Agent A needs — not full PII)
  - Agent A's own previous outputs (signed by Agent A)
  - NO access to other agents' outputs (encrypted for their keys, not Agent A's)
  - NO access to shared memory beyond Agent A's partition

Agent A gets prompt-injected via malicious content in a web page it fetched.

Blast radius: ONLY Agent A's partition.
  - Agent A can see the database API key (it was given to them — necessary for the task)
  - Agent A CANNOT read other agents' secrets (encrypted for other keys)
  - Agent A CANNOT read customer full PII (was only given the name)
  - Agent A CANNOT read other agents' outputs (encrypted for their keys)
  - Agent A CAN poison its own output — but it's SIGNED by Agent A's key
    → Downstream agents can verify the signature
    → If Agent A's output is suspicious, the orchestrator can quarantine it
    → The damage is contained to one agent's output, not the entire workflow
```

**PKI doesn't prevent prompt injection. It contains the blast radius.**

---

## Issues-FS as the Coordination Layer

Issues-FS already provides the primitives for agent-to-agent communication:

| Issues-FS Concept | Agentic Workflow Application |
|---|---|
| **Issue** | A task or message between agents |
| **Issue creator** | The orchestrator or the agent that initiated the task |
| **Issue assignee** | The agent responsible for execution |
| **Issue comments** | Agent outputs, status updates, intermediate results — all signed |
| **Issue labels/tags** | Task type, priority, security classification |
| **Issue state** | pending → in_progress → completed → verified |
| **Issue links** | Dependencies between tasks (Agent B needs Agent A's output) |
| **Issue history** | Full provenance: every state change signed by the agent that made it |

### The Workflow as a Graph of Issues

```
Issue #1: "Research competitor pricing"
  Created by: Orchestrator (signed)
  Assigned to: Research Agent
  Encrypted context: { search_terms: [...], budget_api_key: "..." }
    → budget_api_key encrypted ONLY for Research Agent
  Status: completed
  Output: { findings: [...] } (signed by Research Agent)

Issue #2: "Generate pricing recommendation"  
  Created by: Orchestrator (signed)
  Assigned to: Analysis Agent
  Encrypted context: { 
    research_findings: [ref: Issue #1 output],  ← signed by Research Agent
    internal_pricing: "..." ← encrypted ONLY for Analysis Agent
    customer_segments: "..." ← encrypted ONLY for Analysis Agent
  }
  Status: completed
  Output: { recommendation: [...] } (signed by Analysis Agent)

Issue #3: "Review recommendation for compliance"
  Created by: Orchestrator (signed)
  Assigned to: Compliance Agent
  Encrypted context: {
    recommendation: [ref: Issue #2 output],  ← signed by Analysis Agent
    compliance_rules: "..." ← encrypted ONLY for Compliance Agent
    NOTE: Compliance Agent CANNOT see internal_pricing or budget_api_key
          Those were encrypted for other agents only.
  }
```

Each issue is a signed, encrypted message. Each agent sees only what's in their envelope. The graph of issues is the provenance chain.

---

## The Workspace: ZIP / SQLite / Shared Folder

The `.sgroom` portable data room maps directly:

### As a ZIP File (.sgworkflow)

```
workflow-pricing-analysis.sgworkflow
├── manifest.json                ← Workflow metadata, agent roster, status
├── agents/
│   ├── orchestrator.pub         ← Orchestrator's public key
│   ├── research-agent.pub       ← Research Agent's public key
│   ├── analysis-agent.pub       ← Analysis Agent's public key
│   └── compliance-agent.pub     ← Compliance Agent's public key
├── issues/
│   ├── 001-research.json.enc    ← Issue #1 (encrypted per-agent sections)
│   ├── 002-analysis.json.enc   ← Issue #2
│   └── 003-compliance.json.enc ← Issue #3
├── secrets/
│   ├── budget-api-key.enc       ← Encrypted ONLY for Research Agent
│   ├── internal-pricing.enc     ← Encrypted ONLY for Analysis Agent
│   └── compliance-rules.enc     ← Encrypted ONLY for Compliance Agent
├── outputs/
│   ├── 001-research-output.json.sig    ← Signed by Research Agent
│   ├── 002-analysis-output.json.sig    ← Signed by Analysis Agent
│   └── 003-compliance-output.json.sig  ← Signed by Compliance Agent
└── audit/
    └── log.json.sig             ← Every action, signed, timestamped
```

### As SQLite

Same structure, but in a single `.db` file. Each table row is encrypted per-agent. SQLite is useful when agents need to query (e.g., "show me all issues assigned to me") without decrypting everything.

### As a Shared Folder (MemoryFS)

Same structure on a shared file system. Works with the existing MemoryFS abstraction — S3, local disk, or in-memory. The encryption layer is the same regardless of the storage backend.

---

## Secret Management: Agents Get Secrets When They Need Them

Today's agentic frameworks dump all secrets into the agent's environment at startup. This is the equivalent of giving every supplier in the supply chain the master key to every filing cabinet.

### The PKI Model for Agent Secrets

```
Orchestrator creates the workflow:

  Secret: DATABASE_API_KEY
    Encrypted for: Research Agent ONLY
    Valid for: Issue #1 ONLY (one-time decryption token)
    After use: key material is wiped from Research Agent's memory

  Secret: INTERNAL_PRICING_DATA
    Encrypted for: Analysis Agent ONLY
    Valid for: Issue #2 ONLY
    After use: wiped

  Secret: COMPLIANCE_RULEBOOK  
    Encrypted for: Compliance Agent ONLY
    Valid for: Issue #3 ONLY
    After use: wiped
```

**No agent ever sees a secret that isn't encrypted for their key — PROVIDED each agent runs in a separate, isolated execution environment (container, serverless function, or VM).** Encryption alone is not isolation: if agents share a process, a compromised agent can read other agents' private keys and decrypted data directly from memory. The cryptographic boundary selects WHO can read the data; process-level isolation ensures they're the ONLY ones who can. A prompt injection in the Research Agent cannot access INTERNAL_PRICING_DATA because: (a) it's encrypted for the Analysis Agent's key, AND (b) the Analysis Agent's key only exists inside a separate container that the Research Agent has no access to.

**Further reading**: see the companion brief "Agent Isolation Reality — Why Cryptographic Boundaries Require Process Isolation" (v0.6.14) for a deep dive on OS-level isolation boundaries, why in-process encryption is insufficient, and how the .sgworkflow file solves the state management problem across isolated containers.

### Time-Bounded Secrets

Secrets can be encrypted with an additional time constraint:

```
Secret: DATABASE_API_KEY
  Encrypted for: Research Agent
  Valid after: 2026-02-24T10:00:00Z (workflow start)
  Valid until: 2026-02-24T10:05:00Z (5-minute window)
  
  If Research Agent tries to decrypt after the window: fails.
  If Research Agent is compromised and the attacker tries to 
  exfiltrate for later use: the time-bounded decryption token 
  has expired.
```

This borrows from the self-destructing short codes in the receiver experience brief — the same pattern applied to agent secrets.

---

## Provenance: Unforgeeable Audit Trail

Every agent action is signed with the agent's private key:

```
Audit log entry:
{
  timestamp: "2026-02-24T10:02:34Z",
  agent: "research-agent",
  action: "completed_issue",
  issue_id: "001",
  output_hash: "sha256:abc123...",
  input_hashes: ["sha256:def456..."],  ← hashes of the inputs it consumed
  signature: sign(research_agent_private_key, ...)
}
```

### What This Gives Us

| Question | How to Answer |
|---|---|
| Which agent produced this output? | Check the signature. Only the agent with the private key could have signed it. |
| Did this agent see data it shouldn't have? | Check the encrypted inputs. If the data was encrypted for a different agent, this agent couldn't have decrypted it. |
| Was this output tampered with? | Check the hash. The signed hash in the audit log must match the output. |
| In what order did agents execute? | Timestamps in the audit log, signed by each agent. |
| Did the orchestrator authorise this task? | The issue creation is signed by the orchestrator. The agent can verify the orchestrator's signature before executing. |
| Was a secret used outside its authorised window? | The time-bounded decryption token logs usage. Attempts outside the window are logged and fail. |

**An attacker who compromises one agent cannot forge another agent's signatures, cannot decrypt another agent's secrets, and cannot alter the audit trail without detection.**

---

## Prompt Injection Defence in Depth

PKI-secured workflows create multiple layers of defence:

| Layer | What It Prevents |
|---|---|
| **Container / VM isolation (FOUNDATIONAL)** | Each agent in a separate container. Private keys physically separated. Memory isolation enforced by the OS kernel. Without this layer, all other layers can be bypassed by direct memory access. See companion brief: "Agent Isolation Reality." |
| **Encrypted secret isolation** | Compromised agent cannot access other agents' secrets (encryption + container isolation together) |
| **Signed outputs** | Compromised agent's outputs are identifiable — downstream agents can verify the signature and apply extra scrutiny |
| **Minimum context principle** | Each agent receives only the data it needs. Less data in context = less data available to exfiltrate. |
| **Time-bounded secrets** | Even if a secret is extracted, it expires. The window of exploitation is limited. |
| **Output hash verification** | If a compromised agent produces output that doesn't match expected patterns, the orchestrator can detect anomalies before passing to the next agent. |
| **Agent trust scores** | Apply the trust web model: agents that produce consistently good outputs build trust. An agent that suddenly produces anomalous output gets flagged — same blast radius / network destruction pattern. |
| **Workflow rollback** | Every step is signed and versioned. If an agent is compromised, roll back to the last known-good state. The signed audit trail shows exactly where the compromise occurred. |

### The Kill Chain for a Prompt Injection Attack

```
Attack: Malicious content in a web page injects instructions into Research Agent

Step 1: Research Agent is compromised
  → Agent tries to exfiltrate data
  
Step 2: What the attacker CAN access:
  → Research Agent's task description (the search terms)
  → The database API key (encrypted for this agent — it has access)
  → Its own previous outputs
  
Step 3: What the attacker CANNOT access (with proper container isolation):
  → Internal pricing data (encrypted for Analysis Agent — different key, different container)
  → Compliance rulebook (encrypted for Compliance Agent — different key, different container)  
  → Other agents' outputs (encrypted for their respective keys, decrypted only in their containers)
  → The orchestrator's master context (in the orchestrator's container)

Step 4: The attacker tries to poison downstream:
  → Research Agent produces malicious output
  → BUT the output is signed by Research Agent's key
  → The orchestrator or Analysis Agent can verify: 
     "This output is from Research Agent. Let me validate it 
      before passing to the next stage."
  → Anomaly detection catches suspicious output
  → Workflow pauses. Research Agent is quarantined.
  → The damage is ONE agent's output. Not the entire workflow.
```

---

## Connection to Existing Architecture

| Existing Component | How It Applies |
|---|---|
| **Portable Data Rooms (.sgroom)** | The workflow IS a portable data room. Same ZIP format, same encryption, same per-participant access control. |
| **Issues-FS** | The coordination layer. Issues are tasks. Comments are outputs. Labels are classifications. History is provenance. |
| **Trust Web** | Agent trust scores. Agents that produce good outputs build trust. Anomalous agents get flagged. Network destruction pattern applies if an agent framework is compromised. |
| **Self-destructing short codes** | Time-bounded secrets. One-use decryption tokens for agent secrets. |
| **MemoryFS abstraction** | Workflow can run on ZIP, SQLite, S3, or in-memory. Same code, different backend. |
| **Scanning chain** | Agent outputs can be scanned before being passed downstream. LLM-powered analysis of intermediate outputs for anomalies. |
| **Fractal document signing** | Agent outputs are signed at the granularity level needed — per-issue, per-field, per-token. |
| **Zero lock-in principle** | The workflow format is open. Any agent framework can produce and consume .sgworkflow files. Not tied to any specific LLM or agent platform. |

---

## The Product Opportunity

This is a new product category: **PKI-secured agent orchestration infrastructure.**

| Who Needs This | Why |
|---|---|
| **Enterprise AI teams** | Running multi-agent workflows on sensitive data. Need audit trails, secret isolation, compliance. |
| **AI safety researchers** | Studying prompt injection containment. Need measurable blast radius reduction. |
| **Agent framework developers** (LangChain, CrewAI, AutoGen, etc.) | Their frameworks have no cryptographic isolation. This is an infrastructure layer they can adopt. |
| **Regulated industries** (finance, healthcare, legal) | Running agents on regulated data. Need provenance, access control, audit trails that satisfy regulators. |
| **Our own project** | We're already running 19 agents. We need this for ourselves. Dogfooding. |

### ILC Strategy Application

```
We HAVE:     Issues-FS, MemoryFS, PKI infrastructure, portable data rooms
We BUILD:    .sgworkflow format, agent key management, time-bounded secrets  
We PUBLISH:  Open source agent orchestration security layer
We PROMOTE:  Agent framework integrations (LangChain plugin, CrewAI adapter)
Others BUILD ON TOP: Agent marketplaces, enterprise agent governance, compliance tooling
```

---

## Acceptance Criteria

| # | Criterion |
|---|---|
| 1 | .sgworkflow format defined (agents, issues, secrets, outputs, audit) |
| 2 | Each agent has a unique PKI key pair generated at workflow start |
| 3 | Secrets encrypted per-agent (agent X cannot decrypt agent Y's secrets) |
| 4 | Time-bounded secret decryption tokens (expire after window) |
| 5 | Agent outputs signed with agent's private key |
| 6 | Audit trail: every action signed, timestamped, hash-chained |
| 7 | Orchestrator verifies agent output signatures before passing downstream |
| 8 | Anomaly detection: flag outputs that deviate from expected patterns |
| 9 | Workflow rollback to last known-good state on compromise detection |
| 10 | Prototype: 3-agent workflow (research → analysis → review) with secret isolation |
| 11 | Demonstrate blast radius containment: compromise one agent, show others are unaffected |

---

This document is released under the Creative Commons Attribution 4.0 International licence (CC BY 4.0). You are free to share and adapt this material for any purpose, including commercially, as long as you give appropriate credit.
