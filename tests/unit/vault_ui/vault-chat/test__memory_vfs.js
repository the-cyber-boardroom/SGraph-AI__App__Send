import { suite, assert } from './vc-helpers.js';
import { VaultChat }      from './load-vault-chat.js';

const { MemoryVfs } = VaultChat;

await suite('MemoryVfs', ({ test }) => {
    test('write then read round-trips text', async () => {
        const fs = new MemoryVfs();
        await fs.writeFile('/work/a.md', 'hello');
        assert.equal(await fs.readText('/work/a.md'), 'hello');
        assert.equal(await fs.exists('/work/a.md'), true);
    });

    test('listFolder returns files and synthetic folders', async () => {
        const fs = new MemoryVfs();
        await fs.writeFile('/work/a.md', 'a');
        await fs.writeFile('/work/sub/b.md', 'b');
        await fs.writeFile('/top.md', 't');
        const root = await fs.listFolder('/');
        const names = root.map((e) => e.name).sort();
        assert.deepEqual(names, ['top.md', 'work']);
        const work = await fs.listFolder('/work');
        assert.deepEqual(work.map((e) => `${e.name}:${e.type}`).sort(), ['a.md:file', 'sub:folder']);
    });

    test('delete removes the file and emits a change', async () => {
        const fs = new MemoryVfs();
        const seen = [];
        fs.onChange((c) => seen.push(c));
        await fs.writeFile('/x', '1');
        await fs.deleteFile('/x');
        assert.equal(await fs.exists('/x'), false);
        assert.deepEqual(seen, [{ op: 'write', path: '/x' }, { op: 'delete', path: '/x' }]);
    });

    test('reading a missing file throws ENOENT', async () => {
        const fs = new MemoryVfs();
        await assert.rejects(() => fs.readFile('/nope'), (e) => e.code === 'ENOENT');
    });

    test('paths are normalised', async () => {
        const fs = new MemoryVfs();
        await fs.writeFile('work//a.md', 'x');
        assert.equal(await fs.readText('/work/a.md'), 'x');
    });
});
