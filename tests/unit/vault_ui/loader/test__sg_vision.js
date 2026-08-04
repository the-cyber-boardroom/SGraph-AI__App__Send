/* SGVision — a pasted screenshot → an OpenRouter `image_url` part, and the check that
   stops it failing at the provider.
   Run: node tests/unit/vault_ui/loader/test__sg_vision.js

   The capability check is the point of this module. This repo has now shipped the same
   class of bug twice: a payload the TRANSPORT accepts, sent to a model that cannot read
   it. Audio went to anthropic/claude-3-haiku and OpenRouter answered `404 No endpoints
   found that support input audio` — a message naming no model, leaving the user nothing
   to act on. An image on a text-only model fails the same way.

   Unlike the audio list, vision capability is read from the LIVE catalogue
   (`architecture.modality` / `input_modalities`, which SGLlm.models() already returns
   verbatim), so it cannot go stale. These tests pin the parsing of that field, including
   the case that a naive `includes('image')` gets wrong: an image GENERATOR
   ("text->image") must not be treated as an image READER. */

import { readFileSync }     from 'node:fs';
import { fileURLToPath }    from 'node:url';
import { runInThisContext } from 'node:vm';

globalThis.window = globalThis.window || {};
globalThis.btoa = globalThis.btoa || ((s) => Buffer.from(s, 'binary').toString('base64'));

const SRC = fileURLToPath(new URL(
    '../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/lib/sg-llm/sg-vision.js',
    import.meta.url));
runInThisContext(readFileSync(SRC, 'utf8'), { filename: 'sg-vision.js', displayErrors: true });
const V = globalThis.SGVision;

let pass = 0, fail = 0;
const ok = (n, c, info) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (info ? ' — ' + info : '')); } };

console.log('\n[suite] formatFor / isSendable — what providers actually take');
{
    ok('png',                      V.formatFor('image/png') === 'png');
    ok('jpeg',                     V.formatFor('image/jpeg') === 'jpeg');
    ok('image/jpg → jpeg',         V.formatFor('image/jpg') === 'jpeg');
    ok('webp',                     V.formatFor('image/webp') === 'webp');
    ok('gif',                      V.formatFor('image/gif') === 'gif');
    ok('case-insensitive',         V.formatFor('IMAGE/PNG') === 'png');
    ok('a charset parameter is ignored', V.formatFor('image/png;charset=binary') === 'png');
    ok('unknown → null',           V.formatFor('image/tiff') === null);
    ok('empty → null',             V.formatFor('') === null);

    // SVG is a scriptable document, not a bitmap — and no provider accepts it.
    ok('svg is NOT sendable',      V.isSendable('image/svg+xml') === false);
    ok('a screenshot (png) is',    V.isSendable('image/png') === true);
    ok('a pdf is not an image',    V.isSendable('application/pdf') === false);
}

console.log('\n[suite] modalityAllowsImages — the INPUT side only');
{
    ok('text+image->text reads images',
        V.modalityAllowsImages({ architecture: { modality: 'text+image->text' } }) === true);
    ok('text->text does not',
        V.modalityAllowsImages({ architecture: { modality: 'text->text' } }) === false);

    // The trap a naive substring test falls into: this model MAKES images, it cannot read
    // one. Sending a screenshot to it would be a paid call to somewhere it is never seen.
    ok('text->image is a GENERATOR, not a reader',
        V.modalityAllowsImages({ architecture: { modality: 'text->image' } }) === false);
    ok('text+image->text+image still reads',
        V.modalityAllowsImages({ architecture: { modality: 'text+image->text+image' } }) === true);

    // The newer catalogue shape.
    ok('input_modalities is honoured',
        V.modalityAllowsImages({ architecture: { input_modalities: ['text', 'image'] } }) === true);
    ok('…and text-only is refused',
        V.modalityAllowsImages({ architecture: { input_modalities: ['text'] } }) === false);
    ok('input_modalities WINS over a stale modality string',
        V.modalityAllowsImages({ architecture: { input_modalities: ['text'], modality: 'text+image->text' } }) === false);

    ok('no architecture → false',  V.modalityAllowsImages({ id: 'x' }) === false);
    ok('null → false',             V.modalityAllowsImages(null) === false);
    ok('case-insensitive',         V.modalityAllowsImages({ architecture: { modality: 'TEXT+IMAGE->TEXT' } }) === true);
}

console.log('\n[suite] supportsImages — catalogue first, small fallback second');
{
    const cat = [
        { id: 'seer/one',   architecture: { modality: 'text+image->text' } },
        { id: 'blind/one',  architecture: { modality: 'text->text' } },
        { id: 'maker/one',  architecture: { modality: 'text->image' } }
    ];
    ok('a capable model in the catalogue passes',  V.supportsImages('seer/one', cat) === true);
    ok('a text-only model in it is refused',       V.supportsImages('blind/one', cat) === false);
    ok('a generator is refused',                   V.supportsImages('maker/one', cat) === false);

    // An unknown model with no catalogue is NOT assumed capable — an honest local refusal
    // beats a provider error nobody can act on.
    ok('unknown + no catalogue → false',           V.supportsImages('who/knows', null) === false);
    ok('the fallback list still works offline',    V.supportsImages(V.KNOWN_VISION[0], null) === true);
    ok('empty id → false',                         V.supportsImages('', cat) === false);

    // The model that caused the AUDIO 404 is a useful canary: it is not in the fallback.
    ok('claude-3-haiku is not assumed capable',    V.supportsImages('anthropic/claude-3-haiku', null) === false);

    ok('visionModelsIn lists only readers',
        V.visionModelsIn(cat).join(',') === 'seer/one');
    ok('…and falls back to the known list',
        V.visionModelsIn(null).length === V.KNOWN_VISION.length);
}

console.log('\n[suite] bytesToBase64 — chunking must never emit mid-string padding');
{
    const round = (n) => {
        const b = new Uint8Array(n);
        for (let i = 0; i < n; i++) b[i] = (i * 7) % 256;
        const back = Buffer.from(V.bytesToBase64(b), 'base64');
        return back.length === n && back.every((v, i) => v === b[i]);
    };
    ok('empty',                    V.bytesToBase64(new Uint8Array(0)) === '');
    ok('1 byte',                   round(1));
    ok('exactly one chunk (8190)', round(8190));
    ok('one byte over',            round(8191));
    ok('two chunks',               round(16380));
    ok('a realistic 300 KB screenshot', round(300 * 1024));
    ok('no "=" mid-string', (() => {
        const b64 = V.bytesToBase64(new Uint8Array(200000));
        const i = b64.indexOf('=');
        return i === -1 || i >= b64.length - 2;
    })());
}

console.log('\n[suite] imagePart / dataUrl — the exact wire shape');
{
    const p = V.imagePart({ data: 'AAAA', mime: 'image/png' });
    ok('type is image_url',             p.type === 'image_url');
    ok('the url is a data: URL',        p.image_url.url === 'data:image/png;base64,AAAA');
    ok('a missing mime defaults to png', V.imagePart({ data: 'x' }).image_url.url.indexOf('data:image/png;') === 0);
    ok('an existing data URL passes through',
        V.dataUrl('data:image/webp;base64,ZZ') === 'data:image/webp;base64,ZZ');
    ok('null is empty, not "undefined"', V.dataUrl(null) === '');
}

console.log('\n[suite] promptChars — an image message is no longer logged as ZERO');
{
    /* The ledger counted `typeof content === 'string'`, so a message carrying a 300 KB
       screenshot scored 0 prompt chars: the most expensive calls in the request pane read
       as the cheapest. Images are counted separately so a picture is never mistaken for
       prose. */
    const msgs = [
        { role: 'system', content: 'be helpful' },                       // 10
        { role: 'user', content: [ { type: 'text', text: 'what is wrong here?' },   // 19
                                   { type: 'image_url', image_url: { url: 'data:image/png;base64,' + 'A'.repeat(50000) } } ] }
    ];
    const r = V.promptChars(msgs);
    ok('string content still counts',   r.chars === 29, 'chars=' + r.chars);
    ok('the image is counted as an IMAGE, not as chars', r.images === 1);
    ok('…and its base64 does NOT inflate the char count', r.chars < 100);

    ok('plain string messages are unchanged',
        V.promptChars([{ role: 'user', content: 'hello' }]).chars === 5);
    ok('no images reported when there are none',
        V.promptChars([{ role: 'user', content: 'hello' }]).images === 0);
    ok('malformed content does not throw', (() => {
        try { V.promptChars([{ role: 'user' }, null, { content: 42 }]); return true; } catch (_) { return false; }
    })());
    ok('non-array input is safe',       V.promptChars(null).chars === 0);
}

console.log('\n[suite] imagesFromEvent — claim image pastes, never text pastes');
{
    const pngFile = { type: 'image/png', name: 'shot.png' };
    const asItems = (items) => ({ clipboardData: { items, files: [] } });

    ok('an image file item is picked up',
        V.imagesFromEvent(asItems([{ kind: 'file', type: 'image/png', getAsFile: () => pngFile }]))[0] === pngFile);

    // The critical negative: a normal copy carries text/plain (and often text/html). If we
    // claimed those, pasting text into the chat box would silently stop working.
    ok('a plain-text paste yields nothing',
        V.imagesFromEvent(asItems([{ kind: 'string', type: 'text/plain', getAsFile: () => null }])).length === 0);
    ok('a text+html paste yields nothing',
        V.imagesFromEvent(asItems([{ kind: 'string', type: 'text/plain', getAsFile: () => null },
                                   { kind: 'string', type: 'text/html',  getAsFile: () => null }])).length === 0);
    ok('a non-image FILE (a pdf) is not claimed',
        V.imagesFromEvent(asItems([{ kind: 'file', type: 'application/pdf', getAsFile: () => ({}) }])).length === 0);

    // Screenshot copies often carry BOTH an image file and a text flavour.
    ok('a mixed image+text paste yields just the image',
        V.imagesFromEvent(asItems([{ kind: 'string', type: 'text/plain', getAsFile: () => null },
                                   { kind: 'file', type: 'image/png', getAsFile: () => pngFile }])).length === 1);

    // Drops arrive on dataTransfer, sometimes only as .files.
    ok('a drop via dataTransfer.files works',
        V.imagesFromEvent({ dataTransfer: { items: null, files: [pngFile, { type: 'text/plain' }] } }).length === 1);

    ok('no clipboard at all → empty, not a throw', V.imagesFromEvent({}).length === 0);
    ok('a hostile clipboard cannot break typing', (() => {
        try {
            return V.imagesFromEvent({ get clipboardData() { throw new Error('nope'); } }).length === 0;
        } catch (_) { return false; }
    })());
}

console.log('\n[suite] the caps are real numbers, not vibes');
{
    ok('MAX_DIM is the size models resize to anyway', V.MAX_DIM === 1568);
    ok('MAX_BYTES is a sane per-image ceiling',       V.MAX_BYTES === 4 * 1024 * 1024);
    ok('MAX_IMAGES bounds a single message',          V.MAX_IMAGES >= 1 && V.MAX_IMAGES <= 10);
    ok('the accepted list has no svg',                V.ACCEPTED.indexOf('svg') === -1);
}

console.log('\n' + (fail === 0 ? '✓' : '✗') + ' ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
