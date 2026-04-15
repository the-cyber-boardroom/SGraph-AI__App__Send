# SG/Send Workflow Briefing for Claude Sessions

*Everything a new Claude session needs to know to work with SG/Send vaults, infographic generation, content pipelines, and inter-agent collaboration.*

## Quick Start

You need two things from the user:
1. **OpenRouter API key** — for infographic generation (starts with `sk-or-v1-`)
2. **Vault access** — either a vault key (`passphrase:vault_id`) or a share token (three words like `dare-dial-4454`)

## 1. SGit — Encrypted Vault Management

sgit is a CLI tool for zero-knowledge encrypted vault management. Think git, but every file is AES-256-GCM encrypted client-side before upload.

### Installation

```bash
pip install sgit-ai --break-system-packages
```

### Core Operations

```bash
# Create a new vault
sgit init my-vault
cd my-vault

# Add files, then commit
sgit commit "initial content"

# Push to remote (SG/Send server)
sgit --token <access-token> --base-url https://dev.send.sgraph.ai push

# Pull latest changes (from other agents or users)
sgit pull

# Check status
sgit status
sgit log
sgit info   # shows vault ID, passphrase, vault key

# Share a read-only snapshot (generates a 3-word token)
sgit --token <access-token> --base-url https://dev.send.sgraph.ai share
# Output: e.g. "dare-dial-4454"

# Clone from a share token (creates a NEW read-write vault)
sgit clone dare-dial-4454
# This downloads, decrypts, and creates a new vault you own

# Clone from a vault key (direct access to existing vault)
sgit clone passphrase:vault_id
```

### Access Tokens vs Vault Keys vs Share Tokens

| Token type | Format | Purpose |
|-----------|--------|---------|
| **Access token** | `sg-send__name__xxxxx` | Authenticates with the server (like an API key). Used with `--token` flag. |
| **Vault key** | `word-word-number:hexstring` | Full read-write access to a vault. Like the master key. Keep secret. |
| **Share token** | `word-word-number` | Read-only snapshot. Anyone can browse/clone. Safe to publish. |

### Typical Workflow

```bash
# Start a project
sgit init company-review
cd company-review

# Create content
mkdir -p analysis slides
# ... create files ...

# Commit and push
sgit commit "Add initial analysis"
sgit --token sg-send__my-token__xxxxx --base-url https://dev.send.sgraph.ai push

# Share with someone
sgit --token sg-send__my-token__xxxxx --base-url https://dev.send.sgraph.ai share
# gives them a 3-word token to browse at send.sgraph.ai/#token
```

### Important Notes

- `--base-url https://dev.send.sgraph.ai` is needed for the dev environment
- The `--token` flag provides the access token for server authentication
- Vault keys should NEVER be committed to git or shared publicly
- Share tokens are safe to share — they're read-only snapshots
- `sgit pull` merges remote changes into your local copy
- `sgit commit` only commits locally; you need `sgit push` to upload

## 2. Infographic Generation — SGraph API via Playwright

The SGraph infographic generator uses Google Gemini (via OpenRouter) to create professional infographic slides from text prompts.

### Setup

The API runs at `dev.tools.sgraph.ai/en-gb/infographic-gen/`. We access it via Playwright (headless browser automation).

### Prerequisites

```bash
# Install Playwright (if not already available)
pip install playwright --break-system-packages
playwright install chromium

# The proxy helper (create if it doesn't exist)
cat > /home/claude/pw_helpers.py << 'EOF'
def get_proxy_config():
    return {"server": "http://localhost:8080"}  # adjust if needed
EOF
```

### Generation Pattern

```python
import sys, base64
sys.path.insert(0, '/home/claude')
from playwright.sync_api import sync_playwright
from pw_helpers import get_proxy_config

API_KEY = 'sk-or-v1-...'  # OpenRouter key from user

SYSTEM_PROMPT = (
    'You are a world-class infographic designer creating slides for a premium tech presentation. '
    'CONSISTENT STYLE: Dark navy/charcoal background (#1a1a2e). '
    'Primary: teal (#4ECDC4). Secondary: amber (#F7B731). White text. '
    'Clean modern sans-serif. Professional. '
    'CRITICAL: Spell every word correctly. Icons over text walls.'
)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, proxy=get_proxy_config())
    page = browser.new_page(viewport={'width': 1400, 'height': 1200})
    page.goto('https://dev.tools.sgraph.ai/en-gb/infographic-gen/', timeout=30000)
    page.wait_for_timeout(5000)

    # Connect with API key
    page.evaluate("async (k) => await __tool.connect({ apiKey: k })", API_KEY)
    page.evaluate(f"""() => __tool.setSystemPrompt(`{SYSTEM_PROMPT}`)""")

    # Generate a slide
    result = page.evaluate("""async (p) => {
        __tool.setTemplate(p.template);
        return await __tool.generate({ prompt: p.prompt });
    }""", {
        'template': 'executive',  # or: process, stats, comparison, architecture
        'prompt': 'Your slide prompt here...'
    })

    # Save the image
    duration = result.get('duration', 0)
    src = result.get('imageSrc', '')
    if src and src.startswith('data:'):
        with open('slide-01.png', 'wb') as f:
            f.write(base64.b64decode(src.split(',', 1)[1]))
        print(f"Generated in {duration:.1f}s")

    browser.close()
```

### Templates Available

| Template | Best for |
|----------|---------|
| `executive` | Title slides, closing slides, key messages |
| `process` | Timelines, workflows, step-by-step flows |
| `stats` | Key numbers, metrics, data highlights |
| `comparison` | Two-column comparisons, before/after |
| `architecture` | System diagrams, hub-and-spoke, connected nodes |

### Cost and Performance

- Model: `google/gemini-3.1-flash-image-preview` via OpenRouter
- Cost: ~$0.07 per slide
- Generation time: 10-30 seconds per slide (varies)
- Output: ~1400x750 PNG (~850KB)

### Batch Generation (4 slides per batch to avoid timeouts)

```python
SLIDES = [
    {'num': '01', 'template': 'executive', 'prompt': '...'},
    {'num': '02', 'template': 'stats', 'prompt': '...'},
    {'num': '03', 'template': 'process', 'prompt': '...'},
    {'num': '04', 'template': 'architecture', 'prompt': '...'},
]

# Generate in batches of 4 to avoid browser timeouts
for slide in SLIDES:
    result = page.evaluate("""async (p) => {
        __tool.setTemplate(p.template);
        return await __tool.generate({ prompt: p.prompt });
    }""", {'template': slide['template'], 'prompt': slide['prompt']})

    src = result.get('imageSrc', '')
    if src and src.startswith('data:'):
        with open(f"slide-{slide['num']}.png", 'wb') as f:
            f.write(base64.b64decode(src.split(',', 1)[1]))
```

### Slide Design Principles (learned from 100+ slides)

- **Dark navy background** (#1a1a2e) — consistent, professional, projector-friendly
- **Teal (#4ECDC4)** for primary elements, **amber (#F7B731)** for emphasis
- **Icons over text walls** — Gemini generates good icons when prompted
- **Spell every word correctly** — always include this in system prompt
- **Keep prompts concise** — long prompts sometimes cause timeouts
- **Always specify dark background** — otherwise Gemini defaults to light themes

## 3. PDF Creation from Slides

### Single Deck PDF

```python
from reportlab.pdfgen import canvas
from PIL import Image
import os

SLIDES_DIR = 'slides/'
slides = sorted([f for f in os.listdir(SLIDES_DIR) if f.startswith('slide-') and f.endswith('.png')])

img = Image.open(f'{SLIDES_DIR}/{slides[0]}')
W, H = img.size
PAGE_W, PAGE_H = 720, 720 * H / W

c = canvas.Canvas('deck.pdf', pagesize=(PAGE_W, PAGE_H))
for s in slides:
    c.drawImage(f'{SLIDES_DIR}/{s}', 0, 0, width=PAGE_W, height=PAGE_H)
    c.showPage()
c.save()
```

### Compressed PDF (for LinkedIn upload, under 100MB)

```python
from reportlab.pdfgen import canvas
from PIL import Image
from io import BytesIO
import tempfile, os

def build_compressed_pdf(slide_paths, output_path, max_width=1200, quality=82):
    """Build PDF with JPEG compression. Reduces 116MB→15MB for 107 slides."""
    tmpdir = tempfile.mkdtemp()

    # Convert first slide to get dimensions
    img0 = Image.open(slide_paths[0])
    ratio = min(1, max_width / img0.width)
    w = int(img0.width * ratio)
    h = int(img0.height * ratio)
    PAGE_W, PAGE_H = 720, 720 * h / w

    c = canvas.Canvas(output_path, pagesize=(PAGE_W, PAGE_H))

    for i, path in enumerate(slide_paths):
        img = Image.open(path)
        if img.width > max_width:
            img = img.resize((w, h), Image.LANCZOS)
        jpg_path = os.path.join(tmpdir, f'{i}.jpg')
        img.save(jpg_path, format='JPEG', quality=quality)
        c.drawImage(jpg_path, 0, 0, width=PAGE_W, height=PAGE_H)
        c.showPage()

    c.save()
    import shutil; shutil.rmtree(tmpdir)
```

## 4. Collage Creation

```python
from PIL import Image

GAP = 6  # white gap between slides

def build_collage(slide_paths, output_path, cols=4):
    """Build a grid collage from slide images."""
    imgs = [Image.open(p) for p in slide_paths]
    W, H = imgs[0].size
    rows = (len(imgs) + cols - 1) // cols

    thumb_w = 688
    thumb_h = int(thumb_w * H / W)

    collage = Image.new('RGB',
        (thumb_w * cols + GAP * (cols - 1), thumb_h * rows + GAP * (rows - 1)),
        (255, 255, 255))

    for idx, img in enumerate(imgs):
        row, col = divmod(idx, cols)
        thumb = img.resize((thumb_w, thumb_h), Image.LANCZOS)
        collage.paste(thumb, (col * (thumb_w + GAP), row * (thumb_h + GAP)))

    collage.save(output_path)
```

## 5. LinkedIn Article Authoring

LinkedIn's article editor accepts base64-embedded JPEG images pasted from HTML.

### Image Encoding

```python
import base64
from PIL import Image
from io import BytesIO

def img_to_b64(path, max_width=800, quality=70):
    img = Image.open(path)
    if img.width > max_width:
        ratio = max_width / img.width
        img = img.resize((max_width, int(img.height * ratio)), Image.LANCZOS)
    buf = BytesIO()
    img.save(buf, format='JPEG', quality=quality)
    return base64.b64encode(buf.getvalue()).decode()
```

### Article HTML Template

```html
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Article Title</title>
<style>
  body { font-family: -apple-system, sans-serif; max-width: 720px; margin: 40px auto; padding: 20px; line-height: 1.7; color: #333; }
  h1 { font-size: 28px; } h2 { font-size: 22px; margin-top: 36px; }
  img { width: 100%; max-width: 720px; display: block; margin: 20px 0; border-radius: 4px; }
  .meta { font-size: 14px; color: #666; font-style: italic; }
  .hint { background: #fffbe6; border: 1px solid #ffe58f; padding: 12px; border-radius: 6px; font-size: 14px; margin-bottom: 24px; }
</style>
</head>
<body>
<div class="hint"><strong>To paste into LinkedIn:</strong> Cmd+A, Cmd+C, paste into article editor. Upload cover image separately.</div>

<img src="data:image/jpeg;base64,{COVER_B64}" alt="Cover">
<h1>Title</h1>
<p class="meta">Subtitle</p>
<p>Body text...</p>
<h2>Section</h2>
<img src="data:image/jpeg;base64,{SLIDE_B64}" alt="Slide">
<p>More text...</p>
</body></html>
```

### Paste Workflow
1. Open HTML file in browser
2. Cmd+A → Cmd+C
3. Paste into LinkedIn article editor
4. Upload cover image separately (LinkedIn's cover UI)

### What Survives LinkedIn's Editor
Headings, paragraphs, images, links, bold, italic, lists, horizontal rules.

### What Gets Stripped
CSS classes, backgrounds, borders, tables, custom fonts, styled boxes.

### LinkedIn Cover Image
- Upload separately (does NOT come from paste)
- Recommended: 1584×828 or 1200×628 ratio
- Keep all text in centre 60% — LinkedIn crops edges aggressively
- The infographic generator sometimes doesn't respect margins, so PIL-based covers or multiple Gemini attempts may be needed

## 6. Content Manifest Pattern

For multi-section presentations, use a manifest.json to define structure:

```json
{
  "title": "Presentation Title",
  "timer": {
    "total_minutes": 45,
    "schedule": [
      {"act": 0, "label": "Part 1", "target_min": 0, "target_end": 15},
      {"act": 1, "label": "Part 2", "target_min": 15, "target_end": 30}
    ]
  },
  "acts": [
    {
      "title": "Act 1: Title",
      "sections": [
        {
          "title": "Section Name",
          "folder": "slides/section-01",
          "slides": 8,
          "article": "articles/section-01.md",
          "pdf": "pdfs/section-01-deck.pdf"
        }
      ]
    }
  ],
  "stats": {
    "total_slides": 105,
    "total_decks": 13,
    "approx_cost": "$5.00"
  }
}
```

This manifest drives the presenter app, PDF assembly order, and content linking.

## 7. Inter-Agent Handoff Pattern

Two Claude agents can collaborate via a shared vault. This was tested and works.

### Pattern

```
Claude Web (claude.ai):
  1. Creates content (articles, slides, briefs)
  2. Writes a detailed brief for Claude Code
  3. Creates manifest.json defining structure
  4. Defines agent roles in teams/explorer/{role}/ROLE.md
  5. Pushes everything to vault via sgit push

Vault (shared state):
  - All files encrypted with AES-256-GCM
  - Shared via three-word token or vault key
  - No shared memory between agents

Claude Code (Claude Code Web):
  1. Clones vault via sgit clone <token>
  2. Reads the brief and manifest
  3. Builds what's described (app, tool, analysis)
  4. Pushes results back to vault via sgit push

Claude Web can then:
  - sgit pull to get Claude Code's work
  - Review, modify, enhance
  - Push updates back
```

### Brief Structure for Claude Code

```markdown
# Project Brief

## First: Get the Materials
pip install sgit-ai
sgit clone <token>

## Second: Read the Briefs
cat briefs/README.md
Start with MVP 1.

## MVP Phases
1. MVP 1: Basic functionality
2. MVP 2: Content integration
3. MVP 3: External integrations
4. MVP 4: Enhancements
5. MVP 5: Polish

## Agent Roles
teams/explorer/dev/ROLE.md
teams/explorer/designer/ROLE.md
teams/explorer/architect/ROLE.md
teams/explorer/qa/ROLE.md
```

## 8. Vault Organisation Patterns

### Pattern A: Article + Slide Deck
```
article-name/
  article.md          # source article
  slides/             # 8 PNGs
    slide-01.png
    slide-08.png
  deck.pdf            # assembled PDF
  collage.png         # all slides at a glance
  prompts/
    slide-prompts.md  # exact prompts + generation stats
```

### Pattern B: Company Brief
```
companies/
  01-company-name/
    brief.md          # detailed company brief
    slide-01.png      # what it does
    slide-02.png      # how it works
    slide-03.png      # getting started
    collage.png
    deck.pdf
```

### Pattern C: Presentation Pack
```
manifest.json         # structure map
content/
  slides/             # all slide PNGs by section
  articles/           # all markdown articles
  pdfs/               # all deck PDFs
  collages/           # all collages
briefs/               # MVP briefs for builders
teams/                # agent role definitions
presenter.html        # the delivery app
```

## 9. Proven Workflows

### Workflow 1: Voice Memo → Articles → Slides → Vault

```
Voice memo (Otter.ai transcript)
  → Claude writes structured article from transcript
  → Claude generates 8 slide prompts from article
  → Playwright generates 8 infographic slides via SGraph API
  → PIL creates collage + ReportLab creates PDF
  → sgit commits and pushes to vault
  → sgit share creates browsable link
```

### Workflow 2: Research Doc → Company Concepts → Slide Decks

```
Research document uploaded
  → Claude analyses and identifies company opportunities
  → Claude writes detailed brief per company
  → Claude generates 3 slides per company (What/How/Start pattern)
  → All assembled into vault with manifest
```

### Workflow 3: Content → LinkedIn Article

```
Slides + article text exist in vault
  → Claude encodes slides as base64 JPEG (800px, q70)
  → Claude builds HTML with embedded images
  → Claude generates cover image (wide format for LinkedIn)
  → User opens HTML → Cmd+A → Cmd+C → paste into LinkedIn
```

### Workflow 4: Complete Presentation Production

```
Source materials (voice memos, research docs, articles)
  → Claude produces articles, slides, briefs
  → Claude creates manifest.json
  → Claude writes brief for Claude Code
  → Claude pushes to vault
  → Claude Code clones, reads brief, builds presenter app
  → Claude Code pushes app back to vault
  → Claude Web pulls, adds timer + enhancements
  → Presenter delivers talk using the app
  → Claude Web creates LinkedIn articles from materials
```

## 10. Common Issues and Solutions

| Issue | Solution |
|-------|---------|
| Playwright timeout during slide generation | Break into batches of 4 slides per browser session |
| `mkdir -p dir/{a,b}` creates literal `{a,b}` directory | Use separate `mkdir -p` commands for each path |
| sgit push fails | Check `--token` and `--base-url` flags |
| Slide generation returns NO IMAGE | Retry — Gemini occasionally fails, succeeds on second attempt |
| LinkedIn cover image gets cropped | Keep text in centre 60%, use 1584×828 ratio, generate multiple attempts |
| PDF too large for LinkedIn (100MB limit) | Use JPEG compression: PNG slides→JPEG q82, 1200px max, reduces ~87% |
| Claude Code session times out | Break brief into small MVPs, ship each before next |
| Infographic generator connection timeout | Reduce prompt length, avoid backticks/special chars in prompts |

## 11. Key URLs

| Resource | URL |
|----------|-----|
| SG/Send (dev) | https://dev.send.sgraph.ai |
| Tools site (dev) | https://dev.tools.sgraph.ai |
| Infographic generator | https://dev.tools.sgraph.ai/en-gb/infographic-gen/ |
| Vault browser | https://dev.send.sgraph.ai/en-gb/browse/#TOKEN |
| SGit on PyPI | https://pypi.org/project/sgit-ai/ |
| Send repo | https://github.com/the-cyber-boardroom/SGraph-AI__App__Send |
| Tools repo | https://github.com/the-cyber-boardroom/SGraph-AI__App__Tools |

## 12. Slide Design System

Consistent across all decks:

| Element | Value |
|---------|-------|
| Background | Dark navy #1a1a2e |
| Primary colour | Teal #4ECDC4 |
| Secondary colour | Amber #F7B731 |
| Text | White #e6edf3 |
| Muted text | #8b949e |
| Font | Clean modern sans-serif |
| Slide ratio | ~16:9 (1400×750ish from Gemini) |
| Icons | Preferred over text walls |

### 3-Slide Company Pattern
1. **What** (executive template) — company name, subtitle, visual metaphor, key message
2. **How** (architecture template) — agentic team structure, pipeline, pricing
3. **Getting Started** (stats template) — weekend → signal → clients → automate → raise path

### 8-Slide Article Pattern
1. Title slide
2-3. Core argument/problem
4-5. Solution/approach
6-7. Evidence/details
8. Closing with key takeaways

---

*This briefing was distilled from two production sessions that created 105+ slides, 11 articles, 5 company concepts, a presenter app, multiple LinkedIn articles, and 3 encrypted vaults — all from a single Claude Web session with inter-agent handoff to Claude Code.*
