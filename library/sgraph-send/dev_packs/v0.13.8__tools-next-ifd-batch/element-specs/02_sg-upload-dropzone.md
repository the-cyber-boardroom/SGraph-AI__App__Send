# Element Spec: `<sg-upload-dropzone>`

**Layer:** Component
**IFD path:** `components/upload-dropzone/v1/v1.0/v1.0.0/`
**Effort:** Low-Medium
**Batch:** 1 (Foundation)
**Tag name:** `sg-upload-dropzone`

---

## What

A drag-and-drop file upload zone component. Users can drop files or click to open a file picker. Visual feedback for drag-over, file-loaded, and error states.

## Why

Multiple tools need file input: File Hasher, File Encryptor, and (future) File Selector. Building this as a shared component avoids duplicating drag-and-drop logic across tool pages.

## Files to Create

```
components/upload-dropzone/v1/v1.0/v1.0.0/
  sg-upload-dropzone.js      ← Component class (extends SgComponent)
  sg-upload-dropzone.html    ← Shadow DOM template
  sg-upload-dropzone.css     ← Component styles
  manifest.json
```

## API Contract

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `accept` | string | `*` | Comma-separated MIME types or extensions (e.g. `".pdf,.doc"`) |
| `multiple` | boolean | `false` | Allow multiple file selection |
| `max-size` | number | `0` | Max file size in bytes (0 = no limit) |
| `disabled` | boolean | `false` | Disable interaction |
| `label` | string | `"Drop a file here or click to select"` | Custom prompt text |

| Event | Detail | When |
|-------|--------|------|
| `files-selected` | `{ files: File[] }` | User selects file(s) via click or drop |
| `file-dropped` | `{ file: File, name: string, size: number, type: string }` | Per-file event on drop |
| `file-rejected` | `{ file: File, reason: string }` | File exceeds max-size or wrong type |

| Slot | Description |
|------|-------------|
| (default) | Custom content replaces default drop prompt |
| `icon` | Custom icon (default: upload arrow SVG) |

## Visual States

```
┌─────────────────────────────────┐
│                                 │
│         ↑ (upload icon)         │    ← IDLE
│  Drop a file here or click      │
│         to select               │
│                                 │
└─────────────────────────────────┘

┌═════════════════════════════════┐
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─   │    ← DRAG-OVER
│         Drop here!              │       (dashed border, highlight bg)
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─   │
└═════════════════════════════════┘

┌─────────────────────────────────┐
│  📄 report.pdf                  │    ← FILE-LOADED
│  2.4 MB                        │       (shows filename + size)
│  [Change file]                  │
└─────────────────────────────────┘
```

## Implementation Notes

- Hidden `<input type="file">` triggered by click on the dropzone
- `dragover`, `dragleave`, `drop` events on the component
- `preventDefault()` on dragover to allow drop
- Use `DataTransfer.files` on drop
- Validate against `accept` and `max-size` before emitting events
- Format file size: bytes → KB → MB → GB with 1 decimal

## i18n Keys

```json
{
  "component_dropzone_prompt": "Drop a file here or click to select",
  "component_dropzone_drag_over": "Drop here!",
  "component_dropzone_change": "Change file",
  "component_dropzone_too_large": "File too large (max {maxSize})",
  "component_dropzone_wrong_type": "File type not accepted"
}
```

## Acceptance Criteria

- [ ] Click opens native file picker
- [ ] Drag-and-drop works with visual feedback
- [ ] `accept` attribute filters file types
- [ ] `max-size` attribute rejects oversized files with `file-rejected` event
- [ ] `multiple` attribute allows multi-file selection
- [ ] File name and size displayed after selection
- [ ] "Change file" allows re-selection
- [ ] Extends SgComponent, uses Shadow DOM
- [ ] manifest.json created
- [ ] i18n keys added to all 5 locale files
