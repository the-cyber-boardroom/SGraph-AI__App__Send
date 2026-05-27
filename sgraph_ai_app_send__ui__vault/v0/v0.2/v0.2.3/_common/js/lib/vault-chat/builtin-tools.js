/* =================================================================================
   Vault Chat — Built-in tools (Phase 0)

   The file tools the LLM calls, executed against the MemoryVfs working set. Phase 1
   swaps the runner for the real sg-tool-runner (TOOLS/agentic/sg-tool-runner); the
   ToolResult shape and the registry below are the seam.

   A ToolResult is { ok, ...payload } or { ok:false, error }. Costed tools add `cost`.
   Browser global: window.VaultChat.BuiltinTools
   ================================================================================= */
(function (root) {
    'use strict';

    // Tool definitions (the registry compiled into tools[] for the model).
    const REGISTRY = {
        list_folder: { name: 'list_folder', description: 'List entries in a folder of the working set.', parameters: { path: 'string' } },
        read_file:   { name: 'read_file',   description: 'Read a file from the working set (pulls from the vault on miss in Phase 1).', parameters: { path: 'string' } },
        stat:        { name: 'stat',        description: 'Stat a path.', parameters: { path: 'string' } },
        exists:      { name: 'exists',      description: 'Check whether a path exists.', parameters: { path: 'string' } },
        write_file:  { name: 'write_file',  description: 'Write a file into the working set.', parameters: { path: 'string', content: 'string' } },
        create_folder: { name: 'create_folder', description: 'Create a folder (marker).', parameters: { path: 'string' } },
        rename:      { name: 'rename',      description: 'Rename/move a file in the working set.', parameters: { from: 'string', to: 'string' } },
        delete_file: { name: 'delete_file', description: 'Delete a file from the working set.', parameters: { path: 'string' } },
    };

    // Guard: the reserved control prefix is never reachable by a tool (doc 09 §2).
    function guard(path) {
        const p = root.VaultChat.MemoryVfs.norm(path);
        if (p === '/.vault' || p.startsWith('/.vault/')) {
            const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e;
        }
        return p;
    }

    // Build a name -> async(args) runner map bound to a MemoryVfs instance.
    function makeRunners(vfs) {
        return {
            async list_folder({ path }) { return { ok: true, entries: await vfs.listFolder(guard(path || '/')) }; },
            async read_file({ path })  { return { ok: true, path: guard(path), content: await vfs.readText(guard(path)) }; },
            async stat({ path })       { return { ok: true, stat: await vfs.stat(guard(path)) }; },
            async exists({ path })     { return { ok: true, exists: await vfs.exists(guard(path)) }; },
            async write_file({ path, content }) { const r = await vfs.writeFile(guard(path), content == null ? '' : content); return { ok: true, ...r }; },
            async create_folder({ path }) { const p = guard(path); const r = await vfs.writeFile(p.replace(/\/?$/, '/') + '.keep', ''); return { ok: true, path: p, marker: r.path }; },
            async rename({ from, to })  {
                const f = guard(from), t = guard(to);
                const bytes = await vfs.readFile(f);
                await vfs.writeFile(t, bytes);
                await vfs.deleteFile(f);
                return { ok: true, from: f, to: t };
            },
            async delete_file({ path }) { const r = await vfs.deleteFile(guard(path)); return { ok: true, ...r }; },
        };
    }

    root.VaultChat = root.VaultChat || {};
    root.VaultChat.BuiltinTools = { REGISTRY, makeRunners, guard };
})(typeof window !== 'undefined' ? window : globalThis);
