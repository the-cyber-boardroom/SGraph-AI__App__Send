# Research Brief: PKI Historical Analysis — Why Didn't It Succeed and Is It the Right Bet?

**version** v0.6.14  
**date** 23 Feb 2026  
**from** Human (project lead)  
**to** Historian (lead), Architect, Alchemist, Ambassador  
**type** Research brief — historical analysis and technology viability  

---

## The Questions

Three questions that must be answered honestly, without bias from our existing investment in PKI:

### Question 1: Is PKI the Best Solution?

Public and private key infrastructure is our core primitive. But is it the RIGHT primitive? What alternatives exist, and could any of them be better?

| Technology | What It Does | Where It's Heading |
|---|---|---|
| **PKI (RSA, ECC, Ed25519)** | Asymmetric encryption. Public key encrypts, private key decrypts. Well-understood, decades of deployment. | Still the standard. Post-quantum variants emerging (CRYSTALS-Kyber, CRYSTALS-Dilithium). |
| **Client-side tokens (FIDO2/WebAuthn)** | Hardware-backed authentication. USB keys, biometrics. Passwordless. | Growing fast. Supported by all major browsers. Identity-focused, not encryption-focused. |
| **Secure enclaves (TEE/SGX/TrustZone)** | Hardware-isolated execution environments on the CPU. Code runs where even the OS can't read it. | Intel SGX, ARM TrustZone, Apple Secure Enclave. Cloud versions: Azure Confidential Computing. |
| **Trusted Platform Module (TPM)** | Hardware chip that stores keys and performs crypto operations. The key never leaves the chip. | Standard in most PCs since 2016. Windows 11 requires TPM 2.0. |
| **OS-level encryption services** | Keychain (macOS/iOS), Credential Manager (Windows), Keystore (Android) | Maturing. Good for key storage. Not designed for cross-platform messaging. |
| **Post-quantum cryptography** | New algorithms resistant to quantum computing attacks (lattice-based, hash-based) | NIST standardisation in progress. Kyber (key exchange), Dilithium (signatures). |
| **Zero-knowledge proofs** | Prove you know something without revealing it. | Maturing beyond cryptocurrency. Could enable verification without revealing content. |
| **Homomorphic encryption** | Compute on encrypted data without decrypting it. | Still slow. Research-grade for most applications. Potential game-changer in 5-10 years. |

**Research task**: for each alternative, assess:
- Can it replace PKI for our use case (encrypted file transfer + identity verification)?
- Can it complement PKI (used together)?
- What's the maturity level (production-ready, emerging, research)?
- What's the adoption trajectory?

**The honest answer may be**: PKI is the right foundation AND we should design the system so the encryption primitive is swappable (which MemoryFS + our abstraction layers already enable).

---

### Question 2: Why Didn't PGP Succeed?

PGP (Pretty Good Privacy) has existed since 1991. Public key registries (SKS key servers) have been running for decades. At peak, millions of keys were published. Today, PGP adoption for email is negligible outside of niche communities.

**Research the failure modes:**

| Hypothesis | What to Investigate |
|---|---|
| **UX was terrible** | PGP required command-line tools. Key management was painful. Average users couldn't figure it out. Has UX improved enough with browser-based crypto? |
| **Key management was the killer** | Users lost private keys. Key revocation was poorly understood. Key servers had no KYC — anyone could publish a key claiming to be anyone. |
| **Web of trust didn't scale** | PGP's web of trust required in-person key signing parties. This doesn't scale beyond tech conferences. |
| **No network effect** | Both sender AND receiver needed PGP. If the recipient doesn't have a key, you can't send encrypted email. Cold start problem. |
| **Email providers didn't integrate** | Gmail never added PGP support. Outlook never added PGP support. If the platforms don't support it, users won't adopt it. |
| **The pain point wasn't big enough** | Most people don't send sensitive content by email. The "I need encryption" moment is rare for most users. |
| **Regulation didn't require it** | GDPR exists but doesn't mandate encryption of email. If compliance doesn't require it, enterprises won't invest. |
| **Alternatives emerged** | Signal, WhatsApp (end-to-end encryption) solved the messaging privacy problem without requiring users to manage keys. |

**For each hypothesis**: find evidence (adoption data, user research, case studies, post-mortems). Which failures are intrinsic to PKI and which are implementation/ecosystem failures that we can avoid?

---

### Question 3: What Can We Learn from History?

**The Historian should research:**

| Period | What to Investigate |
|---|---|
| **Ancient cryptography** | Caesar cipher, Enigma, Navajo code talkers. What principles of secure communication over open channels have been known for millennia? |
| **Postal security** | Wax seals, tamper-evident envelopes, registered mail. Physical-world analogues to our digital signatures. |
| **Telegraph / radio encryption** | One-time pads, Enigma, SIGINT. The original "messages over untrusted channels" problem. |
| **PGP era (1991-2010)** | Rise and plateau of PGP. Key servers. Web of trust. What worked, what didn't. |
| **SSL/TLS success** | Why did TLS succeed where PGP failed? Both are PKI. TLS is ubiquitous. PGP is niche. Key difference: TLS is invisible to users. |
| **Signal Protocol (2013+)** | Ratcheted key exchange. How Signal made encryption invisible. What can we learn from their UX? |
| **Blockchain identity (2015+)** | Self-sovereign identity, DID, Verifiable Credentials. Attempted to solve the PKI identity problem. Status? |
| **Semantic web parallel** | Amazing technology, right problem, wrong time. Why didn't it scale? Creation of mappings was too hard. Visualisation was weak. Graph databases weren't ready. What's different now? |

### The Semantic Web Lesson

The semantic web is a direct parallel:

| Semantic Web | SG/Send / PKI |
|---|---|
| Right technology | Right technology |
| Right problem (structured data, machine-readable web) | Right problem (encrypted communication, verifiable identity) |
| Failed to scale because: creating RDF mappings was too labor-intensive | Risk of failing because: managing PKI keys is too labor-intensive? |
| Graph databases weren't mature | Trust web infrastructure doesn't exist yet? |
| Tooling was poor | Browser-based crypto is now mature (Web Crypto API). Is this enough? |
| Revived by: knowledge graphs (Google), LLMs (structured extraction) | Revived by: agentic AI (agents need verified identity), deepfakes (people need proof of identity) |

**The question**: is NOW the right time for PKI, the way NOW is the right time for knowledge graphs? Have the enabling technologies (browser crypto, LLMs, agentic workflows, deepfake threat) created the conditions for PKI to succeed where PGP failed?

---

## The TLS Success Model

TLS (HTTPS) is PKI that succeeded. Why?

| TLS Property | PGP Equivalent | Lesson for SG/Send |
|---|---|---|
| **Invisible to users** — users don't manage certificates | **Visible to users** — users must manage keys | Make key management invisible. Auto-generate keys. Store in browser. Never ask the user to "manage" anything. |
| **Certificate authorities handle identity** — users trust CAs | **Web of trust** — users verify each other | We need a trust anchor. Could be our registry. Could be identity providers. The user should not be the trust anchor. |
| **Browsers enforce it** — Chrome shows warnings for HTTP | **No enforcement** — email works fine without PGP | We need platform enforcement. Data rooms require PKI. The product doesn't work without it (by design). |
| **Let's Encrypt made it free** — cost barrier removed | **Key generation was complex** — friction barrier | Key generation must be one-click or automatic. We already do this in the browser. |
| **Google ranked HTTPS higher** — economic incentive | **No incentive for PGP** — no business benefit | Create incentive: trust scores, platform access, partner integrations — all require PKI. |

---

## Deliverables

| # | Deliverable | Who |
|---|---|---|
| 1 | Technology comparison: PKI vs alternatives (FIDO2, TEE, TPM, post-quantum, ZKP, HE) — can any replace or complement PKI for our use case? | Architect |
| 2 | PGP post-mortem: why it failed, evidence for each hypothesis, which failures we can avoid | Historian + Architect |
| 3 | Historical analysis: secure communication through the ages, lessons for modern systems | Historian |
| 4 | TLS success model: why TLS succeeded, how to apply each lesson to SG/Send | Architect |
| 5 | Semantic web parallel: timing analysis — are enabling conditions now in place for PKI to succeed? | Historian + Alchemist |
| 6 | Risk assessment: what could cause OUR PKI approach to fail the same way PGP did? Mitigation plan for each risk. | AppSec + Architect |
| 7 | Recommendation: is PKI the right bet? If yes, with what modifications? If no, what instead? | Architect (final call) |

---

This document is released under the Creative Commons Attribution 4.0 International licence (CC BY 4.0). You are free to share and adapt this material for any purpose, including commercially, as long as you give appropriate credit.
