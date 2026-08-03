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

/* ─────────────────────────────────────────────────────────────────────────────
   start()/stop() against a stand-in that enforces the REAL SG/Tools contract.

   These exist because of a bug that reached a user's browser: `core/sg-audio` is a
   SEGMENT recorder — `startRecording()` throws "onSegment callback is required" if you
   omit the callback, and `stopRecording()` resolves to `undefined`, delivering every byte
   through that callback instead. SGVoice originally called `startRecording({})` and read a
   blob off `stopRecording()`'s return value, so recording could never start and, had it
   started, stopping would have failed too.

   Nothing about that is visible by reading SGVoice alone, and a dynamic import() of a CDN
   URL cannot run in Node. So the fake below is copied from the real module's source —
   including its guard — and the tests assert we satisfy it.
   ───────────────────────────────────────────────────────────────────────────── */

function fakeAudio(segments) {
    const state = { opts: null, tracksStopped: 0, stopCalls: 0 };
    const mod = {
        // Verbatim shape of core/sg-audio v0.1.0 startRecording/stopRecording.
        async startRecording(opts = {}) {
            if (!opts.onSegment) throw new Error('onSegment callback is required');
            state.opts = opts;
            const session = {
                mimeType: opts.mimeType || 'audio/webm;codecs=opus',
                stopped:  false,
                segmentIndex: 0,
                stream: { getTracks: () => [{ stop() { state.tracksStopped++; } }] },
                _onSegment: opts.onSegment
            };
            state.session = session;
            return session;
        },
        async stopRecording(session) {
            state.stopCalls++;
            if (session.stopped) return;                 // the real early-return
            session.stopped = true;
            (segments || []).forEach((bytes, i) => session._onSegment({
                index: i + 1,
                blob: new Blob([new Uint8Array(bytes)], { type: session.mimeType }),
                mimeType: session.mimeType, startTimeMs: 0, durationMs: 1000
            }));
            session.stream.getTracks().forEach((t) => t.stop());
        }
    };
    return { state, mod };
}

function fakeDecode() {
    const state = { calls: 0 };
    return { state, mod: {
        async blobToWav(blob) {
            state.calls++;
            const u = new Uint8Array(await blob.arrayBuffer());
            return new Blob([u, new Uint8Array([9, 9])], { type: 'audio/wav' });   // marker bytes
        }
    } };
}

console.log('\n[suite] start() — honours the segment-recorder contract');
{
    globalThis.window.isSecureContext = true;
    Object.defineProperty(globalThis, 'navigator', {
        configurable: true, value: { mediaDevices: { getUserMedia() {} } }
    });
    globalThis.MediaRecorder = function () {};

    const a = fakeAudio([[1, 2, 3]]);
    V.__setModules({ audio: a.mod, decode: fakeDecode().mod });

    let sess = null, err = null;
    try { sess = await V.start(); } catch (e) { err = e; }

    ok('start() no longer throws "onSegment callback is required"',
        err === null, err && err.message);
    ok('…because it passes an onSegment callback', typeof a.state.opts.onSegment === 'function');
    ok('…and a segment duration',                  a.state.opts.segmentDurationMs > 0);
    ok('the take is one long segment, not 30s slices', a.state.opts.segmentDurationMs >= 60000);
    ok('a chunk buffer travels with the session',  Array.isArray(sess.sgChunks));
    ok('…and a start timestamp for the duration',  typeof sess.sgStartMs === 'number');

    // Two panels can hold two microphones; neither may collect the other's audio.
    const s2 = await V.start();
    ok('two sessions do not share a chunk buffer', sess.sgChunks !== s2.sgChunks);
}

console.log('\n[suite] stop() — reads audio from the segments, not the return value');
{
    // stopRecording() resolves to undefined. Reading a blob off it is the original bug.
    const a = fakeAudio([[1, 2, 3, 4, 5]]);
    const d = fakeDecode();
    V.__setModules({ audio: a.mod, decode: d.mod });

    const sess = await V.start({ mimeType: 'audio/mp4' });        // the iPad path
    const out  = await V.stop(sess);

    ok('stop() returns a payload at all',      out && typeof out.data === 'string');
    ok('…carrying the recorded bytes',         out.bytes === 5);
    ok('…base64-encoded',                      Buffer.from(out.data, 'base64').length === 5);
    ok('…round-tripping exactly', (() => {
        const b = Buffer.from(out.data, 'base64');
        return [1, 2, 3, 4, 5].every((v, i) => b[i] === v);
    })());
    ok('iPad m4a is sent as-is',               out.format === 'm4a');
    ok('…with NO conversion call',             d.state.calls === 0);
    ok('a duration is reported',               typeof out.durationMs === 'number');
}

console.log('\n[suite] stop() — Chrome webm is converted, and segments are joined in order');
{
    const a = fakeAudio([[1, 2], [3, 4], [5, 6]]);
    const d = fakeDecode();
    V.__setModules({ audio: a.mod, decode: d.mod });

    const sess = await V.start();                                  // defaults to audio/webm
    const out  = await V.stop(sess);

    ok('webm forces exactly one conversion', d.state.calls === 1);
    ok('…and the payload is reported as wav', out.format === 'wav' && out.mimeType === 'audio/wav');
    ok('every segment reached the decoder in order', (() => {
        const b = Buffer.from(out.data, 'base64');
        return [1, 2, 3, 4, 5, 6, 9, 9].every((v, i) => b[i] === v);   // 9,9 = the fake's marker
    })());
}

console.log('\n[suite] stop() — a silent take fails loudly instead of billing a call');
{
    const a = fakeAudio([]);                    // recorder produced nothing
    const d = fakeDecode();
    V.__setModules({ audio: a.mod, decode: d.mod });

    const sess = await V.start();
    let err = null;
    try { await V.stop(sess); } catch (e) { err = e; }

    ok('zero bytes throws',                 err !== null);
    ok('…with a code the UI can branch on', err && err.code === 'ENOAUDIO');
    ok('…and never reaches the decoder',    d.state.calls === 0);
}

console.log('\n[suite] cancel() — releases the device, not just the transcript');
{
    const a = fakeAudio([[1, 2, 3]]);
    V.__setModules({ audio: a.mod, decode: fakeDecode().mod });

    const sess = await V.start();
    await V.cancel(sess);

    ok('the microphone tracks are stopped', a.state.tracksStopped > 0);
    ok('the captured audio is discarded',   sess.sgChunks.length === 0);

    // sg-audio's stopRecording() returns early for an already-stopped session WITHOUT
    // touching the tracks — so cancelling after a stop must still release them itself.
    const b = fakeAudio([[7]]);
    V.__setModules({ audio: b.mod, decode: fakeDecode().mod });
    const s2 = await b.mod.startRecording({ onSegment() {} });
    s2.stopped = true;
    const before = b.state.tracksStopped;
    await V.cancel(s2);
    ok('cancelling an already-stopped session still releases the mic',
        b.state.tracksStopped > before);

    ok('cancel(null) is a no-op, not a crash', await (async () => {
        try { await V.cancel(null); return true; } catch (_) { return false; }
    })());
}

console.log('\n[suite] the transcription model is chosen from audio-capable models only');
{
    /* Shipped bug: transcribeWith fell back to `session.model` — the vault's CHAT model.
       The chat panel additionally passed its own picker's choice, so a voice note went to
       anthropic/claude-3-haiku and OpenRouter answered:
           404 {"error":{"message":"No endpoints found that support input audio"}}
       A model that answers questions is not a model that hears them. */
    ok('the default is an audio-capable model',  V.isAudioModel(V.DEFAULT_AUDIO_MODEL));
    ok('…and it is Gemini 3.5 Flash',            V.DEFAULT_AUDIO_MODEL === 'google/gemini-3.5-flash');
    ok('gpt-audio is on the list',               V.isAudioModel('openai/gpt-audio'));
    ok('voxtral is on the list',                 V.isAudioModel('mistralai/voxtral-small-24b-2507'));
    ok('the model that caused the 404 is NOT',   V.isAudioModel('anthropic/claude-3-haiku') === false);
    ok('no chat-only model sneaks in',
        !V.AUDIO_MODELS.some((m) => m.indexOf('anthropic/') === 0));
    ok('the dedicated-STT ids are excluded (we use the chat input_audio path)',
        !V.isAudioModel('openai/whisper-large-v3') && !V.isAudioModel('openai/gpt-4o-transcribe'));
    ok('unknown ids are not audio models',       V.isAudioModel('who/knows') === false);
    ok('null is not an audio model',             V.isAudioModel(null) === false);

    // The resolution path, end to end, through the real transcribeWith.
    globalThis.SGLlmConfig = {
        limitsFor: () => ({ maxCallsPerSession: 0, maxCostPerSession: 0, maxTokensPerCall: 8000 }),
        modelAllowed: (policy, id) => !policy || !policy.deny || policy.deny.indexOf(id) === -1
    };
    globalThis.SGLlm = { effectiveCost: () => ({ value: 0, source: 'estimated', estimated: true }) };

    let asked = null;
    const session = {
        ok: true, policy: {}, model: 'anthropic/claude-3-haiku',      // the chat model
        client: {
            chat: async (req) => { asked = req; return { id: 'x', model: req.model, content: ' hi ', usage: {} }; },
            reconcileCost: async () => null
        }
    };
    const audio = { data: 'AAAA', format: 'm4a', bytes: 4 };

    const out = await V.transcribeWith(session, audio, {});
    ok('the vault chat model is NOT used for transcription',
        asked.model !== 'anthropic/claude-3-haiku', asked.model);
    ok('…the audio default is used instead', asked.model === 'google/gemini-3.5-flash');
    ok('the audio really is attached',
        asked.messages[0].content.some((c) => c.type === 'input_audio'));
    ok('the transcript is trimmed', out.text === 'hi');

    // An explicit audio-capable model is still honoured (sg.llm.listen({model})).
    await V.transcribeWith(session, audio, { model: 'openai/gpt-audio' });
    ok('an explicit audio model is honoured', asked.model === 'openai/gpt-audio');

    // An explicit non-audio model fails HERE, with a reason — OpenRouter's 404 names no
    // model and leaves the user nothing to act on.
    let err = null;
    try { await V.transcribeWith(session, audio, { model: 'anthropic/claude-3-haiku' }); }
    catch (e) { err = e; }
    ok('an explicit non-audio model is refused',    err && err.code === 'EMODEL');
    ok('…and the message names the model',          /claude-3-haiku/.test(err.message));
    ok('…and suggests one that works',              /gemini-3\.5-flash/.test(err.message));

    // The vault's allow-list still wins over our default — it is a security control.
    err = null;
    try { await V.transcribeWith({ ...session, policy: { deny: ['google/gemini-3.5-flash'] } }, audio, {}); }
    catch (e) { err = e; }
    ok('a vault allow-list that excludes it refuses', err && err.code === 'EMODEL');
    ok('…and says where to change it',                /models\.allow/.test(err.message));
}

console.log('\n' + (fail === 0 ? '✓' : '✗') + ' ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
