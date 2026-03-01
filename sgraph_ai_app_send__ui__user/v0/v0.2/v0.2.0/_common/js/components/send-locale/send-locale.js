/* ═══════════════════════════════════════════════════════════════════════════════
   SGraph Send — Locale Selector Component
   v0.2.0 — Dropdown language picker

   Renders a dropdown of available locales. Changing the locale updates
   the I18n module and fires 'locale-changed' on document.

   Usage:
     <send-locale></send-locale>
   ═══════════════════════════════════════════════════════════════════════════════ */

class SendLocale extends HTMLElement {

    connectedCallback() {
        this.render();
        this.setupEventListeners();
    }

    render() {
        const current = (typeof I18n !== 'undefined') ? I18n.locale : 'en-gb';
        const locales = (typeof I18n !== 'undefined') ? I18n.availableLocales : [];

        const options = locales.map(l =>
            `<option value="${l.code}" ${l.code === current ? 'selected' : ''}>${l.flag} ${l.name}</option>`
        ).join('');

        this.innerHTML = `
            <select id="locale-select" class="sg-locale-select" aria-label="Select language">
                ${options}
            </select>
        `;
    }

    setupEventListeners() {
        const select = this.querySelector('#locale-select');
        if (select) {
            select.addEventListener('change', async (e) => {
                if (typeof I18n !== 'undefined') {
                    await I18n.setLocale(e.target.value);
                }
            });
        }
    }
}

customElements.define('send-locale', SendLocale);
