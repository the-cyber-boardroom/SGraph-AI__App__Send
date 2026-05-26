# 03 — Bridge Contract: the `window.sg` surface we depend on + the extensions we add

**version** v0.27.80 · **date** 26 May 2026 · **from** Architect · **type** Interface contract
**source** code-verified against `VAULT/_common/js/components/app-shell/app-shell.js` (26 May 2026)

This is the precise interface between the chat iframe and the vault. The chat app codes **only** against this; it never touches vault file-ops directly (it can't — it's in the iframe).

## 1. Existing surface — REUSE as-is

```js
window.sg = {
  vfs: {
    read(path)        // → Promise<ArrayBuffer>            (ENOENT on miss)
    readText(path)    // → Promise<string>
    write(path, data) // data: Uint8Array|string → {path, size}   ⚠ ONE COMMIT PER CALL
    list(path)        // → Promise<[{path,name,size,type}]>
  },
  sync: { status(), check(), push(), pull(), refresh() },  // status → {current, serverHasNewer, localHasUnsynced, writable}
  auth: { hasKey, setKey(key), check(key), clear() },      // setKey validates via /api/transfers/check-token
  ui:   { message(text, type, opts), dismiss(handle) },    // type: info|warning|error; opts.ttl ms
  app:  { selfPath, writable, vaultName, vaultId, fileCount, totalSize },
  loadCss(path), loadJs(path),
  git: { /* deprecated alias → sync */ }
}
```

**Message protocol** (handlers at `app-shell.js:1187-1365`): request `{__sgVfsReadReq:id, path}` → reply `{__sgVfsReadReply:id, ok, buf|err}`; write/list analogous; commands `{__sgCmdType, __sgCmdId, action, …}` → `{__sgCmdReply:id, ok, result|err}`. Origin is checked via `e.source === iframeEl.contentWindow`. Every handler emits `_emitBridgeCall(method, {path,bytes,ms,ok,err})` → the bridge log.

**Key facts the chat must respect:**
- `sg.vfs.write` **commits every call** → never write the working set straight to `sg.vfs`; write to `sg-vfs` memory and flush in batches (doc 05).
- `sg.app.writable` is false in read-only opens → WRITE/DESTRUCTIVE tool policies must degrade to OFF when `!writable` (doc 04 §1).
- Paths are absolute POSIX from the iframe's view; the handler resolves them against the app's `htmlDir` and the vault tree.

## 2. EXTENSION A — secrets handshake (D4, key injection)

The parent already opens the vault; it is the only place that can read `/.vault/secrets/**`. Add a **one-time, parent→iframe** secret push at mount, and **never** expose `/.vault/**` through `sg.vfs`.

**Parent (`app-shell.js`, in `_mountApp` after building the bridge):**
```js
// read once, parent-side; do NOT route through the iframe-facing vfs
const keyBytes = await dataSource.getFileBytes('/.vault/secrets/openrouter.key').catch(()=>null);
const secrets = keyBytes ? { openrouter: new TextDecoder().decode(keyBytes).trim() } : {};
// after iframe load, before the app boots its LLM:
iframeEl.contentWindow.postMessage({ __sgSecrets: secrets }, '*');   // one-time
```
**Iframe (chat bootstrap):** listens once for `__sgSecrets`, hands the value to `sg-llm-request` (closure), then drops the reference from any globally-reachable place. The chat exposes **no** `sg.secrets` getter to tool code.

**Exclusion (mandatory, both sides):** in `_setupVfsBridgeHandlers`, reject any read/list whose resolved path starts with `/.vault/` → reply `{ok:false, err:'ENOENT'}`. This makes the reserved prefix invisible to `read_file`/`list_folder` regardless of what the model is told to do. (Doc 09 §2 is the threat model.)

> AppSec sign-off item: confirm `/.vault/**` exclusion covers `read`, `readText`, `list`, **and** the `HTMLImageElement.prototype.src` patch (`app-shell.js:1128-1178`) — the img patch is another read path and must exclude `/.vault/**` too.

## 3. EXTENSION B — batch write / commit-with-message (C2, flush coalescing)

`sg.vfs.write` is one-commit-per-call. To make a flush **one** commit with a chosen message, expose the already-existing single-commit batch (`sg-vault--file-ops.js:37-73 addFiles`) and a delete:

```js
window.sg.vfs.writeBatch(items, opts)   // items:[{path, data, op?:'write'|'delete'}], opts:{message}
                                        // → {commitId, count}   ONE commit
window.sg.vfs.delete(path)              // → {path}              (maps removeFile; commits)
```
**Parent handler:** split each item into `(folder, name)` (`name=basename`, `folder=dirname||'/'`), call `vault.addFiles(writes)` for the write set and `vault.removeFile` for deletes within the same logical flush, then surface `{commitId}`. Honour the `/.vault/**` exclusion here too (a flush must never write into the reserved prefix). Emit a `vfs.write` bridge-log row per item plus one `vfs.commit` row with the message.

This is the **only** vault-facing capability the flush controller needs; everything else (push/pull, status) already exists on `sg.sync`.

## 4. EXTENSION C — bridge-log rows for tools & LLM (visibility, briefs' "see the commands flow")

`app-debug-bridge-log.js` renders `window._appDebug.bridgeCalls`. Add two emitters (called by the ExecutionCenter, doc 04 §3) and two icons:
```
🛠  tool.<name>   detail: args summary, mode (AUTO/CONFIRM/DRY_RUN), ms, ok/err, cost?
🤖 llm.send      detail: model, #messages, #tools, tokens?, cost
```
No new visualiser — extend the icon map (`app-debug-bridge-log.js:30-36`) and let the ExecutionCenter push rows onto the same array/event (`app-debug:bridge-call`).

## 5. Summary of bridge changes

| Change | File | Size | Why |
|---|---|---|---|
| `__sgSecrets` one-time push + iframe listener | `app-shell.js` `_mountApp` + chat bootstrap | small | D4 key injection |
| `/.vault/**` exclusion on read/readText/list + img patch | `app-shell.js` `_setupVfsBridgeHandlers`, img patch | small | D4 / R-secret |
| `sg.vfs.writeBatch` + `sg.vfs.delete` | `app-shell.js` (+ expose in `_buildVfsBridgeScript`) | small | C2 flush = 1 commit |
| `tool.*` / `llm.*` log rows + icons | `app-debug-bridge-log.js` (+ ExecutionCenter emits) | small | visibility |

All four are **additive** and backward-compatible with existing Vault Apps (they don't use the new methods). They are the entire bridge footprint of Vault Chat.

---

*CC BY 4.0.*
