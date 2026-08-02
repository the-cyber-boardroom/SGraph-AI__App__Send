/* =================================================================================
   SGraph Vault -- Settings View Component
   v0.2.1 -- Adds Read Key display (hex-exported AES key for sgit read-only access)

   Shadow DOM. Receives vault instance via setVault().
   Emits (composed: true):
     'vault-settings-name-saved'  -- { name }
     'vault-settings-access-key'  -- { key }
   ================================================================================= */

(function() {
    'use strict';

    class VaultSettings extends HTMLElement {

        constructor() {
            super();
            this.attachShadow({ mode: 'open' });
            this._vault    = null;
            this._vaultKey = '';
            this._accessKey = '';
        }

        connectedCallback() {
            this.shadowRoot.innerHTML = `
                <style>${VaultSettings.styles}</style>
                <div class="vset-panel">
                    <h2 class="vset-title">Vault Settings</h2>

                    <div class="vset-section">
                        <label class="vset-label">Vault Name</label>
                        <div class="vset-row">
                            <input class="vset-input vset-name-input" type="text" placeholder="Vault name">
                            <button class="vset-btn vset-save-name">Save</button>
                        </div>
                    </div>

                    <div class="vset-section">
                        <label class="vset-label">Vault Key</label>
                        <div class="vset-row">
                            <input class="vset-input vset-key-input" type="text" readonly>
                            <button class="vset-btn vset-copy-key">Copy</button>
                        </div>
                        <p class="vset-hint vset-hint--warn">Anyone with this key can access all files in this vault.</p>
                    </div>

                    <div class="vset-section">
                        <label class="vset-label">Vault URL</label>
                        <div class="vset-row">
                            <input class="vset-input vset-url-input" type="text" readonly>
                            <button class="vset-btn vset-copy-url">Copy</button>
                        </div>
                        <p class="vset-hint">Direct browser link to this vault. Treat it like the vault key — anyone with it can read all files.</p>
                    </div>

                    <div class="vset-section">
                        <label class="vset-label">Read Key</label>
                        <div class="vset-row">
                            <input class="vset-input vset-readkey-input" type="text" readonly placeholder="Loading…">
                            <button class="vset-btn vset-copy-readkey">Copy</button>
                        </div>
                        <p class="vset-hint">Raw AES-256 key (hex). Pass to <code>sgit clone</code> for read-only access without the vault passphrase.</p>
                    </div>

                    <!-- Read-only access always needs BOTH the read key and the vault id;
                         copying them separately is the usual source of "it doesn't work". -->
                    <div class="vset-section">
                        <label class="vset-label">Read-only access (share these together)</label>
                        <div class="vset-row">
                            <input class="vset-input vset-vaultid-input" type="text" readonly placeholder="Loading…">
                            <button class="vset-btn vset-copy-vaultid">Copy ID</button>
                        </div>
                        <div class="vset-row vset-row--stacked">
                            <input class="vset-input vset-rokey-input" type="text" readonly placeholder="Loading…">
                            <button class="vset-btn vset-btn--primary vset-copy-rokey">Copy both</button>
                        </div>
                        <div class="vset-row vset-row--stacked">
                            <input class="vset-input vset-roclone-input" type="text" readonly placeholder="Loading…">
                            <button class="vset-btn vset-copy-roclone">Copy command</button>
                        </div>
                        <p class="vset-hint">
                            <code>readkey:vaultid</code> is the single value <code>sgit clone</code> accepts for
                            read-only access — recipients can read every file but cannot write.
                            <strong>Not a secret-safe share:</strong> a reader sees all vault content.
                        </p>
                    </div>

                    <div class="vset-section">
                        <label class="vset-label">Access Key</label>
                        <div class="vset-row">
                            <input class="vset-input vset-access-input" type="password" placeholder="Enter access key to enable writes">
                            <button class="vset-btn vset-validate-access">Check</button>
                            <button class="vset-btn vset-save-access">Set</button>
                            <button class="vset-btn vset-clear-access" title="Clear access key">Clear</button>
                        </div>
                        <div class="vset-access-status"></div>
                        <p class="vset-hint">Needed for writing files. Leave empty to open in read-only mode. <em>Check</em> validates the key and shows remaining uses.</p>
                    </div>

                    <div class="vset-section vset-share-section" style="display:none">
                        <label class="vset-label">Read-only sharing</label>
                        <p class="vset-hint">Create read-only links to share this vault with others. Recipients can browse files but cannot modify anything.</p>
                        <div class="vset-row vset-share-row">
                            <button class="vset-btn vset-btn--primary vset-open-token-mgr">Manage read-only tokens ↗</button>
                        </div>
                        <p class="vset-hint">Opens the Token Manager in a new tab. Your vault will be pre-loaded automatically.</p>
                    </div>

                    <!-- AI / LLM access. Policy + credential live at .vault/llm/config.json,
                         which is inside the permission floor: no vault app can read it via
                         the bridge under any grant. The kernel reads it to service sg.llm.*. -->
                    <div class="vset-section vset-llm-section">
                        <label class="vset-label">AI models (OpenRouter)</label>
                        <p class="vset-hint">
                            Lets vault apps call LLMs through <code>sg.llm.*</code> without ever seeing your key.
                            Apps must also declare <code>permissions.llm</code> in their <code>app.json</code> —
                            capability is the intersection of what you allow here and what the app asks for.
                        </p>
                        <div class="vset-row">
                            <input class="vset-input vset-llm-key" type="password" placeholder="sk-or-v1-… (OpenRouter API key)" autocomplete="off">
                            <button class="vset-btn vset-llm-test" title="Validate the key against OpenRouter">Test</button>
                            <button class="vset-btn vset-btn--primary vset-llm-save">Save</button>
                            <button class="vset-btn vset-llm-clear" title="Remove LLM access from this vault">Clear</button>
                        </div>
                        <div class="vset-llm-status"></div>

                        <div class="vset-llm-adv" style="display:none">
                            <label class="vset-sublabel">Who can use the key</label>
                            <label class="vset-toggle-label">
                                <input class="vset-llm-tier" type="radio" name="llmtier" value="owner" checked>
                                <span>Owner only — sealed with the vault's write key. Read-only holders cannot use <em>or extract</em> it. <strong>Recommended.</strong></span>
                            </label>
                            <label class="vset-toggle-label">
                                <input class="vset-llm-tier" type="radio" name="llmtier" value="shared">
                                <span>Anyone who can open this vault — including read-only holders, who can then also <em>extract</em> the key and spend it elsewhere.</span>
                            </label>

                            <label class="vset-sublabel">Default model</label>
                            <input class="vset-input vset-llm-model" type="text" placeholder="anthropic/claude-sonnet-4">

                            <label class="vset-sublabel">Allowed models (comma-separated; <code>*</code> or <code>vendor/*</code>)</label>
                            <input class="vset-input vset-llm-allow" type="text" placeholder="*">

                            <label class="vset-sublabel">Spend caps per session</label>
                            <div class="vset-row">
                                <input class="vset-input vset-llm-cost" type="number" min="0" step="0.10" placeholder="1.00" title="Max cost per session (USD)">
                                <input class="vset-input vset-llm-calls" type="number" min="0" step="10" placeholder="200" title="Max calls per session">
                            </div>
                            <p class="vset-hint vset-hint--warn">
                                Caps here prevent accidents, not abuse — anyone who can use the key can also spend it
                                outside this app. Mint a <strong>budget-capped, rotatable</strong> key at OpenRouter and
                                treat that limit as the real one.
                            </p>
                        </div>
                        <button class="vset-json-toggle vset-llm-adv-toggle">(advanced)</button>
                    </div>

                    <div class="vset-section">
                        <label class="vset-label">Statistics</label>
                        <div class="vset-stats"></div>
                    </div>

                    <div class="vset-section">
                        <label class="vset-label">Sync</label>
                        <div class="vset-sync-row">
                            <label class="vset-toggle-label">
                                <input class="vset-autosync-cb" type="checkbox" checked>
                                Auto-sync
                            </label>
                            <p class="vset-hint">When enabled, vault automatically pushes local commits to the published branch and silently pulls new commits from collaborators whenever you switch to the Files view. Diverged vaults are flagged for manual resolution; no background polling.</p>
                        </div>
                    </div>

                    <div class="vset-section">
                        <label class="vset-label">Raw JSON <button class="vset-json-toggle">(show)</button></label>
                        <div class="vset-json" style="display:none">
                            <h4>vault-settings.json</h4>
                            <pre class="vset-json-settings"></pre>
                            <h4>vault-tree.json</h4>
                            <pre class="vset-json-tree"></pre>
                        </div>
                    </div>
                </div>
            `;

            this._setupListeners();
        }

        setVault(vault, vaultKey, accessKey) {
            this._vault     = vault;
            this._vaultKey  = vaultKey;
            this._accessKey = accessKey;
            this.refresh();
        }

        async refresh() {
            if (!this._vault) return;
            const root = this.shadowRoot;

            const nameInput = root.querySelector('.vset-name-input');
            if (nameInput) nameInput.value = this._vault.name || '';

            const keyInput = root.querySelector('.vset-key-input');
            if (keyInput) keyInput.value = this._vaultKey;

            const urlInput = root.querySelector('.vset-url-input');
            if (urlInput) {
                const base = window.location.origin;
                urlInput.value = `${base}/#${this._vaultKey}`;
            }

            // Export read key as hex for display
            const rkInput = root.querySelector('.vset-readkey-input');
            let   readHex = '';
            if (this._vault._readKey) {
                try {
                    const raw    = await crypto.subtle.exportKey('raw', this._vault._readKey);
                    const bytes  = new Uint8Array(raw);
                    readHex      = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
                } catch (_) { readHex = ''; }
            }
            if (rkInput) rkInput.value = readHex || '(unavailable)';

            // Read-only share block: the id alone is useless and the key alone is useless —
            // `readkey:vaultid` is the one value sgit accepts, so give it as a single copy.
            const vaultId  = this._vault._vaultId || '';
            const idInput  = root.querySelector('.vset-vaultid-input');
            const roInput  = root.querySelector('.vset-rokey-input');
            const clInput  = root.querySelector('.vset-roclone-input');
            if (idInput) idInput.value = vaultId || '(unavailable)';
            const combined = (readHex && vaultId) ? `${readHex}:${vaultId}` : '';
            if (roInput) roInput.value = combined || '(unavailable)';
            if (clInput) clInput.value = combined ? `sgit clone "${combined}"` : '(unavailable)';

            await this._refreshLlm();

            const accessInput = root.querySelector('.vset-access-input');
            if (accessInput) accessInput.value = this._accessKey || '';

            // Share + public-preview sections: only visible in owner mode (opened with a passphrase, not an ro-token)
            const ownerMode = !!this._vault._passphrase;
            const shareSection = root.querySelector('.vset-share-section');
            if (shareSection) shareSection.style.display = ownerMode ? '' : 'none';

            const stats = this._vault.getStats();
            const statsEl = root.querySelector('.vset-stats');
            if (statsEl) {
                statsEl.innerHTML = `
                    <div class="vset-stats-grid">
                        <span class="vset-stats-label">Files</span><span class="vset-stats-value">${stats.files}</span>
                        <span class="vset-stats-label">Folders</span><span class="vset-stats-value">${stats.folders}</span>
                        <span class="vset-stats-label">Total size</span><span class="vset-stats-value">${VaultHelpers.formatBytes(stats.totalSize)}</span>
                        <span class="vset-stats-label">Created</span><span class="vset-stats-value">${this._vault.created ? VaultHelpers.formatTimestamp(this._vault.created) : '--'}</span>
                    </div>
                `;
            }
        }

        _setupListeners() {
            this.shadowRoot.addEventListener('click', (e) => {
                if (e.target.closest('.vset-save-name'))       return this._saveName();
                if (e.target.closest('.vset-copy-key'))        return this._copyWithFlash('.vset-copy-key', '.vset-key-input');
                if (e.target.closest('.vset-copy-url'))        return this._copyWithFlash('.vset-copy-url', '.vset-url-input');
                if (e.target.closest('.vset-copy-readkey'))    return this._copyWithFlash('.vset-copy-readkey', '.vset-readkey-input');
                if (e.target.closest('.vset-copy-vaultid'))    return this._copyWithFlash('.vset-copy-vaultid', '.vset-vaultid-input');
                if (e.target.closest('.vset-copy-rokey'))      return this._copyWithFlash('.vset-copy-rokey', '.vset-rokey-input');
                if (e.target.closest('.vset-copy-roclone'))    return this._copyWithFlash('.vset-copy-roclone', '.vset-roclone-input');
                if (e.target.closest('.vset-llm-adv-toggle'))  return this._toggleLlmAdvanced(e);
                if (e.target.closest('.vset-llm-save'))        return this._saveLlm();
                if (e.target.closest('.vset-llm-clear'))       return this._clearLlm();
                if (e.target.closest('.vset-llm-test'))        return this._testLlm();
                if (e.target.closest('.vset-save-access'))     return this._saveAccess();
                if (e.target.closest('.vset-clear-access'))    return this._clearAccess();
                if (e.target.closest('.vset-validate-access')) return this._validateAccess();
                if (e.target.closest('.vset-json-toggle'))        return this._toggleJson(e);
                if (e.target.closest('.vset-open-token-mgr'))  return this._openTokenManager();
            });
        }

        _copyWithFlash(btnSel, inputSel) {
            const btn   = this.shadowRoot.querySelector(btnSel);
            const input = this.shadowRoot.querySelector(inputSel);
            if (!btn || !input) return;
            navigator.clipboard.writeText(input.value).then(() => {
                const orig = btn.textContent;
                btn.textContent  = 'Copied ✓';
                btn.style.color  = '#4ecdc4';
                setTimeout(() => { btn.textContent = orig; btn.style.color = ''; }, 2000);
            });
        }

        async _saveName() {
            if (!this._vault) return;
            const input = this.shadowRoot.querySelector('.vset-name-input');
            const name = input?.value?.trim();
            if (!name) return;

            const btn = this.shadowRoot.querySelector('.vset-save-name');
            if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }

            try {
                await this._vault.setName(name);
                this.dispatchEvent(new CustomEvent('vault-settings-name-saved', {
                    detail: { name }, bubbles: true, composed: true
                }));
                window.sgraphVault.messages.success(`Vault renamed to "${name}"`);
            } catch (err) {
                window.sgraphVault.messages.error(`Rename failed: ${err.message}`);
            } finally {
                if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
            }
        }

        _saveAccess() {
            const input = this.shadowRoot.querySelector('.vset-access-input');
            const key = input?.value?.trim() ?? '';
            this._accessKey = key;
            this.dispatchEvent(new CustomEvent('vault-settings-access-key', {
                detail: { key }, bubbles: true, composed: true
            }));
            window.sgraphVault.messages.success(key ? 'Access key set — write mode enabled' : 'Access key cleared — vault is read-only');
            this._setAccessStatus('');
        }

        _clearAccess() {
            const input = this.shadowRoot.querySelector('.vset-access-input');
            if (input) input.value = '';
            this._accessKey = '';
            this.dispatchEvent(new CustomEvent('vault-settings-access-key', {
                detail: { key: '' }, bubbles: true, composed: true
            }));
            window.sgraphVault.messages.success('Access key cleared — vault is read-only');
            this._setAccessStatus('');
        }

        async _validateAccess() {
            const input  = this.shadowRoot.querySelector('.vset-access-input');
            const btn    = this.shadowRoot.querySelector('.vset-validate-access');
            const key    = input?.value?.trim();
            if (!key) { this._setAccessStatus('Enter a key first', 'warn'); return; }

            const orig = btn.textContent;
            btn.disabled = true; btn.textContent = '…';
            this._setAccessStatus('Checking…', 'info');

            try {
                // The check-token API lives on the SG-Send backend (e.g. dev.send.sgraph.ai),
                // not on the vault static-site origin (dev.vault.sgraph.ai). window.location.origin
                // pointed at the wrong host and the path used an underscore — the request landed
                // on S3 and came back as <Error><Code>AccessDenied</Code>.
                const endpoint = this._vault?._sgSend?.endpoint || 'https://dev.send.sgraph.ai';
                const resp = await fetch(`${endpoint}/api/transfers/check-token/${encodeURIComponent(key)}`);
                if (!resp.ok) {
                    this._setAccessStatus('Server error — could not validate', 'error');
                    return;
                }
                const data = await resp.json();
                if (!data.valid) {
                    this._setAccessStatus(`✗ Invalid — ${data.reason || data.status || 'not found'}`, 'error');
                } else if (data.remaining === 0) {
                    this._setAccessStatus(`⚠ Valid but exhausted (${data.status})`, 'warn');
                } else {
                    const rem = data.remaining > 0 ? ` · ${data.remaining} uses remaining` : ' · unlimited';
                    this._setAccessStatus(`✓ Valid${rem}`, 'ok');
                }
            } catch (err) {
                this._setAccessStatus(`✗ Check failed: ${err.message}`, 'error');
            } finally {
                btn.disabled = false; btn.textContent = orig;
            }
        }

        _setAccessStatus(msg, type) {
            const el = this.shadowRoot.querySelector('.vset-access-status');
            if (!el) return;
            el.textContent = msg;
            el.className = 'vset-access-status' + (type ? ' vset-access-status--' + type : '');
        }

        // ── AI / LLM settings (.vault/llm/config.json) ───────────────────────────────
        // `.vault` is a LAZY sub-tree after open (every top-level folder starts
        // _loaded:false), so listFolder('/.vault') returns [] until it is expanded —
        // the same trap that made embedded access tokens look absent (vault-shell.js).
        async _ensureVaultSubtree() {
            const v = this._vault;
            if (!v) return false;
            try {
                if (v.needsLoading && v.needsLoading('/.vault')) await v.loadSubTreeOnDemand('/.vault');
            } catch (_) { /* absent — created on first save */ }
            return true;
        }

        async _readLlmConfig() {
            const v = this._vault;
            if (!v) return null;
            await this._ensureVaultSubtree();
            try {
                const top = v.listFolder('/.vault') || [];
                if (!top.some((e) => e.name === 'llm' && e.type === 'folder')) return null;
                const inner = v.listFolder('/.vault/llm') || [];
                if (!inner.some((e) => e.name === 'config.json')) return null;
                const bytes = await v.getFile('/.vault/llm', 'config.json');
                return JSON.parse(new TextDecoder().decode(bytes));
            } catch (_) { return null; }
        }

        async _writeLlmConfig(obj) {
            const v = this._vault;
            if (!v) throw new Error('no vault');
            if (!v.writable) throw new Error('Read-only vault — an access key and the vault passphrase are needed to change AI settings');
            await this._ensureVaultSubtree();
            if (!v._findNode('/.vault'))     await v.createFolder('/.vault');
            if (!v._findNode('/.vault/llm')) await v.createFolder('/.vault/llm');
            const data    = new TextEncoder().encode(JSON.stringify(obj, null, 2));
            const listed  = v.listFolder('/.vault/llm') || [];
            const exists  = listed.some((e) => e.name === 'config.json');
            if (exists) await v.updateFile('/.vault/llm', 'config.json', data);
            else        await v.addFile('/.vault/llm', 'config.json', data);
        }

        async _refreshLlm() {
            const root = this.shadowRoot;
            const sec  = root.querySelector('.vset-llm-section');
            if (!sec) return;
            const raw    = await this._readLlmConfig();
            const policy = SGLlmConfig.parse(raw || {});
            this._llmPolicy = policy;

            const setVal = (sel, val) => { const el = root.querySelector(sel); if (el) el.value = val; };
            setVal('.vset-llm-model', policy.models['default'] || '');
            setVal('.vset-llm-allow', (policy.models.allow || ['*']).join(', '));
            setVal('.vset-llm-cost',  policy.limits.maxCostPerSession);
            setVal('.vset-llm-calls', policy.limits.maxCallsPerSession);
            root.querySelectorAll('.vset-llm-tier').forEach((r) => { r.checked = (r.value === policy.keyTier); });

            const configured = !!(policy.key || policy.keySealed);
            const keyEl = root.querySelector('.vset-llm-key');
            if (keyEl) keyEl.placeholder = configured
                ? (policy.key ? SGLlmConfig.redact(policy.key) + ' — stored (shared)' : 'stored (owner-sealed) — enter a new key to replace')
                : 'sk-or-v1-… (OpenRouter API key)';

            if (!configured) {
                this._setLlmStatus('Not configured — vault apps cannot call LLMs.', 'info');
            } else if (policy.keyTier === 'owner') {
                this._setLlmStatus('✓ Key stored, owner-sealed — read-only holders cannot use or extract it.', 'ok');
            } else {
                this._setLlmStatus('⚠ Key stored in shared tier — anyone who can open this vault can use AND extract it.', 'warn');
            }
        }

        _toggleLlmAdvanced(e) {
            const el = this.shadowRoot.querySelector('.vset-llm-adv');
            if (!el) return;
            const hidden = el.style.display === 'none';
            el.style.display = hidden ? '' : 'none';
            const btn = e.target.closest('.vset-llm-adv-toggle');
            if (btn) btn.textContent = hidden ? '(hide advanced)' : '(advanced)';
        }

        _llmFormPolicy() {
            const root = this.shadowRoot;
            const val  = (sel) => (root.querySelector(sel)?.value ?? '').trim();
            const tier = root.querySelector('.vset-llm-tier:checked')?.value || 'owner';
            const allow = val('.vset-llm-allow').split(',').map((s) => s.trim()).filter(Boolean);
            return SGLlmConfig.parse({
                keyTier: tier,
                models : { allow: allow.length ? allow : ['*'], 'default': val('.vset-llm-model') || null },
                limits : {
                    maxCostPerSession : Number(val('.vset-llm-cost'))  || undefined,
                    maxCallsPerSession: Number(val('.vset-llm-calls')) || undefined
                }
            });
        }

        async _saveLlm() {
            const root  = this.shadowRoot;
            const keyEl = root.querySelector('.vset-llm-key');
            const typed = (keyEl?.value || '').trim();
            const prev  = this._llmPolicy || SGLlmConfig.parse({});
            const form  = this._llmFormPolicy();

            // No new key typed → we are only re-saving policy. That requires an existing
            // credential, and a tier change needs the raw key (we cannot re-seal what we
            // cannot read in a shared→owner move without it).
            if (!typed && !(prev.key || prev.keySealed)) {
                this._setLlmStatus('Enter an OpenRouter key first.', 'warn'); return;
            }
            if (typed && !SGLlmConfig.looksLikeKey(typed)) {
                this._setLlmStatus('That does not look like an OpenRouter key (expected sk-or-…).', 'error'); return;
            }
            if (!typed && prev.keyTier !== form.keyTier) {
                this._setLlmStatus('Re-enter the key to move it between tiers.', 'warn'); return;
            }

            const btn = root.querySelector('.vset-llm-save');
            if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
            try {
                const out = SGLlmConfig.serialize(form);
                if (form.keyTier === 'shared') {
                    out.key = typed || prev.key;
                    delete out.keySealed;
                } else {
                    if (typed) {
                        // Seal with the OWNER key (derived from the vault write key). An
                        // ro-token session has no write key → cannot derive → cannot open.
                        const wk = this._vault && this._vault.writeKeyHex;
                        if (!wk) throw new Error('owner-sealing needs a writable vault (open with the vault key, not a read-only token)');
                        const oKey = await SGVaultOwnerSecrets.deriveKey(wk);
                        out.keySealed = await SGVaultOwnerSecrets.seal(oKey, { key: typed });
                    } else {
                        out.keySealed = prev.keySealed;
                    }
                    delete out.key;
                }
                await this._writeLlmConfig(out);
                if (keyEl) keyEl.value = '';                     // never leave a key in the DOM
                window.sgraphVault.messages.success('AI settings saved to .vault/llm/config.json');
                await this._refreshLlm();
            } catch (err) {
                this._setLlmStatus('✗ Save failed: ' + (err.message || err), 'error');
            } finally {
                if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
            }
        }

        async _clearLlm() {
            const v = this._vault;
            if (!v) return;
            const btn = this.shadowRoot.querySelector('.vset-llm-clear');
            if (btn) { btn.disabled = true; }
            try {
                await this._ensureVaultSubtree();
                const listed = v.listFolder('/.vault/llm') || [];
                if (listed.some((e) => e.name === 'config.json')) {
                    await v.removeFile('/.vault/llm', 'config.json');
                }
                const keyEl = this.shadowRoot.querySelector('.vset-llm-key');
                if (keyEl) keyEl.value = '';
                window.sgraphVault.messages.success('AI settings cleared — sg.llm.* is now unavailable in this vault');
                await this._refreshLlm();
            } catch (err) {
                this._setLlmStatus('✗ Clear failed: ' + (err.message || err), 'error');
            } finally {
                if (btn) btn.disabled = false;
            }
        }

        // Validate against OpenRouter from the REAL origin (this page), never from an app frame.
        async _testLlm() {
            const root  = this.shadowRoot;
            const typed = (root.querySelector('.vset-llm-key')?.value || '').trim();
            const prev  = this._llmPolicy || SGLlmConfig.parse({});
            const key   = typed || prev.key;    // owner-sealed keys are not re-read here
            if (!key) {
                this._setLlmStatus(prev.keySealed
                    ? 'Key is owner-sealed — paste it again to re-test.'
                    : 'Enter a key to test.', 'warn');
                return;
            }
            const btn = root.querySelector('.vset-llm-test');
            const orig = btn ? btn.textContent : '';
            if (btn) { btn.disabled = true; btn.textContent = '…'; }
            this._setLlmStatus('Checking…', 'info');
            try {
                const endpoint = (this._llmPolicy && this._llmPolicy.endpoint) || SGLlmConfig.DEFAULT_ENDPOINT;
                const resp = await fetch(endpoint + '/models', { headers: { Authorization: 'Bearer ' + key } });
                if (!resp.ok) { this._setLlmStatus('✗ Rejected by OpenRouter (' + resp.status + ')', 'error'); return; }
                const data = await resp.json();
                const n    = (data && Array.isArray(data.data)) ? data.data.length : 0;
                this._setLlmStatus('✓ Key valid · ' + n + ' models available', 'ok');
            } catch (err) {
                this._setLlmStatus('✗ Check failed: ' + (err.message || err), 'error');
            } finally {
                if (btn) { btn.disabled = false; btn.textContent = orig; }
            }
        }

        _setLlmStatus(msg, type) {
            const el = this.shadowRoot.querySelector('.vset-llm-status');
            if (!el) return;
            el.textContent = msg;
            el.className = 'vset-llm-status' + (type ? ' vset-access-status--' + type : '');
        }

        _openTokenManager() {
            const base = window.location.pathname.split('/en-gb/')[0];
            window.open(base + '/en-gb/vault/token/', '_blank');
        }

        _toggleJson(e) {
            const jsonEl = this.shadowRoot.querySelector('.vset-json');
            if (!jsonEl) return;
            const hidden = jsonEl.style.display === 'none';
            jsonEl.style.display = hidden ? '' : 'none';
            e.target.closest('.vset-json-toggle').textContent = hidden ? '(hide)' : '(show)';
            if (hidden && this._vault) {
                const sEl = this.shadowRoot.querySelector('.vset-json-settings');
                const tEl = this.shadowRoot.querySelector('.vset-json-tree');
                if (sEl) sEl.textContent = JSON.stringify(this._vault._settings, null, 2);
                if (tEl) tEl.textContent = JSON.stringify(this._vault._tree, null, 2);
            }
        }
    }

    VaultSettings.styles = `
        :host { display: block; overflow-y: auto; height: 100%; box-sizing: border-box; }
        .vset-panel { max-width: 640px; padding: var(--space-4); }
        .vset-title { font-size: var(--text-h3); font-weight: 700; color: var(--color-text); margin: 0 0 var(--space-5); }
        .vset-section { margin-bottom: var(--space-5); }
        .vset-section:last-child { margin-bottom: 0; }
        .vset-label {
            display: block; font-size: var(--text-sm); font-weight: 600;
            color: var(--color-text-secondary); margin-bottom: var(--space-2);
            text-transform: uppercase; letter-spacing: 0.04em;
        }
        .vset-input {
            width: 100%; padding: 0.5rem 0.75rem; font-size: var(--text-sm);
            font-family: var(--font-mono); background: var(--bg-primary);
            border: 1px solid var(--color-border); border-radius: var(--radius-sm);
            color: var(--color-text); outline: none; box-sizing: border-box;
        }
        .vset-row { display: flex; gap: var(--space-2); }
        .vset-row--stacked { margin-top: var(--space-2); }
        .vset-sublabel {
            display: block; font-size: var(--text-xs, 0.75rem); font-weight: 600;
            color: var(--color-text-secondary); margin: var(--space-3) 0 var(--space-1);
        }
        .vset-llm-adv { margin-top: var(--space-3); }
        .vset-llm-adv .vset-toggle-label { display: flex; gap: var(--space-2); align-items: flex-start; margin-bottom: var(--space-2); }
        .vset-llm-adv .vset-toggle-label span { font-size: var(--text-sm); color: var(--color-text-secondary); line-height: 1.5; }
        .vset-llm-status { font-size: var(--text-sm); margin-top: var(--space-2); min-height: 1.2em; }
        .vset-llm-adv-toggle { margin-top: var(--space-2); }
        .vset-row input { flex: 1; }
        .vset-btn {
            padding: 0.5rem 0.75rem; font-size: var(--text-sm); border-radius: var(--radius-sm);
            border: 1px solid var(--color-border); background: transparent;
            color: var(--color-text-secondary); cursor: pointer; font-family: var(--font-family);
        }
        .vset-btn:hover { background: var(--bg-secondary); color: var(--color-text); }
        .vset-btn--primary {
            background: var(--color-primary, #4ecdc4); color: #000;
            border-color: var(--color-primary, #4ecdc4); font-weight: 600;
        }
        .vset-btn--primary:hover { opacity: 0.88; background: var(--color-primary, #4ecdc4); }
        .vset-hint { font-size: var(--text-small); color: var(--color-text-secondary); margin: var(--space-1) 0 0; }
        .vset-hint--warn { color: var(--color-primary); }
        .vset-access-status { font-size: var(--text-small); margin-top: var(--space-1); min-height: 1.2em; }
        .vset-access-status--ok    { color: #4ecdc4; }
        .vset-access-status--warn  { color: #E9C445; }
        .vset-access-status--error { color: #ff6b6b; }
        .vset-access-status--info  { color: var(--color-text-secondary); }
        .vset-hint code { font-family: var(--font-mono); background: var(--bg-primary); padding: 0.1em 0.3em; border-radius: 3px; }
        .vset-stats-grid {
            display: grid; grid-template-columns: auto 1fr;
            gap: var(--space-1) var(--space-3); font-size: var(--text-sm);
        }
        .vset-stats-label { color: var(--color-text-secondary); font-weight: 600; }
        .vset-stats-value { color: var(--color-text); font-family: var(--font-mono); }
        .vset-json pre {
            background: var(--bg-primary); padding: var(--space-3); border-radius: var(--radius-sm);
            font-size: var(--text-small); overflow-x: auto; color: var(--color-text-secondary);
            font-family: var(--font-mono); border: 1px solid var(--color-border);
            max-height: 300px; overflow-y: auto;
        }
        .vset-json h4 { font-size: var(--text-sm); font-weight: 600; color: var(--color-text-secondary); margin: var(--space-3) 0 var(--space-1); }
        .vset-json-toggle { font-size: var(--text-small); color: var(--color-primary); background: none; border: none; cursor: pointer; font-family: var(--font-family); }
    `;

    customElements.define('vault-settings', VaultSettings);
})();
