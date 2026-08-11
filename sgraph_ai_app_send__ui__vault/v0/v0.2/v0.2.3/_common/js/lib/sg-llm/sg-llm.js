/* =================================================================================
   SGLlm — OpenRouter transport (fetch + SSE + cost accounting)

   THE SHARED ENGINE. Used today by the vault UI's native chat (real origin, direct
   call) and — unchanged — by the kernel when it services `sg.llm.chat` for sandboxed
   app frames. Nothing here knows about the DOM, the bridge, or postMessage: it takes
   messages, returns content + usage + cost.

   Pure helpers (unit-tested in Node via runInThisContext —
   tests/unit/vault_ui/loader/test__sg_llm.js):
     SGLlm.sseLines(buffer)        → {lines, rest}   framing without losing the tail
     SGLlm.parseSseData(str)       → {delta,id,model,finish,usage,error} | null
     SGLlm.estimateCost(u, price)  → number | null
     SGLlm.effectiveCost(inv)      → {value, source, estimated}
     SGLlm.pricingFromModels(json) → { modelId: {prompt, completion} }
     SGLlm.buildFileContext(o)     → a message part for "talk to this file"
     SGLlm.redactMessages(msgs)    → log-safe copy (images → size notes)

   Instance:
     new SGLlm({ apiKey, endpoint }).chat({messages, model, ...}, onToken, signal)

   Two bugs the SG/Vault Workbench hit in production are fixed here by construction —
   both were found by its five-role review and are pinned by tests:
     1. the decoder tail was discarded at stream end, losing a final `usage` chunk
        that arrived without a trailing newline (→ cost silently missing);
     2. a mid-stream `data: {"error":…}` payload was ignored, producing an empty
        reply with no explanation.
   ================================================================================= */

(function () {
    'use strict';

    var DEFAULT_ENDPOINT = 'https://openrouter.ai/api/v1';

    // ── SSE framing ──────────────────────────────────────────────────────────────
    // Split a decode buffer into complete lines, RETURNING the incomplete remainder.
    // The caller must keep `rest` and, at stream end, flush it through parseSseData:
    // dropping it is exactly how the final usage frame goes missing.
    function sseLines(buffer) {
        var s = String(buffer == null ? '' : buffer);
        var lines = [], nl;
        while ((nl = s.indexOf('\n')) >= 0) {
            lines.push(s.slice(0, nl));
            s = s.slice(nl + 1);
        }
        return { lines: lines, rest: s };
    }

    // Parse one SSE line. Returns null for blanks, comments, [DONE] and non-data lines.
    function parseSseData(line) {
        var t = String(line == null ? '' : line).trim();
        if (!t || t.charAt(0) === ':' || t.indexOf('data:') !== 0) return null;
        var data = t.slice(5).trim();
        if (!data || data === '[DONE]') return null;
        var j;
        try { j = JSON.parse(data); } catch (_) { return null; }   // partial frame — tolerate
        if (!j || typeof j !== 'object') return null;

        // An upstream error can arrive INSIDE the stream. Surfacing it is the difference
        // between "empty reply, no idea why" and a real message.
        if (j.error) {
            return { error: (j.error && (j.error.message || j.error.code)) || 'upstream error' };
        }
        var out = {};
        if (j.id)    out.id    = j.id;
        if (j.model) out.model = j.model;
        var ch = j.choices && j.choices[0];
        if (ch) {
            var d = ch.delta && ch.delta.content;
            if (typeof d === 'string' && d) out.delta = d;
            // Tool-call FRAGMENTS: streamed as {index, id?, function:{name?, arguments?}}
            // where `arguments` arrives as string pieces that must be concatenated per
            // index. Dropping these was the transport gap that made every tool loop in
            // the codebase use a different client.
            if (ch.delta && Array.isArray(ch.delta.tool_calls)) out.toolCallDeltas = ch.delta.tool_calls;
            if (ch.finish_reason) out.finish = ch.finish_reason;
            // Non-stream shape (some routes ignore stream:true)
            if (!out.delta && ch.message && typeof ch.message.content === 'string') out.delta = ch.message.content;
            if (ch.message && Array.isArray(ch.message.tool_calls)) out.toolCallsWhole = ch.message.tool_calls;
        }
        if (j.usage) out.usage = j.usage;
        return out;
    }

    // ── Cost ─────────────────────────────────────────────────────────────────────
    // price: {prompt, completion} in USD per token (OpenRouter /models gives strings).
    function estimateCost(usage, price) {
        if (!price) return null;
        var u  = usage || {};
        var pt = (typeof u.prompt_tokens     === 'number') ? u.prompt_tokens     : 0;
        var ct = (typeof u.completion_tokens === 'number') ? u.completion_tokens : 0;
        var p  = Number(price.prompt), c = Number(price.completion);
        if (!isFinite(p)) p = 0;
        if (!isFinite(c)) c = 0;
        if (!pt && !ct) return null;
        return pt * p + ct * c;
    }

    // Real cost when upstream gave us one; otherwise a clearly-labelled estimate.
    // An estimate must NEVER be rendered as if it were a bill — callers key off
    // `.estimated` to prefix a '~'.
    function effectiveCost(inv) {
        var v = inv || {};
        if (typeof v.cost === 'number') return { value: v.cost, source: v.costSource || 'openrouter', estimated: false };
        var e = estimateCost(v.usage, v.price);
        if (e == null) return { value: null, source: null, estimated: true };
        return { value: e, source: 'estimate', estimated: true };
    }

    // Build { modelId: {prompt, completion} } from a GET /models payload.
    function pricingFromModels(json) {
        var out = {};
        var arr = (json && Array.isArray(json.data)) ? json.data : [];
        for (var i = 0; i < arr.length; i++) {
            var m = arr[i];
            if (!m || !m.id || !m.pricing) continue;
            var p = Number(m.pricing.prompt), c = Number(m.pricing.completion);
            out[m.id] = { prompt: isFinite(p) ? p : 0, completion: isFinite(c) ? c : 0 };
        }
        return out;
    }

    // ── "Talk to this file" context ──────────────────────────────────────────────
    // Truncates at a character budget and SAYS SO inside the text, so the model never
    // silently summarises a partial file (the Workbench's summFull lesson).
    function buildFileContext(opts) {
        var o    = opts || {};
        var path = String(o.path || 'file');
        var body = String(o.content == null ? '' : o.content);
        var max  = (typeof o.maxChars === 'number' && o.maxChars > 0) ? o.maxChars : 24000;
        var truncated = false;
        if (body.length > max) { body = body.slice(0, max); truncated = true; }
        return {
            truncated: truncated,
            text: '=== vault file: ' + path + ' ===\n' + body +
                  (truncated ? ('\n=== TRUNCATED after ' + max + ' characters — this is NOT the whole file ===') : '')
        };
    }

    // Log-safe copy: images become size notes, everything else passes through. The API
    // key never enters a message, so this is only about size and privacy of attachments.
    function redactMessages(messages) {
        var arr = Array.isArray(messages) ? messages : [];
        return arr.map(function (m) {
            if (!m) return m;
            // A tool RESULT can be a whole fenced file — truncate it for the log, keep the
            // correlation id. An assistant message that carries tool_calls keeps the names
            // (the interesting part) with arguments capped.
            if (m.role === 'tool') {
                var body = String(m.content == null ? '' : m.content);
                return { role: 'tool', tool_call_id: m.tool_call_id || null,
                         content: body.length > 400 ? body.slice(0, 400) + ' …[' + body.length + ' chars]' : body };
            }
            if (m.role === 'assistant' && Array.isArray(m.tool_calls)) {
                return { role: 'assistant', content: (typeof m.content === 'string') ? m.content : '',
                         tool_calls: m.tool_calls.map(function (t) {
                             var a = (t && t.function && t.function.arguments) || '';
                             return { id: (t && t.id) || null,
                                      function: { name: (t && t.function && t.function.name) || '',
                                                  arguments: a.length > 200 ? a.slice(0, 200) + '…' : a } };
                         }) };
            }
            if (typeof m.content === 'string') return { role: m.role, content: m.content };
            var parts = (Array.isArray(m.content) ? m.content : [m.content]).map(function (p) {
                if (p && p.type === 'image_url') {
                    var u = (p.image_url && p.image_url.url) || '';
                    return { type: 'image_url', image_url: { url: '[image omitted · ~' + Math.round(u.length / 1024) + ' KB]' } };
                }
                // Same rule for audio: a voice recording is base64 in the message body and
                // would otherwise dump tens of thousands of characters into a log the user
                // is invited to read (and paste into a bug report).
                if (p && p.type === 'input_audio') {
                    var a = (p.input_audio && p.input_audio.data) || '';
                    return { type: 'input_audio', input_audio: {
                        data  : '[audio omitted · ~' + Math.round(a.length / 1024) + ' KB]',
                        format: (p.input_audio && p.input_audio.format) || null
                    } };
                }
                return p;
            });
            return { role: m.role, content: parts };
        });
    }

    // ── The client ───────────────────────────────────────────────────────────────
    function SGLlm(opts) {
        var o = opts || {};
        this.apiKey   = o.apiKey || '';
        this.endpoint = o.endpoint || DEFAULT_ENDPOINT;
        this.referer  = o.referer || 'https://send.sgraph.ai';
        this.title    = o.title   || 'SG/Vault';
        this.pricing  = o.pricing || {};
    }

    SGLlm.prototype._headers = function () {
        return {
            'Authorization': 'Bearer ' + this.apiKey,
            'Content-Type' : 'application/json',
            'HTTP-Referer' : this.referer,
            'X-Title'      : this.title
        };
    };

    SGLlm.prototype.models = async function () {
        var r = await fetch(this.endpoint + '/models', { headers: { Authorization: 'Bearer ' + this.apiKey } });
        if (!r.ok) throw Object.assign(new Error('models ' + r.status), { code: 'EPROTO' });
        var j = await r.json();
        this.pricing = pricingFromModels(j);
        return (j && j.data) || [];
    };

    // chat(req, onToken, signal) → {content, model, finish, usage, cost, costSource, id, aborted}
    // onToken(deltaText, accumulated) is called per streamed chunk (caller throttles rendering).
    SGLlm.prototype.chat = async function (req, onToken, signal) {
        var q = req || {};
        if (!this.apiKey) throw Object.assign(new Error('no LLM key configured'), { code: 'ENOKEY' });
        // Fail LOCALLY and legibly. Sending {model:null} upstream returns
        // `404 No endpoints found for .` — a confusing remote error for what is really a
        // local misconfiguration (no default model set in .vault/llm/config.json and none
        // chosen in the UI).
        if (!q.model || typeof q.model !== 'string') {
            throw Object.assign(
                new Error('no model selected — pick one in the chat panel, or set a default in Settings → AI models'),
                { code: 'EMODEL' });
        }

        var body = {
            model   : q.model,
            messages: q.messages || [],
            stream  : q.stream !== false,
            usage   : { include: true }
        };
        if (q.maxTokens)   body.max_tokens = q.maxTokens;
        if (q.temperature != null) body.temperature = q.temperature;
        if (q.topP        != null) body.top_p       = q.topP;
        if (q.tools)       body.tools = q.tools;          // passed through; kernel never dispatches

        var t0 = Date.now(), r;
        try {
            r = await fetch(this.endpoint + '/chat/completions', {
                method: 'POST', headers: this._headers(), body: JSON.stringify(body), signal: signal
            });
        } catch (e) {
            if (e && e.name === 'AbortError') throw e;
            throw Object.assign(new Error('network: ' + (e.message || e)), { code: 'ENETWORK' });
        }
        if (!r.ok) {
            var txt = '';
            try { txt = (await r.text()).slice(0, 200); } catch (_) {}
            throw Object.assign(new Error('OpenRouter ' + r.status + (txt ? ': ' + txt : '')), { code: 'EPROTO', status: r.status });
        }

        var content = '', usage = null, id = null, finish = null, model = q.model, aborted = false, streamErr = null;
        var toolAcc = [];        // by stream index: { id, name, args: growing JSON string }
        var ct = (r.headers && r.headers.get) ? (r.headers.get('content-type') || '') : '';

        var applyToolFrags = function (frags) {
            for (var f = 0; f < frags.length; f++) {
                var frag = frags[f] || {};
                var ix   = (typeof frag.index === 'number') ? frag.index : toolAcc.length;
                var slot = toolAcc[ix] || (toolAcc[ix] = { id: null, name: '', args: '' });
                if (frag.id) slot.id = frag.id;
                if (frag.function) {
                    if (frag.function.name)      slot.name += frag.function.name;
                    if (frag.function.arguments) slot.args += frag.function.arguments;
                }
            }
        };

        var apply = function (ev) {
            if (!ev) return;
            if (ev.error) { streamErr = ev.error; return; }
            if (ev.id)    id    = ev.id;
            if (ev.model) model = ev.model;
            if (ev.finish) finish = ev.finish;
            if (ev.usage) usage = ev.usage;
            if (ev.delta) {
                content += ev.delta;
                if (onToken) { try { onToken(ev.delta, content); } catch (_) {} }
            }
            if (ev.toolCallDeltas) applyToolFrags(ev.toolCallDeltas);
            if (ev.toolCallsWhole) {
                toolAcc = ev.toolCallsWhole.map(function (t) {
                    return { id: (t && t.id) || null,
                             name: (t && t.function && t.function.name) || '',
                             args: (t && t.function && t.function.arguments) || '' };
                });
            }
        };

        try {
            if (body.stream && r.body && typeof r.body.getReader === 'function' && ct.indexOf('text/event-stream') >= 0) {
                var reader = r.body.getReader(), dec = new TextDecoder(), buf = '';
                for (;;) {
                    var rd = await reader.read();
                    if (rd.done) break;
                    buf += dec.decode(rd.value, { stream: true });
                    var split = sseLines(buf);
                    buf = split.rest;
                    for (var i = 0; i < split.lines.length; i++) apply(parseSseData(split.lines[i]));
                }
                // FLUSH THE TAIL. A final usage frame with no trailing newline lives here;
                // discarding it is how "cost: null" happens on otherwise fine calls.
                buf += dec.decode();
                if (buf.trim()) apply(parseSseData(buf));
            } else {
                var j  = await r.json();
                var m0 = (j.choices && j.choices[0]) || {};
                content = (m0.message && m0.message.content) || '';
                if (m0.message && Array.isArray(m0.message.tool_calls)) {
                    toolAcc = m0.message.tool_calls.map(function (t) {
                        return { id: (t && t.id) || null,
                                 name: (t && t.function && t.function.name) || '',
                                 args: (t && t.function && t.function.arguments) || '' };
                    });
                }
                usage   = j.usage || null;
                id      = j.id || null;
                finish  = m0.finish_reason || null;
                if (j.model) model = j.model;
                if (onToken && content) { try { onToken(content, content); } catch (_) {} }
            }
        } catch (e) {
            if (e && e.name === 'AbortError') aborted = true;
            else throw e;
        }

        if (streamErr && !content) throw Object.assign(new Error(String(streamErr)), { code: 'EPROTO' });

        // Normalise accumulated tool calls. `args` is PARSED (null when the JSON is
        // malformed — the caller replies with an error tool-result rather than crashing);
        // `argsRaw` is kept for diagnostics. Ids are synthesised when a route omits them,
        // because the tool-result message needs a tool_call_id to correlate.
        var toolCalls = [];
        for (var ti = 0; ti < toolAcc.length; ti++) {
            var tc = toolAcc[ti];
            if (!tc || !tc.name) continue;
            var parsedArgs = null;
            try { parsedArgs = tc.args ? JSON.parse(tc.args) : {}; } catch (_) { parsedArgs = null; }
            toolCalls.push({ id: tc.id || ('call_' + ti), name: tc.name, args: parsedArgs, argsRaw: tc.args });
        }

        var out = {
            content : content,
            toolCalls: toolCalls.length ? toolCalls : null,
            model   : model,
            finish  : aborted ? 'aborted' : finish,
            usage   : usage || {},
            id      : id,
            aborted : aborted,
            latencyMs: Date.now() - t0,
            price   : this.pricing[model] || null,
            cost      : (usage && typeof usage.cost === 'number') ? usage.cost : null,
            costSource: (usage && typeof usage.cost === 'number') ? 'openrouter' : null,
            warning : streamErr || null
        };
        return out;
    };

    // Authoritative per-call cost, a beat after the stream ends. Upgrades an estimate
    // in place. Never throws — a failed reconciliation just leaves the estimate.
    SGLlm.prototype.reconcileCost = async function (inv) {
        if (!inv || !inv.id || typeof inv.cost === 'number') return false;
        try {
            var r = await fetch(this.endpoint + '/generation?id=' + encodeURIComponent(inv.id),
                                { headers: { Authorization: 'Bearer ' + this.apiKey } });
            if (!r.ok) return false;
            var d = (await r.json()).data || {};
            if (typeof d.total_cost !== 'number') return false;
            inv.cost       = d.total_cost;
            inv.costSource = 'generation';
            inv.usage      = inv.usage || {};
            if (d.tokens_prompt     != null) inv.usage.prompt_tokens     = d.tokens_prompt;
            if (d.tokens_completion != null) inv.usage.completion_tokens = d.tokens_completion;
            return true;
        } catch (_) { return false; }
    };

    SGLlm.DEFAULT_ENDPOINT = DEFAULT_ENDPOINT;
    SGLlm.sseLines         = sseLines;
    SGLlm.parseSseData     = parseSseData;
    SGLlm.estimateCost     = estimateCost;
    SGLlm.effectiveCost    = effectiveCost;
    SGLlm.pricingFromModels= pricingFromModels;
    SGLlm.buildFileContext = buildFileContext;
    SGLlm.redactMessages   = redactMessages;

    globalThis.SGLlm = SGLlm;
})();
