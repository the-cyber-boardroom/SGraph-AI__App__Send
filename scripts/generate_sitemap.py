#!/usr/bin/env python3
"""
Generate sitemap.xml for sgraph.ai with full hreflang support.

Produces a sitemap with 306 URLs (18 indexable pages x 17 locales),
each annotated with hreflang alternate links for all 17 locale variants
plus x-default pointing to en-gb.

Usage:
    python scripts/generate_sitemap.py
    python scripts/generate_sitemap.py --dry-run
    python scripts/generate_sitemap.py --output /tmp/sitemap.xml
"""
import sys
import argparse
from pathlib import Path
from xml.etree.ElementTree import Element, SubElement, ElementTree
from xml.dom.minidom import parseString


# ── Configuration ──────────────────────────────────────────────────────────

WEBSITE_DIR = Path(__file__).parent.parent / 'sgraph_ai__website'
SITE_URL    = 'https://sgraph.ai'
LASTMOD     = '2026-03-01'

# Source locale (also serves as x-default)
SOURCE_LOCALE = 'en-gb'

# All locales in order: source first, then the rest
ALL_LOCALES = [
    'en-gb', 'en-us',
    'pt-pt', 'pt-br',
    'es-es', 'es-ar', 'es-mx',
    'fr-fr', 'fr-ca',
    'de-de', 'de-ch',
    'it-it',
    'nl-nl',
    'pl-pl',
    'ro-ro',
    'hr-hr',
    'tlh',
]

# hreflang attribute values per locale slug
# (hreflang uses BCP 47: language-Region, lowercase language, uppercase region)
HREFLANG_MAP = {
    'en-gb': 'en-gb',
    'en-us': 'en-us',
    'pt-pt': 'pt-pt',
    'pt-br': 'pt-br',
    'es-es': 'es-es',
    'es-ar': 'es-ar',
    'es-mx': 'es-mx',
    'fr-fr': 'fr-fr',
    'fr-ca': 'fr-ca',
    'de-de': 'de-de',
    'de-ch': 'de-ch',
    'it-it': 'it-it',
    'nl-nl': 'nl-nl',
    'pl-pl': 'pl-pl',
    'ro-ro': 'ro-ro',
    'hr-hr': 'hr-hr',
    'tlh':   'tlh',
}

# Indexable pages — paths relative to the locale root (trailing slash = directory index)
# Excludes payment/success/ and payment/cancel/ (post-checkout redirects, not indexable)
PAGES = [
    '/',                            # home
    '/product/',
    '/agents/',
    '/agents/sherpa/',
    '/agents/ambassador/',
    '/agents/architect/',
    '/architecture/',
    '/contact/',
    '/early-access/',
    '/pricing/',
    '/pricing/free/',
    '/pricing/cloud/',
    '/pricing/dedicated/',
    '/pricing/managed/',
    '/pricing/self-hosted/',
    '/pricing/your-cloud/',
    '/pricing/partners/',
    '/pricing/aws-marketplace/',
]

# Priority mapping: path prefix -> priority value
# More specific prefixes are checked first
PRIORITY_MAP = [
    ('/',                      '1.0'),     # home page
    ('/product/',              '0.9'),     # product overview
    ('/agents/',               '0.8'),     # agents hub
    ('/agents/sherpa/',        '0.7'),     # individual agent pages
    ('/agents/ambassador/',    '0.7'),
    ('/agents/architect/',     '0.7'),
    ('/architecture/',         '0.7'),     # architecture
    ('/early-access/',         '0.8'),     # conversion page
    ('/contact/',              '0.6'),     # contact
    ('/pricing/',              '0.8'),     # pricing hub
    ('/pricing/free/',         '0.6'),     # pricing detail pages
    ('/pricing/cloud/',        '0.6'),
    ('/pricing/dedicated/',    '0.6'),
    ('/pricing/managed/',      '0.6'),
    ('/pricing/self-hosted/',  '0.6'),
    ('/pricing/your-cloud/',   '0.6'),
    ('/pricing/partners/',     '0.5'),
    ('/pricing/aws-marketplace/', '0.5'),
]

# Change frequency: hub/main pages weekly, detail pages monthly
WEEKLY_PAGES = {'/', '/product/', '/agents/', '/pricing/', '/early-access/', '/architecture/'}


# ── URL Construction ───────────────────────────────────────────────────────

def make_url(locale, page_path):
    """Build the full URL for a locale + page path."""
    return f'{SITE_URL}/{locale}{page_path}'


def get_priority(page_path):
    """Return the priority string for a given page path."""
    for prefix, priority in PRIORITY_MAP:
        if page_path == prefix:
            return priority
    return '0.5'


def get_changefreq(page_path):
    """Return changefreq for a given page path."""
    return 'weekly' if page_path in WEEKLY_PAGES else 'monthly'


# ── Sitemap Generation ────────────────────────────────────────────────────

SITEMAP_NS   = 'http://www.sitemaps.org/schemas/sitemap/0.9'
XHTML_NS     = 'http://www.w3.org/1999/xhtml'


def generate_sitemap():
    """Generate the sitemap XML string."""
    # We build the XML manually for precise control over formatting
    lines = []
    lines.append('<?xml version="1.0" encoding="UTF-8"?>')
    lines.append(f'<urlset xmlns="{SITEMAP_NS}"')
    lines.append(f'        xmlns:xhtml="{XHTML_NS}">')

    total_urls = 0

    for page_path in PAGES:
        for locale in ALL_LOCALES:
            loc_url    = make_url(locale, page_path)
            priority   = get_priority(page_path)
            changefreq = get_changefreq(page_path)

            lines.append('  <url>')
            lines.append(f'    <loc>{loc_url}</loc>')
            lines.append(f'    <lastmod>{LASTMOD}</lastmod>')
            lines.append(f'    <changefreq>{changefreq}</changefreq>')
            lines.append(f'    <priority>{priority}</priority>')

            # hreflang alternates: one for each locale + x-default
            for alt_locale in ALL_LOCALES:
                alt_url      = make_url(alt_locale, page_path)
                alt_hreflang = HREFLANG_MAP[alt_locale]
                lines.append(
                    f'    <xhtml:link rel="alternate" hreflang="{alt_hreflang}" href="{alt_url}"/>'
                )

            # x-default points to en-gb
            default_url = make_url(SOURCE_LOCALE, page_path)
            lines.append(
                f'    <xhtml:link rel="alternate" hreflang="x-default" href="{default_url}"/>'
            )

            lines.append('  </url>')
            total_urls += 1

    lines.append('</urlset>')

    return '\n'.join(lines) + '\n', total_urls


# ── Main ──────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='Generate sitemap.xml for sgraph.ai')
    parser.add_argument('--output', type=str, default=None,
                        help='Output file path (default: sgraph_ai__website/sitemap.xml)')
    parser.add_argument('--dry-run', action='store_true',
                        help='Print stats without writing the file')
    args = parser.parse_args()

    output_path = Path(args.output) if args.output else WEBSITE_DIR / 'sitemap.xml'

    print('SGraph AI — Sitemap Generator')
    print(f'  Site URL:    {SITE_URL}')
    print(f'  Locales:     {len(ALL_LOCALES)} ({", ".join(ALL_LOCALES)})')
    print(f'  Pages:       {len(PAGES)} indexable pages (excl. payment/success, payment/cancel)')
    print(f'  Expected:    {len(PAGES)} pages x {len(ALL_LOCALES)} locales = {len(PAGES) * len(ALL_LOCALES)} URLs')
    print(f'  Last mod:    {LASTMOD}')
    print(f'  Output:      {output_path}')
    print()

    xml_content, total_urls = generate_sitemap()

    print(f'  Generated {total_urls} URL entries')
    print(f'  Each entry has {len(ALL_LOCALES) + 1} hreflang alternates ({len(ALL_LOCALES)} locales + x-default)')
    print(f'  File size:   {len(xml_content):,} bytes ({len(xml_content) / 1024:.1f} KB)')

    if args.dry_run:
        print()
        print('  Dry run — no file written.')
    else:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(xml_content, encoding='utf-8')
        print()
        print(f'  Written to: {output_path}')

    return 0


if __name__ == '__main__':
    sys.exit(main())
