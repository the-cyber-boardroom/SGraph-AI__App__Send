#!/usr/bin/env python3
"""
generate_library_index.py — builds index.json and catalogue.csv for
the SGraph library website (sgraph_ai_app_send__library/).

Run from the repo root:
    python3 scripts/generate_library_index.py

Outputs:
    sgraph_ai_app_send__library/index.json
    sgraph_ai_app_send__library/catalogue.csv
"""
import csv
import json
import re
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent
LIBRARY_ROOT = REPO_ROOT / 'sgraph_ai_app_send__library'

SECTIONS = ['roles', 'skills', 'guides']


def extract_title(md_path: Path) -> str:
    try:
        for line in md_path.read_text(encoding='utf-8').splitlines():
            line = line.strip()
            if line.startswith('# '):
                return line[2:].strip()
    except OSError:
        pass
    return md_path.stem.replace('-', ' ').replace('_', ' ').title()


def extract_description(md_path: Path) -> str:
    """Return the first non-empty, non-heading paragraph line."""
    try:
        lines = md_path.read_text(encoding='utf-8').splitlines()
        found_h1 = False
        for line in lines:
            stripped = line.strip()
            if not found_h1 and stripped.startswith('# '):
                found_h1 = True
                continue
            if not stripped or stripped.startswith('#') or stripped.startswith('---') or stripped.startswith('|'):
                continue
            # Strip markdown formatting
            text = re.sub(r'\*\*(.+?)\*\*', r'\1', stripped)
            text = re.sub(r'\*(.+?)\*', r'\1', text)
            text = re.sub(r'`(.+?)`', r'\1', text)
            if len(text) > 20:
                return text[:200]
    except OSError:
        pass
    return ''


def build_index() -> dict:
    index = {
        'generated': datetime.now(timezone.utc).isoformat(),
        'sections': {}
    }
    for section in SECTIONS:
        section_dir = LIBRARY_ROOT / section
        if not section_dir.is_dir():
            continue
        docs = []
        for md_file in sorted(section_dir.glob('*.md')):
            slug = md_file.stem.replace('_', '-')
            docs.append({
                'slug': slug,
                'title': extract_title(md_file),
                'description': extract_description(md_file),
                'url': f'/{section}/{slug}/',
                'raw': f'/{section}/{md_file.name}',
            })
        index['sections'][section] = docs
    return index


def build_catalogue(index: dict) -> list[dict]:
    rows = []
    for section, docs in index['sections'].items():
        for doc in docs:
            rows.append({
                'section': section,
                'slug': doc['slug'],
                'title': doc['title'],
                'url': doc['url'],
                'raw': doc['raw'],
            })
    return rows


def main():
    print('Generating library indexes...')

    index = build_index()

    # Write index.json
    out_json = LIBRARY_ROOT / 'index.json'
    out_json.write_text(json.dumps(index, indent=2, ensure_ascii=False), encoding='utf-8')
    print(f'  wrote {out_json.relative_to(REPO_ROOT)}')

    # Write catalogue.csv
    rows = build_catalogue(index)
    out_csv = LIBRARY_ROOT / 'catalogue.csv'
    with out_csv.open('w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=['section', 'slug', 'title', 'url', 'raw'])
        writer.writeheader()
        writer.writerows(rows)
    print(f'  wrote {out_csv.relative_to(REPO_ROOT)}')

    total = sum(len(v) for v in index['sections'].values())
    print(f'\nDone. {total} documents indexed.')


if __name__ == '__main__':
    main()
