import { suite, assert } from './vc-helpers.js';
import { VaultChat }      from './load-vault-chat.js';

const { VaultFlushController, MemoryVfs, createMockSg } = VaultChat;

await suite('VaultFlushController', ({ test }) => {
    test('coalesces N dirty paths into ONE writeBatch commit', async () => {
        const vfs = new MemoryVfs();
        const sg = createMockSg();
        const fc = new VaultFlushController(vfs, sg, 'synced');
        await vfs.writeFile('/work/a.md', 'a');
        await vfs.writeFile('/work/b.md', 'b');
        await vfs.writeFile('/chat/history/0001.json', '{}');
        assert.equal(fc.dirtyPaths().length, 3);
        const res = await fc.flush('turn 1');
        assert.equal(res.count, 3);
        assert.ok(res.commitId);
        assert.equal(sg._debug.commits.length, 1, 'exactly one commit');
        assert.equal(sg._debug.commits[0].message, 'turn 1');
        assert.equal(fc.hasDirty(), false, 'dirty set cleared after flush');
    });

    test('a delete after a write is carried as a delete op', async () => {
        const vfs = new MemoryVfs();
        const sg = createMockSg({ seed: { '/old.md': 'x' } });
        const fc = new VaultFlushController(vfs, sg, 'synced');
        // mirror the seed into the working set, then delete it
        await vfs.writeFile('/old.md', 'x');
        await vfs.deleteFile('/old.md');
        await fc.flush('drop old');
        assert.equal(sg._debug.files.has('/old.md'), false, 'delete propagated to the vault');
    });

    test('ephemeral mode does not flush on turn-end', async () => {
        const vfs = new MemoryVfs();
        const sg = createMockSg();
        const fc = new VaultFlushController(vfs, sg, 'ephemeral');
        await vfs.writeFile('/work/a.md', 'a');
        const res = await fc.onTurnEnd('turn');
        assert.equal(res.skipped, 'mode-ephemeral');
        assert.equal(sg._debug.commits.length, 0);
    });

    test('synced mode flushes on turn-end', async () => {
        const vfs = new MemoryVfs();
        const sg = createMockSg();
        const fc = new VaultFlushController(vfs, sg, 'synced');
        await vfs.writeFile('/work/a.md', 'a');
        await fc.onTurnEnd('turn 1');
        assert.equal(sg._debug.commits.length, 1);
    });

    test('flush with nothing dirty is a no-op', async () => {
        const vfs = new MemoryVfs();
        const sg = createMockSg();
        const fc = new VaultFlushController(vfs, sg, 'synced');
        const res = await fc.flush('x');
        assert.equal(res.skipped, 'nothing-dirty');
        assert.equal(sg._debug.commits.length, 0);
    });
});
