/* =================================================================================
   SecureChannel — port-anchored, PKI-protected authenticated channel  (Phase 1)

   globalThis.SecureChannel:
     SecureChannel.create(iframeOrPort, { sensitiveKey?, cid? })
        → channel handle (initiator). Performs the handshake (§02 §2.4):
          - exchange sign-pub + ECDH-pub over the port (trust anchor = the port itself);
          - if sensitiveKey:true, the responder also signs its keys with a one-use K1
            minted by the initiator (so any third party can later verify the pinning).
          - derive a shared AES-GCM key for encrypted payloads (forward secrecy via
            the long-term ECDH keypairs is per-direction; iv is per-message random).
     SecureChannel.accept(port, { expectSensitive? })
        → channel handle (responder).

   Per channel:
     ch.request(type, payload, { sensitive? })  → Promise<result>     (initiator only)
     ch.send(type, payload, { sensitive? })                            (both directions
                                                                       — events + replies)
     ch.handle(type, fn)                                               (responder side)
     ch.on(type, fn)                                                   (events)
     ch.close()                                                        → subsequent
                                                                       send/request → EUNREACH

   Loaded AFTER secure-channel-envelope.js. Sets globalThis.SecureChannel.
   ================================================================================= */

;(function () {
    'use strict';

    const E = globalThis.Envelope;
    if (!E) throw new Error('SecureChannel requires Envelope (load secure-channel-envelope.js first)');

    function codeError(code, msg) { const e = new Error(msg); e.code = code; return e; }

    // ─── Bootstrap iframe → MessagePort (THE ONE window.postMessage) ────────────────
    async function bootstrapFromIframe(iframe, cid) {
        // Wait for load if not already
        if (iframe.contentWindow == null) {
            await new Promise((r) => iframe.addEventListener('load', r, { once: true }));
        }
        const { port1, port2 } = new MessageChannel();
        const initMsg = { type: 'init', cid, mode: 'message-boot' };  // NO secrets
        iframe.contentWindow.postMessage(initMsg, '*', [port2]);       // transfer port2
        return port1;
    }

    // ─── Channel ─────────────────────────────────────────────────────────────────────

    class SecureChannel {
        constructor({ role, cid }) {
            this._role          = role;
            this._cid           = cid || E.randId('ch');
            this._port          = null;
            this._ownSign       = null;        // own sign keypair
            this._ownEcdh       = null;        // own ECDH keypair
            this._peerSignPub   = null;        // pinned after handshake
            this._sharedEncKey  = null;        // derived after handshake
            this._handshakeDone = false;
            this._closed        = false;
            this._handlers      = new Map();   // request type → async fn
            this._listeners     = new Map();   // event type   → Set<fn>
            this._pending       = new Map();   // request id   → { resolve, reject }
            this._replay        = new E.ReplayGuard();
            this._sendCounter   = 0;           // ensures unique nonces alongside randomness
            // Pre-handshake message dispatcher (single port listener; routes by msg.type)
            this._handshakeWaits = new Map();  // type → resolve fn
            this._onPortMessage  = (event) => this._dispatch(event.data);
        }

        static async create(iframeOrPort, opts) {
            opts = opts || {};
            const ch = new SecureChannel({ role: 'initiator', cid: opts.cid });
            ch._port = iframeOrPort instanceof MessagePort
                ? iframeOrPort
                : await bootstrapFromIframe(iframeOrPort, ch._cid);
            ch._port.addEventListener('message', ch._onPortMessage);
            if (ch._port.start) ch._port.start();
            await ch._handshakeAsInitiator(opts.sensitiveKey === true);
            ch._handshakeDone = true;
            return ch;
        }

        static async accept(port, opts) {
            opts = opts || {};
            const ch = new SecureChannel({ role: 'responder', cid: opts.cid });
            ch._port = port;
            ch._port.addEventListener('message', ch._onPortMessage);
            if (ch._port.start) ch._port.start();
            await ch._handshakeAsResponder(opts.expectSensitive !== false);
            ch._handshakeDone = true;
            return ch;
        }

        // ── Outgoing API ────────────────────────────────────────────────────────────

        async send(type, payload, opts) {
            opts = opts || {};
            if (this._closed) throw codeError('EUNREACH', 'channel closed');
            if (!this._handshakeDone) throw codeError('EPROTO', 'channel not ready');
            const dir = this._role === 'initiator' ? 'down' : 'up';
            await this._post({ type, payload, dir, enc: !!opts.sensitive });
        }

        async request(type, payload, opts) {
            if (this._role !== 'initiator') {
                throw codeError('EPROTO', 'directional: responder cannot initiate requests');
            }
            opts = opts || {};
            if (this._closed) throw codeError('EUNREACH', 'channel closed');
            if (!this._handshakeDone) throw codeError('EPROTO', 'channel not ready');
            const id = E.randId('req');
            const reply = new Promise((resolve, reject) => {
                this._pending.set(id, { resolve, reject });
            });
            await this._post({ type, payload, dir: 'down', id, enc: !!opts.sensitive });
            return reply;
        }

        handle(type, fn) { this._handlers.set(type, fn); return this; }
        on(type, fn) {
            if (!this._listeners.has(type)) this._listeners.set(type, new Set());
            this._listeners.get(type).add(fn);
            return this;
        }

        close() {
            this._closed = true;
            try { this._port.removeEventListener('message', this._onPortMessage); } catch (_) {}
            try { this._port.close(); } catch (_) {}
            // Reject pending requests
            for (const [id, p] of this._pending) p.reject(codeError('EUNREACH', 'channel closed'));
            this._pending.clear();
        }

        // ── Internals ───────────────────────────────────────────────────────────────

        async _post({ type, payload, dir, id, enc }) {
            // unique-enough nonce: random hex || counter
            const nonce = E.randNonce() + (this._sendCounter++).toString(16);
            const env = await E.pack({
                v: 1, cid: this._cid, dir, id: id == null ? null : id, type, nonce,
                payload, enc: !!enc,
                signKey: this._ownSign.privateKey,
                encKey:  enc ? this._sharedEncKey : null
            });
            try { this._port.postMessage(env); } catch (err) { throw codeError('EUNREACH', 'postMessage failed: ' + err.message); }
        }

        async _dispatch(raw) {
            // Pre-handshake: route by raw type, buffering anything that arrives before its _waitFor.
            if (!this._handshakeDone) {
                const t = raw && raw.type;
                if (this._handshakeWaits.has(t)) {
                    const res = this._handshakeWaits.get(t);
                    this._handshakeWaits.delete(t);
                    res(raw);
                } else {
                    // L4: bound the pre-handshake buffer. A noisy/forged peer could otherwise
                    // pump unknown types and grow memory unbounded before the handshake completes.
                    // The handshake only needs 'hello' | 'introduce' | 'ready' — any unknown type
                    // beyond a small allowance is dropped.
                    if (!this._preHandshakeBuf) this._preHandshakeBuf = new Map();
                    if (!this._preHandshakeBuf.has(t)) this._preHandshakeBuf.set(t, []);
                    const q = this._preHandshakeBuf.get(t);
                    if (q.length < 8 && this._preHandshakeBuf.size < 8) {
                        q.push(raw);
                    }
                }
                return;
            }
            // Post-handshake: every message MUST be a signed envelope.
            let msg;
            try {
                msg = await E.unpack(raw, {
                    peerSignKey: this._peerSignPub,
                    decKey:      this._sharedEncKey
                });
                this._replay.check(msg);
            } catch (err) {
                // Fail-closed: drop silently, log a debug line. Misroute/forged is a security event,
                // not an application error.
                console.warn('[secure-channel] dropped envelope', err.code || 'EPROTO', err.message);
                return;
            }
            // M6: pin to this channel's cid. A signature-valid envelope from a *different*
            // channel pair (same code, different ports) would otherwise be processed here
            // if a peer's port were ever cross-wired. Reject silently.
            if (msg.cid !== this._cid) return;

            // Replies first — match against pending requests.
            // Two reply types so binary values aren't wrapped in JSON (review B2):
            //   __ok  : payload IS the success value (bytes or any JSON)
            //   __err : payload IS { code, message }
            if ((msg.type === '__ok' || msg.type === '__err') && msg.id && this._pending.has(msg.id)) {
                const p = this._pending.get(msg.id);
                this._pending.delete(msg.id);
                if (msg.type === '__err') {
                    const e = msg.payload || {};
                    p.reject(codeError(e.code || 'EPROTO', e.message || 'remote error'));
                } else {
                    p.resolve(msg.payload);
                }
                return;
            }

            // Handler (request → reply)
            if (this._handlers.has(msg.type)) {
                const fn  = this._handlers.get(msg.type);
                const dir = this._role === 'initiator' ? 'down' : 'up';
                try {
                    const value = await fn(msg.payload, { cid: msg.cid, ts: msg.ts });
                    if (msg.id) await this._post({ type: '__ok', payload: value, dir, id: msg.id, enc: msg.enc });
                } catch (err) {
                    if (msg.id) await this._post({ type: '__err', payload: { code: err.code || 'EPROTO', message: err.message || String(err) }, dir, id: msg.id, enc: false });
                }
                return;
            }

            // Event listener
            if (this._listeners.has(msg.type)) {
                for (const fn of this._listeners.get(msg.type)) {
                    try { fn(msg.payload); } catch (_) {}
                }
                return;
            }
            // Otherwise: unknown type, silently dropped (T11 + C11 — resilience)
        }

        _waitFor(type) {
            // If a matching message already arrived (race-safe), pick from the buffer.
            if (this._preHandshakeBuf && this._preHandshakeBuf.has(type)) {
                const q = this._preHandshakeBuf.get(type);
                if (q.length > 0) return Promise.resolve(q.shift());
            }
            return new Promise((resolve) => { this._handshakeWaits.set(type, resolve); });
        }

        // ── Handshake — initiator side ──────────────────────────────────────────────

        async _handshakeAsInitiator(useK1) {
            this._ownSign = await E.generateSignKeypair();
            this._ownEcdh = await E.generateEcdhKeypair();
            const ownSignPub = await E.exportSpki(this._ownSign.publicKey);
            const ownEcdhPub = await E.exportSpki(this._ownEcdh.publicKey);

            let k1Pub = null;
            const hello = { type: 'hello', cid: this._cid, mode: useK1 ? 'k1' : 'simple',
                            initSignPub: ownSignPub, initEcdhPub: ownEcdhPub };
            if (useK1) {
                const k1 = await E.generateEphemeralBootKey();
                k1Pub = k1.publicKey;
                hello.k1priv = await E.exportPkcs8(k1.privateKey);
            }

            // Send hello, then wait for introduce
            const waitIntro = this._waitFor('introduce');
            this._port.postMessage(hello);
            const intro = await waitIntro;

            // Pin peer keys
            if (useK1) {
                // Verify intro.sig over (intro.respSignPub || intro.respEcdhPub) with K1.pub
                const k1PubKey = k1Pub;
                const toVerify = E._concatBytes(E._toU8(intro.respSignPub), E._toU8(intro.respEcdhPub));
                const ok = await E.verifyBytes(intro.sig, toVerify, k1PubKey);
                if (!ok) throw codeError('EPROTO', 'K1 sig verify failed');
                // Retire K1
                k1Pub = null;
            }
            this._peerSignPub = await E.importSpkiEcdsa(intro.respSignPub);
            const peerEcdhPub = await E.importSpkiEcdh(intro.respEcdhPub);
            this._sharedEncKey = await E.deriveEncKey(this._ownEcdh.privateKey, peerEcdhPub);

            // Send pki-ready (still raw, NOT through Envelope — the handshake messages are
            // pre-signature-pinning and trust the port itself).
            this._port.postMessage({ type: 'ready', cid: this._cid });
        }

        // ── Handshake — responder side ──────────────────────────────────────────────

        async _handshakeAsResponder(expectSensitive) {
            this._ownSign = await E.generateSignKeypair();
            this._ownEcdh = await E.generateEcdhKeypair();
            const ownSignPub = await E.exportSpki(this._ownSign.publicKey);
            const ownEcdhPub = await E.exportSpki(this._ownEcdh.publicKey);

            // Wait for hello
            const hello = await this._waitFor('hello');
            // Validate hello shape
            if (!hello.initSignPub || !hello.initEcdhPub) throw codeError('EPROTO', 'malformed hello');
            this._peerSignPub = await E.importSpkiEcdsa(hello.initSignPub);
            const peerEcdhPub = await E.importSpkiEcdh(hello.initEcdhPub);
            this._sharedEncKey = await E.deriveEncKey(this._ownEcdh.privateKey, peerEcdhPub);

            // Build introduce
            const intro = { type: 'introduce', cid: this._cid, respSignPub: ownSignPub, respEcdhPub: ownEcdhPub };
            if (hello.mode === 'k1') {
                // Sign (ownSignPub || ownEcdhPub) with K1.priv. Import K1 first.
                const k1Priv = await E.importPkcs8Ecdsa(hello.k1priv);
                const toSign = E._concatBytes(ownSignPub, ownEcdhPub);
                intro.sig = await E.signBytes(toSign, k1Priv);
            }
            const waitReady = this._waitFor('ready');
            this._port.postMessage(intro);
            await waitReady;
        }
    }

    globalThis.SecureChannel = SecureChannel;
})();
