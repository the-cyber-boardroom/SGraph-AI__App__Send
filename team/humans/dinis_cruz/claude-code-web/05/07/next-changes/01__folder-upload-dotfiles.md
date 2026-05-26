# Next Change: Folder Upload — Include Hidden Files Option

## What and Where

**File:** `sgraph_ai_app_send__ui__user/v0/v0.3/v0.3.0/_common/js/components/send-upload/upload-folder.js`
**Line:** 108

The dot-file filter is in `compressToZip()`:

```javascript
// Current
var opts    = options || { level: 4, includeEmpty: false, includeHidden: false };
var entries = folderScan.entries.filter(function(e) {
    if (!opts.includeHidden && e.name.startsWith('.')) return false;   // ← this line
    if (e.isDir && !opts.includeEmpty) return false;
    return true;
});
```

`e.name.startsWith('.')` matches both files (`.gitignore`) **and directories** (`.claude/`).
When a directory is filtered, every file inside it is also dropped — so `.claude/settings.json`
disappears even though it's not itself a dot file.

## Why It Matters

`.claude/` is the directory Claude Code uses for hooks, settings, and session state.
Uploading a project folder to send to another agent currently silently drops the entire
`.claude/` subtree. The sender doesn't know anything was excluded.

## Server Side: No Changes Needed

The server (SG/Send API and S3) handles dot-file paths cleanly today:

```python
# path__vault_payload works fine with dot paths
path__vault_payload('abc123', 'bare/data/.claude/settings.json')
# → 'sg-send__data/sg-send-api__v1.0/shared/vault/ab/abc123/bare/data/.claude/settings.json/payload'
```

`list_files()` returns them, `read()` returns them, `batch` ops handle them.
This is a UI-only change.

## Recommended Change

**Do not flip the global default to `includeHidden: true`.** That would also include
`.DS_Store`, `.git/`, `.env`, SSH keys, etc. in every folder zip upload.

**Instead:** surface an opt-in checkbox in the folder upload UI.

### Option A — Checkbox in upload dialog (preferred)

When a folder is selected for upload, show:

```
☐ Include hidden files (files and folders starting with .)
```

Default: **unchecked** (existing behaviour for general users).

Wire the checkbox value into the `options` passed to `compressToZip()`:

```javascript
// In the upload handler, where compressToZip is called:
var opts = {
    level:         compressionLevel,
    includeEmpty:  false,
    includeHidden: document.getElementById('include-hidden-checkbox').checked
};
var zipFile = await UploadFolder.compressToZip(folderScan, folderName, opts, delivery);
```

No changes to `compressToZip()` itself — `includeHidden` is already a supported option.

### Option B — Count and warn (simpler short-term)

Don't add a checkbox yet. Just count how many dot files/directories were excluded
and show a warning in the upload summary:

```
3 hidden items excluded (.claude/, .gitignore, .env)  [include them ▼]
```

## Files to Change

| File | Change |
|------|--------|
| `upload-folder.js` | No change needed (logic is already option-driven) |
| `upload-step-select.js` (or equivalent dialog component) | Add "Include hidden files" checkbox |
| The component that calls `compressToZip()` | Pass `includeHidden` from checkbox state |

## Note on `readDirectoryTree` and `buildFolderScan`

Both functions already collect dot files from the filesystem/webkitdirectory — they do
no filtering themselves. The filter only happens in `compressToZip()`. If Option B
(count and warn) is chosen, the count of excluded hidden items can be derived from
`folderScan.entries` before `compressToZip()` is called.
