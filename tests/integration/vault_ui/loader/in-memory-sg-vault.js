/* =================================================================================
   In-memory SGVault + SGSend stubs for integration tests.
   Loaded via runInThisContext so globalThis refs resolve correctly.

   SGVault._seed(key, name) — pre-populate the store (simulates an existing vault).
   SGVault._reset()         — clear the store between tests.
   ================================================================================= */

;(function () {
    'use strict';

    var _store = new Map();

    function _FakeSGSend(opts) {
        this.endpoint = (opts && opts.endpoint) || 'https://integration.test.local';
        this.token    = (opts && opts.token)    || '';
    }

    var _FakeSGVault = {
        _store: _store,

        open: function (sgSend, vaultKey) {
            return new Promise(function (resolve, reject) {
                var data = _store.get(vaultKey);
                if (!data) {
                    reject(new Error('Vault not found (404): "' + vaultKey + '"'));
                } else {
                    resolve({ name: data.name, _key: vaultKey });
                }
            });
        },

        createFromToken: function (sgSend, simpleToken, opts) {
            return new Promise(function (resolve) {
                var name = (opts && opts.name) || simpleToken;
                _store.set(simpleToken, { name: name });
                resolve({ name: name, _key: simpleToken });
            });
        },

        // Read-only open (formats 4/6 + ro-tokens). Mirrors the real signature; the
        // returned shape carries the RO markers the shells key off. Records the call
        // so tests can assert the derived triple. Seed under 'ro:'+vaultId.
        _openReadOnlyCalls: [],
        openReadOnly: function (sgSend, vaultId, readKeyB64, refFileId) {
            var calls = this._openReadOnlyCalls;
            return new Promise(function (resolve, reject) {
                calls.push({ vaultId: vaultId, readKeyB64: readKeyB64, refFileId: refFileId });
                var data = _store.get('ro:' + vaultId);
                if (!data) {
                    reject(new Error('Vault not found: HEAD ref missing'));
                } else {
                    resolve({ name: data.name, _vaultId: vaultId, writable: false, _passphrase: null });
                }
            });
        },

        _seed: function (vaultKey, name) {
            _store.set(vaultKey, { name: name || vaultKey });
        },

        _reset: function () {
            _store.clear();
        }
    };

    globalThis.SGSend  = _FakeSGSend;
    globalThis.SGVault = _FakeSGVault;
}());
