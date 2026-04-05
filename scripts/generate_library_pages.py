#!/usr/bin/env python3
"""
generate_library_pages.py — creates individual document wrapper pages for the
SGraph library website (sgraph_ai_app_send__library/).

Run from the repo root:
    python3 scripts/generate_library_pages.py

Each markdown file in the library site gets a companion directory with an
index.html that renders the file via <sg-markdown-viewer>.

Pattern:
    roles/conductor.md   →   roles/conductor/index.html
    skills/create-vault-content.md   →   skills/create-vault-content/index.html
    guides/ifd-intro.md  →   guides/ifd-intro/index.html
"""
import os
import re
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent
LIBRARY_ROOT = REPO_ROOT / 'sgraph_ai_app_send__library'

# ── Section definitions ──────────────────────────────────────────────────────

SECTIONS = {
    'roles': {
        'title': 'Roles',
        'section_nav': [
            ('All Roles', '/roles/'),
            ('Conductor', '/roles/conductor/'),
            ('Librarian', '/roles/librarian/'),
            ('Architect', '/roles/architect/'),
            ('Developer', '/roles/developer/'),
            ('Designer', '/roles/designer/'),
            ('Sherpa', '/roles/sherpa/'),
            ('QA', '/roles/qa/'),
            ('DevOps', '/roles/devops/'),
            ('Ambassador', '/roles/ambassador/'),
            ('Journalist', '/roles/journalist/'),
            ('AppSec', '/roles/appsec/'),
            ('Cartographer', '/roles/cartographer/'),
            ('Historian', '/roles/historian/'),
            ('Advocate', '/roles/advocate/'),
            ('DPO', '/roles/dpo/'),
            ('GRC', '/roles/grc/'),
        ],
    },
    'skills': {
        'title': 'Skills',
        'section_nav': [
            ('All Skills', '/skills/'),
            ('Create Vault Content', '/skills/create-vault-content/'),
            ('Talk to Team', '/skills/talk-to-team/'),
            ('Use SGit &amp; Vaults', '/skills/use-sgit-and-vaults/'),
        ],
    },
    'guides': {
        'title': 'Guides',
        'section_nav': [
            ('All Guides', '/guides/'),
            ('IFD Intro', '/guides/ifd-intro/'),
            ('IFD Versioning', '/guides/ifd-versioning/'),
            ('IFD Testing', '/guides/ifd-testing/'),
        ],
    },
}

# Other nav links shown below the divider
OTHER_NAV = [
    ('Roles', '/roles/'),
    ('Teams', '/teams/'),
    ('Skills', '/skills/'),
    ('Guides', '/guides/'),
    ('Claude Guidance', '/claude-guidance/'),
]

HEADER_NAV = [
    ('Roles', '/roles/'),
    ('Teams', '/teams/'),
    ('Skills', '/skills/'),
    ('Guides', '/guides/'),
    ('Claude Guidance', '/claude-guidance/'),
]


def slugify(filename: str) -> str:
    """Convert a filename (without extension) to a URL slug."""
    return filename.replace('_', '-')


def extract_title(md_path: Path) -> str:
    """Extract the first H1 from a markdown file, falling back to the slug."""
    try:
        text = md_path.read_text(encoding='utf-8')
        for line in text.splitlines():
            line = line.strip()
            if line.startswith('# '):
                return line[2:].strip()
    except OSError:
        pass
    return md_path.stem.replace('-', ' ').replace('_', ' ').title()


def build_header_nav(active_section: str) -> str:
    parts = []
    for label, href in HEADER_NAV:
        section_key = href.strip('/')  # e.g. 'roles', 'skills'
        if section_key == active_section:
            parts.append(f'    <a href="{href}" style="color:var(--accent)">{label}</a>')
        else:
            parts.append(f'    <a href="{href}">{label}</a>')
    return '\n'.join(parts)


def build_sidebar_nav(section_key: str, active_href: str) -> str:
    section = SECTIONS[section_key]
    lines = [f'    <div class="lib-nav-section">']
    lines.append(f'      <span class="lib-nav-section-title">{section["title"]}</span>')
    for label, href in section['section_nav']:
        active_class = ' active' if href == active_href else ''
        lines.append(f'      <a class="lib-nav-link{active_class}" href="{href}">{label}</a>')
    lines.append('    </div>')
    lines.append('    <div class="lib-nav-divider"></div>')
    lines.append('    <div class="lib-nav-section">')
    for label, href in OTHER_NAV:
        # Skip the current section from the "other" list to avoid duplicate
        if href.strip('/') != section_key:
            lines.append(f'      <a class="lib-nav-link" href="{href}">{label}</a>')
    lines.append('    </div>')
    return '\n'.join(lines)


def render_page(section_key: str, slug: str, title: str, md_src: str) -> str:
    active_href = f'/{section_key}/{slug}/'
    sidebar = build_sidebar_nav(section_key, active_href)
    section_title = SECTIONS[section_key]['title']

    return f'''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title} — SGraph Library</title>
  <link rel="stylesheet" href="/_common/css/style.css">
</head>
<body>
<header class="lib-header">
  <a href="/" class="lib-logo"><span>SGraph</span> Library</a>
  <div class="lib-header-spacer"></div>
  <nav class="lib-header-links">
    <a href="/roles/">Roles</a>
    <a href="/teams/">Teams</a>
    <a href="/skills/">Skills</a>
    <a href="/guides/">Guides</a>
    <a href="/claude-guidance/">Claude Guidance</a>
  </nav>
</header>
<div class="lib-layout">
  <aside class="lib-sidebar">
{sidebar}
  </aside>
  <main class="lib-main">
    <div class="lib-doc-meta">
      <a href="/{section_key}/">{section_title}</a>
      <span style="color:var(--border)">›</span>
      <span>{title}</span>
      <a href="{md_src}" style="margin-left:auto;font-size:0.75rem;color:var(--text-dim)">raw ↗</a>
    </div>
    <sg-markdown-viewer src="{md_src}"></sg-markdown-viewer>
  </main>
</div>
<script src="/_common/js/sg-markdown-viewer.js"></script>
</body>
</html>
'''


def generate_section(section_key: str) -> int:
    section_dir = LIBRARY_ROOT / section_key
    if not section_dir.is_dir():
        print(f'  [skip] {section_key}/ not found')
        return 0

    count = 0
    for md_file in sorted(section_dir.glob('*.md')):
        slug = slugify(md_file.stem)
        title = extract_title(md_file)
        md_src = f'/{section_key}/{md_file.name}'

        out_dir = section_dir / slug
        out_dir.mkdir(exist_ok=True)
        out_file = out_dir / 'index.html'

        html = render_page(section_key, slug, title, md_src)
        out_file.write_text(html, encoding='utf-8')
        print(f'  wrote {out_file.relative_to(REPO_ROOT)}')
        count += 1

    return count


def main():
    print('Generating library document pages...')
    total = 0
    for section_key in SECTIONS:
        print(f'\n[{section_key}]')
        total += generate_section(section_key)
    print(f'\nDone. {total} pages written.')


if __name__ == '__main__':
    main()
