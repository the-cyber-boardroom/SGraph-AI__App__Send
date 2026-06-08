# Thread: Accountability Happens at Provisioning Time

*A LinkedIn thread spun out of the "Hope-Driven Development" article, built around the single most powerful idea in it. Each post is separated by a divider for easy copy-paste.*

---

**1/**

The most important idea in my Hope-Driven Development article isn't "hope."

It's this:

Authorisation doesn't happen when an agent acts. It happens the moment you assign the privileges.

That one shift changes who is accountable. A short thread.

---

**2/**

When you launch an agent under your own account, you have already authorised it to do anything your account can do.

Not "if it decides to." Already.

The decision was made at launch. Everything the agent does afterwards is just the consequence of a decision you already took.

---

**3/**

This is why "the model hallucinated" or "it got prompt-injected" is not a defence.

Those explain how the harm happened. They don't change who authorised it.

You did. At provisioning time. When you handed over the keys.

---

**4/**

So the over-provisioning is the decision. The bad outcome is just the consequence.

If an agent wipes the production database, the root cause isn't the delete command.

It's that it ever held delete rights it never needed.

---

**5/**

This flips the security question.

Stop asking "can I trust the model's behaviour?" That one is unsolved, and probably unsolvable.

Start asking "what did I authorise it to touch?" That one is a decision entirely within your control.

---

**6/**

It also flips the question you ask after an incident.

Not "why did the agent do that?"

But "why did it have the privilege to?"

The interesting failure is the grant, not the act.

---

**7/**

None of this is new theory. It's least privilege and zero trust, finally given teeth.

You were always accountable for what you granted.

Agents acting at machine speed and scale just made that accountability impossible to ignore.

---

**8/**

It gets sharper with swarms.

Spin up many agents and you've authorised the union of all their privileges, all live at once.

Nobody sat down and chose to grant that union. It emerged.

And you're still accountable for it.

---

**9/**

The fix is to make provisioning an actual decision, not an afterthought.

Scoped. Ephemeral. Per-action. Just-in-time.

Give the agent the one key for the one task, briefly. Not the keys to the castle, indefinitely.

(In practice I use sgraph.ai vaults for exactly this: the agent gets only the data and keys the task needs, and my real credentials never enter its context.)

---

**10/**

Authorisation happens at provisioning time, not when the model acts.

Which means accountability does too.

Choose what you grant as carefully as you'd choose what to do yourself. Because the moment you grant it, you already have.

Full article in the comments.

---

*Based on the article "Hope-Driven Development and the Risks of Running LLMs Under Your Account" by Dinis Cruz. Released under CC BY 4.0.*
