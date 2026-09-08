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

    if (!globalThis.KernelMounts || !globalThis.KernelBroker || !globalThis.VivCustody || !globalThis.VivCredentialTiers) {
        throw new Error('KernelParent requires KernelMounts + KernelBroker + VivCustody + VivCredentialTiers (load them first)');
    }
    const KMounts = globalThis.KernelMounts;
    const KBroker = globalThis.KernelBroker;
    const VC      = globalThis.VivCustody;
    const VCT     = globalThis.VivCredentialTiers;

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
            // One mount per child per kernel. A second mount of the same ref used to REPLACE
            // the table entry silently (Map.set on the same mountId) — the first prefix vanished
            // and, worse, two kernels of the same child would share a clone branch. Refuse.
            if (this.mounts.get('m-' + ref)) {
                throw codeError('EEXIST', 'ref ' + ref + ' is already mounted (one mount per child vault)');
            }
            const normPrefix = (globalThis.AppPermissions.normalizePath(prefix) || '').replace(/\/+$/, '');
            const clash = this.mounts.list().find(m => m.prefix.slice(0, -1) === normPrefix);
            if (clash) {
                throw codeError('EEXIST', 'prefix ' + prefix + ' is already mounted (' + clash.mountId + ')');
            }
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
                appFrameOrigin:       this._frameOrigin(),
                allowUnsafeSynthetic: this._allowUnsafeSynthetic
            });
            const meta    = Object.assign({}, opts.meta || {}, { access: (opts.meta && opts.meta.access) || creds.access || 'rw' });
            const mountId = 'm-' + ref;
            // Register EAGERLY (the path resolves from this moment), spawn LAZILY when asked:
            // a declared mount must not cost one child-kernel bring-up per link at boot, and
            // an app that never touches a mount never pays for it. spawnChannel owns the
            // bring-up AND its own cleanup on failure.
            const entry = this.mounts.add({ mountId, prefix, ref, channel: null, label, custody: custodyMode, meta });
            const spawnCreds = Object.assign({}, creds, { label: label || ref, kind: meta.declared ? 'declared' : 'runtime' });
            entry._spawn = () => this._spawnChannel(ref, spawnCreds);
            if (!opts.lazy) {
                try { await this._ensureChannel(entry); }
                catch (err) { this.mounts.remove(mountId); throw err; }
            }
            return { mountId, ref, custody: custodyMode, access: meta.access, lazy: !!opts.lazy };
        }

        // appFrameOrigin may be a string or a function returning one (evaluated at gate time,
        // so a frame whose sandbox is decided after this parent is constructed is still
        // classified correctly).
        _frameOrigin() {
            const o = this._appFrameOrigin;
            return (typeof o === 'function') ? (o() || 'null-origin') : (o || 'null-origin');
        }

        // Bring the child up on first use; concurrent callers share one in-flight spawn.
        async _ensureChannel(m) {
            if (m.channel) return m.channel;
            if (!m._spawning) {
                if (typeof m._spawn !== 'function') throw codeError('EUNREACH', 'mount has no spawner');
                m._spawning = Promise.resolve().then(m._spawn).then(
                    (ch) => { m.channel = ch; m._spawning = null; return ch; },
                    (err) => { m._spawning = null; throw err; });
            }
            return m._spawning;
        }

        // opts.byApp — the request came from the sandboxed app via the bridge. An app may not
        // unmount a DECLARED mount: the owner declared it, and removing it would let the app's
        // next write to that prefix land in the parent (07 Sep analysis §6.2). Shell/teardown
        // callers pass { force: true }.
        async unmount(mountId, opts) {
            opts = opts || {};
            const existing = this.mounts.get(mountId);
            if (!existing) return { unmounted: false };
            if (existing.meta && existing.meta.declared && !opts.force) {
                throw codeError('EPERM', 'declared mount ' + mountId + ' cannot be unmounted by the app');
            }
            const m = this.mounts.remove(mountId);
            if (m._spawning) { try { await m._spawning; } catch (_) {} }      // never orphan an in-flight spawn
            try { m.channel && m.channel.close(); } catch (_) {}
            // The broker log is intentionally retained for audit (the entries outlive the mount).
            // channel is returned so a DOM caller can tear down any iframe stashed on it.
            return { unmounted: true, mountId, meta: m.meta || null, channel: m.channel || null };
        }

        // B7 monitored-mode: ask the child for its broker log over the parent-held channel.
        // Naturally scoped — only the parent that spawned this child holds the channel
        // (and the child decides whether to expose anything via VivMonitor's opt-in).
        // Returns { mode, entries }. Throws ECONSENT if the child is in CLOSED mode.
        async monitorChild(mountId, opts) {
            if (!globalThis.VivMonitor) throw codeError('EUNREACH', 'VivMonitor not loaded');
            const m = this.mounts.get(mountId);
            if (!m) throw codeError('ENOMOUNT', 'no such mount ' + mountId);
            const ch = await this._ensureChannel(m);
            return globalThis.VivMonitor.requestLog(ch, opts || {});
        }

        // Sync surface (parent side). status() is one ref read in the child; sync() forces
        // a reconcile. syncAll() is what the tab-focus behind-check calls. Results are
        // cached on the mount entry so list() can show them synchronously.
        async status(mountId) {
            const m = this.mounts.get(mountId);
            if (!m) throw codeError('ENOMOUNT', 'no such mount ' + mountId);
            if (!m.channel) return { syncable: false, spawned: false };      // never touched: nothing to be stale
            const st = await m.channel.request('vfs.status', {});
            m._sync = Object.assign({ at: Date.now() }, st);
            return st;
        }
        async sync(mountId) {
            const m = this.mounts.get(mountId);
            if (!m) throw codeError('ENOMOUNT', 'no such mount ' + mountId);
            if (!m.channel) return { syncable: false, spawned: false };
            const st = await m.channel.request('vfs.sync', {});
            m._sync = Object.assign({ at: Date.now() }, st);
            return st;
        }
        async syncAll() {
            const out = {};
            for (const m of this.mounts.list()) {
                try { out[m.mountId] = await this.sync(m.mountId); } catch (err) { out[m.mountId] = { error: err.code || err.message }; }
            }
            return out;
        }

        list() {
            return this.mounts.list().map(function (m) {
                return {
                    mountId:   m.mountId,
                    ref:       m.ref,
                    prefix:    m.prefix,
                    label:     m.label,
                    isolation: 'isolated',
                    custody:   m.custody || VC.MODES.PARENT_HELD,
                    access:    (m.meta && m.meta.access) || 'rw',
                    declared:  !!(m.meta && m.meta.declared),
                    spawned:   !!m.channel,
                    sync:      m._sync || null
                };
            });
        }

        // Cross-mount relay. Returns null when the path is local (caller does the local op);
        // otherwise mediates via the broker and relays over the child channel (Edge 2).
        async relay(op, args) {
            const hit = this.mounts.resolve(args.path);
            if (!hit) return null;                              // local — caller handles
            const credentialClass = args.credential ? 'perRequest-rw' : 'standing';
            // B5/B6 invariant: refuse destructive verbs without per-request elevation.
            // Runs BEFORE mediation — an underprivileged request never reaches the
            // broker or the channel. Throws EUNDERPRIVILEGED with .required/.provided.
            VCT.gate({ verb: 'fs.' + op, providedTier: credentialClass });
            const med = await this.broker.mediate(op, hit.mount.mountId, hit.rest, credentialClass);
            if (med.decision !== 'allow') {
                this.broker.finalize(med.entryId, 'ECONSENT');
                throw codeError('ECONSENT', 'Broker denied');
            }
            try {
                const ch  = await this._ensureChannel(hit.mount);          // lazy spawn on first use
                const res = await ch.request('vfs.' + op,
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
