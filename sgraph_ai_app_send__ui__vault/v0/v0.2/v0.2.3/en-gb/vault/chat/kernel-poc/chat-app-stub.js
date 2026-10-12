/* =================================================================================
   chat-app-stub — minimal app-side bridge for the Vault Chat kernel PoC.

   This is a PoC-scoped equivalent of sg-app-stub.js that intentionally uses ONLY
   SecureChannel.request/handle (the request-reply path) so it doesn't depend on
   send/on event delivery. The security properties demonstrated are the same:
   null-origin app, no secrets in the iframe, every vault op gated by the kernel.

   In production, the chat would use the shipped sg-app-stub on the canonical mount
   path; this PoC stub is the integration seam for the MVP.
   ================================================================================= */
;(function () {
    'use strict';

    if (typeof globalThis.SecureChannel === 'undefined') {
        console.warn('[chat-app-stub] SecureChannel not loaded'); return;
    }

    let _channel = null;
    const _onReady = [];
    let _ready = false;

    function _whenReady() { return _ready ? Promise.resolve(_channel) : new Promise((r) => _onReady.push(r)); }
    function _req(type, payload, opts) { opts = opts || {}; return _whenReady().then((ch) => ch.request(type, payload, opts)); }

    window.addEventListener('message', async function _bootstrap(e) {
        if (!e.data || e.data.type !== 'init') return;
        window.removeEventListener('message', _bootstrap);
        const port = e.ports && e.ports[0];
        if (!port) { console.error('[chat-app-stub] init missing port'); return; }

        try {
            _channel = await SecureChannel.create(port, { sensitiveKey: true, cid: e.data.cid });
            _ready = true;
            // App metadata is set immediately for the PoC; production stubs await an
            // 'sg.ready' event from the kernel, but we don't need it for the loop.
            window.sg.app.vaultName = 'PoC vault';
            window.sg.app.writable  = true;
            window.sg.app.isRO      = false;
            window.sg.app.appTitle  = 'Vault Chat (kernel PoC)';
            const q = _onReady.splice(0);
            for (const r of q) try { r(_channel); } catch (_) {}
            window.dispatchEvent(new CustomEvent('sg-app:ready', { detail: window.sg.app }));
        } catch (err) {
            console.error('[chat-app-stub] handshake failed', err);
        }
    });

    window.sg = {
        vfs: {
            read:     (path)              => _req('vfs.read',  { path }, { sensitive: true }),
            readText: (path)              => _req('vfs.read',  { path }, { sensitive: true })
                                                .then((buf) => new TextDecoder().decode(buf instanceof Uint8Array ? buf : new Uint8Array(buf))),
            list:     (path)              => _req('vfs.list',  { path: path || '' }),
            write:    (path, data, opts)  => _req('vfs.write', { path, data, credential: opts && opts.credential }, { sensitive: true }),
            'delete': (path)              => _req('vfs.delete',{ path }),
        },
        ui: {
            // Drive ui.message as a REQUEST instead of an event so the parent's
            // handle() captures it deterministically. PoC-only; production sends events.
            message: (text, type)         => _req('ui.message', { text: String(text || ''), msgType: type || 'info' }),
            dismiss: ()                   => Promise.resolve(),
        },
        app: { vaultName: '', vaultId: '', writable: false, isRO: false, appTitle: '', selfPath: '' },
        whenReady: _whenReady,
    };
})();
