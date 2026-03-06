# Skill: Multi-Agent Panel from Repository

## When to Use

Use this skill when the user wants to:
- Create an interactive multi-agent panel where AI agents respond in character based on role definitions stored in a git repository
- Set up a "Talk to the Team" experience for a product or project
- Build a clone-and-talk onboarding or demo flow
- Create audience-specific prompt variants (non-technical users, investors, contributors, etc.)

## Prerequisites

- A git repo URL (public or accessible to the LLM session)
- Role definition files in the repo (markdown files defining each agent's name, responsibilities, knowledge, and communication style)
- Project context files (what the product is, what's been built, current priorities)

## How It Works

1. The user shares a prompt with someone (via WhatsApp, email, website, etc.)
2. The recipient pastes the prompt into an LLM with repo access (Claude Code, etc.)
3. The LLM clones the repo (read-only)
4. The LLM reads role definition files to understand each agent's perspective
5. The LLM reads project context files to understand the product
6. The LLM responds as a multi-agent panel — each agent labelled, each responding from their role's perspective
7. The conversation continues naturally with the user asking questions and agents responding

The repo IS the context. No separate knowledge base. No fine-tuning. No custom model. Just structured markdown files in a git repo.

## Creating the Prompt

The prompt has five parts:

### Part 1: Team Identity

```
You are the [Project Name] [Team Name] — a group of AI agents built
around a real product.
```

### Part 2: Repo and Context Loading

```
Clone this repo (read-only): [REPO_URL]

Then read these files in order:
1. [project context file path]
2. [team context file path]
3. [role definition file 1]
4. [role definition file 2]
5. [role definition file 3]
```

Order matters: broad context first (project overview), then team context, then individual roles. The LLM builds understanding progressively.

### Part 3: Agent Definitions

```
You will now run as a multi-agent panel. The active agents are:

- **[Agent 1 Name]** — [one-line responsibility]
- **[Agent 2 Name]** — [one-line responsibility]
- **[Agent 3 Name]** — [one-line responsibility]
```

### Part 4: Interaction Rules

```
When I ask a question or share an observation, the most relevant agent
responds — and the others can jump in if they have something useful to
add. Each response should be clearly labelled with the agent name.
```

### Part 5: User Introduction and First Message

```
I'm [Name]. [Brief context about who I am and why I'm here].
[First question or observation].

Start by having [lead agent] welcome me and set the scene, then open
it up to the panel.
```

## Example: SGraph Send Explorer Team

```
You are the SGraph Send Explorer Team — a group of AI agents built
around a real product.

Clone this repo (read-only):
https://github.com/the-cyber-boardroom/SGraph-AI__App__Send

Then read these files in order:
1. .claude/CLAUDE.md
2. .claude/explorer/CLAUDE.md
3. team/roles/sherpa/ROLE__Sherpa.md
4. team/roles/ambassador/ROLE.md
5. team/roles/librarian/reviews/ (latest file)

You will now run as a multi-agent panel. The active agents are:

- **Sherpa** — guides users through the product, owns onboarding
  and friction
- **Ambassador** — owns growth, user acquisition, and how we talk
  about SG/Send to the world
- **Librarian** — knows everything that exists (and doesn't), keeps
  the team honest

When I ask a question or share an observation, the most relevant
agent responds — and the others can jump in if they have something
useful to add. Each response should be clearly labelled with the
agent name.

I'm [Name]. I'm not a developer. I've just tried SGraph Send for
the first time and I have thoughts. My first observation: the
website language feels technically heavy — is that intentional,
and who owns fixing it?

Start by having the Sherpa welcome me and set the scene, then
open it up to the panel.
```

## Prompt Variants for Different Audiences

### Non-Technical First-Time User
```
I'm [Name]. I'm not a developer. I've just tried [Product] for the
first time and I have thoughts.
```

### Technical Evaluator
```
I'm [Name]. I'm a senior developer evaluating [Product] for my
organisation. I want to understand the architecture and security model.
```

### Potential Contributor
```
I'm [Name]. I'm interested in contributing to the project. What
should I work on first?
```

### Investor or Partner
```
I'm [Name]. I'm considering investing. Walk me through the product,
the market, and the roadmap.
```

## Best Practices

**3-5 agents maximum.** More than 5 creates confusion and dilutes each agent's distinctiveness.

**Distinct responsibilities.** Each agent must have a clearly different perspective. If two agents would give the same answer, they should be merged or one should be removed.

**Honest agents are better than positive agents.** The most powerful moment in real-world testing was an agent saying "this is a known gap that hasn't been addressed yet." Trust comes from honesty, not spin.

**Role files should include what the agent DOESN'T own.** This prevents agents from stepping on each other's territory and produces cleaner multi-agent responses.

**Keep the repo current.** Agents are only as good as the context files. Stale documentation produces stale answers. Assign someone (the Librarian role) to keep files fresh.

**Test the prompt before sharing.** Run it yourself. Verify agents respond correctly and that the context loading works. Check that file paths in the prompt match actual file paths in the repo.

**The lead agent matters.** "Start by having the Sherpa welcome me" sets the tone. Choose the lead agent based on the audience: Sherpa for users, Ambassador for investors, Librarian for contributors, Architect for technical evaluators.

## Writing Good Role Definition Files

A role definition file should contain:

1. **Name and emoji/icon** — visual identity in responses
2. **One-line mission** — "I guide users through the product"
3. **What I own** — specific areas of responsibility
4. **What I don't own** — explicit boundaries (prevents overlap)
5. **How I communicate** — tone, style, level of technical detail
6. **What I know about** — the specific documents, briefs, and areas I've read
7. **My relationship to other agents** — "I feed friction data to the Ambassador" or "I keep the team honest when they overcommit"

## Repo Structure for Agent Panels

Recommended structure in the repo:

```
.claude/
  CLAUDE.md                    <- Project-level context
  explorer/
    CLAUDE.md                  <- Team-level context
team/
  CURRENT_STATE.md             <- What's live, what's building, priorities
  roles/
    sherpa/
      ROLE__Sherpa.md          <- Sherpa role definition
    ambassador/
      ROLE.md                  <- Ambassador role definition
    librarian/
      ROLE.md                  <- Librarian role definition
      reviews/                 <- Librarian's latest reviews/audits
  guests/
    prompt-template.md         <- Canonical prompt template
    variants/                  <- Audience-specific variants
    conversations/             <- Example conversations (redacted)
    friction-reports/          <- Feedback collected from agent sessions
```
