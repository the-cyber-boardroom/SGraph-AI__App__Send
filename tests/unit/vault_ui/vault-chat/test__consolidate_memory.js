import { suite, assert } from './vc-helpers.js';
import { VaultChat }      from './load-vault-chat.js';

const { ChatLoop, ExecutionCenter, ToolPolicies, BuiltinTools, MemoryVfs, ChatSession, ConsolidateMemory } = VaultChat;

function makeStack(script) {
    const vfs = new MemoryVfs();
    const policies = ToolPolicies.defaults().map((p) => ({ ...p, mode: p.mode === 'OFF' ? 'OFF' : 'AUTO' }));
    const ecRef = { ec: null };
    const ec = new ExecutionCenter({
        policies,
        registry: BuiltinTools.OPENAI_SCHEMAS,
        runners: Object.assign({}, BuiltinTools.makeRunners(vfs), {
            consolidate_memory: ConsolidateMemory.makeRunner({ ecRef, vfs, session: null, getSendLlm: () => sendLlm }),
        }),
        budgetUsd: 1.0,
        memorySubCapRatio: 0.20,
        estimate: (name) => (name === 'consolidate_memory' ? 0.01 : 0),
    });
    ecRef.ec = ec;
    const session = new ChatSession({ model: 'mock' });
    // late-bind session into the runner closure
    ec.runners.consolidate_memory = ConsolidateMemory.makeRunner({ ecRef, vfs, session, getSendLlm: () => sendLlm });
    let step = 0;
    const sendLlm = async () => script[step++];
    const loop = new ChatLoop({ executionCenter: ec, session, vfs, sendLlm, onEvent: () => {} });
    return { loop, ec, vfs, session, callCount: () => step };
}

async function seedHistory(vfs, n) {
    for (let i = 1; i <= n; i++) {
        await vfs.writeFile(`/chat/history/${String(i).padStart(4, '0')}.json`, JSON.stringify({ n: i, role: i % 2 ? 'user' : 'assistant', content: `turn ${i}` }));
    }
}

await suite('Phase 4 — consolidate_memory (lossless self-prune, doc 05 §4)', ({ test }) => {
    test('writes a consolidated summary file and returns dropPaths; originals are preserved', async () => {
        const { loop, ec, vfs } = makeStack([
            // 1: model asks for consolidate
            { text: 'pruning', toolCalls: [{ name: 'consolidate_memory', args: { retainTail: 2 } }], cost: 0 },
            // 2: the consolidator sub-call → summary text
            { text: 'SUMMARY: turns 1-3 discussed X and decided Y.', cost: 0.005 },
            // 3: loop wrap-up after the tool result
            { text: 'consolidated.', cost: 0 },
        ]);
        await seedHistory(vfs, 5);
        // (the loop adds the user turn 0006 + the assistant 0007; the runner still sees 5 history files)
        const r = await loop.runTurn('please consolidate older turns');
        assert.equal(r.ok, true);
        // a consolidated file was written
        const all = await vfs.listAll();
        const consolidated = all.filter((f) => f.path.startsWith('/chat/consolidated/'));
        assert.equal(consolidated.length, 1);
        assert.ok((await vfs.readText(consolidated[0].path)).startsWith('SUMMARY:'));
        // originals are STILL present (lossless)
        const history = all.filter((f) => f.path.startsWith('/chat/history/'));
        assert.ok(history.length >= 5, `expected the 5 seeded history files to remain, got ${history.length}`);
        // ledger debited the LLM cost to the MEMORY tag (not task)
        assert.ok(ec.ledger.byTag.memory >= 0.005, `memory tag: ${ec.ledger.byTag.memory}`);
    });

    test('rebuildAfterConsolidate replaces the live prompt with a consolidated prefix + tail', async () => {
        const { loop, vfs } = makeStack([
            { text: 'pruning', toolCalls: [{ name: 'consolidate_memory', args: { retainTail: 1 } }], cost: 0 },
            { text: 'A CONSOLIDATED SUMMARY', cost: 0.005 },
            { text: 'ok', cost: 0 },
        ]);
        await seedHistory(vfs, 4);
        await loop.runTurn('consolidate');
        const sys = loop._messages.find((m) => m.role === 'system' && /PRIOR CONTEXT \(CONSOLIDATED/.test(m.content));
        assert.ok(sys, 'a consolidated system message is present');
        assert.ok(sys.content.includes('A CONSOLIDATED SUMMARY'));
    });

    test('nothing to prune when history is at or below retainTail', async () => {
        const { loop, vfs } = makeStack([
            { text: 'pruning', toolCalls: [{ name: 'consolidate_memory', args: { retainTail: 5 } }], cost: 0 },
            { text: 'ok', cost: 0 },
        ]);
        await seedHistory(vfs, 3);
        await loop.runTurn('consolidate');
        const consolidated = (await vfs.listAll()).filter((f) => f.path.startsWith('/chat/consolidated/'));
        assert.equal(consolidated.length, 0, 'no consolidated file written when retainTail >= history');
    });

    test('the memory sub-cap refuses a consolidation that would exceed it', async () => {
        const { loop, ec, vfs } = makeStack([
            { text: 'pruning', toolCalls: [{ name: 'consolidate_memory', args: { retainTail: 0 } }], cost: 0 },
            { text: 'never-called', cost: 0 },
            { text: 'ok', cost: 0 },
        ]);
        // budget $1, memory sub-cap 20% = $0.20. Force memory tag already at $0.19 → est $0.01 → over sub-cap
        ec.ledger.byTag.memory = 0.20;
        await seedHistory(vfs, 4);
        await loop.runTurn('consolidate');
        const consolidated = (await vfs.listAll()).filter((f) => f.path.startsWith('/chat/consolidated/'));
        assert.equal(consolidated.length, 0, 'no consolidation when sub-cap would be exceeded');
    });

    test('Phase 4 fractal scope: buildManifest filters by session.scopeRoot', () => {
        const session = new ChatSession({ scopeRoot: '/work' });
        const entries = [
            { path: '/work/a.md', name: 'a.md', size: 1, type: 'file' },
            { path: '/work/sub/b.md', name: 'b.md', size: 1, type: 'file' },
            { path: '/notes.md', name: 'notes.md', size: 1, type: 'file' },
            { path: '/.vault/secrets/x', name: 'x', size: 1, type: 'file' },
        ];
        const m = session.buildManifest(entries);
        assert.ok(m.includes('/work/a.md'));
        assert.ok(m.includes('/work/sub/b.md'));
        assert.ok(!m.includes('/notes.md'), 'out-of-scope file not in manifest');
        assert.ok(!m.includes('/.vault'), 'reserved prefix never in manifest');
    });
});
