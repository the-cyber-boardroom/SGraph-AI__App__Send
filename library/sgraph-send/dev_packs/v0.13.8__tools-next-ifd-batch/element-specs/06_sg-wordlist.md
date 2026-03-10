# Element Spec: sg-wordlist.js (Word Lists)

**Layer:** Core
**IFD path:** `core/wordlist/v1/v1.0/v1.0.0/`
**Effort:** Low
**Batch:** 1 (Foundation)
**Dependencies:** None

---

## What

A core module providing word lists for friendly key generation. Ships with an en-gb word list (~2000 common English words). Other locales added later via the i18n pipeline.

## Why

The friendly key system needs a curated word list for random word selection and auto-complete suggestions. Words must be common, easy to spell, easy to communicate verbally ("I'll send you the key: apple mango 56"), and free of ambiguity.

## Files to Create

```
core/wordlist/v1/v1.0/v1.0.0/
  sg-wordlist.js          ← Module with load/random functions
  wordlists/
    en-gb.json            ← ~2000 common English words
  manifest.json
```

## API

```javascript
/**
 * Load word list for a locale. Caches after first load.
 * @param {string} [locale='en-gb'] - Locale code
 * @returns {Promise<string[]>} Array of words (lowercase, sorted)
 */
export async function getWordList(locale = 'en-gb')

/**
 * Get N random words from the word list.
 * Uses crypto.getRandomValues() for unbiased selection.
 * @param {number} [count=2] - Number of words
 * @param {string} [locale='en-gb'] - Locale code
 * @returns {Promise<string[]>} Array of random words
 */
export async function getRandomWords(count = 2, locale = 'en-gb')

/**
 * Search word list for auto-complete matches.
 * @param {string} prefix - Partial word typed by user
 * @param {string} [locale='en-gb'] - Locale code
 * @param {number} [maxResults=10] - Max suggestions
 * @returns {Promise<string[]>} Matching words
 */
export async function searchWords(prefix, locale = 'en-gb', maxResults = 10)

/** Locales with word lists available */
export const SUPPORTED_LOCALES = ['en-gb']
```

## Word List Criteria

The en-gb.json word list should contain ~2000 words that are:

1. **Common** — words most English speakers know (aim for top 3000 frequency)
2. **Short** — 3-8 characters preferred (easier to type on mobile)
3. **Distinct** — no homophones (their/there), no easily confused pairs (affect/effect)
4. **Speakable** — easy to say over the phone ("apple" yes, "aisle" no)
5. **Inoffensive** — no profanity, slurs, or potentially offensive words
6. **Lowercase** — stored and returned in lowercase
7. **Sorted** — alphabetically sorted for binary search and display

### Word Categories to Include

- Common nouns: apple, bridge, cloud, dragon, eagle, forest, garden...
- Common adjectives: brave, calm, dark, fast, green, happy, loud...
- Common verbs: build, catch, dance, find, grow, jump, learn...
- Colours: blue, coral, gold, green, ivory, jade, navy...
- Animals: bear, cat, deer, eagle, fox, hawk, lion...
- Nature: beach, cave, dawn, field, hill, lake, moon...

### Words to Exclude

- Words shorter than 3 characters
- Words longer than 10 characters
- Technical jargon
- Proper nouns
- Words with apostrophes or hyphens
- Numbers as words (one, two, three)

## Implementation Notes

### Random Word Selection

Use `crypto.getRandomValues()` for unbiased random selection:

```javascript
function secureRandomIndex(max) {
    const array = new Uint32Array(1)
    crypto.getRandomValues(array)
    return array[0] % max
}
```

### Caching

Word lists are loaded once per locale and cached in a module-level Map. No localStorage — in-memory only.

```javascript
const cache = new Map()

export async function getWordList(locale = 'en-gb') {
    if (cache.has(locale)) return cache.get(locale)
    const url = new URL(`wordlists/${locale}.json`, import.meta.url)
    const words = await fetch(url).then(r => r.json())
    cache.set(locale, words)
    return words
}
```

### Auto-Complete (searchWords)

Simple prefix match with binary search for performance:

```javascript
export async function searchWords(prefix, locale = 'en-gb', maxResults = 10) {
    const words = await getWordList(locale)
    const lower = prefix.toLowerCase()
    return words.filter(w => w.startsWith(lower)).slice(0, maxResults)
}
```

## Future Locales

Additional word lists will be added as separate JSON files:
- `pt-pt.json` — Portuguese
- `fr-fr.json` — French
- `de-de.json` — German
- `es-es.json` — Spanish

Each locale gets ~2000 words following the same criteria. The `SUPPORTED_LOCALES` array is updated as new lists are added.

## Acceptance Criteria

- [ ] `getWordList('en-gb')` returns ~2000 words
- [ ] All words are lowercase, 3-10 characters, sorted
- [ ] `getRandomWords(2)` returns 2 different random words
- [ ] Random selection uses `crypto.getRandomValues()` (not `Math.random()`)
- [ ] `searchWords('app')` returns words starting with "app" (e.g. ["apple", "apply"])
- [ ] Word list is cached after first load (no duplicate fetches)
- [ ] No offensive or ambiguous words
- [ ] manifest.json created
- [ ] JSDoc on all exports
