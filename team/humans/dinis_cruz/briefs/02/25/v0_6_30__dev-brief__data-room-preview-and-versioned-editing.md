# Dev Brief: Data Room File Preview and Versioned Editing

**version** v0.6.30  
**date** 25 Feb 2026  
**from** Human (project lead)  
**to** Developer (lead), Designer  
**type** Dev brief — immediate implementation  

---

## Context

The user-facing side already has a really nice file preview that supports PDFs, HTML, text, documents, and more (enhanced further in the ZIP/preview brief, v0.6.17). The admin side already has an edit feature. These two capabilities need to be combined: the data room needs to use the preview component AND add editing that creates new versions rather than modifying originals.

---

## Two Things to Build

### 1. Bring the Preview into the Data Room

The file preview component currently lives on the user/receiver side (`send.sgraph.ai`). The data room needs to use it — but the pattern is one-directional: **the admin side references code published on the user side, never the reverse.**

This matters architecturally. The admin interface (`admin.send.sgraph.ai`) should load shared components (preview, editor, crypto utilities) by referencing JS/CSS served from the user-side static assets — not by duplicating or inlining them. One codebase for shared elements, served from one location.

With the move to S3/CloudFront for static assets (see URL architecture brief, v0.6.30), those shared resources will be served from:

```
https://static.send.sgraph.ai/v0/v0.1/v0.1.5/js/vault-preview.js
https://static.send.sgraph.ai/v0/v0.1/v0.1.5/components/send-preview/send-preview.js
```

This requires a **global compatible-versions manifest** — a mapping of which component versions work together, and where to fetch them:

```json
{
  "component_versions": {
    "vault-preview":   { "version": "v0.1.5", "url": "https://static.send.sgraph.ai/v0/v0.1/v0.1.5/components/vault-preview/vault-preview.js" },
    "vault-editor":    { "version": "v0.1.6", "url": "https://static.send.sgraph.ai/v0/v0.1/v0.1.6/components/vault-editor/vault-editor.js" },
    "send-download":   { "version": "v0.1.8", "url": "https://static.send.sgraph.ai/v0/v0.1/v0.1.8/components/send-download/send-download.js" }
  }
}
```

The admin side imports the preview component by resolving this manifest, not by hardcoding a path. This means:
- Component updates on the user side are automatically available to the admin side
- Version pinning is explicit and auditable
- No Lambda invocations for static file serving (pure S3/CloudFront)

The preview component should be usable from:
- The receiver/download view (current home — `send.sgraph.ai`)
- The data room view (this brief — loads from `static.send.sgraph.ai`)
- The admin view (loads from `static.send.sgraph.ai` — never duplicated)
- The portable data room viewer (future — `.sgroom` files)

```
Data Room: Project Alpha
├── 📁 Documents/
│   ├── 📄 project-spec.md        [👁️ Preview] [↓ Download] [✏️ Edit]
│   ├── 📄 contract-v3.pdf        [👁️ Preview] [↓ Download]
│   └── 📄 meeting-notes.md       [👁️ Preview] [↓ Download] [✏️ Edit]
├── 📁 Assets/
│   ├── 🖼️ logo.png               [👁️ Preview] [↓ Download]
│   └── 🖼️ wireframe.svg          [👁️ Preview] [↓ Download]
└── 📄 README.md                   [👁️ Preview] [↓ Download] [✏️ Edit]

Click [👁️ Preview] → file renders inline using the preview component
Click [✏️ Edit] → opens editor (for editable formats: .md, .txt, .json, etc.)
```

The preview component should be extracted/packaged so it can be imported by:
- The receiver view (current home)
- The data room view (this brief)
- The admin view (for admin inspection)
- The portable data room viewer (future — .sgroom files)

### 2. Edit = Create New Version

**Users do not modify files. Users create new versions.**

This is a fundamental design decision. It's like Git: the original is immutable. An edit produces a new version. Versions are linked.

```
User opens meeting-notes.md in the editor
User makes changes
User clicks [Save]

What happens:
  ├── Original: meeting-notes.md (v1) — unchanged, still accessible
  ├── New file: meeting-notes.md (v2) — the edited version
  └── Link: v2.parent = v1 (version chain)

The data room shows:
  📄 meeting-notes.md (v2, latest)
     └── 📜 History: v2 (today, by Alice) ← v1 (yesterday, by Bob)
```

### Why Immutable Versions

| Reason | Explanation |
|---|---|
| **Provenance** | Every version is a distinct file. Who created which version is clear. When PKI is added later, each version is signed by its creator. |
| **No conflicts** | Two editors can't corrupt each other's work. If Alice and Bob both edit v1, you get v2a (Alice's) and v2b (Bob's) — both preserved. |
| **Audit trail** | The full history of a document is always available. Nothing is overwritten. |
| **Simplicity** | Creating a new file is a process that already exists today. No need for merge logic, conflict resolution, or diffing. |
| **Recovery** | "Undo" is trivial — just point back to the previous version. Nothing was destroyed. |

### Version Linking

Versions are linked in a simple chain:

```json
{
  "file_id": "meeting-notes-v2",
  "name": "meeting-notes.md",
  "version": 2,
  "parent": "meeting-notes-v1",
  "created_by": "Alice",
  "created_at": "2026-02-25T10:30:00Z",
  "hash": "sha256:abc123..."
}
```

The data room UI shows the latest version by default, with a "History" toggle to see previous versions. This is the same pattern as the fractal document signing brief (v0.6.14) — every version is signed, every change is traceable.

**Future enhancement**: diff view between versions. Not needed for MVP — just the version chain and the ability to view any version.

---

## Editable Formats

Not all file types need editing. Preview is universal; editing is for text-based formats:

| Format | Preview | Edit | Editor Type |
|---|---|---|---|
| **Markdown** (.md) | ✅ Rendered HTML | ✅ | Markdown editor (textarea with preview toggle) |
| **Plain text** (.txt, .log) | ✅ Pre-formatted | ✅ | Simple textarea |
| **JSON** (.json) | ✅ Syntax highlighted | ✅ | Code editor (textarea with highlighting) |
| **YAML** (.yaml, .yml) | ✅ Syntax highlighted | ✅ | Code editor |
| **CSV** (.csv) | ✅ Table view | ✅ | Table editor or textarea |
| **Code** (.js, .py, .html, .css) | ✅ Syntax highlighted | ✅ | Code editor |
| **PDF** (.pdf) | ✅ PDF viewer | ❌ | Not editable in browser |
| **Images** (.png, .jpg, etc.) | ✅ Image display | ❌ | Not editable in browser |
| **Word** (.docx) | ✅ Rendered via mammoth.js | ❌ (for now) | Complex — defer |

For MVP: markdown and plain text editing. These cover the most common data room content (notes, specs, meeting notes, READMEs). Other editable formats can be added incrementally.

---

## The Editor UI

### Markdown Editor (MVP)

```
┌──────────────────────────────────────────────────┐
│  ✏️ Editing: meeting-notes.md                     │
│  Version: creating v3 (based on v2 by Bob)       │
├──────────────────────────────────────────────────┤
│  [Edit] [Preview] [Split]                        │
├──────────────────────────────────────────────────┤
│                                                  │
│  ## Meeting Notes - 25 Feb                       │
│                                                  │
│  ### Attendees                                   │
│  - Alice                                         │
│  - Bob                                           │
│  - Carol (new)                                   │
│                                                  │
│  ### Action Items                                │
│  - [ ] Alice to review the spec                  │
│  - [x] Bob to send the report                   │
│                                                  │
├──────────────────────────────────────────────────┤
│  [Cancel]                    [Save as New Version]│
└──────────────────────────────────────────────────┘
```

The button says "Save as New Version" — not "Save." This makes the versioning model explicit and clear to the user.

### Where the Edit Feature Comes From

The admin side already has an edit feature. The work here is:
1. Extract the edit component from the admin side
2. Adapt it for the data room context (version creation instead of in-place edit)
3. Combine it with the preview component from the user side

The result: a data room where you can preview any file AND edit text-based files by creating new versions.

---

## Serving Files from the User Side

The memo notes that when admin-side features need to access the data room content, we should serve the files from the user side (which has the preview component). The architecture:

```
Admin Interface                    User/Data Room Interface
├── User management               ├── File preview (reusable component)
├── Key management                 ├── File editor (creates new versions)
├── Data room settings             ├── Folder navigation
└── References user-side           └── Version history
    for file viewing
```

The admin interface doesn't need its own file viewer — it uses the same preview component as the data room. One component, multiple contexts.

---

## Connection to Existing Architecture

| Document | Connection |
|---|---|
| **ZIP Support / File Preview** (v0.6.17) | The preview component defined there is the SAME component used here. ZIP browsing in data rooms = this preview. |
| **Portable Data Rooms (.sgroom)** (v0.6.14) | The .sgroom viewer will use the same preview + version UI. |
| **Fractal Document Signing** (v0.6.14) | Each version can be signed. The version chain is the provenance chain. |
| **Data Room as Code** (v0.6.14) | Git-backed data rooms: every version is a commit. The version chain IS the git history. |
| **Convenience-First** (v0.6.17) | Preview + edit in the browser = no download needed. Drives DRU. |

---

## Acceptance Criteria

| # | Criterion |
|---|---|
| 1 | Admin side loads preview component from `static.send.sgraph.ai` (not duplicated or Lambda-served) |
| 1a | Global compatible-versions manifest defines which component versions work together and their static URLs |
| 2 | Data room view uses the preview component for all supported file types |
| 3 | Markdown files can be edited in the data room (textarea + preview toggle) |
| 4 | Plain text files can be edited in the data room |
| 5 | Edit saves as a new version (original unchanged) |
| 6 | Versions are linked (parent chain) |
| 7 | Data room shows latest version by default |
| 8 | History view shows all versions with creator and timestamp |
| 9 | Any previous version can be viewed via the preview component |
| 10 | Preview and edit work on mobile |

---

This document is released under the Creative Commons Attribution 4.0 International licence (CC BY 4.0). You are free to share and adapt this material for any purpose, including commercially, as long as you give appropriate credit.
