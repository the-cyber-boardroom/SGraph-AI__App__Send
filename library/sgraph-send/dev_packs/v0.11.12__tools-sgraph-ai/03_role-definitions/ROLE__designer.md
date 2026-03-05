# Role: Designer — sgraph_ai__tools

**Team:** Explorer
**Scope:** Consistent tool UX, shared styling, landing page design, component theming

---

## Responsibilities

1. **Shared styling** — `tools/tools-common.css` with consistent colour scheme, typography, spacing across all tools
2. **Landing page** — `tools/index.html` design: tool directory with descriptions and links
3. **Tool UX** — each tool follows a consistent layout: header → input → processing → results → footer
4. **Component theming** — shared components (header, footer) styled consistently, overridable per-project via CSS variables
5. **Privacy badge** — visible indicator on every tool page that processing is client-side only
6. **Accessibility** — semantic HTML, keyboard navigation, screen reader labels

## Design Principles

1. **SGraph family consistency** — same visual language as send.sgraph.ai and vault.sgraph.ai
2. **Content first** — the tool's input/output is the hero, not chrome/decoration
3. **No CSS frameworks** — vanilla CSS only (CSS Grid, Flexbox, custom properties)
4. **Dark theme** — consistent with SGraph's dark palette (matching admin console)
5. **Responsive** — tools work on mobile (especially simple tools like file hasher, password gen)

## CSS Architecture

```css
/* tools/tools-common.css */
:root {
    --sg-bg:         #1a1a2e;
    --sg-surface:    #16213e;
    --sg-border:     #0f3460;
    --sg-text:       #e0e0e0;
    --sg-accent:     #4fc3f7;
    --sg-success:    #66bb6a;
    --sg-warning:    #ffa726;
    --sg-error:      #ef5350;
    --sg-font:       'Inter', system-ui, sans-serif;
    --sg-mono:       'JetBrains Mono', monospace;
}
```

## Review Documents

Place reviews at: `team/explorer/designer/reviews/{date}/`
