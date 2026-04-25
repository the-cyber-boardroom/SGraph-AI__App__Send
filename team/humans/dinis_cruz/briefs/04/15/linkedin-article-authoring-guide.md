# LinkedIn Article Authoring Guide

*How to create LinkedIn-pasteable HTML articles with embedded images*

## The Technique

LinkedIn's article editor accepts base64-embedded images pasted from HTML. This means you can author a complete article with inline images in an HTML file, then copy-paste the entire thing into LinkedIn in one operation.

## Workflow

### 1. Build the HTML File

Create an HTML file with:
- Inline CSS for styling (LinkedIn strips most of it, but it renders well in-browser for preview)
- Images embedded as base64 JPEG data URIs
- Standard semantic HTML (h1, h2, p, img, a, em, strong, hr)

### 2. Embed Images as Base64

Convert each image to a base64-encoded JPEG and embed it directly in the `<img>` tag:

```html
<img src="data:image/jpeg;base64,/9j/4AAQSkZJRgAB..." alt="Description">
```

#### Image Encoding Settings

| Setting | Value | Reason |
|---------|-------|--------|
| Max width | 800px | LinkedIn's content area is ~700-800px wide |
| Format | JPEG | Smaller than PNG for photos/slides, universally supported |
| Quality | 70-75 | Good balance of quality and file size |
| Resize method | LANCZOS | Best quality downscaling |

#### Python Helper Function

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

Usage:
```python
b64 = img_to_b64('slide-01.png')
html_img = f'<img src="data:image/jpeg;base64,{b64}" alt="Slide 1">'
```

### 3. HTML Template

```html
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Article Title</title>
<style>
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    max-width: 720px;
    margin: 40px auto;
    padding: 20px;
    line-height: 1.7;
    color: #333;
  }
  h1 { font-size: 28px; font-weight: 700; margin-bottom: 8px; }
  h2 { font-size: 22px; font-weight: 600; margin-top: 36px; margin-bottom: 12px; }
  p { font-size: 16px; margin: 12px 0; }
  img {
    width: 100%;
    max-width: 720px;
    display: block;
    margin: 20px 0;
    border-radius: 4px;
  }
  a { color: #0077B5; }
  .meta {
    font-size: 14px;
    color: #666;
    font-style: italic;
    margin-bottom: 24px;
  }
  .hint {
    background: #fffbe6;
    border: 1px solid #ffe58f;
    padding: 12px;
    border-radius: 6px;
    font-size: 14px;
    margin-bottom: 24px;
  }
  .callout {
    background: #e6f3ff;
    border: 1px solid #91caff;
    padding: 12px;
    border-radius: 6px;
    font-size: 14px;
    margin: 24px 0;
  }
  code {
    background: #f0f0f0;
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 14px;
  }
  hr {
    border: none;
    border-top: 1px solid #e0e0e0;
    margin: 32px 0;
  }
</style>
</head>
<body>

<div class="hint">
  <strong>To paste into LinkedIn:</strong> Select all (Cmd+A), copy (Cmd+C),
  paste into the LinkedIn article editor.
</div>

<img src="data:image/jpeg;base64,{COVER_IMAGE_B64}" alt="Cover image">

<h1>Article Title</h1>

<p class="meta">Subtitle or context line here.</p>

<p>Article body text...</p>

<h2>Section Heading</h2>

<img src="data:image/jpeg;base64,{SLIDE_IMAGE_B64}" alt="Slide description">

<p>More text...</p>

<hr>

<p><em>Footer text with credits, links, licence.</em></p>

</body>
</html>
```

### 4. Paste into LinkedIn

1. Open the HTML file in a browser (Chrome, Safari, Firefox all work)
2. **Cmd+A** (or Ctrl+A on Windows) to select everything
3. **Cmd+C** (or Ctrl+C) to copy
4. Go to LinkedIn → Write article → paste into the editor body
5. Upload the cover image separately using LinkedIn's cover image feature
6. Review formatting, add any LinkedIn-specific tags/mentions
7. Publish

## What Works in LinkedIn's Editor

| Element | Works | Notes |
|---------|-------|-------|
| `<h1>`, `<h2>` | Yes | Renders as headings |
| `<p>` | Yes | Standard paragraphs |
| `<strong>`, `<em>` | Yes | Bold and italic |
| `<a href="...">` | Yes | Clickable links |
| `<img>` with base64 src | Yes | Images paste and display |
| `<hr>` | Yes | Horizontal rules |
| `<code>` | Partial | Renders as monospace but no background |
| `<blockquote>` | Yes | Renders as quote |
| `<ul>`, `<ol>` | Yes | Lists work |
| Inline CSS | Mostly stripped | LinkedIn has its own styling |
| `<div>` with styling | Stripped | Divs collapse, styling removed |
| `<table>` | No | Tables do not render |

## What LinkedIn Strips

- All CSS classes and most inline styles
- Background colors on divs
- Border styling
- The `.hint` and `.callout` styled boxes will lose their background/border
- Font sizes (LinkedIn enforces its own)
- Custom fonts

The HTML preview in-browser will look styled. After paste into LinkedIn, images, headings, paragraphs, links, and emphasis survive. Styled boxes become plain text.

## Image Size Considerations

LinkedIn articles have a content width of roughly 700-800px. Base64 images add significantly to the HTML file size:

| Image count | Approx HTML size | Notes |
|-------------|-----------------|-------|
| 1-3 images | 200-400 KB | Fast to load, copy, paste |
| 8-10 images (one deck) | 600 KB - 1 MB | Works fine |
| 13+ images | 1 MB+ | Still works but slower to copy/paste |
| 20+ images | 2 MB+ | May be sluggish, consider splitting into multiple articles |

## Cover Image

LinkedIn's article cover image must be uploaded separately through the editor's cover image UI. It does NOT come from the paste. Create a dedicated cover image:

- Recommended dimensions: 1200 x 628 pixels (LinkedIn's preferred ratio)
- The cover we generate at 16:9 (1400×750-ish) works well too
- Upload directly, don't try to paste it

## Article Patterns We've Tested

### Pattern 1: Slide Deck Narrative
Cover image at top, then slide-by-slide walkthrough with commentary between each slide.
Good for: presenting a deck to people who weren't at the talk.

### Pattern 2: Article with Collage
Cover image, article text, then a single collage image showing all slides at a glance.
Good for: shorter LinkedIn posts where the slides are supplementary.

### Pattern 3: Screenshot Walkthrough
Cover image, then numbered steps with screenshots showing a tool or workflow.
Good for: product demos, vault walkthroughs, tutorials.

### Pattern 4: Multi-Series Article
Cover with series badges ("Article N of M"), series context box at top, main content, footer linking to other articles.
Good for: ongoing series where each article should be discoverable from the others.

## Series Badges and Context Boxes

For series articles, add metadata as plain text (since styled boxes get stripped):

```html
<p class="meta">This article was created from the slide deck, which was
created from the article "Title Here". Part of the PlaybookLM workflow.</p>

<p><strong>Article 2 of 3</strong> - Series description here.
Article 1 covered X. This article covers Y. Article 3 will cover Z.</p>
```

## Generating Cover Images

Cover images for the series use a consistent pattern:
- Dark navy background (#1a1a2e)
- Teal (#4ECDC4) and amber (#F7B731) accents
- Three pill badges: series position, content type, event/date
- Generated via SGraph infographic generator API

Badge examples:
- Text article covers: "Article N of M" | "From Voice Memo" | "OWASP London 2026"
- Slide narrative covers: "Article N of M" | "Slide Deck Narrative" | "OWASP London 2026"

## Complete Python Generation Script

```python
import base64
from PIL import Image
from io import BytesIO

def img_to_b64(path, max_width=800, quality=70):
    """Convert image to base64 JPEG string for HTML embedding."""
    img = Image.open(path)
    if img.width > max_width:
        ratio = max_width / img.width
        img = img.resize((max_width, int(img.height * ratio)), Image.LANCZOS)
    buf = BytesIO()
    img.save(buf, format='JPEG', quality=quality)
    return base64.b64encode(buf.getvalue()).decode()

def build_article(title, meta, sections, cover_path, output_path):
    """
    Build a LinkedIn-pasteable HTML article.
    
    Args:
        title: Article title (string)
        meta: Subtitle/context (string)
        sections: List of dicts with keys:
            - heading (optional): h2 heading
            - image (optional): path to image file
            - image_alt (optional): alt text for image
            - text: paragraph text (string or list of strings)
        cover_path: Path to cover image
        output_path: Where to save the HTML file
    """
    cover_b64 = img_to_b64(cover_path, quality=75)
    
    body_parts = []
    for sec in sections:
        if sec.get('heading'):
            body_parts.append(f'<h2>{sec["heading"]}</h2>')
        if sec.get('image'):
            b64 = img_to_b64(sec['image'])
            alt = sec.get('image_alt', '')
            body_parts.append(f'<img src="data:image/jpeg;base64,{b64}" alt="{alt}">')
        texts = sec['text'] if isinstance(sec['text'], list) else [sec['text']]
        for t in texts:
            body_parts.append(f'<p>{t}</p>')
    
    html = f'''<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>{title}</title>
<style>
  body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
         max-width: 720px; margin: 40px auto; padding: 20px;
         line-height: 1.7; color: #333; }}
  h1 {{ font-size: 28px; font-weight: 700; margin-bottom: 8px; }}
  h2 {{ font-size: 22px; font-weight: 600; margin-top: 36px; margin-bottom: 12px; }}
  p {{ font-size: 16px; margin: 12px 0; }}
  img {{ width: 100%; max-width: 720px; display: block; margin: 20px 0; border-radius: 4px; }}
  a {{ color: #0077B5; }}
  .meta {{ font-size: 14px; color: #666; font-style: italic; margin-bottom: 24px; }}
  .hint {{ background: #fffbe6; border: 1px solid #ffe58f; padding: 12px;
           border-radius: 6px; font-size: 14px; margin-bottom: 24px; }}
  hr {{ border: none; border-top: 1px solid #e0e0e0; margin: 32px 0; }}
</style>
</head>
<body>

<div class="hint">
  <strong>To paste into LinkedIn:</strong> Select all (Cmd+A), copy (Cmd+C),
  paste into the LinkedIn article editor.
</div>

<img src="data:image/jpeg;base64,{cover_b64}" alt="{title}">

<h1>{title}</h1>

<p class="meta">{meta}</p>

{"".join(body_parts)}

</body>
</html>'''
    
    with open(output_path, 'w') as f:
        f.write(html)
    
    print(f"Article saved: {len(html)//1024}KB -> {output_path}")
    return output_path
```

## Troubleshooting

### Images don't paste
- Make sure images are `data:image/jpeg;base64,...` not file references
- Try a different browser (Chrome works most reliably)
- Check that the base64 string is valid (no line breaks inside the data URI)

### Article is too large to paste
- Reduce image quality from 70 to 60
- Reduce max_width from 800 to 600
- Use fewer images (link to a vault instead of embedding everything)
- Split into multiple articles

### Formatting looks wrong after paste
- LinkedIn strips most CSS - this is expected
- Headings, paragraphs, images, links, bold, italic survive
- Styled boxes (backgrounds, borders) get stripped to plain text
- Preview in LinkedIn before publishing

### Images appear blurry
- Increase quality from 70 to 80 (larger file size)
- Increase max_width from 800 to 1000
- Use PNG for screenshots/diagrams: `format='PNG'` (larger file but sharper)

---

*This guide was developed during the OWASP London 2026 presentation production session. All techniques tested and confirmed working with LinkedIn's article editor as of April 2026.*
