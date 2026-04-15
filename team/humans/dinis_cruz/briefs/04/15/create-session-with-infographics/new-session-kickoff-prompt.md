# Kickoff: SG/Send Workflow Session

I'm going to be using you to create content, generate infographic slides, manage encrypted vaults, and produce deliverables using the SG/Send platform and tools.

## Setup

1. Install sgit: `pip install sgit-ai --break-system-packages`

2. Clone the workflow briefing vault:
```bash
sgit clone <SHARE_TOKEN>
```
(I'll provide the token)

3. Read the workflow briefing:
```bash
cat briefs/sg-send-workflow-briefing.md
```

This document contains everything you need: sgit vault operations, infographic generation via Playwright + SGraph API, PDF/collage creation, LinkedIn article authoring, inter-agent handoff patterns, and vault organisation patterns.

4. My OpenRouter API key (for infographic generation): I'll provide this when needed.

## What's in the Vault

- `briefs/sg-send-workflow-briefing.md` — **read this first**, it's the complete playbook
- `briefs/linkedin-article-authoring-guide.md` — how to create LinkedIn-pasteable HTML articles
- `briefs/briefing-image-pdf-compression.md` — PNG→JPEG compression techniques
- `briefs/briefing-browser-video-creation.md` — browser-based video production stack

## Key Principles

- **Dark slide theme**: navy #1a1a2e, teal #4ECDC4, amber #F7B731
- **Infographic generation**: Playwright → SGraph API → Gemini, ~$0.07/slide, ~15s/slide
- **PDFs**: ReportLab for assembly, JPEG compression for LinkedIn (116MB→15MB)
- **Vaults**: sgit for encrypted storage, three-word share tokens for distribution
- **LinkedIn**: base64 JPEG images in HTML, Cmd+A → Cmd+C → paste
- **Batch slides**: 4 per Playwright session to avoid timeouts

## What I'll Be Doing This Session

[DESCRIBE YOUR TASK HERE — e.g. "I want to review 5 cybersecurity companies using a standard evaluation framework, generate slide decks for each, and push everything to a vault"]
