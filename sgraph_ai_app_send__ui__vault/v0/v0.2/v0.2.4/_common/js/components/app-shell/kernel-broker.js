/* =================================================================================
   KernelBroker — per-kernel sidecar on Edge 2 (parent kernel → mounted child)
                  Phase 2

   globalThis.KernelBroker. One instance per kernel. Mediates the children THIS
   kernel mounted; ALWAYS Edge 2; NEVER on the server edge.

   Spec: architect pack 01-architecture-review.md §8, 04-message-protocol-spec.md §4.6.
   Review fixes folded in (v0.29.2 N3): mediate() returns an opaque entryId;
   finalize(entryId, result) closes by id, not by (mountId,op,path) tuple.

   The broker logs metadata ONLY (op, path, mountId, credentialClass, decision,
   policy, result, ts) — never the bytes. The vaults page (Phase 5) reads this
   log via sg.broker.log() per kernel; there is NO central collector.
   ================================================================================= */

;(function () {
    'use strict';

    function nowMs() { return Date.now(); }

    // Default per-capability policy (review N3 / D6). Reads transparent; mutations ask.
    function defaultPolicyFor(capability) {
        return capability === 'fs.read' ? 'auto' : 'ask';
    }

    function capabilityFor(op) {
        switch (op) {
            case 'read':
            case 'list':   return 'fs.read';
            case 'write':  return 'fs.write';
            case 'delete': return 'fs.delete';
            case 'mkdir':  return 'fs.mkdir';
            case 'move':   return 'fs.move';
            // Vault lifecycle verbs flow through their own broker policies in the future.
            default:       return 'fs.' + op;
        }
    }

    class KernelBroker {
        constructor(opts) {
            opts = opts || {};
            this._kernelId = opts.kernelId || 'unknown';
            this._ui       = opts.ui || null;             // optional: { prompt({ op,mountId,path,credentialClass }) → Promise<'allow'|'deny'> }
            this._policy   = new Map();                    // `${mountId}|${capability}` → 'auto' | 'ask' | 'never'
            this._log      = [];                           // BrokerEntry[]
            this._seq      = 0;
        }

        setPolicy(mountId, capability, value) {
            if (!['auto', 'ask', 'never'].includes(value)) {
                throw new Error('KernelBroker.setPolicy: invalid value ' + value);
            }
            this._policy.set(`${mountId}|${capability}`, value);
        }

        getPolicy(mountId, capability) {
            return this._policy.get(`${mountId}|${capability}`) || defaultPolicyFor(capability);
        }

        // Called BEFORE relaying a request to a child. Returns { decision, entryId }.
        // entryId is the opaque handle for finalize(); robust under concurrent ops on the
        // same (mountId, op, path) tuple (review N3).
        async mediate(op, mountId, path, credentialClass) {
            credentialClass = credentialClass || 'none';
            const cap    = capabilityFor(op);
            const policy = this.getPolicy(mountId, cap);

            let decision = 'deny';
            if (policy === 'auto')       decision = 'allow';
            else if (policy === 'never') decision = 'deny';
            else if (policy === 'ask') {
                if (this._ui && typeof this._ui.prompt === 'function') {
                    try { decision = await this._ui.prompt({ op, mountId, path, credentialClass }); }
                    catch (_) { decision = 'deny'; }
                    if (decision !== 'allow' && decision !== 'deny') decision = 'deny';
                } else {
                    decision = 'deny';                                 // fail-closed when no UI
                }
            }

            const entryId = 'be-' + (++this._seq) + '-' + nowMs().toString(36);
            this._log.push({
                entryId,
                ts:              nowMs(),
                edge:            `${this._kernelId}▶${mountId}`,
                kernelId:        this._kernelId,
                mountId,
                op,
                path,
                credentialClass,
                policy,
                decision,
                result:          'pending'
            });
            return { decision, entryId };
        }

        // Close an entry by its opaque id.
        finalize(entryId, result) {
            for (let i = this._log.length - 1; i >= 0; i--) {
                if (this._log[i].entryId === entryId) {
                    this._log[i].result = result;
                    return true;
                }
            }
            return false;                                              // silent (no throw)
        }

        log(opts) {
            opts = opts || {};
            if (opts.mountId) return this._log.filter(e => e.mountId === opts.mountId);
            return this._log.slice();
        }

        clearLog() { this._log = []; this._seq = 0; }
    }

    globalThis.KernelBroker = KernelBroker;
})();
