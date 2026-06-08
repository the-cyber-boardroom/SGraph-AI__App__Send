/* Regression guard for the in-iframe write 401 bug — SGSend access-token header.
   Run: node tests/unit/vault_ui/loader/test__sgsend_access_token.js

   The app-shell bridge fix threads the access token onto vault._sgSend.token AFTER the vault
   is opened (on setKey / cached-token resolve). That only works because SGSend._authHeaders()
   reads this.token at REQUEST time. This test guards that property: a token set after
   construction must appear as the x-sgraph-access-token header. */

import { readFileSync }     from 'node:fs';
import { fileURLToPath }    from 'node:url';
import { runInThisContext } from 'node:vm';

const SRC = fileURLToPath(new URL('../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.4/_common/js/lib/sg-send/sg-send.js', import.meta.url));
runInThisContext(readFileSync(SRC, 'utf8'), { filename: 'sg-send.js', displayErrors: true });
runInThisContext('globalThis.SGSend = SGSend;');
const { SGSend } = globalThis;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n); } };

console.log('\n[suite] SGSend access-token header (in-iframe write 401 guard)');

const s = new SGSend({ endpoint: 'https://dev.send.sgraph.ai/' });
ok('endpoint trailing slash trimmed', s.endpoint === 'https://dev.send.sgraph.ai');
ok('no token → no x-sgraph-access-token header', !('x-sgraph-access-token' in s._authHeaders()));

// The fix: assigning the token AFTER construction (as app-shell does post-open) must be honoured.
s.token = 'tok-abc';
ok('token set after construction → header present', s._authHeaders()['x-sgraph-access-token'] === 'tok-abc');

// constructor token also works
const s2 = new SGSend({ endpoint: 'https://x', token: 'tok-2' });
ok('constructor token → header present', s2._authHeaders()['x-sgraph-access-token'] === 'tok-2');

console.log('  ' + pass + ' pass, ' + fail + ' fail\n');
process.exit(fail === 0 ? 0 : 1);
