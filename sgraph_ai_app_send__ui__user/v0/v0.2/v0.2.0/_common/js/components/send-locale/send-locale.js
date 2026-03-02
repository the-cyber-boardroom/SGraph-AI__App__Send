/* ═══════════════════════════════════════════════════════════════════════════════
   SGraph Send — Locale Selector Component
   v0.2.0 — Grid dropdown language picker (matches sgraph.ai design)

   Renders a trigger button showing current locale flag + code.
   Opens a two-column grid dropdown of available locales.
   Clicking a locale navigates to the locale-specific URL path.

   Usage:
     <send-locale></send-locale>
   ═══════════════════════════════════════════════════════════════════════════════ */

class SendLocale extends HTMLElement {

    connectedCallback() {
        this.render();
        this._onOutsideClick = () => {
            const dropdown = this.querySelector('.locale-dropdown');
            if (dropdown) dropdown.classList.remove('open');
        };
        document.addEventListener('click', this._onOutsideClick);
    }

    disconnectedCallback() {
        if (this._onOutsideClick) {
            document.removeEventListener('click', this._onOutsideClick);
        }
    }

    render() {
        const currentCode = (typeof I18n !== 'undefined') ? I18n.locale : 'en-gb';
        const locales = (typeof I18n !== 'undefined') ? I18n.availableLocales : [];
        const current = locales.find(l => l.code === currentCode) || locales[0] || { flag: '', code: 'en-gb', name: 'English' };
        const isEnglish = currentCode === 'en-gb' || currentCode === 'en';

        const items = locales.map(l =>
            `<button type="button" class="locale-dropdown__item${l.code === currentCode ? ' locale-dropdown__item--active' : ''}" data-locale="${l.code}">${l.flag}\u2002${l.name}</button>`
        ).join('');

        // On non-English pages, show a permanent English link before the dropdown
        const englishLink = !isEnglish
            ? `<a href="/en-gb/" class="locale-dropdown__english-link">\uD83C\uDDEC\uD83C\uDDE7 English</a>`
            : '';

        this.innerHTML = `
            <div class="locale-dropdown" style="display: inline-flex; align-items: center; gap: 0.5rem;">
                ${englishLink}
                <button type="button" class="locale-dropdown__trigger" aria-label="Select language">
                    ${current.flag} ${current.code.toUpperCase()} <svg viewBox="0 0 12 12" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 5l3 3 3-3"/></svg>
                </button>
                <div class="locale-dropdown__menu">
                    ${items}
                </div>
            </div>
        `;

        // Trigger toggle
        const trigger = this.querySelector('.locale-dropdown__trigger');
        if (trigger) {
            trigger.addEventListener('click', (e) => {
                e.stopPropagation();
                this.querySelector('.locale-dropdown').classList.toggle('open');
            });
        }

        // Item click → navigate to locale URL
        this.querySelectorAll('.locale-dropdown__item').forEach(btn => {
            btn.addEventListener('click', () => {
                const code = btn.getAttribute('data-locale');
                this.querySelector('.locale-dropdown').classList.remove('open');
                if (code !== currentCode && typeof I18n !== 'undefined') {
                    I18n.navigateToLocale(code);
                }
            });
        });
    }
}

customElements.define('send-locale', SendLocale);
