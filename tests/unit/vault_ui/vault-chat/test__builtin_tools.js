import { suite, assert } from './vc-helpers.js';
import { VaultChat }      from './load-vault-chat.js';

const { BuiltinTools, MemoryVfs } = VaultChat;

await suite('BuiltinTools', ({ test }) => {
    test('write_file then read_file round-trips through the working set', async () => {
        const vfs = new MemoryVfs();
        const r = BuiltinTools.makeRunners(vfs);
        await r.write_file({ path: '/work/a.md', content: 'hello' });
        const out = await r.read_file({ path: '/work/a.md' });
        assert.equal(out.content, 'hello');
    });

    test('list_folder returns entries', async () => {
        const vfs = new MemoryVfs();
        const r = BuiltinTools.makeRunners(vfs);
        await r.write_file({ path: '/work/a.md', content: 'a' });
        await r.write_file({ path: '/work/b.md', content: 'b' });
        const out = await r.list_folder({ path: '/work' });
        assert.equal(out.entries.length, 2);
    });

    test('rename moves content and removes the source', async () => {
        const vfs = new MemoryVfs();
        const r = BuiltinTools.makeRunners(vfs);
        await r.write_file({ path: '/work/a.md', content: 'x' });
        await r.rename({ from: '/work/a.md', to: '/work/b.md' });
        assert.equal((await r.read_file({ path: '/work/b.md' })).content, 'x');
        assert.equal((await r.exists({ path: '/work/a.md' })).exists, false);
    });

    test('the reserved /.vault prefix is unreachable by every tool (doc 09 §2)', async () => {
        const vfs = new MemoryVfs();
        const r = BuiltinTools.makeRunners(vfs);
        await assert.rejects(() => r.read_file({ path: '/.vault/secrets/openrouter.key' }), (e) => e.code === 'ENOENT');
        await assert.rejects(() => r.list_folder({ path: '/.vault' }), (e) => e.code === 'ENOENT');
        await assert.rejects(() => r.write_file({ path: '/.vault/x', content: 'no' }), (e) => e.code === 'ENOENT');
        await assert.rejects(() => r.delete_file({ path: '/.vault/secrets/openrouter.key' }), (e) => e.code === 'ENOENT');
    });
});
