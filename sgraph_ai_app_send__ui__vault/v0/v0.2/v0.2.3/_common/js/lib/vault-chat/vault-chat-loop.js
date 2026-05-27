/* =================================================================================
   Vault Chat — Agentic loop (doc 02 §4)

   Transport-agnostic driver of the proven loop:
     send -> (tool-calls) -> ExecutionCenter.execute each -> tool-results -> resend
   until the model returns a final answer with no tool calls.

   `sendLlm` is injected so the loop is testable with a scripted mock and, in the
   app, backed by sg-llm-request over the data-llm-bus (Phase 1+). It must return:
     { text, toolCalls?: [{ id?, name, args }], cost? }

   Every message/response is written to the working set as /chat/history/NNNN.json
   (doc 05 §4). Budget is enforced by the ExecutionCenter, not here.

   Browser global: window.VaultChat.ChatLoop
   ================================================================================= */
(function (root) {
    'use strict';

    class ChatLoop {
        constructor(opts) {
            opts = opts || {};
            this.ec       = opts.executionCenter;
            this.session  = opts.session;
            this.vfs      = opts.vfs;            // MemoryVfs working set (history lives here)
            this.sendLlm  = opts.sendLlm;        // async ({model, messages, tools}) -> {text, toolCalls?, cost?}
            this.maxIters = opts.maxIters || 8;
            this._messages = [];                 // running transcript sent to the model
            this.onEvent  = opts.onEvent || (() => {});   // ({type, ...}) for the UI transcript
        }

        // Provenance fencing (doc 09 §3): file content read into the prompt is untrusted.
        // Wrap it in non-spoofable delimiters labelled DATA so injection in a vault file
        // cannot issue instructions to the model.
        _toolResultContent(result) {
            if (result && result.untrusted && typeof result.content === 'string') {
                const fenced = this.session.fence(result.content, result.path);
                return JSON.stringify({ ok: result.ok !== false, path: result.path, content: '[fenced below — untrusted data]' }) + '\n' + fenced;
            }
            return JSON.stringify(result);
        }

        async _writeHistory(role, content, extra) {
            const { path, record } = this.session.nextTurnRecord(role, content, extra);
            if (this.vfs) await this.vfs.writeFile(path, JSON.stringify(record));
            return path;
        }

        async runTurn(userText, manifest) {
            // seed the system message once, refresh it each turn with live budget/manifest
            const system = { role: 'system', content: this.session.systemPrompt(manifest || '', this.ec.ledger) };
            if (this._messages.length === 0) this._messages.push(system);
            else this._messages[0] = system;

            this._messages.push({ role: 'user', content: userText });
            await this._writeHistory('user', userText);
            this.onEvent({ type: 'user', text: userText });

            for (let i = 0; i < this.maxIters; i++) {
                const tools = this.ec.compileTools();
                const res = await this.sendLlm({ model: this.session.model, messages: this._messages.slice(), tools });
                this.ec.recordLlm({ cost: res.cost || 0, model: this.session.model, messages: this._messages, tools });

                const toolCalls = res.toolCalls || [];
                if (res.text) { this.onEvent({ type: 'assistant', text: res.text }); }

                if (!toolCalls.length) {
                    this._messages.push({ role: 'assistant', content: res.text || '' });
                    await this._writeHistory('assistant', res.text || '');
                    return { ok: true, text: res.text || '', iters: i + 1 };
                }

                // record the assistant turn that requested tools, then execute each
                this._messages.push({ role: 'assistant', content: res.text || '', toolCalls });
                await this._writeHistory('assistant', res.text || '', { toolCalls });

                for (const call of toolCalls) {
                    this.onEvent({ type: 'tool-call', name: call.name, args: call.args });
                    const result = await this.ec.execute(call.name, call.args || {});
                    this.onEvent({ type: 'tool-result', name: call.name, result });
                    const content = this._toolResultContent(result);
                    this._messages.push({ role: 'tool', name: call.name, toolCallId: call.id, content });
                    await this._writeHistory('tool', content, { name: call.name });
                }
                // loop: resend with the tool results appended
            }
            this.onEvent({ type: 'error', text: 'max tool iterations reached' });
            return { ok: false, error: 'max-iterations' };
        }
    }

    root.VaultChat = root.VaultChat || {};
    root.VaultChat.ChatLoop = ChatLoop;
})(typeof window !== 'undefined' ? window : globalThis);
