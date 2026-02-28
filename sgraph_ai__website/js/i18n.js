/* ═══════════════════════════════════════════════════════════════════════════
   SGraph AI Website — i18n Module
   URL-based locale routing with pre-rendered HTML.

   Locales are served at path prefixes:
     /            → English (default)
     /pt-pt/      → Portuguese (Portugal)
     /pt-br/      → Portuguese (Brazil)
     /tlh/        → Klingon

   The locale switcher navigates to the equivalent page in the target locale.
   Translation JSON files are loaded for runtime needs (dynamic content).

   Usage:
     SgI18n.t('nav.product')
     SgI18n.navigateToLocale('pt-pt')
   ═══════════════════════════════════════════════════════════════════════════ */

const SgI18n = {

    locale: 'en',

    strings: { en: {} },

    // Locale code → URL slug mapping
    localeToSlug: {
        'en':    '',
        'pt-pt': 'pt-pt',
        'pt-br': 'pt-br',
        'tlh':   'tlh'
    },

    availableLocales: [
        { code: 'en',    name: 'English',              flag: '\uD83C\uDDEC\uD83C\uDDE7' },
        { code: 'pt-br', name: 'Português (Brasil)',    flag: '\uD83C\uDDE7\uD83C\uDDF7' },
        { code: 'pt-pt', name: 'Português (Portugal)',  flag: '\uD83C\uDDF5\uD83C\uDDF9' },
        { code: 'tlh',   name: 'tlhIngan Hol',         flag: '\uD83D\uDD96' }
    ],

    // ─── Initialisation ────────────────────────────────────────────────────

    async init() {
        // Detect locale from URL path
        this.locale = this._detectLocale();

        // Load English master strings (needed for fallback)
        try {
            const base = this._basePath();
            const resp = await fetch(base + 'i18n/en.json');
            if (resp.ok) this.strings.en = await resp.json();
        } catch (e) { /* English fallback to key */ }

        // Load current locale strings if not English
        if (this.locale !== 'en') {
            await this.loadLocale(this.locale);
        }

        // Apply any runtime translations (for dynamic elements)
        this._applyAll();
    },

    isSupported(code) {
        return this.availableLocales.some(l => l.code === code);
    },

    // ─── Locale Detection from URL ───────────────────────────────────────

    _detectLocale() {
        const path = window.location.pathname;
        const match = path.match(/^\/(pt-pt|pt-br|tlh)\//);
        return match ? match[1] : 'en';
    },

    // ─── Locale Loading ────────────────────────────────────────────────────

    async loadLocale(code) {
        if (this.strings[code]) return true;
        try {
            const base = this._basePath();
            const resp = await fetch(base + 'i18n/' + code + '.json');
            if (resp.ok) {
                this.strings[code] = await resp.json();
                return true;
            }
        } catch (e) { /* fallback to English */ }
        return false;
    },

    // ─── Translation ───────────────────────────────────────────────────────

    t(key, params) {
        let str = (this.strings[this.locale] && this.strings[this.locale][key])
               || this.strings.en[key]
               || key;
        if (params) {
            Object.entries(params).forEach(([k, v]) => {
                str = str.split('{' + k + '}').join(String(v));
            });
        }
        return str;
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

    // ─── Internal: Apply translations to all [data-i18n] elements ──────────

    _applyAll() {
        document.documentElement.lang = this.locale === 'pt-br' ? 'pt-BR'
                                      : this.locale === 'pt-pt' ? 'pt-PT'
                                      : this.locale;

        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            const val = this.t(key);
            if (val.includes('<')) {
                el.innerHTML = val;
            } else {
                el.textContent = val;
            }
        });

        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            el.placeholder = this.t(el.getAttribute('data-i18n-placeholder'));
        });

        document.querySelectorAll('[data-i18n-title]').forEach(el => {
            el.title = this.t(el.getAttribute('data-i18n-title'));
        });

        document.querySelectorAll('[data-i18n-aria]').forEach(el => {
            el.setAttribute('aria-label', this.t(el.getAttribute('data-i18n-aria')));
        });

        const titleKey = document.querySelector('meta[name="i18n-title-key"]');
        if (titleKey) {
            document.title = this.t(titleKey.content);
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
    },

    // ─── Internal: Resolve base path to website root ───────────────────────

    _basePath() {
        const path = window.location.pathname;
        const segments = path.split('/').filter(s => s.length > 0);
        // Remove filename if present
        if (segments.length > 0 && segments[segments.length - 1].includes('.')) {
            segments.pop();
        }
        if (segments.length === 0) return './';
        return '../'.repeat(segments.length);
    }
};
