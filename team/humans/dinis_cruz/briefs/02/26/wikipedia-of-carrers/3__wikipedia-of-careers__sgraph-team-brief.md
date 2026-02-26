# How SG/Send Enables the Wikipedia for Careers

**date** 26 Feb 2026  
**audience** SG/Send team  
**status** Concept alignment — where our work already solves this, where it could  
**licence** Creative Commons Attribution 4.0 International (CC BY 4.0)  

---

## Why This Is Relevant to the SG/Send Team

The Wikipedia for Careers project is not an SG/Send product. It is a separate initiative. But it is a compelling real-world use case that maps onto problems we are already solving — and a few that we are about to solve.

This document identifies the specific points of intersection: where technology we are building (or have already built) directly enables something this project needs. It is also an honest acknowledgment of where gaps exist that we have not yet closed.

Reading this as a team gives us a concrete, human-centred use case against which to test our priorities. Abstract features become concrete when you can say: "this is what it would unlock."

---

## The Five Problems, and Where We Are

### 1. Sensitive Interview Data Needs Encrypted Storage

**The problem:** Interview transcripts, before consent is finalised and before the subject has reviewed them, contain sensitive personal information. Subject names, career struggles, personal history. This data cannot live in a public GitHub repo or a shared Google Doc. It needs to be encrypted, access-controlled, and auditable.

**Where SG/Send is today:** The vault and data room architecture handles exactly this. Symmetric-key data rooms allow a small research team to share access to a set of encrypted documents. The server cannot read the contents. Access can be granted to specific agents (the interview-processing pipeline) and revoked when no longer needed. The data room is the natural home for raw interview transcripts awaiting processing and consent.

**The gap:** The vault MCP is not yet fully built. The research team's agentic pipeline cannot yet programmatically read from and write to a data room via MCP (this is the same gap being addressed in the v0.7.1 MCP segmentation brief). Once that lands, the encrypted interview store becomes fully agentic-accessible.

**Effort to enable this use case:** Low. Mostly wiring existing capability together.

---

### 2. Provenance and Attribution Must Be Cryptographically Verifiable

**The problem:** The Wikipedia for Careers lives or dies on trust. If a pattern analysis says "70% of successful CISOs had a non-technical career pivot before age 30," readers need to be able to verify: where did that claim come from? What interviews? Who analysed them? Who reviewed the analysis? Who were the original subjects, and did they consent?

This is not solvable with a traditional document trail. Documents can be edited, backdated, or selectively disclosed. The provenance must be built into the artefact itself.

**Where SG/Send is today:** The PKI signing infrastructure is in development. The core model — where every document is signed by the key of the person or agent that created it, and the signature travels with the document — is the foundation. The Issues-FS coordination layer provides the structure for tracking what depends on what.

**What needs to be added:** Signed document chains specifically designed for research provenance. A structure where:
- Interview transcript is signed by the interviewer
- Processing output is signed by the agent run (with reference to input document hash and prompt hash)
- Review decision is signed by the human reviewer
- Published finding references the full chain

This is a specific application of the general signing infrastructure. The general infrastructure is being built; the research-provenance application needs to be designed on top of it.

**Effort to enable this use case:** Medium. The primitives (PKI signing, document hashing) exist or are in progress. The research-provenance structure needs to be designed.

---

### 3. Multilingual Processing Needs Signed, Labelled Translation

**The problem:** An interview conducted in Portuguese must be made accessible to English-speaking analysts without losing: (a) the original, (b) the translation metadata (who translated, what tool, what date), (c) the connection between the translation and the source.

Traditional translation workflows break the provenance chain. You end up with a translated document that has no reliable connection to the original, no clear labelling of what is AI-translated vs human-reviewed, and no way to verify that the translation is accurate.

**Where SG/Send is today:** The document structure supports versioned, linked files (as described in the data room preview brief). A Portuguese original and its English translation can be stored as related versions in the same data room, with explicit parent-child linking.

**What needs to be added:** A convention for labelling translated documents that the signing infrastructure enforces. Something like:
```
translation.metadata:
  source_document: interviews/2026-02-26/alice-interview-pt.md (hash: abc123)
  translation_tool: claude-sonnet (version: 20250514)
  translation_date: 2026-02-26
  human_reviewer: [reviewer key fingerprint]
  reviewer_decision: approved
  reviewer_signature: [signature]
```

This metadata is inside the signed document. The signature covers the translation and the metadata. Anyone reading the English version knows exactly what generated it and who verified it.

**Effort to enable this use case:** Low to medium. The document structure supports it. The convention needs to be defined and the signing infrastructure extended to enforce it.

---

### 4. Open-Source Knowledge Base Needs Reliable Hosting

**The problem:** The published Wikipedia for Careers — the reference stories, the pattern analyses, the career maps — needs to live somewhere permanent, open, and not dependent on any single company's continued goodwill.

**Where SG/Send is today:** The static site architecture being built for `sgraph.ai` (S3 + CloudFront, Jekyll-based, deployable from a public GitHub repo) is exactly the right model. A static site is permanent in a way that a dynamic platform is not. It can be mirrored. It can be forked. It can be served from multiple origins.

**The opportunity:** The SG/Send documentation infrastructure — the static site tooling, the CI/CD pipeline for publishing to S3, the CloudFront setup — could be extracted as a template that the Wikipedia for Careers project uses directly. We solve our own infrastructure problem and, as a side effect, provide the infrastructure for a project that demonstrates the value of what we are building.

**Effort to enable this use case:** Very low. The infrastructure is being built anyway. The Wikipedia for Careers needs a separate deployment, which is a small configuration change.

---

### 5. Contribution Tracking Must Invert the Credit Pyramid

**The problem:** Open source projects have a well-known credit problem. The person who creates the repository gets the most visibility. The person who makes the thousandth small improvement is invisible. The Wikipedia for Careers needs to specifically invert this: the people doing the interviews, the people doing the analysis, the people doing the translation — these contributions should be as visible and attributable as the person who set up the project.

**Where SG/Send is today:** Issues-FS is the coordination layer that tracks what depends on what. The PKI signing infrastructure means every contribution is attributed to a specific key. But the current model does not yet have a "contribution graph" — a way to visualise who contributed what and how their contributions connected.

**The opportunity:** The Wikipedia for Careers is a forcing function for building the contribution graph. If we build it here, it applies everywhere: to SG/Send itself (showing which agents and humans contributed to which features), to any other project that uses the same infrastructure.

The contribution graph is the technical implementation of the inverted credit pyramid. It is also a compelling demonstration of what the SG/Send platform can do that nothing else can: create a permanently attributed, cryptographically verifiable record of who built what.

**Effort to enable this use case:** Medium to high. This is new feature territory. But it is also one of the most distinctive things we could build.

---

## The Pitch to the Team

Here is the argument for treating the Wikipedia for Careers as a serious reference use case for SG/Send development:

**It is a real project with real needs.** Not a hypothetical. The concept is being actively developed. The infrastructure needs are immediate and concrete.

**Its needs map to features we are already building.** Encrypted data rooms, vault MCP, PKI signing, static site infrastructure — these are all live development areas. The Wikipedia for Careers does not require us to change direction; it gives us a compelling human story for why these features matter.

**It demonstrates SG/Send's value beyond file transfer.** The platform's real power is not "send a file without the server seeing it." That is the entry point. The real power is: a fully attributable, cryptographically signed, encrypted, agent-assisted knowledge infrastructure. The Wikipedia for Careers demonstrates this at its best.

**Social mobility is a cause worth associating with.** Building the best encrypted file transfer platform is good. Building the infrastructure that helps a social mobility project scale its impact — and doing it in a way that is transparent, open source, and Creative Commons — is better. It is also a story worth telling to investors, to users, and to potential collaborators.

**The Creative Commons licence aligns with our zero-lock-in principle.** We are already committed to zero lock-in and open standards. A project released entirely under CC BY 4.0, using open source tools, with no proprietary components — this is the natural extension of our existing values.

---

## Suggested Next Steps

| Action | Who | When |
|---|---|---|
| Share concept doc with potential collaborators | Human (project lead) | Immediately |
| Map Wikipedia for Careers needs against v0.7.1 backlog | Architect + Advocate | Next sprint |
| Design the signed research provenance document structure | AppSec + Architect | Next sprint |
| Identify 3–5 pilot interview subjects for cybersecurity domain | Human + Ambassador | This week |
| Extract static site infrastructure as reusable template | DevOps + Dev | Next sprint |
| Draft contribution graph design (as future feature) | Architect | Sprint +2 |

---

*Released under Creative Commons Attribution 4.0 International (CC BY 4.0). You are free to share, adapt, and build on this work for any purpose, including commercially, as long as you give appropriate credit.*
