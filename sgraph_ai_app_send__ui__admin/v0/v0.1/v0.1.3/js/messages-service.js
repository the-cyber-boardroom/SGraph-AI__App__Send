/* =============================================================================
   SGraph Send Admin Console — MessagesService
   v0.1.3 — IFD Issues-FS architecture: user-facing notifications

   Emits 'message-added' events for the messages-panel to display.
   ============================================================================= */

(function() {
    'use strict';

    // Auto-open config per message type
    const MSG_CONFIG = {
        error   : { autoOpen: true,  autoDismiss: 0     },
        warning : { autoOpen: true,  autoDismiss: 8000  },
        success : { autoOpen: false, autoDismiss: 5000  },
        info    : { autoOpen: false, autoDismiss: 4000  }
    };

    class MessagesService {
        constructor() {
            this._messages = [];
            this._maxMessages = 100;
        }

        _add(type, text) {
            const config = MSG_CONFIG[type] || MSG_CONFIG.info;
            const message = {
                id        : Date.now() + '-' + Math.random().toString(36).slice(2, 6),
                type,
                text,
                timestamp : new Date().toISOString(),
                autoDismiss: config.autoDismiss
            };
            this._messages.push(message);
            if (this._messages.length > this._maxMessages) {
                this._messages.shift();
            }
            window.sgraphAdmin.events.emit('message-added', message);

            // Auto-open sidebar on error/warning
            if (config.autoOpen && window.sgraphAdmin.router && window.sgraphAdmin.router.openSidebar) {
                window.sgraphAdmin.router.openSidebar('messages');
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
            window.sgraphAdmin.events.emit('messages-cleared', {});
        }
    }

    window.sgraphAdmin = window.sgraphAdmin || {};
    window.sgraphAdmin.messages = new MessagesService();
})();
