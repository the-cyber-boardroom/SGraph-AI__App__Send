#!/usr/bin/env python3
"""Generate locale-specific HTML pages for SGraph Send UI.

Reads English (en-GB) source HTML files + locale JSON translation files,
produces pre-rendered locale folder trees alongside en-gb/.

Shared assets live in _common/ and are NOT duplicated —
locale pages reference the originals via the same relative paths (../_common/).

The i18n.js client-side module continues to work for runtime locale switching.
Pre-rendered pages give correct initial content per locale and improve SEO.

Generated locale folders are CI-only artifacts — they are listed in
.gitignore and never committed to git. Only the en-gb/ source pages and
i18n/*.json translation files live in the repo.

Locale codes match the main sgraph.ai website convention (language-country,
all lowercase): en-us, pt-pt, pt-br, de-de, de-ch, es-es, es-ar, es-mx,
fr-fr, fr-ca, it-it, nl-nl, pl-pl, hr-hr, ro-ro, tlh.

Usage:
    python scripts/generate_send_i18n_pages.py
    python scripts/generate_send_i18n_pages.py --dry-run
    python scripts/generate_send_i18n_pages.py --version v0.2.0
"""
import json
import os
import re
import sys
import argparse
from pathlib import Path


# ── Configuration ──────────────────────────────────────────────────────────

UI_BASE    = Path(__file__).parent.parent / 'sgraph_ai_app_send__ui__user'
SOURCE_DIR = 'en-gb'

# Locale definitions — matches main website convention exactly.
# slug = folder name (lowercase), lang = HTML lang attribute, json = filename in i18n/
LOCALES = [
    { 'slug': 'en-us', 'json': 'en-us.json', 'lang': 'en-US' },
    { 'slug': 'pt-pt', 'json': 'pt-pt.json', 'lang': 'pt-PT' },
    { 'slug': 'pt-br', 'json': 'pt-br.json', 'lang': 'pt-BR' },
    { 'slug': 'de-de', 'json': 'de-de.json', 'lang': 'de-DE' },
    { 'slug': 'de-ch', 'json': 'de-ch.json', 'lang': 'de-CH' },
    { 'slug': 'es-es', 'json': 'es-es.json', 'lang': 'es-ES' },
    { 'slug': 'es-ar', 'json': 'es-ar.json', 'lang': 'es-AR' },
    { 'slug': 'es-mx', 'json': 'es-mx.json', 'lang': 'es-MX' },
    { 'slug': 'fr-fr', 'json': 'fr-fr.json', 'lang': 'fr-FR' },
    { 'slug': 'fr-ca', 'json': 'fr-ca.json', 'lang': 'fr-CA' },
    { 'slug': 'it-it', 'json': 'it-it.json', 'lang': 'it-IT' },
    { 'slug': 'nl-nl', 'json': 'nl-nl.json', 'lang': 'nl-NL' },
    { 'slug': 'pl-pl', 'json': 'pl-pl.json', 'lang': 'pl-PL' },
    { 'slug': 'hr-hr', 'json': 'hr-hr.json', 'lang': 'hr-HR' },
    { 'slug': 'ro-ro', 'json': 'ro-ro.json', 'lang': 'ro-RO' },
    { 'slug': 'tlh',   'json': 'tlh.json',   'lang': 'tlh'   },
]


# ── Translation Loading ───────────────────────────────────────────────────

def load_json(path):
    """Load a JSON translation file, stripping _comment keys."""
    if not path.exists():
        print(f"  WARNING: Translation file not found: {path}")
        return {}
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    return {k: v for k, v in data.items() if not k.startswith('_')}


# ── HTML Discovery ────────────────────────────────────────────────────────

def find_html_files(source_dir):
    """Find all HTML files in en-gb/, relative to source_dir."""
    html_files = []
    for root, _dirs, files in os.walk(source_dir):
        for f in files:
            if f.endswith('.html'):
                rel_path = (Path(root) / f).relative_to(source_dir)
                html_files.append(rel_path)
    return sorted(html_files)


# ── HTML Transformation ───────────────────────────────────────────────────

def translate_html(html_content, translations, en_translations, locale_info):
    """Transform an English HTML file into a locale-specific version."""

    result = html_content

    # 1. Set <html lang="xx">
    result = re.sub(
        r'<html\s+lang="[^"]*"',
        f'<html lang="{locale_info["lang"]}"',
        result
    )

    # 2. Add pre-rendered marker so i18n.js knows to skip JSON loading
    if 'i18n-prerendered' not in result:
        result = result.replace(
            '</head>',
            '    <meta name="i18n-prerendered" content="true" />\n</head>',
            1
        )

    # 3. Translate data-i18n element content
    def replace_i18n_content(match):
        open_tag    = match.group(1)
        key         = match.group(3)
        old_content = match.group(4)
        end_tag     = match.group(5)
        translated  = translations.get(key, en_translations.get(key, old_content))
        return f'{open_tag}{translated}{end_tag}'

    result = re.sub(
        r'(<([a-zA-Z][a-zA-Z0-9]*)\b[^>]*\bdata-i18n="([^"]+)"[^>]*>)(.*?)(</\2>)',
        replace_i18n_content,
        result,
        flags=re.DOTALL
    )

    # 4. Translate data-i18n-placeholder attribute values (input placeholders)
    def replace_i18n_placeholder(match):
        tag = match.group(0)
        key_match = re.search(r'data-i18n-placeholder="([\w.]+)"', tag)
        if not key_match:
            return tag
        key = key_match.group(1)
        translated = translations.get(key, en_translations.get(key, ''))
        if translated:
            return re.sub(r'(?<!i18n-)placeholder="[^"]*"', f'placeholder="{_escape_html(translated)}"', tag)
        return tag

    result = re.sub(
        r'<[^>]*data-i18n-placeholder="[\w.]+"[^>]*>',
        replace_i18n_placeholder,
        result
    )

    # 5. Translate inline I18n.t() calls in template literals (e.g., ${I18n.t('key')})
    def replace_inline_i18n(match):
        key = match.group(1)
        translated = translations.get(key, en_translations.get(key, match.group(0)))
        return _escape_html(translated)

    result = re.sub(
        r"\$\{I18n\.t\('([^']+)'\)\}",
        replace_inline_i18n,
        result
    )

    # 6. Asset paths: locale folders are siblings of en-gb, so ../_common/ paths
    #    resolve correctly without adjustment.

    return result


# ── Utilities ─────────────────────────────────────────────────────────────

def _escape_html(text):
    return text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


# ── Main ──────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='Generate i18n locale pages for SGraph Send UI')
    parser.add_argument('--version', type=str, default='v0.2.0',
                        help='UI version to process (default: v0.2.0)')
    parser.add_argument('--dry-run', action='store_true',
                        help='Show what would be generated without writing files')
    args = parser.parse_args()

    # Parse version into IFD path: v0.2.0 → v0/v0.2/v0.2.0
    clean = args.version.lstrip('v')
    parts = clean.split('.')
    if len(parts) == 3:
        major, minor, _patch = parts
        ifd_path = f'v{major}/v{major}.{minor}/v{major}.{minor}.{_patch}'
    else:
        ifd_path = args.version

    version_dir = UI_BASE / ifd_path
    i18n_dir    = version_dir / 'i18n'
    en_dir      = version_dir / SOURCE_DIR

    print(f"SGraph Send — i18n Page Generator")
    print(f"  Version:    {args.version}")
    print(f"  Source:     {en_dir}")
    print(f"  i18n dir:   {i18n_dir}")
    print(f"  Locales:    {', '.join(loc['slug'] for loc in LOCALES)}")
    print()

    if not en_dir.is_dir():
        print(f"ERROR: English source directory not found: {en_dir}")
        return 1

    if not i18n_dir.is_dir():
        print(f"ERROR: i18n directory not found: {i18n_dir}")
        return 1

    # Load English master translations
    en_translations = load_json(i18n_dir / 'en-gb.json')
    print(f"  English (en-GB) keys: {len(en_translations)}")

    # Load locale translations
    locale_translations = {}
    for loc in LOCALES:
        t = load_json(i18n_dir / loc['json'])
        locale_translations[loc['slug']] = t
        missing = set(en_translations.keys()) - set(t.keys())
        print(f"  {loc['slug']:6s} keys: {len(t):3d}, missing: {len(missing)}")
    print()

    # Find HTML source files
    html_files = find_html_files(en_dir)
    print(f"  Found {len(html_files)} HTML pages:")
    for f in html_files:
        print(f"    {SOURCE_DIR}/{f}")
    print()

    # Generate locale pages
    generated = 0
    for loc in LOCALES:
        translations = locale_translations[loc['slug']]
        locale_dir   = version_dir / loc['slug']
        print(f"  Generating {loc['slug']}/ ...")

        for rel_path in html_files:
            source_path = en_dir / rel_path
            target_path = locale_dir / rel_path

            html = source_path.read_text(encoding='utf-8')
            translated = translate_html(html, translations, en_translations, loc)

            if args.dry_run:
                print(f"    Would write: {loc['slug']}/{rel_path}")
            else:
                target_path.parent.mkdir(parents=True, exist_ok=True)
                target_path.write_text(translated, encoding='utf-8')
                print(f"    Wrote: {loc['slug']}/{rel_path}")

            generated += 1

    print()
    print(f"  Done. {'Would generate' if args.dry_run else 'Generated'} {generated} files "
          f"across {len(LOCALES)} locales.")
    return 0


if __name__ == '__main__':
    sys.exit(main())
