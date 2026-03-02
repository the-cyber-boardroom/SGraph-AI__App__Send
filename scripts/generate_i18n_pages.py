#!/usr/bin/env python3
"""
Generate locale-specific HTML pages for sgraph.ai website.

Reads English (en-GB) source HTML files + locale JSON translation files,
produces pre-rendered locale folder trees (e.g., /pt-pt/pricing/index.html).

Shared assets live in _common/ (CSS, JS, fonts) and are NOT duplicated —
locale pages reference the originals via adjusted relative paths.

Usage:
    python scripts/generate_i18n_pages.py
    python scripts/generate_i18n_pages.py --output-dir /tmp/i18n-output
    python scripts/generate_i18n_pages.py --dry-run
"""
import json
import os
import re
import sys
import argparse
from pathlib import Path


# ── Configuration ──────────────────────────────────────────────────────────

WEBSITE_DIR = Path(__file__).parent.parent / 'sgraph_ai__website'
SOURCE_DIR  = WEBSITE_DIR / 'en-gb'
I18N_DIR    = WEBSITE_DIR / 'i18n'
SITE_URL    = 'https://sgraph.ai'

# Locale code → URL slug → JSON file mapping
LOCALES = [
    { 'code': 'en-us', 'slug': 'en-us', 'json': 'en-us.json', 'lang': 'en-US', 'hreflang': 'en-US' },
    { 'code': 'pt-pt', 'slug': 'pt-pt', 'json': 'pt-pt.json', 'lang': 'pt-PT', 'hreflang': 'pt-PT' },
    { 'code': 'pt-br', 'slug': 'pt-br', 'json': 'pt-br.json', 'lang': 'pt-BR', 'hreflang': 'pt-BR' },
    { 'code': 'es-es', 'slug': 'es-es', 'json': 'es-es.json', 'lang': 'es-ES', 'hreflang': 'es-ES' },
    { 'code': 'es-ar', 'slug': 'es-ar', 'json': 'es-ar.json', 'lang': 'es-AR', 'hreflang': 'es-AR' },
    { 'code': 'es-mx', 'slug': 'es-mx', 'json': 'es-mx.json', 'lang': 'es-MX', 'hreflang': 'es-MX' },
    { 'code': 'fr-fr', 'slug': 'fr-fr', 'json': 'fr-fr.json', 'lang': 'fr-FR', 'hreflang': 'fr-FR' },
    { 'code': 'fr-ca', 'slug': 'fr-ca', 'json': 'fr-ca.json', 'lang': 'fr-CA', 'hreflang': 'fr-CA' },
    { 'code': 'de-de', 'slug': 'de-de', 'json': 'de-de.json', 'lang': 'de-DE', 'hreflang': 'de-DE' },
    { 'code': 'de-ch', 'slug': 'de-ch', 'json': 'de-ch.json', 'lang': 'de-CH', 'hreflang': 'de-CH' },
    { 'code': 'it-it', 'slug': 'it-it', 'json': 'it-it.json', 'lang': 'it-IT', 'hreflang': 'it-IT' },
    { 'code': 'pl-pl', 'slug': 'pl-pl', 'json': 'pl-pl.json', 'lang': 'pl-PL', 'hreflang': 'pl-PL' },
    { 'code': 'ro-ro', 'slug': 'ro-ro', 'json': 'ro-ro.json', 'lang': 'ro-RO', 'hreflang': 'ro-RO' },
    { 'code': 'nl-nl', 'slug': 'nl-nl', 'json': 'nl-nl.json', 'lang': 'nl-NL', 'hreflang': 'nl-NL' },
    { 'code': 'hr-hr', 'slug': 'hr-hr', 'json': 'hr-hr.json', 'lang': 'hr-HR', 'hreflang': 'hr-HR' },
    { 'code': 'tlh',   'slug': 'tlh',   'json': 'tlh.json',   'lang': 'tlh',   'hreflang': 'tlh'   },
]

# Files to skip (not user-facing content pages)
SKIP_FILES = {'404.html'}

# Directories to skip (locale output dirs, assets, common, en-gb source)
SKIP_DIRS = {loc['slug'] for loc in LOCALES} | {'_common', 'i18n', 'cloudfront', 'en-gb'}


# ── Translation Loading ───────────────────────────────────────────────────

def load_translations(locale_info):
    """Load a locale's translation JSON file."""
    json_path = I18N_DIR / locale_info['json']
    if not json_path.exists():
        print(f"  WARNING: Translation file not found: {json_path}")
        return {}
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    # Remove comment keys
    return {k: v for k, v in data.items() if not k.startswith('_')}


def load_english():
    """Load the English (en-GB) master translation file."""
    en_path = I18N_DIR / 'en-gb.json'
    if not en_path.exists():
        print(f"  WARNING: English translation file not found: {en_path}")
        return {}
    with open(en_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    return {k: v for k, v in data.items() if not k.startswith('_')}


# ── HTML Discovery ────────────────────────────────────────────────────────

def find_html_files(source_dir):
    """Find all HTML files to process, relative to source_dir (en-gb/)."""
    html_files = []
    for root, dirs, files in os.walk(source_dir):
        for f in files:
            if f.endswith('.html') and f not in SKIP_FILES:
                rel_path = (Path(root) / f).relative_to(source_dir)
                html_files.append(rel_path)

    return sorted(html_files)


# ── HTML Transformation ───────────────────────────────────────────────────

def translate_html(html_content, translations, en_translations, locale_info, rel_path, all_locales):
    """Transform an English HTML file into a locale-specific version."""

    result = html_content

    # 1. Set <html lang="xx">
    result = re.sub(
        r'<html\s+lang="[^"]*"',
        f'<html lang="{locale_info["lang"]}"',
        result
    )

    # 1b. Mark page as pre-rendered so i18n.js skips JSON loading
    result = result.replace(
        '</head>',
        '  <meta name="i18n-prerendered" content="true" />\n</head>',
        1
    )

    # 2. Translate data-i18n element content
    #    Uses backreference to match opening tag name with closing tag name,
    #    preventing mismatches with nested elements (e.g., <p> with <span> inside)
    def replace_i18n_content(match):
        open_tag = match.group(1)       # full opening tag including >
        key = match.group(3)            # the data-i18n key value
        old_content = match.group(4)    # existing content
        end_tag = match.group(5)        # </tag>

        translated = translations.get(key, en_translations.get(key, old_content))
        return f'{open_tag}{translated}{end_tag}'

    result = re.sub(
        r'(<([a-zA-Z][a-zA-Z0-9]*)\b[^>]*\bdata-i18n="([^"]+)"[^>]*>)(.*?)(</\2>)',
        replace_i18n_content,
        result,
        flags=re.DOTALL
    )

    # 3. Translate data-i18n-placeholder attributes
    def replace_placeholder(match):
        full = match.group(0)
        key = match.group(1)
        translated = translations.get(key, en_translations.get(key, ''))
        if translated:
            # Replace or add placeholder attribute
            if 'placeholder="' in full:
                full = re.sub(r'placeholder="[^"]*"', f'placeholder="{_escape_attr(translated)}"', full)
            else:
                full = full.replace(f'data-i18n-placeholder="{key}"',
                                   f'data-i18n-placeholder="{key}" placeholder="{_escape_attr(translated)}"')
        return full

    result = re.sub(
        r'<[^>]*data-i18n-placeholder="([^"]+)"[^>]*>',
        replace_placeholder,
        result
    )

    # 4. Translate <title> via i18n-title-key meta tag
    title_key_match = re.search(r'<meta\s+name="i18n-title-key"\s+content="([^"]+)"', result)
    if title_key_match:
        title_key = title_key_match.group(1)
        translated_title = translations.get(title_key, en_translations.get(title_key, ''))
        if translated_title:
            result = re.sub(r'<title>[^<]*</title>', f'<title>{_escape_html(translated_title)}</title>', result)

    # 5. Asset paths: no adjustment needed — source (en-gb/) and target
    #    locale folders are at the same depth, so relative paths are identical.

    # 5b. Rewrite cross-site send.sgraph.ai links to include locale prefix
    #     e.g., https://send.sgraph.ai → https://send.sgraph.ai/pt-pt/
    locale_slug = locale_info['slug']
    result = result.replace(
        'href="https://send.sgraph.ai"',
        f'href="https://send.sgraph.ai/{locale_slug}/"'
    )
    result = result.replace(
        "href='https://send.sgraph.ai'",
        f"href='https://send.sgraph.ai/{locale_slug}/'"
    )

    # 6. Inject hreflang tags into <head>
    hreflang_tags = _build_hreflang_tags(rel_path, all_locales)
    result = result.replace('</head>', hreflang_tags + '\n</head>')

    # 7. Add canonical URL
    page_url = _page_url(rel_path, locale_info['slug'])
    canonical = f'  <link rel="canonical" href="{page_url}" />'
    result = result.replace('</head>', canonical + '\n</head>')

    return result


def add_hreflang_to_english(html_content, rel_path, all_locales):
    """Add hreflang and canonical tags to the English source page."""
    result = html_content

    # Only add if not already present
    if 'hreflang' not in result:
        hreflang_tags = _build_hreflang_tags(rel_path, all_locales)
        result = result.replace('</head>', hreflang_tags + '\n</head>')

    if 'rel="canonical"' not in result:
        page_url = _page_url(rel_path, 'en-gb')
        canonical = f'  <link rel="canonical" href="{page_url}" />'
        result = result.replace('</head>', canonical + '\n</head>')

    return result


# ── Hreflang Tags ─────────────────────────────────────────────────────────

def _build_hreflang_tags(rel_path, all_locales):
    """Build hreflang link tags for all locales."""
    # Convert rel_path to URL path (e.g., pricing/index.html → /pricing/)
    page_path = '/' + str(rel_path.parent) + '/' if str(rel_path.parent) != '.' else '/'
    if page_path == '/./' or page_path == '//':
        page_path = '/'

    tags = []
    # English GB (default and x-default) — now lives at /en-gb/ prefix
    en_url = SITE_URL + '/en-gb' + page_path
    tags.append(f'  <link rel="alternate" hreflang="en-GB" href="{en_url}" />')
    tags.append(f'  <link rel="alternate" hreflang="x-default" href="{en_url}" />')

    # Other locales
    for loc in all_locales:
        loc_url = SITE_URL + '/' + loc['slug'] + page_path
        tags.append(f'  <link rel="alternate" hreflang="{loc["hreflang"]}" href="{loc_url}" />')

    return '\n'.join(tags)


def _page_url(rel_path, locale_slug):
    """Build the full URL for a page."""
    page_path = '/' + str(rel_path.parent) + '/' if str(rel_path.parent) != '.' else '/'
    if page_path == '/./' or page_path == '//':
        page_path = '/'
    if locale_slug:
        return SITE_URL + '/' + locale_slug + page_path
    return SITE_URL + page_path


# ── Utilities ─────────────────────────────────────────────────────────────

def _escape_html(text):
    """Escape HTML special characters for use in <title> etc."""
    return text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def _escape_attr(text):
    """Escape for use in HTML attribute values."""
    return text.replace('&', '&amp;').replace('"', '&quot;').replace('<', '&lt;').replace('>', '&gt;')


# ── Main ──────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='Generate i18n locale pages for sgraph.ai')
    parser.add_argument('--output-dir', type=str, default=None,
                        help='Output directory (default: inside sgraph_ai__website/)')
    parser.add_argument('--dry-run', action='store_true',
                        help='Show what would be generated without writing files')
    parser.add_argument('--update-english', action='store_true',
                        help='Add hreflang/canonical tags to English source pages')
    args = parser.parse_args()

    output_dir = Path(args.output_dir) if args.output_dir else WEBSITE_DIR

    print(f"SGraph AI — i18n Page Generator")
    print(f"  Website dir: {WEBSITE_DIR}")
    print(f"  Source dir:  {SOURCE_DIR}")
    print(f"  Output dir:  {output_dir}")
    print(f"  Locales:     {', '.join(loc['slug'] for loc in LOCALES)}")
    print()

    # Load translations
    en_translations = load_english()
    print(f"  English (en-GB) keys: {len(en_translations)}")

    locale_translations = {}
    for loc in LOCALES:
        t = load_translations(loc)
        locale_translations[loc['code']] = t
        missing = set(en_translations.keys()) - set(t.keys())
        print(f"  {loc['slug']} keys: {len(t)}, missing: {len(missing)}")
        if missing and len(missing) <= 10:
            for k in sorted(missing):
                print(f"    - {k}")
    print()

    # Find HTML files in the en-gb source folder
    html_files = find_html_files(SOURCE_DIR)
    print(f"  Found {len(html_files)} HTML pages to process:")
    for f in html_files:
        print(f"    {f}")
    print()

    # Update English pages with hreflang tags
    if args.update_english:
        print("  Updating English source pages with hreflang tags...")
        for rel_path in html_files:
            source_path = SOURCE_DIR / rel_path
            html = source_path.read_text(encoding='utf-8')
            updated = add_hreflang_to_english(html, rel_path, LOCALES)
            if updated != html:
                if not args.dry_run:
                    source_path.write_text(updated, encoding='utf-8')
                print(f"    Updated: {rel_path}")
        print()

    # Generate locale pages
    generated = 0
    for loc in LOCALES:
        translations = locale_translations[loc['code']]
        print(f"  Generating {loc['slug']}/ ...")

        for rel_path in html_files:
            source_path = SOURCE_DIR / rel_path
            target_path = output_dir / loc['slug'] / rel_path

            html = source_path.read_text(encoding='utf-8')
            translated = translate_html(html, translations, en_translations, loc, rel_path, LOCALES)

            if args.dry_run:
                print(f"    Would write: {loc['slug']}/{rel_path}")
            else:
                target_path.parent.mkdir(parents=True, exist_ok=True)
                target_path.write_text(translated, encoding='utf-8')
                print(f"    Wrote: {loc['slug']}/{rel_path}")

            generated += 1

    print()
    print(f"  Done. {'Would generate' if args.dry_run else 'Generated'} {generated} files.")
    return 0


if __name__ == '__main__':
    sys.exit(main())
