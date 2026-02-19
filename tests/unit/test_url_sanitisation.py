# ===============================================================================
# SGraph Send — URL Sanitisation Security Tests
# Regression tests: shareable URLs must never contain access tokens or secrets
# Added after incident 19 Feb 2026 (access token leak in shareable links)
# ===============================================================================

import re
from pathlib  import Path
from unittest import TestCase

UI_USER_DIR = Path(__file__).parent.parent.parent / 'sgraph_ai_app_send__ui__user'

# Patterns that must NEVER appear in URL-building code
FORBIDDEN_URL_PATTERNS = [
    re.compile(r'\?token='),                               # Token as query parameter
    re.compile(r'&token='),                                # Token appended to query string
    re.compile(r'access_token='),                          # Access token in URL
    re.compile(r'tokenParam.*\?token'),                    # Token parameter construction
]


class test_url_sanitisation(TestCase):
    """Static analysis: scan all send-upload JS files for token leaks in URLs"""

    def test__upload_js__no_token_in_url_builders(self):
        """No version of send-upload.js should embed tokens in shareable URLs"""
        upload_files = list(UI_USER_DIR.glob('**/send-upload/send-upload.js'))
        assert len(upload_files) > 0, f'No send-upload.js files found under {UI_USER_DIR}'

        violations = []
        for filepath in upload_files:
            content = filepath.read_text()
            for pattern in FORBIDDEN_URL_PATTERNS:
                matches = pattern.findall(content)
                if matches:
                    violations.append(f'{filepath.relative_to(UI_USER_DIR)}: found "{matches[0]}"')

        assert violations == [], (
            'SECURITY: Token/secret patterns found in shareable URL code:\n'
            + '\n'.join(f'  - {v}' for v in violations)
        )

    def test__upload_js__build_url_functions_have_no_token_param(self):
        """buildCombinedUrl and buildLinkOnlyUrl must not accept a token argument"""
        upload_files = list(UI_USER_DIR.glob('**/send-upload/send-upload.js'))

        violations = []
        for filepath in upload_files:
            content = filepath.read_text()
            # Match function signatures that include 'token' parameter
            if re.search(r'buildCombinedUrl\s*\([^)]*token[^)]*\)', content):
                violations.append(f'{filepath.relative_to(UI_USER_DIR)}: buildCombinedUrl accepts token param')
            if re.search(r'buildLinkOnlyUrl\s*\([^)]*token[^)]*\)', content):
                violations.append(f'{filepath.relative_to(UI_USER_DIR)}: buildLinkOnlyUrl accepts token param')

        assert violations == [], (
            'SECURITY: URL builder functions still accept token parameter:\n'
            + '\n'.join(f'  - {v}' for v in violations)
        )

    def test__download_html__no_token_in_query_string(self):
        """Download pages should not construct URLs with tokens in query strings"""
        download_files = list(UI_USER_DIR.glob('**/send-download/send-download.js'))
        assert len(download_files) > 0

        # The download side may READ ?token= from the URL (for backwards compat with
        # already-shared links), but must never CONSTRUCT new URLs with tokens
        violations = []
        for filepath in download_files:
            content = filepath.read_text()
            # Look for URL construction with token (not just reading from URL)
            if re.search(r'`[^`]*\?token=\$\{', content):
                violations.append(f'{filepath.relative_to(UI_USER_DIR)}: constructs URL with token')

        assert violations == [], (
            'SECURITY: Download JS constructs URLs with embedded tokens:\n'
            + '\n'.join(f'  - {v}' for v in violations)
        )
