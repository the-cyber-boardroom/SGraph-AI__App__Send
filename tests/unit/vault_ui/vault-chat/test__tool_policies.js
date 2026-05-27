import { suite, assert } from './vc-helpers.js';
import { VaultChat }      from './load-vault-chat.js';

const { ToolPolicies, BuiltinTools } = VaultChat;

await suite('ToolPolicies', ({ test }) => {
    test('compileTools omits OFF and unavailable tools (invisible, not refused)', () => {
        const policies = ToolPolicies.defaults();
        ToolPolicies.byName(policies)['write_file'].mode = 'OFF';
        ToolPolicies.byName(policies)['read_file'].available = false;
        const names = ToolPolicies.compileTools(policies, BuiltinTools.REGISTRY).map((t) => t.name);
        assert.ok(!names.includes('write_file'), 'OFF tool excluded');
        assert.ok(!names.includes('read_file'), 'unavailable tool excluded');
        assert.ok(names.includes('list_folder'), 'AUTO READ tool included');
    });

    test('run_code is never in the default registry/policies (D6)', () => {
        const policies = ToolPolicies.defaults();
        assert.ok(!policies.find((p) => p.name === 'run_code'));
        assert.ok(!BuiltinTools.REGISTRY['run_code']);
    });

    test('degradeIfReadOnly disables WRITE/DESTRUCTIVE/flush when not writable', () => {
        const degraded = ToolPolicies.degradeIfReadOnly(ToolPolicies.defaults(), false);
        const by = ToolPolicies.byName(degraded);
        assert.equal(by['write_file'].available, false);
        assert.equal(by['delete_file'].available, false);
        assert.equal(by['flush_memory'].available, false);
        assert.equal(by['read_file'].available, true, 'reads stay available read-only');
    });

    test('read-only loadout exposes only READ-tier tools', () => {
        const ro = ToolPolicies.applyLoadout(ToolPolicies.defaults(), 'read-only');
        const names = ToolPolicies.compileTools(ro, BuiltinTools.REGISTRY).map((t) => t.name).sort();
        assert.deepEqual(names, ['exists', 'list_folder', 'read_file', 'stat']);
    });

    test('memory-curation loadout exposes reads + consolidate/flush', () => {
        const mc = ToolPolicies.applyLoadout(ToolPolicies.defaults(), 'memory-curation');
        const by = ToolPolicies.byName(mc);
        assert.equal(by['consolidate_memory'].available, true);
        assert.equal(by['flush_memory'].available, true);
        assert.equal(by['write_file'].available, false);
    });
});
