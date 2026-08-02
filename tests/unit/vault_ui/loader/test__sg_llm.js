/* SGLlm — SSE framing, cost accounting, context building, redaction.
   Run: node tests/unit/vault_ui/loader/test__sg_llm.js

   These pin the two production bugs the SG/Vault Workbench's review found the hard
   way — a discarded decoder tail losing the final `usage` frame, and a swallowed
   mid-stream error producing an empty reply — plus the estimate-vs-authoritative
   cost rule (an estimate must never be presentable as a bill). */

import { readFileSync }     from 'node:fs';
import { runInThisContext } from 'node:vm';

runInThisContext(readFileSync(
    'sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/lib/sg-llm/sg-llm.js', 'utf8'));

const L = globalThis.SGLlm;
let pass = 0, fail = 0;
const ok = (n, c, info) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (info ? ' — ' + info : '')); } };

console.log('\n[suite] SGLlm — SSE framing keeps the tail');
{
    const a = L.sseLines('data: {"x":1}\ndata: {"y":2}\ndata: {"z":3}');
    ok('complete lines are split', a.lines.length === 2);
    ok('the INCOMPLETE tail is returned, not dropped', a.rest === 'data: {"z":3}', JSON.stringify(a.rest));

    const b = L.sseLines('');
    ok('empty buffer → no lines, empty rest', b.lines.length === 0 && b.rest === '');

    const c = L.sseLines('one\ntwo\n');
    ok('trailing newline leaves an empty rest', c.lines.length === 2 && c.rest === '');

    // The actual regression: a final usage frame arriving with no trailing newline.
    // Framing must surface it as `rest` so the caller can flush it after the loop.
    const d = L.sseLines('data: {"usage":{"cost":0.5}}');
    ok('a lone unterminated usage frame survives as rest', d.rest.indexOf('usage') > 0);
    ok('…and parses once flushed', L.parseSseData(d.rest).usage.cost === 0.5);
}

console.log('\n[suite] SGLlm — parseSseData');
{
    ok('blank line → null', L.parseSseData('') === null);
    ok('comment → null', L.parseSseData(': ping') === null);
    ok('[DONE] → null', L.parseSseData('data: [DONE]') === null);
    ok('non-data line → null', L.parseSseData('event: message') === null);
    ok('malformed JSON → null (partial frame tolerated)', L.parseSseData('data: {"a":') === null);

    const d = L.parseSseData('data: {"id":"g1","model":"m/x","choices":[{"delta":{"content":"hi"}}]}');
    ok('delta content extracted', d.delta === 'hi');
    ok('generation id extracted', d.id === 'g1');
    ok('model extracted', d.model === 'm/x');

    const f = L.parseSseData('data: {"choices":[{"finish_reason":"stop"}],"usage":{"prompt_tokens":10}}');
    ok('finish_reason extracted', f.finish === 'stop');
    ok('usage extracted', f.usage.prompt_tokens === 10);

    // The second Workbench bug: an in-stream error must be surfaced, not swallowed.
    const e = L.parseSseData('data: {"error":{"message":"rate limited"}}');
    ok('mid-stream error is surfaced', e && e.error === 'rate limited');
    ok('mid-stream error carries no delta', !e.delta);

    // Non-stream shape (routes that ignore stream:true)
    const n = L.parseSseData('data: {"choices":[{"message":{"content":"full"}}]}');
    ok('non-stream message content is read as a delta', n.delta === 'full');
}

console.log('\n[suite] SGLlm — chat() refuses to send a null model');
{
    // Regression: {model:null} used to reach OpenRouter, which replied
    // `404 No endpoints found for .` — a remote error for a local misconfiguration.
    const c = new L({ apiKey: 'sk-or-test' });
    const call = async (model) => {
        try { await c.chat({ model, messages: [{ role: 'user', content: 'hi' }] }); return null; }
        catch (e) { return e; }
    };
    const run = async () => {
        const eNull = await call(null);
        ok('null model rejects locally', !!eNull && eNull.code === 'EMODEL');
        ok('…with an actionable message', /Settings|pick one/i.test(eNull.message), eNull && eNull.message);
        ok('undefined model rejects', (await call(undefined)).code === 'EMODEL');
        ok('empty-string model rejects', (await call('')).code === 'EMODEL');
        ok('non-string model rejects', (await call(42)).code === 'EMODEL');
        // No key is still reported first — the more fundamental misconfiguration.
        const noKey = new L({ apiKey: '' });
        let e2; try { await noKey.chat({ model: 'a/b', messages: [] }); } catch (e) { e2 = e; }
        ok('missing key reports ENOKEY, not EMODEL', e2 && e2.code === 'ENOKEY');
    };
    await run();
}

console.log('\n[suite] SGLlm — cost: estimate vs authoritative');
{
    const price = { prompt: 0.001, completion: 0.002 };
    ok('estimate multiplies tokens by unit price',
        L.estimateCost({ prompt_tokens: 100, completion_tokens: 50 }, price) === 0.2);
    ok('no price → null (never guess)', L.estimateCost({ prompt_tokens: 100 }, null) === null);
    ok('no tokens → null', L.estimateCost({}, price) === null);

    const real = L.effectiveCost({ cost: 0.0031, costSource: 'openrouter' });
    ok('a real cost is not marked estimated', real.value === 0.0031 && real.estimated === false);
    ok('a real cost keeps its source', real.source === 'openrouter');

    const est = L.effectiveCost({ usage: { prompt_tokens: 100, completion_tokens: 50 }, price: price });
    ok('a derived cost IS marked estimated', est.estimated === true && est.source === 'estimate');
    ok('…and carries the computed value', est.value === 0.2);

    const none = L.effectiveCost({});
    ok('unknown cost → null value, still flagged estimated', none.value === null && none.estimated === true);

    const pricing = L.pricingFromModels({ data: [
        { id: 'a/b', pricing: { prompt: '0.000001', completion: '0.000002' } },
        { id: 'no-pricing' },
    ] });
    ok('pricing map is built from /models', pricing['a/b'].completion === 0.000002);
    ok('models without pricing are skipped', !('no-pricing' in pricing));
}

console.log('\n[suite] SGLlm — file context is honest about truncation');
{
    const small = L.buildFileContext({ path: 'docs/a.md', content: 'hello' });
    ok('short file is not truncated', small.truncated === false);
    ok('context names the path', small.text.indexOf('docs/a.md') > 0);
    ok('context contains the body', small.text.indexOf('hello') > 0);

    const big = L.buildFileContext({ path: 'big.txt', content: 'x'.repeat(500), maxChars: 100 });
    ok('long file is flagged truncated', big.truncated === true);
    ok('truncation is stated IN the text the model sees', /TRUNCATED/.test(big.text));
    ok('body is actually cut to the budget', big.text.indexOf('x'.repeat(101)) === -1);

    const empty = L.buildFileContext({ path: 'e.txt', content: '' });
    ok('empty file does not throw and is not truncated', empty.truncated === false);
}

console.log('\n[suite] SGLlm — redaction keeps logs shareable');
{
    const out = L.redactMessages([
        { role: 'user', content: 'plain text' },
        { role: 'user', content: [{ type: 'text', text: 'look' },
                                  { type: 'image_url', image_url: { url: 'data:image/png;base64,' + 'A'.repeat(4096) } }] }
    ]);
    ok('string content passes through', out[0].content === 'plain text');
    ok('text parts pass through', out[1].content[0].text === 'look');
    ok('image payload is replaced by a size note', /image omitted/.test(out[1].content[1].image_url.url));
    ok('image bytes are gone', out[1].content[1].image_url.url.indexOf('AAAA') === -1);
}

console.log('\n' + (fail === 0 ? '✓' : '✗') + ' ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
