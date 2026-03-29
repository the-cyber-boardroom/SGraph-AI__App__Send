# Tools Repo Strategy — sgraph.ai Website Redesign
**v0.18.2 | 27 March 2026**
**Phase 3: Development | Source: Developer review — Tools Repo Integration Strategy**

Full detail: `team/roles/dev/reviews/03/27/v0.18.2__dev-review__tools-repo-integration-strategy.md`

---

## The Principle

> "We should only have ONE place where shared code exists."

The `SGraph-AI__Tools` repo is the canonical source for shared Web Components, client-side tools, and the Aurora design tokens. The sgraph.ai redesign is the right moment to establish what lives where — changes made now propagate to all current and future SGraph properties.

---

## What `tools.sgraph.ai` Currently Offers

| Tool | Description |
|------|-------------|
| SSH Key Generator | Generate Ed25519 SSH key pairs entirely in browser |
| File Hasher | SHA-256/SHA-1/SHA-512 hash of any file, no upload |
| File Encryptor | AES-256-GCM encrypt/decrypt — same crypto as SG/Send |
| Key Generator | Create friendly keys like `apple-mango-56`, with entropy visualisation |
| Vault Browser | Open and browse SG/Send vaults in browser, derive keys, decrypt files |
| Vault (Pyodide) | Python vault crypto in browser via Pyodide (experimental) |
| Python REPL | Interactive Python console via Pyodide (experimental) |
| SG/Send CLI | Run sg-send-cli vault operations in browser via WebAssembly (experimental) |

**These tools are a credibility asset.** File Encryptor, Key Generator, and Vault Browser directly prove SG/Send's zero-knowledge architecture. They are interactive security education.

---

## Ownership Model

### sgraph.ai is MASTER for:
| Asset | Location in this repo |
|-------|----------------------|
| Site header / top banner | `sgraph_ai__website/_common/components/sg-site-header.js` |
| Site footer / bottom banner | `sgraph_ai__website/_common/components/sg-site-footer.js` |
| Design tokens | `sgraph_ai__website/_common/css/design-tokens.css` |
| Locale picker | `sgraph_ai__website/_common/components/sg-locale-picker.js` |

Build here first → publish to `__Tools` → all other SGraph properties consume via `static.sgraph.ai`.

### `__Tools` repo is MASTER for:
| Asset |
|-------|
| Client-side tools (File Encryptor, Key Generator, etc.) |
| `<sg-public-viewer>` Web Component |
| Pyodide / WASM integrations |
| Shared utility functions |

---

## Web Component Inventory

| Component | Home repo | IFD path | Status |
|-----------|-----------|---------|--------|
| `<sg-site-header>` | **this repo** → publish to __Tools | `v0/v0.1/v0.1.0/sg-site-header.js` | Build in redesign |
| `<sg-site-footer>` | **this repo** → publish to __Tools | `v0/v0.1/v0.1.0/sg-site-footer.js` | Build in redesign |
| `<sg-locale-picker>` | **this repo** → publish to __Tools | `v0/v0.1/v0.1.0/sg-locale-picker.js` | Extract from existing JS |
| `<sg-public-viewer>` | __Tools → consume here | via `static.sgraph.ai` | Build in __Tools, consume here |
| `<sg-feature-card>` | this repo | local only | Build in redesign |
| `<sg-share-mode-card>` | this repo | local only | Build in redesign |
| `<sg-privacy-policy>` | this repo | local only | Build in redesign |
| `<sg-how-it-works>` | this repo | local only | Build in redesign |

---

## IFD Versioning for Components

All components follow: `v{major}/v{major}.{minor}/v{major}.{minor}.{patch}/component.js`

```
_common/components/
  v0/
    v0.1/
      v0.1.0/
        sg-site-header.js   ← pinned production version
    v0.2/
      v0.2.0/
        sg-site-header.js   ← next version
  latest/
    sg-site-header.js       ← symlink or copy to latest minor
```

Pages reference pinned versions:
```html
<script type="module"
  src="/_common/components/v0/v0.1/v0.1.0/sg-site-header.js">
</script>
```

---

## Consumption Model

### Production (pinned via `static.sgraph.ai`)
```html
<script type="module"
  src="https://static.sgraph.ai/v0.1.0/sg-site-header.js">
</script>
<script type="module"
  src="https://static.sgraph.ai/v0.1.0/sg-public-viewer.js">
</script>
```

### Development (latest — feature branches only)
```html
<script type="module"
  src="https://tools.sgraph.ai/components/latest/sg-site-header.js">
</script>
```

### Version pinning via `_common/component-versions.json`
```json
{
  "sg-site-header": "0.1.0",
  "sg-site-footer": "0.1.0",
  "sg-locale-picker": "0.1.0",
  "sg-public-viewer": "0.1.0"
}
```

CI must verify these versions exist on `static.sgraph.ai` before deploying. Fail the build if a pinned version is unavailable.

---

## Tools as a Top-Level Nav Item

`tools.sgraph.ai` appears in the main sgraph.ai navigation as a first-class destination.

```html
<a href="https://tools.sgraph.ai" data-i18n="nav.tools"
   target="_blank" rel="noopener">Tools</a>
```

Footer: `tools.sgraph.ai` listed alongside `send.sgraph.ai` and `qa.send.sgraph.ai`.

**Why:** The tools directly prove SG/Send's zero-knowledge architecture. File Encryptor = "use the same encryption SG/Send uses, right now, in your browser."

---

## Required `__Tools` Changes (for this redesign)

| Change | Priority |
|--------|---------|
| Publish `<sg-site-header>` to __Tools | P1 |
| Publish `<sg-site-footer>` to __Tools | P1 |
| Update banner styles to match new design tokens | P1 |
| Add `<sg-public-viewer>` to __Tools | P1 |
| Publish updated `design-tokens.css` to __Tools | P1 |
| Set up `static.sgraph.ai` versioning for new components | P1 |
| Improve tools.sgraph.ai nav to match new sgraph.ai nav | P2 |

---

## Design Token Sync

Single source: `__Tools`. Once published, all sites `@import` from `static.sgraph.ai`:
```css
@import url('https://static.sgraph.ai/v0.1.0/design-tokens.css');
```

Current tokens to extract from `sgraph_ai__website/_common/css/style.css`:
```css
--color-brand-teal: #4ECDC4;
--color-bg-primary: #1A1A2E;
--color-bg-secondary: #16213E;
--font-body: 'DM Sans', sans-serif;
--font-mono: 'JetBrains Mono', monospace;
/* full token set — see style.css */
```

---

## Sequencing

```
Week 1:  Design <sg-site-header> and <sg-site-footer> (this repo)
Week 2:  Publish header/footer/locale-picker/tokens to __Tools
         Publish to static.sgraph.ai with version numbers
         tools.sgraph.ai updates its banner to match
Week 3:  sgraph.ai redesign uses pinned versions from static.sgraph.ai
         send.sgraph.ai updates its banner (separate PR in that repo)
Week 4+: All new SGraph properties start from __Tools components as baseline
```

---

## Open Questions

1. **Who owns `__Tools` releases?** Which human or agent triggers publishing to `static.sgraph.ai`?
2. **Does `static.sgraph.ai` exist yet?** If not, this is P0 before any of the above works.
3. **Iframe vs Web Component for tools embed?** Recommendation: iframe for now, Web Component when deeper theming is needed.
4. **tools.sgraph.ai redesign scope?** It still shows old nav (Product | Pricing | Architecture | Team). Should it update in this sprint?

---

*Phase 3 Development — Tools Repo Strategy*
*v0.18.2 — 27 March 2026*
*Full detail: `team/roles/dev/reviews/03/27/v0.18.2__dev-review__tools-repo-integration-strategy.md`*
