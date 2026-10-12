/* =================================================================================
   Vault Chat — consolidate_memory (lossless self-prune, doc 05 §4)

   Reads /chat/history/* (older than `retainTail` recent turns), asks the LLM to
   consolidate them into one short markdown summary, writes it to
   /chat/consolidated/<ts>.md, and returns a manifest of paths to drop from the
   LIVE prompt. The originals stay in the working set (lossless: the brief's
   "compress where we don't lose anything").

   The runner debits the MEMORY tag via the result.cost (consolidate_memory is in
   the ExecutionCenter's MEMORY_TOOLS set), and pre-flights against the memory
   sub-cap so a prune-loop is structurally prevented (doc 04 §2).

   Factory: makeRunner({ ecRef, vfs, session, getSendLlm }) -> async (args) -> ToolResult.
   Browser global: window.VaultChat.ConsolidateMemory
   ================================================================================= */
(function (root) {
    'use strict';

    function makeRunner({ ecRef, vfs, session, getSendLlm }) {
        return async function consolidate_memory(args) {
            args = args || {};
            const retainTail = args.retainTail == null ? 2 : args.retainTail;
            const instruction = args.instruction || '';

            const all = await vfs.listAll();
            const history = all
                .filter((f) => f.path.startsWith('/chat/history/'))
                .sort((a, b) => a.path.localeCompare(b.path));

            if (history.length <= retainTail) {
                return { ok: true, skipped: 'nothing-to-prune', count: history.length, retained: retainTail };
            }
            const toDrop = history.slice(0, history.length - retainTail);

            // Pre-flight against the memory sub-cap (doc 04 §2). Cheap estimate by default.
            const est = args.estimateUsd == null ? 0.01 : args.estimateUsd;
            const ec = ecRef && ecRef.ec;
            if (ec) {
                const pf = ec.preflight('tool', est, 'memory');
                if (!pf.ok) return { ok: false, refused: true, reason: pf.reason, remaining: pf.remaining };
            }

            const parts = [];
            for (const f of toDrop) {
                try { parts.push(`--- ${f.path} ---\n${await vfs.readText(f.path)}`); } catch (_) {}
            }

            const messages = [
                { role: 'system', content: 'You are a memory consolidator. Produce a concise markdown summary of the prior chat turns capturing decisions, findings, and what was tried. No commentary, no tools, just the summary.' },
                { role: 'user', content: (instruction ? instruction + '\n\n' : '') +
                    `Consolidate these ${toDrop.length} prior chat-history files into one short markdown summary, retaining only what the next turn would need.\n\n` +
                    parts.join('\n\n') },
            ];

            const sendLlm = getSendLlm && getSendLlm();
            if (!sendLlm) return { ok: false, error: 'no-llm-transport' };

            const res = await sendLlm({ messages, tools: undefined });
            const summary = (res && res.text) || '';
            const consolidatedPath = `/chat/consolidated/${Date.now()}.md`;
            await vfs.writeFile(consolidatedPath, summary);

            return {
                ok: true,
                consolidatedPath,
                dropPaths: toDrop.map((f) => f.path),
                retained: retainTail,
                cost: (res && res.cost) || 0,    // debited to MEMORY tag by ExecutionCenter
                summaryChars: summary.length,
            };
        };
    }

    root.VaultChat = root.VaultChat || {};
    root.VaultChat.ConsolidateMemory = { makeRunner };
})(typeof window !== 'undefined' ? window : globalThis);
