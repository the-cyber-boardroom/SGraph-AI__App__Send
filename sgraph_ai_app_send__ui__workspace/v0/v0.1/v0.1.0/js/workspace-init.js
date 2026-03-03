/* =============================================================================
   SGraph Workspace — Initialisation
   v0.1.0 — sets up global namespace, EventBus, and MessagesService

   This file MUST load before any components.
   ============================================================================= */

(function() {
    'use strict';

    // --- EventBus (pub/sub) --------------------------------------------------

    class EventBus {
        constructor() {
            this._handlers = new Map();
            this._history  = [];
            this._maxHistory = 200;
        }

        on(event, handler) {
            if (!this._handlers.has(event)) this._handlers.set(event, new Set());
            this._handlers.get(event).add(handler);
        }

        off(event, handler) {
            const handlers = this._handlers.get(event);
            if (handlers) handlers.delete(handler);
        }

        emit(event, data) {
            const entry = { event, data, timestamp: Date.now() };
            this._history.push(entry);
            if (this._history.length > this._maxHistory) this._history.shift();

            const handlers = this._handlers.get(event);
            if (handlers) {
                for (const handler of handlers) {
                    try { handler(data); } catch (e) { console.error(`[EventBus] Error in handler for "${event}":`, e); }
                }
            }
        }

        getHistory() { return [...this._history]; }
        clearHistory() { this._history = []; }
    }

    // --- MessagesService (toast notifications) --------------------------------

    class MessagesService {
        constructor(eventBus) {
            this._messages = [];
            this._events   = eventBus;
            this._maxMessages = 100;
        }

        _add(type, text) {
            const msg = { type, text, timestamp: Date.now(), id: Math.random().toString(36).slice(2, 10) };
            this._messages.push(msg);
            if (this._messages.length > this._maxMessages) this._messages.shift();
            this._events.emit('message-added', msg);
            return msg;
        }

        success(text) { return this._add('success', text); }
        error(text)   { return this._add('error', text); }
        warning(text) { return this._add('warning', text); }
        info(text)    { return this._add('info', text); }

        getMessages() { return [...this._messages]; }
        clear() {
            this._messages = [];
            this._events.emit('messages-cleared');
        }
    }

    // --- Global namespace ----------------------------------------------------

    const events   = new EventBus();
    const messages = new MessagesService(events);

    window.sgraphWorkspace = {
        events,
        messages,
        router : null,    // set by workspace-shell on connectedCallback
        config : {
            version      : 'v0.1.0',
            appVersion   : 'v0.10.41',
            sendEndpoint : localStorage.getItem('workspace-send-endpoint') || 'https://send.sgraph.ai',
        }
    };

    console.log('[workspace] Initialised — v0.1.0');
})();
