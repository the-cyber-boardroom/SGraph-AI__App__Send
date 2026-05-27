import { suite, assert }      from './vc-helpers.js';
import './load-vault-chat.js';     // sets up window + window.VaultChat
import { readFileSync }        from 'node:fs';
import { fileURLToPath, URL }  from 'node:url';
import { runInThisContext }     from 'node:vm';

// load the harness mock LLM fixture into the same context
const p = fileURLToPath(new URL(
    '../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/en-gb/vault/chat/test/mock-llm.js',
    import.meta.url));
runInThisContext(readFileSync(p, 'utf8'), { filename: 'mock-llm.js' });

const sendLlm = global.window.VaultChat.createMockLlm();
const userMsg = (content) => ({ messages: [{ role: 'user', content }] });

await suite('Mock LLM (harness fixture)', ({ test }) => {
    test('"list /work" -> list_folder tool call', async () => {
        const r = await sendLlm(userMsg('list /work'));
        assert.equal(r.toolCalls[0].name, 'list_folder');
        assert.equal(r.toolCalls[0].args.path, '/work');
    });
    test('"read /notes.md" -> read_file tool call', async () => {
        const r = await sendLlm(userMsg('read /notes.md'));
        assert.equal(r.toolCalls[0].name, 'read_file');
        assert.equal(r.toolCalls[0].args.path, '/notes.md');
    });
    test('"write /work/x.md hello world" -> write_file with content', async () => {
        const r = await sendLlm(userMsg('write /work/x.md hello world'));
        assert.equal(r.toolCalls[0].name, 'write_file');
        assert.equal(r.toolCalls[0].args.path, '/work/x.md');
        assert.equal(r.toolCalls[0].args.content, 'hello world');
    });
    test('"make an infographic" -> create_infographic', async () => {
        const r = await sendLlm(userMsg('make an infographic'));
        assert.equal(r.toolCalls[0].name, 'create_infographic');
    });
    test('plain chat returns text and no tool calls', async () => {
        const r = await sendLlm(userMsg('hello there'));
        assert.ok(!r.toolCalls);
        assert.ok(/mock LLM/.test(r.text));
    });
    test('after a tool result the mock wraps up with text', async () => {
        const r = await sendLlm({ messages: [{ role: 'user', content: 'read /a' }, { role: 'tool', name: 'read_file', content: '{}' }] });
        assert.ok(!r.toolCalls);
        assert.ok(r.text.length > 0);
    });
});
