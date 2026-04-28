# ===============================================================================
# SGraph Send - Transfer__Service Tests
# Full service lifecycle: create, upload, complete, info, download
# ===============================================================================

from unittest                                                                    import TestCase
from sgraph_ai_app_send.lambda__user.service.Transfer__Service                   import Transfer__Service


class test_Transfer__Service(TestCase):

    def setUp(self):
        self.service = Transfer__Service()

    def test__create_transfer(self):
        result = self.service.create_transfer(file_size_bytes   = 2048,
                                               content_type_hint = 'text/plain',
                                               sender_ip        = '127.0.0.1')
        assert 'transfer_id' in result
        assert 'upload_url'  in result
        assert len(result['transfer_id'])         == 12
        assert result['upload_url'].startswith('/api/transfers/upload/')

    def test__upload_payload(self):
        result  = self.service.create_transfer(file_size_bytes = 100, content_type_hint = '', sender_ip = '')
        tid     = result['transfer_id']
        payload = b'\x00\x01\x02\x03'
        success = self.service.upload_payload(transfer_id  = tid    ,
                                              payload_bytes = payload)
        assert success is True

    def test__upload_payload__not_found(self):
        success = self.service.upload_payload(transfer_id  = 'nonexistent',
                                              payload_bytes = b'data'      )
        assert success is False

    def test__complete_transfer(self):
        result  = self.service.create_transfer(file_size_bytes = 100, content_type_hint = '', sender_ip = '')
        tid     = result['transfer_id']
        self.service.upload_payload(transfer_id = tid, payload_bytes = b'encrypted')
        complete = self.service.complete_transfer(tid)

        assert complete is not None
        assert complete['transfer_id']  == tid
        assert 'download_url'           in complete
        assert 'transparency'           in complete
        assert 'stored_fields'          in complete['transparency']
        assert 'not_stored'             in complete['transparency']

    def test__complete_transfer__no_payload(self):
        result   = self.service.create_transfer(file_size_bytes = 100, content_type_hint = '', sender_ip = '')
        complete = self.service.complete_transfer(result['transfer_id'])
        assert complete is None

    def test__get_transfer_info(self):
        result  = self.service.create_transfer(file_size_bytes = 512, content_type_hint = '', sender_ip = '')
        tid     = result['transfer_id']
        info    = self.service.get_transfer_info(tid)

        assert info['transfer_id']      == tid
        assert info['status']            == 'pending'
        assert info['file_size_bytes']   == 512
        assert info['download_count']    == 0
        assert 'created_at'              in info

    def test__get_transfer_info__not_found(self):
        info = self.service.get_transfer_info('nonexistent')
        assert info is None

    def test__get_download_payload(self):
        result  = self.service.create_transfer(file_size_bytes = 4, content_type_hint = '', sender_ip = '')
        tid     = result['transfer_id']
        payload = b'\xde\xad\xbe\xef'
        self.service.upload_payload(transfer_id = tid, payload_bytes = payload)
        self.service.complete_transfer(tid)

        downloaded = self.service.get_download_payload(transfer_id  = tid          ,
                                                       downloader_ip = '10.0.0.1'  ,
                                                       user_agent    = 'test-agent')
        assert downloaded == payload

    def test__get_download_payload__increments_count(self):
        result  = self.service.create_transfer(file_size_bytes = 4, content_type_hint = '', sender_ip = '')
        tid     = result['transfer_id']
        self.service.upload_payload(transfer_id = tid, payload_bytes = b'data')
        self.service.complete_transfer(tid)

        self.service.get_download_payload(transfer_id = tid, downloader_ip = '', user_agent = '')
        self.service.get_download_payload(transfer_id = tid, downloader_ip = '', user_agent = '')
        info = self.service.get_transfer_info(tid)
        assert info['download_count']    == 2

    def test__get_download_payload__not_completed(self):
        result  = self.service.create_transfer(file_size_bytes = 4, content_type_hint = '', sender_ip = '')
        tid     = result['transfer_id']
        self.service.upload_payload(transfer_id = tid, payload_bytes = b'data')
        # NOT completed
        downloaded = self.service.get_download_payload(transfer_id = tid, downloader_ip = '', user_agent = '')
        assert downloaded is None

    def test__ip_hashing(self):
        hash_1 = self.service.hash_ip('127.0.0.1')
        hash_2 = self.service.hash_ip('127.0.0.1')
        hash_3 = self.service.hash_ip('10.0.0.1')
        assert hash_1 == hash_2                                                  # Deterministic
        assert hash_1 != hash_3                                                  # Different IPs differ
        assert len(hash_1) == 64                                                 # SHA-256 hex length

    def test__user_agent_hashing(self):
        ua      = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'
        hash_1  = self.service.hash_user_agent(ua)
        hash_2  = self.service.hash_user_agent(ua)
        hash_ua = self.service.hash_user_agent('curl/7.88.0')
        assert hash_1 == hash_2                                                  # Deterministic
        assert hash_1 != hash_ua                                                 # Different agents differ
        assert len(hash_1) == 64                                                 # SHA-256 hex length

    def test__download_event_hashes_user_agent(self):
        result  = self.service.create_transfer(file_size_bytes = 4, content_type_hint = '', sender_ip = '')
        tid     = result['transfer_id']
        self.service.upload_payload(transfer_id = tid, payload_bytes = b'data')
        self.service.complete_transfer(tid)
        self.service.get_download_payload(transfer_id = tid, downloader_ip = '', user_agent = 'raw-agent-string')
        meta = self.service.load_meta(tid)
        download_event = next(e for e in meta['events'] if e['action'] == 'download')
        assert download_event['user_agent'] != 'raw-agent-string'                # Raw string never stored
        assert len(download_event['user_agent']) == 64                           # SHA-256 hex

    # --- max_downloads enforcement ---

    def test__create__with_max_downloads(self):
        result = self.service.create_transfer(file_size_bytes = 4, content_type_hint = '',
                                               sender_ip = '', max_downloads = 2)
        meta = self.service.load_meta(result['transfer_id'])
        assert meta['max_downloads'] == 2

    def test__download__respects_max_downloads(self):
        result  = self.service.create_transfer(file_size_bytes = 4, content_type_hint = '',
                                                sender_ip = '', max_downloads = 1)
        tid     = result['transfer_id']
        self.service.upload_payload(transfer_id = tid, payload_bytes = b'data')
        self.service.complete_transfer(tid)
        assert self.service.get_download_payload(tid, '', '') == b'data'         # First download succeeds
        second = self.service.get_download_payload(tid, '', '')
        assert isinstance(second, dict)
        assert second['status'] == 410
        assert second['error']  == 'exhausted'

    def test__download__unlimited_when_max_downloads_zero(self):
        result  = self.service.create_transfer(file_size_bytes = 4, content_type_hint = '',
                                                sender_ip = '', max_downloads = 0)
        tid     = result['transfer_id']
        self.service.upload_payload(transfer_id = tid, payload_bytes = b'data')
        self.service.complete_transfer(tid)
        for _ in range(5):
            assert self.service.get_download_payload(tid, '', '') == b'data'

    def test__download__auto_delete_after_last_download(self):
        result  = self.service.create_transfer(file_size_bytes = 4, content_type_hint = '',
                                                sender_ip = '', max_downloads = 1, auto_delete = True)
        tid     = result['transfer_id']
        self.service.upload_payload(transfer_id = tid, payload_bytes = b'data')
        self.service.complete_transfer(tid)
        assert self.service.get_download_payload(tid, '', '') == b'data'         # Last download succeeds
        assert not self.service.has_payload(tid)                                 # Payload wiped
        info = self.service.get_transfer_info(tid)
        assert info['status'] == 'exhausted'

    # --- expiry enforcement ---

    def test__create__with_expires_at(self):
        from datetime import datetime, timezone, timedelta
        future  = (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat()
        result  = self.service.create_transfer(file_size_bytes = 4, content_type_hint = '',
                                                sender_ip = '', expires_at = future)
        meta    = self.service.load_meta(result['transfer_id'])
        assert meta['expires_at'] == future

    def test__download__not_yet_expired(self):
        from datetime import datetime, timezone, timedelta
        future  = (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat()
        result  = self.service.create_transfer(file_size_bytes = 4, content_type_hint = '',
                                                sender_ip = '', expires_at = future)
        tid     = result['transfer_id']
        self.service.upload_payload(transfer_id = tid, payload_bytes = b'data')
        self.service.complete_transfer(tid)
        assert self.service.get_download_payload(tid, '', '') == b'data'

    def test__download__expired_transfer_returns_410(self):
        from datetime import datetime, timezone, timedelta
        past    = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
        result  = self.service.create_transfer(file_size_bytes = 4, content_type_hint = '',
                                                sender_ip = '', expires_at = past)
        tid     = result['transfer_id']
        self.service.upload_payload(transfer_id = tid, payload_bytes = b'data')
        self.service.complete_transfer(tid)
        resp = self.service.get_download_payload(tid, '', '')
        assert isinstance(resp, dict)
        assert resp['status'] == 410
        assert resp['error']  == 'expired'

    # --- delete_transfer ---

    def test__delete_transfer__success(self):
        import hashlib
        delete_auth = 'abc123deletekey'
        stored_hash = hashlib.sha256(delete_auth.encode()).hexdigest()
        result  = self.service.create_transfer(file_size_bytes = 4, content_type_hint = '',
                                                sender_ip = '', delete_auth_hash = stored_hash)
        tid     = result['transfer_id']
        self.service.upload_payload(transfer_id = tid, payload_bytes = b'data')
        self.service.complete_transfer(tid)
        resp = self.service.delete_transfer(tid, delete_auth)
        assert resp['status']      == 'deleted'
        assert resp['transfer_id'] == tid
        assert not self.service.has_payload(tid)

    def test__delete_transfer__wrong_auth(self):
        import hashlib
        delete_auth = 'correct_auth'
        stored_hash = hashlib.sha256(delete_auth.encode()).hexdigest()
        result  = self.service.create_transfer(file_size_bytes = 4, content_type_hint = '',
                                                sender_ip = '', delete_auth_hash = stored_hash)
        tid     = result['transfer_id']
        resp = self.service.delete_transfer(tid, 'wrong_auth')
        assert resp['error']  == 'auth_mismatch'
        assert resp['status'] == 403

    def test__delete_transfer__not_found(self):
        resp = self.service.delete_transfer('nonexistent', 'any_auth')
        assert resp['error']  == 'not_found'
        assert resp['status'] == 404

    def test__delete_transfer__delete_not_enabled(self):
        result  = self.service.create_transfer(file_size_bytes = 4, content_type_hint = '',
                                                sender_ip = '')                  # No delete_auth_hash
        resp = self.service.delete_transfer(result['transfer_id'], 'any_auth')
        assert resp['error']  == 'delete_not_enabled'
        assert resp['status'] == 409

    def test__delete_transfer__already_deleted_is_idempotent(self):
        import hashlib
        delete_auth = 'idempotent_key'
        stored_hash = hashlib.sha256(delete_auth.encode()).hexdigest()
        result  = self.service.create_transfer(file_size_bytes = 4, content_type_hint = '',
                                                sender_ip = '', delete_auth_hash = stored_hash)
        tid     = result['transfer_id']
        self.service.upload_payload(transfer_id = tid, payload_bytes = b'data')
        self.service.complete_transfer(tid)
        self.service.delete_transfer(tid, delete_auth)
        resp = self.service.delete_transfer(tid, delete_auth)                    # Second delete
        assert resp['status'] == 'already_deleted'

    # --- transfer_info new fields ---

    def test__transfer_info__includes_new_fields(self):
        from datetime import datetime, timezone, timedelta
        future  = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
        result  = self.service.create_transfer(file_size_bytes = 4, content_type_hint = '',
                                                sender_ip = '', max_downloads = 3, expires_at = future)
        info    = self.service.get_transfer_info(result['transfer_id'])
        assert info['max_downloads']       == 3
        assert info['expires_at']          == future
        assert info['downloads_remaining'] == 3
        assert info['is_expired']          is False

    def test__full_flow(self):
        # Create
        create = self.service.create_transfer(file_size_bytes   = 1024 ,
                                               content_type_hint = 'image/png',
                                               sender_ip        = '192.168.1.1')
        tid = create['transfer_id']
        assert len(tid) == 12

        # Info: pending
        info = self.service.get_transfer_info(tid)
        assert info['status'] == 'pending'

        # Upload
        payload = b'\x89PNG' + b'\x00' * 1020
        assert self.service.upload_payload(transfer_id = tid, payload_bytes = payload) is True

        # Complete
        complete = self.service.complete_transfer(tid)
        assert complete['transfer_id'] == tid

        # Info: completed
        info = self.service.get_transfer_info(tid)
        assert info['status']          == 'completed'
        assert info['download_count']  == 0

        # Download
        downloaded = self.service.get_download_payload(transfer_id  = tid        ,
                                                       downloader_ip = '10.0.0.2',
                                                       user_agent    = 'Chrome'  )
        assert downloaded == payload

        # Download count updated
        info = self.service.get_transfer_info(tid)
        assert info['download_count']  == 1
