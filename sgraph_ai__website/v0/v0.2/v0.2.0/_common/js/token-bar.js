/* ═══════════════════════════════════════════════════════════════════════════
   SGraph AI Website v0.2.0 — Token Inline Bar
   Nav-level "Paste a token" expand/submit flow.

   Usage: include this script, then call TokenBar.init() on DOMContentLoaded.
   Requires .token-inline-bar markup in the header.
   ═══════════════════════════════════════════════════════════════════════════ */

const TokenBar = {

    SEND_BASE: 'https://send.sgraph.ai/en-gb/browse/',

    init() {
        const bar = document.querySelector('.token-inline-bar');
        if (!bar) return;

        const trigger = bar.querySelector('.token-inline-bar__trigger');
        const cancel  = bar.querySelector('.token-inline-bar__cancel');
        const goBtn   = bar.querySelector('.token-inline-bar__go');
        const input   = bar.querySelector('.token-inline-bar__input');

        if (trigger) trigger.addEventListener('click', () => this._open(bar, input));
        if (cancel)  cancel.addEventListener('click',  () => this._close(bar));
        if (goBtn)   goBtn.addEventListener('click',   () => this._go(input));
        if (input) {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') this._go(input);
                if (e.key === 'Escape') this._close(bar);
            });
        }

        // Close on outside click
        document.addEventListener('click', (e) => {
            if (!bar.contains(e.target)) this._close(bar);
        });
    },

    _open(bar, input) {
        bar.classList.add('is-open');
        if (input) {
            input.focus();
            input.select();
        }
    },

    _close(bar) {
        bar.classList.remove('is-open');
    },

    _go(input) {
        if (!input) return;
        const token = input.value.trim();
        if (!token) {
            input.focus();
            return;
        }
        window.location.href = this.SEND_BASE + '#' + encodeURIComponent(token);
    }
};
