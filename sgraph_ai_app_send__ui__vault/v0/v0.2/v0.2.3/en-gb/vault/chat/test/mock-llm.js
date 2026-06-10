/* =================================================================================
   Vault Chat — Mock LLM (test fixture)

   A deterministic stand-in for sg-llm-request, so the standalone harness drives the
   full tool loop with no OpenRouter key. It turns simple user commands into tool
   calls (list / read / write / delete / infographic) and otherwise answers in text.

   Phase 1 replaces this with sg-llm-request over the data-llm-bus; the { text,
   toolCalls, cost } contract returned here is the seam.
   Browser global: window.VaultChat.createMockLlm
   ================================================================================= */
(function (root) {
    'use strict';

    function createMockLlm() {
        return async function sendLlm({ messages }) {
            const last = messages[messages.length - 1] || {};
            if (last.role === 'tool') {
                // we just saw a tool result — wrap up
                return { text: 'Done — the tool result is in the working set.', cost: 0.005 };
            }
            const text = String(last.content || '').trim();
            const lower = text.toLowerCase();
            const parts = text.split(/\s+/);
            let call = null;
            if (/^list\b/.test(lower))         call = { name: 'list_folder', args: { path: parts[1] || '/' } };
            else if (/^read\b/.test(lower))    call = { name: 'read_file',   args: { path: parts[1] } };
            else if (/^write\b/.test(lower))   call = { name: 'write_file',  args: { path: parts[1], content: parts.slice(2).join(' ') || '(empty)' } };
            else if (/^delete\b/.test(lower))  call = { name: 'delete_file', args: { path: parts[1] } };
            else if (/infographic/.test(lower)) call = { name: 'create_infographic', args: { source: parts[1] || '/notes.md' } };

            if (call) return { text: `I'll call ${call.name}.`, toolCalls: [call], cost: 0.005 };
            return { text: `(mock LLM) You said: "${text}". No tool needed.`, cost: 0.005 };
        };
    }

    root.VaultChat = root.VaultChat || {};
    root.VaultChat.createMockLlm = createMockLlm;
})(typeof window !== 'undefined' ? window : globalThis);
