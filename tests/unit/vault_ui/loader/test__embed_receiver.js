/* Guards EmbedReceiver (embed-receiver.js) — the SHARED child-side embed handshake
   extracted from app-shell._initEmbed so /en-gb/app/ and /en-gb/vault/ run one
   implementation. Uses a stub window; no jsdom needed.

   Covers: ready ping on start, one-shot open (listener removed after first VALID
   message), source pinning (event.source must be win.parent), origin enforcement
   when ?parent= is given, notifyReady wire shape, stop() disarm, and the
   targetOrigin '*' fallback for null-origin parents.

   Run: node tests/unit/vault_ui/loader/test__embed_receiver.js */

import { readFileSync }     from 'node:fs';
import { fileURLToPath }    from 'node:url';
import { runInThisContext } from 'node:vm';

const BASE = '../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/components/app-shell/';
for (const f of ['embed-protocol.js', 'embed-receiver.js']) {
    const p = fileURLToPath(new URL(BASE + f, import.meta.url));
    runInThisContext(readFileSync(p, 'utf8'), { filename: f, displayErrors: true });
}
const { EmbedReceiver } = globalThis;

function stubWin(search) {
    const parentPosts = [];
    const listeners   = {};
    const parent      = { postMessage: (msg, to) => parentPosts.push({ msg, to }) };
    return {
        parent, parentPosts,
        location: { search: search || '' },
        addEventListener:    (n, h) => { (listeners[n] = listeners[n] || []).push(h); },
        removeEventListener: (n, h) => { listeners[n] = (listeners[n] || []).filter(x => x !== h); },
        dispatch(event)  { (listeners.message || []).slice().forEach(h => h(event)); },
        listenerCount()  { return (listeners.message || []).length; }
    };
}

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n); } };

console.log('\n[suite] EmbedReceiver — ready ping + one-shot open');
{
    const win    = stubWin('?embed=1');
    const opens  = [];
    const r      = EmbedReceiver.start({ win, onOpen: p => opens.push(p) });

    ok('posts vault-embed-ready on start',      win.parentPosts.length === 1 && win.parentPosts[0].msg.sg === 'vault-embed-ready');
    ok('no ?parent → targetOrigin "*"',          win.parentPosts[0].to === '*' && r.targetOrigin === '*');
    ok('message listener armed',                 win.listenerCount() === 1);

    // Invalid: wrong source (a sibling frame)
    win.dispatch({ source: {}, origin: 'https://evil.example', data: { sg: 'vault-open', key: 'k' } });
    ok('wrong event.source ignored',             opens.length === 0 && win.listenerCount() === 1);

    // Invalid: right source, malformed payload
    win.dispatch({ source: win.parent, origin: 'null', data: { sg: 'vault-open' } });
    ok('open without key ignored (still armed)', opens.length === 0 && win.listenerCount() === 1);

    // Valid open
    win.dispatch({ source: win.parent, origin: 'null', data: { sg: 'vault-open', key: 'abc:defg1234', mode: 'vault', deepLink: 'a.md' } });
    ok('valid open delivered',                   opens.length === 1 && opens[0].key === 'abc:defg1234' && opens[0].deepLink === 'a.md');
    ok('listener removed after first valid msg', win.listenerCount() === 0);

    // Re-key attempt after open
    win.dispatch({ source: win.parent, origin: 'null', data: { sg: 'vault-open', key: 'other' } });
    ok('re-key attempt ignored (one-shot)',      opens.length === 1);

    r.notifyReady({ vaultName: 'V', fileCount: 3, hasApp: false });
    const ready = win.parentPosts[win.parentPosts.length - 1].msg;
    ok('notifyReady posts vault-ready shape',    ready.sg === 'vault-ready' && ready.vaultName === 'V' && ready.fileCount === 3 && ready.hasApp === false);

    r.notifyError('HEAD ref missing');
    const errMsg = win.parentPosts[win.parentPosts.length - 1].msg;
    ok('notifyError posts vault-error shape (parent mount() rejects with the real reason)',
       errMsg.sg === 'vault-error' && errMsg.message === 'HEAD ref missing');
}

console.log('\n[suite] EmbedReceiver — ?parent origin enforcement');
{
    const win   = stubWin('?embed=1&parent=' + encodeURIComponent('https://sgit.ai'));
    const opens = [];
    const r     = EmbedReceiver.start({ win, onOpen: p => opens.push(p) });

    ok('targetOrigin pinned to expected parent', r.targetOrigin === 'https://sgit.ai' && win.parentPosts[0].to === 'https://sgit.ai');

    win.dispatch({ source: win.parent, origin: 'https://evil.example', data: { sg: 'vault-open', key: 'k' } });
    ok('wrong origin rejected',                  opens.length === 0);

    win.dispatch({ source: win.parent, origin: 'https://sgit.ai', data: { sg: 'vault-open', key: 'k' } });
    ok('expected origin accepted',               opens.length === 1);
}

console.log('\n[suite] EmbedReceiver — stop() disarms the listener');
{
    const win   = stubWin('?embed=1');
    const opens = [];
    const r     = EmbedReceiver.start({ win, onOpen: p => opens.push(p) });
    r.stop();
    ok('listener removed by stop()',             win.listenerCount() === 0);
    win.dispatch({ source: win.parent, origin: 'null', data: { sg: 'vault-open', key: 'k' } });
    ok('no open after stop()',                   opens.length === 0);
}

console.log('\n  ' + pass + ' pass, ' + fail + ' fail\n');
process.exit(fail === 0 ? 0 : 1);
