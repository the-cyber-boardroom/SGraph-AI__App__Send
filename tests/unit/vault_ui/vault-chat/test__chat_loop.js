import { suite, assert } from './vc-helpers.js';
import { VaultChat }      from './load-vault-chat.js';

const { ChatLoop, ExecutionCenter, ToolPolicies, BuiltinTools, MemoryVfs, ChatSession } = VaultChat;

// Build a loop with an AUTO-everything policy (so the scripted loop runs unattended).
function makeLoop(script) {
    const vfs = new MemoryVfs();
    const runners = BuiltinTools.makeRunners(vfs);
    const policies = ToolPolicies.defaults().map((p) => ({ ...p, mode: p.mode === 'OFF' ? 'OFF' : 'AUTO' }));
    const events = [];
    const ec = new ExecutionCenter({ policies, registry: BuiltinTools.REGISTRY, runners, budgetUsd: 1.0 });
    const session = new ChatSession({ model: 'mock' });
    let step = 0;
    const sendLlm = async () => script[step++];   // ignores messages; returns the next scripted reply
    const loop = new ChatLoop({ executionCenter: ec, session, vfs, sendLlm, onEvent: (e) => events.push(e) });
    return { loop, vfs, ec, events };
}

await suite('ChatLoop (agentic loop, scripted mock LLM)', ({ test }) => {
    test('full read -> write -> read -> final loop drives tools against the working set', async () => {
        const { loop, vfs, events } = makeLoop([
            // turn 1: read a (seeded) file
            { text: 'let me read it', toolCalls: [{ name: 'read_file', args: { path: '/notes.md' } }], cost: 0.01 },
            // turn 2: write a summary
            { text: 'writing summary', toolCalls: [{ name: 'write_file', args: { path: '/work/summary.md', content: 'SUMMARY' } }], cost: 0.01 },
            // turn 3: read it back
            { text: 'verifying', toolCalls: [{ name: 'read_file', args: { path: '/work/summary.md' } }], cost: 0.01 },
            // turn 4: final answer, no tools
            { text: 'done — wrote /work/summary.md', cost: 0.01 },
        ]);
        await vfs.writeFile('/notes.md', 'the original notes');
        const r = await loop.runTurn('summarise notes.md');
        assert.equal(r.ok, true);
        assert.equal(await vfs.readText('/work/summary.md'), 'SUMMARY');
        // visible tool/llm activity for the log
        const toolCalls = events.filter((e) => e.type === 'tool-call').map((e) => e.name);
        assert.deepEqual(toolCalls, ['read_file', 'write_file', 'read_file']);
        assert.equal(r.iters, 4);
    });

    test('every message/response is written to /chat/history (doc 05 §4)', async () => {
        const { loop, vfs } = makeLoop([{ text: 'hi', cost: 0 }]);
        await loop.runTurn('hello');
        const hist = await vfs.listFolder('/chat/history');
        // user turn + final assistant turn
        assert.ok(hist.length >= 2, `expected >=2 history files, got ${hist.length}`);
    });

    test('ledger accrues LLM cost across the loop', async () => {
        const { loop, ec } = makeLoop([
            { text: 't', toolCalls: [{ name: 'list_folder', args: { path: '/' } }], cost: 0.02 },
            { text: 'final', cost: 0.03 },
        ]);
        await loop.runTurn('list root');
        assert.equal(Number(ec.ledger.spentUsd.toFixed(2)), 0.05);
    });

    test('a denied CONFIRM tool feeds a graceful result back into the loop', async () => {
        const vfs = new MemoryVfs();
        const runners = BuiltinTools.makeRunners(vfs);
        const policies = ToolPolicies.defaults();   // write_file = CONFIRM
        const events = [];
        const ec = new ExecutionCenter({ policies, registry: BuiltinTools.REGISTRY, runners, budgetUsd: 1.0, confirm: async () => 'deny' });
        const session = new ChatSession({ model: 'mock' });
        let step = 0;
        const script = [
            { text: 'I will write', toolCalls: [{ name: 'write_file', args: { path: '/x.md', content: 'no' } }], cost: 0 },
            { text: 'ok, skipped the write', cost: 0 },
        ];
        const loop = new ChatLoop({ executionCenter: ec, session, vfs, sendLlm: async () => script[step++], onEvent: (e) => events.push(e) });
        const r = await loop.runTurn('write x');
        assert.equal(r.ok, true);
        assert.equal(await vfs.exists('/x.md'), false, 'denied write did not touch the working set');
        const tr = events.find((e) => e.type === 'tool-result');
        assert.equal(tr.result.denied, true);
    });
});
