# 07 — UX & Mockups (grounded in app-shell reality)

**version** v0.27.80 · **date** 26 May 2026 · **from** Architect · **type** UX · **note** starting points to try, not final design

The chat is a Vault App in a blob: iframe (doc 02). These mockups reuse shipped surfaces: the app-shell mount, the bridge log (HUD), `vault-generate`'s LLM-over-bus, `VaultComponent` styling + `design-tokens.css`.

## 1. In-vault: right-hand chat pane (dev-brief AC6)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  SG/Vault   demo-health-data                          [settings] [x]      │
├────────────────────────────────────┬──────────────────────────────────────┤
│  FILES                              │  VAULT CHAT      mode: ephemeral ▾    │
│  report.pdf                         │  ┌────────────────────────────────┐  │
│  data.csv                           │  │ You: read report.pdf, make an  │  │
│  notes.md                           │  │ infographic of the totals      │  │
│  /apps/dashboard/                   │  │ Chat: reading report.pdf…      │  │
│  /.vault/        (hidden to chat)   │  │  🛠 read_file report.pdf [AUTO]✓│  │
│                                     │  │  ┌ create_infographic ───────┐ │  │
│  PREVIEW                            │  │  │ /work/totals.png  COSTLY  │ │  │
│  (selected file)                    │  │  │ est ~$0.06  left $0.74    │ │  │
│                                     │  │  │ [approve][always][deny]   │ │  │
│                                     │  └──┴───────────────────────────┘ │  │
│                                     │  [ message …………………… ] [>]         │
│                                     │  tools: read✓ write✓ infographic✓   │
│                                     │  [layers] [tools] [log] [budget]     │
└────────────────────────────────────┴──────────────────────────────────────┘
```
`mode ▾` = ephemeral/snapshot/synced (doc 05 §2). `/.vault/` shows in the parent file list but is **invisible to the chat** (doc 03 §2). The four chips open the inspector / loadout / execution-log / ledger.

## 2. Inline tool CONFIRM (arch-brief; doc 04 §4)

```
┌─ tool: delete_file ────────────────────────────────────┐
│  /work/old-draft.md                  tier: DESTRUCTIVE  │
│  preview: remove from working set (vault unaffected     │
│           until next flush)                             │
│        [ approve ]   [ approve always ]   [ deny ]      │
└─────────────────────────────────────────────────────────┘
```

## 3. Context-layers inspector (doc 05 §5)

(See doc 05 §5 for the rendered panel.) Tabs: **Layers** (this panel) · **Full prompt** (the exact assembled text) · **History** (per-turn, with compress/edit/recreate) · **Graph** (Track B, `/graph/**` viewer).

## 4. Standalone test page (dev-brief AC1; Phase 0)

```
┌──────────────────────────────────────────────────────────────────────────┐
│  SG/Vault Chat — STANDALONE TEST HARNESS         vfs: [memory ▾] sg: MOCK  │
├──────────────────────────────────────────────────────────────────────────┤
│  conversation ……………………………………………………………  [layers][tools][log]│
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │ [ message ……………………………………………………………………… ] │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│  TEST CONTROLS                                                             │
│   seed working set ▸  inject untrusted file ▸  force budget cap ▸          │
│   simulate read-only ▸  trigger turn-end flush ▸  open two-pane next-chat ▸ │
│  view: (•)conversation ( )VFS ( )prompt ( )created apps ( )ledger          │
└──────────────────────────────────────────────────────────────────────────┘
```
The harness supplies a **mock `window.sg`** (in-memory vault) so every property (tools, budget refusal, CONFIRM, injection fencing, flush, read-only degrade, next-chat) is exercised **without a vault** — the brief's "long test page … properties not related to the vault."

## 5. Chat-about-the-next-chat (arch-brief; doc 06 §5)

```
┌──────── CHAT A (edits context) ───────┬─ CHAT B (reads it) ───────────────┐
│ You: trim history to the decisions    │ (root: /chat/next/, reads context)│
│ A: updated /chat/next/context.json    │ You: continue from where we left  │
│  🛠 write_file /chat/next/context.json │ B: (sees only curated decisions)… │
│     [synced → 1 commit on turn-end]    │                                   │
└────────────────────────────────────────┴───────────────────────────────────┘
```

## 6. Created-apps view (keystone, dev-brief; Phase 7)

The chat can write an HTML app (`/work/app/index.html` + `.vault/app.json`); a **"created apps"** view mounts it via the **same app-shell** — Vault Chat producing a Vault App, rendered by the Vault App machinery. The elegant unification: one iframe-bridge primitive, two surfaces that compose.

---

*CC BY 4.0.*
