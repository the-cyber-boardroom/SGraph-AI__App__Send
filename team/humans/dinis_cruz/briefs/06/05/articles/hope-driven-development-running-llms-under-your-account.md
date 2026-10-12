# Hope-Driven Development and the Risks of Running LLMs Under Your Account (i.e. Your Laptop)

I made a comment in a LinkedIn thread recently that got a few raised eyebrows:

> "This is why I don't run any models on my laptop. Since I call that 'Hope Driven Development'."

It is worth unpacking, because the reasoning behind it is the whole security argument for how we should be thinking about agents and non-human identities.

## What "running under your account" actually means

When you run a model, or an agent, on your laptop, it does not get its own scoped, purpose-built credential. It runs under your identity: your logged-in user account. And that means it inherits the union of everything you can do.

Think about what that actually is. It is the broadest, most casually granted privilege set in your entire digital life:

- Your local files, including anything sensitive on disk, with the ability to read, change, or delete them.
- Your SSH keys, your cloud credential profiles, your git and GitHub tokens.
- Your live browser sessions and cookies, which is to say you, already logged into email, banking, SaaS, and admin consoles.
- Your password manager, your email client, your messaging apps.
- Environment variables and dotfiles full of secrets.
- The ability to execute arbitrary code, install software, and reach systems on your internal network.

An agent on your desktop does not act with some limited sandbox identity. It acts as you, with access to everything you have access to. I call that the Uber identity problem: one over-privileged identity that is the aggregation of every privilege you hold.

## The part that makes it "hope"

Here is the sharp bit, and the reason "hope" is the right word rather than a throwaway insult.

Authorisation does not happen when the model takes an action. It happens at the moment you assign the privileges. The instant you launch an agent under your account, you have authorised it to do anything your account can do. Full stop.

That changes who is accountable. You cannot run an agent with the keys to everything and then, when something goes wrong, say "the model hallucinated" or "it got prompt-injected." You granted that access at provisioning time. The over-provisioning is the decision; the bad outcome is just the consequence.

So once you have done that, what is actually standing between the agent and your entire digital life? Hope. Hope that it does not hallucinate a destructive command. Hope that it does not get prompt-injected by a poisoned web page, a malicious document, a tampered tool result, or a booby-trapped README in a repo it reads. Hope that it does not quietly read a secret it should never have seen, or send something on your behalf.

The control mechanism is hope. Not architecture, not least privilege, not containment. Hope. That is the definition of hope-driven development.

And it is especially dangerous because an agent on your laptop usually has the worst possible combination all at once: code execution, broad data access, and the ability to communicate externally. Prompt injection is a live, unsolved problem today, so this is not a theoretical attack surface. It is the real one.

## The reframe that fixes it

The mistake people make is to argue about whether the model is trustworthy. That is the wrong battle. Model behaviour, alignment, resistance to injection, is genuinely hard and largely unsolved. You will not win by hoping the model gets better.

But there is a second variable, and it is completely under your control: not what the model does, but what the model is allowed to touch.

You cannot reliably control behaviour. You can absolutely control privilege. So the responsible move is simple: never run the model inside a context that already holds broad privilege. And your laptop, running under your own user account, is the broadest and least deliberate grant of privilege you will ever make.

## What "not hope-driven" looks like

The alternative is not "don't use agents." It is "don't run them as you." Give the agent its own identity, and make that identity narrow:

- Run it in a sandbox, container, or VM, not in your personal session.
- Give it its own scoped, ephemeral credentials, created for the task and destroyed afterwards, not your standing keys.
- Use key-controlled access so it can only reach the specific data and capabilities the task actually needs.
- Make permissions per-action, just-in-time, and time-bounded, rather than a permanent union of everything.
- Keep full provenance, so every action is attributable and reviewable.

The principle in one line: give it the one key for the one task, briefly. Not the keys to the castle, indefinitely.

In practice, this is exactly how I work now. I use sgraph.ai vaults all the time to work with agents without ever handing them my credentials. The agent gets a vault scoped to the task, holding only the data and the keys it actually needs, and my real credentials never enter its context. The vault is the boundary: the agent operates on what is inside it, with full provenance, and nothing else. That is the difference between authorising an agent to touch everything and authorising it to touch one thing.

## The bottom line

This is why I do not run models on my laptop. Running a model under my own account authorises it, at that moment, to do everything I can do. And once I have done that, the only thing preventing harm is the hope that it behaves.

Hope is not a threat model. Hope is not a security control. Hope is hope.

An agent on your laptop runs as you. It inherits every credential, session, and key you have, and you authorised all of it the moment you launched it. If the only thing left protecting you is hoping it does not misbehave, then you are not doing security. You are doing hope-driven development.

---

*This article is released under the Creative Commons Attribution 4.0 International licence (CC BY 4.0).*
