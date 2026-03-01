# Wikipedia for Careers: Agentic Implementation Plan

**date** 26 Feb 2026  
**status** Implementation concept — for the SG/Send team and technical collaborators  
**licence** Creative Commons Attribution 4.0 International (CC BY 4.0)  

---

## The Scale Problem

The Wikipedia for Careers concept is compelling. It is also a significant undertaking. To build a genuinely useful, evidence-based body of career knowledge you need:

- Hundreds to thousands of interviews with professionals across career stages and backgrounds
- Systematic analysis to find patterns across those interviews
- Ongoing curation, cross-referencing, and verification
- Multilingual reach — career opacity is not a problem unique to English-speaking countries
- Attribution and provenance — knowing who contributed what, and being able to verify it

A traditional approach to this — a small team of researchers conducting and manually analysing interviews — would take decades to reach meaningful coverage. The bottleneck is not the idea or the willingness. It is the labour of processing information at scale.

This is exactly the problem that a well-designed agentic workflow can solve.

---

## The Agentic Approach: What It Is (and What It Isn't)

The agentic approach being described here is not "AI replaces researchers." It is "a small team of researchers, journalists, and analysts is multiplied in their capacity by well-designed workflows that handle the processable parts."

This distinction matters for trust. The interviews must be done by humans. The judgment about what is significant must involve humans. The decisions about framing and sensitivity must involve humans. But the transcription, the initial analysis, the cross-referencing, the pattern identification, the translation, the formatting, the versioning — all of this can be handled by agents, freeing the human researchers to do the work that only humans can do.

A small team of two journalists and two analysts with well-designed agentic support could realistically achieve the output of a team ten times that size. The reach is not limited by the team; it is limited by how well the workflows are designed.

### The Philosophy: Pragmatic, Transparent, Open

The agentic workflows in this project follow the same philosophy as the SG/Send platform itself:

- **Version-controlled** — every interview, every analysis, every edit is tracked
- **Incremental** — small, testable steps rather than large opaque processes
- **Open source** — the workflows themselves are public, auditable, improvable
- **Signed and attributed** — who did what, when, with what tool, is recorded
- **No magic** — every step can be explained and inspected

This is not the hype version of AI. It is the practical version: agents as tools that do specific, well-defined tasks, under human supervision, with their outputs clearly labelled as AI-assisted.

---

## The Interview Pipeline

### Phase 1: Recruitment and Consent

**Human-led. Agent-assisted.**

The researchers identify and approach interview subjects. Agents assist with:
- Drafting personalised outreach emails (tailored to the subject's background and the relevant career area)
- Managing follow-up scheduling
- Tracking consent and data permissions in a structured, auditable way

The consent model must be clear: interviews are released under Creative Commons. Subjects choose their level of anonymity (named, anonymised, sector-only). The consent record is version-controlled and signed.

### Phase 1b: Interview Brief Creation

**Human + agents, collaborative.**

Before any interview happens — human or agent-conducted — the team creates a tailored interview brief. This is not a generic questionnaire. It is a research document that:

- Summarises what is already known about this subject's career context (domain, background, relevant patterns from previous interviews)
- Identifies the specific gaps the interview should fill
- Proposes the opening questions and follow-up directions
- Notes any areas of particular sensitivity to handle carefully
- Sets the tone (exploratory, biographical, technical depth, etc.)

Agents do the background research and first-draft structure. A human researcher reviews, adjusts, and approves. The brief is version-controlled and signed before any interview begins.

This brief is the input to whichever interview mode is appropriate for this subject.

### Phase 2: The Interview — Mode Selection

The framing of "human-led, no agent involvement" is both inaccurate and impractical at the scale this project needs to operate. The reality is more nuanced — and more interesting.

**The scale argument.** To build a genuinely useful, evidence-based body of career knowledge across dozens of fields, hundreds of career stages, multiple languages and cultures, you need far more interviews than any human research team can conduct. The project will reach meaningful coverage only if agent-conducted interviews are a first-class, trusted pathway — not a fallback.

**The comfort argument.** There is growing empirical evidence that in certain interview contexts — particularly when discussing sensitive topics like failure, mental health, self-doubt, or unconventional life choices — subjects are measurably more candid with an agent interviewer than with a human one. The social performance pressure of talking to another person is absent. The concern about being judged is reduced. Some people who would never tell a human researcher about the period they nearly left their field will tell an agent. This is not a limitation of agent interviews. In these contexts, it is a specific advantage.

**The practical argument.** Many potential subjects are unavailable during researcher working hours, in different timezones, speak languages not covered by the research team, or need to do the interview in multiple parts spread across weeks. A human-only model excludes a large proportion of the people who have the most valuable stories to tell.

**The mode matrix.** The right question is not "human or agent?" but "which mode best serves this subject and this research goal?"

| Mode | Best for | Not suitable for |
|---|---|---|
| **Human researcher** | High-stakes subjects (public figures, very senior professionals); subjects who explicitly prefer human contact; situations requiring deep real-time judgment about where to probe | Scale, multilingual coverage, timezone-constrained subjects, topics where human presence reduces candour |
| **Agent voice interview** (e.g. ChatGPT voice mode, Gemini Live) | Scale; subjects in other timezones or languages; topics where anonymity and reduced social performance pressure increases candour; multi-part interviews; subjects who prefer to speak rather than type | Situations requiring genuine human relationship-building; subjects uncomfortable with AI |
| **Agent text interview** | Subjects who prefer written reflection; asynchronous participation; subjects with accessibility needs that make voice unsuitable | Subjects who express themselves better verbally; time-sensitive research |
| **Multimodal** (voice + visual, gesture-based, diagram-drawing) | Technical subjects demonstrating their work; visual thinkers; accessibility needs | Transcription and analysis complexity increases — needs appropriate pipeline support |
| **Self-directed** (subject fills a structured form) | Rapid scale-up; subjects with very limited time; supplementary data to a previous interview | First contact; nuanced or sensitive topics |

### Phase 2a: Agent-Conducted Interview Workflow

This is the workflow that has been validated in practice. It works.

**Step 1 — Brief ingestion.** The agent receives the interview brief (created in Phase 1b). This defines the research goals, the opening questions, and the sensitivity notes for this subject.

**Step 2 — Interview.** The agent conducts the interview via the appropriate medium (voice mode for verbal subjects, text for written preference). The agent follows the brief but adapts based on the subject's responses — probing unexpected directions, returning to topics the subject seemed to pass over quickly, making space for the subject to go where they need to go.

The interview is conducted in the subject's preferred language. The agent handles this natively.

**Step 3 — Stream of consciousness write-up.** After the interview, the agent produces a written account in the subject's voice — not a transcript, but a narrative that preserves the way the subject thinks and expresses themselves. First person. Their vocabulary. Their way of structuring ideas. This is a skilled task: the agent must write as the subject, not as a neutral summariser.

**Step 4 — Subject review and confirmation.** The write-up is shared with the subject. They read it and confirm: "Yes, this is what I said and how I said it. This represents me accurately." They can edit freely. They can remove sections. They can add context they forgot to mention.

This step is non-negotiable. The subject is not just consenting to use of their words — they are verifying the accuracy of the representation. Their confirmation signature is part of the provenance chain.

**Step 5 — Material return.** The confirmed write-up, the original interview recording or transcript (where applicable), the consent record, and the review confirmation are packaged and returned to the WfC team for processing.

### Phase 2b: Human-Conducted Interview

Human researchers conduct interviews where the mode matrix indicates human contact is appropriate. The workflow is similar: brief in, interview, write-up, subject review, material return. The difference is that steps 2 and 3 involve the human researcher, with agents assisting in write-up production and formatting rather than leading it.

The human researcher's judgment during the interview — where to probe, when to let silence do the work, when to redirect — is irreplaceable in high-stakes or highly sensitive contexts. The model is not "replace human interviewers." It is "deploy human interviewers where they add the most value."

### Phase 3: Transcription and Initial Processing

**Agent-led. Human review.**

If recorded: agents transcribe. If notes: agents format and structure.

Initial agent analysis:
- Extract career timeline (dates, roles, transitions)
- Flag moments that appear significant (pivots, described turning points, named mentors or experiences)
- Identify stated and implied skills
- Flag potential cross-career connections ("this sounds like what we heard from the finance interviews")
- Identify candidate quotes for the reference story

Human researcher reviews the agent output, corrects errors, adds context, validates or rejects the agent's significance flags.

### Phase 4: Pattern Analysis

**Agent-led. Human oversight.**

Agents analyse across the interview corpus:
- What common experiences appear across successful people in this field?
- What experiences appear in some backgrounds but not others?
- What credentials are mentioned as important vs what credentials appear to actually correlate with success?
- What unexpected career backgrounds appear repeatedly?
- What do people say they wish they had known?

This analysis is versioned and attributed: "Pattern analysis v0.3, generated 26 Feb 2026, reviewed by [researcher name]." The agent output is clearly labelled as analytical output, not primary data.

### Phase 5: Cross-Career Mapping

**Agent-led. Human validation.**

One of the most valuable outputs of this project is the cross-career map: which skills, experiences, and backgrounds transfer between fields? Agents are well-suited to identify these connections across a large corpus.

The outputs:
- "People who came from X background appear consistently in Y and Z fields"
- "The skill set described by successful people in A field overlaps strongly with the skill set in B field"
- "People who had experience in C role appear to transition unusually successfully into D"

These connections are the antidote to the forest problem: they show paths that exist but are not visible because no single person can see across the whole corpus.

### Phase 6: The Reference Story

**Human-written. Agent-assisted.**

The final output for each interview subject (with their consent) is a reference story — a narrative of their career path that is honest about the uncertain parts, the pivots, the unexpected elements, the things that actually mattered.

This is not a biography. It is a career map with a human face. It shows not just where someone ended up but what the journey looked like from the inside.

Agents assist with: first draft structure, ensuring the career timeline is accurate, cross-referencing against the pattern analysis. The final story is written by a human and reviewed by the subject before publication.

---

## Multilingual, Multicultural, Multi-Timezone, Multimodal

These four dimensions are where the project either scales or doesn't. They are also exactly where the agent-assisted model has its strongest advantages.

### Language

A human research team of five covers five languages — maybe. With agent-conducted interviews, the language coverage is limited only by the quality of the interview brief and the agent's language capability. Modern multimodal LLMs handle Portuguese, Spanish, German, Japanese, Mandarin, Arabic, and dozens of other languages at a level suitable for exploratory career interviews.

The provenance convention for translated materials is explicit: every translated document carries metadata identifying the source language, the translation tool and version, the date, and the human reviewer who confirmed accuracy. Nothing is presented as original when it is translated. The source is preserved.

### Culture

Language and culture are not the same. An interview brief designed for UK professionals asking about "career pivots" and "work-life balance" will not land the same way in cultures with different frameworks for discussing professional identity, failure, or ambition. 

The interview brief creation phase (Phase 1b) must be culturally adapted, not just translated. This is a human judgment call — ideally involving a researcher with cultural context for the region — and it is part of what the brief review step is for. The agent conducts the interview in the local language; the brief that shapes the questions is reviewed by a human who understands the cultural context.

Patterns identified across cultures are particularly valuable. When an accelerator that appears consistently in UK cybersecurity careers also appears in Brazilian cybersecurity careers, that is a strong signal. When it appears only in one culture, that is equally interesting and worth examining.

### Timezone and Availability

One of the most common practical barriers to career research is availability. A senior professional in Tokyo is not available during London working hours. A healthcare worker doing shift work cannot commit to a 90-minute conversation at a fixed time. A subject who wants to participate but needs to do it in three sessions across three weeks cannot be accommodated by a human researcher's calendar.

Agent-conducted interviews dissolve most of these constraints. The interview can happen whenever the subject is available. It can be paused and resumed. It can be split into a voice session one week and a text follow-up the next. The agent maintains context across sessions.

### Medium

Different people think and express themselves differently. The project should not impose a single medium.

- **Voice** suits people who process verbally — who find talking easier than writing, who express nuance through tone and rhythm. Voice mode agents (ChatGPT, Gemini Live, Claude's voice interface) are now good enough to conduct extended conversational interviews in this mode.

- **Text** suits people who prefer to reflect before responding, who write professionally, or who are conducting the interview asynchronously across multiple sessions.

- **Visual** is underused in career research. A subject drawing their career timeline on a whiteboard, or sketching the organisational structure that shaped their trajectory, or annotating a diagram of their field — these visual artefacts often capture things that words miss. Multimodal LLMs can process and discuss images, diagrams, and sketches as part of the interview.

- **Hybrid** is likely the most common real-world case: a voice interview followed by a text review of the write-up, with the subject adding visual notes where they want to clarify something.

The processing pipeline needs to handle all of these. The provenance metadata records the medium used: `interview_medium: voice/text/visual/hybrid`. Researchers analysing the corpus can filter by medium if needed, and the analysis accounts for any systematic differences between medium types.

---

## Provenance, Signing, and Attribution

This project has a provenance problem that is also an opportunity.

The provenance problem: how do you know this analysis is based on real interviews? How do you know the pattern analysis is not fabricated? How do you verify that the person attributed as saying something actually said it?

In a traditional research project, you trust the institution. In an open, distributed, agent-assisted project, you need something better than institutional trust.

The opportunity: the same cryptographic signing infrastructure being built for SG/Send applies directly here.

Every interview transcript is signed by the researcher who conducted it. Every consent record is signed by the subject (or their representative). Every agent analysis is signed by the agent run that produced it, with a reference to the input documents and the prompt used. Every human review is signed by the reviewer.

The result: a fully attributable chain from raw interview to published finding. You can trace any published claim back to:
- The interview(s) it came from
- The agent analysis that identified it
- The human who reviewed and validated it
- The subject who consented to it

This is not just good research practice. It creates a fundamentally new kind of knowledge artefact: one where the provenance is built in, verifiable, and cryptographically attested.

---

## The Last-Mile Credit Solution

The provenance infrastructure does something else. It makes the real contributors visible.

One of the core problems identified in the concept is the last-mile credit problem: the people who actually do the key work are invisible in the story of success. The attribution goes to the faces, not the builders.

A project built on signed, attributed contributions — where every interview, every analysis, every pattern identification, every editorial decision is signed by the person or agent that made it — creates a permanent, verifiable record of who contributed what.

In the research context: the junior researcher who conducted 200 interviews is not invisible. Their name is on every transcript. The analyst who identified the cross-career pattern is credited in the pattern document. The translator who made the Portuguese interviews accessible to English-speaking researchers is named in every translated document.

This is the inverted pyramid of recognition: value flows to where the work was done, not just to where it was packaged.

---

## Open Source Infrastructure Requirements

The project needs infrastructure. Here is what it requires and where it exists or needs to be built:

| Requirement | Purpose | Available / To Build |
|---|---|---|
| Version-controlled document store | Every interview, analysis, and finding is tracked | Git (available) |
| Encrypted storage for sensitive interviews | Protect subject data before consent and publication | SG/Send vault (available) |
| Signed attribution for all documents | Provenance chain for every artefact | SG/Send PKI signing (in development) |
| Structured interview processing pipeline | Transcription, tagging, initial analysis | Agent workflow (to build) |
| Cross-corpus pattern analysis | Finding patterns across hundreds of interviews | Agent workflow (to build) |
| Multilingual processing | Translation with provenance labelling | Agent workflow (to build) |
| Public-facing knowledge base | The Wikipedia itself | Static site, open source (to build) |
| Consent management | Tracking and versioning of subject consent | Structured data room (available) |
| Contribution tracking | Who contributed what, signed | SG/Send PKI + Issues-FS (in development) |

Everything must be open source. The agent workflows, the analysis prompts, the data structures — all of it. Not because of ideology, but because the project's credibility depends on transparency, and because the project will be more useful if others can extend and adapt it for their own career domains and communities.

---

## Where to Start

The scope is large. The start is small.

**Pilot: Cybersecurity careers in the UK**

Cybersecurity is a known domain with a clear diversity problem and a demonstrably false conventional wisdom about what path leads to success. It has an existing community (OWASP, CIISec, NCSC) that is invested in solving the pipeline problem. And it is the domain where the people building this project have the deepest network.

Ten interviews. Five from conventional backgrounds. Five from non-conventional backgrounds. Process with the agent workflow. Publish the first five reference stories. Publish the first pattern analysis. See what resonates, what needs adjusting, what the community adds.

This is the pragmatic version: do the minimum viable thing that proves the concept, get feedback, iterate.

---

*Released under Creative Commons Attribution 4.0 International (CC BY 4.0). You are free to share, adapt, and build on this work for any purpose, including commercially, as long as you give appropriate credit.*
