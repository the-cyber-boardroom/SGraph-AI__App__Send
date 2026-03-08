# How Do I Prove I Am Who I Am?

**version** v0.12.2  
**date** 7 Mar 2026  
**from** Human (Dinis Cruz)  
**to** Public — for publication on sgraph.ai/blog, LinkedIn  
**type** Article — identity verification, web of trust, agents  
**next step** Team to write companion brief on solutions and implementation  

---

Last week I started reaching out to security professionals about a product I'm building. I sent WhatsApp messages. I sent LinkedIn messages. I offered free credits to try the tool.

Several people responded — but not to try the product. They responded to verify that the message was real. "Hey Dinis — just double checking its legit." One person I messaged on WhatsApp pinged me on LinkedIn to confirm. Another person I contacted on LinkedIn messaged me on WhatsApp to check.

They were doing exactly what security people should do: verifying through a second channel. I appreciated it. But it exposed a problem I couldn't solve: **how do I prove that I am who I am?**

## The Verification Gap

Think about what happens when I send you a message. You receive text from a phone number or a LinkedIn profile. How do you know it's actually me?

You might check my LinkedIn profile — but LinkedIn has no real verification process. Anyone can create a profile claiming to be anyone. You might look at my company — but Companies House records are public and easy to reference. You might call the phone number back — but that only proves the phone is real, not who's holding it.

There's no public key published anywhere that you could use to cryptographically verify my messages. There's no government-issued digital signature system that works across platforms. There's no universal "this person is verified" signal that you can check independently.

The strongest evidence that I exist is probably my Companies House registration, my electoral register entry, and the fact that multiple platforms (LinkedIn, GitHub, Twitter) have profiles that have existed for years with consistent activity. But none of these are cryptographic. They're social signals, not proof.

## The Paradox of Identity

Here's the uncomfortable truth: the more information I share to prove my identity, the easier it becomes for someone to steal my identity.

If I publish my phone number as a verification method, I've just given every scammer a real phone number to spoof. If I publish my national insurance number as proof of identity, I've handed an impersonator the key they need. If I share my email address widely so people can verify it's me, I've made myself a bigger target for phishing.

Our identity systems are designed so that proving who you are requires sharing secrets — and sharing secrets makes you vulnerable. This is fundamentally backwards. Proving my identity should make my identity harder to steal, not easier.

This is a technology failure. Specifically, it's a failure of public key cryptography adoption. If I had a public key published in multiple trusted locations, you could verify any message I sign without me revealing any secrets. The mathematics proves the identity without exposing it.

## The Web of Trust Model

The solution isn't a single verification authority. It's a web of trust — multiple independent signals that collectively make impersonation difficult.

Imagine I publish my public key in several places: a TXT record on my DNS domain (dinis.ai), a page on my company website (sgraph.ai/verify), my GitHub profile, and a signed message on LinkedIn. Each location independently confirms: "This public key belongs to this person."

If someone wants to impersonate me, they'd need to compromise all of these simultaneously — my DNS provider, my web hosting, my GitHub account, and my LinkedIn account. Each additional verification point makes the web stronger.

This is how security communities already work in practice. Security professionals have WhatsApp groups, Signal groups, shared channels. The trust is built through consistent participation over time. When someone sends a suspicious message, the group can quickly verify: "Yes, that's really Dinis" or "No, his account might be compromised." The group IS the web of trust.

The problem is that this web of trust is informal, invisible, and doesn't scale beyond personal networks. We need to make it formal, visible, and scalable.

## Agents Need Identity Too

This isn't just a human problem. I run a team of AI agents — each with a role, responsibilities, and access to different systems. I already have three librarians, five developers, and agents across multiple teams. Last week, I accidentally started a conversation with the wrong Claude window and it had no idea what I was talking about — I was literally talking to the wrong agent.

If my agents are going to act on my behalf — send messages, review code, make decisions — they need verifiable identities too. When Agent A from Team 1 asks Agent B from Team 2 for a code review, Agent B should be able to verify that Agent A is authorised to make that request.

The solution is the same: cryptographic identity. Each agent gets a key pair. Messages between agents are signed. Verification is mathematical, not social. If Agent A sends a request signed with its private key, Agent B verifies with Agent A's public key. No need to "check on LinkedIn."

## What Forces This to Exist

Two gravitational forces will make identity infrastructure inevitable.

First, **agents will proliferate**. As more people delegate work to AI agents, agents will need to communicate, authenticate, and transact with each other. An agent buying a service from another agent needs verifiable identity. An agent sending a file to another agent needs encrypted communication. The agent economy requires an identity layer.

Second, **deepfakes and impersonation will get worse**. As AI makes it trivially easy to generate realistic fake messages, fake voices, and fake video, the only reliable defence is cryptographic proof. "Does this message have a valid signature from a key I trust?" becomes the only question that matters.

The companies and projects that build this identity infrastructure now — while it's still a technical curiosity rather than a desperate necessity — will define how it works for everyone.

## What I'm Going to Do

I'm going to start small. I'm going to publish my public keys in every place I can: DNS TXT records, my website, my GitHub profile. I'm going to create a verification page on sgraph.ai where anyone can check all the evidence that I am who I say I am. I'm going to sign my messages where possible.

And I'm going to give my agents identities too. Each agent will have a key pair. Communication between agents will be signed. When my Sherpa sends a message on my behalf, the recipient will be able to verify that the message was authorised by me, through a chain of trust: my key → agent's key → signed message.

It's not going to solve the problem overnight. But every public key published, every message signed, every agent identity created adds another strand to the web of trust. And that web, once woven, is much harder to break than any single password, any single verification step, or any single platform's word that you are who you claim to be.

---

*This article is part of a series on building trust infrastructure for the age of AI agents. A companion piece exploring the technical solutions and our implementation roadmap will follow.*

---

This document is released under the Creative Commons Attribution 4.0 International licence (CC BY 4.0).
