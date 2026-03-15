/* =============================================================================
   SGraph Vault — MessagesService
   v0.1.2 — Adapted from Admin Console v0.1.3

   Emits 'message-added' events for the messages-panel to display.
   ============================================================================= */

(function() {
    'use strict';

    const MSG_CONFIG = {
        error   : { autoOpen: true,  autoDismiss: 0     },
        warning : { autoOpen: true,  autoDismiss: 8000  },
        success : { autoOpen: false, autoDismiss: 5000  },
        info    : { autoOpen: false, autoDismiss: 4000  }
    };

    class MessagesService {
        constructor() {
            this._messages    = [];
            this._maxMessages = 100;
        }

        _add(type, text) {
            const config = MSG_CONFIG[type] || MSG_CONFIG.info;
            const message = {
                id         : Date.now() + '-' + Math.random().toString(36).slice(2, 6),
                type,
                text,
                timestamp  : new Date().toISOString(),
                autoDismiss: config.autoDismiss
            };
            this._messages.push(message);
            if (this._messages.length > this._maxMessages) {
                this._messages.shift();
            }
            window.sgraphVault.events.emit('message-added', message);

            if (config.autoOpen && window.sgraphVault.shell && window.sgraphVault.shell.openSidebar) {
                window.sgraphVault.shell.openSidebar('messages');
            }

            return message;
        }

        success(text) { return this._add('success', text); }
        error(text)   { return this._add('error',   text); }
        warning(text) { return this._add('warning', text); }
        info(text)    { return this._add('info',    text); }

        getMessages() {
            return this._messages.slice();
        }

        getActiveCount() {
            const counts = { error: 0, warning: 0, success: 0, info: 0 };
            for (const msg of this._messages) {
                if (counts[msg.type] !== undefined) counts[msg.type]++;
            }
            return counts;
        }

        clear() {
            this._messages = [];
            window.sgraphVault.events.emit('messages-cleared', {});
        }
    }

    window.sgraphVault = window.sgraphVault || {};
    window.sgraphVault.messages = new MessagesService();
})();
