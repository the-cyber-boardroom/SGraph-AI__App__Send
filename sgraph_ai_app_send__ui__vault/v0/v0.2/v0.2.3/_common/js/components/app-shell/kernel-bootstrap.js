/* =================================================================================
   Kernel bootstrap — port-side handshake + vault open + handler registration  (Phase 2)

   globalThis.bootKernelOnPort(port, opts) — runs the child kernel's boot sequence
   AGAINST AN ALREADY-RECEIVED PORT. Splitting this out (vs. inlining inside the
   build-time KERNEL_BOOTSTRAP_JS) means the production code is also the code under
   test — addresses reviewer finding M4 (the prior bootstrap had no test coverage
   because tests used a hand-rolled TestKernel).

   The window.message listener that receives the port is still inline in
   build-kernel-shell-bundle.py — that line cannot move into a unit test (it touches
   the `window` object). But everything AFTER the port is in hand lives here.

   opts = {
     // factories — injected so tests can pass synthetic implementations without mocks
     vaultFactory  (vaultKey, accessToken, endpoint) → Promise<SGVault-like>
     dataSourceFactory (vault, accessToken)         → VaultDataSource-like
     appJsonReader (vault)                          → Promise<appJsonObject|null>
     // configuration
     endpointFor   (vaultKey)                       → endpoint URL (defaults to dev)
     cid           handshake cid (echoed from init message)
     expectSensitive  default true
     onReady       optional callback(payload) after handlers registered
     onError       optional callback(err)
   }

   Returns the SecureChannel (already past handshake; secrets handler registered).
   The caller can await secrets delivery via `await new Promise(r => opts.onReady=r)`
   or by inspecting the resolved channel.
   ================================================================================= */

;(function () {
    'use strict';

    function need(name, val) {
        if (val == null) throw new Error('bootKernelOnPort: missing ' + name);
        return val;
    }
    function codeError(code, msg) { const e = new Error(msg); e.code = code; return e; }

    // Default factories use the shipped libraries. Tests override.
    // vaultFactory(vaultKey, accessToken, endpoint, boot) — `boot` carries the parent's
    // per-mount options ({ cloneBranch, mountLabel, mountKind }); tests may ignore it.
    function _defaultVaultFactory(SGSend, SGVault) {
        return async function (vaultKey, accessToken, endpoint, boot) {
            boot = boot || {};
            const sgSend = new SGSend({ endpoint: endpoint });
            if (accessToken) sgSend.token = accessToken;
            const Crypto = globalThis.SGVaultCrypto;
            // Same key-input normalisation both shells run: strip sgit prefixes, and open a
            // READ credential (<64-hex>:<vault_id>) read-only — the child derives the ref id
            // itself (ref discovery needs no passphrase). This is what lets a parent holding
            // only a child's read key (an ro-links record) mount it at all.
            const key    = (Crypto && Crypto.stripKeyPrefix) ? Crypto.stripKeyPrefix(vaultKey) : vaultKey;
            const roCred = (Crypto && Crypto.parseReadOnlyCredential) ? Crypto.parseReadOnlyCredential(key) : null;
            if (roCred) {
                const creds = await Crypto.deriveReadOnlyCreds(roCred.vaultId, roCred.readKeyHex);
                return SGVault.openReadOnly(sgSend, creds.vaultId, creds.readKeyB64, creds.refFileId);
            }
            return SGVault.open(sgSend, key, { cloneBranch: boot.cloneBranch || 'web-ui' });
        };
    }
    function _defaultDataSourceFactory(VaultDataSource) {
        return function (vault, accessToken) { return new VaultDataSource(vault, accessToken || null); };
    }
    // Reads the CHILD's own app.json (its policy — the second gate). Goes through the data
    // source: a real SGVault has getFile(folder, name), not getFileBytes — reading the vault
    // directly threw, the reader returned null and every child write was EPERM "no
    // capability" (found by the declared-mounts browser e2e). Falls back to the vault for
    // harnesses whose synthetic vault exposes getFileBytes.
    async function _defaultAppJsonReader(vault, dataSource) {
        // Try the new location first (.vault/app.json), then the shipped legacy root.
        for (const p of ['.vault/app.json', 'app.json']) {
            try {
                const bytes = (dataSource && typeof dataSource.getFileBytes === 'function')
                    ? await dataSource.getFileBytes(p)
                    : await vault.getFileBytes(p);
                if (!bytes) continue;
                const txt   = new TextDecoder().decode(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
                return JSON.parse(txt);
            } catch (_) { /* not found / not JSON → try next */ }
        }
        return null;
    }

    async function bootKernelOnPort(port, opts) {
        opts = opts || {};
        need('port', port);
        const SC = need('SecureChannel', globalThis.SecureChannel);
        const AP = need('AppPermissions', globalThis.AppPermissions);
        const registerHandlers = need('registerKernelVfsHandlers', globalThis.registerKernelVfsHandlers);

        // The shipped libraries are top-level `class` declarations in classic <script>s:
        // global LEXICAL bindings, NOT globalThis properties — `globalThis.SGSend` is
        // undefined inside the kernel shell and the real boot died with "SGSend is not a
        // constructor" (only the test override, which sets globalThis.*, ever worked).
        // An explicit globalThis.* (a harness override) wins; otherwise resolve the lexical
        // binding by name in this document's scope.
        const SGSendCtor     = globalThis.SGSend          || ((typeof SGSend          !== 'undefined') ? SGSend          : undefined);
        const SGVaultCtor    = globalThis.SGVault         || ((typeof SGVault         !== 'undefined') ? SGVault         : undefined);
        const VaultDSCtor    = globalThis.VaultDataSource || ((typeof VaultDataSource !== 'undefined') ? VaultDataSource : undefined);
        if (!globalThis.SGVaultCrypto && typeof SGVaultCrypto !== 'undefined') globalThis.SGVaultCrypto = SGVaultCrypto;
        const vaultFactory      = opts.vaultFactory      || _defaultVaultFactory(SGSendCtor, SGVaultCtor);
        const dataSourceFactory = opts.dataSourceFactory || _defaultDataSourceFactory(VaultDSCtor);
        const appJsonReader     = opts.appJsonReader     || _defaultAppJsonReader;
        const endpointFor       = opts.endpointFor       || function () { return opts.endpoint || 'https://dev.send.sgraph.ai'; };

        const ch = await SC.accept(port, { expectSensitive: opts.expectSensitive !== false, cid: opts.cid });

        // Register the `secrets` handler synchronously after accept resolves — M4: the
        // race in the prior bootstrap was that handlers were attached inside the secrets
        // handler body, after async work; a second secrets message arriving in the same
        // tick could double-invoke. Idempotence is the responder's job.
        let booted = false;
        ch.handle('secrets', async function (payload) {
            // `secrets` is a fire-and-forget send: a thrown error would be swallowed by the
            // channel and the parent would only ever see a 10s "boot timeout". Log it here
            // and tell the parent WHY (boot-error) so it fails fast with the real cause.
            try { return await _bootWithSecrets(payload); }
            catch (err) {
                const info = { code: (err && err.code) || 'EUNREACH', message: (err && err.message) || String(err) };
                try { console.error('[kernel] boot failed', info.code, info.message); } catch (_) {}
                try { await ch.send('boot-error', info); } catch (_) {}
                throw err;
            }
        });

        async function _bootWithSecrets(payload) {
            if (booted) throw codeError('EPROTO', 'secrets replay');
            booted = true;
            const vaultKey = payload && payload.vaultKey;
            const token    = payload && payload.accessToken;
            // M5: endpoint comes from the secrets payload (or factory), never hardcoded.
            const endpoint = (payload && payload.endpoint) || endpointFor(vaultKey);
            if (!vaultKey) throw codeError('EPROTO', 'missing vaultKey');

            const boot = {
                cloneBranch: (payload && payload.cloneBranch) || null,
                mountLabel:  (payload && payload.mountLabel)  || null,
                mountKind:   (payload && payload.mountKind)   || null
            };
            let vault;
            try { vault = await vaultFactory(vaultKey, token || null, endpoint, boot); }
            catch (err) { throw codeError('EUNREACH', 'vault open failed: ' + (err && err.message || err)); }

            // Account-tier token. Order: the parent-supplied token, else the vault's OWN
            // embedded token (.vault/access-token.json) — the same read both shells do on
            // open, so a full-key child is writable without the parent forwarding ITS token.
            // A read-credential child (writable === false) has _writeKey = null and cannot
            // write at the VAULT tier whatever token it finds (07 Sep analysis §2), so it is
            // never marked writable — the data source must say read-only, not fail at push.
            const canWrite = !!vault && vault.writable !== false;
            let effectiveToken = token || null;
            if (canWrite && !effectiveToken && typeof vault.readEmbeddedAccessToken === 'function') {
                try { effectiveToken = await vault.readEmbeddedAccessToken(); } catch (_) { effectiveToken = null; }
                if (effectiveToken && vault._sgSend) vault._sgSend.token = effectiveToken;
            }
            if (!canWrite) effectiveToken = null;

            // Provenance trailer for every commit this kernel makes on the parent's behalf.
            if (boot.mountLabel && vault && typeof vault === 'object') {
                const label = String(boot.mountLabel).replace(/[\r\n]+/g, ' ').slice(0, 80);
                vault._commitTrailer = 'Via-Mount: ' + label + ' (' + (boot.mountKind === 'declared' ? 'declared' : 'runtime') + ')';
            }

            const dataSource = dataSourceFactory(vault, effectiveToken);
            // Both shells expand every lazy sub-folder on open; a child kernel must too, or
            // its listings show folders as empty and a nested write drops siblings.
            if (typeof dataSource.loadAllSubTrees === 'function') {
                try { await dataSource.loadAllSubTrees(); }
                catch (err) { throw codeError('EUNREACH', 'vault tree load failed: ' + (err && err.message || err)); }
            }
            const appJson    = await appJsonReader(vault, dataSource);
            const perm       = AP.parsePermissions(appJson);

            registerHandlers(ch, {
                dataSource: dataSource,
                perm:       perm,
                vault:      vault,
                onUpdated:  opts.onUpdated || null
            });

            // B7: monitored-mode handler. Each kernel has a local broker (it MAY become
            // a parent itself by spawning children later). VivMonitor registers the
            // 'broker.log' responder; CLOSED by default → parent's request returns
            // ECONSENT. Surface { broker, monitor } on the channel for opt-in toggling.
            if (globalThis.KernelBroker && globalThis.VivMonitor) {
                const childBroker = new globalThis.KernelBroker({ kernelId: 'k-' + (vault._vaultId || 'child') });
                const monitor     = globalThis.VivMonitor.registerOnChannel(ch, childBroker, { mode: opts.monitorMode || 'closed' });
                ch._broker  = childBroker;
                ch._monitor = monitor;
            }

            // Signal ready to the parent (responder.send works both ways — review B1).
            const readyPayload = { kernelId: 'k-' + (vault._vaultId || (Date.now().toString(36))) };
            try { await ch.send('ready', readyPayload); } catch (_) {}
            if (typeof opts.onReady === 'function') {
                try { opts.onReady(readyPayload); } catch (_) {}
            }
            return readyPayload;
        }

        return ch;
    }

    globalThis.bootKernelOnPort = bootKernelOnPort;
})();
