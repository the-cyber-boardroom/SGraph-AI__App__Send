/* ═══════════════════════════════════════════════════════════════════════════
   SGraph AI Website — i18n Module
   URL-based locale routing with pre-rendered HTML.

   Locales are served at path prefixes:
     /            → English GB (default)
     /en-us/      → English (United States)
     /pt-pt/      → Portuguese (Portugal)
     /pt-br/      → Portuguese (Brazil)
     /es-es/      → Español (España)
     /es-ar/      → Español (Argentina)
     /es-mx/      → Español (México)
     /fr-fr/      → Français (France)
     /fr-ca/      → Français (Canada)
     /de-de/      → Deutsch (Deutschland)
     /de-ch/      → Deutsch (Schweiz)
     /it-it/      → Italiano (Italia)
     /pl-pl/      → Polski (Polska)
     /ro-ro/      → Română (România)
     /nl-nl/      → Nederlands (Nederland)
     /hr-hr/      → Hrvatski (Hrvatska)
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

    locale: 'en-gb',

    // Locale code → URL slug mapping
    localeToSlug: {
        'en-gb': '',
        'en-us': 'en-us',
        'pt-pt': 'pt-pt',
        'pt-br': 'pt-br',
        'es-es': 'es-es',
        'es-ar': 'es-ar',
        'es-mx': 'es-mx',
        'fr-fr': 'fr-fr',
        'fr-ca': 'fr-ca',
        'de-de': 'de-de',
        'de-ch': 'de-ch',
        'it-it': 'it-it',
        'pl-pl': 'pl-pl',
        'ro-ro': 'ro-ro',
        'nl-nl': 'nl-nl',
        'hr-hr': 'hr-hr',
        'tlh':   'tlh'
    },

    availableLocales: [
        { code: 'en-gb', name: 'English (UK)',             flag: '\uD83C\uDDEC\uD83C\uDDE7' },
        { code: 'en-us', name: 'English (US)',             flag: '\uD83C\uDDFA\uD83C\uDDF8' },
        { code: 'de-de', name: 'Deutsch (Deutschland)',    flag: '\uD83C\uDDE9\uD83C\uDDEA' },
        { code: 'de-ch', name: 'Deutsch (Schweiz)',        flag: '\uD83C\uDDE8\uD83C\uDDED' },
        { code: 'es-es', name: 'Espa\u00f1ol (Espa\u00f1a)',         flag: '\uD83C\uDDEA\uD83C\uDDF8' },
        { code: 'es-ar', name: 'Espa\u00f1ol (Argentina)',      flag: '\uD83C\uDDE6\uD83C\uDDF7' },
        { code: 'es-mx', name: 'Espa\u00f1ol (M\u00e9xico)',         flag: '\uD83C\uDDF2\uD83C\uDDFD' },
        { code: 'fr-fr', name: 'Fran\u00e7ais (France)',        flag: '\uD83C\uDDEB\uD83C\uDDF7' },
        { code: 'fr-ca', name: 'Fran\u00e7ais (Canada)',        flag: '\uD83C\uDDE8\uD83C\uDDE6' },
        { code: 'hr-hr', name: 'Hrvatski (Hrvatska)',      flag: '\uD83C\uDDED\uD83C\uDDF7' },
        { code: 'it-it', name: 'Italiano (Italia)',        flag: '\uD83C\uDDEE\uD83C\uDDF9' },
        { code: 'nl-nl', name: 'Nederlands (Nederland)',   flag: '\uD83C\uDDF3\uD83C\uDDF1' },
        { code: 'pl-pl', name: 'Polski (Polska)',          flag: '\uD83C\uDDF5\uD83C\uDDF1' },
        { code: 'pt-br', name: 'Portugu\u00eas (Brasil)',       flag: '\uD83C\uDDE7\uD83C\uDDF7' },
        { code: 'pt-pt', name: 'Portugu\u00eas (Portugal)',     flag: '\uD83C\uDDF5\uD83C\uDDF9' },
        { code: 'ro-ro', name: 'Rom\u00e2n\u0103 (Rom\u00e2nia)',          flag: '\uD83C\uDDF7\uD83C\uDDF4' },
        { code: 'tlh',   name: 'tlhIngan Hol',            flag: '\uD83D\uDD96' }
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
        return match ? match[1] : 'en-gb';
    },

    // ─── Locale Navigation ──────────────────────────────────────────────

    navigateToLocale(code) {
        if (!this.isSupported(code)) return;
        const currentLocale = this._detectLocale();
        let currentPath = window.location.pathname;

        // Strip current locale prefix to get the base page path
        if (currentLocale !== 'en-gb') {
            currentPath = currentPath.replace(new RegExp('^/' + currentLocale + '/'), '/');
        }

        // Build target URL
        const slug = this.localeToSlug[code];
        if (slug) {
            window.location.href = '/' + slug + currentPath;
        } else {
            // en-GB — no prefix
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

        // Menu (two-column grid for 17 locales)
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
