/* ═══════════════════════════════════════════════════════════════════════════════
   SGraph Send — i18n Module
   v0.2.0 — URL-based locale routing with pre-rendered HTML

   Locales are served at path prefixes:
     /en-gb/      → English (UK) — default
     /en-us/      → English (US)
     /pt-pt/      → Português (Portugal)
     /pt-br/      → Português (Brasil)
     /de-de/      → Deutsch (Deutschland)
     /de-ch/      → Deutsch (Schweiz)
     /es-es/      → Español (España)
     ... (16 locales total)

   All pages are pre-rendered with translations baked into the HTML at build
   time. This module handles:
     - Locale detection from URL path
     - English strings for runtime component rendering
     - Translation lookup via t()
     - URL-based navigation between locale versions

   No JSON files are fetched at runtime.
   ═══════════════════════════════════════════════════════════════════════════════ */

const I18n = {

    locale: 'en-gb',

    // All English strings — used by components that render via innerHTML at runtime
    strings: {
        'en-gb': {

            // ─── Brand ────────────────────────────────────────────────────
            'app.title':            'SG/Send',
            'app.tagline':          'Your files, your keys, your privacy',
            'app.subtitle':         'Zero-knowledge encrypted file sharing',
            'app.disclaimer':       'This is a beta service. Do not upload confidential or illegal content.',

            // ─── Upload: Mode ─────────────────────────────────────────────
            'upload.mode.file':     'File or Folder',
            'upload.mode.text':     'Text',

            // ─── Upload: Drop Zone ────────────────────────────────────────
            'upload.drop_zone.label':           'Drop a file or folder here',
            'upload.drop_zone.hint':            'or click to browse',
            'upload.drop_zone.browse_file':     'Browse File',
            'upload.drop_zone.browse_folder':   'Browse Folder',
            'upload.drop_zone.encrypted_hint':  'Encrypted in your browser before upload',
            'upload.drop_zone.size_limit':      'Maximum file size: {limit}',

            // ─── Upload: Text Input ───────────────────────────────────────
            'upload.text.placeholder':          'Type or paste your text here',
            'upload.text.char_count':           '{count} characters',
            'upload.text.drop_hint':            'You can also drop a text file here',

            // ─── Upload: Buttons ──────────────────────────────────────────
            'upload.button.encrypt_upload':     'Encrypt & Upload',
            'upload.button.encrypt_send':       'Encrypt & Send',

            // ─── Upload: Progress ─────────────────────────────────────────
            'upload.progress.reading':          'Reading file...',
            'upload.progress.encrypting':       'Encrypting...',
            'upload.progress.creating':         'Preparing transfer...',
            'upload.progress.uploading':        'Uploading...',
            'upload.progress.uploading_part':   'Uploading part {current} of {total}...',
            'upload.progress.zipping':          'Compressing folder...',
            'upload.progress.completing':       'Finalising...',

            // ─── Upload: Folder ─────────────────────────────────────────
            'upload.folder.title':              'Folder: {name}',
            'upload.folder.summary':            '{files} files, {folders} folders, {size}',
            'upload.folder.compression':        'Compression level',
            'upload.folder.level_0':            '0 — Store (fastest, no compression)',
            'upload.folder.level_4':            '4 — Fast (default)',
            'upload.folder.level_6':            '6 — Balanced',
            'upload.folder.level_9':            '9 — Maximum (slowest, smallest)',
            'upload.folder.include_empty':      'Include empty folders',
            'upload.folder.include_hidden':     'Include hidden files (dotfiles)',
            'upload.folder.compress_upload':    'Compress & Upload',
            'upload.folder.cancel':             'Cancel',
            'upload.folder.error_too_large':    'Folder is too large. Maximum size is {limit}.',
            'upload.folder.error_zip_failed':   'Failed to create zip file.',
            'upload.folder.error_jszip':        'Failed to load compression library.',

            // ─── Upload: Result ───────────────────────────────────────────
            'upload.result.file_success':       'Your file has been encrypted and uploaded.',
            'upload.result.text_success':       'Your text has been encrypted and uploaded.',
            'upload.result.share_link':         'Share this link',
            'upload.result.copy_link':          'Copy link',
            'upload.result.show_separate_key':  'Share key separately',
            'upload.result.hide_key':           'Hide key',
            'upload.result.link_only':          'Link only',
            'upload.result.decryption_key':     'Decryption key',
            'upload.result.copy':               'Copy',
            'upload.result.open_tab':           'Open in new tab',
            'upload.result.send_another':       'Send another',
            'upload.guidance.split_channels':   'For best security, share the link and the key via <strong>different channels</strong> (e.g. link via email, key via messaging app).',

            // ─── Upload: Errors ───────────────────────────────────────────
            'upload.error.empty_text':          'Please enter some text to encrypt.',
            'upload.error.upload_failed':       'Upload failed. Please try again.',
            'upload.error.file_too_large':      'File is too large. Maximum size is {limit}.',

            // ─── Upload: Token ────────────────────────────────────────────
            'upload.token.unlimited':           'Unlimited uses remaining',
            'upload.token.remaining':           '{remaining} uses remaining',

            // ─── Upload: Timing ───────────────────────────────────────────
            'upload.timing.title':              'Upload completed in',
            'download.timing.title':            'Download completed in',

            // ─── Download ─────────────────────────────────────────────────
            'download.loading':                 'Loading transfer info...',
            'download.info.encrypted_file':     'Encrypted file',
            'download.info.encrypted_text':     'Encrypted text',
            'download.info.uploaded':           'Uploaded {timestamp}',
            'download.info.uploaded_label':     'Uploaded',
            'download.info.download_count':     'Downloaded {count} time(s)',
            'download.info.downloads_label':    'Downloads',
            'download.key.label':               'Decryption key',
            'download.key.placeholder':         'Paste the decryption key here',
            'download.button.decrypt_download': 'Download & Decrypt',
            'download.button.decrypt_view':     'Decrypt & View',
            'download.progress.decrypting':     'Downloading and decrypting...',
            'download.result.file_success':     'File decrypted and saved successfully.',
            'download.result.text_success':     'Text decrypted successfully.',
            'download.result.copy_text':        'Copy to clipboard',
            'download.result.download_file':    'Download as file',
            'download.result.send_another':     'Send a new File or Text',
            'download.result.decrypted_message': 'Decrypted Message',
            'download.history.title':           'Recent downloads',
            'download.history.privacy':         'Stored in your browser. Anyone with access to this device can view these.',
            'download.history.clear':           'Clear history',
            'download.history.empty':           'No recent downloads.',
            'download.history.text_preview':    'Text',
            'download.history.file_label':      'File',
            'download.token.uses_remaining':    '{remaining} uses remaining',

            // ─── Download: Preview ──────────────────────────────────────
            'download.preview.save_locally':    'Save Locally',
            'download.preview.view_raw':        'View Raw',
            'download.preview.view_rendered':   'View Rendered',

            // ─── Download: Zip Viewer ─────────────────────────────────────
            'download.zip.summary':             '{files} files, {folders} folders',
            'download.zip.contents':            'Contents',
            'download.zip.save_all':            'Save All (zip)',
            'download.zip.save_file':           'Save This File',
            'download.zip.no_preview':          'No preview available. Click "Save This File" to download.',
            'download.zip.select_file':         'Click a file in the tree to preview it.',

            // ─── Download: Errors ─────────────────────────────────────────
            'download.error.no_id':             'No transfer ID found in URL. Please check your link.',
            'download.error.not_ready':         'This transfer is not yet available for download.',
            'download.error.not_found':         'Transfer not found. The link may have expired.',
            'download.error.no_key':            'Please enter the decryption key.',
            'download.error.failed':            'Download or decryption failed.',
            'download.error.token_not_found':   'This link is not valid. The access token was not found.',
            'download.error.token_exhausted':   'This link has expired. The access token has been fully used.',
            'download.error.token_revoked':     'This link has been disabled. The access token was revoked.',

            // ─── Access Gate ──────────────────────────────────────────────
            'access_gate.title':                'Beta Access',
            'access_gate.subtitle':             'Enter your access token to start sending files.',
            'access_gate.placeholder':          'Paste your access token',
            'access_gate.button':               'Go',
            'access_gate.invalid':              'Invalid or missing token. Please check and try again.',
            'access_gate.not_found':            'Token not found. Please check and try again.',
            'access_gate.exhausted':            'This token has been fully used. Please request a new one.',
            'access_gate.revoked':              'This token has been revoked.',
            'access_gate.uses_remaining':       '{remaining} uses remaining',
            'access_gate.change_token':         'Change Token',
            'access_gate.signup_title':         'Join the Early Access Programme',
            'access_gate.signup_subtitle':      'Sign up to get notified when SGraph Send is available.',
            'access_gate.show_token':           'Show access token',
            'access_gate.hide_token':           'Hide access token',

            // ─── Transparency Panel ───────────────────────────────────────
            'transparency.title':               'What we stored about this transfer',
            'transparency.section.stored':      'Stored by the server',
            'transparency.section.encrypted':   'Stored encrypted (only you can read it)',
            'transparency.section.not_stored':  'Never sent to the server',
            'transparency.footer':              "That's everything. Nothing else is captured.",
            'transparency.ip_address':          'Your IP address',
            'transparency.upload_time':         'Upload time',
            'transparency.download_time':       'Download time',
            'transparency.file_size':           'File size',
            'transparency.encryption_method':   'Encryption',
            'transparency.label.file_name':     'File name',
            'transparency.label.file_content':  'File content',
            'transparency.label.decryption_key':'Decryption key',
            'transparency.label.raw_ip':        'Raw IP address',
            'transparency.not_stored':          'NOT stored',
            'transparency.encrypted':           'Encrypted (only you can read it)',
            'transparency.key_not_stored':      'NOT stored (only you have it)',

            // ─── Crypto Errors ────────────────────────────────────────────
            'crypto.error.unavailable':         'Web Crypto API is not available. It requires a secure context (HTTPS or localhost). If running locally, use "localhost" instead of "127.0.0.1".',
            'crypto.error.read_failed':         'Failed to read file',

            // ─── Common ───────────────────────────────────────────────────
            'common.copied':                    'Copied!',
            'common.copy':                      'Copy',

            // ─── Forms ──────────────────────────────────────────────────
            'form.name_placeholder':            'Name',
            'form.email_placeholder':           'Email',
            'form.signup_button':               'Sign Up',

            // ─── Header / Navigation ──────────────────────────────────────
            'nav.docs':                         'Docs',
            'nav.github':                       'GitHub',

            // ─── Footer ─────────────────────────────────────────────────
            'footer.powered_by':                'Powered by',
            'footer.sgraph':                    'SGraph',

            // ─── Test Files ─────────────────────────────────────────────
            'test_files.title':                 'Test Files',
            'test_files.description':           'Drag a file into the upload zone, or click to download.',
            'test_files.folder_hint':           'To test folder upload, drag any folder from your desktop into the upload zone.',

            // ─── CTA ────────────────────────────────────────────────────
            'cta.title':                        'Want to send files too?',
            'cta.description':                  'Join the early access programme for SGraph Send.'
        }
    },

    // Locale definitions — matches sgraph.ai website convention exactly
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

    // ─── Initialisation ──────────────────────────────────────────────────

    async init() {
        // Locale was already detected synchronously at script load time
        // (see bottom of file). Now load the translation strings.
        this.locale = this._detectLocale();

        // Load locale-specific translations for non-English pages
        if (this.locale !== 'en-gb') {
            await this._loadLocaleStrings(this.locale);
        }

        // Update static data-i18n elements in the page
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (key) el.textContent = this.t(key);
        });

        // Update data-i18n-placeholder elements (input placeholders)
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            if (key) el.placeholder = this.t(key);
        });

        // Notify all components that translations are ready
        document.dispatchEvent(new CustomEvent('locale-changed', {
            detail: { locale: this.locale }
        }));
    },

    isSupported(code) {
        return this.availableLocales.some(l => l.code === code);
    },

    // ─── Locale String Loading ─────────────────────────────────────────

    async _loadLocaleStrings(locale) {
        try {
            const basePath = (typeof SendComponentPaths !== 'undefined')
                ? SendComponentPaths.basePath
                : '../_common';
            const i18nPath = basePath.replace(/_common\/?$/, 'i18n');
            const jsonUrl  = `${i18nPath}/${locale}.json`;
            const response = await fetch(jsonUrl);
            if (response.ok) {
                const translations = await response.json();
                delete translations._comment;
                this.strings[locale] = translations;
            }
        } catch (e) {
            console.warn(`[i18n] Could not load ${locale}.json — using English fallback`);
        }
    },

    // ─── Locale Detection from URL ───────────────────────────────────────

    _detectLocale() {
        const path = window.location.pathname;
        const codes = this.availableLocales.map(l => l.code);
        const pattern = new RegExp('^\\/(' + codes.join('|') + ')\\/');
        const match = path.match(pattern);
        return match ? match[1] : 'en-gb';
    },

    // ─── Translation ─────────────────────────────────────────────────────

    t(key, params) {
        let str = (this.strings[this.locale] && this.strings[this.locale][key])
               || this.strings['en-gb'][key]
               || key;
        if (params) {
            Object.entries(params).forEach(([k, v]) => {
                str = str.split(`{${k}}`).join(String(v));
            });
        }
        return str;
    },

    // ─── URL-based Locale Navigation ─────────────────────────────────────

    navigateToLocale(code) {
        if (!this.isSupported(code)) return;

        const currentLocale = this._detectLocale();
        let currentPath = window.location.pathname;

        // Strip current locale prefix to get the base page path
        if (currentLocale) {
            currentPath = currentPath.replace(new RegExp('^/' + currentLocale + '/'), '/');
        }

        // Build target URL — all locales use /{code}/ prefix
        window.location.href = '/' + code + currentPath;
    },

    // ─── Legacy setLocale (now navigates) ────────────────────────────────

    async setLocale(code) {
        this.navigateToLocale(code);
    }
};

// Auto-detect locale from URL on script load — synchronous, no fetch needed.
// This ensures components that render during DOM parsing (connectedCallback)
// already see the correct locale before init() loads the translation strings.
I18n.locale = I18n._detectLocale();
