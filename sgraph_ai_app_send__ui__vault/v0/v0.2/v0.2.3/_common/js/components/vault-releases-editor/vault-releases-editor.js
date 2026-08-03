/* =================================================================================
   SGraph Vault — Releases editor (Settings → Versions)

   Authoring surface for release channels. Publishing a release is just naming a commit
   that is already in the vault, so this whole editor is a small CRUD over
   `.vault/releases.json` plus a commit picker fed by `vault.logCommits()`.

   Where it sits: authoring lives in the vault UI (here); CONSUMING lives in the /app
   HUD picker. That split is deliberate — deciding what to publish is an owner act, and
   choosing which published version to view is a viewer act.

   Owner-only by construction: the file is inside `.vault/` (the permission floor, so no
   app can touch it) and writing it needs a writable session. A read-only opener sees the
   list and the share links, and cannot change anything.

   Emits (composed):
     'vault-releases-saved' — { config }   after a successful write + push

   Requires: SGReleases, VaultHelpers (optional).
   ================================================================================= */

(function () {
    'use strict';

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function when(ms) {
        if (!ms) return '';
        try { return new Date(ms).toLocaleString(); } catch (_) { return ''; }
    }

    class VaultReleasesEditor extends HTMLElement {

        constructor() {
            super();
            this.attachShadow({ mode: 'open' });
            this._vault   = null;
            this._vaultKey = '';
            this._writable = false;
            this._cfg     = null;     // parsed SGReleases config
            this._commits = [];
            this._editing = null;     // release name being edited, or null
        }

        connectedCallback() {
            if (this._built) return;
            this._built = true;
            this.shadowRoot.innerHTML =
                '<style>' + VaultReleasesEditor.styles + '</style>' +
                '<div class="vre">' +
                  '<h2 class="vre-title">Versions</h2>' +
                  '<p class="vre-intro">Publish a commit under a name so people can keep using it while you carry on ' +
                    'pushing. Anyone opening this vault can pick a published version from the app’s toolbar, and a ' +
                    'pinned link always shows that exact version.</p>' +
                  '<div class="vre-status"></div>' +
                  '<div class="vre-list"></div>' +
                  '<div class="vre-add"></div>' +
                  '<div class="vre-global"></div>' +
                '</div>';
            this.shadowRoot.addEventListener('click', (e) => this._onClick(e));
            this.shadowRoot.addEventListener('change', (e) => this._onChange(e));
            this._render();
        }

        async setContext(ctx) {
            ctx = ctx || {};
            this._vault    = ctx.vault || null;
            this._vaultKey = ctx.vaultKey || '';
            this._writable = !!ctx.writable;
            await this.refresh();
        }

        async refresh() {
            if (!this._vault || typeof SGReleases === 'undefined') { this._render(); return; }
            this._cfg = SGReleases.parse(await this._read());
            try { this._commits = await this._vault.logCommits({ limit: 40 }); } catch (_) { this._commits = []; }
            this._render();
        }

        // ── storage ──────────────────────────────────────────────────────────────
        async _read() {
            var v = this._vault;
            try {
                // `.vault` is lazy and expands ONE level per call — the trap that made a
                // configured LLM key read as "not configured".
                if (v.needsLoading && v.needsLoading('/.vault')) await v.loadSubTreeOnDemand('/.vault');
                var listed = v.listFolder('/.vault') || [];
                if (!listed.some(function (e) { return e.name === SGReleases.FILE; })) return null;
                var bytes = await v.getFile('/.vault', SGReleases.FILE);
                return JSON.parse(new TextDecoder().decode(bytes));
            } catch (_) { return null; }
        }

        async _write(cfg) {
            var v = this._vault;
            var bytes = new TextEncoder().encode(JSON.stringify(SGReleases.serialize(cfg), null, 2));
            if (v.needsLoading && v.needsLoading('/.vault')) await v.loadSubTreeOnDemand('/.vault');
            if (!v.listFolder('/.vault')) await v.createFolder('/.vault');
            var exists = (v.listFolder('/.vault') || []).some(function (e) { return e.name === SGReleases.FILE; });
            if (exists) await v.updateFile('/.vault', SGReleases.FILE, bytes);
            else        await v.addFile   ('/.vault', SGReleases.FILE, bytes);
            await v.push();
            this._cfg = SGReleases.parse(cfg);
            this.dispatchEvent(new CustomEvent('vault-releases-saved', {
                detail: { config: this._cfg }, bubbles: true, composed: true
            }));
        }

        async _save(cfg, okMsg) {
            this._setStatus('Saving…', 'info');
            try {
                await this._write(cfg);
                this._setStatus(okMsg || 'Saved.', 'ok');
                this._render();
            } catch (err) {
                this._setStatus('Could not save: ' + ((err && err.message) || err), 'error');
            }
        }

        // ── rendering ────────────────────────────────────────────────────────────
        _render() {
            if (!this._built) return;
            var list = this.shadowRoot.querySelector('.vre-list');
            var add  = this.shadowRoot.querySelector('.vre-add');
            var glob = this.shadowRoot.querySelector('.vre-global');
            if (!list) return;

            if (!this._vault) { list.innerHTML = '<div class="vre-empty">Open a vault to manage versions.</div>'; add.innerHTML = ''; glob.innerHTML = ''; return; }

            var cfg = this._cfg || SGReleases.parse(null);
            var rels = cfg.releases;

            list.innerHTML = rels.length
                ? rels.map((r) => this._row(r, cfg)).join('')
                : '<div class="vre-empty">No versions published yet. Everyone opening this vault sees the latest commit — ' +
                  'which changes every time you push. Publish one below to give people something stable.</div>';

            add.innerHTML = this._writable ? this._addForm() : '';
            glob.innerHTML = (this._writable && rels.length) ? this._globals(cfg) : '';

            if (!this._writable) {
                this._setStatus('Read-only session — you can see published versions but not change them.', 'info');
            }
        }

        _row(r, cfg) {
            var isDefault = cfg['default'] && cfg['default'].toLowerCase() === r.name.toLowerCase();
            var link = this._shareLink(r.name);
            if (this._confirmDel === r.name) {
                return '<div class="vre-row vre-row--confirm">' +
                    '<div class="vre-main"><span class="vre-name">Stop publishing "' + esc(r.label || r.name) + '"?</span>' +
                        '<div class="vre-meta">The commit is not deleted — nothing is lost. Anyone using a link pinned to ' +
                        'this name will fall back to the latest version' + (isDefault ? ', and this vault will have no default' : '') + '.</div>' +
                    '</div>' +
                    '<div class="vre-rowacts">' +
                        '<button class="vre-btn vre-btn--sm vre-btn--danger" data-delyes="' + esc(r.name) + '">Stop publishing</button>' +
                        '<button class="vre-btn vre-btn--sm" data-delcancel="1">Cancel</button>' +
                    '</div>' +
                '</div>';
            }
            if (this._editing === r.name) {
                return '<div class="vre-row vre-row--edit">' +
                    '<div class="vre-f"><label>Name</label><input class="vre-e-name" value="' + esc(r.name) + '"></div>' +
                    '<div class="vre-f"><label>Label (optional)</label><input class="vre-e-label" value="' + esc(r.label || '') + '"></div>' +
                    '<div class="vre-f vre-f--wide"><label>Notes (optional)</label><input class="vre-e-notes" value="' + esc(r.notes || '') + '"></div>' +
                    '<div class="vre-rowacts">' +
                        '<button class="vre-btn vre-btn--primary" data-save="' + esc(r.name) + '">Save</button>' +
                        '<button class="vre-btn" data-cancel="1">Cancel</button>' +
                    '</div>' +
                '</div>';
            }
            return '<div class="vre-row">' +
                '<div class="vre-main">' +
                    '<span class="vre-name">' + esc(r.label || r.name) + '</span>' +
                    (r.label ? '<span class="vre-alt">' + esc(r.name) + '</span>' : '') +
                    (isDefault ? '<span class="vre-badge">default for others</span>' : '') +
                    '<div class="vre-meta">commit <code>' + esc(r.commit.slice(0, 10)) + '</code>' +
                        (r.created ? ' · published ' + esc(when(Date.parse(r.created))) : '') +
                        (r.notes ? ' · ' + esc(r.notes) : '') + '</div>' +
                    '<div class="vre-link"><input readonly value="' + esc(link) + '"><button class="vre-btn vre-btn--sm" data-copy="' + esc(link) + '">Copy link</button></div>' +
                '</div>' +
                (this._writable ? '<div class="vre-rowacts">' +
                    (isDefault ? '' : '<button class="vre-btn vre-btn--sm" data-default="' + esc(r.name) + '" title="New viewers open this version">Make default</button>') +
                    '<button class="vre-btn vre-btn--sm" data-edit="' + esc(r.name) + '">Edit</button>' +
                    '<button class="vre-btn vre-btn--sm vre-btn--danger" data-del="' + esc(r.name) + '">Remove</button>' +
                '</div>' : '') +
            '</div>';
        }

        _addForm() {
            var head = (this._vault && this._vault._headCommitId) || '';
            var opts = this._commits.map(function (c, i) {
                var msg = (c.message || '(no message)').slice(0, 60);
                var t   = c.timestamp_ms ? (' · ' + when(c.timestamp_ms)) : '';
                return '<option value="' + esc(c.id) + '"' + (i === 0 ? ' selected' : '') + '>' +
                       (i === 0 ? 'Latest — ' : '') + esc(msg) + esc(t) + '</option>';
            }).join('');
            return '<div class="vre-panel">' +
                '<h3>Publish a version</h3>' +
                '<div class="vre-grid">' +
                    '<div class="vre-f"><label>Name</label><input class="vre-n-name" placeholder="v1.2  or  Black Hat demo"></div>' +
                    '<div class="vre-f"><label>Label (optional)</label><input class="vre-n-label" placeholder="shown in the picker"></div>' +
                '</div>' +
                '<div class="vre-f vre-f--wide"><label>Commit</label><select class="vre-n-commit">' + (opts || '<option value="' + esc(head) + '">current</option>') + '</select></div>' +
                '<div class="vre-f vre-f--wide"><label>Notes (optional)</label><input class="vre-n-notes" placeholder="what changed / who this is for"></div>' +
                '<div class="vre-actions">' +
                    '<button class="vre-btn vre-btn--primary vre-publish">Publish version</button>' +
                    '<span class="vre-hint">Names can be anything — “v1.2” or “Black Hat demo”. Both work in a link.</span>' +
                '</div>' +
            '</div>';
        }

        _globals(cfg) {
            return '<div class="vre-panel">' +
                '<label class="vre-check"><input type="checkbox" class="vre-allowlive"' + (cfg.allowLive !== false ? ' checked' : '') + '> ' +
                    'Let viewers choose “Live (latest)”</label>' +
                '<p class="vre-hint">Turn this off for a demo where nobody should land on work in progress. ' +
                    'You can still switch yourself — the default never binds the vault owner.</p>' +
                (cfg['default'] ? '<button class="vre-btn vre-btn--sm vre-cleardefault">Clear default (new viewers get the latest)</button>' : '') +
            '</div>';
        }

        _shareLink(name) {
            var base = window.location.origin + '/#' + (this._vaultKey || '<vault-key>');
            return base + '|@' + SGReleases.slug(name);
        }

        _setStatus(msg, type) {
            var el = this.shadowRoot.querySelector('.vre-status');
            if (!el) return;
            el.textContent = msg || '';
            el.className = 'vre-status' + (type ? ' vre-status--' + type : '');
        }

        // ── interactions ─────────────────────────────────────────────────────────
        _onChange(e) {
            if (e.target.closest('.vre-allowlive')) {
                var cfg = Object.assign({}, this._cfg, { allowLive: e.target.checked });
                this._save(cfg, e.target.checked ? 'Viewers can choose Live.' : 'Viewers can no longer choose Live.');
            }
        }

        _onClick(e) {
            var t = e.target;
            var copy = t.closest('[data-copy]');
            if (copy) {
                var v = copy.getAttribute('data-copy');
                navigator.clipboard && navigator.clipboard.writeText(v).then(() => {
                    var o = copy.textContent; copy.textContent = 'Copied ✓';
                    setTimeout(() => { copy.textContent = o; }, 1500);
                }, () => {});
                return;
            }
            if (t.closest('.vre-publish'))      return this._publish();
            if (t.closest('.vre-cleardefault')) return this._save(Object.assign({}, this._cfg, { 'default': null }), 'Default cleared.');

            var ed = t.closest('[data-edit]');
            if (ed) { this._editing = ed.getAttribute('data-edit'); this._render(); return; }
            if (t.closest('[data-cancel]')) { this._editing = null; this._render(); return; }

            var sv = t.closest('[data-save]');
            if (sv) return this._saveEdit(sv.getAttribute('data-save'));

            var df = t.closest('[data-default]');
            if (df) return this._save(Object.assign({}, this._cfg, { 'default': df.getAttribute('data-default') }),
                                      'New viewers will open "' + df.getAttribute('data-default') + '".');

            // Removal confirms INLINE (no window.confirm) — the same rule the request ledger
            // follows. The confirm copy matters here: "remove" reads as destructive, but the
            // commit is untouched; only the published name goes.
            var dl = t.closest('[data-del]');
            if (dl) { this._confirmDel = dl.getAttribute('data-del'); this._render(); return; }
            if (t.closest('[data-delcancel]')) { this._confirmDel = null; this._render(); return; }
            var dy = t.closest('[data-delyes]');
            if (dy) { this._confirmDel = null; return this._remove(dy.getAttribute('data-delyes')); }
        }

        async _publish() {
            var q = (s) => this.shadowRoot.querySelector(s);
            var name   = (q('.vre-n-name').value || '').trim();
            var label  = (q('.vre-n-label').value || '').trim();
            var notes  = (q('.vre-n-notes').value || '').trim();
            var commit = q('.vre-n-commit').value;
            if (!name)   { this._setStatus('Give the version a name.', 'error'); return; }
            if (!commit) { this._setStatus('Pick a commit to publish.', 'error'); return; }
            // Uniqueness is enforced HERE (the parser silently keeps the first duplicate,
            // which would look like the publish had no effect).
            if (SGReleases.isDuplicateName(this._cfg, name)) {
                this._setStatus('"' + name + '" already exists — pick another name or edit the existing one.', 'error');
                return;
            }
            var rel = { name: name, commit: commit, created: new Date().toISOString() };
            if (label) rel.label = label;
            if (notes) rel.notes = notes;
            // Newest first: the picker reads top-down and the newest release is the one
            // people reach for.
            var cfg = Object.assign({}, this._cfg, { releases: [rel].concat((this._cfg && this._cfg.releases) || []) });
            await this._save(cfg, 'Published "' + name + '".');
        }

        async _saveEdit(oldName) {
            var q = (s) => this.shadowRoot.querySelector(s);
            var name  = (q('.vre-e-name').value || '').trim();
            var label = (q('.vre-e-label').value || '').trim();
            var notes = (q('.vre-e-notes').value || '').trim();
            if (!name) { this._setStatus('A version needs a name.', 'error'); return; }
            var clash = SGReleases.find(this._cfg, name);
            if (clash && clash.name.toLowerCase() !== oldName.toLowerCase()) {
                this._setStatus('"' + name + '" already exists.', 'error');
                return;
            }
            var releases = (this._cfg.releases || []).map(function (r) {
                if (r.name !== oldName) return r;
                var out = { name: name, commit: r.commit, created: r.created };
                if (label) out.label = label;
                if (notes) out.notes = notes;
                return out;
            });
            // A rename must carry the default with it, or the default silently points at
            // a release that no longer exists and every new viewer drops to Live.
            var cfg = Object.assign({}, this._cfg, { releases: releases });
            if (cfg['default'] && cfg['default'].toLowerCase() === oldName.toLowerCase()) cfg['default'] = name;
            this._editing = null;
            await this._save(cfg, 'Saved.');
        }

        async _remove(name) {
            var releases = (this._cfg.releases || []).filter(function (r) { return r.name !== name; });
            var cfg = Object.assign({}, this._cfg, { releases: releases });
            if (cfg['default'] && cfg['default'].toLowerCase() === name.toLowerCase()) cfg['default'] = null;
            await this._save(cfg, 'Removed "' + name + '".');
        }
    }

    VaultReleasesEditor.styles = `
        :host { display: block; overflow-y: auto; height: 100%; box-sizing: border-box; }
        .vre { max-width: 760px; padding: var(--space-4, 1rem); }
        .vre-title { font-size: var(--text-h3, 1.1rem); font-weight: 700; color: var(--color-text, #e2e8f0); margin: 0 0 .4rem; }
        .vre-intro { font-size: .78rem; color: var(--color-text-secondary, #9aa4bf); margin: 0 0 1rem; line-height: 1.5; }
        .vre-status { font-size: .74rem; min-height: 1.2em; margin-bottom: .5rem; }
        .vre-status--ok    { color: #4ecdc4; }
        .vre-status--error { color: #ff6b6b; }
        .vre-status--info  { color: var(--color-text-secondary, #9aa4bf); }
        .vre-empty { font-size: .78rem; color: var(--color-text-secondary, #9aa4bf); line-height: 1.5;
                     border: 1px dashed var(--color-border, #24304a); border-radius: 6px; padding: .8rem; }
        .vre-row { display: flex; gap: .75rem; align-items: flex-start; justify-content: space-between;
                   border: 1px solid var(--color-border, #24304a); border-radius: 6px; padding: .6rem .7rem; margin-bottom: .5rem; }
        .vre-row--edit { flex-wrap: wrap; }
        .vre-main { min-width: 0; flex: 1; }
        .vre-name { font-weight: 700; font-size: .85rem; color: var(--color-text, #e2e8f0); }
        .vre-alt  { font-family: var(--font-mono, monospace); font-size: .68rem; color: var(--color-text-secondary, #9aa4bf); margin-left: .4rem; }
        .vre-badge { font-size: .62rem; margin-left: .5rem; padding: .1rem .4rem; border-radius: 9999px;
                     background: rgba(78,205,196,.14); color: #4ecdc4; }
        .vre-meta { font-size: .68rem; color: var(--color-text-secondary, #9aa4bf); margin-top: .2rem; }
        .vre-meta code { font-family: var(--font-mono, monospace); }
        .vre-link { display: flex; gap: .3rem; margin-top: .4rem; }
        .vre-link input { flex: 1; min-width: 0; font-family: var(--font-mono, monospace); font-size: .64rem;
                          background: var(--bg-primary, #0d1120); color: var(--color-text-secondary, #9aa4bf);
                          border: 1px solid var(--color-border, #24304a); border-radius: 4px; padding: .2rem .35rem; }
        .vre-rowacts { display: flex; gap: .3rem; flex-shrink: 0; flex-wrap: wrap; }
        .vre-panel { border: 1px solid var(--color-border, #24304a); border-radius: 6px; padding: .7rem; margin-top: .9rem; }
        .vre-panel h3 { font-size: .8rem; margin: 0 0 .6rem; color: var(--color-text, #e2e8f0); }
        .vre-grid { display: flex; gap: .5rem; flex-wrap: wrap; }
        .vre-f { display: flex; flex-direction: column; gap: .2rem; flex: 1; min-width: 11rem; margin-bottom: .5rem; }
        .vre-f--wide { flex-basis: 100%; }
        .vre-f label { font-size: .66rem; color: var(--color-text-secondary, #9aa4bf); text-transform: uppercase; letter-spacing: .04em; }
        .vre-f input, .vre-f select {
            font: inherit; font-size: .76rem; padding: .35rem .45rem;
            background: var(--bg-primary, #0d1120); color: var(--color-text, #e2e8f0);
            border: 1px solid var(--color-border, #24304a); border-radius: 4px; outline: none; width: 100%; box-sizing: border-box;
        }
        .vre-actions { display: flex; align-items: center; gap: .6rem; flex-wrap: wrap; }
        .vre-hint { font-size: .68rem; color: var(--color-text-secondary, #9aa4bf); }
        .vre-check { font-size: .76rem; color: var(--color-text, #e2e8f0); display: inline-flex; gap: .4rem; align-items: center; }
        .vre-btn {
            padding: .3rem .6rem; font-size: .72rem; border-radius: 4px; cursor: pointer;
            border: 1px solid var(--color-border, #24304a); background: transparent;
            color: var(--color-text-secondary, #9aa4bf); font-family: inherit; white-space: nowrap;
        }
        .vre-btn:hover { color: var(--color-text, #e2e8f0); border-color: var(--color-primary, #4ecdc4); }
        .vre-btn--sm { font-size: .66rem; padding: .2rem .45rem; }
        .vre-btn--primary { background: #4ecdc4; border-color: #4ecdc4; color: #0a0a18; font-weight: 700; }
        .vre-btn--primary:hover { opacity: .9; color: #0a0a18; }
        .vre-btn--danger:hover { border-color: #ff6b6b; color: #ff6b6b; }
    `;

    customElements.define('vault-releases-editor', VaultReleasesEditor);
})();
