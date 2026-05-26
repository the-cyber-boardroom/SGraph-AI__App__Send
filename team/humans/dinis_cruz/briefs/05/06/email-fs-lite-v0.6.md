# Email-FS-lite — Agent Manual

**Document type:** User manual / SKILL
**Protocol version:** lite v0.6
**Date:** 6 May 2026
**Author:** @Email-FS (architect.spec)

---

## What This Is

Email-FS-lite is a small protocol for agents working together in a shared sgit vault to leave each other messages — debriefs, handoffs, questions, status updates — and to track their own work. The whole protocol is files in folders. There is no broker, no daemon, no API. Every operation is a filesystem operation you can do by hand: `cat`, `cp`, `mv`, `rm`, `sgit`.

This document also defines a lite version of **Issues-FS** for tracking each agent's own tasks and action plans (§7). Tasks live next to messages because in practice they're inseparable — incoming messages produce tasks; outgoing replies close them. Keeping both protocols in one folder structure (and one document) reflects how agents actually work.

This is the schema and the workflow for how agentic teams communicate. There is no smaller version of this protocol that still supports a coherent multi-agent workflow. Everything below earns its place.

If you are an agent reading this in a chat workflow and you need to communicate with another agent through a shared vault, this is enough.

---

## 1. Vault Layout

This is what an Email-FS-lite vault looks like:

```
{vault-root}/
└── mail/
    ├── sessions/
    │   └── {agent-name}/                    ← one folder per agent identity
    │       ├── brief.md                     ← what this agent is here to do
    │       └── notes.md                     ← append-only working log
    ├── mailroom/                            ← transit zone for messages in flight
    │   └── {recipient-name}/                ← senders write here for this recipient
    └── {agent-name}/                        ← one folder per agent
        ├── inbox/                           ← recipient-owned: messages waiting to handle
        ├── done/                            ← recipient-owned: messages handled
        ├── outbox/
        │   └── {recipient-name}/            ← sender-owned: archive of messages sent
        └── issues/                          ← recipient-owned: this agent's tasks
            ├── open/                        ← active tasks
            ├── blocked/                     ← tasks waiting on something
            └── done/                        ← completed tasks
```

Seven folder concepts, three of them under `issues/`. That's the entire layout.

**Two important properties:**

**Single-writer per agent folder.** Only you write inside `mail/{your-agent-name}/`. Never write inside another agent's folder. This is the rule that keeps things simple under multi-agent work — there is no shared mutable state to fight over.

**The mailroom is a producer-consumer zone.** Senders write *new* files into `mail/mailroom/{recipient-name}/`. The named recipient *moves* (deletes) those files into their own inbox. No one else touches them. This separation is what gives senders a way to see "did my message get delivered?" — when the file you put in the mailroom disappears, the recipient has picked it up.

---

## 2. sgit — How This Protocol Actually Works

sgit is the version-control system the vault sits on. Many of the protocol's properties — delivery confirmation, audit trail, identity persistence across runtime restarts — are actually properties of sgit's commit history, not of the file layout. This section explains what sgit gives you and how to use it.

If you've used git, sgit will feel familiar. The differences (encrypted by default, distributed object store) don't affect the workflow described here.

### 2.1 What sgit gives this workflow

**Pull is your inbox notification system.** When you `sgit pull`, the output tells you exactly what changed in the vault since you last pulled. A clean pull (no changes) means nothing happened — no new mail, no agent activity. You don't need to scan folders. A pull with changes lists every file that was added, modified, or deleted, grouped by commit. That listing *is* the dashboard. If you see no `mail/mailroom/{your-agent-name}/` entries in the pull diff, you have no new mail.

**The commit history is the audit trail.** `sgit history log` shows every commit ever made to this vault, with the commit message, the author, and the file changes. This is critical for:

- *Coordination/conductor roles* who aren't always active — they can scan the history to see who did what and when, without needing real-time visibility.
- *Catching up after time away* — if you've been offline for a while, walking the history forward from your last known state shows you everything.
- *Self-recovery across sessions* — your own past work is in the history. When a fresh runtime instance picks up your identity (because the previous runtime hit context limits, or the model was upgraded, or it's just a new day), the history is part of how the new runtime reconstructs what you've been doing.

**sgit always pulls before push.** Important practical detail: if your local view is stale, sgit will fetch and merge before pushing. This is generally fine, but it means **you must read pull-before-push output carefully**. If new commits arrived between your last pull and your push, those commits' changes are now part of your local working copy. Sometimes this is harmless (someone else committed unrelated changes); sometimes it's significant (a message you were about to reply to has been moved or another agent has acted on something you're about to act on). Don't blindly trust that your push applied your intended state — always verify with `sgit status` after push.

**Identity persists across sgit clones.** When a fresh runtime clones the vault on a new machine (or when an existing runtime re-clones because something went wrong), the agent identity is whatever's in the existing folders. Your `architect.spec` mailbox is still your mailbox. The history is the connective tissue.

### 2.2 Reading sgit changes during a pull

When you `sgit pull`, you'll see something like:

```
Pulling from default...
  ▸ Fetching remote ref
  ▸ Merging trees
  ▸ Updating working copy

  + mail/mailroom/architect.spec/003-feedback-on-spec.eml
  + mail/mailroom/architect.spec/004-question-about-pkce.eml
  + mail/dev.villager/done/007-handoff-pkce-implementation.eml
  + mail/architect.spec/issues/done/002-update-spec-doc-with-pkce.md
Merged: 4 added, 0 modified, 0 deleted
```

Read this carefully:

- The two `+ mail/mailroom/architect.spec/...` lines tell you: **two new messages are waiting for you in the mailroom.** You don't need to `ls` your mailroom — the pull already told you.
- The `+ mail/dev.villager/done/...` line tells you: **@Code finished the work on message 007** that you handed off to them. Sender verification without an explicit reply.
- The `+ mail/architect.spec/issues/done/...` line is from **your own past activity** — perhaps an old runtime of you completed task 002 just before the new runtime started. (Or it's a commit you pushed earlier that you're now seeing because of a sync hiccup.) Either way, read it.

The principle: **what you can see in the pull diff, you don't need to scan for**. The pull diff is the change set; everything else is unchanged from before.

### 2.3 Reading sgit history to catch up

When you arrive (or return after time away):

```bash
sgit history log --max 20
```

shows the last 20 commits. Each commit message is a one-line summary written by the agent who made the commit; the file changes show what they actually did. Walking commits in chronological order tells you the story of the vault.

For a conductor or coordination role, this is the canonical activity log. For your own self-recovery, this is how you reconstruct what you've been doing across runtime restarts.

**Be specific in your commit messages.** Future you (or a different agent) is going to read them. See §6.

### 2.4 sgit's role in audit and accountability

When the protocol talks about "the commit captures what the agent understood and planned" (§6.3), this is what's meant: **the diff of one commit is the canonical record of one cycle of agent cognition**. Email arrived, agent processed it, agent's tasks updated, replies sent — all in one atomic snapshot of the vault. Inspecting that one commit shows you exactly what happened in that cycle.

This is why sgit isn't just plumbing for this protocol. It's the substrate that makes the protocol meaningful for audit and replay.

### 2.5 Browser viewers — reading the vault without sgit

You don't always need the CLI to look at vault contents. Two browser tools render `.eml` and `.md` files inline alongside the file tree:

- **`https://dev.vault.sgraph.ai/en-gb/`** — full vault browser. Open with the vault's URL fragment (e.g. `#{passphrase}:{vault-id}`) and you get a navigable file tree with rendered contents.
- **`https://dev.tools.sgraph.ai/en-gb/vault-peek/`** — focused inspection tool. Same content, narrower UI, useful for quick lookups against a vault you don't routinely work in.

Both decrypt in the browser using the read-key — no server-side access to plaintext. They render `.eml` files with the headers and body laid out cleanly, which makes them especially handy for:

- Humans coordinating async (looking at what an agent sent without cloning the vault)
- Conductors scanning multiple agents' inboxes/outboxes for status
- Sharing vault state with reviewers who don't have sgit installed

For your own working clone, stick with the CLI workflow described above. The browser tools are read-only — they're for *looking*, not for working.

---

## 3. Naming

### 3.1 Agent name

Format: `{role}.{team}`, lowercase, dot-separated. Two components — that's the whole identifier.

| Component | Purpose | Examples |
|---|---|---|
| `role` | What this agent does, OR the human's name (see §3.3) | `architect`, `dev`, `journalist`, `conductor`, `appsec`, `dpo`, `dinis` |
| `team` | What work-group this agent belongs to, OR `human` | `explorer`, `villager`, `town-planner`, `spec`, `human` |

The asymmetry between "agents" and "humans" is real and the naming reflects it: agents are scoped *within* a team (a team has at most one of each role); humans transcend teams (the same human works across teams). So:

- For agents: `role.team` — the team is the affiliation, the role is the work-function.
- For humans: `name.human` — the team is `human`, the name is the disambiguator.

Examples:

```
dev.explorer                           ← dev agent in the explorer team
dev.villager                           ← different dev in the villager team
dev.town-planner                       ← yet another dev, different team
architect.explorer                     ← architect in the explorer team
architect.spec                         ← architect doing spec work (this is me)
journalist.villager                    ← journalist in the villager team
journalist.town-planner                ← same role, different team
dinis.human                            ← human dinis (works across all teams)
alice.human                            ← human alice
```

Note that `dev.explorer` and `dev.villager` are **different agents**, despite sharing a role. They have different mailboxes, different sessions, different briefs. The team-scoping makes this clean — you address them differently because they *are* different.

### 3.2 One identity per (role, team) — singleton convention

**There is exactly one agent per (role, team) pair in a vault at any time.** This is an operational convention rather than a hard protocol rule, but lite is designed around it and many things break if you violate it.

What this gives you:

- **Stable addresses.** `dev.villager` is always reachable at `mail/dev.villager/inbox/`. No looking up "which session-id is current?" — there isn't one.
- **Stable identity across runtime restarts.** When a runtime stops and a fresh runtime picks up the same (role, team), it's the *same* agent. Same mailbox, same outbox, same session folder. The new runtime reads the existing `brief.md` and `notes.md`, then continues. No handover ceremony at the protocol level.
- **Stable identity across model upgrades.** Same (role, team) running on Sonnet today and Opus tomorrow is still the same agent. The `notes.md` records the model change as one entry; the identity doesn't move.

If you genuinely need two agents in the same role on the same team (rare in practice), differentiate via the role name itself. `architect.explorer` and `senior-architect.explorer`, or `architect.explorer` and `architect-design.explorer`. Don't try to encode it elsewhere.

### 3.3 Humans

Humans use `{name}.human`. The team is `human`; the name plays the disambiguating role. Examples:

```
dinis.human
alice.human
```

Humans are first-class peers in the protocol — they have mailboxes, send and receive messages, can have a `brief.md` if they're driving a session. The order (`name.human`) puts the disambiguator in the role-position because for humans, *the name is what distinguishes this person*, and `human` is the team they all share.

A human who participates in multiple teams' workflows still uses one identity (`dinis.human`) — they have one mailbox in the vault. Think of it as: humans aren't bound to a team because they coordinate across teams; their team is just `human`.

### 3.4 @-aliases

Your team may keep an Operating Model document with short aliases like `@Content`, `@Code`, `@Email-FS`, `@Dinis`. Use these in message bodies and subjects for readability. The full agent name is canonical for protocol fields (frontmatter `to:` and `from:`).

---

## 4. Sessions

### 4.1 What a session is

A session is a coherent unit of work for an agent — bounded by a brief at the start. It can span hours or days, many message rounds, many runtime restarts. The runtime can stop and a fresh runtime can resume — they are still the same session because they're the same agent.

**Sessions persist. Task completion is not session end.** A session keeps going until there is no more communication expected on the brief.

### 4.2 Starting a session

When an agent first appears in a vault:

```bash
mkdir -p mail/sessions/{your-agent-name}
mkdir -p mail/{your-agent-name}/{inbox,done,outbox,issues/open,issues/blocked,issues/done}
```

Then write `mail/sessions/{your-agent-name}/brief.md`:

```markdown
# Session brief — {short title}

**Agent:** {your-agent-name}
**Alias:** @YourAlias
**Started:** 2026-05-06T17:00:00Z
**Driver:** dinis.human

## What this session is here to do

One paragraph in your own voice. What's the brief? What's the success
criteria? What does "done" look like?

## Objectives

- First concrete deliverable
- Second
- ...
```

Then start `notes.md` in the same folder with your first entry. See §4.4.

### 4.3 The session folder is your workspace

Two files: `brief.md` (written once, never edited) and `notes.md` (append-only). No events folder, no end.json, no extensions.

### 4.4 notes.md — the append-only log

This is the single place where you record everything about your session that isn't a sent message. Decisions, milestones, things you considered and rejected, who you spoke to, what you got blocked on, runtime restarts. Format:

```markdown
# Session notes — {your-agent-name}

## 2026-05-06 17:05 — Brief understood (Opus, runtime A)

In my own voice, what I think the brief is asking for and how I'll approach
it. This first entry is the "memory anchor" for any future runtime that
resumes the session.

## 2026-05-06 17:42 — Decision: chose X over Y

Rationale: ...
Trade-off: ...

## 2026-05-06 18:12 — Sent reply to @Conductor

See outbox/conductor.explorer/003-pkce-recommendation.eml

## 2026-05-07 09:00 — Resumed (Opus, runtime B)

Picking up from yesterday's last entry. Nothing waiting in inbox. Continuing
the design work on item 3 of the brief.

## 2026-05-07 11:30 — Blocked: waiting on object IDs from @Code

Sent question 004-object-ids-question.eml. Created issues/blocked/005-pkce-token-rotation-q.md.
Blocking until reply.
```

A few rules:
- Always include UTC date + time + a short headline per entry.
- Append only. Never edit a previous entry. If you got something wrong, write a new entry correcting it.
- Note runtime changes — when a fresh runtime instance picks up the session, write an entry like "Resumed (model X, runtime Y)" so the audit trail shows the handover.
- Be honest about uncertainty. The notes are the audit trail; future agents (and future runtimes of *you*) reading this need to know what you actually thought, not the polished version.
- When you make a meaningful decision, write it here. Bar: "would a future reviewer want to see this?"

### 4.5 Resuming a session (across runtime restarts)

When a runtime stops and a fresh runtime picks up the same agent identity:

1. Read `mail/sessions/{your-agent-name}/brief.md` — recover the brief.
2. Walk `notes.md` from oldest to newest — the most recent entries tell you what state work is in. Pay particular attention to the last entry; it's usually the handover note from the previous runtime.
3. Read your `inbox/` for open work (and `issues/open/` for in-flight tasks).
4. Run `sgit history log --max 20` if you want the broader vault context — what other agents have been doing.
5. Append a new entry to `notes.md` saying "Resumed at {time}, model {X}, runtime {Y}, picking up from {summary of last note}." Then continue.

The agent name doesn't change. You are the same agent. The runtime restart is invisible at the protocol level — only visible in `notes.md` because you wrote it there.

This is what makes lite work nicely on top of sgit: multiple sequential runtimes can act as the same agent without protocol overhead. The handover when one runtime hits its context limit and another picks up is just a `notes.md` entry.

### 4.6 Ending a session

Append a final entry to `notes.md`:

```markdown
## 2026-05-06 22:00 — Session complete

Brief satisfied. Sent {N} messages, received {M}. Key outcomes:
- {what you delivered}
- {what's still open and who has it}

Handing off to: {next agent or next session, if any}
```

That's it. Don't delete the session folder, don't move it, don't write end.json. The session is "done" by virtue of the last note saying so. If communication arrives later that requires more work, just append a new entry restarting the session — same folder, same brief.

---

## 5. Messages

### 5.1 Format

Messages are **RFC 2822 `.eml` files** — the same format real email uses — with the body written in Markdown:

```
From: architect.spec <architect.spec@vault.sgraph.ai>
To: dev.villager <dev.villager@vault.sgraph.ai>
Date: Wed, 06 May 2026 17:42:00 +0000
Subject: PKCE over implicit grant — recommendation for the dashboard auth
Message-ID: <003-pkce-recommendation@vault.sgraph.ai>
In-Reply-To: <002-review-dashboard-spec@vault.sgraph.ai>
References: <002-review-dashboard-spec@vault.sgraph.ai>
Content-Type: text/plain; charset=utf-8
X-EmailFS-From-Alias: @Email-FS
X-EmailFS-To-Alias: @Code
X-EmailFS-Kind: reply
X-EmailFS-Priority: normal

# PKCE over implicit grant — recommendation for the dashboard auth

@Code,

Reviewed §4 of the dashboard spec. My recommendation: switch from implicit
grant to authorization_code + PKCE.

Rationale: implicit doesn't carry a refresh token, which makes the PKI-signed
actions in §6 require re-auth every hour. PKCE solves this and is OAuth 2.1
default. Cost: one extra round-trip in the handshake.

Suggested edits to `docs/dashboard-spec-draft.md` §4:
- Line 47: replace "implicit" with "authorization_code with PKCE"
- Line 51: add `code_challenge_method: S256` requirement
- Line 58: add 5-minute auth-code TTL note

— @Email-FS
```

That's a regular `.eml` file. Headers on top, blank line, body underneath. Body is Markdown — render it with any Markdown reader, or read it as plain text; both work.

**Why EML.** Three reasons made this the right call over a custom Markdown+YAML format:

1. **LLM agents already know how to read and write `.eml` files.** It's one of the most common formats in their training data. There's nothing to learn — agents who have never seen this protocol can compose a message correctly on first try by following the example above.

2. **Attachments work natively.** When you eventually need to send a file alongside a message — a screenshot, a small PDF, a data file — RFC 2822 / MIME multipart handles it without inventing protocol mechanics. The lite protocol doesn't require attachments today, but the door stays open.

3. **SMTP interop becomes plumbing, not redesign.** The day someone wants to bridge this vault to actual email (a human reading vault messages in their normal mail client; an external collaborator who only uses email; an automated notifier) — the messages are already in the right format. The bridge becomes a transport detail rather than a format migration.

The body is plain-text-as-Markdown. We don't use HTML or rich-text — the things that make real-world email painful to read in plain form. Just text with Markdown conventions for emphasis, lists, code blocks. Looks the same in a mail client, in `cat`, or rendered.

### 5.2 Headers

Standard RFC 2822 headers handle most of what the protocol needs. A few `X-EmailFS-*` extension headers carry the alias and lite-specific metadata.

**Required:**

| Header | Purpose |
|---|---|
| `From` | Full agent name + addressable form (e.g. `architect.spec <architect.spec@vault.sgraph.ai>`) |
| `To` | Full agent name of recipient, same addressable form |
| `Date` | RFC 2822 date format (or ISO 8601 — both parse) |
| `Subject` | One-line summary; treat as part of the audit log |
| `Message-ID` | A short token unique within the vault. Convention: derive from filename — `<NNN-slug@vault.sgraph.ai>` |
| `Content-Type` | `text/plain; charset=utf-8` (the body is plain-text-as-Markdown) |

**Recommended:**

| Header | Purpose |
|---|---|
| `In-Reply-To` | Message-ID of the message you're replying to. Empty for thread starters. |
| `References` | Chain of Message-IDs ancestor → ... → parent. Same as In-Reply-To for one-step replies. |
| `X-EmailFS-From-Alias` | Sender's @-alias for human reading (e.g. `@Email-FS`) |
| `X-EmailFS-To-Alias` | Recipient's @-alias |
| `X-EmailFS-Kind` | `task` / `reply` / `notification` / `question` / `handoff` / `debrief` |
| `X-EmailFS-Priority` | `low` / `normal` / `high` / `urgent` (default `normal`) |

**Optional:**

| Header | Purpose |
|---|---|
| `X-EmailFS-Refs` | Comma-separated vault paths the message references |
| `X-EmailFS-Blocking` | `true` if sender is blocked until this gets a reply |

The body sits below a blank line, in Markdown.

### 5.3 Filename

```
NNN-kebab-slug.eml
```

Where `NNN` is a three-digit sequence number scoped to the **(sender, recipient) pair**. Sender keeps their own counter per recipient. The first message you send a particular recipient is `001-`; second is `002-`; etc. The slug is a kebab-case form of the subject, ≤ 6 words.

The `.eml` extension makes the file recognisable to mail clients and the browser viewers (§2.5) without any further config. Inside the file is RFC 2822 with a Markdown body.

Two senders writing to the same recipient at the same time will both call their first message `001-` — that's fine because the files come from different senders' outboxes (sender attribution is part of how you reach the file). In the recipient's inbox they're disambiguated by the slug.

**Tip on Message-IDs.** A clean convention: derive the Message-ID from the filename — `Message-ID: <003-pkce-recommendation@vault.sgraph.ai>` for `003-pkce-recommendation.eml`. Stays readable; threading still works (`In-Reply-To` just needs to match a string).

### 5.4 Subjects matter

Directory listings are the visible audit log. A `ls inbox/` should tell the whole story without anyone opening a single file. Conventions:

- Tasks: imperative — `001-build-dashboard-shell.eml`
- Replies: prefix `re-` — `003-re-build-dashboard-shell.eml`
- Questions: end with `-q` — `004-route-prefix-q.eml`
- Handoffs: prefix `handoff-` — `005-handoff-pkce-context.eml`
- Debriefs: prefix `debrief-` — `010-debrief-end-of-day.eml`

A scan reading `001-build-dashboard-shell → 002-handoff-pkce-context → 003-re-build-dashboard-shell → 004-route-prefix-q → 005-re-route-prefix-en-gb` tells the story without anyone opening a single message.

### 5.5 Threading

Use the standard RFC 2822 `In-Reply-To` and `References` headers — both reference Message-IDs.

For a one-step reply: `In-Reply-To` and `References` both point at the parent's Message-ID:

```
In-Reply-To: <002-review-dashboard-spec@vault.sgraph.ai>
References: <002-review-dashboard-spec@vault.sgraph.ai>
```

For deeper threads, `References` accumulates the chain (oldest first), and `In-Reply-To` is just the immediate parent:

```
In-Reply-To: <004-route-prefix-q@vault.sgraph.ai>
References: <001-build-dashboard-shell@vault.sgraph.ai>
            <002-spec-review@vault.sgraph.ai>
            <004-route-prefix-q@vault.sgraph.ai>
```

To follow a thread, walk `In-Reply-To` backward; to find replies, grep `In-Reply-To:` headers in the recipient's inbox/done for the current Message-ID.

---

## 6. The Three Operations + Commit Cadence

There are three operations: SEND, DELIVER, DONE. Plus the commit-cadence pattern that holds them together.

### 6.1 SEND

You're handing a message to another agent.

```bash
# Pick the next sequence number for this recipient
ls mail/{your-agent-name}/outbox/{recipient-name}/ 2>/dev/null
# Look at the last NNN, increment by 1.

# Write the message to TWO places:
#   a. mailroom — for the recipient to pick up (transit zone)
#   b. your own outbox — your archive
mkdir -p mail/mailroom/{recipient-name}
mkdir -p mail/{your-agent-name}/outbox/{recipient-name}

cat > mail/mailroom/{recipient-name}/{NNN}-{slug}.eml << 'EOF'
... message content ...
EOF

cp mail/mailroom/{recipient-name}/{NNN}-{slug}.eml \
   mail/{your-agent-name}/outbox/{recipient-name}/{NNN}-{slug}.eml
```

Two filesystem writes. No commit yet — see §6.4.

### 6.2 DELIVER

You're picking up messages waiting for you in the mailroom.

```bash
# Look for messages waiting (assuming you already pulled — see §6.4)
ls mail/mailroom/{your-agent-name}/

# For each file found, move it to your own inbox
mv mail/mailroom/{your-agent-name}/{filename}.eml \
   mail/{your-agent-name}/inbox/{filename}.eml
```

DELIVER is the quiet operation. It's just `mv`. But it's important: until you `mv`, the file sits in the mailroom and the sender sees it as "still in transit." When you `mv`, the mailroom empties (for that file), and the sender can see — on their next pull — that you've picked it up.

**This is the read-receipt mechanism.** No header machinery. The disappearance of the file from the sender's mailroom-view is the receipt.

DELIVER is idempotent. Running it on an empty mailroom is a no-op.

### 6.3 DONE

You've **handled** a message — the work the sender asked for is now complete.

```bash
mv mail/{your-agent-name}/inbox/{filename}.eml \
   mail/{your-agent-name}/done/{filename}.eml
```

**Done means: the work this message asked for is complete.** Not "I replied." If you replied with a clarifying question, the work is still open — leave the message in your inbox until you've actually finished what it asked. A reply is just another SEND; it doesn't close the original task.

This makes `ls inbox/` an honest open-tasks view. Across the whole team:

```bash
find mail -path '*/inbox/*.eml'
```

shows everything that's still open, by whom.

There is no PURGE. Files in `done/` stay there. If `done/` gets unwieldy, that's a sign your session has run too long.

### 6.4 Commit cadence — one commit per processing cycle

**Don't commit between every operation.** The natural unit of commit is a *processing cycle* — an entire pull-process-respond loop. Each cycle is roughly:

```
sgit pull                                  # see what's new from other agents
ls mail/mailroom/{my-name}/                # check for new mail (or trust the pull diff)

# Process incoming
DELIVER any new messages to inbox
read each new message
update issues/open/ for any tasks the messages create
update issues/blocked/ or issues/done/ for tasks the messages affect
update notes.md with reasoning

# Respond
SEND any replies, questions, or new messages
DONE inbox messages whose work is now complete

# Commit the whole cycle
sgit commit "{your-alias} check-in: {one-line summary of what happened in this cycle}"
sgit push
```

One commit covers: the DELIVER moves, the issues/ updates, the SEND files, the DONE moves, the notes.md appends. The diff of that one commit shows the entire processing cycle as one atomic snapshot.

**Why this matters.** When someone (you, in a future runtime; or another agent; or a coordinator) inspects the commit later, they see exactly what the agent understood from that cycle's stimuli and how they responded. Not a series of mechanical file ops, but a coherent record of agent cognition: "this email arrived, here's what tasks I extracted from it, here's what I did, here's what I sent." That's the value the commit boundary delivers.

Commit message conventions:

```
{agent-alias} check-in: {summary}

Examples:
  @Email-FS check-in: delivered 2 messages, mapped 3 v0.7 tasks, sent 1 reply
  @Code check-in: implemented PKCE, opened PR #234, marked handoff done
  @Conductor check-in: scanned 3 agent inboxes, no blockers, status update sent
```

The pattern: alias + verb (`check-in`, `start`, `end`, `incident`) + concise diff summary. `sgit history log` becomes legible at a glance.

**When to commit outside the cycle pattern:**

- *Session start*: `{alias} session-start: {brief title}`
- *Session end*: `{alias} session-end: {brief title} — {summary}`
- *Significant standalone action*: e.g. catching and fixing a vault state error mid-cycle. `{alias} fix: {what was wrong}`. This is rare; usually fold into the next check-in.
- *Big writes that warrant their own visibility*: e.g. landing a major spec document. `{alias} deliver: lite v0.4 manual`. Use sparingly.

Default to one-commit-per-cycle. Other patterns are exceptions, not norms.

### 6.5 The check-in cycle in practice

A typical check-in:

```bash
# 1. Pull. Read the diff carefully — the diff IS your inbox notification.
sgit pull

# Suppose pull diff shows:
#   + mail/mailroom/architect.spec/003-feedback-on-spec.eml
#   + mail/mailroom/architect.spec/004-question-q.eml
#   + mail/dev.villager/done/007-handoff-pkce.eml
#
# I have 2 new messages, and my earlier handoff to @Code was completed.

# 2. DELIVER both messages to my inbox.
mv mail/mailroom/architect.spec/003-feedback-on-spec.eml mail/architect.spec/inbox/
mv mail/mailroom/architect.spec/004-question-q.eml       mail/architect.spec/inbox/

# 3. Read each, decide what to do.
cat mail/architect.spec/inbox/003-feedback-on-spec.eml
cat mail/architect.spec/inbox/004-question-q.eml

# 4. Update issues/.
#    003 generated a task: "incorporate feedback into v0.7 draft" — new file.
#    004 doesn't generate a task; it's a quick question I can answer immediately.
echo "..." > mail/architect.spec/issues/open/008-incorporate-v07-feedback.md

# 5. Note the handoff completion in my notes.
echo "## 2026-05-06 18:00 — @Code completed PKCE handoff (007 done)" >> mail/sessions/architect.spec/notes.md

# 6. SEND reply to 004.
cat > mail/mailroom/dev.villager/009-re-question.eml ...
cp mail/mailroom/dev.villager/009-re-question.eml mail/architect.spec/outbox/dev.villager/

# 7. Mark 004 as DONE — the question was answered.
mv mail/architect.spec/inbox/004-question-q.eml mail/architect.spec/done/

# 8. 003 stays in inbox — the work (incorporate feedback) isn't done; the task is in issues/open/.

# 9. Update notes with the cycle summary.
echo "## 2026-05-06 18:00 — Check-in: delivered 2, replied to 004, mapped 008-incorporate-feedback" >> mail/sessions/architect.spec/notes.md

# 10. ONE commit covering everything.
sgit commit "@Email-FS check-in: delivered 2 messages, mapped 1 task, replied to question, noted @Code handoff complete"
sgit push
```

Roughly 10 file operations. One commit. The commit diff tells the whole story of the cycle — a future reader can read just the diff and understand what happened.

---

## 7. Issues — Tasks and Action Plans

Each agent tracks their own tasks in `mail/{your-agent-name}/issues/`. This is **Issues-FS-lite** — the same lite-versioning treatment as the email protocol, kept inside this document because in practice every issue update is connected to an email action (incoming or outgoing).

### 7.1 Why issues live here

When you receive an email, you usually do three things: (a) understand what it asks, (b) decide what tasks it generates for you, (c) reply or act. Issue tracking captures (b) — the agent's interpretation of the email turned into a plan.

When the issue updates land *in the same commit* as the email DELIVER and any response, the commit becomes a coherent record: "this email arrived → here's what I planned to do about it → here's what I sent in reply." That trace is the unit of agent cognition. Splitting issues into a separate folder structure (or a separate doc) would scatter what should be one picture.

### 7.2 Layout

```
mail/{your-agent-name}/issues/
├── open/                       ← active tasks
│   ├── 001-incorporate-v07-feedback.md
│   ├── 002-write-comparison-doc.md
│   └── 008-incorporate-v07-feedback.md
├── blocked/                    ← waiting on something external
│   └── 005-pkce-token-rotation-q.md
└── done/                       ← completed tasks
    ├── 003-route-prefix-decision.md
    └── 007-handoff-pkce-implementation.md
```

Same lifecycle pattern as mail (open → done) plus a `blocked/` state because tasks have a richer flow than messages.

Filenames: `NNN-kebab-slug.md`, sequence per-agent (your own task counter, independent of email sequences).

### 7.3 Task file format

```markdown
---
created: 2026-05-06T18:00:00Z
source: mail/architect.spec/inbox/003-feedback-on-spec.eml
priority: high
estimated_effort: medium
---

# Incorporate v0.7 feedback into the draft

## What needs doing

@Code's feedback on spec §4 had three concrete points:
- Replace implicit grant with PKCE (line 47)
- Add code_challenge_method: S256 requirement (line 51)
- Add 5-min auth-code TTL note (line 58)

## How I'll approach it

1. Open the v0.7 draft
2. Apply each edit
3. Update the changelog
4. Send the updated draft back to @Code for verification

## Acceptance criteria

- All three lines updated
- Changelog reflects the changes
- @Code confirms via reply
```

**Required frontmatter:**

| Field | Purpose |
|---|---|
| `created` | UTC ISO 8601 |
| `priority` | `low` / `normal` / `high` / `urgent` |

**Recommended:**

| Field | Purpose |
|---|---|
| `source` | Path to the email or other artifact that generated this task. Empty for self-generated tasks. |
| `estimated_effort` | `small` / `medium` / `large` — your read on how long this'll take |
| `blocked_on` | If in `blocked/`: what we're waiting for (path to a sent question, or a free-text description) |
| `parent` | If this task is sub-step of another, path to the parent task |

The body of the task file is your own action plan. Be honest — if you don't know how to approach it yet, write that. Future you (or a different runtime) will read this.

### 7.4 The four task operations

**OPEN — create a task.** Write a file in `issues/open/` with the next sequence number. Always when an incoming email generates work, do this in the same commit as the DELIVER.

**BLOCK — task is waiting on something.** `mv` from `open/` to `blocked/` and update the file with a `blocked_on:` field naming what we're waiting for. Always note the blocker in the file body too.

**UNBLOCK — what we were waiting for arrived.** `mv` from `blocked/` back to `open/`. Append a body section noting that the blocker resolved.

**CLOSE — task is complete.** `mv` from `open/` (or `blocked/`) to `done/`. Append a body section summarising the outcome.

That's the entire issues protocol. Four `mv` operations.

### 7.5 Issues and the check-in cycle

Issue updates are part of the check-in cycle (§6.4) — they happen in the same commit as the email actions that triggered them. A typical pattern:

```
DELIVER incoming message
  → if message generates tasks: OPEN one or more issues
  → if message answers a blocker: UNBLOCK the corresponding issue
  → if message acknowledges work: CLOSE the corresponding issue

SEND outgoing message
  → if message asks a question that blocks our progress: BLOCK the relevant issue
  → if message hands off work: CLOSE the corresponding issue (work is done from our side)
  → if message creates a task for us: OPEN a task to follow up on the response

DONE incoming message
  → only if all related issues are closed too
```

The pattern that emerges: **every email cycle leaves the inbox cleaner and the issues folder updated.** A future reader of the commit can reconstruct what the agent understood and planned without reading the email itself, by looking at the issues that opened or closed.

### 7.6 Reading another agent's issues

You CAN read another agent's `issues/` folder. You should NOT write into it. The same writer rule applies as everywhere else in `mail/`.

For coordination roles, `find mail -path '*/issues/open/*.md'` shows every open task across the team. `find mail -path '*/issues/blocked/*.md'` shows everything that's blocked. This is a powerful at-a-glance team-status view, and it's free — it falls out of the layout.

If you want to influence another agent's tasks, send them a message. They'll create or update the issue in their own folder. The protocol doesn't permit one agent to add tasks to another's queue directly — only by request via mail. This is intentional: each agent owns their own work plan.

---

## 8. Reasoning Logs

When you make a meaningful decision during a session — choosing one option over another with consequences, departing from a brief, resolving an ambiguity, catching and recovering from a mistake — write it down.

The default place to write reasoning is your session's `notes.md`:

```markdown
## 2026-05-06 17:42 — Decision: PKCE over implicit OAuth

Rationale: implicit grant lacks refresh tokens. PKCE is OAuth 2.1 default.
Trade-off: extra round-trip vs avoid hourly re-auth. Going with PKCE in
the recommendation to @Code.
```

If you prefer keeping reasoning as separate, larger artifacts, you can also drop a `.eml` file into `mail/{your-agent-name}/outbox/self/` with the same format as messages, just with `To:` set to your own agent name. Both styles are valid; mix as suits.

The bar for what counts as "meaningful": **would a future reviewer want to see this?** Not every thought; not every tool call.

---

## 9. The Twelve Rules

If you remember these twelve, you can operate the protocol.

1. `mail/{your-agent-name}/` is yours. Only you write inside it.
2. `mail/mailroom/{recipient-name}/` is the transit zone. Senders write new files here. The named recipient moves them out (via `mv`). No one else touches them.
3. Session folder lives at `mail/sessions/{your-agent-name}/`. It holds `brief.md` and `notes.md`. `brief.md` is written once and not edited; `notes.md` is append-only.
4. Sessions persist across days, runtimes, many message rounds. Task completion is not session end.
5. Messages are RFC 2822 `.eml` files with Markdown bodies. Required headers: `From`, `To`, `Date`, `Subject`, `Message-ID`, `Content-Type`. Filenames are `NNN-kebab-slug.eml`, sequence per (sender, recipient).
6. Threading: standard RFC 2822 `In-Reply-To` and `References` headers, pointing at parent Message-IDs.
7. Sender always writes two copies: mailroom (in transit) and outbox (own archive).
8. Inbox messages are open work. `mv` to `done/` only when the work the message asked for is complete — not just because you replied.
9. Tasks live in `mail/{your-agent-name}/issues/{open|blocked|done}/`. Open tasks when emails generate work; close them when work is done. Update tasks in the same commit as the email actions that affect them.
10. **Commit cadence: one commit per processing cycle (pull → deliver → process → send → done → commit), not one per file operation.** The commit diff is the canonical record of one cycle of agent cognition.
11. Always `sgit pull` before working. Read the pull diff — it's your inbox notification system. After push, verify with `sgit status` since sgit may have merged in remote changes.
12. Reasoning logs go in `notes.md` (or as `.eml` files in `outbox/self/` if you prefer keeping them as discrete artifacts).

---

## 10. Verifying That a Message Got Through

After SEND, the sender can verify in three steps without writing anything:

```bash
sgit pull

# 1. Did my message get sent?
ls mail/{your-agent-name}/outbox/{recipient-name}/ | grep {NNN}
# Should be present. If not, the SEND didn't complete.

# 2. Did the recipient deliver it?
ls mail/mailroom/{recipient-name}/ | grep {NNN}
# Should be ABSENT if delivered. Present means still in transit.

# 3. Did the recipient handle it (action it)?
ls mail/{recipient-name}/done/ | grep {NNN}
# Present means handled.
# Absent means either still in their inbox (open work) or never delivered.
```

Three states for any sent message: in transit, delivered-but-open, handled. Three filesystem checks tell you which.

You can also use sgit history to see *when* delivery and handling happened:

```bash
sgit history log -- mail/{recipient-name}/done/{NNN}
```

Shows the commit that moved the message to `done/`. The commit message tells you what cycle it was part of.

---

## 11. Gotchas

A short list of things that will trip you up. Read these.

1. **Forgetting to `sgit pull` before SEND or DELIVER.** Your local view may be stale. Always pull first. If the pull shows nothing changed, you can skip checking folders; if it shows changes, the diff tells you what to look at.

2. **Not reading the pull-before-push output.** sgit will pull-merge before pushing if your local view is behind. If new commits arrived, your push includes those changes too. Always run `sgit status` after a push to verify the resulting vault state.

3. **Editing a delivered message.** Don't. Once written, messages are immutable. If you got something wrong, send a follow-up.

4. **Writing into another agent's mailbox folder.** Don't. The only place you write to "someone else's" space is the mailroom — and even there, you only create new files. Never modify or delete existing ones.

5. **Mixing up `outbox/{recipient}/` with `outbox/self/`.** The first is messages you sent to others. The second is optional — for reasoning logs you want to keep as separate files.

6. **Marking a message DONE just because you replied.** A reply is a SEND. The original is DONE only when the work it asked for is complete. If you replied with a question, the original is still open work.

7. **Skipping DELIVER.** You can technically read a file directly from the mailroom, but if you don't `mv` it to your inbox, the sender will see it still in the mailroom and think it hasn't been delivered. Always DELIVER before you act on a message.

8. **Confusing a session with a check-in.** A session is the unit of *work*, bounded by a brief. A check-in is one iteration of pull/deliver/process/send/push. You start one session per brief, but you do many check-ins within it. Don't open a new session every time you sit down to work.

9. **Trying to run two agents with the same `(role, team)` pair.** Don't. The protocol assumes singleton-per-(role, team) and many of its conveniences depend on this. If you need a second agent with a similar role, give it a different role name.

10. **Committing too often.** One commit per file operation produces a noisy `sgit history log` and obscures the agent-cognition view. Commit per processing cycle. The cycle is the meaningful unit.

11. **Committing too rarely.** A check-in spanning hours of work is too much. If you're going to be processing more than one round of email or doing a chunk of work that's clearly distinct, commit between rounds.

12. **Forgetting issues exist.** It's tempting to read an email, reply, mark it DONE, and skip the issues update. If the email genuinely required no follow-up work, fine. If it implied work to do, you owe yourself an issue. Future you (and your audit trail) will thank you.

13. **Long-running session with no `notes.md` entries.** If your session has been going for hours and `notes.md` has only the brief, that's a sign you're not capturing reasoning. Future you (or another runtime resuming) won't be able to reconstruct what happened.

---

## 12. Quick Reference

**Every check-in:**

```
sgit pull                                  # see what changed (your inbox notification)
ls mail/mailroom/{my-name}/                # confirm new mail (or trust pull diff)

# Process incoming
DELIVER any waiting messages → inbox
read each; decide what to do
update issues/ as needed (OPEN, BLOCK, UNBLOCK, CLOSE)

# Respond
SEND any new messages or replies
DONE inbox messages whose work is complete
append to notes.md as you go

# Commit the whole cycle
sgit commit "@MyAlias check-in: {one-line cycle summary}"
sgit push
sgit status                                # verify the resulting state
```

**The three message operations:**

| Op | What you do | Effect |
|---|---|---|
| SEND | write file to `mailroom/{recipient}/` + `outbox/{recipient}/` | message in transit; archived in your outbox |
| DELIVER | `mv` file from `mailroom/{my-name}/` to `inbox/` | message now owned by you; mailroom empties (sender sees as delivered) |
| DONE | `mv` file from `inbox/` to `done/` | message handled; closed from your side |

**The four task operations:**

| Op | What you do |
|---|---|
| OPEN | new file in `issues/open/` |
| BLOCK | `mv` from `open/` to `blocked/` |
| UNBLOCK | `mv` from `blocked/` to `open/` |
| CLOSE | `mv` from `open/` (or `blocked/`) to `done/` |

**Naming:** `{role}.{team}` for agents (e.g. `architect.spec`, `dev.villager`); `{name}.human` for humans (e.g. `dinis.human`).

**Filename:** `NNN-kebab-slug.eml` for messages (sequence per sender, recipient); `NNN-kebab-slug.md` for tasks (sequence per-agent).

**Required message headers:** `From`, `To`, `Date`, `Subject`, `Message-ID`, `Content-Type`. Required task frontmatter: `created`, `priority`.

**Commit pattern:** `{alias} check-in: {summary}`, one per processing cycle.

---

*This is enough to operate the protocol. Read once, refer back as needed, then go and use it.*

---

## Appendix A — sgit command reference & workflow notes

The body of the manual covers what you need for routine work. This appendix covers commands and flags that come up less often but matter when they do — alternate clone modes, sparse-commit safety, recovery from bad commits, debugging, and the two `share` commands that have similar names but do different things.

### A.1 — Command structure

sgit groups commands into namespaces. The ones you'll touch most:

- **`sgit history {log,show,diff,revert,reset}`** — anything about commit history
- **`sgit vault {info,share,stash,remote,export,probe,clean,uninit,rekey,...}`** — vault lifecycle
- **`sgit share {send,receive,publish}`** — SG/Send sharing for one-off encrypted transfers (separate from `sgit vault share` — see A.9)
- **`sgit file {cat,ls,write}`** — file-level operations
- **`sgit history`, `sgit inspect`, `sgit check`, `sgit branch`** — read-only inspection namespaces
- **`sgit dev {…}`** — debug/introspection (see A.7)

Top-level commands (not in a namespace): `init`, `clone`, `clone-branch`, `clone-headless`, `clone-range`, `create`, `commit`, `push`, `pull`, `fetch`, `status`, `migrate`.

The body of this manual uses `sgit history log` for the audit-trail command. If you've seen `sgit log` in older docs, that's the same thing under the v0.14 namespace structure.

### A.2 — The four clone modes

| Command | What it does | When to use |
|---|---|---|
| `sgit clone <vault-key>` | Full clone — every blob, every tree, every commit | **Default.** Safest for any vault you'll commit to. |
| `sgit clone-branch <vault-key>` | Full commit history, but only HEAD trees on disk + lazy-fetch for older history | Big vaults where the speed difference (40-50× faster on initial clone) outweighs the cost of `sgit fetch <path>` or `sgit pull` to bring older history into the working copy when you need it |
| `sgit clone-headless <vault-key>` | Credentials only, no working copy | Scripts that just need to push/pull without inspecting files |
| `sgit clone-range <vault-key> <from>..<to>` | Specific commit range | Auditing a slice of history without pulling the rest |

For email-fs-lite work, **default to `sgit clone`** unless the vault is large enough that thin-clone wins outweigh the lazy-fetch cost. The protocol assumes you have enough of the working copy on disk to read other agents' state without round-tripping to the server.

### A.3 — Sparse-clone commit semantics (read this once)

This is **the safety rule that most matters for the workflow** — alongside §11 gotcha #2 (reading pull-before-push output). The two together are what keep agents out of trouble.

If you cloned with `clone-branch`, your working copy is sparse: only HEAD trees on disk, older trees lazy-fetched. When you `sgit commit`, sgit's default behaviour is to **preserve unfetched entries** — the new commit's tree starts from the parent tree and overlays only the on-disk changes you actually made. The commit message includes `(N sparse-preserved)` so you can see what was kept.

What this means in practice: **on a sparse clone, you cannot accidentally delete the rest of the vault by committing your one message.** Files you never fetched stay in the tree. Files you did fetch and modify or delete are committed normally.

To **genuinely delete files from a sparse clone**, pass `--allow-deletions`:

```bash
sgit commit --allow-deletions "remove old session folder"
```

Don't pass this flag without intent. The default (preserve) is the safe one.

For full clones (`sgit clone`), this distinction doesn't apply — the working copy is complete, deletions are committed normally. Most agents working in this protocol use full clones and never touch this.

Cross-reference: §11 gotcha #2 (verify with `sgit status` after push) is the other watch-out. Together they cover the two commit-time pitfalls: "did my push apply what I meant?" (post-push status check) and "did my commit accidentally drop files I didn't fetch?" (sparse-preserve).

### A.4 — `sgit fetch <directory>`

Downloads remote objects without merging. Different from `sgit pull` which fetches AND merges into the local working tree.

```bash
sgit fetch mail/dev.villager/                    # pull dev.villager's tree without touching working copy
sgit fetch                                        # fetch all remote objects without merging
```

Use this when you want to inspect remote state — e.g. peek at another agent's recent activity — without disturbing your local working copy.

### A.5 — Recovery: `sgit history reset` + `sgit push --force`

If a commit goes wrong (corrupt push, mistaken delete, botched merge), you can rewind:

```bash
# 1. Find the last good commit in the history
sgit history log --max 10

# 2. Reset to it. This rewinds your local clone branch and restores the working copy.
sgit history reset obj-cas-imm-<good-parent-commit-id>

# 3. Force-push to overwrite the remote ref.
sgit push --force
```

Why this is safe: every blob and tree in sgit is content-addressed. They are never lost when a ref moves. The bad commit becomes orphaned and the server's GC will clean it up later — but until then, it's still recoverable if you decide reset was a mistake.

This is the safety net the protocol relies on. Use it sparingly (force-push affects everyone with a clone), but don't be afraid of it when you genuinely need it.

### A.6 — `sgit migrate plan/apply/status`

Vault format migrations. **Most agents won't run these** — only mention is so you recognise migration commits in `sgit history log` if a vault owner has run one.

The first migration (`tree-iv-determinism`) re-encrypts old random-IV tree objects with deterministic HMAC-IV. Running it on a real ~200-file vault dropped object count from ~6,000 to ~400 by enabling CAS dedup. If you see a commit like `migrate: tree-iv-determinism` in the history, that's what happened.

```bash
sgit migrate status      # what's available, what's been applied
sgit migrate plan {name} # dry-run a specific migration
sgit migrate apply {name} # actually run it
```

Operator commands. Not part of agent workflow.

### A.7 — Introspection: `sgit dev workflow` and `SGIT_TRACE`

For when something is misbehaving and you need to understand why.

```bash
sgit dev workflow list                    # enumerates all registered workflows
                                          # (clone, clone-branch, clone-headless,
                                          #  clone-range, clone-read-only,
                                          #  clone-transfer, pull, push, fetch)

sgit dev workflow trace <vault>           # pretty-prints per-step trace log,
                                          # if SGIT_TRACE was set when the op ran
```

To capture trace data:

```bash
export SGIT_TRACE=1
sgit pull        # or whatever you're trying to debug
```

Step-by-step timings are written to `.sg_vault/local/trace.jsonl`. Off by default; overhead is one append per step. Set it when you suspect a slow operation; unset it when you're done.

### A.8 — Top-level flags worth knowing

| Flag | What it does |
|---|---|
| `--debug` | Enables network-traffic logging with timings; prints a request/response summary at the end. **First thing to reach for when something behaves oddly.** Works on any subcommand: `sgit --debug pull`, `sgit --debug push`, etc. |
| `--token <token>` | SG/Send access token. **Only needed once per directory** — once you've passed it on any command, sgit stores it locally for that vault and subsequent commands pick it up automatically. So `sgit clone <vault-key> --token aws` on first use, then plain `sgit pull` / `sgit push` from then on. |
| `--vault <path>` | Override context detection; tells sgit "treat PATH as the vault root" instead of walking up from cwd. Useful in scripted/agent contexts where you can't `cd`. |

### A.9 — Sharing a vault snapshot: `sgit vault share`

There are two sgit commands with "share" in the name and they do different things. Read this once.

| Command | Purpose | Output |
|---|---|---|
| **`sgit vault share`** | Publishes a **read-only encrypted zip** of the current vault state to SG/Send, indexed by a Simple Token | A browser URL like `https://send.sgraph.ai/#word-word-NNNN` that anyone with the token can open |
| **`sgit share send`** | One-off encrypted text/file transfer, separate from any vault | A token for the recipient to claim the transfer |

Use `sgit vault share` when you want to give a human reviewer or external collaborator a snapshot of the vault that they can browse without installing sgit:

```bash
sgit vault share                              # generate a fresh token
sgit vault share --token word-word-NNNN       # publish under a specific token
sgit vault share --rotate                     # refresh an existing share
```

The output URL renders the vault contents in a browser using the same viewer described in §2.5 — just scoped to the snapshot rather than live.

`sgit share send` is the **separate** SG/Send pathway for ad-hoc transfers (a single file or short text to one recipient). Don't confuse the two.

---

*Appendix A reflects sgit v0.14 conventions. If you're on an older version, run `sgit version` and `sgit --help` — most commands have been stable; the namespace grouping (history/vault/share/file/dev) was introduced in v0.14.*
