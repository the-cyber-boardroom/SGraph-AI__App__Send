/* =============================================================================
   SGraph Workspace — LLM Orchestrator
   v0.1.0 — Thin coordination layer replacing the monolithic llm-chat.js

   Not visible — wires events between llm-system-prompt, llm-prompt-input,
   llm-output, and the LLM API providers (OpenRouter, Ollama).
   ============================================================================= */

(function() {
    'use strict';

    const STREAM_KEY = 'sgraph-workspace-llm-streaming';

    class LlmOrchestrator extends HTMLElement {

        constructor() {
            super();
            this._sending   = false;
            this._abortCtrl = null;
            this._unsubs    = [];
        }

        connectedCallback() {
            const onSend   = (data) => this._handleSend(data);
            const onCancel = ()     => this._cancel();
            const onCopy   = (data) => this._handleCopy(data);

            window.sgraphWorkspace.events.on('llm-send', onSend);
            window.sgraphWorkspace.events.on('llm-cancel', onCancel);
            window.sgraphWorkspace.events.on('llm-output-copy', onCopy);

            this._unsubs.push(
                () => window.sgraphWorkspace.events.off('llm-send', onSend),
                () => window.sgraphWorkspace.events.off('llm-cancel', onCancel),
                () => window.sgraphWorkspace.events.off('llm-output-copy', onCopy),
            );
        }

        disconnectedCallback() {
            for (const unsub of this._unsubs) unsub();
            if (this._abortCtrl) this._abortCtrl.abort();
        }

        // --- Handle send -------------------------------------------------------

        async _handleSend(data) {
            if (this._sending) return;

            const { userPrompt, incSource, incScript, incData, incResult, incConsole, genJS, images } = data;
            if (!userPrompt) return;

            const conn = document.querySelector('llm-connection');
            if (!conn || !conn.isConnected()) {
                window.sgraphWorkspace.messages.error('No LLM connected. Go to Settings to connect.');
                return;
            }

            const provider = conn.getProvider();
            const model    = conn.getSelectedModel();
            const apiKey   = conn.getApiKey();
            const baseUrl  = conn.getBaseUrl();
            const streaming = this._isStreaming();

            if (!model) {
                window.sgraphWorkspace.messages.error('No model selected.');
                return;
            }

            // Build final prompt with selected artifacts
            let finalPrompt = userPrompt;
            const attachments = { source: false, script: false, data: false, result: false, console: false };

            if (incSource) {
                const sourceViewer = document.querySelector('document-viewer[data-role="source"]');
                const sourceContent = sourceViewer ? sourceViewer.getTextContent() : null;
                if (sourceContent) {
                    if (finalPrompt.includes('{{document}}')) {
                        finalPrompt = finalPrompt.replace('{{document}}', sourceContent);
                    } else {
                        finalPrompt += '\n\n--- SOURCE HTML ---\n\n' + sourceContent;
                    }
                    attachments.source = true;
                }
            }

            if (incData) {
                const dataViewer = document.querySelector('document-viewer[data-role="data"]');
                const dataContent = dataViewer ? dataViewer.getTextContent() : null;
                if (dataContent) {
                    finalPrompt += '\n\n--- DATA ---\n\n' + dataContent;
                    attachments.data = true;
                }
            }

            if (incScript) {
                const scriptEditor = document.querySelector('script-editor');
                const scriptContent = scriptEditor ? scriptEditor.getScript() : null;
                if (scriptContent) {
                    finalPrompt += '\n\n--- TRANSFORMATION SCRIPT ---\n\n' + scriptContent;
                    attachments.script = true;
                }
            }

            if (incResult) {
                const transformViewer = document.querySelector('document-viewer[data-role="transform"]');
                const resultContent = transformViewer ? transformViewer.getTextContent() : null;
                if (resultContent) {
                    finalPrompt += '\n\n--- RESULT ---\n\n' + resultContent;
                    attachments.result = true;
                }
            }

            if (incConsole) {
                const scriptEditor = document.querySelector('script-editor');
                const logs = scriptEditor ? scriptEditor._consoleLogs : null;
                if (logs && logs.length > 0) {
                    const consoleText = logs.map(log => {
                        const prefix = log.level === 'error' ? '[ERROR] ' : log.level === 'warn' ? '[WARN] ' : '';
                        return prefix + log.args;
                    }).join('\n');
                    finalPrompt += '\n\n--- CONSOLE OUTPUT ---\n\n' + consoleText;
                    attachments.console = true;
                }
            }

            // Get system prompt
            const sysPromptEl = document.querySelector('llm-system-prompt');
            const systemPrompt = genJS
                ? (sysPromptEl ? sysPromptEl.getJSSystemPrompt() : '')
                : (sysPromptEl ? sysPromptEl.getSystemPrompt() : '').trim();

            // Set sending state
            this._sending   = true;
            this._abortCtrl = new AbortController();
            const promptInput = document.querySelector('llm-prompt-input');
            if (promptInput) promptInput.setSending(true);

            const startTime = Date.now();
            const modeLabel = streaming ? 'streaming' : 'non-streaming';
            window.sgraphWorkspace.messages.info(`Sending to ${model} (${modeLabel})...`);
            window.sgraphWorkspace.events.emit('llm-request-start', { model, provider, streaming });
            window.sgraphWorkspace.events.emit('activity-start', { label: 'LLM request...' });

            // Emit full request details for LLM debug panel
            window.sgraphWorkspace.events.emit('llm-request-sent', {
                model, provider, systemPrompt, userPrompt, finalPrompt,
                attachments, streaming, imageCount: images ? images.length : 0,
            });

            // Route response to llm-output component
            const llmOutput = document.querySelector('llm-output');

            try {
                let result;

                if (streaming && llmOutput) {
                    llmOutput.startStreaming();
                }

                const onChunk = streaming && llmOutput
                    ? (chunk) => llmOutput.appendChunk(chunk)
                    : null;

                if (provider === 'openrouter') {
                    if (streaming) {
                        const sr = await this._streamOpenRouter(baseUrl, apiKey, model, finalPrompt, systemPrompt, onChunk, images);
                        result = {
                            content:          sr.content,
                            promptTokens:     sr.usage?.prompt_tokens     || null,
                            completionTokens: sr.usage?.completion_tokens || null,
                            totalTokens:      sr.usage?.total_tokens      || null,
                            finishReason:     sr.finishReason             || null,
                            nativeId:         sr.nativeId                 || null,
                        };
                    } else {
                        result = await this._callOpenRouter(baseUrl, apiKey, model, finalPrompt, systemPrompt, images);
                    }
                } else if (provider === 'ollama') {
                    if (streaming) {
                        const sr = await this._streamOllama(baseUrl, model, finalPrompt, systemPrompt, onChunk, images);
                        result = {
                            content:          sr.content,
                            promptTokens:     sr.usage?.prompt_tokens     || null,
                            completionTokens: sr.usage?.completion_tokens || null,
                            totalTokens:      sr.usage?.total_tokens      || null,
                            finishReason:     sr.finishReason             || null,
                        };
                    } else {
                        result = await this._callOllama(baseUrl, model, finalPrompt, systemPrompt, images);
                    }
                }

                // Finalize output
                if (llmOutput) {
                    if (streaming) {
                        llmOutput.endStreaming();
                    } else {
                        llmOutput.loadText(result?.content || '');
                    }
                }

                const content = result?.content || '';
                const latencyMs = Date.now() - startTime;

                // Emit response text for LLM debug panel
                window.sgraphWorkspace.events.emit('llm-response-text', { content });

                // If Generate JS mode, extract code and send to script editor
                if (genJS && content) {
                    const jsCode = this._extractJS(content);
                    window.sgraphWorkspace.events.emit('llm-response-js', {
                        code: jsCode, filename: 'transform.js'
                    });
                }

                // Save execution history
                if (window.sgraphWorkspace.execHistory) {
                    window.sgraphWorkspace.execHistory.save({
                        prompt:       userPrompt,
                        systemPrompt: systemPrompt,
                        response:     content,
                        model:        model,
                        provider:     provider,
                        tokens: {
                            prompt:     result?.promptTokens     || null,
                            completion: result?.completionTokens || null,
                            total:      result?.totalTokens      || null,
                        },
                        latencyMs:    latencyMs,
                        attachments:  attachments,
                        responseType: genJS ? 'js' : 'text',
                    });
                }

                // Calculate cost from model pricing
                let cost = null;
                const pricing = conn.getModelPricing ? conn.getModelPricing(model) : null;
                if (pricing && result?.promptTokens && result?.completionTokens) {
                    const promptCost     = result.promptTokens     * parseFloat(pricing.prompt     || 0);
                    const completionCost = result.completionTokens * parseFloat(pricing.completion  || 0);
                    cost = promptCost + completionCost;
                }

                // Calculate speed (tokens per second)
                let speed = null;
                if (result?.completionTokens && latencyMs > 0) {
                    speed = result.completionTokens / (latencyMs / 1000);
                }

                window.sgraphWorkspace.messages.success(`Response complete — ${content.length} chars (${latencyMs}ms)`);
                window.sgraphWorkspace.events.emit('llm-request-complete', {
                    model, provider, length: content.length, streaming,
                    promptTokens:     result?.promptTokens     || null,
                    completionTokens: result?.completionTokens || null,
                    totalTokens:      result?.totalTokens      || null,
                    nativeId:         result?.nativeId          || null,
                    finishReason:     result?.finishReason      || null,
                    cost,
                    speed,
                });

            } catch (e) {
                if (e.name === 'AbortError') {
                    window.sgraphWorkspace.messages.warning('Request cancelled');
                } else {
                    console.error('[llm-orchestrator] Request failed:', e);
                    window.sgraphWorkspace.messages.error('LLM request failed: ' + e.message);
                }
                window.sgraphWorkspace.events.emit('llm-request-error', { error: e.message });
            }

            this._sending   = false;
            this._abortCtrl = null;
            if (promptInput) promptInput.setSending(false);
            window.sgraphWorkspace.events.emit('activity-end');
        }

        // --- Handle copy-to from llm-output -----------------------------------

        _handleCopy(data) {
            const { target, content } = data;
            if (!content) return;

            if (target === 'script') {
                const se = document.querySelector('script-editor');
                if (se) se.loadScript(content, 'transform.js');
            } else if (target === 'data') {
                const dv = document.querySelector('document-viewer[data-role="data"]');
                if (dv) dv.loadText(content, 'data.json');
            } else if (target === 'result') {
                const rv = document.querySelector('document-viewer[data-role="transform"]');
                if (rv) rv.loadText(content, 'transform.html');
            }
        }

        // --- Cancel ------------------------------------------------------------

        _cancel() {
            if (this._abortCtrl) {
                this._abortCtrl.abort();
            }
        }

        // --- Extract JS from response ------------------------------------------

        _extractJS(content) {
            const fenceMatch = content.match(/```(?:javascript|js)?\s*\n([\s\S]*?)```/);
            if (fenceMatch) return fenceMatch[1].trim();
            return content.trim();
        }

        // --- Streaming config --------------------------------------------------

        _isStreaming() {
            try {
                const v = localStorage.getItem(STREAM_KEY);
                return v !== null ? v === 'true' : true;
            } catch (_) { return true; }
        }

        // --- Build OpenRouter user message (text or multimodal) ----------------

        _buildUserContent(prompt, images) {
            if (!images || images.length === 0) return prompt;
            // Multimodal: array of content parts
            const parts = [{ type: 'text', text: prompt }];
            for (const img of images) {
                parts.push({ type: 'image_url', image_url: { url: img.dataUrl } });
            }
            return parts;
        }

        // --- Non-streaming: OpenRouter ----------------------------------------

        async _callOpenRouter(baseUrl, apiKey, model, prompt, systemPrompt, images) {
            const messages = [];
            if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
            messages.push({ role: 'user', content: this._buildUserContent(prompt, images) });

            const resp = await fetch(`${baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type':  'application/json',
                    'HTTP-Referer':  location.origin,
                    'X-Title':       'SGraph Workspace',
                },
                body: JSON.stringify({ model, messages, stream: false }),
                signal: this._abortCtrl.signal,
            });

            if (!resp.ok) {
                const errBody = await resp.text().catch(() => '');
                throw new Error(`API error ${resp.status}: ${errBody.slice(0, 200)}`);
            }

            const data = await resp.json();
            const content = data.choices?.[0]?.message?.content || '';
            const usage   = data.usage || {};

            return {
                content,
                promptTokens:     usage.prompt_tokens     || null,
                completionTokens: usage.completion_tokens  || null,
                totalTokens:      usage.total_tokens       || null,
                finishReason:     data.choices?.[0]?.finish_reason || null,
                nativeId:         data.id                  || null,
            };
        }

        // --- Non-streaming: Ollama --------------------------------------------

        async _callOllama(baseUrl, model, prompt, systemPrompt, images) {
            const base = baseUrl.replace(/\/+$/, '');
            const body = { model, prompt, stream: false };
            if (systemPrompt) body.system = systemPrompt;
            if (images && images.length > 0) {
                body.images = images.map(img => img.dataUrl.replace(/^data:image\/\w+;base64,/, ''));
            }

            const resp = await fetch(`${base}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal: this._abortCtrl.signal,
            });

            if (!resp.ok) throw new Error(`Ollama error ${resp.status}`);

            const data = await resp.json();
            return {
                content:          data.response || '',
                promptTokens:     data.prompt_eval_count || null,
                completionTokens: data.eval_count        || null,
                totalTokens:      (data.prompt_eval_count || 0) + (data.eval_count || 0) || null,
                finishReason:     'stop',
                nativeId:         null,
            };
        }

        // --- Streaming: OpenRouter (SSE) --------------------------------------

        async _streamOpenRouter(baseUrl, apiKey, model, prompt, systemPrompt, onChunk, images) {
            const messages = [];
            if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
            messages.push({ role: 'user', content: this._buildUserContent(prompt, images) });

            const resp = await fetch(`${baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type':  'application/json',
                    'HTTP-Referer':  location.origin,
                    'X-Title':       'SGraph Workspace',
                },
                body: JSON.stringify({ model, messages, stream: true }),
                signal: this._abortCtrl.signal,
            });

            if (!resp.ok) {
                const errBody = await resp.text().catch(() => '');
                throw new Error(`API error ${resp.status}: ${errBody.slice(0, 200)}`);
            }

            return this._readSSE(resp.body, onChunk);
        }

        // --- Streaming: Ollama (NDJSON) ---------------------------------------

        async _streamOllama(baseUrl, model, prompt, systemPrompt, onChunk, images) {
            const base = baseUrl.replace(/\/+$/, '');
            const body = { model, prompt, stream: true };
            if (systemPrompt) body.system = systemPrompt;
            if (images && images.length > 0) {
                body.images = images.map(img => img.dataUrl.replace(/^data:image\/\w+;base64,/, ''));
            }

            const resp = await fetch(`${base}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal: this._abortCtrl.signal,
            });

            if (!resp.ok) throw new Error(`Ollama error ${resp.status}`);

            return this._readNDJSON(resp.body, onChunk);
        }

        // --- SSE reader -------------------------------------------------------

        async _readSSE(body, onChunk) {
            const reader  = body.getReader();
            const decoder = new TextDecoder();
            let buffer       = '';
            let full         = '';
            let usage        = null;
            let finishReason = null;
            let nativeId     = null;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const data = line.slice(6).trim();
                    if (data === '[DONE]') return { content: full, usage, finishReason, nativeId };

                    try {
                        const parsed = JSON.parse(data);
                        const delta  = parsed.choices?.[0]?.delta?.content;
                        if (delta) {
                            full += delta;
                            if (onChunk) onChunk(delta);
                        }
                        const fr = parsed.choices?.[0]?.finish_reason;
                        if (fr) finishReason = fr;
                        if (parsed.usage) usage = parsed.usage;
                        if (parsed.id && !nativeId) nativeId = parsed.id;
                    } catch (_) {}
                }
            }
            return { content: full, usage, finishReason, nativeId };
        }

        // --- NDJSON reader ----------------------------------------------------

        async _readNDJSON(body, onChunk) {
            const reader  = body.getReader();
            const decoder = new TextDecoder();
            let buffer    = '';
            let full      = '';
            let usage     = null;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const parsed = JSON.parse(line);
                        if (parsed.response) {
                            full += parsed.response;
                            if (onChunk) onChunk(parsed.response);
                        }
                        if (parsed.done) {
                            const promptTokens     = parsed.prompt_eval_count || 0;
                            const completionTokens = parsed.eval_count        || 0;
                            usage = {
                                prompt_tokens:     promptTokens,
                                completion_tokens: completionTokens,
                                total_tokens:      promptTokens + completionTokens,
                            };
                            return { content: full, usage, finishReason: 'stop', nativeId: null };
                        }
                    } catch (_) {}
                }
            }
            return { content: full, usage, finishReason: null, nativeId: null };
        }
    }

    customElements.define('llm-orchestrator', LlmOrchestrator);
})();
