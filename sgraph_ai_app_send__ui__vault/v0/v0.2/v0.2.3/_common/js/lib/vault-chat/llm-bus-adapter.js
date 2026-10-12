/* =================================================================================
   Vault Chat — LLM bus adapter (Phase 1)

   Wraps the real <sg-llm-request> (tools.sgraph.ai, v0.1.6+) as the `sendLlm` the
   ChatLoop expects. Reuses the shipped component for the genuinely hard work:
   provider request bodies (OpenAI/Anthropic/Ollama), tools[] / tool_choice, SSE
   streaming, and tool_call extraction. We dispatch SGL_LLM.SEND on a [data-llm-bus]
   element and resolve on SGL_LLM.REQUEST_COMPLETE (reject on REQUEST_ERROR).

   sg-llm-request normalises tool calls to OpenAI shape; we map them to the loop's
   { id, name, args } contract.

   connect(busEl, {provider, model, apiKey}) -> dispatch llm:connected (once).
   createBusLlm(busEl, {provider, model}) -> sendLlm({messages, tools}) -> {text, toolCalls?, cost}.

   Browser global: window.VaultChat.LlmBus
   ================================================================================= */
(function (root) {
    'use strict';

    const SEND     = 'llm:send';
    const COMPLETE = 'llm:request-complete';
    const ERROR    = 'llm:request-error';
    const CONNECTED = 'llm:connected';
    const STREAMING = 'llm:streaming-changed';

    function connect(busEl, { provider, model, apiKey, baseUrl }) {
        busEl.dispatchEvent(new CustomEvent(CONNECTED, { bubbles: true, detail: { provider: provider || 'openrouter', model, apiKey: apiKey || '', baseUrl: baseUrl || '' } }));
    }

    function setStreaming(busEl, on) {
        busEl.dispatchEvent(new CustomEvent(STREAMING, { bubbles: true, detail: { streaming: !!on } }));
    }

    function normaliseToolCall(tc) {
        // OpenAI shape: { id, type:'function', function:{ name, arguments:"json" } }
        // Anthropic-normalised by sg-llm-request may already be { id, name, input } or similar.
        const name = (tc.function && tc.function.name) || tc.name;
        let args = (tc.function && tc.function.arguments) != null ? tc.function.arguments
                 : (tc.arguments != null ? tc.arguments : (tc.input != null ? tc.input : {}));
        if (typeof args === 'string') { try { args = JSON.parse(args || '{}'); } catch (_) { args = {}; } }
        return { id: tc.id, name, args: args || {} };
    }

    function createBusLlm(busEl, opts) {
        opts = opts || {};
        return function sendLlm({ messages, tools }) {
            return new Promise((resolve, reject) => {
                const onDone = (e) => {
                    cleanup();
                    const tcs = (e.detail.toolCalls || []).map(normaliseToolCall).filter((t) => t.name);
                    resolve({
                        text: e.detail.content || '',
                        toolCalls: tcs.length ? tcs : undefined,
                        cost: e.detail.cost || 0,
                        usage: { promptTokens: e.detail.promptTokens, completionTokens: e.detail.completionTokens },
                        finishReason: e.detail.finishReason,
                    });
                };
                const onErr = (e) => { cleanup(); reject(new Error((e.detail && e.detail.error) || 'llm request error')); };
                function cleanup() { busEl.removeEventListener(COMPLETE, onDone); busEl.removeEventListener(ERROR, onErr); }
                busEl.addEventListener(COMPLETE, onDone);
                busEl.addEventListener(ERROR, onErr);
                busEl.dispatchEvent(new CustomEvent(SEND, {
                    bubbles: true,
                    detail: {
                        messages,
                        model: opts.model,
                        provider: opts.provider || 'openrouter',
                        tools: tools && tools.length ? tools : undefined,
                        tool_choice: tools && tools.length ? 'auto' : undefined,
                    },
                }));
            });
        };
    }

    root.VaultChat = root.VaultChat || {};
    root.VaultChat.LlmBus = { connect, setStreaming, createBusLlm, normaliseToolCall };
})(typeof window !== 'undefined' ? window : globalThis);
