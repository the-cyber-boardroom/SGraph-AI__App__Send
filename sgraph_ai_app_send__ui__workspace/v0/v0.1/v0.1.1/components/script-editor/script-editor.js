/* =============================================================================
   SGraph Workspace — Script Editor Override
   v0.1.1 — Add Stop button to cancel running scripts immediately

   Overrides _run() to track the executor promise and expose a _stop() method.
   Adds a "Stop" button next to "Run" that kills the sandboxed iframe via
   the js-executor's abort mechanism (removing the iframe terminates execution).
   ============================================================================= */

(function() {
    'use strict';

    const Cls = customElements.get('script-editor');
    if (!Cls) return;

    // --- Override _run to track running state with abort support -------------

    const _origRun = Cls.prototype._run;

    Cls.prototype._run = async function() {
        if (this._running) return;

        // Inject stop button if not present
        this._ensureStopButton();

        // Set a flag so _stop() can kill execution
        this._execAborted = false;

        // Wrap the original executeJS to support abort
        const origExecute = window.sgraphWorkspace.executeJS;
        const self = this;

        window.sgraphWorkspace.executeJS = function(html, script, timeout, dataContent) {
            // Call original but store the cleanup handle
            const promise = origExecute(html, script, timeout, dataContent);

            // Find the hidden iframe (it's the last one appended)
            const iframes = document.querySelectorAll('iframe[sandbox]');
            if (iframes.length > 0) {
                self._activeIframe = iframes[iframes.length - 1];
            }

            return promise;
        };

        try {
            await _origRun.call(this);
        } finally {
            // Restore original
            window.sgraphWorkspace.executeJS = origExecute;
            this._activeIframe = null;
            this._updateStopButton();
        }
    };

    // --- Stop method: kill the iframe to terminate execution ------------------

    Cls.prototype._stop = function() {
        if (!this._running) return;

        this._execAborted = true;

        // Remove the sandboxed iframe — this terminates execution
        if (this._activeIframe && this._activeIframe.parentNode) {
            this._activeIframe.parentNode.removeChild(this._activeIframe);
        }
        this._activeIframe = null;

        // The executor's promise will resolve via timeout or the message listener
        // won't fire — either way execution ends. Force UI update.
        this._running = false;
        this._addConsoleEntry('warn', 'Script execution stopped by user');
        this._updateButtons();
        this._updateStopButton();
        this._renderConsole();
        window.sgraphWorkspace.events.emit('activity-end');
        window.sgraphWorkspace.messages.warning('Script stopped');
    };

    // --- Inject Stop button next to Run ------------------------------------

    Cls.prototype._ensureStopButton = function() {
        if (this.querySelector('.se-stop')) return;

        const actions = this.querySelector('.se-actions');
        if (!actions) return;

        const runBtn = actions.querySelector('.se-run');
        if (!runBtn) return;

        const stopBtn = document.createElement('button');
        stopBtn.className = 'se-stop';
        stopBtn.textContent = 'Stop';
        stopBtn.title = 'Stop running script (Ctrl+Shift+C)';
        stopBtn.style.cssText = `
            padding: 0.1875rem 0.625rem; border-radius: var(--ws-radius, 6px);
            font-size: 0.6875rem; font-weight: 600;
            cursor: pointer; font-family: inherit;
            border: 1px solid var(--ws-error, #E94560);
            background: transparent;
            color: var(--ws-error, #E94560);
            display: none;
        `;
        stopBtn.addEventListener('click', () => this._stop());

        runBtn.insertAdjacentElement('afterend', stopBtn);

        // Add keyboard shortcut
        this.addEventListener('keydown', (e) => {
            if (e.key === 'c' && e.ctrlKey && e.shiftKey && this._running) {
                e.preventDefault();
                this._stop();
            }
        });
    };

    Cls.prototype._updateStopButton = function() {
        const stopBtn = this.querySelector('.se-stop');
        if (stopBtn) {
            stopBtn.style.display = this._running ? '' : 'none';
        }
    };

    // --- Patch _updateButtons to also toggle stop button --------------------

    const _origUpdateButtons = Cls.prototype._updateButtons;
    Cls.prototype._updateButtons = function() {
        _origUpdateButtons.call(this);
        this._updateStopButton();
    };

})();
