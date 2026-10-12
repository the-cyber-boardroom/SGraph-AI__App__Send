/* Guards VaultLlmLog — the session ledger the AI request pane renders and the cost
   figures a user is asked to trust. Run: node tests/unit/vault_ui/loader/test__vault_llm_log.js

   The property that matters most here is COST HONESTY: an estimate (tokens × list
   price) and a billed figure (what upstream actually charged) must never be summed
   into one indistinguishable number. totals() keeps them in separate buckets, and a
   reconciliation must MOVE a call from one bucket to the other rather than double-count.
*/

import { readFileSync }     from 'node:fs';
import { fileURLToPath }    from 'node:url';
import { runInThisContext } from 'node:vm';

const SRC = fileURLToPath(new URL(
    '../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/lib/sg-llm/vault-llm-log.js',
    import.meta.url));
runInThisContext(readFileSync(SRC, 'utf8'), { filename: 'vault-llm-log.js', displayErrors: true });
const Log = globalThis.VaultLlmLog;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n); } };

// ── birth: a request is recorded when SENT, not when it returns ──────────────
Log.clear();
const a = Log.add({ model: 'anthropic/claude-sonnet-4', files: ['index.html'], promptChars: 1200 });
ok('add() returns an entry with a local key', !!a.key);
ok('add() defaults to pending',               a.status === 'pending');
ok('add() defaults to estimated',             a.estimated === true);
ok('add() starts with no cost',               a.cost === null);
ok('add() starts with no upstream id',        a.id === null);
ok('list() has one entry',                    Log.list().length === 1);
ok('pending call is counted in totals',       Log.totals().pending === 1);
ok('pending call is NOT counted as uncosted', Log.totals().uncostedCalls === 0);

// ── the estimate lands when the stream ends ─────────────────────────────────
Log.update(a.key, {
    id: 'gen-abc123', status: 'ok', latencyMs: 900,
    usage: { prompt_tokens: 1000, completion_tokens: 500 },
    cost: 0.002, costSource: 'estimate', estimated: true
});
let t = Log.totals();
ok('estimate goes to the estimated bucket',   Math.abs(t.estimatedCost - 0.002) < 1e-9);
ok('estimate does NOT go to billed',          t.billedCost === 0);
ok('totalCost sums both buckets',             Math.abs(t.totalCost - 0.002) < 1e-9);
ok('tokens are tallied',                      t.promptTokens === 1000 && t.completionTokens === 500);
ok('totalTokens is the sum',                  t.totalTokens === 1500);
ok('ok call leaves pending',                  t.pending === 0 && t.ok === 1);

// ── reconciliation MOVES the money, never double-counts it ──────────────────
Log.update(a.key, { cost: 0.0031, costSource: 'generation', estimated: false });
t = Log.totals();
ok('reconciled cost moves to billed',         Math.abs(t.billedCost - 0.0031) < 1e-9);
ok('estimated bucket is emptied',             t.estimatedCost === 0);
ok('total is the billed figure, not a sum',   Math.abs(t.totalCost - 0.0031) < 1e-9);
ok('still exactly one call',                  t.calls === 1 && t.costedCalls === 1);

// ── a finished call nobody priced is visible as such ────────────────────────
const b = Log.add({ model: 'm', files: [] });
Log.update(b.key, { status: 'ok', usage: {} });
t = Log.totals();
ok('unpriced finished call is flagged',       t.uncostedCalls === 1);
ok('unpriced call adds nothing to cost',      Math.abs(t.totalCost - 0.0031) < 1e-9);

// ── failures and aborts are recorded, not swallowed ─────────────────────────
const c = Log.add({ model: 'm' });
Log.update(c.key, { status: 'error', error: 'OpenRouter 429' });
const d = Log.add({ model: 'm' });
Log.update(d.key, { status: 'aborted' });
t = Log.totals();
ok('errors are counted',                      t.errors === 1);
ok('aborts are counted',                      t.aborted === 1);
ok('error text is retained',                  Log.get(c.key).error === 'OpenRouter 429');

// ── files are de-duplicated across calls ────────────────────────────────────
Log.clear();
Log.add({ files: ['a.md', 'b.md'] });
Log.add({ files: ['b.md', 'c.md'] });
ok('distinct files counted once each',        Log.totals().files === 3);

// ── list() hands out a copy; the ledger cannot be corrupted from outside ────
const copy = Log.list();
copy.push({ bogus: true });
ok('list() is a copy',                        Log.list().length === 2);

// ── subscribe fires on every mutation, and unsubscribes cleanly ─────────────
let hits = 0;
const off = Log.subscribe(() => { hits++; });
Log.add({ model: 'm' });
ok('subscriber fires on add',                 hits === 1);
Log.update(Log.list()[2].key, { status: 'ok' });
ok('subscriber fires on update',              hits === 2);
off();
Log.add({ model: 'm' });
ok('unsubscribe stops delivery',              hits === 2);

// ── a throwing subscriber never breaks the ledger ──────────────────────────
const off2 = Log.subscribe(() => { throw new Error('bad subscriber'); });
let survived = true;
try { Log.add({ model: 'm' }); } catch (_) { survived = false; }
off2();
ok('a throwing subscriber is contained',      survived);

// ── export shapes: the generation id is the join key against a statement ───
Log.clear();
const e = Log.add({ model: 'anthropic/claude-sonnet-4', files: ['x/y.md'] });
Log.update(e.key, { id: 'gen-zzz', status: 'ok', cost: 0.5, estimated: false, costSource: 'generation',
                    usage: { prompt_tokens: 10, completion_tokens: 20 }, latencyMs: 42 });
const csv = Log.toCsv();
ok('CSV has a header row',                    csv.split('\n')[0].startsWith('seq,generation_id,model'));
ok('CSV carries the generation id',           csv.indexOf('gen-zzz') > 0);
ok('CSV quotes the file list',                csv.indexOf('"x/y.md"') > 0);
ok('JSON export carries entries + totals',    (() => {
    const j = JSON.parse(Log.toJSON());
    return Array.isArray(j.entries) && j.entries.length === 1 && j.totals.calls === 1;
})());

// ── the ring cap bounds a long session ─────────────────────────────────────
Log.clear();
for (let i = 0; i < Log.MAX_ENTRIES + 25; i++) Log.add({ model: 'm' });
ok('entries are capped',                      Log.list().length === Log.MAX_ENTRIES);
ok('the OLDEST entries are dropped',          Log.list()[0].seq === 26);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
