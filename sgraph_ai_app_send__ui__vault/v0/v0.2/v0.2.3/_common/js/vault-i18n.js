/* =================================================================================
   SGraph Vault — i18n Module
   v0.1.0 — URL-based locale routing, English strings embedded

   Forked from Send UI v0.2.0 I18n module. Same API, vault-specific keys.
   ================================================================================= */

const VaultI18n = {

    locale: 'en-gb',

    strings: {
        'en-gb': {

            // --- Brand ---
            'app.title':            'SG/Vault',
            'app.tagline':          'Zero-knowledge encrypted vault',
            'app.subtitle':         'Your files, encrypted in your browser. The server sees nothing.',

            // --- Entry ---
            'vault.entry.label':            'Enter your Vault Key',
            'vault.entry.placeholder':      'Paste your vault key here',
            'vault.entry.open':             'Open Vault',
            'vault.entry.create':           'Create New Vault',
            'vault.entry.or':               'or',
            'vault.entry.error.wrong_key':  'Wrong vault key. Please check and try again.',
            'vault.entry.error.not_found':  'Vault not found. The link may have expired.',
            'vault.entry.error.network':    'Network error. Please check your connection.',

            // --- Create ---
            'vault.create.title':               'Create New Vault',
            'vault.create.name_label':          'Vault name',
            'vault.create.name_placeholder':    'My Vault',
            'vault.create.passphrase_label':    'Vault passphrase',
            'vault.create.passphrase_placeholder': 'Choose a strong passphrase',
            'vault.create.create_button':       'Create Vault',
            'vault.create.creating':            'Creating vault...',

            // --- Browser ---
            'vault.browser.upload':         'Upload',
            'vault.browser.new_folder':     'New Folder',
            'vault.browser.empty':          'This folder is empty',
            'vault.browser.drop_hint':      'Drop files here to encrypt & upload',
            'vault.browser.name':           'Name',
            'vault.browser.type':           'Type',
            'vault.browser.size':           'Size',
            'vault.browser.uploaded':       'Uploaded',
            'vault.browser.folder':         'Folder',
            'vault.browser.file':           'File',
            'vault.browser.root':           'Vault',
            'vault.browser.delete_confirm': 'Delete "{name}"?',
            'vault.browser.delete':         'Delete',
            'vault.browser.cancel':         'Cancel',
            'vault.browser.download':       'Download',

            // --- Upload ---
            'vault.upload.select':          'Select files or drag & drop',
            'vault.upload.encrypting':      'Encrypting...',
            'vault.upload.uploading':       'Uploading...',
            'vault.upload.success':         '"{name}" uploaded and encrypted',
            'vault.upload.failed':          'Upload failed: {error}',

            // --- Share ---
            'vault.share.title':            'Vault Key',
            'vault.share.warning':          'Anyone with this key can access all files in this vault.',
            'vault.share.copy':             'Copy Vault Key',
            'vault.share.copied':           'Copied!',

            // --- Stats ---
            'vault.stats.summary':          '{folders} folders, {files} files, {size}',

            // --- Errors ---
            'crypto.error.unavailable':     'Web Crypto API is not available. It requires a secure context (HTTPS or localhost).',

            // --- Common ---
            'common.copied':               'Copied!',
            'common.copy':                 'Copy',
            'common.close':                'Close',
            'common.back':                 'Back'
        }
    },

    availableLocales: [
        { code: 'en-gb', name: 'English (UK)'             },
        { code: 'en-us', name: 'English (US)'             },
        { code: 'de-de', name: 'Deutsch (Deutschland)'    },
        { code: 'de-ch', name: 'Deutsch (Schweiz)'        },
        { code: 'es-es', name: 'Espa\u00f1ol (Espa\u00f1a)'         },
        { code: 'es-ar', name: 'Espa\u00f1ol (Argentina)'      },
        { code: 'es-mx', name: 'Espa\u00f1ol (M\u00e9xico)'         },
        { code: 'fr-fr', name: 'Fran\u00e7ais (France)'        },
        { code: 'fr-ca', name: 'Fran\u00e7ais (Canada)'        },
        { code: 'hr-hr', name: 'Hrvatski (Hrvatska)'      },
        { code: 'it-it', name: 'Italiano (Italia)'        },
        { code: 'nl-nl', name: 'Nederlands (Nederland)'   },
        { code: 'pl-pl', name: 'Polski (Polska)'          },
        { code: 'pt-br', name: 'Portugu\u00eas (Brasil)'       },
        { code: 'pt-pt', name: 'Portugu\u00eas (Portugal)'     },
        { code: 'ro-ro', name: 'Rom\u00e2n\u0103 (Rom\u00e2nia)'          },
        { code: 'tlh',   name: 'tlhIngan Hol'             }
    ],

    async init() {
        this.locale = this._detectLocale()

        if (this.locale !== 'en-gb') {
            await this._loadLocaleStrings(this.locale)
        }

        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n')
            if (key) el.textContent = this.t(key)
        })

        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder')
            if (key) el.placeholder = this.t(key)
        })

        document.dispatchEvent(new CustomEvent('locale-changed', {
            detail: { locale: this.locale }
        }))
    },

    isSupported(code) {
        return this.availableLocales.some(l => l.code === code)
    },

    async _loadLocaleStrings(locale) {
        try {
            const basePath = (typeof VaultComponentPaths !== 'undefined')
                ? VaultComponentPaths.basePath
                : '../_common'
            const i18nPath = basePath.replace(/_common\/?$/, 'i18n')
            const jsonUrl  = `${i18nPath}/${locale}.json`
            const response = await fetch(jsonUrl)
            if (response.ok) {
                const translations = await response.json()
                delete translations._comment
                this.strings[locale] = translations
            }
        } catch {
            console.warn(`[vault-i18n] Could not load ${locale}.json -- using English fallback`)
        }
    },

    _detectLocale() {
        const path  = window.location.pathname
        const codes = this.availableLocales.map(l => l.code)
        const pattern = new RegExp('^\\/(' + codes.join('|') + ')\\/')
        const match = path.match(pattern)
        return match ? match[1] : 'en-gb'
    },

    t(key, params) {
        let str = (this.strings[this.locale] && this.strings[this.locale][key])
               || this.strings['en-gb'][key]
               || key
        if (params) {
            Object.entries(params).forEach(([k, v]) => {
                str = str.split(`{${k}}`).join(String(v))
            })
        }
        return str
    },

    navigateToLocale(code) {
        if (!this.isSupported(code)) return
        const currentLocale = this._detectLocale()
        let currentPath = window.location.pathname
        if (currentLocale) {
            currentPath = currentPath.replace(new RegExp('^/' + currentLocale + '/'), '/')
        }
        window.location.href = '/' + code + currentPath
    },

    async setLocale(code) {
        this.navigateToLocale(code)
    }
}

VaultI18n.locale = VaultI18n._detectLocale()
