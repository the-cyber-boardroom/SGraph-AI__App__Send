/* =============================================================================
   SGraph Vault — EventBus
   v0.1.1 — Adapted from Admin Console v0.1.3

   All component communication goes through the EventBus.
   Components never call each other directly.
   ============================================================================= */

(function() {
    'use strict';

    class EventBus {
        constructor() {
            this._listeners  = {};
            this._history    = [];
            this._maxHistory = 200;
        }

        on(event, handler) {
            if (!this._listeners[event]) {
                this._listeners[event] = [];
            }
            this._listeners[event].push(handler);
        }

        off(event, handler) {
            if (!this._listeners[event]) return;
            this._listeners[event] = this._listeners[event].filter(h => h !== handler);
        }

        emit(event, data) {
            const entry = {
                event,
                data,
                timestamp: new Date().toISOString()
            };
            this._history.push(entry);
            if (this._history.length > this._maxHistory) {
                this._history.shift();
            }

            const handlers = this._listeners[event];
            if (handlers) {
                handlers.forEach(handler => {
                    try {
                        handler(data);
                    } catch (err) {
                        console.error(`[EventBus] Error in handler for '${event}':`, err);
                    }
                });
            }
        }

        getHistory() {
            return this._history.slice();
        }

        clearHistory() {
            this._history = [];
        }
    }

    window.sgraphVault = window.sgraphVault || {};
    window.sgraphVault.events = new EventBus();
})();
