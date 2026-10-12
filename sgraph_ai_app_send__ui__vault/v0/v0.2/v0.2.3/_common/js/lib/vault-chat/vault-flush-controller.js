/* =================================================================================
   Vault Chat — VaultFlushController (doc 05 §3)

   The only component that writes to the vault. Tracks a dirty set from MemoryVfs
   change events and, on a trigger, coalesces all dirty paths into ONE commit via
   the bridge extension window.sg.vfs.writeBatch(items, {message}) (doc 03 §3).

   Modes (doc 05 §2):
     ephemeral — inert (nothing persisted unless flush() is called explicitly)
     synced    — auto-flush on turn-end (one commit per user turn)
     snapshot  — single snapshotZip() at end-of-chat

   Construction: new VaultFlushController(memVfs, windowSg, mode)
   Browser global: window.VaultChat.VaultFlushController
   ================================================================================= */
(function (root) {
    'use strict';

    class VaultFlushController {
        constructor(memVfs, windowSg, mode) {
            this.vfs = memVfs;
            this.sg = windowSg;
            this.mode = mode || 'ephemeral';
            this._dirty = new Map();   // path -> 'write' | 'delete'
            this._unsub = memVfs.onChange(({ op, path }) => this.markDirty(path, op));
        }

        markDirty(path, op) {
            if (op !== 'write' && op !== 'delete') return;
            // a write after a delete (or vice-versa) keeps the latest op
            this._dirty.set(path, op);
        }

        dirtyPaths() { return Array.from(this._dirty.keys()); }
        hasDirty() { return this._dirty.size > 0; }

        async _buildItems() {
            const items = [];
            for (const [path, op] of this._dirty) {
                if (op === 'delete') { items.push({ path, op: 'delete' }); continue; }
                const bytes = this.vfs._peek(path);
                if (bytes == null) continue;   // written then deleted in-session
                items.push({ path, op: 'write', data: bytes });
            }
            return items;
        }

        // Coalesce all dirty paths into ONE commit (doc 03 §3). No-op when nothing dirty.
        async flush(message) {
            if (!this._dirty.size) return { ok: true, skipped: 'nothing-dirty' };
            const items = await this._buildItems();
            if (!items.length) { this._dirty.clear(); return { ok: true, skipped: 'nothing-dirty' }; }
            const res = await this.sg.vfs.writeBatch(items, { message: message || 'vault-chat flush' });
            this._dirty.clear();
            return { ok: true, commitId: res && res.commitId, count: items.length };
        }

        // Snapshot the whole working set into one zip-bearing commit (doc 05 §2 snapshot).
        async snapshotZip(message) {
            const all = await this.vfs.listAll();
            const items = [];
            for (const f of all) { const b = this.vfs._peek(f.path); if (b != null) items.push({ path: f.path, op: 'write', data: b }); }
            // Phase 0: writeBatch the files (the real zip packaging lands with the bridge work).
            const res = await this.sg.vfs.writeBatch(items, { message: message || 'vault-chat snapshot', snapshot: true });
            return { ok: true, commitId: res && res.commitId, count: items.length };
        }

        // Called by the chat orchestrator at the end of a user turn.
        async onTurnEnd(message) {
            if (this.mode === 'synced') return this.flush(message);
            return { ok: true, skipped: 'mode-' + this.mode };
        }

        dispose() { if (this._unsub) this._unsub(); }
    }

    root.VaultChat = root.VaultChat || {};
    root.VaultChat.VaultFlushController = VaultFlushController;
})(typeof window !== 'undefined' ? window : globalThis);
