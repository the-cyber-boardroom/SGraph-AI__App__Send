/* =================================================================================
   Vault Chat — Execution Center (doc 04)

   The single choke point: every tool call passes through execute(). It wraps the
   tool runners with per-tool policy (AUTO/CONFIRM/DRY_RUN), a harness-enforced
   budget ledger (preflight refuses over-cap calls — the model cannot spend past the
   cap), and structured log emission for the bridge/execution log.

   Construction:
     new ExecutionCenter({
        policies,            // [ToolPolicy] (already loadout-applied + read-only-degraded)
        registry,            // name -> tool def (for compileTools)
        runners,             // name -> async(args) -> ToolResult
        confirm,             // async ({name,args,policy,estimate,remaining}) -> 'approve'|'always'|'deny'
        log,                 // ({kind,name,detail}) -> void   (optional)
        estimate,            // (name,args) -> usd   (optional; default 0)
        budgetUsd,           // number (default Infinity)
        memorySubCapRatio,   // 0..1 (default 0.20)
     })
   Browser global: window.VaultChat.ExecutionCenter
   ================================================================================= */
(function (root) {
    'use strict';

    const MEMORY_TOOLS = new Set(['consolidate_memory']);
    const tagFor = (name) => (MEMORY_TOOLS.has(name) ? 'memory' : 'task');

    class ExecutionCenter {
        constructor(opts) {
            opts = opts || {};
            this.policies = (opts.policies || []).map((p) => ({ ...p }));
            this.registry = opts.registry || {};
            this.runners  = opts.runners || {};
            this._confirm = opts.confirm || (async () => 'deny');
            this._log     = opts.log || (() => {});
            this._estimate = opts.estimate || (() => 0);
            this.ledger = {
                budgetUsd: (opts.budgetUsd == null ? Infinity : opts.budgetUsd),
                spentUsd: 0,
                byTag: { task: 0, memory: 0, sidecar: 0, consensus: 0 },
                calls: [],
            };
            this.memorySubCapRatio = (opts.memorySubCapRatio == null ? 0.20 : opts.memorySubCapRatio);
        }

        _policy(name) { return this.policies.find((p) => p.name === name); }

        compileTools() { return root.VaultChat.ToolPolicies.compileTools(this.policies, this.registry); }

        // Pre-flight a prospective spend against the running ledger (doc 04 §2).
        preflight(kind, estimateUsd, tag) {
            tag = tag || 'task';
            estimateUsd = estimateUsd || 0;
            const remaining = this.ledger.budgetUsd - this.ledger.spentUsd;
            if (this.ledger.spentUsd + estimateUsd > this.ledger.budgetUsd) {
                return { ok: false, refused: true, reason: 'over-budget', remaining };
            }
            // memory-work sub-cap: structurally prevent the prune-loop (doc 04 §2)
            if (tag === 'memory' && isFinite(this.ledger.budgetUsd)) {
                const cap = this.ledger.budgetUsd * this.memorySubCapRatio;
                if (this.ledger.byTag.memory + estimateUsd > cap) {
                    return { ok: false, refused: true, reason: 'over-memory-subcap', remaining: cap - this.ledger.byTag.memory };
                }
            }
            return { ok: true, remaining };
        }

        _debit(usd, tag) {
            if (!usd) return;
            tag = tag || 'task';
            this.ledger.spentUsd += usd;
            this.ledger.byTag[tag] = (this.ledger.byTag[tag] || 0) + usd;
        }

        // Record an LLM call's actual cost against the ledger (called by the chat loop).
        recordLlm({ cost, model, messages, tools }) {
            this._debit(cost || 0, 'task');
            this.ledger.calls.push({ ts: Date.now(), kind: 'llm', name: model, cost: cost || 0, tag: 'task' });
            this._log({ kind: 'llm', name: model || 'llm', detail: { messages: (messages || []).length, tools: (tools || []).length, cost: cost || 0 } });
        }

        async execute(name, args) {
            args = args || {};
            const policy = this._policy(name);
            // Defence in depth: a tool not in the compiled list should never be invoked.
            if (!policy || !policy.available || policy.mode === 'OFF') {
                return { ok: false, error: 'tool-unavailable', name };
            }
            const tag = tagFor(name);
            const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());

            // Cost gate for COSTLY tools.
            if (policy.tier === 'COSTLY') {
                const est = this._estimate(name, args);
                const pf = this.preflight('tool', est, tag);
                if (!pf.ok) {
                    this._log({ kind: 'tool', name, detail: { mode: policy.mode, refused: true, reason: pf.reason, remaining: pf.remaining } });
                    return { ok: false, refused: true, reason: pf.reason, remaining: pf.remaining, name };
                }
            }

            if (policy.mode === 'DRY_RUN') {
                this._log({ kind: 'tool', name, detail: { mode: 'DRY_RUN' } });
                return { ok: true, dryRun: true, preview: { name, args } };
            }

            if (policy.mode === 'CONFIRM') {
                const decision = await this._confirm({
                    name, args, policy,
                    estimate: this._estimate(name, args),
                    remaining: this.ledger.budgetUsd - this.ledger.spentUsd,
                });
                if (decision === 'deny') {
                    this._log({ kind: 'tool', name, detail: { mode: 'CONFIRM', denied: true } });
                    return { ok: true, denied: true, name };   // graceful: feeds back to the model as a result
                }
                if (decision === 'always') policy.mode = 'AUTO';   // session-only; never persisted, never tool-settable
            }

            const runner = this.runners[name];
            if (!runner) return { ok: false, error: 'no-runner', name };

            let result;
            try {
                result = await runner(args);
            } catch (err) {
                this._log({ kind: 'tool', name, detail: { mode: policy.mode, ok: false, error: err.message, ms: Math.round(((typeof performance !== 'undefined' ? performance.now() : Date.now())) - t0) } });
                return { ok: false, error: err.message, name };
            }

            if (result && result.cost) {
                this._debit(result.cost, tag);
                this.ledger.calls.push({ ts: Date.now(), kind: 'tool', name, cost: result.cost, tag });
            }
            this._log({ kind: 'tool', name, detail: { mode: policy.mode, ok: result ? result.ok !== false : true, cost: (result && result.cost) || 0, ms: Math.round(((typeof performance !== 'undefined' ? performance.now() : Date.now())) - t0) } });
            return result;
        }
    }

    root.VaultChat = root.VaultChat || {};
    root.VaultChat.ExecutionCenter = ExecutionCenter;
})(typeof window !== 'undefined' ? window : globalThis);
