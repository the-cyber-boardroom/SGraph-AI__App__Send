"""
Source-code tests for sg.* bridge changes (Wave 1 + Wave 2).

These tests verify API surface and structural contracts by inspecting the JS
source files directly — no browser / JS runtime required.

Files under test:
  - send-browse--v0.3.2.js  (parent bridge + iframe injector)
  - vault-shell.js           (vault chrome — non-destructive refresh + sync events)
"""
import sgraph_ai_app_send__ui__user
import sgraph_ai_app_send__ui__vault
from unittest       import TestCase
from osbot_utils.utils.Files import path_combine, file_exists, file_contents


SEND_BROWSE = path_combine(
    sgraph_ai_app_send__ui__user.path,
    'v0/v0.3/v0.3.3/_common/js/components/send-download/send-browse--v0.3.2.js'
)
VAULT_SHELL = path_combine(
    sgraph_ai_app_send__ui__vault.path,
    'v0/v0.2/v0.2.3/_common/js/components/vault-shell/vault-shell.js'
)


class test__sg_bridge__files_exist(TestCase):

    def test__send_browse_exists(self):
        assert file_exists(SEND_BROWSE), f'Missing: {SEND_BROWSE}'

    def test__vault_shell_exists(self):
        assert file_exists(VAULT_SHELL), f'Missing: {VAULT_SHELL}'


class test__sg_bridge__wave1__write_hard_reject(TestCase):
    """Ask 1 — sg.vfs.write must reject on push failure."""

    @classmethod
    def setUpClass(cls):
        cls.src = file_contents(SEND_BROWSE)

    def test__write_awaits_push_before_reply(self):
        # _writeReply(true) must only appear AFTER vault.push() resolves
        push_pos  = self.src.index('ds._vault.push()')
        reply_pos = self.src.index('_writeReply(true, payload)')
        assert push_pos < reply_pos, 'push() must be called before _writeReply(true)'

    def test__push_failure_rejects_write(self):
        # The single .catch at the end covers both saveFile and push failures
        assert "_writeReply(false, { err: err.message || 'Write failed' })" in self.src

    def test__no_fire_and_forget_push(self):
        # The old silent .catch(warn) pattern must be gone
        assert "auto-push failed (non-fatal)" not in self.src

    def test__sync_state_refreshed_after_push(self):
        assert '_refreshSyncState' in self.src


class test__sg_bridge__wave1__strict_read(TestCase):
    """Ask 2b — sg.vfs.read/readText must use strict path matching."""

    @classmethod
    def setUpClass(cls):
        cls.src = file_contents(SEND_BROWSE)

    def test__find_entry_strict_exists(self):
        assert 'function _findEntryStrict(' in self.src

    def test__find_entry_strict_exact_only(self):
        # _findEntryStrict must not contain extension-guessing or endsWith fallback
        idx   = self.src.index('function _findEntryStrict(')
        chunk = self.src[idx:idx+300]
        assert 'endsWith' not in chunk
        assert '.md'      not in chunk

    def test__sgVfsReadReq_handler_exists(self):
        assert '__sgVfsReadReq' in self.src

    def test__sgVfsReadReq_uses_strict_matcher(self):
        idx   = self.src.index('e.data.__sgVfsReadReq')
        chunk = self.src[idx:idx+1000]
        assert '_findEntryStrict(' in chunk

    def test__sgVfsReadReq_returns_enoent(self):
        assert "err: 'ENOENT'" in self.src

    def test__iframe_read_uses_sgVfsReadReq(self):
        # _read on the iframe side must use __sgVfsReadReq, not plain fetch
        idx   = self.src.index("'function _read(path){' +")
        chunk = self.src[idx:idx+750]
        assert '__sgVfsReadReq' in chunk
        assert 'fetch(' not in chunk

    def test__iframe_readText_uses_read(self):
        # _readText must delegate to _read (which uses the strict path)
        idx   = self.src.index("'function _readText(path){")
        chunk = self.src[idx:idx+150]
        assert '_read(path)' in chunk

    def test__legacy_fetch_intercept_still_uses_fuzzy(self):
        # __sgVfsReq (HTML asset path) must still use _findEntry (fuzzy), not strict
        idx   = self.src.rindex('e.data.__sgVfsReq')   # last occurrence = parent handler
        chunk = self.src[idx:idx+600]
        assert '_findEntry(fileList' in chunk
        assert '_findEntryStrict'    not in chunk


class test__sg_bridge__wave1__symmetric_ttl(TestCase):
    """Ask 5 — sg.ui.message symmetric TTL + sg.ui.dismiss."""

    @classmethod
    def setUpClass(cls):
        cls.src = file_contents(SEND_BROWSE)

    def test__ui_message_accepts_opts(self):
        assert "'message:function(text,type,opts){" in self.src

    def test__ui_message_returns_handle(self):
        assert 'return handle;' in self.src

    def test__ui_message_default_ttl_3000(self):
        # All types default to 3000ms
        assert 'opts.ttl===null?null:(typeof opts.ttl===\"number\"?opts.ttl:3000)' in self.src

    def test__ui_dismiss_defined(self):
        assert "'dismiss:function(handle){" in self.src

    def test__parent_handles_dismiss_flag(self):
        assert 'uiMsg.dismiss' in self.src

    def test__parent_clears_timeout_on_dismiss(self):
        assert 'clearTimeout(_uiHandles[uiHandle])' in self.src

    def test__parent_manages_ttl_timer(self):
        assert '_uiHandles[uiHandle] = setTimeout' in self.src

    def test__uiHandles_declared_in_scope(self):
        assert 'var _uiHandles = {};' in self.src

    def test__uiHandles_cleared_on_dismiss(self):
        assert 'delete _uiHandles[uiHandle]' in self.src


class test__sg_bridge__wave1__sg_sync_namespace(TestCase):
    """Ask 6 — sg.sync namespace alias."""

    @classmethod
    def setUpClass(cls):
        cls.src = file_contents(SEND_BROWSE)

    def test__sg_sync_defined(self):
        assert "'sync:{'" in self.src

    def test__sg_sync_status_returns_booleans(self):
        idx   = self.src.index("'sync:{'" )
        chunk = self.src[idx:idx+600]
        assert 'current:'          in chunk
        assert 'serverHasNewer:'   in chunk
        assert 'localHasUnsynced:' in chunk
        assert 'serverVersion:'    in chunk

    def test__sg_git_still_present_for_compat(self):
        # sg.git.* survives as a deprecation-wrapped IIFE
        assert "'git:(function(){'" in self.src

    def test__sg_sync_refresh_uses_syncRefresh_action(self):
        # sg.sync.refresh() must call syncRefresh (non-destructive), not refresh (destructive)
        idx   = self.src.index("'sync:{'" )
        chunk = self.src[idx:idx+1200]
        assert 'syncRefresh' in chunk
        # The destructive 'refresh' action must NOT be called from sg.sync.refresh
        sync_refresh_idx = chunk.index('syncRefresh')
        assert 'action:"refresh"' not in chunk[:sync_refresh_idx]


# ─── Wave 2 ───────────────────────────────────────────────────────────────────

class test__sg_bridge__wave2__refresh_in_place(TestCase):
    """Ask 4 — vault-shell._refreshInPlace() non-destructive refresh."""

    @classmethod
    def setUpClass(cls):
        cls.src = file_contents(VAULT_SHELL)

    def test__refresh_in_place_method_exists(self):
        assert 'async _refreshInPlace()' in self.src

    def test__refresh_in_place_does_not_mount_browse(self):
        # _refreshInPlace must NOT call _mountBrowse (that destroys the iframe)
        idx   = self.src.index('async _refreshInPlace()')
        chunk = self.src[idx:idx+800]
        assert '_mountBrowse' not in chunk

    def test__refresh_in_place_calls_pull(self):
        idx   = self.src.index('async _refreshInPlace()')
        chunk = self.src[idx:idx+800]
        assert 'this._vault.pull()' in chunk

    def test__refresh_in_place_pushes_when_ahead(self):
        idx   = self.src.index('async _refreshInPlace()')
        chunk = self.src[idx:idx+800]
        assert 'ahead'             in chunk
        assert 'this._vault.push()' in chunk

    def test__refresh_in_place_refreshes_sync_state(self):
        idx   = self.src.index('async _refreshInPlace()')
        chunk = self.src[idx:idx+800]
        assert '_refreshSyncState()' in chunk

    def test__refresh_in_place_returns_from_to(self):
        idx   = self.src.index('async _refreshInPlace()')
        chunk = self.src[idx:idx+800]
        assert 'prevHead' in chunk
        assert 'newHead'  in chunk
        assert 'changed'  in chunk

    def test__refresh_in_place_dispatches_vault_synced(self):
        idx   = self.src.index('async _refreshInPlace()')
        chunk = self.src[idx:idx+1000]
        assert 'sg-vault-synced' in chunk


class test__sg_bridge__wave2__cache_invalidation(TestCase):
    """Ask 2a — fileList cache invalidation after vault syncs."""

    @classmethod
    def setUpClass(cls):
        cls.browse = file_contents(SEND_BROWSE)
        cls.shell  = file_contents(VAULT_SHELL)

    def test__shell_dispatches_vault_synced_on_pull(self):
        idx   = self.shell.index('async _onPull()')
        chunk = self.shell[idx:idx+800]
        assert 'sg-vault-synced' in chunk

    def test__shell_dispatches_vault_synced_on_auto_merge(self):
        idx   = self.shell.index('async _onAutoMerge()')
        chunk = self.shell[idx:idx+1800]
        assert 'sg-vault-synced' in chunk

    def test__shell_dispatches_vault_synced_on_auto_sync(self):
        idx   = self.shell.index('async _checkAndAutoSync()')
        chunk = self.shell[idx:idx+1400]
        assert 'sg-vault-synced' in chunk

    def test__vault_synced_event_carries_prev_and_new_head(self):
        # Every dispatch site must include prevHead and newHead
        import re
        dispatches = [m.start() for m in re.finditer(r"CustomEvent\('sg-vault-synced'", self.shell)]
        assert len(dispatches) >= 3, 'Expected at least 3 dispatch sites'
        for pos in dispatches:
            chunk = self.shell[pos:pos+200]
            assert 'prevHead' in chunk
            assert 'newHead'  in chunk

    def test__bridge_subscribes_to_vault_synced(self):
        assert "addEventListener('sg-vault-synced'" in self.browse

    def test__bridge_refreshes_filelist_on_vault_synced(self):
        idx   = self.browse.index("addEventListener('sg-vault-synced'")
        chunk = self.browse[idx-400:idx+400]
        assert 'getFileList()' in chunk

    def test__bridge_posts_cache_invalidate_to_iframe(self):
        assert '__sgVfsCacheInvalidate' in self.browse

    def test__sync_handlers_cleaned_up_on_disconnect(self):
        idx   = self.browse.index('disconnectedCallback()')
        chunk = self.browse[idx:idx+500]
        assert '_syncHandlers' in chunk
        assert "removeEventListener('sg-vault-synced'" in chunk


class test__sg_bridge__wave2__syncRefresh_bridge_action(TestCase):
    """Ask 4 — bridge wiring for sg.sync.refresh() / syncRefresh action."""

    @classmethod
    def setUpClass(cls):
        cls.src = file_contents(SEND_BROWSE)

    def test__syncRefresh_action_handled(self):
        assert "gitAction === 'syncRefresh'" in self.src

    def test__syncRefresh_calls_refresh_in_place(self):
        idx   = self.src.index("gitAction === 'syncRefresh'")
        chunk = self.src[idx:idx+800]
        assert '_refreshInPlace()' in chunk

    def test__syncRefresh_refreshes_filelist(self):
        idx   = self.src.index("gitAction === 'syncRefresh'")
        chunk = self.src[idx:idx+800]
        assert 'getFileList()' in chunk

    def test__syncRefresh_returns_from_to_filesChanged(self):
        idx   = self.src.index("gitAction === 'syncRefresh'")
        chunk = self.src[idx:idx+1200]
        assert 'from:'         in chunk
        assert 'to:'           in chunk
        assert 'filesChanged:' in chunk

    def test__syncRefresh_guards_shell_not_available(self):
        idx   = self.src.index("gitAction === 'syncRefresh'")
        chunk = self.src[idx:idx+300]
        assert '_refreshInPlace' in chunk
        assert 'Shell does not support' in chunk


# ─── Follow-ups (brief gaps) ──────────────────────────────────────────────────

class test__sg_bridge__followup__list_strict(TestCase):
    """sg.vfs.list must reject ENOENT for non-existent paths (brief priority #3)."""

    @classmethod
    def setUpClass(cls):
        cls.src = file_contents(SEND_BROWSE)

    def test__list_handler_returns_enoent_on_empty_match(self):
        idx   = self.src.index('e.data.__sgVfsListReq')
        chunk = self.src[idx:idx+1500]
        assert "err: 'ENOENT'" in chunk
        assert 'filtered.length === 0' in chunk

    def test__list_handler_normalises_trailing_slash(self):
        idx   = self.src.index('e.data.__sgVfsListReq')
        chunk = self.src[idx:idx+1500]
        assert 'normPrefix' in chunk

    def test__iframe_list_translates_enoent(self):
        idx   = self.src.index("'function _list(path){")
        chunk = self.src[idx:idx+500]
        assert 'ENOENT' in chunk
        assert 'No such path' in chunk


class test__sg_bridge__followup__last_synced_at(TestCase):
    """sg.sync.status() must include lastSyncedAt (brief example object)."""

    @classmethod
    def setUpClass(cls):
        cls.browse = file_contents(SEND_BROWSE)
        cls.shell  = file_contents(VAULT_SHELL)

    def test__shell_tracks_last_synced_at(self):
        assert 'this._lastSyncedAt = Date.now()' in self.shell

    def test__bridge_status_returns_lastCheckedAt(self):
        # Parent status response includes ISO-formatted lastCheckedAt
        assert 'lastCheckedAt: lastChecked' in self.browse
        assert '.toISOString()' in self.browse

    def test__sync_status_exposes_lastSyncedAt(self):
        idx   = self.browse.index("'sync:{'")
        chunk = self.browse[idx:idx+1000]
        assert 'lastSyncedAt' in chunk


class test__sg_bridge__followup__git_deprecation(TestCase):
    """sg.git.* must emit a one-shot deprecation warning recommending sg.sync."""

    @classmethod
    def setUpClass(cls):
        cls.src = file_contents(SEND_BROWSE)

    def test__sg_git_wrapped_in_iife(self):
        assert "'git:(function(){'" in self.src

    def test__sg_git_has_warn_helper(self):
        idx   = self.src.index("'git:(function(){'")
        chunk = self.src[idx:idx+1200]
        assert "var _warned=false" in chunk
        assert 'console.warn' in chunk
        assert 'sg.git.* is deprecated' in chunk

    def test__sg_git_warn_is_one_shot(self):
        idx   = self.src.index("'git:(function(){'")
        chunk = self.src[idx:idx+1200]
        # warn fires only when _warned is false, then sets _warned=true
        assert 'if(!_warned)' in chunk
        assert '_warned=true' in chunk

    def test__every_sg_git_method_calls_warn(self):
        idx   = self.src.index("'git:(function(){'")
        chunk = self.src[idx:idx+1500]
        # All 5 methods (status, check, push, pull, refresh) call _w()
        assert chunk.count('_w();') >= 5


class test__sg_bridge__followup__self_path_current_doc(TestCase):
    """sg.app.selfPath must reflect the CURRENT document after in-iframe nav."""

    @classmethod
    def setUpClass(cls):
        cls.src = file_contents(SEND_BROWSE)

    def test__bridge_script_is_a_function(self):
        # vfsBridgeScript built per-document, not a single static string
        assert 'var _buildVfsBridgeScript = function(currentPath)' in self.src

    def test__selfPath_uses_currentPath_parameter(self):
        assert "'selfPath:'   + JSON.stringify(currentPath)" in self.src

    def test__initial_build_uses_entry_filename(self):
        assert 'var vfsBridgeScript = _buildVfsBridgeScript(fileName);' in self.src

    def test__nav_rebuilds_bridge_with_new_path(self):
        # When navigating to a new file, the bridge is rebuilt with navMatch.path
        idx   = self.src.index('e.data.__sgVfsNavReq')
        chunk = self.src[idx:idx+3000]
        assert '_buildVfsBridgeScript(navMatch.path)' in chunk

    def test__no_stale_vfsBridgeScript_reference_in_nav(self):
        # The old bug: nav handler used the cached vfsBridgeScript with stale path.
        # After the fix, nav must use the rebuilt navBridge — never the cached one.
        nav_idx = self.src.index('e.data.__sgVfsNavReq')
        # Find the end of the nav handler block (closing 'return;' after the body)
        nav_end = self.src.index('return;\n                    }', nav_idx)
        nav_chunk = self.src[nav_idx:nav_end]
        assert 'navBridge' in nav_chunk
        # The cached vfsBridgeScript must not be referenced inside the nav body
        assert "+ vfsBridgeScript)" not in nav_chunk

