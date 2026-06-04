# Is SGraph a coordination protocol, a harness spec, or a workflow?

*A reply to [Name], on what SGraph actually is.*

---

Hi [Name],

Great to meet you too, and I'm really glad the infographic landed. Take your time digesting it.

You've put your finger on exactly the right question, and the fact that you're asking it the way you are tells me you've understood the thing properly. So let me answer it directly.

**Short answer: it's none of the three as a primitive, and that's deliberate. SGraph sits one layer underneath all three, which is precisely why it looks like it could be any of them.** Your instinct that "it can be all three" is right in spirit, but the cleaner way to see it is that protocols, harnesses, and workflows are things you build *on top of* SGraph, not things SGraph *is*.

Here's the distinction that makes it click. Those three concepts are all about *behaviour*: how agents talk, how an agent runs, what steps happen in what order. SGraph is about *state*: where the work lives, how it's shared, and how you can prove what happened to it. It's the noun, not the verbs. Concretely, a vault is a zero-knowledge encrypted, version-controlled, provenance-carrying shared workspace. That's the whole primitive. Everything else is what you do with it.

Now let me take your three head-on, because each relationship is slightly different and worth being precise about.

**1. An agent coordination protocol?** No, not as such. A protocol defines *how* agents communicate, the message formats, the handoffs, the wire conventions (think MCP, or the agent-to-agent protocols emerging now). SGraph doesn't define any of that. But here's the interesting part: agents coordinate *through* a vault without needing a direct protocol at all. They read and write shared state, and because every change is versioned and provenanced, the coordination is auditable by construction. It's closer to how a team coordinates through a shared git repo, or how ants coordinate through their environment rather than by messaging each other directly, a blackboard model rather than a wire protocol. So SGraph isn't the protocol; it's the shared medium that makes coordination work, and you can absolutely run MCP or an A2A protocol *on top of* it. The two are orthogonal and complementary.

**2. An agent harness specification?** No, and in fact it's deliberately harness-agnostic. A harness is the runtime an individual agent executes in, the loop, the tool interface, the context management (Claude Code is a harness; Pi is a harness). SGraph doesn't specify any of that. What it does is provide the persistent context, memory, state, and tools that a harness plugs into and reads from and writes back to. So Pi, Claude Code, or your own harness can all work *with* the same vault, and the vault outlives any one of them. If anything, SGraph is the thing that stops your agents' memory and state from being trapped inside one harness.

**3. A workflow?** No, but this is the closest of the three, and probably why it feels like all of them. SGraph isn't a workflow engine and doesn't prescribe a sequence of steps. But a workflow can be *captured, versioned, and executed against* a vault, the vault holds the workflow as content (this is essentially what we mean by a "skill"), and it holds the workflow's evolving state and the provenance of every step as it runs. So the vault is where a workflow lives and leaves its trail, not the thing that drives it.

So how do I see it? **SGraph is the substrate, the shared, versioned, access-controlled state layer that all three of those things need but none of them provide.** You're seeing three possible answers because, from wherever you happen to be standing (writing a protocol, building a harness, designing a workflow), the vault looks like "the thing that makes my layer work." That's the tell that it's underneath all of them. The mental model I'd offer is something like *git plus a filesystem plus PKI, for humans and agents to share state*: a place to put the work, version it, branch it, prove it, and control who sees what, with everything else layered above.

And just to connect it back to your world, this is exactly why I think it's relevant to a blast-radius play. The two properties a vault gives you for free, full provenance (you can always answer "what touched this, and when") and containment (access control, sub-vaults, encrypted boundaries), are precisely the two things blast-radius analysis lives or dies on. So when you do dig into the infographic, that's the lens I'd read it through.

Let's definitely stay in touch, this is a fun conversation. Happy to get on a call and whiteboard any of it if it's useful.

Best,
Dinis
