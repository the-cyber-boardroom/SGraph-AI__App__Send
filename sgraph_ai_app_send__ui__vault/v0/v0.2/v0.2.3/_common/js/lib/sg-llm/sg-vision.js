/* =================================================================================
   SGVision — an image (a pasted screenshot, a dropped file) → an OpenRouter-ready
   `image_url` content part, plus the one check that stops it failing at the provider.

   WHY A MODEL CHECK EXISTS AT ALL: this repo has now shipped the same class of bug
   twice — a payload the *transport* accepts sent to a model that cannot read it. Audio
   went to `anthropic/claude-3-haiku` and OpenRouter answered `404 No endpoints found
   that support input audio`, naming no model and leaving the user nothing to act on.
   An image sent to a text-only model fails the same way. So: refuse locally, name the
   model, and say which ones work.

   CAPABILITY IS READ FROM THE LIVE CATALOGUE, NOT HARD-CODED. OpenRouter's /models
   response carries `architecture.modality` ("text+image->text") and newer entries carry
   `architecture.input_modalities`. `SGLlm.models()` already returns those objects
   verbatim, so the truth is available for free and never goes stale. KNOWN_VISION is a
   fallback for when the catalogue could not be fetched — deliberately small, because a
   stale allow-list that silently blocks a working model is worse than asking.

   Pure helpers (unit-tested — tests/unit/vault_ui/loader/test__sg_vision.js):
     SGVision.formatFor(mime)            → 'png' | 'jpeg' | 'webp' | 'gif' | null
     SGVision.isSendable(mime)           → is this an image type providers accept?
     SGVision.bytesToBase64(bytes)       → base64 (chunked SAFELY — see the note)
     SGVision.dataUrl({data,mime})       → 'data:image/png;base64,…'
     SGVision.imagePart({data,mime})     → the message content part
     SGVision.modalityAllowsImages(meta) → read one catalogue entry
     SGVision.supportsImages(id, catalogue)
     SGVision.promptChars(messages)      → ledger-safe length of multimodal content

   Browser-only:
     SGVision.imagesFromEvent(event)     → [File] from a paste or drop
     SGVision.readImage(file, opts)      → {data, mime, bytes, name, width, height}
   ================================================================================= */

(function () {
    'use strict';

    // What providers accept as image input. `svg` is deliberately absent: it is a
    // document that can carry script, not a bitmap, and no provider takes it.
    var ACCEPTED = ['png', 'jpeg', 'webp', 'gif'];

    // Longest edge before we downscale. 1568 is the size above which the major vision
    // models resize server-side anyway — sending more costs tokens and buys nothing,
    // and screenshots of text stay legible at it.
    var MAX_DIM    = 1568;
    var MAX_BYTES  = 4 * 1024 * 1024;      // after any downscale; refuse beyond this
    var MAX_IMAGES = 4;                    // per message — a sanity bound, not a policy

    // Fallback only. See the header: the catalogue is the real source.
    var KNOWN_VISION = [
        'google/gemini-3.5-flash', 'google/gemini-3.1-flash-lite', 'google/gemini-3-flash-preview',
        'anthropic/claude-sonnet-5', 'anthropic/claude-opus-5',
        'anthropic/claude-sonnet-4', 'anthropic/claude-opus-4', 'openai/gpt-5', 'openai/gpt-5-mini'
    ];

    function formatFor(mime) {
        var m = String(mime || '').toLowerCase().split(';')[0].trim();
        if (m === 'image/png')                        return 'png';
        if (m === 'image/jpeg' || m === 'image/jpg')  return 'jpeg';
        if (m === 'image/webp')                       return 'webp';
        if (m === 'image/gif')                        return 'gif';
        return null;
    }

    function isSendable(mime) {
        var f = formatFor(mime);
        return !!f && ACCEPTED.indexOf(f) > -1;
    }

    // Chunk size is 8190, NOT 8192. 8192 % 3 === 2, so every non-final slice would emit
    // '=' padding mid-string and atob() rejects '=' anywhere but the end. This repo has
    // shipped that exact bug three times; test__base64_chunk_guard.js exists because of it.
    function bytesToBase64(bytes) {
        var u = (bytes instanceof Uint8Array) ? bytes : new Uint8Array(bytes || 0);
        var chunk = 8190, out = '';
        for (var i = 0; i < u.length; i += chunk) {
            out += String.fromCharCode.apply(null, u.subarray(i, i + chunk));
        }
        return btoa(out);
    }

    function dataUrl(img) {
        if (!img) return '';
        if (typeof img === 'string') return img;                       // already a data URL
        if (img.url) return img.url;
        return 'data:' + (img.mime || 'image/png') + ';base64,' + (img.data || '');
    }

    function imagePart(img) {
        return { type: 'image_url', image_url: { url: dataUrl(img) } };
    }

    // ── capability ───────────────────────────────────────────────────────────
    // One catalogue entry → can it READ images? Only the input side of the modality
    // matters: "text->image" is a generator, not a reader, and answering yes for it
    // would send a screenshot somewhere it can never be looked at.
    function modalityAllowsImages(meta) {
        if (!meta || typeof meta !== 'object') return false;
        var a = meta.architecture || {};
        var inputs = a.input_modalities || a.inputModalities;
        if (Array.isArray(inputs)) return inputs.indexOf('image') > -1;
        var mod = String(a.modality || '').toLowerCase();
        if (!mod) return false;
        var inSide = (mod.indexOf('->') > -1) ? mod.split('->')[0] : mod;
        return inSide.indexOf('image') > -1;
    }

    // catalogue: the array SGLlm.models() returns (raw OpenRouter entries), or null.
    // Returns true/false from the catalogue when the model is in it; otherwise falls
    // back to the known list. An unknown model with no catalogue is NOT assumed capable —
    // an honest local refusal beats a provider error nobody can act on.
    function supportsImages(modelId, catalogue) {
        var id = String(modelId || '');
        if (!id) return false;
        if (Array.isArray(catalogue)) {
            for (var i = 0; i < catalogue.length; i++) {
                var m = catalogue[i];
                if (m && m.id === id) return modalityAllowsImages(m);
            }
        }
        return KNOWN_VISION.indexOf(id) > -1;
    }

    function visionModelsIn(catalogue) {
        if (!Array.isArray(catalogue)) return KNOWN_VISION.slice();
        return catalogue.filter(modalityAllowsImages).map(function (m) { return m.id; });
    }

    // ── ledger ───────────────────────────────────────────────────────────────
    // The request log counted `typeof content === 'string'` only, so a message carrying
    // an image logged 0 prompt chars — the biggest calls looking like the smallest.
    // Images are reported as their own count so a picture is never mistaken for prose.
    function promptChars(messages) {
        var arr = Array.isArray(messages) ? messages : [];
        var chars = 0, images = 0;
        for (var i = 0; i < arr.length; i++) {
            var c = arr[i] && arr[i].content;
            if (typeof c === 'string') { chars += c.length; continue; }
            if (!Array.isArray(c)) continue;
            for (var j = 0; j < c.length; j++) {
                var p = c[j];
                if (!p) continue;
                if (p.type === 'text')              chars += String(p.text || '').length;
                else if (p.type === 'image_url')    images++;
            }
        }
        return { chars: chars, images: images };
    }

    // ── browser: getting an image out of a paste / drop ──────────────────────
    function imagesFromEvent(ev) {
        var out = [];
        try {
            var dt = (ev && (ev.clipboardData || ev.dataTransfer)) || null;
            if (!dt) return out;
            var items = dt.items;
            if (items && items.length) {
                for (var i = 0; i < items.length; i++) {
                    var it = items[i];
                    if (!it || it.kind !== 'file') continue;
                    if (String(it.type || '').indexOf('image/') !== 0) continue;
                    var f = it.getAsFile();
                    if (f) out.push(f);
                }
                if (out.length) return out;
            }
            var files = dt.files;
            for (var k = 0; files && k < files.length; k++) {
                if (String(files[k].type || '').indexOf('image/') === 0) out.push(files[k]);
            }
        } catch (_) { /* a hostile clipboard must not break typing */ }
        return out;
    }

    // Downscale when the image is bigger than any model will look at. Returns the ORIGINAL
    // blob unchanged when it is already small enough, or when canvas is unavailable —
    // shrinking is an optimisation, never a precondition for sending.
    async function shrink(blob, maxDim) {
        maxDim = maxDim || MAX_DIM;
        try {
            if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return blob;
            var bmp = await createImageBitmap(blob);
            var w = bmp.width, h = bmp.height;
            var scale = Math.min(1, maxDim / Math.max(w, h));
            if (scale >= 1) { if (bmp.close) bmp.close(); return blob; }
            var cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
            var cv = document.createElement('canvas');
            cv.width = cw; cv.height = ch;
            cv.getContext('2d').drawImage(bmp, 0, 0, cw, ch);
            if (bmp.close) bmp.close();
            var out = await new Promise(function (res) {
                // PNG, not JPEG: a screenshot is mostly flat colour and text, where JPEG
                // ringing is exactly what makes small type unreadable.
                cv.toBlob(function (b) { res(b); }, 'image/png');
            });
            return out || blob;
        } catch (_) { return blob; }
    }

    async function readImage(file, opts) {
        opts = opts || {};
        var mime = String((file && file.type) || '');
        if (!isSendable(mime)) {
            throw Object.assign(new Error('Not an image type models accept: ' + (mime || 'unknown')),
                                { code: 'EIMGTYPE' });
        }
        var blob = (opts.shrink === false) ? file : await shrink(file, opts.maxDim || MAX_DIM);
        var u8   = new Uint8Array(await blob.arrayBuffer());
        var max  = opts.maxBytes || MAX_BYTES;
        if (u8.length > max) {
            throw Object.assign(new Error('Image is too large (' + Math.round(u8.length / 1024) +
                                          ' KB, limit ' + Math.round(max / 1024) + ' KB)'),
                                { code: 'EIMGSIZE' });
        }
        return {
            data : bytesToBase64(u8),
            mime : blob.type || mime,
            bytes: u8.length,
            name : (file && file.name) || 'pasted-image.png'
        };
    }

    var API = {
        ACCEPTED: ACCEPTED, MAX_DIM: MAX_DIM, MAX_BYTES: MAX_BYTES, MAX_IMAGES: MAX_IMAGES,
        KNOWN_VISION: KNOWN_VISION,
        formatFor: formatFor, isSendable: isSendable, bytesToBase64: bytesToBase64,
        dataUrl: dataUrl, imagePart: imagePart,
        modalityAllowsImages: modalityAllowsImages, supportsImages: supportsImages,
        visionModelsIn: visionModelsIn, promptChars: promptChars,
        imagesFromEvent: imagesFromEvent, shrink: shrink, readImage: readImage
    };

    globalThis.SGVision = API;
    if (typeof module !== 'undefined' && module.exports) module.exports = { SGVision: API };
})();
