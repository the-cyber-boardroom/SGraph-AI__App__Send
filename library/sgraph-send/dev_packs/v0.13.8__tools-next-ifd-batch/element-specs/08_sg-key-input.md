# Element Spec: `<sg-key-input>` (Key Entry / Retrieval)

**Layer:** Component
**IFD path:** `components/key-input/v1/v1.0/v1.0.0/`
**Effort:** Low-Medium
**Batch:** 2 (Key Management)
**Tag name:** `sg-key-input`
**Dependencies:** sg-pbkdf2.js, sg-wordlist.js (from Batch 1)

---

## What

A focused input component for typing a friendly key to retrieve/decrypt a file. Designed for mobile keyboards. Auto-complete from word lists, whitespace/dash tolerance, paste URL detection.

## Why

With friendly keys, the mobile app becomes a retrieval tool. Someone sends a key via WhatsApp: "apple mango 56". The user opens SG/Send, types three words, taps Open. This component reframes the product from "a website where you upload files" to "an app where you send and receive encrypted files."

## Files to Create

```
components/key-input/v1/v1.0/v1.0.0/
  sg-key-input.js
  sg-key-input.html
  sg-key-input.css
  manifest.json
```

## UI Layout

```
Mobile:
┌─────────────────────────────────┐
│                                 │
│  Enter your key to open the file│
│                                 │
│  ┌─────────────────────────┐    │
│  │ apple-mango-56          │    │
│  └─────────────────────────┘    │
│                                 │
│  ┌───────────────────────┐      │
│  │ apple  apply  approve │      │  ← auto-complete
│  └───────────────────────┘      │
│                                 │
│  [Open File]                    │
│                                 │
└─────────────────────────────────┘
```

## API Contract

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `locale` | string | `en-gb` | Language for auto-complete |
| `placeholder` | string | `apple-mango-56` | Placeholder text |
| `auto-submit` | boolean | `false` | Auto-submit when valid key pattern detected |
| `button-text` | string | `Open File` | Submit button label |
| `show-validation` | boolean | `true` | Show format validation feedback |

| Event | Detail | When |
|-------|--------|------|
| `key-submitted` | `{ key: string, normalised: string, derivedKey: CryptoKey }` | User submits (Enter or button) |
| `key-changed` | `{ key: string, normalised: string, isValid: boolean }` | Input text changes |

## Input Processing

### Normalisation

All of these inputs should resolve to the same normalised key `apple-mango-56`:

| User types | Normalised |
|-----------|------------|
| `apple-mango-56` | `apple-mango-56` |
| `apple mango 56` | `apple-mango-56` |
| `Apple Mango 56` | `apple-mango-56` |
| `APPLE MANGO 56` | `apple-mango-56` |
| `apple  mango  56` | `apple-mango-56` (extra spaces) |
| `applemango56` | Attempt word boundary detection |

### Paste URL Detection

If the user pastes a full URL, extract the key portion:

```
https://send.sgraph.ai/r/abc123#apple-mango-56
                                ^^^^^^^^^^^^^^^^ extract this

https://send.sgraph.ai/receive?id=abc123&key=apple-mango-56
                                              ^^^^^^^^^^^^^^^^ extract this
```

Detection: if input starts with `http://` or `https://`, look for `#` fragment or `key=` parameter.

### Token Sanitisation

From the customer feedback pack (v0.11.25) — users had issues with invisible characters from WhatsApp copy-paste:

- Trim leading/trailing whitespace
- Strip zero-width spaces (`\u200B`, `\u200C`, `\u200D`, `\uFEFF`)
- Strip smart quotes (`\u201C`, `\u201D`, `\u2018`, `\u2019`) → regular quotes (then strip quotes)
- Strip en-dash (`\u2013`) / em-dash (`\u2014`) → regular hyphen
- Collapse multiple hyphens/spaces to single

```javascript
function sanitiseInput(raw) {
    return raw
        .replace(/[\u200B\u200C\u200D\uFEFF]/g, '')        // zero-width
        .replace(/[\u201C\u201D\u2018\u2019]/g, '')         // smart quotes
        .replace(/[\u2013\u2014]/g, '-')                     // en/em dash
        .replace(/\s+/g, ' ')                                // collapse spaces
        .replace(/-+/g, '-')                                 // collapse hyphens
        .trim()
        .toLowerCase()
}
```

### Auto-Complete

As the user types, show word suggestions from the word list:

- Trigger after 2+ characters typed
- Show up to 5 matches
- Tab or tap to accept suggestion
- Suggestions appear as a dropdown below the input
- Use `searchWords()` from sg-wordlist.js

### Visual Feedback

- Neutral border: no key entered yet
- Green border: valid key format detected (word-word-number pattern)
- Red border: only after submit attempt with invalid format

**Do NOT show red while typing** — it's annoying on mobile.

## i18n Keys

```json
{
  "component_keyinput_prompt": "Enter your key to open the file",
  "component_keyinput_placeholder": "apple-mango-56",
  "component_keyinput_submit": "Open File",
  "component_keyinput_invalid": "Key format not recognised",
  "component_keyinput_pasted_url": "Key extracted from URL"
}
```

## Mobile Considerations

- Large touch target for the input (min 44px height)
- Large submit button (full width on mobile)
- Auto-complete dropdown with large tap targets (min 44px per suggestion)
- `inputmode="text"` on the input (not `search` — we want the regular keyboard)
- `autocapitalize="none"` to avoid capitalisation
- `autocorrect="off"` to prevent auto-correct mangling the key
- `spellcheck="false"` to prevent spell-check underlines

## Acceptance Criteria

- [ ] Typing "apple mango 56" normalises to "apple-mango-56"
- [ ] Typing "Apple-Mango-56" normalises to "apple-mango-56"
- [ ] Pasting a full URL extracts the key portion
- [ ] Smart quotes and zero-width spaces are stripped
- [ ] Auto-complete shows word suggestions after 2+ characters
- [ ] Tab/tap accepts auto-complete suggestion
- [ ] Submit emits `key-submitted` with normalised key + derived CryptoKey
- [ ] Green border on valid key format
- [ ] No red border while typing (only after failed submit)
- [ ] Works well on mobile (large touch targets, correct input attributes)
- [ ] Extends SgComponent, uses Shadow DOM
- [ ] manifest.json created
- [ ] i18n keys in all 5 locale files

## Source Brief

UX Components brief (`v0.13.5__dev-brief__ux-components-qa-cross-team.md`), Part 1, Component 3: `<sg-key-input>`.
