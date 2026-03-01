/* ═══════════════════════════════════════════════════════════════════════════════
   SGraph Send — i18n Module
   v0.2.0 — Consolidated from v0.1.4 + v0.1.5 + v0.1.6 overlays

   English strings embedded inline. Additional locales load from locale files.
   Components use I18n.t('key') for all user-facing text.
   ═══════════════════════════════════════════════════════════════════════════════ */

const I18n = {

    locale: 'en-gb',

    // All English strings — consolidated from v0.1.4 base + v0.1.5 + v0.1.6 overlays
    strings: {
        'en-gb': {

            // ─── Brand ────────────────────────────────────────────────────
            'app.title':            'SG/Send',
            'app.tagline':          'Your files, your keys, your privacy',
            'app.subtitle':         'Zero-knowledge encrypted file sharing',
            'app.disclaimer':       'This is a beta service. Do not upload confidential or illegal content.',

            // ─── Upload: Mode ─────────────────────────────────────────────
            'upload.mode.file':     'File',
            'upload.mode.text':     'Text',

            // ─── Upload: Drop Zone ────────────────────────────────────────
            'upload.drop_zone.label':           'Drop your file here',
            'upload.drop_zone.hint':            'or click to browse',
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
            'upload.progress.completing':       'Finalising...',

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

            // ─── Upload: Token (v0.1.5) ───────────────────────────────────
            'upload.token.unlimited':           'Unlimited uses remaining',
            'upload.token.remaining':           '{remaining} uses remaining',

            // ─── Upload: Timing (v0.1.5) ──────────────────────────────────
            'upload.timing.title':              'Upload completed in',
            'download.timing.title':            'Download completed in',

            // ─── Download: Loading ────────────────────────────────────────
            'download.loading':                 'Loading transfer info...',

            // ─── Download: Info ───────────────────────────────────────────
            'download.info.encrypted_file':     'Encrypted file',
            'download.info.encrypted_text':     'Encrypted text',
            'download.info.uploaded':           'Uploaded {timestamp}',
            'download.info.download_count':     'Downloaded {count} time(s)',

            // ─── Download: Key Input ──────────────────────────────────────
            'download.key.label':               'Decryption key',
            'download.key.placeholder':         'Paste the decryption key here',
            'download.button.decrypt_download': 'Download & Decrypt',
            'download.button.decrypt_view':     'Decrypt & View',

            // ─── Download: Progress ───────────────────────────────────────
            'download.progress.decrypting':     'Downloading and decrypting...',

            // ─── Download: Result ─────────────────────────────────────────
            'download.result.file_success':     'File decrypted and saved successfully.',
            'download.result.text_success':     'Text decrypted successfully.',
            'download.result.copy_text':        'Copy to clipboard',
            'download.result.download_file':    'Download as file',
            'download.result.send_another':     'Send a new File or Text',
            'download.result.decrypted_message': 'Decrypted Message',

            // ─── Download: History ────────────────────────────────────────
            'download.history.title':           'Recent downloads',
            'download.history.privacy':         'Stored in your browser. Anyone with access to this device can view these.',
            'download.history.clear':           'Clear history',
            'download.history.empty':           'No recent downloads.',
            'download.history.text_preview':    'Text',
            'download.history.file_label':      'File',

            // ─── Download: Token ──────────────────────────────────────────
            'download.token.uses_remaining':    '{remaining} uses remaining',

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
            'access_gate.signup_title':         'Join the Early Access Program',
            'access_gate.signup_subtitle':      'Sign up to get notified when SGraph Send is available.',

            // ─── Transparency Panel (v0.1.6) ─────────────────────────────
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

            // ─── Header / Navigation ──────────────────────────────────────
            'nav.docs':                         'Docs',
            'nav.github':                       'GitHub',

            // ─── Footer ───────────────────────────────────────────────────
            'footer.powered_by':                'Powered by',
            'footer.sgraph':                    'SGraph',

            // ─── Test Files ───────────────────────────────────────────────
            'test_files.title':                 'Test Files',
            'test_files.description':           'Download a test file, then drag it into the upload zone above.',

            // ─── CTA ─────────────────────────────────────────────────────
            'cta.title':                        'Want to send files too?',
            'cta.description':                  'Join the early access program for SGraph Send.'
        }
    },

    availableLocales: [
        { code: 'en-gb', name: 'English (UK)',           flag: '\uD83C\uDDEC\uD83C\uDDE7' },
        { code: 'en',    name: 'English',                flag: '\uD83C\uDDEC\uD83C\uDDE7' },
        { code: 'pt',    name: 'Português (Brasil)',      flag: '\uD83C\uDDE7\uD83C\uDDF7' },
        { code: 'pt-PT', name: 'Português (Portugal)',    flag: '\uD83C\uDDF5\uD83C\uDDF9' },
        { code: 'de',    name: 'Deutsch',                 flag: '\uD83C\uDDE9\uD83C\uDDEA' },
        { code: 'fr',    name: 'Français',                flag: '\uD83C\uDDEB\uD83C\uDDF7' },
        { code: 'es',    name: 'Español',                 flag: '\uD83C\uDDEA\uD83C\uDDF8' },
        { code: 'it',    name: 'Italiano',                flag: '\uD83C\uDDEE\uD83C\uDDF9' },
        { code: 'nl',    name: 'Nederlands',              flag: '\uD83C\uDDF3\uD83C\uDDF1' },
        { code: 'pl',    name: 'Polski',                  flag: '\uD83C\uDDF5\uD83C\uDDF1' },
        { code: 'sv',    name: 'Svenska',                 flag: '\uD83C\uDDF8\uD83C\uDDEA' },
        { code: 'da',    name: 'Dansk',                   flag: '\uD83C\uDDE9\uD83C\uDDF0' },
        { code: 'fi',    name: 'Suomi',                   flag: '\uD83C\uDDEB\uD83C\uDDEE' },
        { code: 'el',    name: 'Ελληνικά',                flag: '\uD83C\uDDEC\uD83C\uDDF7' },
        { code: 'ro',    name: 'Română',                  flag: '\uD83C\uDDF7\uD83C\uDDF4' }
    ],

    // ─── Locale File Base Path ────────────────────────────────────────────
    localePath: '',

    // ─── Initialisation ──────────────────────────────────────────────────

    async init(localePath) {
        if (localePath) this.localePath = localePath;

        const saved = localStorage.getItem('sgraph-send-locale');
        if (saved && saved !== 'en-gb' && this.isSupported(saved)) {
            this.locale = saved;
            await this.loadLocale(saved);
            document.dispatchEvent(new CustomEvent('locale-changed', {
                detail: { locale: saved }
            }));
        }
    },

    isSupported(code) {
        return this.availableLocales.some(l => l.code === code);
    },

    // ─── Locale Loading ──────────────────────────────────────────────────

    async loadLocale(code) {
        if (this.strings[code]) return true;
        try {
            const path = this.localePath ? `${this.localePath}/${code}.json` : `i18n/${code}.json`;
            const resp = await fetch(path);
            if (resp.ok) {
                this.strings[code] = await resp.json();
                return true;
            }
        } catch (e) { /* fallback to en-gb */ }
        return false;
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

    // ─── Locale Switching ────────────────────────────────────────────────

    async setLocale(code) {
        if (!this.isSupported(code)) return;
        if (!this.strings[code]) {
            await this.loadLocale(code);
        }
        this.locale = code;
        localStorage.setItem('sgraph-send-locale', code);
        document.dispatchEvent(new CustomEvent('locale-changed', {
            detail: { locale: code }
        }));
    }
};
