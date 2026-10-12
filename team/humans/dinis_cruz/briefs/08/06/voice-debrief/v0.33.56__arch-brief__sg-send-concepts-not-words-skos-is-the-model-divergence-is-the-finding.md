# Concepts, Not Words: The Model Already Exists, The Translation Failure Diagnosed An English Failure, And Where The Graphs Diverge Is The Finding

**version** v0.33.56
**date** 6 August 2026
**from** Human (project lead)
**to** Engineering, Product, Design

**type** Architecture brief

*Fifteenth of 6 August. Answers a terminology question asked directly in the memo. Standards are grounded and cited. Written without sight of the current locale grid, which is noted where it matters.*

---

## What This Is

An abstraction layer between the concepts a product expresses and the words each locale uses for them, prompted by a translation that reads badly and by a question about what such a thing is called: **the word being reached for is concept, as distinct from term or label, and the model built on that distinction is a published standard in which a concept is language-independent and carries one preferred label per language, any number of alternative labels, and relations to broader, narrower and related concepts, with the standard behind it distinguishing concepts from terms precisely so that meaning is not stored in any one language's vocabulary; the corpus found this five days ago from a different direction, when the multilingual thesaurus maintained for European legislation turned out to attach labels in every official language to one language-independent concept, and the conclusion recorded then applies here unchanged, that a nuance survives translation not because a translator preserved it but because it was never stored in a word; the worked example in the memo is better than it appears, because noticing that a Portuguese rendering reads badly led to the discovery that the English word was probably wrong first, and that is the general property worth building for, since naming a concept forces a decision the source language let you avoid, which makes the concept layer a quality control on English rather than only an aid to translation; the testable property proposed is the strongest idea in the memo and needs one refinement, because when the graphs induced by two languages differ, the cause is either a bad translation or a genuine gap where the languages carve the space differently, and the standard already provides vocabulary for the second, distinguishing exact from close and broader from narrower correspondence, so partial equivalence is recordable rather than forced; and the validation method the memo ends on is held-out testing, generating the graph for a new locale without showing the reference and comparing the structures, which is cheap enough to run automatically.** It is the fifteenth document of 6 August (cross-ref: the v0.33.53 paragraph-as-bow-tie brief, the v0.33.56 flow MVP brief, the v0.33.56 workflow state machine brief, the v0.33.49 fractal-registers brief, and the v0.33.54 canonical-Act brief). New contributions: **the terminology answered, the standard identified as the model to adopt rather than invent, the observation that the translation failure diagnosed a source-language failure, divergence classified as either error or lexical gap with the standard's own vocabulary for the second, and held-out generation as an automatable check.**

## The Word Is Concept

The memo asks directly. The project lead: **"is there ontology? Is it sort of what's the word to do with the family of words and the meaning of the words and how they relate and how everything connects?"**

Several words are circling and they are not synonyms:

| Term | What it means |
|---|---|
| **Concept** | The unit of meaning itself, independent of any language |
| **Term** or **label** | How one language expresses a concept |
| **Taxonomy** | A hierarchy, so a set of is-a-kind-of relations |
| **Ontology** | A formal specification of concepts and the relations between them |
| **Semantic field** | A set of words related in meaning, which is the phrase the memo is reaching for |
| **Concept scheme** | A named collection of concepts, which is what this product would have |

**The distinction that does all the work is concept against term.** Once meaning lives in a concept and words are labels attached to it, translation stops being word-to-word and becomes concept-to-label, and the failure mode the memo is chasing disappears by construction.

## The Model Already Exists

Worth adopting rather than designing, because it is a published standard with an established vocabulary and existing tooling.

The system in question represents each unit of meaning as a **concept**, which carries **one preferred label per language**, any number of **alternative labels** for synonyms and near-synonyms, and optionally **hidden labels** used for search but never shown. Language tags scope each label to its language, which the specification describes as enabling a simple form of multilingual labelling. Concepts relate through **broader**, **narrower** and **related**, and carry definitions and scope notes.

Behind it sits a thesaurus standard that separates concepts from terms explicitly, and an extension exists for cases where each label needs its own identity and metadata, such as when it was chosen and by whom.

```
   CONCEPT   "a locale whose translations are incomplete
              and not yet trusted"
       |
       +-- prefLabel  en-GB : ?
       +-- prefLabel  en-US : ?
       +-- prefLabel  pt-PT : ?
       +-- prefLabel  pt-BR : ?
       +-- altLabel   ...
       +-- definition, scopeNote
       +-- broader / narrower / related
```

The corpus already met this on 31 July, when the work on attaching concepts to legal provisions established that the multilingual thesaurus maintained for European legislation gives one concept many labels across two dozen languages. The conclusion recorded then is exactly this memo's problem: **a nuance survives translation not because a translator preserved it but because it was never stored in a word.**

## The Translation Failure Diagnosed An English Failure

The memo's worked example is more valuable than it presents itself as being. The project lead: **"on the dropdown that we use to show the language, we actually show draft for the languages that we're still working on, and then when you go to translation, it translates as rascunho, which doesn't sound well."**

And then the better observation. The project lead: **"is draft even the best word, because if you connect to it, draft is more connected to a piece of paper and something handwritten, versus a beta version of an application or an early version or something that is experimental."**

That is the general property worth building for. **You cannot translate a concept without first naming it, and naming it forces a decision the source language let you avoid.** The English word was chosen once, quickly, and never examined, because English speakers reading it supply a plausible meaning without noticing they are guessing.

The candidates are not synonyms and choosing between them is the actual work:

| Candidate | What it actually means |
|---|---|
| Draft | An unfinished artefact its author is still working on |
| Beta | A released thing, functional but not final |
| Preview | Shown deliberately early, complete enough to see |
| Incomplete or partial | A statement about coverage rather than about stage |

For a locale with some strings translated and some missing, the last is probably the concept and the first is probably wrong. **Once that is decided, all four translations follow, and one of them is not `rascunho`.**

So the concept layer earns its place twice: it prevents meaning being lost in translation, and it catches source-language vocabulary that was never right.

## Where The Graphs Diverge Is The Finding

The memo proposes a test and it is the strongest idea in it. The project lead: **"the graphs should be consistent across languages, and then you intersect both graphs with the language-specific words and connections, and they should normalise."** With the diagnostic. The project lead: **"if we have different graph shapes, that's when we start to see different meanings."**

That is genuinely computable: build the concept graph implied by each locale's vocabulary and compare the structures. One refinement matters, because divergence has two causes and they need opposite responses.

**Cause one: a bad translation.** The concept is the same in both languages and the chosen word does not carry it. That is a defect and it should be fixed.

**Cause two: a genuine gap.** The languages do not carve the space the same way, so no single word in one corresponds exactly to a word in the other. **That is not a defect, it is information**, and forcing an exact correspondence would destroy it.

The standard already supplies vocabulary for the second, distinguishing **exact** correspondence from **close** correspondence and from **broader** or **narrower** matches, so partial equivalence is recordable rather than papered over. Where a Portuguese term is narrower than the English concept, that is a fact worth storing, and it tells a writer to consider whether the interface should say something different in that locale rather than something translated.

This is the same shape as the finding from this morning's transcription work, where two models disagreeing about a word was identified as more informative than a smoothed merge. **Divergence should be surfaced, not resolved.**

## Held-Out Generation Is A Real Check

The memo ends on a validation method that deserves naming. The project lead: **"without providing the answer, to say: give me the semantic graph of this structure for this new language, and then see if that connects back to what we think should connect."**

That is held-out testing, and it has properties that make it worth automating. The reference graph is never shown, so agreement is evidence rather than echo. It costs one generation per locale. And it can run in a build, failing when a newly added locale produces a structure that does not match, which turns localisation quality into something checkable rather than reviewed.

Two honest caveats. Agreement means the model and the reference agree, which is weaker than either being right, so it catches divergence rather than proving correctness. And a model asked to produce a concept graph for a language it knows well may reproduce the same conventional assumptions that produced the reference, which is a correlated-error problem of exactly the kind identified this morning in the two-transcription design.

## The Payoff Compounds

The memo names the reason to do this now. The project lead: **"once we have these graphs normalised for a couple of languages, the next languages should become much better, because we now have a way to check those words."**

That is right, and the mechanism is worth stating. The first locale pair is expensive: concepts must be identified, named, defined and given scope notes, which is genuine editorial work. The second pair is cheaper because the concepts already exist and only labels are needed. By the fourth, the reference graph is stable enough that a new locale is a labelling exercise with an automatic structural check.

This is the same declining cost curve identified on 31 July for mapping regulatory instruments, where vocabulary accumulated within a document and transferred across documents. Here the transfer is across languages rather than across instruments, and it is the reason to build the concept layer before the fifth locale rather than after.

## Scale Is Why This Is Tractable

Worth stating because it is what makes the proposal reasonable rather than ambitious. The project lead: **"it's also a small set of universe, a small set of words and a small set of phrases."**

An interface vocabulary is a few hundred strings. That is small enough for genuine editorial care on every concept, with a model proposing and a person confirming, and it is small enough to hold in one visualisation. The same exercise over a large corpus would be infeasible.

So this is a good first application of a primitive the corpus wants generally, which is the argument for building it here properly rather than expediently.

## Culture Is A Second Axis, And It Strains The Model

The memo separates language from culture and is right to. The project lead: **"we now have four locales cultures... the idea is again to capture the different cultures."** And it asks for both graphs. The project lead: **"have the graph of the cultures, so we can connect to the different cultures."**

The concept model handles most of this cleanly, because two English variants are simply two label sets over the same concepts. Where it strains is a concept that exists in one culture and not another, which cannot be expressed as a missing label because there is nothing to label.

For an interface vocabulary this is unlikely to arise often, and it will arise. The honest position is to allow a concept to be marked as not applicable in a locale, rather than to force every concept to have a label everywhere, and to treat the appearance of such a case as worth a human decision rather than an automatic fallback.

## What To Build

The memo asks for this as a separate surface and that is right. The project lead: **"we can do this completely separate from this part, on a separate part of the code, separate part of the page."**

1. **The concept scheme**, extracted from the current interface strings, with a definition and scope note per concept written in English and treated as the authority rather than the English label.
2. **Labels per locale**, attached to concepts rather than to string keys.
3. **A visualisation** showing concepts, their relations, and the labels each locale attaches, which is what the memo asks to see.
4. **The divergence report**, listing where locale graphs differ, classified as suspected error or recorded gap.
5. **The held-out check**, run per locale in the build.
6. **A review pass on the English**, because the concepts will surface several words chosen carelessly, of which `draft` is one.

Step six is the one likely to produce the most immediate value and the one most easily skipped.

## A Note On What I Have Not Seen

The memo mentions uploading the current version, particularly the explanations shown alongside each locale in the grid, and that has not arrived with this brief. Those explanations are probably the closest thing to definitions that already exists, so they are the natural starting point for step one rather than something to write from scratch. Worth checking before any concept is defined from a blank page.

## What This Does Not Try To Be

- **Not a translation memory.** Concepts with labels, not source-target string pairs.
- **Not a new model.** A published standard with existing vocabulary and tooling.
- **Not a forced correspondence.** Partial equivalence is recordable and should be recorded.
- **Not only about translation.** It is a quality control on the source language too.
- **Not general.** A few hundred interface strings, which is why it is tractable.

## Honest Tensions

| Tension | Note |
|---------|------|
| Concept-first versus how translation is done | Every existing tool and workflow is string-keyed, so this cuts against the grain of the tooling the team already uses |
| Editorial cost of the first pair | Naming and defining concepts is real work, and the payoff arrives at the third or fourth locale |
| Divergence as information | Recording a gap is more honest than forcing a word and leaves somebody to decide what the interface actually says |
| Held-out checking | It detects disagreement and does not establish correctness, and a model may share the reference's assumptions |
| Culture as an axis | Most of it is label sets over shared concepts, and the cases that are not will need judgement rather than a rule |
| A separate surface | Keeping it out of the product is right for now and means it can drift from the strings actually shipped |

## Open Questions

| Question | Notes |
|----------|-------|
| What is the concept behind the current use of draft? | Deciding this determines all four labels, and probably changes the English one |
| Do the existing per-locale explanations serve as definitions? | They may already be most of step one |
| Where do concepts live? | Alongside the strings, or as their own artefact with the strings generated from them |
| How is a lexical gap presented to a writer? | Recording it is easy; deciding what the interface then says is not |
| Does the label need its own provenance? | Who chose this word and when, which the standard's extension supports if wanted |
| How is the concept scheme kept in step with shipped strings? | A separate surface can drift, so a check that every shipped string maps to a concept is worth having |
| Does the divergence check gate a release? | It is a finding rather than a defect, so failing a build on it may be too strong |

## Relationship To Previous Briefs

| Date | Document | Relationship |
|---|---|---|
| 31 Jul | `v0.33.54__arch-brief__sg-send-paragraph-as-bow-tie-concept-extraction-eu-authority-tables-declining-cost-curve-shades-of-compliance.md` | Where the corpus established one concept with a label per language, and that nuance survives translation by never being stored in a word |
| 6 Aug | `v0.33.56__dev-brief__sg-send-flow-mvp-declaration-not-javascript-editor-already-exists-replay-for-tests.md` | The same product surface, and the principle of surfacing disagreement rather than resolving it |
| 6 Aug | `v0.33.56__dev-brief__sg-send-workflows-as-state-machines-budget-on-the-step-disagreement-is-the-product.md` | Correlated errors between models, which the held-out check inherits |
| 31 Jul | `v0.33.54__arch-brief__sg-send-canonical-ai-act-paragraph-as-file-amendment-as-native-graph-operation-view-from-any-provision.md` | The declining cost curve as vocabulary accumulates, here across languages rather than documents |
| 17 Jul | `v0.33.49__arch-brief__sg-send-fractal-risk-registers-one-per-accepting-role-domain-language-relevance-fade.md` | Translation between audiences as the same operation as translation between languages |

---

## Key Claims

| # | Claim |
|---|-------|
| 1 | The word being reached for is concept, distinct from term or label, with semantic field describing the family of related words |
| 2 | A published standard already models this: one concept, one preferred label per language, alternative labels, and broader, narrower and related relations |
| 3 | The corpus reached the same primitive on 31 July from the regulatory work |
| 4 | Meaning survives translation because it was never stored in a word, not because a translator preserved it |
| 5 | Noticing a bad Portuguese rendering revealed that the English word was probably wrong first |
| 6 | Naming a concept forces a decision the source language allowed you to avoid, so the layer is a quality control on English |
| 7 | Draft, beta, preview and incomplete are different concepts, and choosing between them determines every translation |
| 8 | Comparing the graphs induced by each locale is computable, and divergence has two causes needing opposite responses |
| 9 | The standard supplies vocabulary for partial equivalence, so a genuine lexical gap is recordable rather than forced |
| 10 | Divergence should be surfaced rather than resolved, which is the same conclusion reached this morning about disagreeing transcriptions |
| 11 | Held-out generation is a real check, cheap enough to automate, and it detects disagreement rather than proving correctness |
| 12 | Cost declines with each locale, which is the argument for building this before the fifth rather than after |

---

## Sources

- The knowledge organisation standard in which a concept carries one preferred label per language, any number of alternative labels and optional hidden labels, with language tags scoping each label, described as enabling a simple form of multilingual labelling, together with the broader, narrower and related semantic relations and the definition and scope note annotations: https://www.w3.org/TR/skos-primer/ and https://arxiv.org/pdf/1107.1676
- The correspondence vocabulary distinguishing exact from close and related matches, allowing accurate or approximate conceptual equivalence to be recorded between schemes, and the thesaurus standard behind it which separates concepts from terms: https://hal.science/hal-03264850/document and https://www.dublincore.org/specifications/skos-thes/ns/
- The extension in which each label becomes an object with its own identity, allowing metadata such as creation and modification dates to attach to a specific word choice, and the alignment of that extension with the underlying thesaurus standard: https://www.researchgate.net/publication/365845555_Simple_Knowledge_Organization_System_SKOS and https://silo.tips/download/correspondence-between-iso-and-skos-skos-xl-models
- Practice on constructing multilingual thesauri from an initial single-language scheme by attaching terms in further languages to existing concepts: https://www.academia.edu/27006479/Developing_SKOS_Compliant_Multilingual_Thesaurus_An_ISO_25964_Based_Approach

---

This document is released under the Creative Commons Attribution 4.0 International licence (CC BY 4.0).
