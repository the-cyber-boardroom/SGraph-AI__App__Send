/* =============================================================================
   SGraph Send Admin Console — MessagesService
   v0.1.3 — IFD Issues-FS architecture: user-facing notifications

   Emits 'message-added' events for the messages-panel to display.
   ============================================================================= */

(function() {
    'use strict';

    class MessagesService {
        constructor() {
            this._messages = [];
            this._maxMessages = 50;
        }

        _add(type, text, autoDismiss) {
            const message = {
                id        : Date.now() + '-' + Math.random().toString(36).slice(2, 6),
                type,
                text,
                timestamp : new Date().toISOString(),
                autoDismiss
            };
            this._messages.push(message);
            if (this._messages.length > this._maxMessages) {
                this._messages.shift();
            }
            window.sgraphAdmin.events.emit('message-added', message);
            return message;
        }

        success(text) { return this._add('success', text, 5000); }
        error(text)   { return this._add('error',   text, 0);    }
        warning(text) { return this._add('warning', text, 8000); }
        info(text)    { return this._add('info',    text, 4000); }

        getMessages() {
            return this._messages.slice();
        }

        clear() {
            this._messages = [];
        }
    }

    window.sgraphAdmin = window.sgraphAdmin || {};
    window.sgraphAdmin.messages = new MessagesService();
})();
