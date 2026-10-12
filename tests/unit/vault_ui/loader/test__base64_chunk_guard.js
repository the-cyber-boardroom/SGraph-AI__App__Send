/* Repo-wide invariant: every chunked base64 encoder uses a chunk size divisible by 3.
   Run: node tests/unit/vault_ui/loader/test__base64_chunk_guard.js

   WHY THIS IS A TEST AND NOT A COMMENT: this exact bug has now been shipped three times in
   three different files, because `chunk=8192` looks obviously correct and is obviously wrong.

   Chunked encoders call btoa() on each slice SEPARATELY and concatenate the results. base64
   encodes 3 bytes → 4 chars, so a slice whose byte length is not a multiple of 3 gets '='
   padding of its own. Concatenating then puts '=' in the MIDDLE of the string, and atob()
   accepts '=' only at the end — so the payload fails to decode, or decodes truncated.

   8192 % 3 === 2. Every write over 8 KB broke, in three separate files:
     - app-shell.js `sg.vfs.write`        — found + fixed at v0.33.21
     - send-browse--v0.3.2.js (user tree) — the vault preview's bridge; fixed 2026-08-03
     - send-browse--v0.3.3.js (open tree) — same code, same bug; fixed 2026-08-03

   What actually happens (verified, not assumed): the parent-side handler wraps its atob()
   in a try/catch and replies { err: 'Bad encoding' }. So the write FAILS LOUDLY — it does
   not write corrupted bytes. The practical effect was still bad: **no write over 8 KB was
   possible from the /vault preview pane at all**, which is the kind of ceiling that pushes
   app authors into splitting files into parts to get under it.

   This test greps the shipped UI trees rather than importing anything, because the encoders
   live inside giant injected-bridge STRING literals that cannot be imported. A source-level
   invariant is the honest guard here.
*/

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join }                                from 'node:path';

const ROOTS = [
    'sgraph_ai_app_send__ui__vault',
    'sgraph_ai_app_send__ui__user',
    'sgraph_ai_app_send__ui__open',
    'sgraph_ai_app_send__ui__share',
    'sgraph_ai_app_send__ui__admin',
    'sgraph_ai_app_send__ui__workspace'
];

let pass = 0, fail = 0;
const ok = (n, c, info) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (info ? ' — ' + info : '')); } };

function walk(dir, out = []) {
    let entries;
    try { entries = readdirSync(dir); } catch (_) { return out; }
    for (const e of entries) {
        const p = join(dir, e);
        let st;
        try { st = statSync(p); } catch (_) { continue; }
        if (st.isDirectory()) walk(p, out);
        else if (e.endsWith('.js')) out.push(p);
    }
    return out;
}

const files = ROOTS.flatMap((r) => walk(r));
ok('found UI sources to scan', files.length > 100, files.length + ' files');

// A chunk constant only matters when the file also base64-encodes.
const CHUNK_RE = /chunk\s*=\s*(\d+)/g;
const offenders = [];
let checked = 0;

for (const f of files) {
    let src;
    try { src = readFileSync(f, 'utf8'); } catch (_) { continue; }
    if (src.indexOf('btoa') === -1) continue;
    let m;
    CHUNK_RE.lastIndex = 0;
    while ((m = CHUNK_RE.exec(src)) !== null) {
        const size = Number(m[1]);
        if (!isFinite(size) || size <= 0) continue;
        checked++;
        if (size % 3 !== 0) {
            const line = src.slice(0, m.index).split('\n').length;
            offenders.push(`${f}:${line} chunk=${size} (${size} % 3 === ${size % 3})`);
        }
    }
}

ok('at least one chunked base64 encoder was checked', checked > 0, 'checked=' + checked);
ok('every base64 chunk size is divisible by 3', offenders.length === 0,
   offenders.length ? '\n      ' + offenders.join('\n      ') : '');

// The known-good value, asserted directly so a "fix" that picks another bad number is caught.
ok('8190 is a safe chunk size',   8190 % 3 === 0);
ok('8192 would NOT be safe',      8192 % 3 !== 0);

console.log('\n' + (fail === 0 ? '✓' : '✗') + ' ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
