# Nano Banana for Architecture Diagrams — Research Synthesis

**Date:** 19 April 2026
**For:** SG/Send infographic pipeline
**Purpose:** Translate the evidence from Google's official prompting guide, DeepMind's product documentation, and independent case studies into concrete changes our infographic generator should adopt.

---

## 1. What the research actually says

### 1.1 Two models, different positioning

- **Nano Banana 2** (Gemini 3.1 Flash Image) — speed-optimised; the default for most generation work.
- **Nano Banana Pro** (Gemini 3 Pro Image) — reasoning-heavy; the one to reach for when precision matters. Google's own benchmarks show Pro leads on an "Infographics" axis specifically; it was tuned for this use case. Pro accepts up to 14 reference images (6 at high fidelity), supports 4K output, and has a "diagrammatic reasoning" capability that can take a rough input and produce a clean vector-style output.

**Practical takeaway:** for our architecture diagrams, if the infographic generator tool exposes a model selector, prefer Pro over Flash even at higher cost per generation. The quality delta on technical diagrams is material.

### 1.2 The fundamental shift: narrative prompts, not tag soup

This is the single biggest finding. Google describes Nano Banana as a model that interprets "natural language as a production brief, allowing creators to act as directors rather than prompt engineers." Every source converges on this — the old Stable-Diffusion-style comma-separated tag list underperforms against a coherent narrative description.

**What "narrative" means in practice:** write a paragraph that names the subject, the action, the location or context, the composition, and the style — in that order. Google's own recommended formula for text-to-image is:

> **[Subject] + [Action] + [Location/context] + [Composition] + [Style]**

For infographics specifically, this maps to:

> **[What the diagram shows] + [What structure it uses] + [What canvas/layout] + [What visual style/palette] + [What text rendering requirements]**

### 1.3 Positive framing outperforms negative

From the Google guide directly: use "empty street" rather than "no cars". Our current prompts are heavy with "Do NOT use the words SECTION, COLUMN, HEADER..." which is textbook negative framing. The research says this is slower, less reliable, and more likely to leak through because the model has to hold the forbidden terms in context.

**Inverse rewrite:** instead of *"Do NOT label the columns as SECTION 1 / SECTION 2"*, write *"The content flows left-to-right across the canvas as a seamless progression, with no intermediate section dividers or column headers."* You've described the positive state you want rather than the states you forbid.

### 1.4 Text rendering is a primary semantic layer

Earlier image models treated text as pixels. Nano Banana treats text as *semantics*. Three concrete tactics:

1. **Enclose exact text in quotes.** `"IN THE MIDDLE"` is treated differently from `IN THE MIDDLE` unquoted. Quotes signal "render this character sequence exactly."
2. **Name the typography.** *"bold sans-serif"*, *"thin Century Gothic"*, *"Impact font"*. The model can follow font descriptions, not just font names.
3. **Text-first hack.** For complex multi-text layouts, first converse with the model to nail down the text content, *then* ask it to render the image. This works because the reasoning pass happens before the pixel pass.

The Pro model specifically has dramatically lower single-line text error rates than GPT-Image-1 or Flux, across most languages. Our spelling glitches (`TITHE MIDDLE`, `wnere`, `attribututactable`, `deves`) are not capability issues — they're prompting issues, and they're fixable with quoted text and explicit character-by-character instructions for critical strings.

### 1.5 Thinking Mode exists and matters

Nano Banana 2 has a toggle for Thinking Mode (Minimal, Default, High, Dynamic). For "data-heavy infographics or scenes involving spatial hierarchy," High or Dynamic lets the model plan the scene before drawing. This is the mechanism behind NotebookLM's dense diagrams — NotebookLM almost certainly runs with maximum thinking for its infographic generation.

**Practical question:** does our tooling expose the Thinking Mode toggle? If yes, crank it for architecture diagrams. If no, this is the single highest-leverage feature request for the infographic-gen tool.

### 1.6 Reference-image conditioning is the pro workflow

Lana Zhang's Medium piece is the most useful applied case study. Her workflow:

1. Build a rough structural skeleton in draw.io — correct components, rough arrows, minimal styling
2. Export that as an image
3. Pass it as `inline_data` to Nano Banana with a prompt asking it to keep the structure but apply a specific style ("doodle", "professional flat vector", "hand-drawn whiteboard", etc.)
4. Iterate on style while the structure stays locked

This preserves technical correctness (which is very hard for pure text-to-diagram prompts) while getting the model's visual polish.

**For us:** this would mean building a library of draw.io "skeletons" for our recurring diagram shapes (stack, topology, swimlane, circular loop) and using them as reference inputs rather than describing layouts from scratch.

Independently, skywork.ai's guide confirms this is the "documented pattern in the Gemini API image generation guide" — this isn't a hack, it's the intended workflow.

### 1.7 Prompt-driven edits are stronger than full regenerations

Also from skywork.ai: *"Targeted edit prompts tend to work better than full rewrites."* When an infographic is 90% right but has one wrong element, re-supplying the chosen image with a delta prompt (*"keep layout and icons; replace palette with #0B1F3B/#2D6BFF; increase whitespace by 10-20%"*) outperforms regenerating from scratch.

**Our pattern today:** when a slide has a typo, we rebuild the entire slide from scratch. That's expensive and introduces fresh variance on everything else. **What we should be doing:** feed the previous output back as a reference image with a targeted correction ("keep everything; replace the text 'TITHE MIDDLE' with 'IN THE MIDDLE'").

### 1.8 Composition constraints genuinely help

Google's 2025 prompting advice, quoted in skywork.ai: *"flat style, high contrast, thick connectors, fewer than 8 elements."* The "fewer than 8 elements" constraint is specifically a Google-recommended guardrail for diagrams. Complex layouts with 10+ concurrent elements are where the model begins to hallucinate and mangle.

**Our ten-layer stack has ten elements.** By Google's guidance, it's at the edge of where rendering becomes unreliable. The fact that it worked is lucky. The fact that slide 8 ("why the vault — five properties") broke when we asked for a 2×2+1 layout with five properties is consistent with this — we had 5 properties, each with 3 sub-elements, totalling 15 semantic elements on one canvas. Over the safe ceiling.

**Tactical fix:** when we have more than 8 elements to communicate, split across two diagrams rather than cramming one. A four-panel infographic with sub-captioned sections is more legible than a six-panel grid.

---

## 2. Concrete changes we should make to our infographic-generator prompts

### 2.1 Restructure the prompt template as a production brief

**Current structure** (what our prompts look like today):
```
Landscape 16:9. Dark navy background (#0f1419). Teal (#4ECDC4) primary accent...
Top-left, small teal caps label: "THE PROBLEM"
Below, a bold white headline...
[long list of positional instructions]
[long list of "do NOT" rules]
```

**Recommended structure** (production-brief style):
```
A landscape 16:9 architecture infographic for a technical briefing.
The diagram shows [what], structured as [how], arranged on [canvas].
Visual style: dark navy background (#0f1419) with teal (#4ECDC4) accents
and amber (#F7B731) used only for [what role]. Typography is clean
sans-serif, premium, architectural in feel.

[Narrative paragraph describing the content and visual flow.]

Typography notes:
- Every label on the diagram is rendered exactly as follows:
  "Exact Label 1", "Exact Label 2", "Exact Label 3".
- Body text uses a thin sans-serif at roughly 14-16px equivalent.
- Headings use bold sans-serif at roughly 28-36px equivalent.

Layout constraints: flat style, high contrast, thick connectors,
fewer than 8 primary elements. Significant whitespace between elements.
```

That's a brief, not a rule list. It reads as a description of the finished artefact rather than instructions for how to build it.

### 2.2 Quote every piece of critical text

Our past spelling glitches (`TITHE MIDDLE`, `attribututactable`, `deves`, `wnere`) all involved unquoted text. Any text that appears on the final image must be wrapped in quotes in the prompt. This is not a style choice — it's a model-behaviour trigger.

```
Bad:  emphasise the phrase IN THE MIDDLE in amber
Good: emphasise the phrase "IN THE MIDDLE" in amber
Better: at the end of the sentence, render the exact phrase
        "IN THE MIDDLE" (three separate words with spaces)
        in amber. Do not concatenate the words.
```

### 2.3 Replace forbidden-word lists with positive layout descriptions

Every `"Do NOT use the words SECTION, COLUMN..."` in our prompts should be rewritten as a positive instruction about what the layout IS. Forbidden-word lists cost context window and reliably leak.

```
Before: "Do NOT use the words SECTION, COLUMN, HEADER anywhere visible."
After:  "The canvas is a single continuous flow with no internal
         dividers, headers, or section labels. Visual grouping is
         achieved through whitespace and colour only."
```

### 2.4 Keep primary-element counts under 8

For every new infographic, count the primary elements before prompting. If it's more than 8, split. Alternatives:

- **Multi-panel within one canvas:** four panels in a 2×2 grid, each panel is one sub-diagram with at most 3-4 elements inside it.
- **Diagram series:** two or three separate infographics that share a visual language and can be browsed together.
- **Levels of detail:** a high-level overview with under 8 elements, plus a "zoomed in" companion for each complex region.

Our ten-layer stack worked, but the win would have been cleaner as a four-tier summary (AWS boundary / Vault / Web agent / Human) with the ten sub-layers optionally labelled as a legend. Something to consider for the next iteration.

### 2.5 Use reference-image conditioning for structure

For any recurring diagram shape — a stack, a topology, a swimlane, a loop — we should maintain a canonical draw.io "skeleton" file per shape. When generating a new infographic of that shape, pass the skeleton as an `inline_data` reference with a prompt like:

> Render this structural blueprint in our Aurora visual style. Keep all component positions, arrows, and grouping exactly as shown. Apply our palette: navy background, teal for [solution elements], amber for [stakes element]. Use our typography rules. Add the following labels exactly as quoted: ["Label 1", "Label 2", ...].

This collapses the variance that comes from re-describing layouts in prose, because the prose doesn't have to describe layout anymore — the skeleton does.

### 2.6 Use conversational edits rather than regenerations when iterating

When a diagram has one broken element:

```python
# Current pattern
prompt = "[regenerate entire slide with spelling correction baked in]"
regenerate_from_scratch(prompt)

# Better pattern
prompt = """
Keep every element of the attached image exactly the same except:
replace the text "TITHE MIDDLE" with the correct text "IN THE MIDDLE".
Keep the exact amber colour, the same font, the same position,
and the same kerning. Do not change any other text or element.
"""
edit_with_reference(previous_image, prompt)
```

The second costs less and introduces less variance in the rest of the image. Whether our infographic-gen tool exposes edit-with-reference is an open question — if it doesn't, this is another high-value feature request.

### 2.7 Enable Thinking Mode (High/Dynamic) if the tool supports it

For any architecture diagram with spatial hierarchy, multiple participants, or annotated connections, the reasoning pass before the generation pass materially improves the output. If the tool exposes the toggle, always use High/Dynamic for architecture work. If it doesn't, this is a feature request worth prioritising.

---

## 3. What NotebookLM is probably doing that we aren't

My inferred guesses, ranked by confidence:

1. **Always Pro, always High Thinking.** NotebookLM has the latency budget for it and the use case demands it. We're probably on Flash with default Thinking.
2. **Generating text content first, then rendering.** NotebookLM's pipeline almost certainly reasons over the document, produces structured text, then passes that structured text to the image model. Our prompts are doing both in one pass.
3. **Using structured intermediate representations.** A mind-map or outline step before the visual render. This is the "text-first hack" from Google's guide applied systemically.
4. **Reference-conditioning from a library of visual templates.** NotebookLM's infographics have a consistent visual grammar across outputs. That consistency is almost impossible without shared reference images driving the style. They have a style guide, saved as images, fed into every generation.
5. **Multi-shot generation with quality filtering.** Generate three candidates, pick the best. Our pipeline generates one and accepts it.

---

## 4. Top five prioritised changes for our tool

If we could only make five changes to the infographic generator, in order:

1. **Expose a Thinking Mode / reasoning budget toggle.** Default to High for architecture-template infographics. This is likely the single biggest quality lever.
2. **Quote every piece of critical text in prompt templates.** Retrofit the existing architecture, executive, and comparison templates to quote all rendered text. This should fix most of the spelling glitches without any capability change.
3. **Swap forbidden-word lists for positive layout descriptions.** Cheap to do, reduces context window load, and removes a known source of leakage.
4. **Add a "reference image" parameter to the generation call.** Enables draw.io-skeleton workflows and conversational-edit workflows — both are pro patterns.
5. **Enforce an "under 8 primary elements" heuristic in the template schema.** For new infographics that exceed this, the tool should nudge toward splitting across multiple canvases rather than cramming.

---

## 5. One worked example — rewriting the ten-layer stack prompt

**Original prompt** (excerpt): the prompt we used in this session was roughly 1,200 words of layered positional instructions with multiple "Do NOT" clauses and unquoted layer names.

**Rewritten in the narrative-brief style** (about half the length):

> A landscape 16:9 technical infographic showing the ten isolation layers between an AI agent and a production bug during a collaborative debugging session.
>
> The diagram is a single vertical stack of ten horizontal bands, numbered from "1" at the bottom to "10" at the top. Each band shows one layer of the infrastructure.
>
> The canvas background is dark navy "#0f1419". The bands use subtle muted-grey outlines by default. Three bands have distinct visual treatments:
> - Layer "5" is highlighted with an amber outline "#F7B731" and a small bug icon on the right; this is the layer where the bug lives.
> - Layers "8" and "9" have teal outlines "#4ECDC4" with a subtle teal glow; these are the layers that enable the solution.
> - All other bands stay muted grey.
>
> Each band contains, left to right: a large band number in the top-left, a bold white layer name, an em-dash, a short lowercase description in muted grey, and a small semantic icon at the far right.
>
> The layer names, rendered exactly as quoted:
> 1. "AWS account" — "IAM, security groups, VPC"
> 2. "AWS SSM" — "authenticated shell session"
> 3. "EC2 instance" — "AL2023 t3.large"
> 4. "Docker daemon" — "container runtime"
> 5. "Playwright service :8000" — "the bug lives here"
> 6. "Claude Code session" — "agentic inside the container"
> 7. "sgit-ai CLI" — "vault client"
> 8. "SG/Send vault" — "zero-knowledge encrypted coordination"
> 9. "Claude web sandbox" — "agentic, isolated environment"
> 10. "Human operator" — "chat, judgment, trust gate"
>
> On the right side of the stack, three grouping brackets with labels in muted grey: a bracket covering layers 1-7 labelled "AWS trust boundary"; a bracket covering layer 8 alone labelled "third-party, zero-knowledge"; a bracket covering layer 9 alone labelled "separate cloud, isolated from AWS"; a bracket covering layer 10 alone labelled "the human, bridging everything".
>
> Style notes: flat design, high contrast, thick connectors, comfortable vertical spacing. Typography is clean sans-serif, premium. The canvas is used edge-to-edge with no top title bar, no bottom footer, and no corner chrome. The diagram itself is the entire artefact.

That's the same diagram, rewritten as a production brief. Text is quoted. Constraints are positive. Element count is explicit. No forbidden-word list.

---

## 6. Open questions worth testing

- **Does our tool expose Nano Banana Pro vs 2?** If yes, try Pro on one of our existing architecture templates and compare.
- **Does it expose Thinking Mode?** Same — test High vs Default on the same prompt.
- **Can it accept reference images via `inline_data`?** If yes, build the draw.io-skeleton workflow. If no, prioritise the feature request.
- **Can it do conversational edits with a prior image as input?** If yes, replace our "regenerate from scratch" pattern for correction cycles with targeted edits.
- **What aspect ratios are supported?** The Pro model supports 1:1, 3:2, 2:3, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, and 21:9. For a stack diagram specifically, 3:4 (taller than wide) would likely serve better than 16:9 — worth testing.

---

## 7. One-line summary

Nano Banana treats prompts as production briefs, not tag lists. Write in narrative paragraphs. Quote every piece of critical text. Describe what you want, not what you forbid. Keep primary elements under 8. Pass reference images when structure matters. Use targeted edits, not full regenerations, when correcting. And turn the reasoning mode up when the diagram is complex.

That's the whole guide.

---

## 8. Sources

- Google Cloud Blog, "The ultimate Nano Banana prompting guide" (March 2026) — https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-nano-banana
- Google DeepMind, "Gemini 3 Pro Image — Nano Banana Pro" product page (March 2026) — https://deepmind.google/models/gemini-image/pro/
- Skywork.ai, "How to Create Technical Diagrams and Covers with Nano Banana" (September 2025)
- Lana Zhang on Medium, "Generating Technical Diagrams with Gemini Nano Banana 2: From Prompt to Blueprint" (March 2026)
- DEV Community, "Nano-Banana Pro: Prompting Guide & Strategies" (January 2026)
- The Daily Prompt, "Nano Banana Prompting Guide: How to Use Gemini 3 Pro for AI Images" (February 2026)
