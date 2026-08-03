/* SGVoice — mic capture → an OpenRouter-ready audio part.
   Run: node tests/unit/vault_ui/loader/test__sg_voice.js

   The pure helpers carry the browser-compatibility knowledge, so they are what is worth
   pinning:
     - iOS Safari records `audio/mp4` and Chrome records `audio/webm`. m4a is accepted by
       OpenRouter; webm is NOT — so formatFor()/isSendable() together decide whether the
       decode step runs. Get this wrong and the iPad path silently transcodes for nothing,
       or the Chrome path sends bytes the API rejects.
     - base64 is chunked at 8190, not 8192. 8192 % 3 === 2, so every non-final slice would
       carry '=' padding mid-string and atob() rejects that — this repo already shipped
       exactly that bug once in the VFS write bridge (fixed v0.33.21).
*/

import { readFileSync }     from 'node:fs';
import { fileURLToPath }    from 'node:url';
import { runInThisContext } from 'node:vm';

// btoa/window shims — the module reads window.SG_TOOLS_BASE and uses btoa.
globalThis.window = globalThis.window || {};
globalThis.btoa = globalThis.btoa || ((s) => Buffer.from(s, 'binary').toString('base64'));

const SRC = fileURLToPath(new URL(
    '../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/lib/sg-voice/sg-voice.js',
    import.meta.url));
runInThisContext(readFileSync(SRC, 'utf8'), { filename: 'sg-voice.js', displayErrors: true });
const V = globalThis.SGVoice;

let pass = 0, fail = 0;
const ok = (n, c, info) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (info ? ' — ' + info : '')); } };

console.log('\n[suite] formatFor — the container, not the codec');
{
    // The iPad path: MediaRecorder gives audio/mp4 with a codecs= parameter.
    ok('iOS audio/mp4 → m4a',                V.formatFor('audio/mp4') === 'm4a');
    ok('…with a codecs parameter',           V.formatFor('audio/mp4;codecs=mp4a.40.2') === 'm4a');
    ok('…case-insensitively',                V.formatFor('AUDIO/MP4') === 'm4a');
    ok('…with whitespace',                   V.formatFor(' audio/mp4 ') === 'm4a');
    // The Chrome path.
    ok('Chrome audio/webm → webm',           V.formatFor('audio/webm;codecs=opus') === 'webm');
    ok('audio/ogg → ogg',                    V.formatFor('audio/ogg;codecs=opus') === 'ogg');
    ok('audio/wav → wav',                    V.formatFor('audio/wav') === 'wav');
    ok('audio/x-wav → wav',                  V.formatFor('audio/x-wav') === 'wav');
    ok('audio/mpeg → mp3',                   V.formatFor('audio/mpeg') === 'mp3');
    ok('audio/aac → aac',                    V.formatFor('audio/aac') === 'aac');
    ok('audio/flac → flac',                  V.formatFor('audio/flac') === 'flac');
    ok('unknown → null',                     V.formatFor('audio/weird') === null);
    ok('empty → null',                       V.formatFor('') === null);
    ok('null → null',                        V.formatFor(null) === null);
}

console.log('\n[suite] isSendable — the decode step depends entirely on this');
{
    ok('m4a is sent as-is (the iPad happy path)', V.isSendable('m4a') === true);
    ok('wav is sent as-is',                       V.isSendable('wav') === true);
    ok('aac / ogg / flac / mp3 are accepted',
        ['aac', 'ogg', 'flac', 'mp3'].every((f) => V.isSendable(f)));
    ok('webm is NOT accepted → forces the decode', V.isSendable('webm') === false);
    ok('null is not accepted',                     V.isSendable(null) === false);
    ok('the accepted list matches OpenRouter',
        V.SENDABLE.slice().sort().join(',') === 'aac,flac,m4a,mp3,ogg,wav');

    // The decision the runtime makes, spelled out: iPad skips conversion, Chrome doesn't.
    const needsConvert = (mime) => { const f = V.formatFor(mime); return !f || !V.isSendable(f); };
    ok('an iPad recording needs NO conversion',  needsConvert('audio/mp4;codecs=mp4a.40.2') === false);
    ok('a Chrome recording DOES need converting', needsConvert('audio/webm;codecs=opus') === true);
    ok('an unknown container converts (safe default)', needsConvert('audio/qqq') === true);
}

console.log('\n[suite] bytesToBase64 — chunking must never emit mid-string padding');
{
    const round = (n) => {
        const bytes = new Uint8Array(n);
        for (let i = 0; i < n; i++) bytes[i] = i % 256;
        const b64 = V.bytesToBase64(bytes);
        const back = Buffer.from(b64, 'base64');
        return back.length === n && back.every((v, i) => v === bytes[i]);
    };
    ok('empty round-trips',            V.bytesToBase64(new Uint8Array(0)) === '');
    ok('1 byte round-trips',           round(1));
    ok('small buffer round-trips',     round(1000));
    // Straddling the chunk boundary is where a 8192-sized chunk would corrupt the string.
    ok('exactly one chunk (8190)',     round(8190));
    ok('one byte over a chunk',        round(8191));
    ok('just under two chunks',        round(16379));
    ok('exactly two chunks',           round(16380));
    ok('a realistic 200 KB clip',      round(200 * 1024));
    ok('no "=" appears mid-string', (() => {
        const b64 = V.bytesToBase64(new Uint8Array(100000));
        const i = b64.indexOf('=');
        return i === -1 || i >= b64.length - 2;
    })());
}

console.log('\n[suite] audioPart — the exact wire shape OpenRouter expects');
{
    const p = V.audioPart({ data: 'AAAA', format: 'm4a' });
    ok('type is input_audio',            p.type === 'input_audio');
    ok('data is nested under input_audio', p.input_audio.data === 'AAAA');
    ok('format travels with it',         p.input_audio.format === 'm4a');
    ok('a missing format defaults to wav', V.audioPart({ data: 'x' }).input_audio.format === 'wav');
    ok('a missing payload is empty, not undefined', V.audioPart(null).input_audio.data === '');
}

console.log('\n[suite] available() — reports WHY, and never throws');
{
    // The null-origin app-frame case: touching navigator.mediaDevices can throw.
    globalThis.window.isSecureContext = true;
    const realNav = globalThis.navigator;
    Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        get() { throw new Error('SecurityError: sandboxed'); }
    });
    let res, threw = false;
    try { res = V.available(); } catch (_) { threw = true; }
    ok('a throwing navigator does not propagate', !threw);
    ok('…it reports ENOMIC',                       res && res.reason === 'ENOMIC');
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: realNav });

    globalThis.window.isSecureContext = false;
    ok('an insecure context reports EINSECURE', V.available().reason === 'EINSECURE');

    globalThis.window.isSecureContext = true;
    // Node's `navigator` is a read-only accessor — redefine rather than assign.
    Object.defineProperty(globalThis, 'navigator', {
        configurable: true, value: { mediaDevices: { getUserMedia() {} } }
    });
    globalThis.MediaRecorder = undefined;
    ok('no MediaRecorder reports ENOREC', V.available().reason === 'ENOREC');

    globalThis.MediaRecorder = function () {};
    ok('a capable host reports ok', V.available().ok === true);
    ok('…with no reason', V.available().reason === null);
}

console.log('\n' + (fail === 0 ? '✓' : '✗') + ' ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
