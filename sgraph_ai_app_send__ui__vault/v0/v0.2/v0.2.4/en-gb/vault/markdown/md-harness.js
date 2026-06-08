/* ═══════════════════════════════════════════════════════════════════════════════
   SGraph — Markdown Harness
   Automated tests + live playground for the refactored markdown lib.
   ═══════════════════════════════════════════════════════════════════════════════ */

// ── Test helpers ─────────────────────────────────────────────────────────────

function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function _pass(name)  { return { name, ok: true }; }
function _fail(name, msg) { return { name, ok: false, msg }; }

function assertContains(name, input, fragment, opts = {}) {
    const html = MarkdownParser.parse(input);
    if (!html.includes(fragment)) {
        return _fail(name, `Expected HTML to contain:\n  ${esc(fragment)}\nGot:\n  ${esc(html)}`);
    }
    if (opts.notContains && html.includes(opts.notContains)) {
        return _fail(name, `HTML should NOT contain:\n  ${esc(opts.notContains)}\nGot:\n  ${esc(html)}`);
    }
    return _pass(name);
}

function assertNotContains(name, input, fragment) {
    const html = MarkdownParser.parse(input);
    if (html.includes(fragment)) {
        return _fail(name, `Expected HTML NOT to contain:\n  ${esc(fragment)}\nGot:\n  ${esc(html)}`);
}
    return _pass(name);
}

function assertEqual(name, actual, expected) {
    if (actual !== expected) {
        return _fail(name, `Expected:\n  ${esc(expected)}\nGot:\n  ${esc(actual)}`);
    }
    return _pass(name);
}

// ── Test suite ────────────────────────────────────────────────────────────────

const TESTS = [

    // ── Headings ────────────────────────────────────────────────────────────
    () => assertContains('Heading h1', '# Hello', '<h1>Hello</h1>'),
    () => assertContains('Heading h3', '### Section', '<h3>Section</h3>'),
    () => assertContains('Heading h6', '###### Deep', '<h6>Deep</h6>'),

    // ── Paragraphs ──────────────────────────────────────────────────────────
    () => assertContains('Simple paragraph', 'Hello world', '<p>Hello world</p>'),
    () => assertContains('Multi-line paragraph joins with <br>',
        'Line one\nLine two', '<br>'),

    // ── Horizontal rule ─────────────────────────────────────────────────────
    () => assertContains('HR from ---', '---', '<hr>'),
    () => assertContains('HR from ***', '***', '<hr>'),

    // ── Bold / italic / strikethrough ────────────────────────────────────────
    () => assertContains('Bold **text**', '**bold**', '<strong>bold</strong>'),
    () => assertContains('Italic *text*', '*italic*', '<em>italic</em>'),
    () => assertContains('Bold+italic ***text***', '***bi***', '<strong><em>bi</em></strong>'),
    () => assertContains('Strikethrough ~~text~~', '~~del~~', '<del>del</del>'),
    () => assertContains('Bold __text__', '__bold2__', '<strong>bold2</strong>'),

    // ── Inline code ─────────────────────────────────────────────────────────
    () => assertContains('Inline code', 'Use `var x = 1`', '<code>var x = 1</code>'),

    // ── Blockquote ──────────────────────────────────────────────────────────
    () => assertContains('Blockquote', '> quoted text', '<blockquote>'),

    // ── Code block ──────────────────────────────────────────────────────────
    () => assertContains('Code block (no lang)', '```\nfoo\n```', '<pre><code>foo</code></pre>'),
    () => assertContains('Code block with lang attr', '```js\nvar x\n```', 'data-lang="js"'),
    () => assertContains('Code block escapes HTML', '```\n<script>\n```', '&lt;script&gt;'),

    // ── Unordered list — single line ─────────────────────────────────────────
    () => assertContains('UL single line', '- alpha\n- beta', '<ul>'),
    () => assertContains('UL items', '- alpha\n- beta', '<li>alpha</li>'),

    // ── Ordered list — single line ───────────────────────────────────────────
    () => assertContains('OL single line', '1. first\n2. second', '<ol>'),
    () => assertContains('OL items', '1. first\n2. second', '<li>first</li>'),

    // ── THE BUG FIX: list continuation ──────────────────────────────────────
    () => assertContains(
        'UL continuation — second line stays in <li>',
        '- Item one\n  that continues here\n- Item two',
        '<li>Item one<br>that continues here</li>',
        { notContains: '<p>that continues here</p>' }
    ),
    () => assertContains(
        'OL continuation — second line stays in <li>',
        '1. First item\n   this is still item 1\n2. Second item',
        '<li>First item<br>this is still item 1</li>',
        { notContains: '<p>this is still item 1</p>' }
    ),
    () => assertContains(
        'OL continuation — three continuation lines',
        '1. Long item\n   line 2\n   line 3\n2. Next',
        '<li>Long item<br>line 2<br>line 3</li>'
    ),
    () => assertNotContains(
        'OL continuation — blank line stops continuation',
        '1. Item one\n\n   not continuation\n2. Item two',
        '<li>Item one<br>not continuation</li>'
    ),

    // ── Tables ──────────────────────────────────────────────────────────────
    () => assertContains('Table renders', '| A | B |\n|---|---|\n| 1 | 2 |', '<table>'),
    () => assertContains('Table headers', '| A | B |\n|---|---|\n| 1 | 2 |', '<th'),
    () => assertContains('Table right-align', '| N |\n|--:|\n| 1 |', 'text-align:right'),
    () => assertContains('Table center-align', '| N |\n|:-:|\n| 1 |', 'text-align:center'),

    // ── Links ───────────────────────────────────────────────────────────────
    () => assertContains('Absolute link', '[Visit](https://example.com)',
        'href="https://example.com"'),
    () => assertContains('Relative link (BRW-008)', '[Doc](guide.md)',
        'href="guide.md"'),
    () => assertContains('Fragment link', '[top](#top)', 'href="#top"'),
    () => assertNotContains('javascript: link blocked', '[bad](javascript:alert(1))', 'href="javascript'),
    () => assertNotContains('data: link blocked', '[bad](data:text/html,x)', 'href="data:'),

    // ── Images (BRW-007 / BRW-018 / BRW-020) ────────────────────────────────
    () => assertContains('Image renders as <img>', '![alt](photo.png)', '<img '),
    () => assertContains('Image uses data-md-src (BRW-020)', '![alt](photo.png)',
        'data-md-src="photo.png"'),
    () => assertContains('Image has alt text', '![My photo](photo.png)', 'alt="My photo"'),
    () => assertContains('Discourse width px (BRW-018)', '![alt|400](img.png)',
        'width:400px'),
    () => assertContains('Discourse width pct (BRW-018)', '![alt|50%](img.png)',
        'width:50%'),
    () => assertContains('Discourse wxh (BRW-018)', '![alt|300x200](img.png)',
        'width:300px;height:200px'),
    () => assertContains('javascript: image blocked', '![x](javascript:alert(1))',
        '[image: x]'),

    // ── BRW-021: code span protects ![  ─────────────────────────────────────
    () => assertContains(
        'BRW-021: ![alt](url) inside backtick → code, not image',
        '`![alt](url)`',
        '<code>![alt](url)</code>'
    ),
    () => assertNotContains(
        'BRW-021: backtick code span does not produce <img>',
        '`![alt](url)`',
        '<img '
    ),

    // ── Escaping ─────────────────────────────────────────────────────────────
    () => assertContains('HTML entities escaped in text', '<b>raw</b>', '&lt;b&gt;raw&lt;/b&gt;'),
    () => assertContains('Ampersand escaped', 'a & b', 'a &amp; b'),

    // ── MarkdownRenderer API ─────────────────────────────────────────────────
    () => {
        const div = document.createElement('div');
        const bytes = new TextEncoder().encode('# Hello\n\nParagraph');
        const view = MarkdownRenderer.mount(div, bytes);
        const src = view.getSource();
        view.unmount();
        return assertEqual('MarkdownRenderer.getSource() returns original markdown',
            src, '# Hello\n\nParagraph');
    },
    () => {
        const div = document.createElement('div');
        const view = MarkdownRenderer.mount(div, new TextEncoder().encode('# v1'));
        view.refresh(new TextEncoder().encode('# v2'));
        const hasV2 = div.innerHTML.includes('v2');
        view.unmount();
        return hasV2 ? _pass('MarkdownRenderer.refresh() updates rendered output')
                     : _fail('MarkdownRenderer.refresh() updates rendered output', 'v2 not found after refresh');
    },
    () => {
        const div = document.createElement('div');
        const view = MarkdownRenderer.mount(div, new TextEncoder().encode('# Test'));
        const before = view.isSourceVisible();
        view.toggleSource();
        const after = view.isSourceVisible();
        view.unmount();
        if (before !== false) return _fail('MarkdownRenderer.toggleSource() — initial state', 'expected false');
        if (after !== true)   return _fail('MarkdownRenderer.toggleSource() — after toggle', 'expected true');
        return _pass('MarkdownRenderer.toggleSource() works');
    },
    () => {
        const div = document.createElement('div');
        const view = MarkdownRenderer.mount(div, new TextEncoder().encode('# Test'));
        view.unmount();
        return div.children.length === 0
            ? _pass('MarkdownRenderer.unmount() removes DOM')
            : _fail('MarkdownRenderer.unmount() removes DOM', 'children remain: ' + div.children.length);
    },
    () => {
        // getSource() still correct after refresh()
        const div = document.createElement('div');
        const view = MarkdownRenderer.mount(div, new TextEncoder().encode('original'));
        view.refresh(new TextEncoder().encode('updated'));
        const src = view.getSource();
        view.unmount();
        return assertEqual('getSource() returns refreshed source', src, 'updated');
    },
];

// ── Runner ────────────────────────────────────────────────────────────────────

function runTests() {
    const results = TESTS.map(fn => {
        try {
            return fn();
        } catch (e) {
            return _fail('(exception)', e.message);
        }
    });
    const passed = results.filter(r => r.ok).length;
    const failed = results.filter(r => !r.ok).length;
    return { results, passed, failed, total: results.length };
}

// ── Render test results into DOM ──────────────────────────────────────────────

function renderResults(container, suite) {
    const { results, passed, failed, total } = suite;

    const summary = document.createElement('div');
    summary.className = 'mh-summary ' + (failed ? 'mh-summary--fail' : 'mh-summary--pass');
    summary.innerHTML = failed
        ? `<strong>${failed} failed</strong> / ${total} tests`
        : `<strong>All ${total} tests passed</strong>`;
    container.appendChild(summary);

    results.forEach((r, idx) => {
        const row = document.createElement('div');
        row.className = 'mh-test ' + (r.ok ? 'mh-test--pass' : 'mh-test--fail');
        row.innerHTML = `<span class="mh-icon">${r.ok ? '✓' : '✗'}</span>
            <span class="mh-name">${esc(r.name)}</span>`;

        if (!r.ok && r.msg) {
            const detail = document.createElement('pre');
            detail.className = 'mh-detail';
            detail.textContent = r.msg;
            row.appendChild(detail);
        }
        container.appendChild(row);
    });
}

// ── Live playground ───────────────────────────────────────────────────────────

const PLAYGROUND_DEFAULT = `# Markdown Playground

A paragraph with **bold**, *italic*, ~~strikethrough~~, and \`inline code\`.

## List with continuation

1. First item that has a longer description
   which continues on the next line
2. Second item — plain single line
3. Third item
   multi-line
   across three lines

## Unordered list with continuation

- Alpha item
  that continues
- Beta item

## Table

| Feature        | Status  | Notes            |
|:---------------|:-------:|:-----------------|
| Headings       | ✓       | h1–h6            |
| Lists          | ✓       | with continuation|
| Tables         | ✓       | alignment ok     |

## Code block

\`\`\`js
function greet(name) {
    return \`Hello, \${name}!\`;
}
\`\`\`

## Image (uses data-md-src)

![A photo|400](demo-photo.png)

## Links

[Relative link](other-file.md) — [Absolute](https://example.com)

> Blockquote: *important* message here.

---

End of demo.
`;

function initPlayground(textarea, outputEl, sourceBtn, refreshBtn) {
    let currentView = null;

    function render() {
        if (currentView) currentView.unmount();
        const bytes = new TextEncoder().encode(textarea.value);
        currentView = MarkdownRenderer.mount(outputEl, bytes);
    }

    textarea.addEventListener('input', render);

    sourceBtn.addEventListener('click', () => {
        if (!currentView) return;
        const visible = currentView.toggleSource();
        sourceBtn.textContent = visible ? 'Rendered' : 'Source';
    });

    refreshBtn.addEventListener('click', render);

    textarea.value = PLAYGROUND_DEFAULT;
    render();
}
