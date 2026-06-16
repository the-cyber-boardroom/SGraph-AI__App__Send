/* Unit tests — SgitDiff (pure line-diff → unified hunks)
   Run: node tests/unit/vault_ui/loader/test__sgit_diff.js

   Pins the diff contract the SGit commit-detail view depends on (add/remove counts,
   hunk grouping + headers, binary/too-large handling is caller-side, copy-as-patch). */

import { readFileSync }     from 'node:fs';
import { fileURLToPath }    from 'node:url';
import { runInThisContext } from 'node:vm';

const ROOT = '../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/components/vault-sgit-view/';
runInThisContext(
    readFileSync(fileURLToPath(new URL(ROOT + 'sgit-diff.js', import.meta.url)), 'utf8'),
    { filename: 'sgit-diff.js', displayErrors: true }
);
const D = globalThis.SgitDiff;

let pass = 0, fail = 0;
function ok(name, cond, info) {
    if (cond) { pass++; console.log('  ✓ ' + name); }
    else      { fail++; console.log('  ✗ ' + name + (info ? ' — ' + info : '')); }
}

console.log('\n[suite] SgitDiff — basic stats');
{
    const same = D.lineDiff('a\nb\nc', 'a\nb\nc');
    ok('identical → 0 added, 0 removed, no hunks',
        same.stats.added === 0 && same.stats.removed === 0 && same.hunks.length === 0);

    const oneAdd = D.lineDiff('a\nb', 'a\nb\nc');
    ok('one line added → added 1, removed 0', oneAdd.stats.added === 1 && oneAdd.stats.removed === 0);

    const oneDel = D.lineDiff('a\nb\nc', 'a\nb');
    ok('one line removed → added 0, removed 1', oneDel.stats.added === 0 && oneDel.stats.removed === 1);

    const change = D.lineDiff('a\nb\nc', 'a\nB\nc');
    ok('one line modified → added 1, removed 1 (del+add)', change.stats.added === 1 && change.stats.removed === 1);
}

console.log('\n[suite] SgitDiff — added / removed whole files');
{
    const created = D.lineDiff('', 'x\ny\nz');
    ok('empty → content: all added', created.stats.added === 3 && created.stats.removed === 0);

    const deleted = D.lineDiff('x\ny\nz', '');
    ok('content → empty: all removed', deleted.stats.removed === 3 && deleted.stats.added === 0);
}

console.log('\n[suite] SgitDiff — hunk grouping + headers');
{
    // 10 identical lines, change line 5 only → one hunk with 3 lines context each side
    const a = Array.from({ length: 10 }, (_, i) => 'line' + i).join('\n');
    const b = a.split('\n'); b[4] = 'CHANGED'; const bt = b.join('\n');
    const d = D.lineDiff(a, bt, 3);
    ok('single change → exactly one hunk', d.hunks.length === 1);
    const h = d.hunks[0];
    // context 3 above + changed (del+add) + 3 below → rows present
    ok('hunk has a del and an add row',
        h.rows.some(r => r.type === '-') && h.rows.some(r => r.type === '+'));
    ok('hunk header well-formed', /^@@ -\d+,\d+ \+\d+,\d+ @@$/.test(D.hunkHeader(h)), D.hunkHeader(h));
    ok('hunk does not span the whole file (context-bounded)', h.rows.length < 10, 'rows=' + h.rows.length);

    // two distant changes → two separate hunks
    const c = Array.from({ length: 40 }, (_, i) => 'L' + i).join('\n').split('\n');
    c[2] = 'C2'; c[35] = 'C35';
    const d2 = D.lineDiff(Array.from({ length: 40 }, (_, i) => 'L' + i).join('\n'), c.join('\n'), 3);
    ok('two distant changes → two hunks', d2.hunks.length === 2, 'hunks=' + d2.hunks.length);
}

console.log('\n[suite] SgitDiff — too-large guard');
{
    const big = Array.from({ length: D.MAX_LINES + 5 }, (_, i) => 'n' + i).join('\n');
    const r = D.lineDiff(big, big + '\nextra');
    ok('over MAX_LINES → tooLarge, no hunks', r.tooLarge === true && r.hunks.length === 0);
}

console.log('\n[suite] SgitDiff — unified patch');
{
    const patch = D.toUnifiedPatch('config/x.json', 'a\nb\nc', 'a\nB\nc', 'modified');
    ok('patch has --- a/ and +++ b/ headers',
        patch.includes('--- a/config/x.json') && patch.includes('+++ b/config/x.json'));
    ok('patch marks the removed + added lines', patch.includes('\n-b') && patch.includes('\n+B'));

    const addPatch = D.toUnifiedPatch('new.txt', '', 'hello', 'added');
    ok('added file patch uses /dev/null as old side', addPatch.includes('--- /dev/null'));

    const delPatch = D.toUnifiedPatch('gone.txt', 'bye', '', 'removed');
    ok('removed file patch uses /dev/null as new side', delPatch.includes('+++ /dev/null'));
}

console.log('\n[suite] SgitDiff — line-ending + trailing newline normalisation');
{
    ok('CRLF vs LF only → no diff', D.lineDiff('a\r\nb', 'a\nb').stats.added === 0);
    ok('trailing newline ignored → no diff', D.lineDiff('a\nb\n', 'a\nb').stats.added === 0);
}

console.log('\n' + (fail === 0 ? '✓' : '✗') + ' ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
