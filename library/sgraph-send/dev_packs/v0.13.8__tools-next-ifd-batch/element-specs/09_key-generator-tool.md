# Element Spec: Key Generator Tool Page

**Layer:** Tool (standalone page)
**IFD path:** `tools/v0/v0.1/v0.1.2/en-gb/key-generator/index.html`
**Effort:** Low
**Batch:** 2 (Key Management)
**Dependencies:** `<sg-key-generator>` component (element #7)

---

## What

A standalone tool page at tools.sgraph.ai/key-generator/ that wraps the `<sg-key-generator>` component. A thin HTML page that imports the component and provides context.

## Why

- **Marketing tool:** People visit to play with key generation, see entropy visualisation, learn about encryption keys. Some become SG/Send users.
- **Educational:** Explains how friendly keys work, what PBKDF2 does, why the key format is secure enough.
- **Reference:** Links to SG/Send for actually using the keys.

From the UX Components brief: "This component should also exist at tools.sgraph.ai/key-generator/ as a standalone page."

## UI Layout

```
┌─────────────────────────────────────────────────┐
│  SG/Tools / Key Generator                        │
├─────────────────────────────────────────────────┤
│                                                  │
│  Create a friendly encryption key                │
│                                                  │
│  Instead of random strings like "Xk9mP2vR7w",   │
│  create keys you can actually remember and share │
│  over the phone.                                 │
│                                                  │
│  ┌─────────────────────────────────────────┐    │
│  │                                         │    │
│  │  <sg-key-generator show-geek-mode>      │    │
│  │                                         │    │
│  └─────────────────────────────────────────┘    │
│                                                  │
│  ── How It Works ──                              │
│                                                  │
│  1. Pick two words (or let us choose)            │
│  2. A short suffix is added for extra security   │
│  3. Your words are turned into a 256-bit key     │
│     using PBKDF2 (600,000 iterations)            │
│  4. The resulting key is identical in strength    │
│     to a random AES-256 key                      │
│                                                  │
│  ── Use with SG/Send ──                          │
│                                                  │
│  Send encrypted files with a key your recipient  │
│  can type from memory:                           │
│                                                  │
│  "The key is apple mango 56"                     │
│                                                  │
│  [Try SG/Send →]                                 │
│                                                  │
├─────────────────────────────────────────────────┤
│  All processing happens in your browser.         │
│  No keys are sent to any server.                 │
└─────────────────────────────────────────────────┘
```

## Implementation

This is a thin page — the component does all the work:

```html
<main class="tool-main">
    <h1 data-i18n="tool_keygen_title">Key Generator</h1>
    <p data-i18n="tool_keygen_intro">Create a friendly encryption key...</p>

    <sg-key-generator
        locale="en-gb"
        show-geek-mode
        word-count="2"
        suffix-length="2">
    </sg-key-generator>

    <section class="how-it-works">
        <h2 data-i18n="tool_keygen_how_title">How It Works</h2>
        <!-- Explanation content -->
    </section>

    <section class="use-with-send">
        <h2 data-i18n="tool_keygen_send_title">Use with SG/Send</h2>
        <p>...</p>
        <a href="https://send.sgraph.ai" class="cta-button"
           data-i18n="tool_keygen_send_cta">Try SG/Send →</a>
    </section>
</main>

<script type="module" src="/components/key-generator/v1/v1.0/v1.0.0/sg-key-generator.js"></script>
```

## i18n Keys

```json
{
  "tool_keygen_title": "Key Generator",
  "tool_keygen_desc": "Create friendly encryption keys you can remember and share",
  "tool_keygen_intro": "Instead of random strings like \"Xk9mP2vR7w\", create keys you can actually remember and share over the phone.",
  "tool_keygen_how_title": "How It Works",
  "tool_keygen_how_step1": "Pick two words (or let us choose)",
  "tool_keygen_how_step2": "A short suffix is added for extra security",
  "tool_keygen_how_step3": "Your words are turned into a 256-bit key using PBKDF2 (600,000 iterations)",
  "tool_keygen_how_step4": "The resulting key is identical in strength to a random AES-256 key",
  "tool_keygen_send_title": "Use with SG/Send",
  "tool_keygen_send_body": "Send encrypted files with a key your recipient can type from memory.",
  "tool_keygen_send_cta": "Try SG/Send →",
  "tool_keygen_privacy": "All processing happens in your browser. No keys are sent to any server."
}
```

## Landing Page Card

```html
<div class="tool-card">
    <h3>Key Generator</h3>
    <p>Create friendly encryption keys like "apple-mango-56" instead of random strings. See how secure your key is.</p>
    <a href="key-generator/">Open Tool →</a>
</div>
```

## Acceptance Criteria

- [ ] Page loads with `<sg-key-generator>` component working
- [ ] Geek mode is expanded by default (standalone context)
- [ ] "How It Works" section explains the PBKDF2 derivation
- [ ] "Use with SG/Send" section links to send.sgraph.ai
- [ ] Uses shared header/footer/locale-picker
- [ ] Tool card on landing page
- [ ] i18n keys in all 5 locale files
- [ ] Privacy footer present
- [ ] No server calls

## Source Brief

UX Components brief (`v0.13.5__dev-brief__ux-components-qa-cross-team.md`), Part 1, Component 2 — "This component should also exist at tools.sgraph.ai/key-generator/ as a standalone page."
