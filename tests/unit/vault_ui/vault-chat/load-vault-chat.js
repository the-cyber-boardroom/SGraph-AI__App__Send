/* =================================================================================
   load-vault-chat.js — Sources the Vault Chat browser modules into Node via
   vm.runInThisContext, after setting up a jsdom window (same pattern as the
   loader tests' load-loader.js). Populates window.VaultChat.

   Import once (side-effect) before any vault-chat unit test.
   ================================================================================= */
import { readFileSync }       from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { runInThisContext }    from 'node:vm';
import { JSDOM }               from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://dev.vault.sgraph.ai/' });
global.window   = dom.window;
global.document = dom.window.document;
// TextEncoder/TextDecoder/performance are Node globals (>=18) and resolve as bare names.

const LIB = new URL(
    '../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/lib/vault-chat/',
    import.meta.url
);

function load(file) {
    const path = fileURLToPath(new URL(file, LIB));
    runInThisContext(readFileSync(path, 'utf8'), { filename: file, displayErrors: true });
}

// dependency order
load('memory-vfs.js');
load('tool-policies.js');
load('builtin-tools.js');
load('execution-center.js');
load('vault-flush-controller.js');
load('chat-session.js');
load('vault-chat-loop.js');
load('tools/consolidate-memory.js');
load('mock-sg.js');

export const VaultChat = global.window.VaultChat;
