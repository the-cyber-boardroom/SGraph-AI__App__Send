import { suite, assert } from './vc-helpers.js';
import { VaultChat }      from './load-vault-chat.js';

const { ExecutionCenter, ToolPolicies, BuiltinTools, MemoryVfs } = VaultChat;

function makeEC(overrides) {
    const vfs = new MemoryVfs();
    const runners = BuiltinTools.makeRunners(vfs);
    const log = [];
    const ec = new ExecutionCenter(Object.assign({
        policies: ToolPolicies.defaults(),
        registry: BuiltinTools.REGISTRY,
        runners,
        confirm: async () => 'approve',
        log: (row) => log.push(row),
        estimate: (name) => (name === 'create_infographic' ? 0.06 : 0),
        budgetUsd: 1.0,
    }, overrides || {}));
    return { ec, vfs, log };
}

await suite('ExecutionCenter', ({ test }) => {
    test('AUTO read tool runs without confirmation', async () => {
        const { ec, vfs } = makeEC();
        await vfs.writeFile('/a.md', 'hi');
        const r = await ec.execute('read_file', { path: '/a.md' });
        assert.equal(r.ok, true);
        assert.equal(r.content, 'hi');
    });

    test('CONFIRM deny returns a graceful {denied} result (not an error)', async () => {
        const { ec } = makeEC({ confirm: async () => 'deny' });
        const r = await ec.execute('write_file', { path: '/x.md', content: 'no' });
        assert.equal(r.ok, true);
        assert.equal(r.denied, true);
    });

    test('CONFIRM "always" flips the session policy to AUTO', async () => {
        const { ec } = makeEC({ confirm: async () => 'always' });
        await ec.execute('write_file', { path: '/x.md', content: '1' });
        assert.equal(ec._policy('write_file').mode, 'AUTO');
    });

    test('COSTLY tool over budget is refused by the harness', async () => {
        const { ec } = makeEC({ budgetUsd: 0.05 });   // estimate 0.06 > 0.05
        const r = await ec.execute('create_infographic', { source: '/a.csv' });
        assert.equal(r.refused, true);
        assert.equal(r.reason, 'over-budget');
    });

    test('preflight enforces the memory sub-cap', () => {
        const { ec } = makeEC({ budgetUsd: 1.0, memorySubCapRatio: 0.2 });
        // memory tag cap = $0.20; a $0.25 memory spend must be refused even with budget left
        const pf = ec.preflight('tool', 0.25, 'memory');
        assert.equal(pf.ok, false);
        assert.equal(pf.reason, 'over-memory-subcap');
    });

    test('a tool not in the compiled list cannot be executed', async () => {
        const policies = ToolPolicies.defaults();
        ToolPolicies.byName(policies)['delete_file'].available = false;
        const { ec } = makeEC({ policies });
        const r = await ec.execute('delete_file', { path: '/a' });
        assert.equal(r.ok, false);
        assert.equal(r.error, 'tool-unavailable');
    });

    test('ledger debits and tags LLM cost; log row emitted', () => {
        const { ec, log } = makeEC();
        ec.recordLlm({ cost: 0.02, model: 'm', messages: [1, 2], tools: [1] });
        assert.equal(Number(ec.ledger.spentUsd.toFixed(2)), 0.02);
        assert.equal(Number(ec.ledger.byTag.task.toFixed(2)), 0.02);
        assert.ok(log.find((r) => r.kind === 'llm'));
    });
});
