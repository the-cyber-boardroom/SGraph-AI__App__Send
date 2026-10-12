/* =================================================================================
   VaultLoader — Recent Vaults List
   Unified single-source-of-truth for the recent-vaults list.

   Storage key:  localStorage('sg-vault-recent')
   Entry schema: { key, name, lastOpened, format }
     key         — vault credential string (the full key)
     name        — friendly display name (defaults to key)
     lastOpened  — Unix timestamp (ms)
     format      — detected format number 1–4 (0 if undetectable)

   list() returns entries with an extra computed field:
     isCurrent   — true if key === localStorage('sg-vault-key')

   Migration: on first call to migrate(), unifies two legacy lists:
     sg-vault-history             format: [{ key, name, lastOpened }]
     sg-vault-picker:credentials  format: [{ vaultKey, vaultName, savedAt }]
   → sg-vault-recent. sg-vault-history wins on name conflicts.
   Guards with localStorage('sg-vault-recent:migrated-at') to run only once.

   Load order: after vault-loader-events.js, vault-loader-storage.js,
               vault-loader-format.js.
   ================================================================================= */

;(function () {
    'use strict';

    var KEY_RECENT    = 'sg-vault-recent';
    var KEY_LEGACY_H  = 'sg-vault-history';
    var KEY_LEGACY_P  = 'sg-vault-picker:credentials';
    var KEY_MIGRATED  = 'sg-vault-recent:migrated-at';
    // Storage cap. Bounded (not unlimited) so a runaway caller can't grow localStorage
    // without limit — but high enough to be "effectively no limit" for a human's vault
    // list (200 small entries ≈ ~30 KB, far under the ~5 MB quota). Raised from 20 so the
    // landing page can show the full history instead of silently dropping older vaults.
    var MAX_ENTRIES   = 200;

    function _read() {
        try { return JSON.parse(localStorage.getItem(KEY_RECENT) || '[]'); }
        catch (_) { return []; }
    }

    function _write(list) {
        try { localStorage.setItem(KEY_RECENT, JSON.stringify(list)); } catch (_) {}
    }

    function _emitChanged(count) {
        if (globalThis.sgraphVault && globalThis.sgraphVault.events) {
            globalThis.sgraphVault.events.emit(VaultLoaderEvents.VAULT_RECENT_CHANGED, { count: count });
        }
    }

    function _detectFmt(key) {
        try { return VaultLoaderFormat.detectFormat(key).format; } catch (_) { return 0; }
    }

    function list() {
        var currentKey = VaultLoaderStorage.getCurrentKey();
        return _read().map(function (e) {
            return {
                key:        e.key,
                name:       e.name,
                lastOpened: e.lastOpened,
                format:     e.format,
                isCurrent:  e.key === currentKey
            };
        });
    }

    function add(key, name) {
        if (!key) return;
        var all = _read().filter(function (e) { return e.key !== key; });
        all.unshift({ key: key, name: name || key, lastOpened: Date.now(), format: _detectFmt(key) });
        _write(all.slice(0, MAX_ENTRIES));
        _emitChanged(Math.min(all.length, MAX_ENTRIES));
    }

    function remove(key) {
        var all = _read().filter(function (e) { return e.key !== key; });
        _write(all);
        _emitChanged(all.length);
    }

    function clear() {
        _write([]);
        _emitChanged(0);
    }

    function migrate() {
        try { if (localStorage.getItem(KEY_MIGRATED)) return { migrated: 0 }; }
        catch (_) { return { migrated: 0 }; }

        var map = {};

        // sg-vault-picker:credentials — format: [{ vaultKey, vaultName, savedAt }]
        try {
            var picker = JSON.parse(localStorage.getItem(KEY_LEGACY_P) || '[]');
            picker.forEach(function (c) {
                if (c && c.vaultKey) {
                    map[c.vaultKey] = { key: c.vaultKey, name: c.vaultName || c.vaultKey, lastOpened: c.savedAt || 0 };
                }
            });
        } catch (_) {}

        // sg-vault-history — format: [{ key, name, lastOpened }] — wins on conflict
        try {
            var hist = JSON.parse(localStorage.getItem(KEY_LEGACY_H) || '[]');
            hist.forEach(function (h) {
                if (h && h.key) {
                    map[h.key] = { key: h.key, name: h.name || h.key, lastOpened: h.lastOpened || 0 };
                }
            });
        } catch (_) {}

        var merged = Object.keys(map).map(function (k) { return map[k]; });
        merged.sort(function (a, b) { return b.lastOpened - a.lastOpened; });
        merged = merged.map(function (e) {
            return { key: e.key, name: e.name, lastOpened: e.lastOpened, format: _detectFmt(e.key) };
        });

        // Prepend migrated entries not already in sg-vault-recent
        var existing = _read();
        var seen = {};
        existing.forEach(function (e) { seen[e.key] = true; });
        var toAdd    = merged.filter(function (e) { return !seen[e.key]; });
        var combined = existing.concat(toAdd).slice(0, MAX_ENTRIES);
        _write(combined);

        try { localStorage.removeItem(KEY_LEGACY_H); } catch (_) {}
        try { localStorage.removeItem(KEY_LEGACY_P); } catch (_) {}
        try { localStorage.setItem(KEY_MIGRATED, new Date().toISOString()); } catch (_) {}

        _emitChanged(combined.length);
        return { migrated: merged.length };
    }

    globalThis.VaultLoaderRecent = { list: list, add: add, remove: remove, clear: clear, migrate: migrate };
}());
