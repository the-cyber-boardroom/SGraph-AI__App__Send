/* =================================================================================
   KernelParent — parent-side ViV orchestration  (Phase 2, testable seam)

   globalThis.KernelParent — owns this kernel's mount table + broker sidecar and
   runs the cross-mount relay (Edge 2). This is the parent-side mirror of
   kernel-app-handlers.js: it extracts the orchestration out of the DOM-coupled
   app-shell.js so the relay + broker-mediation + mount lifecycle are unit-tested
   against a real child kernel (no DOM, no mocks). The only piece that CANNOT move
   here is the iframe spawn — that's injected as `spawnChannel`, so app-shell
   supplies the `document.createElement('iframe')` + srcdoc path while tests supply
   a MessageChannel-backed child running bootKernelOnPort.

   Closes the same gap H1/M4 had on the child side: the orchestration that ships is
   now the orchestration under test.

   opts = {
     kernelId            string — labels broker entries
     spawnChannel(ref, creds) → Promise<SecureChannel>
                         brings up a ready child channel (iframe + handshake +
                         secrets + ready-wait on the app-shell side; a wired
                         SecureChannel pair on the test side). MUST clean up its
                         own resources (iframe) if it throws.
     resolveCredentials(ref) → Promise<{ vaultKey, accessToken?, custody }>
                         custody MUST be one of VivCustody.MODES. The trial
                         clinic.json resolver returns 'parent-held'; production
                         resolvers return 'child-generated' or 'user-entered'.
     appFrameOrigin      'null-origin' | 'same-origin' — describes THIS kernel's
                         App-A iframe; used by the custody gate (pack §05).
                         Defaults to 'null-origin' (the safer assumption).
     allowUnsafeSynthetic  bool — escape hatch for the unsafe coupling. Defaults
                         to false. Set true ONLY for synthetic-data trials.
     brokerUi            optional { prompt(req) → Promise<'allow'|'deny'> } for 'ask'
   }
   ================================================================================= */

;(function () {
    'use strict';

    if (!globalThis.KernelMounts || !globalThis.KernelBroker || !globalThis.VivCustody) {
        throw new Error('KernelParent requires KernelMounts + KernelBroker + VivCustody (load them first)');
    }
    const KMounts = globalThis.KernelMounts;
    const KBroker = globalThis.KernelBroker;
    const VC      = globalThis.VivCustody;

    function codeError(code, msg) { const e = new Error(msg); e.code = code; return e; }

    class KernelParent {
        constructor(opts) {
            opts = opts || {};
            if (typeof opts.spawnChannel !== 'function') {
                throw new Error('KernelParent: spawnChannel(ref, creds) required');
            }
            this._spawnChannel        = opts.spawnChannel;
            this._resolveCredentials  = opts.resolveCredentials || (async () => null);
            this._appFrameOrigin      = opts.appFrameOrigin || 'null-origin';
            this._allowUnsafeSynthetic= opts.allowUnsafeSynthetic === true;
            this.mounts               = new KMounts();
            this.broker               = new KBroker({
                kernelId: opts.kernelId || 'k-top',
                ui:       opts.brokerUi || null
            });
        }

        // Spawn + register a child vault under `prefix`. Returns { mountId, ref, custody }.
        async mount(opts) {
            const prefix = opts.prefix, ref = opts.ref, label = opts.label;
            const creds = await this._resolveCredentials(ref);
            if (!creds || !creds.vaultKey) {
                throw codeError('EUNREACH', 'no credentials for ref ' + ref);
            }
            // B10 mandated invariant: refuse the unsafe coupling (parent-held creds
            // inside a same-origin App-A) unless explicitly allowed for synthetic data.
            // Throws EUNSAFE_CUSTODY when refused — surfaces in the broker log and the
            // relay error path like any other gate (EPERM/EPROTECTED/EUNREACH).
            const custodyMode = creds.custody || VC.MODES.PARENT_HELD;
            VC.gate({
                custodyMode:          custodyMode,
                appFrameOrigin:       this._appFrameOrigin,
                allowUnsafeSynthetic: this._allowUnsafeSynthetic
            });
            // spawnChannel owns the bring-up AND its own cleanup on failure.
            const channel = await this._spawnChannel(ref, creds);
            const mountId = 'm-' + ref;
            this.mounts.add({ mountId, prefix, ref, channel, label, custody: custodyMode, meta: opts.meta || {} });
            return { mountId, ref, custody: custodyMode };
        }

        async unmount(mountId) {
            const m = this.mounts.remove(mountId);
            if (!m) return { unmounted: false };
            try { m.channel && m.channel.close(); } catch (_) {}
            // The broker log is intentionally retained for audit (the entries outlive the mount).
            // channel is returned so a DOM caller can tear down any iframe stashed on it.
            return { unmounted: true, mountId, meta: m.meta || null, channel: m.channel || null };
        }

        list() {
            return this.mounts.list().map(function (m) {
                return {
                    mountId:   m.mountId,
                    ref:       m.ref,
                    prefix:    m.prefix,
                    label:     m.label,
                    isolation: 'isolated',
                    custody:   m.custody || VC.MODES.PARENT_HELD
                };
            });
        }

        // Cross-mount relay. Returns null when the path is local (caller does the local op);
        // otherwise mediates via the broker and relays over the child channel (Edge 2).
        async relay(op, args) {
            const hit = this.mounts.resolve(args.path);
            if (!hit) return null;                              // local — caller handles
            const credentialClass = args.credential ? 'perRequest-rw' : 'standing';
            const med = await this.broker.mediate(op, hit.mount.mountId, hit.rest, credentialClass);
            if (med.decision !== 'allow') {
                this.broker.finalize(med.entryId, 'ECONSENT');
                throw codeError('ECONSENT', 'Broker denied');
            }
            try {
                const res = await hit.mount.channel.request('vfs.' + op,
                    { path: hit.rest, data: args.data, credential: args.credential },
                    { sensitive: !!args.data || op === 'read' });
                this.broker.finalize(med.entryId, 'ok');
                return res;
            } catch (err) {
                this.broker.finalize(med.entryId, err.code || 'EPROTO');
                throw err;
            }
        }
    }

    globalThis.KernelParent = KernelParent;
})();
