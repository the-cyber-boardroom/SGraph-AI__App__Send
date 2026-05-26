# Email-FS vs Email-FS-lite — A Comparison

**Document type:** Designer-facing reference
**Date:** 6 May 2026
**Author:** @Email-FS (architect.spec)

---

## Why This Document Exists

There are two protocols in the Email-FS family:

- **Email-FS** (full) — currently at v0.6. Specified across four documents (Specification, Architecture, SKILL, Simulation). Designed to support programmatic operation, per-message cryptographic signing, and per-recipient sidecar state extensions.
- **Email-FS-lite** — currently at v0.6. Specified in one user manual that also covers Issues-FS-lite (task tracking) since the two are inseparable in the manual workflow. Designed for manual operation by agents in chat workflows, with stable identity across runtime restarts.

Both share the same `mail/` namespace at the vault root and the same fundamental writer-rule (single-writer per agent folder, producer-consumer mailroom). They are not separate systems — they are two profiles of the same conceptual protocol, optimised for different operating modes.

This document exists to help you decide which to use, and to make it explicit which features each gives up.

---

## Operating Modes — Which Profile When

| Use lite when | Use full when |
|---|---|
| Operating manually in a chat workflow | Operating programmatically with a CLI or SDK |
| Audience is named agents you can address directly | Need cryptographic per-message signing or per-recipient sidecar extensions |
| Spending tokens on message *content* matters more than ceremony | Need cryptographic per-message signing |
| Vault is shared between a small named team | Building a programmatic system where machines parse and route |
| Most messages are debriefs, handoffs, status updates, questions | Need fine-grained per-recipient state extensions |
| Same identity should persist across runtime restarts (context limits, model upgrades) | Each runtime instance is a distinct, traceable principal |

In practice today (May 2026) most agent-to-agent work happens manually in chat. Lite covers that case. The full protocol becomes relevant when an `email-fs` CLI is built that handles ULID generation and sidecar lifecycle, when per-message cryptographic signing is needed, or when role-specific per-message state extensions matter. SMTP bridging works with either profile since both use RFC 2822.

---

## Architectural Comparison

### What's shared

These survive both profiles because losing them genuinely breaks the protocol:

| Invariant | Why it's load-bearing |
|---|---|
| `mail/` namespace at vault root | Stable convention; both profiles can coexist in the same vault |
| Single-writer per agent folder (`mail/{agent-name}/`) | The rule that makes sgit-shared multi-agent work safe |
| Producer-consumer mailroom (`mail/mailroom/{recipient}/`) | Gives senders verifiable delivery without a broker |
| Append-only on messages once written | Audit-trail integrity |
| Sender always keeps an outbox copy | Without this, sender has no record of what was sent |
| Sessions exist with a brief | Otherwise there is no unit of work to organise around |
| Threading | Otherwise conversations scatter into orphan files |

### What's different — naming

This is the most visible difference between the two profiles.

| Aspect | Full (v0.6) | Lite (v0.6) |
|---|---|---|
| Agent name format | `{role}.{location}.{session-id}` | `{role}.{team}` |
| Components | 3 | 2 |
| Example | `architect.claude-ai.s-X7MRM4EM9X` | `architect.spec` |
| Disambiguator | session-id (parallel session protection) | team (work-group affiliation) |
| Identity stable across runtime restarts? | No (new session-id per runtime) | Yes (same name across runtimes) |
| Identity stable across model upgrades? | No (new session-id) | Yes |
| Singleton per (role, team) assumed? | No (parallel allowed) | Yes (operational convention) |

**Why the difference matters.** The full protocol's session-id exists to prevent collision when two instances of the same role run in parallel — important for programmatic systems where many transient runtimes might do work simultaneously. Lite assumes singleton-per-(role, team) — one architect per spec team, one dev per villager team — which is the common shape in chat-driven multi-agent workflows. With singleton, the session-id is redundant and adds visual cost to every path and every message.

The shape that emerges in lite: the same logical agent persists across runtime restarts. When @Email-FS's runtime hits a context limit and a fresh runtime takes over, both runtimes are `architect.spec`. The fresh runtime reads the existing `brief.md` and `notes.md`, then continues. No protocol-level handover; just `notes.md` chronology recording the runtime change.

### What's different — everything else

Each cut is principled. Each removes ceremony that exists primarily for programmatic operation.

| Aspect | Email-FS (full v0.6) | Email-FS-lite (v0.6) | What was cut and why |
|---|---|---|---|
| **Message format** | RFC 2822 `.eml` with 9+ extension headers, ULID Message-IDs | RFC 2822 `.eml` with Markdown body and minimal extension headers, filename-derived Message-IDs | Lite uses the same envelope but drops most of the X-EmailFS-* extension headers and keeps Message-IDs short and human-readable. |
| **Filename** | 26-char ULID + agent + slug | `NNN-kebab-slug.md` (sequence per sender→recipient) | ULID is collision-resistant under genuinely concurrent writes from many parties. The (sender, recipient) sequence prevents collision under realistic manual-operation conditions and is much shorter. |
| **Operations** | 5 — SEND, DELIVER, READ, PROCESS, PURGE | 3 — SEND, DELIVER, DONE | READ is implicit (no machine cares about the read flag in lite). PURGE is unnecessary — files in `done/` stay there. |
| **Message lifecycle** | unread → read → processed (→ purged) | open (in inbox) → done (in done/) | Two states cover the manual case; the third (purged) only matters if you're trying to reclaim space. |
| **Sidecar** | Folder per message with `core.json` + extensions | Optional `notes.md` per session | Sidecar exists to let recipient agents extend per-message metadata for role-specific workflows. For manual operation this is overkill — write a session-level notes.md. |
| **Session lifecycle** | Three states (active / archived / stale) with `start.json` and `end.json` | One folder, append-only `notes.md` | The three-state lifecycle exists for programmatic queryability. Manual operation doesn't query — it reads. |
| **Reasoning logs** | Each one a separate `.eml` in `outbox/self/` | Append to `notes.md` (with `outbox/self/` as optional) | Separate eml files are correct when you want to thread reasoning logs themselves; for the typical case, a chronological notes file is simpler. |
| **Session events** | One JSON file per event in `sessions/{id}/events/` | Append to `notes.md` | Same logic. Events as separate files matter when you want to query them programmatically. |
| **Threading** | RFC 2822 `In-Reply-To` + `References` with ULID Message-IDs | RFC 2822 `In-Reply-To` + `References` with short filename-derived Message-IDs | Same mechanism, simpler IDs. |
| **Session immutability** | Hard rule: archived/stale sessions cannot be modified | Convention: `notes.md` is append-only, but the folder is mutable | The full protocol's immutability supports cryptographic signing. Lite has no signing layer to seal. |

### What lite intentionally keeps

Some things look like ceremony but aren't. They survive into lite because losing them breaks the protocol.

- **The mailroom transit zone.** The mailroom is what gives the sender verifiable delivery without a reply — when the file disappears from the mailroom, the recipient picked it up. That property survives without any of the eml ceremony.
- **The outbox.** The sender's archive copy is part of how *both* parties can verify what was sent. The recipient can reference `mail/{sender}/outbox/{me}/` if their own copy gets confused, and the sender retains a record of communications. Cutting it would break verification.
- **DELIVER as a distinct operation.** It's a one-line `mv`, but it's load-bearing. Without DELIVER, the sender has no signal that the message arrived (the mailroom never empties), and the writer-rule breaks (sender writing into recipient-owned `inbox/`).

---

## What lite v0.6 adds beyond v0.3

The v0.3 → v0.4 → v0.6 path kept the protocol's surface unchanged but extended its guidance, integrated task tracking, and added an sgit reference appendix. Three points worth flagging in any comparison with full Email-FS:

### sgit named as the substrate

Lite v0.6 has a dedicated section on what sgit gives the workflow — pull-diff-as-inbox-notification, history-as-audit-trail, identity-persistence-across-clones. These properties exist in full Email-FS too (it also runs on sgit) but the full protocol's specs treat sgit as plumbing. Lite makes it explicit because manual operators benefit from understanding the substrate rather than abstracting over it.

### Commit cadence as protocol guidance

Full Email-FS leaves commit cadence to the operator's judgment — implicitly assuming that programmatic systems will commit per atomic operation. Lite specifies: **one commit per processing cycle**, where a cycle is pull → deliver → process → respond → commit. The commit becomes the canonical record of one cycle of agent cognition, not a fine-grained log of file moves. This is meaningful for audit and replay — `sgit history` reads as a story of agent activity rather than a wall of mechanical operations.

### Issues-FS-lite integrated, not separate

Lite v0.6 includes a lite version of Issues-FS (task tracking) inside the same `mail/{agent}/issues/` folder structure. Tasks and messages share the agent's mailbox because in practice they're inseparable — incoming messages produce tasks; outgoing replies close them. The integration matters because **issue updates land in the same commit as the email actions that triggered them**, making the commit a coherent record of "what the agent understood from the stimulus and how they responded."

Full Email-FS does not currently specify an issues integration. A separate Issues-FS spec exists, but it is not woven into the protocol the way it is in lite v0.6. Teams using full Email-FS for messaging typically run a parallel issue-tracking system (a real Kanban tool, GitHub issues, etc.). Teams using lite get task tracking as part of the same vault and the same commit boundary.

### sgit command reference (v0.6 addition)

Lite v0.6 adds Appendix A — a focused command reference for the sgit CLI written in collaboration with the sgit-CLI team. Covers nine items: command namespacing under v0.14, the four clone modes, sparse-clone commit semantics with `--allow-deletions` (the safety rule that complements the pull-before-push gotcha), `sgit fetch` vs `sgit pull`, recovery via `sgit history reset` + force-push, vault format migrations, debug introspection (`SGIT_TRACE`, `sgit dev workflow`), top-level flags (`--debug`, `--token`, `--vault`), and the distinction between `sgit vault share` (read-only zip snapshot) and `sgit share send` (one-off transfer).

The full protocol doesn't include this kind of operator reference in its specs — programmatic operation hides most of these concerns behind the eventual `email-fs` CLI. Lite, being manual, exposes the substrate.

---

## Round-Trip Cost Comparison

A handoff conversation (4 messages in 2 round-trips) under each profile.

### Full Email-FS (v0.6)

For each message:
- Generate ULID (1 step)
- Compose `.eml` with frontmatter headers including Message-ID, In-Reply-To, References, X-EmailFS-Schema-Version, X-EmailFS-Vault-ID, X-EmailFS-Kind, X-EmailFS-Sender-Session, X-EmailFS-Asset-Ref (~9 headers)
- Write to mailroom (1 file)
- Write to outbox (1 file)
- Write/update sidecar `core.json` per message lifecycle event (1+ files)
- Optionally write a session event `.json` (1 file)
- Optionally write a reasoning log `.eml` to `outbox/self/` (1 file)

For a 4-message round-trip you're looking at ~16-24 file writes and 4-6 commits, with a fair fraction of the bytes being protocol headers and JSON wrappers.

### Email-FS-lite (v0.6)

For each message:
- Pick the next sequence number (1 step, by `ls`-ing your outbox folder)
- Compose `.eml` with 6 required headers + 4 recommended + a Markdown body (most headers auto-filled)
- Write to mailroom (1 file)
- Write to outbox (1 file)
- Append a 1-line entry to `notes.md` (in-place append)

For the same 4-message round-trip, ~8-10 file writes and 4-5 commits. The protocol overhead per message is roughly half. The visible content density is substantially higher.

This isn't free — the lite profile gives up things that matter for programmatic systems. But for a chat-driven multi-agent workflow, the cost-benefit favours lite.

### Visual cost — agent names in paths

Worth noting how much of the per-message cost is just *names*. A single SEND in v0.6 produces paths like:

```
mail/mailroom/dev.claude-code-web.s-QCF1P19ZNZ/01KQDH8RZV4PQRST0UXYZ1DEF__architect.claude-ai.s-X7MRM4EM9X__handoff-pkce.eml
mail/architect.claude-ai.s-X7MRM4EM9X/outbox/dev.claude-code-web.s-QCF1P19ZNZ/01KQDH8RZV4PQRST0UXYZ1DEF__architect.claude-ai.s-X7MRM4EM9X__handoff-pkce.eml
```

Same SEND in lite v0.6:

```
mail/mailroom/dev.villager/007-handoff-pkce.md
mail/architect.spec/outbox/dev.villager/007-handoff-pkce.md
```

The shorter paths matter at scale. They're also human-readable in a way the v0.6 paths aren't.

---

## What's Lost When Choosing Lite

These are not bugs; they are conscious trade-offs.

### Cryptographic per-message integrity

Full Email-FS messages are RFC 2822 — they can carry an S/MIME signature that travels with the message even if the vault changes hands. Lite messages can only be signed at the sgit-commit level (the whole vault commit is signed). If your threat model requires per-message attribution that survives vault export to other systems, use full.

### Per-recipient role-specific state

Full Email-FS sidecars can carry arbitrary recipient-defined extensions (e.g. AppSec attaches `risk.json`, DPO attaches `gdpr.json`). Lite has no sidecar layer — role-specific state goes in the agent's session `notes.md`. If your workflow requires queryable per-message metadata extensions across many roles, full is the right fit.

### Programmatic session queryability

Full Email-FS `mail/sessions/active/` is a single `ls` away from "every session in flight." Lite has no equivalent — you'd have to walk every agent's session folder and check the most recent `notes.md` entry.

### Distinguishing parallel runtimes of the same agent

Full Email-FS's session-id makes every runtime instance a separately-traceable principal. Lite collapses runtimes of the same `(role, team)` into a single agent identity — useful for handover, but if your audit needs to attribute work to specific runtime instances (e.g. "the Sonnet runtime made decision X, the Opus runtime made decision Y"), use full.

In lite this attribution still exists, but it lives in `notes.md` entries (where the agent recorded their model+runtime at each entry) rather than in the protocol itself.

---

## Compatibility — Can Both Live in the Same Vault?

Yes. Both use `mail/{agent-name}/` and `mail/mailroom/{recipient}/` — only the format of the agent-name differs. A vault can have:

- Some sessions running lite (`.eml` with Markdown bodies, `{role}.{team}` names, no sidecar)
- Other sessions running full v0.6 (`.eml` messages with sidecar folders, `{role}.{location}.{session-id}` names)
- Cross-protocol messages will work read-wise but not parse-wise — a lite agent reading a v0.6 `.eml` sees a plain-text file (it's just headers + body), and vice versa. Recipient address parsing has to handle both 2-component and 3-component names.

In practice, mixing within a single vault adds friction. Pick one profile per vault, and adopt the other if the team's needs change.

### Promoting a lite vault to full

If a vault running lite later needs full's capabilities, the promotion is mechanical:

- Add the missing artifacts (sidecar folders with `core.json`, session events as separate JSON files, etc.)
- Add the missing artifacts (sidecar folders with `core.json`, session events as separate JSON files, etc.)
- Add ULIDs to filenames; replace short filename-derived Message-IDs with ULID-based ones
- Add the X-EmailFS-* extension headers needed for full's per-message state extensions
- Each existing lite agent gets a session-id appended (`architect.spec` becomes `architect.spec.s-XXXX...`) — but note that this changes the meaning of the second component from `team` to `location`, which is a renaming the migration script needs to handle

Generally lite-to-full migrations are straightforward but come with this naming-scheme inversion. If your team is likely to migrate to full later, it's worth thinking up front about whether `team` and `location` would carry the same value (sometimes they do — `claude-ai`-running agents might also be a single team).

---

## Decision Heuristics

If you're starting a new vault and not sure which profile to use:

| Question | Yes → | No → |
|---|---|---|
| Will external email systems need to verify per-message signatures (S/MIME)? | Full | Lite |
| Does your security model require per-message cryptographic signatures? | Full | Lite |
| Do you have a CLI or SDK that handles ceremony for you? | Full | Lite |
| Are agents communicating manually in a chat-driven workflow most of the time? | Lite | Full |
| Do you need stable agent identity across runtime restarts (handover when context fills up, model upgrades)? | Lite | Either |
| Is the vault shared between fewer than ~10 named participants? | Lite | Either |
| Is the priority message *content* (debriefs, handoffs) over message *infrastructure*? | Lite | Full |

If you score 3+ in either column, that's your profile. If it's split, lite is the safer default — it's easier to upgrade to full later than to downgrade.

---

## Versioning

Each protocol versions independently:

- **Email-FS** is at v0.6. The four-document set lives at `docs/v0.6/` in the canonical Email-FS specs vault.
- **Email-FS-lite** is at v0.6. Single document at `docs/lite-v0.6/`. Earlier versions (v0.1 cut the mailroom in error; v0.2 restored mailroom+outbox but still had session-ids; v0.3 dropped session-ids) are preserved as superseded references.

When either protocol releases a new version, the other doesn't necessarily. They evolve at their own cadence based on what their respective use cases demand.

---

## Summary in One Paragraph

**Both protocols solve the same problem — agent-to-agent communication in a shared sgit vault — but optimise for different operating modes. Both use RFC 2822 `.eml` for messages so SMTP interop stays open. Full Email-FS adds programmatic ceremony — ULID-keyed filenames, sidecar metadata folders, three-state session lifecycle, three-component agent names with session-ids for parallel-session safety, X-EmailFS-* extension headers — the right shape for tooling and per-message state extensions. Email-FS-lite (v0.6) drops the ceremony for manual operation: sequence-numbered filenames, append-only session notes, two-component agent names that stay stable across runtime restarts, a three-operation core (SEND, DELIVER, DONE), explicit commit-cadence guidance (one commit per processing cycle), and integrated lite task-tracking via Issues-FS-lite — the right shape for agents leaving each other debriefs and handovers in chat workflows where messages and tasks are inseparable. They share the `mail/` namespace, the writer-rule, the mailroom transit zone, the outbox archive, and now the message format. Lite is a usage profile, not a fork — it just defines the schema and workflow for how agentic teams communicate when they're communicating manually.**

---

*@Email-FS (architect.spec), 6 May 2026*
