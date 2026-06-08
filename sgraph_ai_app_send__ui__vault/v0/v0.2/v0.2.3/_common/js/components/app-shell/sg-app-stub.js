/* =================================================================================
   sg-app-stub — the secret-less iframe-side `window.sg.*` API  (Phase 3 sub-step C)

   THIS MODULE LIVES IN THE APP IFRAME, NOT IN THE KERNEL.

   Today's app-shell.js inlines a `window.sg.*` API that has direct access to vault
   internals because the iframe is same-origin with the kernel (the security finding
   in SECURITY-same-origin-app-bypass.md). Phase 3's goal is to make the app frame
   null-origin and have it talk to the kernel ONLY via a SecureChannel — making the
   permission model a real boundary (not advisory).

   This module is the app-side end of that. It:
     1. Sets up the single window.message listener that grabs the inbound port from
        the kernel's bootstrap. THE ONLY window-level listener; self-removes.
     2. Accepts a SecureChannel on that port (port-anchored authentication).
     3. Exposes window.sg.* as a thin RPC layer — every method is a
        SecureChannel.request to the kernel. NO secrets are held in this frame.

   It is the symmetric peer of the kernel-side handlers (sub-step A's work).

   Notes / scope:
     - Only the surface is here. The kernel side must register handlers for each
       method (sub-steps A + B) before this stub is wired into _buildAppSrcdoc.
     - Until sub-step E (drop allow-same-origin), the LEGACY inline bridge in
       app-shell.js continues to handle the live traffic. This stub is dead code
       loaded alongside, so feature parity can be confirmed app-by-app (sub-step D)
       before the breaking flip.
     - This file is INLINED into the app srcdoc at mount time (sub-step C). It
       must therefore be self-contained — no `<script src>` of vault paths and no
       reliance on globals other than SecureChannel.
   ================================================================================= */

;(function () {
    'use strict';

    if (typeof globalThis.SecureChannel === 'undefined') {
        // sg-app-stub is loaded BEFORE the app's own code; it requires SecureChannel
        // to have been inlined ahead of it (see scripts/build-kernel-shell-bundle.py
        // ordering for the kernel side — the stub bundle mirrors it).
        console.warn('[sg-app-stub] SecureChannel not loaded; window.sg will not be available');
        return;
    }

    let _channel = null;            // SecureChannel once handshake completes
    let _ready   = false;
    const _onReady = [];            // queued callers awaiting _ready

    // ─── Kernel→app event channel (sg.on / sg.off) ──────────────────────────────────
    // The kernel pushes events as a single channel message: send('sg-event', {name, payload}).
    // Whether a given event is delivered at all is decided KERNEL-side by the host_events
    // allowlist (AppHostEvents) — this frame just fans the message out to subscribers.
    // Registering for a name the kernel never sends is a harmless no-op: the handler
    // simply never fires (indistinguishable from "no events occurred").
    const _eventHandlers = new Map();   // name → Set<callback>   ('*' = wildcard)

    function _dispatchEvent(name, payload) {
        if (!name) return;
        const set = _eventHandlers.get(name);
        if (set) for (const cb of set) { try { cb(payload); } catch (_) {} }
        const star = _eventHandlers.get('*');
        if (star) for (const cb of star) { try { cb(name, payload); } catch (_) {} }
    }

    function _whenReady() {
        if (_ready) return Promise.resolve(_channel);
        return new Promise((resolve) => _onReady.push(resolve));
    }

    function _req(type, payload, opts) {
        opts = opts || {};
        return _whenReady().then((ch) => ch.request(type, payload, opts));
    }

    function _send(type, payload, opts) {
        opts = opts || {};
        return _whenReady().then((ch) => ch.send(type, payload, opts));
    }

    // ─── The ONE window.message listener ────────────────────────────────────────────
    // The kernel sends a single { type:'init', cid } message with a transferred port.
    // We grab the port, complete the SecureChannel handshake (port-anchored authentication,
    // so the port itself is the proof of peer identity), and never listen on `window` again.

    function _bootstrap(e) {
        if (!e.data || e.data.type !== 'init') return;
        window.removeEventListener('message', _bootstrap);   // self-remove
        const port = e.ports && e.ports[0];
        if (!port) {
            console.error('[sg-app-stub] init missing transferred port');
            return;
        }
        // The APP is the channel-INITIATOR (it makes requests like vfs.read). The kernel
        // ran SecureChannel.accept on the other end. The directional rule ("responder
        // cannot initiate requests") therefore correctly forbids the kernel from invoking
        // RPCs on the app — only events (kernel→app) are allowed via send(), which is
        // what we use for `sg.ready` below.
        SecureChannel.create(port, { sensitiveKey: true, cid: e.data.cid }).then((ch) => {
            _channel = ch;
            // Kernel sends a 'sg.ready' event once the vault is open and handlers are
            // registered, optionally with hydration metadata (vaultName, isRO, perm).
            ch.on('sg.ready', (meta) => {
                // Populate sg.app.* from the kernel-pushed metadata
                if (meta && typeof meta === 'object') {
                    window.sg.app.vaultName = meta.vaultName || '';
                    window.sg.app.vaultId   = meta.vaultId   || '';
                    window.sg.app.writable  = !!meta.writable;
                    window.sg.app.isRO      = !!meta.isRO;
                    window.sg.app.appTitle  = meta.appTitle  || '';
                }
                _ready = true;
                const q = _onReady.splice(0);
                for (const r of q) try { r(_channel); } catch (_) {}
                // Fire a DOM event so app code can hook the ready moment without polling.
                try {
                    window.dispatchEvent(new CustomEvent('sg-app:ready', { detail: meta || null }));
                } catch (_) {}
            });
            // Kernel→app events arrive as a single 'sg-event' message carrying {name, payload}.
            // Fan them out to sg.on subscribers (the kernel already applied the host_events gate).
            ch.on('sg-event', (env) => {
                if (env && typeof env === 'object') _dispatchEvent(env.name, env.payload);
            });
            // Tell the kernel we're alive and ready for it to send 'sg.ready'.
            return ch.send('sg.alive', { ts: Date.now() });
        }).catch((err) => {
            console.error('[sg-app-stub] handshake failed', err);
        });
    }

    window.addEventListener('message', _bootstrap, { once: true });

    // ─── window.sg.* — the secret-less app-side API ────────────────────────────────
    //
    // EVERY method is a SecureChannel.request to the kernel. The kernel runs the
    // permission check (AppPermissions.isFloor + AppPermissions.can) and either
    // performs the op or rejects with a coded error (EPERM, EPROTECTED, ECONSENT,
    // EREADONLY, ENOENT, EUNREACH, EPROTO).
    //
    // CRITICAL: this stub holds NO secrets. Not the vault key, not the access token,
    // not the data source. The kernel holds those and acts on the app's behalf via
    // capability-checked RPC. Even if app code is hostile (Phase 3's threat model),
    // it cannot bypass `sg.*` — there is no inline data source to reach for.

    window.sg = {
        // ── vfs ──────────────────────────────────────────────────────────────────
        vfs: {
            read:     (path)              => _req('vfs.read',  { path }, { sensitive: true }),
            readText: (path)              => _req('vfs.read',  { path }, { sensitive: true })
                                                .then((buf) => new TextDecoder().decode(buf instanceof Uint8Array ? buf : new Uint8Array(buf))),
            list:     (path)              => _req('vfs.list',  { path: path || '' }),
            write:    (path, data, opts)  => _req('vfs.write', { path, data, credential: opts && opts.credential }, { sensitive: true }),
            'delete': (path)              => _req('vfs.delete',{ path })
        },

        // ── fs (mutations beyond vfs.write) ──────────────────────────────────────
        fs: {
            move:     (from, to)          => _req('fs.move',   { from, to }),
            'delete': (path)              => _req('fs.delete', { path }),
            mkdir:    (path)              => _req('fs.mkdir',  { path })
        },

        // ── vault lifecycle / mounts ─────────────────────────────────────────────
        vault: {
            create:   (path, label)       => _req('vault.create',  { path, label }),
            unlink:   (path)              => _req('vault.unlink',  { path }),
            'delete': (path)              => _req('vault.delete',  { path }),
            mount:    (opts)              => _req('vault.mount',   opts || {}),
            unmount:  (mountId)           => _req('vault.unmount', { mountId }),
            mounts:   ()                  => _req('vault.mounts',  {})
        },

        // ── history (read-only commit/tree access) ───────────────────────────────
        history: {
            log:      (opts)              => _req('history.log',     { opts: opts || {} }),
            list:     (commitId, path)    => _req('history.list',    { commitId, path: path || '' }),
            read:     (commitId, path)    => _req('history.read',    { commitId, path }, { sensitive: true }),
            readText: (commitId, path)    => _req('history.read',    { commitId, path }, { sensitive: true })
                                                .then((buf) => new TextDecoder().decode(buf instanceof Uint8Array ? buf : new Uint8Array(buf))),
            readBlob: (blobId)            => _req('history.readBlob',{ blobId }, { sensitive: true })
        },

        // ── sync (kernel-side commit/push/pull) ──────────────────────────────────
        sync: {
            status:   ()                  => _req('sync.status',  {}),
            check:    ()                  => _req('sync.check',   {}),
            push:     ()                  => _req('sync.push',    {}),
            pull:     ()                  => _req('sync.pull',    {}),
            refresh:  ()                  => _req('sync.refresh', {})
        },

        // ── auth (no secrets stored client-side; kernel manages tokens) ──────────
        auth: {
            setKey:   (key)               => _req('auth.setKey',  { key }, { sensitive: true }),
            check:    (key)               => _req('auth.check',   { key }, { sensitive: true }),
            clear:    ()                  => _req('auth.clear',   {})
        },

        // ── ui (consent + messages on the HUD; host chrome, not app-rendered) ────
        ui: {
            requestPermission: (verb, path) => _req('ui.requestPermission', { verb, path }),
            message:  (text, type, opts)  => _send('ui.message',  { text: String(text || ''), msgType: type || 'info', ttl: opts && opts.ttl, handle: opts && opts.handle }),
            dismiss:  (handle)            => _send('ui.message',  { handle, dismiss: true })
        },

        // ── broker (this kernel's per-edge log; for the vaults page) ─────────────
        broker: {
            log:      (opts)              => _req('broker.log',   opts || {})
        },

        // ── app metadata, populated by kernel's sg.ready payload ────────────────
        // These are properties, not RPCs — they're populated on 'sg.ready'.
        app: {
            vaultName: '',
            vaultId:   '',
            writable:  false,
            isRO:      false,
            appTitle:  '',
            selfPath:  '',    // set by the kernel via injected page-layout meta when applicable
        },

        // ── events (kernel→app push; gated kernel-side by app.json.host_events) ──
        // sg.on('inbox.new-messages', cb) — subscribe. Returns an unsubscribe handle.
        // sg.on('*', (name, payload) => ...) — wildcard over events this app may receive.
        // Subscribing for a name the kernel never pushes is a silent no-op.
        on: (name, cb) => {
            if (typeof cb !== 'function' || !name) return () => {};
            if (!_eventHandlers.has(name)) _eventHandlers.set(name, new Set());
            _eventHandlers.get(name).add(cb);
            return () => window.sg.off(name, cb);
        },
        off: (name, cb) => {
            const set = _eventHandlers.get(name);
            if (set) { set.delete(cb); if (set.size === 0) _eventHandlers.delete(name); }
        },

        // Internal accessor for tests and the rare app that needs to await ready
        // before its first call. Most apps don't need this — _req() awaits internally.
        whenReady: _whenReady
    };
})();
