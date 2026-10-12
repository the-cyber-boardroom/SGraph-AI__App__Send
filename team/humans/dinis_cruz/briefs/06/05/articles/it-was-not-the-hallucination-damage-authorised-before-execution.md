# It Was Not the Hallucination: The Damage Was Authorised Before the Agent Executed Anything

An AI agent does something it should never have been able to do. It deletes the production data. It leaks a secret. It moves money. It sends something on your behalf.

The reflex is immediate and universal: "the model hallucinated." Or "it got prompt-injected." Or "the agent went rogue."

Every one of those explanations shares the same flaw. They all locate the cause in something the model did at the moment of the incident. But the model did not authorise the damage. The authorisation happened earlier, before the model executed a single token, at the moment the agent was launched with the credentials to do it.

## Authorisation happens before execution

This is the whole point, so let me state it as plainly as I can.

Whenever an agent is launched with a set of credentials, it has already been authorised to do anything those credentials permit. Not when it later decides to act. At launch. The credentials, granted in advance, define the complete set of damage the agent is now capable of causing. Everything after that is execution, not authorisation.

> The decision was made at launch. Everything the agent does afterwards is just the consequence of a decision you already took.

This holds for any agent, given any set of credentials, by anyone. The most extreme and most common version is launching an agent under a human user's own account, where it inherits everything that person can do. But the principle does not depend on that case. A service account, a scoped token, an API key, an assigned role: every one of them is a provisioning decision, and every one of them fixes, in advance, the full blast radius of whatever the agent does next.

## The hallucination is the mechanism, not the cause

"The model hallucinated" describes how the harm happened. It does not explain why the agent was able to cause it.

The hallucination is downstream of a decision that was already made. If the agent had never held delete rights, the same hallucination would have been harmless: a wrong sentence, not a wiped database. The thing that turned a bad output into real damage was the access, and the access was granted before the model ran.

So you cannot pre-authorise an agent to do something and then disown the result by pointing at the mechanism that triggered it. The hallucination pulled the trigger. The provisioning loaded the gun, chambered the round, and handed it over. We spend almost all of our attention on the trigger and almost none on the decision to hand over a loaded weapon.

## The over-provisioning is the decision. The outcome is the consequence.

This changes who is accountable, and it changes it in a way that is uncomfortable but correct.

If an agent wipes a production database, the root cause is not the delete command it generated. It is that the agent ever held delete rights it never needed. The over-provisioning was the decision. The deletion was merely the consequence of a decision already taken.

Which means the question to ask after an agent incident is not "why did the agent do that?" That question is a dead end, because the honest answer is often "because that is what models sometimes do," and you cannot fix that. The question is "why did it have the access to?" That one leads straight to a decision that a person or a process actually made, in advance, and can make differently next time.

## We have known this for decades

Safety engineering worked this out long ago, and it is worth borrowing the language.

When something goes wrong, there is a first story and a second story. The first story blames the actor closest to the harm and stops there: human error. The second story asks what in the system made the failure possible in the first place.

Three Mile Island is the textbook case. The first story was operator error. The second story was a control room that told operators whether a critical relief valve had been commanded shut, but not whether it was actually shut, so they misdiagnosed a situation they had no way to read correctly. The fix was not to tell the operators to be more careful. It was to change the system that had set them up to fail.

"The model hallucinated" is our version of "operator error." It is the first story. It feels like an explanation, and it ends the inquiry in exactly the wrong place. The second story, every single time, is the provisioning: the access we granted before the model executed anything.

## Why this is good news

It is tempting to read this as bleak. It is the opposite.

Model behaviour, the hallucinations and the susceptibility to prompt injection, is genuinely hard and largely unsolved. You cannot make a model infallible, just as Three Mile Island could not make its operators infallible. If your safety depends on the agent always behaving, you have no safety.

But provisioning is a design decision, and it is entirely within your control. That is precisely where leverage was found in every high-consequence industry: you cannot perfect the actor, so you fix the system the actor operates inside. You cannot perfect the model, so you fix the system of access it executes inside. That is a solvable problem.

## Make provisioning a decision

The fix is to treat provisioning as the consequential decision it actually is, rather than an afterthought before launch:

- Give each agent its own identity, not a borrowed one.
- Make credentials scoped, ephemeral, and specific to the task.
- Grant permissions per action, just in time, and time-bounded, instead of as a standing union of everything.
- Apply defence in depth, so a single bad action is contained rather than catastrophic.
- Keep full provenance, so the decision behind every access is always reconstructable.

The principle in one line: give the agent the one key for the one task, briefly. Not the keys to the castle, indefinitely.

## Swarms make it worse

This gets sharper the moment you run many agents at once. Launch a swarm, and you have authorised the union of all their privileges, simultaneously available, before any of them executes a thing. Nobody sat down and decided to grant that union. It emerged from a dozen separate provisioning decisions that were never weighed together. When the incident comes, "one of the agents went rogue" will be the easy story, and "the swarm held, from the start, privileges no single decision ever sanctioned" will be the truth.

## The discipline

The hallucination will always be the easy story. It sits right there, and it points the finger away from us.

But the agent was authorised to do the damage before it did anything at all. The hallucination is just what happened to trip a wire we had already strung. So the question is never "why did the model do that?" It is "what did we authorise it to do, before it did anything?"

Answer that honestly, and you will find, every time, a decision that was already yours.

---

*This piece develops one idea from an earlier article of mine, "Hope-Driven Development and the Risks of Running LLMs Under Your Account," which looked at the most extreme version of this: running an agent under your own user identity. The point here is broader. It applies to any agent, launched with any set of credentials, by anyone.*

*Released under the Creative Commons Attribution 4.0 International licence (CC BY 4.0).*
