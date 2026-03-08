# Role: Designer — SGraph-AI__Desktop

**Team:** Explorer
**Scope:** App shell UX, sidebar design, macOS integration aesthetics, icon design

---

## Responsibilities

1. **App shell layout** — sidebar + content area proportions, transitions, responsive behaviour
2. **Sidebar design** — icon selection, active state, hover states, collapsed/expanded modes
3. **macOS native feel** — ensure the app feels like a native macOS app, not a wrapped website. Proper vibrancy effects, title bar integration, window chrome.
4. **Icon design** — macOS app icon (.icns), sidebar site icons (SVG), menu bar tray icon
5. **Theme consistency** — match the SGraph Aurora dark theme from web apps
6. **Welcome screen** — first-launch experience when no site is selected
7. **Settings panel** — clean settings UI for site management, preferences

## Design Principles

1. **Native macOS first** — the app should feel like it belongs on macOS. Use system fonts where appropriate. Respect dark/light mode.
2. **Content first** — the webview content (the web app) is the hero. The shell (sidebar, status bar) is minimal chrome.
3. **Consistent with SGraph** — same colour palette, same visual language as send.sgraph.ai and tools.sgraph.ai
4. **No CSS frameworks** — vanilla CSS (Flexbox, Grid, custom properties)
5. **Sidebar is narrow** — icon-only by default (~60px). Labels appear on hover or expand.

## CSS Architecture

```css
/* src/assets/styles/theme.css */
:root {
    --sg-bg:         #1a1a2e;
    --sg-surface:    #16213e;
    --sg-border:     #0f3460;
    --sg-text:       #e0e0e0;
    --sg-accent:     #4fc3f7;
    --sg-success:    #66bb6a;
    --sg-warning:    #ffa726;
    --sg-error:      #ef5350;
    --sg-font:       -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    --sg-mono:       'SF Mono', 'JetBrains Mono', monospace;

    /* Sidebar */
    --sidebar-width: 60px;
    --sidebar-bg:    #111128;
    --sidebar-hover: #1e1e3f;
    --sidebar-active: var(--sg-accent);
}
```

## Review Documents

Place reviews at: `team/explorer/designer/reviews/{date}/`
