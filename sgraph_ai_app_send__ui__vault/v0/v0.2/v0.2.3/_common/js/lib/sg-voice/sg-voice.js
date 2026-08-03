/* =================================================================================
   SGVoice — microphone capture → an OpenRouter-ready audio part

   We deliberately do NOT implement recording or audio decoding here. The SG/Tools team
   already shipped both, versioned and CORS-open, and they solve the two genuinely nasty
   browser problems:

     core/sg-audio        getBestMimeType()  — iOS Safari records audio/mp4 (AAC) while
                                               Chrome records audio/webm;codecs=opus
     core/sg-audio-decode blobToWav()        — three-tier never-fail decode (pass-through
                                               → decodeAudioData → WASM Opus), because
                                               webm is NOT on OpenRouter's accepted list

   This module is the thin seam: lazily import those, hand back a `{data, format}` pair
   that drops straight into an `input_audio` content part, and keep the pure bits
   (mime→format mapping, base64) testable in Node.

   WHY THE HOST OWNS THIS: a vault app frame is `sandbox="allow-scripts allow-forms"`
   with a null origin, where `navigator.mediaDevices` is undefined — the SG/Tools guide
   documents the same constraint and assigns mic capture to the embedder. Capturing in
   the host is also the honest design: the recording indicator lives on host chrome, so
   an app cannot start a microphone without the user seeing it.

   Pure helpers (unit-tested — tests/unit/vault_ui/loader/test__sg_voice.js):
     SGVoice.formatFor(mimeType)   → 'm4a' | 'webm' | 'wav' | …   (OpenRouter `format`)
     SGVoice.isSendable(format)    → is it accepted without conversion?
     SGVoice.bytesToBase64(bytes)  → base64 (chunked SAFELY — see note)
     SGVoice.audioPart({data,format}) → the message content part

   Runtime:
     SGVoice.available()           → { ok, reason }
     SGVoice.start()               → session
     SGVoice.stop(session)         → { data, format, bytes, mimeType, durationMs }
     SGVoice.cancel(session)       → release the microphone, discard the audio
   ================================================================================= */

(function () {
    'use strict';

    var TOOLS_BASE = 'https://dev.tools.sgraph.ai';
    var MOD_AUDIO  = '/core/sg-audio/v0/v0.1/v0.1.0/sg-audio.js';
    var MOD_DECODE = '/core/sg-audio-decode/v0/v0.1/v0.1.0/sg-audio-decode.js';

    // Audio-capable models. **A chat model is not a transcription model** — most have no
    // audio endpoint at all and OpenRouter answers `404 No endpoints found that support
    // input audio`. That is exactly what shipped: the chat panel handed its own picker's
    // model (anthropic/claude-3-haiku) to a voice call, so every transcription 404'd.
    //
    // Mirrored from SG/Tools' curated list rather than imported, because this must be
    // usable before any dynamic import() resolves and it is a policy list, not a library:
    //   tools/…/en-gb/audio-transcribe/api/audio-models.js (ids verified against
    //   OpenRouter's live catalogue 2026-06-14). Only chat `input_audio` models appear —
    //   the dedicated-STT ids there go through /audio/transcriptions, which we do not use.
    var AUDIO_MODELS = [
        'google/gemini-3.5-flash',
        'google/gemini-3.1-flash-lite',
        'google/gemini-3-flash-preview',
        'google/gemini-3.1-flash-lite-preview',
        'openai/gpt-audio',
        'openai/gpt-audio-mini',
        'mistralai/voxtral-small-24b-2507'
    ];
    var DEFAULT_AUDIO_MODEL = 'google/gemini-3.5-flash';        // cheapest fast audio-in model

    function isAudioModel(id) { return AUDIO_MODELS.indexOf(String(id || '')) > -1; }

    // OpenRouter accepts these directly (mirrors sg-audio-decode's OR_SUPPORTED).
    // NOTE the absentee: `webm`. Chrome's default recording container is not on this
    // list, which is exactly why the decode step exists rather than being optional.
    var SENDABLE = ['wav', 'mp3', 'aac', 'ogg', 'flac', 'm4a'];

    function _base() {
        try { return (window.SG_TOOLS_BASE || TOOLS_BASE).replace(/\/$/, ''); }
        catch (_) { return TOOLS_BASE; }
    }

    // audio/mp4;codecs=... → 'm4a'. Container, not codec: OpenRouter's `format` field
    // names the file type, and iOS's audio/mp4 is an M4A for these purposes.
    function formatFor(mimeType) {
        var m = String(mimeType || '').toLowerCase().split(';')[0].trim();
        if (!m) return null;
        if (m === 'audio/mp4'  || m === 'audio/m4a' || m === 'audio/x-m4a') return 'm4a';
        if (m === 'audio/aac')                                              return 'aac';
        if (m === 'audio/mpeg' || m === 'audio/mp3')                        return 'mp3';
        if (m === 'audio/wav'  || m === 'audio/wave' || m === 'audio/x-wav')return 'wav';
        if (m === 'audio/ogg')                                              return 'ogg';
        if (m === 'audio/flac' || m === 'audio/x-flac')                     return 'flac';
        if (m === 'audio/webm')                                             return 'webm';
        return null;
    }

    function isSendable(format) { return SENDABLE.indexOf(String(format || '')) > -1; }

    // Chunked base64. The chunk size is 8190, NOT 8192, and that matters: 8192 % 3 === 2,
    // so every non-final slice would emit '='-padding mid-string and atob() rejects '='
    // anywhere but the end. This repo already shipped that bug once in the VFS write
    // bridge (fixed at v0.33.21); 8190 = 3×2730 keeps every slice padding-free.
    function bytesToBase64(bytes) {
        var u = (bytes instanceof Uint8Array) ? bytes : new Uint8Array(bytes || 0);
        var CHUNK = 8190, out = '';
        for (var i = 0; i < u.length; i += CHUNK) {
            out += String.fromCharCode.apply(null, u.subarray(i, i + CHUNK));
        }
        return btoa(out);
    }

    function audioPart(a) {
        return { type: 'input_audio', input_audio: { data: (a && a.data) || '', format: (a && a.format) || 'wav' } };
    }

    // ── runtime ──────────────────────────────────────────────────────────────
    var _mods = null;
    async function _load() {
        if (_mods) return _mods;
        var b = _base();
        var audio  = await import(b + MOD_AUDIO);
        var decode = await import(b + MOD_DECODE);
        _mods = { audio: audio, decode: decode };
        return _mods;
    }

    // Test seam. The interesting part of start()/stop() is whether we honour the SG/Tools
    // contract, and that is exactly the part a dynamic import() of a CDN URL makes
    // untestable in Node. Injecting a stand-in that enforces the SAME contract is the only
    // way to catch a signature mismatch before a user does — which is how the
    // "onSegment callback is required" failure reached the browser.
    function __setModules(m) { _mods = m; }

    function available() {
        try {
            if (!window.isSecureContext)                       return { ok: false, reason: 'EINSECURE' };
            if (!navigator.mediaDevices ||
                !navigator.mediaDevices.getUserMedia)          return { ok: false, reason: 'ENOMIC' };
            if (typeof MediaRecorder === 'undefined')          return { ok: false, reason: 'ENOREC' };
            return { ok: true, reason: null };
        } catch (_) {
            // `navigator.mediaDevices` is undefined in a null-origin frame — the documented
            // sandbox case. Report it rather than throwing into a caller's promise.
            return { ok: false, reason: 'ENOMIC' };
        }
    }

    // `core/sg-audio` is a SEGMENT recorder, not a one-shot one: it is built for long
    // captures that must survive device loss, so it REQUIRES an `onSegment` callback and
    // `stopRecording()` resolves to nothing — every byte arrives through that callback.
    //
    // A voice memo wants the opposite shape: one take, one blob, transcribed immediately.
    // So we adapt rather than fork — collect the segments ourselves and hand back a single
    // blob. The timeslice is deliberately long: with one `dataavailable` per take there is
    // no reassembly to get wrong. (When a take does run past it, concatenating the chunks
    // in arrival order is what MediaRecorder's timeslice mode is defined to produce.)
    var SEGMENT_MS = 600000;                                    // 10 min

    async function start(opts) {
        opts = opts || {};
        var av = available();
        if (!av.ok) throw Object.assign(new Error('Microphone unavailable'), { code: av.reason });
        var m = await _load();

        var chunks = [];
        var session = await m.audio.startRecording({
            segmentDurationMs: opts.segmentDurationMs || SEGMENT_MS,
            mimeType         : opts.mimeType || undefined,
            onSegment        : function (seg) { if (seg && seg.blob && seg.blob.size) chunks.push(seg.blob); },
            onError          : opts.onError || null
        });
        // Hung off the session rather than kept in module state: two panels can hold two
        // microphones (app frame + chat panel) and neither should collect the other's audio.
        session.sgChunks  = chunks;
        session.sgStartMs = Date.now();
        return session;
    }

    // Stop → bytes OpenRouter will accept. Converts only when it has to: an iPad's m4a
    // goes straight through, Chrome's webm gets decoded to WAV.
    async function stop(session) {
        var m = await _load();
        var chunks  = (session && session.sgChunks) || [];
        var startMs = (session && session.sgStartMs) || null;

        await m.audio.stopRecording(session);       // resolves only after the final segment

        var mime = (session && session.mimeType) || (chunks[0] && chunks[0].type) || '';
        var blob = new Blob(chunks, { type: mime });
        var durationMs = startMs ? (Date.now() - startMs) : null;

        // Say so plainly instead of billing a transcription call on zero bytes — the usual
        // cause is a tap so short the recorder never produced a segment.
        if (!blob.size) throw Object.assign(new Error('No audio was captured'), { code: 'ENOAUDIO' });

        var fmt = formatFor(mime);
        if (!fmt || !isSendable(fmt)) {
            blob = await m.decode.blobToWav(blob, { hintName: 'recording' });
            fmt  = 'wav';
            mime = 'audio/wav';
        }
        var u8 = new Uint8Array(await blob.arrayBuffer());
        return {
            data      : bytesToBase64(u8),
            format    : fmt,
            bytes     : u8.length,
            mimeType  : mime,
            durationMs: durationMs
        };
    }

    // Cancelling must release the DEVICE, not just drop the transcript — a tab quietly
    // holding the microphone open is worse than the bug the user was cancelling out of.
    // The tracks are stopped again here because sg-audio's stopRecording() returns early
    // for an already-stopped session without touching them.
    async function cancel(session) {
        if (!session) return;
        try {
            var m = await _load();
            await m.audio.stopRecording(session);
        } catch (_) { /* fall through to the direct release below */ }
        try { session.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (_) {}
        session.sgChunks = [];
    }

    // Transcribe captured audio using an ALREADY-RESOLVED SGLlmVault session, so both
    // surfaces that offer voice — the app bridge (sg.llm.listen) and the vault's own chat
    // panel — share one implementation of the model policy, the spend caps and the ledger
    // entry. Two copies of "is this within budget" is how a cap silently stops meaning
    // anything.
    var DEFAULT_PROMPT =
        'Transcribe the spoken audio verbatim. Reply with the transcript text only — ' +
        'no preamble, no commentary, no quotation marks. If there is no intelligible ' +
        'speech, reply with an empty string.';

    async function transcribeWith(session, audio, opts) {
        opts = opts || {};
        if (!session || !session.ok) {
            throw Object.assign(new Error((session && session.message) || 'AI not available for this vault'),
                                { code: (session && session.reason) || 'ENOKEY' });
        }
        var limits = SGLlmConfig.limitsFor(session.policy, opts.appId || null);
        var totals = (globalThis.VaultLlmLog) ? VaultLlmLog.totals() : { calls: 0, totalCost: 0 };
        if (limits.maxCallsPerSession && totals.calls >= limits.maxCallsPerSession) {
            throw Object.assign(new Error('Session call limit reached'), { code: 'EBUDGET' });
        }
        if (limits.maxCostPerSession && totals.totalCost >= limits.maxCostPerSession) {
            throw Object.assign(new Error('Session spend cap reached'), { code: 'EBUDGET' });
        }
        // NOTE the absence of `session.model`. Falling back to the vault's chat model is
        // what produced the 404 — transcription picks from the audio list or nothing.
        var model = opts.model || DEFAULT_AUDIO_MODEL;
        if (!isAudioModel(model)) {
            // Fail here with the reason rather than letting OpenRouter answer 404 — its
            // message names no model and gives the user nothing to act on.
            throw Object.assign(new Error('Model does not accept audio input: ' + model +
                                          ' (try ' + DEFAULT_AUDIO_MODEL + ')'), { code: 'EMODEL' });
        }
        if (!SGLlmConfig.modelAllowed(session.policy, model)) {
            throw Object.assign(new Error('Model not allowed by this vault: ' + model +
                                          ' — add it to models.allow in Settings → AI'), { code: 'EMODEL' });
        }

        var prompt = opts.prompt || DEFAULT_PROMPT;
        var rec = (globalThis.VaultLlmLog || null) && VaultLlmLog.add({
            model: model, files: [], status: 'pending', promptChars: prompt.length
        });

        var res;
        try {
            res = await session.client.chat({
                model: model,
                messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, audioPart(audio)] }],
                maxTokens: limits.maxTokensPerCall || undefined
            });
        } catch (err) {
            if (rec) VaultLlmLog.update(rec.key, { status: 'error', error: (err && err.message) || 'failed' });
            throw err;
        }

        var eff = SGLlm.effectiveCost(res);
        if (rec) {
            VaultLlmLog.update(rec.key, {
                id: res.id || null, model: res.model || model, status: 'ok', usage: res.usage || {},
                cost: (eff.value != null) ? eff.value : null, costSource: eff.source,
                estimated: eff.estimated, latencyMs: res.latencyMs || null
            });
            session.client.reconcileCost(res).then(function (up) {
                if (!up) return;
                var e2 = SGLlm.effectiveCost(res);
                VaultLlmLog.update(rec.key, { cost: e2.value, costSource: e2.source, estimated: e2.estimated, usage: res.usage || {} });
            });
        }
        return {
            text      : (res.content || '').trim(),
            model     : res.model,
            id        : res.id,
            durationMs: audio.durationMs || null,
            bytes     : audio.bytes,
            format    : audio.format,
            cost      : { value: eff.value, source: eff.source, estimated: eff.estimated }
        };
    }

    var API = {
        TOOLS_BASE: TOOLS_BASE, SENDABLE: SENDABLE, DEFAULT_PROMPT: DEFAULT_PROMPT,
        AUDIO_MODELS: AUDIO_MODELS, DEFAULT_AUDIO_MODEL: DEFAULT_AUDIO_MODEL,
        isAudioModel: isAudioModel,
        formatFor: formatFor, isSendable: isSendable, bytesToBase64: bytesToBase64,
        audioPart: audioPart, available: available, start: start, stop: stop, cancel: cancel,
        transcribeWith: transcribeWith, __setModules: __setModules
    };

    globalThis.SGVoice = API;
    if (typeof module !== 'undefined' && module.exports) module.exports = { SGVoice: API };  // node tests
})();
