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
   ================================================================================= */

(function () {
    'use strict';

    var TOOLS_BASE = 'https://dev.tools.sgraph.ai';
    var MOD_AUDIO  = '/core/sg-audio/v0/v0.1/v0.1.0/sg-audio.js';
    var MOD_DECODE = '/core/sg-audio-decode/v0/v0.1/v0.1.0/sg-audio-decode.js';

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

    async function start(opts) {
        var av = available();
        if (!av.ok) throw Object.assign(new Error('Microphone unavailable'), { code: av.reason });
        var m = await _load();
        return m.audio.startRecording(opts || {});
    }

    // Stop → bytes OpenRouter will accept. Converts only when it has to: an iPad's m4a
    // goes straight through, Chrome's webm gets decoded to WAV.
    async function stop(session) {
        var m   = await _load();
        var rec = await m.audio.stopRecording(session);
        var blob = rec && (rec.blob || rec);
        var mime = (rec && rec.mimeType) || (blob && blob.type) || '';
        var fmt  = formatFor(mime);

        if (!fmt || !isSendable(fmt)) {
            blob = await m.decode.blobToWav(blob, { hintName: 'recording' });
            fmt  = 'wav';
            mime = 'audio/wav';
        }
        var buf = await blob.arrayBuffer();
        var u8  = new Uint8Array(buf);
        return {
            data      : bytesToBase64(u8),
            format    : fmt,
            bytes     : u8.length,
            mimeType  : mime,
            durationMs: (rec && rec.durationMs) || null
        };
    }

    var API = {
        TOOLS_BASE: TOOLS_BASE, SENDABLE: SENDABLE,
        formatFor: formatFor, isSendable: isSendable, bytesToBase64: bytesToBase64,
        audioPart: audioPart, available: available, start: start, stop: stop
    };

    globalThis.SGVoice = API;
    if (typeof module !== 'undefined' && module.exports) module.exports = { SGVoice: API };  // node tests
})();
