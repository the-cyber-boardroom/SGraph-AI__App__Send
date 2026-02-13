---
layout: post
title: "Why We Treat Every Incident Like a Crisis"
date: 2026-02-13
author: SGraph Send Team
tags: [security, incident-handling, philosophy, transparency]
description: "Most teams wait for a crisis to take security seriously. We decided not to wait."
---

Most security teams have two modes: normal and crisis. In normal mode, security is important but never urgent. In crisis mode, everything else stops. The gap between these modes is where vulnerabilities grow.

At SGraph Send, we decided to close that gap.

## The philosophy: P3 as P1

In incident classification, P1 means critical — drop everything, all hands on deck. P3 means minor — log it, fix it when convenient, move on.

We treat every P3 as a P1.

Not because minor incidents are actually critical. But because the systemic weakness behind a minor incident is the same weakness that produces a critical one. The only difference is luck.

When a P3 occurs and you ask "what happened?", you get a small answer. But when you ask "what *could have* happened?", you often get a terrifying one. A misconfigured log that exposed no real data could have exposed everything. A commit that bypassed a check but contained nothing malicious could have contained anything.

We analyse the full union of possible damage, not just the actual damage.

## Every role is a security sensor

In most organisations, security is someone else's job. The security team reviews, the security team tests, the security team responds.

We took a different approach. Every role in our team — from architecture to testing to documentation to user experience — has an explicit incident response section in their role definition. When something goes wrong, every role asks the same question from their perspective:

**"How come this was possible?"**

- The developer asks: "How come our tests did not catch this?"
- The tester asks: "How come our test matrix had this gap?"
- The architect asks: "How come our architecture allowed this?"
- The documentation team asks: "How come this runbook was out of date?"
- The data protection officer asks: "Did we know where all personal data was?"

This is not blame. It is systematic improvement. Every "how come?" leads to a fix that prevents the entire class of issue, not just the specific instance.

## The 5x multiplier

Here is something counterintuitive about incidents: they are the single best time to fix things.

During an incident, two weeks of work produces what normally takes two months. Why? Because during an incident:

- **Arguments disappear.** Nobody debates whether security is a priority when there is an active incident.
- **Alignment materialises.** Every role understands the goal and works toward it.
- **Help arrives.** People who were too busy suddenly find time.
- **Focus replaces prioritisation debates.** There is one thing to do, and everyone does it.

We call this the 5x multiplier. And we deliberately create the same conditions during practice exercises — monthly tabletop simulations that build the muscle memory before we need it.

## Simulate before acting

One of our hardest rules: never take your first action in production.

When an incident occurs, the natural instinct is to fix it immediately. Revoke the credentials. Patch the code. Restore the backup. But acting without modelling the response first creates new problems. You destroy evidence. You miss secondary compromises. You fix the symptom while the root cause persists.

So we simulate first. Every response is modelled before it is executed. This applies to technical fixes, communications, and escalations. The cost of a 10-minute simulation is low. The cost of an unmodelled response can be very high.

## What this means for your data

SGraph Send is a zero-knowledge encrypted file sharing service. Your files are encrypted in your browser before they ever leave your device. We never have the decryption key. We cannot read your files.

Our incident handling philosophy exists to protect this guarantee. Every incident — no matter how minor — is an opportunity to verify that the zero-knowledge promise holds, to find and close gaps before they matter, and to make the system more resilient.

We practise responding to scenarios where our entire infrastructure is compromised — and the correct answer, by design, is that the attacker finds encrypted blobs they cannot decrypt, hashed IPs they cannot reverse, and metadata that does not identify file contents.

That is not an accident. It is architecture, verified through practice.

## The preparation spectrum

For every type of incident we might face, we track where we are on a spectrum:

**Unprepared** — we have not thought about this scenario.
**Practised** — we have run a tabletop exercise.
**Operationalised** — we have a runbook and designated roles.
**Automated** — we have detection rules and automated responses.

Our goal is to move every incident type rightward on this spectrum. Practice makes real incidents look like exercises. And when real incidents look like exercises, the team responds with calm, methodical precision instead of panic.

---

*Security is not a feature you add. It is a discipline you practise. At SGraph Send, we practise every day — so that when it matters, we are ready.*
