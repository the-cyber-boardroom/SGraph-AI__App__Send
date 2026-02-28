/* ═══════════════════════════════════════════════════════════════════════════
   SGraph AI Website — i18n Module
   URL-based locale routing with pre-rendered HTML.

   Locales are served at path prefixes:
     /            → English (default)
     /pt-pt/      → Portuguese (Portugal)
     /pt-br/      → Portuguese (Brazil)
     /es-es/      → Español (España)
     /es-ar/      → Español (Argentina)
     /es-mx/      → Español (México)
     /fr-fr/      → Français (France)
     /fr-ca/      → Français (Canada)
     /tlh/        → Klingon

   All pages (English and locale) are pre-rendered with translations baked
   into the HTML at build time. This module only handles:
     - Locale detection from URL
     - Locale selector dropdown rendering
     - Navigation between locale versions of a page

   No JSON files are fetched at runtime.

   Usage:
     SgI18n.navigateToLocale('pt-pt')
   ═══════════════════════════════════════════════════════════════════════════ */

const SgI18n = {

    locale: 'en',

    // Locale code → URL slug mapping
    localeToSlug: {
        'en':    '',
        'pt-pt': 'pt-pt',
        'pt-br': 'pt-br',
        'es-es': 'es-es',
        'es-ar': 'es-ar',
        'es-mx': 'es-mx',
        'fr-fr': 'fr-fr',
        'fr-ca': 'fr-ca',
        'tlh':   'tlh'
    },

    availableLocales: [
        { code: 'en',    name: 'English',              flag: '\uD83C\uDDEC\uD83C\uDDE7' },
        { code: 'pt-br', name: 'Português (Brasil)',    flag: '\uD83C\uDDE7\uD83C\uDDF7' },
        { code: 'pt-pt', name: 'Português (Portugal)',  flag: '\uD83C\uDDF5\uD83C\uDDF9' },
        { code: 'es-es', name: 'Español (España)',      flag: '\uD83C\uDDEA\uD83C\uDDF8' },
        { code: 'es-ar', name: 'Español (Argentina)',   flag: '\uD83C\uDDE6\uD83C\uDDF7' },
        { code: 'es-mx', name: 'Español (México)',      flag: '\uD83C\uDDF2\uD83C\uDDFD' },
        { code: 'fr-fr', name: 'Français (France)',     flag: '\uD83C\uDDEB\uD83C\uDDF7' },
        { code: 'fr-ca', name: 'Français (Canada)',     flag: '\uD83C\uDDE8\uD83C\uDDE6' },
        { code: 'tlh',   name: 'tlhIngan Hol',         flag: '\uD83D\uDD96' }
    ],

    // ─── Initialisation ────────────────────────────────────────────────────

    async init() {
        // Detect locale from URL path — that's all we need.
        // Translations are pre-rendered into the HTML at build time,
        // so no JSON files are fetched.
        this.locale = this._detectLocale();
    },

    isSupported(code) {
        return this.availableLocales.some(l => l.code === code);
    },

    // ─── Locale Detection from URL ───────────────────────────────────────

    _detectLocale() {
        const path = window.location.pathname;
        const slugs = Object.values(this.localeToSlug).filter(s => s);
        const pattern = new RegExp('^\\/(' + slugs.join('|') + ')\\/');
        const match = path.match(pattern);
        return match ? match[1] : 'en';
    },

    // ─── Locale Navigation ──────────────────────────────────────────────

    navigateToLocale(code) {
        if (!this.isSupported(code)) return;
        const currentLocale = this._detectLocale();
        let currentPath = window.location.pathname;

        // Strip current locale prefix to get the base page path
        if (currentLocale !== 'en') {
            currentPath = currentPath.replace(new RegExp('^/' + currentLocale + '/'), '/');
        }

        // Build target URL
        const slug = this.localeToSlug[code];
        if (slug) {
            window.location.href = '/' + slug + currentPath;
        } else {
            // English — no prefix
            window.location.href = currentPath;
        }
    },

    // ─── Locale Selector Rendering ──────────────────────────────────────────

    renderLocaleSelector(containerId) {
        const container = document.getElementById(containerId || 'locale-picker');
        if (!container) return;

        const current = this.availableLocales.find(l => l.code === this.locale)
                     || this.availableLocales[0];

        container.innerHTML = '';
        const dropdown = document.createElement('div');
        dropdown.className = 'locale-dropdown';

        // Trigger button
        const trigger = document.createElement('button');
        trigger.className = 'locale-dropdown__trigger';
        trigger.type = 'button';
        trigger.setAttribute('aria-label', 'Select language');
        trigger.innerHTML = current.flag + ' ' + current.code.toUpperCase() +
            ' <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5">' +
            '<path d="M3 5l3 3 3-3"/></svg>';
        dropdown.appendChild(trigger);

        // Menu
        const menu = document.createElement('div');
        menu.className = 'locale-dropdown__menu';
        this.availableLocales.forEach(loc => {
            const btn = document.createElement('button');
            btn.className = 'locale-dropdown__item' +
                (loc.code === this.locale ? ' locale-dropdown__item--active' : '');
            btn.type = 'button';
            btn.textContent = loc.flag + '  ' + loc.name;
            btn.addEventListener('click', () => {
                dropdown.classList.remove('open');
                if (loc.code !== this.locale) {
                    this.navigateToLocale(loc.code);
                }
            });
            menu.appendChild(btn);
        });
        dropdown.appendChild(menu);

        // Toggle
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('open');
        });

        // Close on outside click
        document.addEventListener('click', () => dropdown.classList.remove('open'));

        container.appendChild(dropdown);
    }
};
