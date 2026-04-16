---
name: infographic-gen
description: "Use this skill whenever the user wants to create infographics, slide decks, visual presentations, or image-based content using the SGraph infographic generator API. Triggers include: any mention of 'infographic', 'slide deck', 'slides', 'visual summary', 'presentation images', 'deck from document', 'generate slides', or requests to turn a document/brief into visual slides or infographics. Also triggers when the user mentions 'dev.tools.sgraph.ai', 'infographic-gen', or 'OpenRouter' in the context of image generation. Use this skill even if the user just says 'make me a deck' or 'visualise this document' — anything that implies AI-generated infographic images. Do NOT use for standard PowerPoint (.pptx) creation without AI image generation, or for diagrams/charts that can be handled by code-based visualisation tools."
---

# SKILL: infographic-gen — AI Infographic & Slide Deck Generator

## Overview

Generate AI-powered infographics and full slide decks using the SGraph infographic generator tool at `dev.tools.sgraph.ai`. The tool exposes a JavaScript API via a browser page, driven by Playwright. Each `generate()` call returns a PNG as a base64 data URL — no polling, no DOM hacking.

Requires an **OpenRouter API key** from the user (starts with `sk-or-v1-...`).

**Economics**: ~$0.07/infographic, ~13s/generation, ~$0.56 for an 8-slide deck.

---

## Step 1: Environment Setup

Run all of this — takes ~2 minutes.

```bash
# Playwright + Chromium
python3.12 -m venv /tmp/venv312
/tmp/venv312/bin/pip install -q playwright==1.56.0
/tmp/venv312/bin/python -m playwright install --with-deps chromium

# sgit (encrypted vaults) + PDF tools
pip3 install sgit-ai reportlab Pillow --break-system-packages -q
```

Then create the proxy helper — Chromium MUST use this (it ignores `HTTPS_PROXY` env var):

```bash
cat > /home/claude/pw_helpers.py << 'PYEOF'
import os
from urllib.parse import urlparse

def get_proxy_config():
    proxy_url = os.environ.get('HTTPS_PROXY')
    if not proxy_url: return None
    parsed = urlparse(proxy_url)
    return {
        'server':   f'http://{parsed.hostname}:{parsed.port}',
        'username': parsed.username,
        'password': parsed.password,
    }
PYEOF
```

---

## Step 2: Verify Setup & Onboard User

This is a multi-part verification. Do all sub-steps in order.

### 2a. Confirm the JS API is live

```python
import sys; sys.path.insert(0, '/home/claude')
from playwright.sync_api import sync_playwright
from pw_helpers import get_proxy_config

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, proxy=get_proxy_config())
    page = browser.new_page()
    page.goto('https://dev.tools.sgraph.ai/en-gb/infographic-gen/', timeout=30000)
    page.wait_for_timeout(3000)
    methods = page.evaluate('() => window.__tool?.meta?.getMethods?.() || "NOT READY"')
    version = page.evaluate('() => window.__tool?.meta?.getVersion?.() || null')
    print(f"Methods: {methods}")
    print(f"Version: {version}")
    browser.close()
```

Expected: 9 methods, version `ui=0.1.36`. If `__tool` is null, increase `wait_for_timeout`.

### 2b. Re-read the tool's own skill files for latest features

The tool ships its own documentation. Always fetch and read it during setup — it is more authoritative than this SKILL.md and may contain new features, templates, or API changes:

```python
skills = page.evaluate('async () => await __tool.meta.getSkills()')
# skills.human   — user-facing guide
# skills.browser — Playwright automation guide with full examples
# skills.api     — machine-readable spec of all methods, params, returns, events
```

Read these carefully. If there are new methods, templates, or parameters not covered in this skill file, incorporate them into your workflow for this session.

### 2c. Ask the user for their OpenRouter API key

Before generating anything, you need the user's OpenRouter key. Ask:

> "Setup is looking good — the infographic generator API is live with [N] methods (v[version]).
>
> Before I can generate anything, I'll need your **OpenRouter API key** (starts with `sk-or-v1-...`). You can get one at [openrouter.ai](https://openrouter.ai) if you don't have one yet."

**Do not proceed to generation until you have the key.**

### 2d. Generate a test infographic

Once you have the key, generate a simple test infographic to confirm end-to-end connectivity:

```python
import base64
from playwright.sync_api import sync_playwright
from pw_helpers import get_proxy_config

API_KEY = '<key from user>'

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, proxy=get_proxy_config())
    page = browser.new_page(viewport={'width': 1400, 'height': 1200})
    page.goto('https://dev.tools.sgraph.ai/en-gb/infographic-gen/', timeout=30000)
    page.wait_for_timeout(3000)

    result = page.evaluate("""async (params) => {
        await __tool.connect({ apiKey: params.key });
        __tool.setTemplate('executive');
        return await __tool.generate({ prompt: params.prompt });
    }""", {
        'key': API_KEY,
        'template': 'executive',
        'prompt': 'Executive summary: "Infographic Generator — Test Slide". Show a simple dashboard with 3 key metrics: API Status: Online, Generation Time: ~13s, Cost per Slide: $0.07. Use a clean, modern dark theme with teal accents.'
    })

    b64 = result['imageSrc'].split(',', 1)[1]
    with open('/home/claude/test-infographic.png', 'wb') as f:
        f.write(base64.b64decode(b64))
    browser.close()
```

Present the test infographic to the user to confirm it looks good. Report the generation time and model used from the result.

### 2e. Ask for the brief / document

Once the test passes, ask the user what they want to create:

> "Everything's working — here's a test infographic to confirm ([duration]s, [model]).
>
> I can create:
> - **Single infographics** from a description or topic
> - **Full slide decks** (6-8 slides) from any document you provide
> - **Brand-consistent output** if you attach a logo image
>
> What would you like me to create? Please share your document, brief, or topic."

---

## Generating Infographics

### Single infographic

```python
import base64
from playwright.sync_api import sync_playwright
from pw_helpers import get_proxy_config

API_KEY = '<user provides this>'

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, proxy=get_proxy_config())
    page = browser.new_page(viewport={'width': 1400, 'height': 1200})
    page.goto('https://dev.tools.sgraph.ai/en-gb/infographic-gen/', timeout=30000)
    page.wait_for_timeout(3000)

    result = page.evaluate("""async (params) => {
        await __tool.connect({ apiKey: params.key });
        __tool.setTemplate(params.template);
        return await __tool.generate({ prompt: params.prompt });
    }""", { 'key': API_KEY, 'template': 'architecture', 'prompt': 'Your prompt here' })

    # result = { generationId, callId, imageSrc, model, duration }
    b64 = result['imageSrc'].split(',', 1)[1]
    with open('output.png', 'wb') as f:
        f.write(base64.b64decode(b64))
    browser.close()
```

### Attaching a reference image (logo, brand, screenshot)

The tool has a 📎 image attachment button. Attach via Playwright file input — the image is sent alongside the text prompt as a multimodal message:

```python
# Find the image file input (accepts image/png)
file_inputs = page.query_selector_all('input[type="file"]')
image_input = [fi for fi in file_inputs if 'image/png' in (fi.get_attribute('accept') or '')][0]
image_input.set_input_files('/path/to/logo.png')
page.wait_for_timeout(1000)

# Confirm it attached
state = page.evaluate('() => __tool.getState()')
assert state['image'] is not None  # { name: 'logo.png' }

# Now generate — the image is included automatically
result = page.evaluate("""async () => {
    return await __tool.generate({
        prompt: 'Create an infographic using the attached logo. Match its colour scheme...'
    });
}""")
```

The image persists across multiple `generate()` calls. To clear it, click ✕ in the thumbnail strip.

With logo: ~19s per generation (multimodal processing adds ~6s).

### Concurrent generation

Each `generate()` call gets a unique `callId` (UUID). Concurrent calls are fully independent:

```python
results = page.evaluate("""async () => {
    return await Promise.all([
        __tool.generate({ prompt: 'Mind map of AI safety', model: 'google/gemini-3.1-flash-image-preview' }),
        __tool.generate({ prompt: 'Timeline of AI', model: 'google/gemini-2.5-flash-image' }),
    ]);
}""")
```

### Headless mode (no UI tabs)

For batch pipelines, skip UI tab creation:

```python
result = page.evaluate("""async () => {
    return await __tool.generate({
        prompt: 'Stats dashboard of key metrics',
        renderUI: false
    });
}""")
```

---

## Templates

| Template | Best for |
|----------|----------|
| executive | KPIs, overview, title slides, key findings |
| architecture | System diagrams, components, layers, technical structure |
| timeline | Milestones, roadmaps, chronological events |
| comparison | Side-by-side options, before/after, trade-offs |
| process | Step-by-step workflows, pipelines |
| stats | Metrics, numbers, percentages, dashboards |
| mindmap | Central concept with branches, brainstorms |

---

## Creating a Slide Deck from a Document

When the user provides a document and asks for a deck:

1. Read the document and identify 6-8 key themes
2. For each slide, choose the best template, write a focused 100-200 word prompt
3. Keep the browser open — reuse the page across all slides
4. Optionally attach a logo via the 📎 file input for brand consistency
5. Decode each `imageSrc` and save as PNG
6. Compile into a full-bleed PDF (see multi-slide pattern below)
7. Fetch costs from OpenRouter (wait 15s after last generation)

### Multi-slide pattern

```python
import os, json, time, base64
from playwright.sync_api import sync_playwright
from pw_helpers import get_proxy_config

API_KEY = '<user provides>'
OUTDIR = '/home/claude/deck'
os.makedirs(OUTDIR, exist_ok=True)

SLIDES = [
    {'num': '01', 'template': 'executive',    'prompt': '...'},
    {'num': '02', 'template': 'comparison',   'prompt': '...'},
    {'num': '03', 'template': 'process',      'prompt': '...'},
    # ... up to 8 slides
]

gen_tracking = []

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, proxy=get_proxy_config())
    page = browser.new_page(viewport={'width': 1400, 'height': 1200})
    page.goto('https://dev.tools.sgraph.ai/en-gb/infographic-gen/', timeout=30000)
    page.wait_for_timeout(3000)

    page.evaluate(f"async () => await __tool.connect({{ apiKey: '{API_KEY}' }})")

    # Optional: attach a logo for brand consistency
    # file_inputs = page.query_selector_all('input[type="file"]')
    # image_input = [fi for fi in file_inputs if 'image/png' in (fi.get_attribute('accept') or '')][0]
    # image_input.set_input_files('/path/to/logo.png')
    # page.wait_for_timeout(1000)

    for slide in SLIDES:
        result = page.evaluate("""async (p) => {
            __tool.setTemplate(p.template);
            return await __tool.generate({ prompt: p.prompt });
        }""", {'template': slide['template'], 'prompt': slide['prompt']})

        gen_tracking.append({
            'slide': slide['num'],
            'generationId': result.get('generationId'),
            'duration': result.get('duration'),
        })

        image_src = result.get('imageSrc', '')
        if image_src.startswith('data:'):
            b64 = image_src.split(',', 1)[1]
            with open(f'{OUTDIR}/slide-{slide["num"]}.png', 'wb') as f:
                f.write(base64.b64decode(b64))

    browser.close()

# Save tracking data
with open(f'{OUTDIR}/generation-tracking.json', 'w') as f:
    json.dump(gen_tracking, f, indent=2)

# Build full-bleed PDF
from reportlab.pdfgen import canvas
from PIL import Image
img = Image.open(f'{OUTDIR}/slide-01.png')
W, H = img.size
PAGE_W, PAGE_H = 720, 720 * H / W
c = canvas.Canvas(f'{OUTDIR}/deck.pdf', pagesize=(PAGE_W, PAGE_H))
for s in SLIDES:
    path = f'{OUTDIR}/slide-{s["num"]}.png'
    if os.path.exists(path):
        c.drawImage(path, 0, 0, width=PAGE_W, height=PAGE_H)
        c.showPage()
c.save()

# Fetch costs (wait for OpenRouter to settle)
time.sleep(15)
import subprocess
total = 0
for g in gen_tracking:
    r = subprocess.run(['curl', '-s', '-H', f'Authorization: Bearer {API_KEY}',
        f'https://openrouter.ai/api/v1/generation?id={g["generationId"]}'],
        capture_output=True, text=True)
    try:
        cost = json.loads(r.stdout).get('data', {}).get('total_cost', 0) or 0
        g['cost'] = cost; total += cost
    except: pass
print(f"Total cost: ${total:.2f} for {len(SLIDES)} slides")
```

---

## API Reference

| Method | What It Does | Returns |
|--------|-------------|---------|
| `connect({ apiKey, model? })` | Connect to OpenRouter | `{ model, provider }` |
| `generate({ prompt?, model?, renderUI? })` | Generate infographic | `{ generationId, callId, imageSrc, model, duration }` |
| `setTemplate(name)` | Set template by name or ID | prompt text |
| `setPrompt(text)` | Set custom prompt | void |
| `setModel(id)` | Change the model | void |
| `getModel()` | Get current model | string |
| `getState()` | Get full tool state | `{ mode, prompt, model, connected, activeGenerations, systemPrompt, document, image }` |
| `stop()` | Cancel all active generations | void |
| `meta.getMethods()` | List all methods | string[] |
| `meta.getManifest()` | Get full schema (async) | JSON |
| `meta.getSkills()` | Get SKILL files (async) | `{ human, browser, api }` |
| `meta.health()` | Check readiness | `{ status, methodCount }` |
| `meta.getLog()` | Get execution log | `[{ method, duration, error }]` |
| `meta.getVersion()` | Get version triple | `{ api, ui, content }` |

Default model: `google/gemini-3.1-flash-image-preview`

---

## Prompt Writing Tips

- Start with the format: `'Architecture diagram: "Title Here"'`
- Be specific and structured — use numbered lists, named sections
- Include data points, metrics, and concrete details
- Name the visual elements you want: boxes, arrows, layers, icons
- Mention the style: `"dark navy background, teal accents (#4ECDC4)"`
- For decks: keep a consistent style phrase across all prompts
- Attach a logo/brand image via 📎 for brand-consistent output
- Longer prompts = better results. 100-200 words per slide works well.

---

## Vault Operations (sgit)

If saving outputs to an encrypted vault:

```bash
sgit clone <vault-key>
sgit commit "description" && sgit --token dc-claude-web push
sgit --token dc-claude-web --base-url https://dev.send.sgraph.ai share
```

Note: `--token` and `--base-url` go BEFORE the subcommand.
