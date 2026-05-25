# ===============================================================================
# SGraph Send - Transfer__Service: Public Vault Preview usage
# Confirms the transport contract the public-preview write path relies on, AND
# documents the delete-then-recreate constraint (the tombstone blocks recreate).
# ===============================================================================

import hashlib
from unittest                                                  import TestCase
from sgraph_ai_app_send.lambda__user.service.Transfer__Service import Transfer__Service


class test_Transfer__Service__public_preview(TestCase):

    def setUp(self):
        self.service = Transfer__Service()
        self.tid     = 'a1b2c3d4e5f6'                                   # deterministic 12-hex (derived from public-id)
        self.auth    = 'random-owner-held-delete-secret'
        self.hash    = hashlib.sha256(self.auth.encode()).hexdigest()

    def _publish(self, payload=b'cipher-bytes', max_downloads=0, expires_at=0, allow_recreate=False):
        self.service.create_transfer(file_size_bytes   = len(payload),
                                     content_type_hint = 'application/json',
                                     sender_ip         = '',
                                     transfer_id       = self.tid,
                                     delete_auth_hash  = self.hash,
                                     max_downloads     = max_downloads,
                                     expires_at        = expires_at,
                                     allow_recreate    = allow_recreate)
        self.service.upload_payload(self.tid, payload)
        self.service.complete_transfer(self.tid)

    # --- the happy path the write/read path depends on -------------------------
    def test__publish_and_download(self):
        self._publish(b'the-encrypted-preview')
        payload = self.service.get_download_payload(self.tid, '', '')
        assert payload == b'the-encrypted-preview'

    def test__client_provided_id_must_be_12_hex(self):
        bad = self.service.create_transfer(file_size_bytes=1, content_type_hint='', sender_ip='',
                                           transfer_id='NOT-HEX', delete_auth_hash=self.hash)
        assert bad == {'error': 'invalid_transfer_id_format'}

    # --- delete auth model ------------------------------------------------------
    def test__delete_requires_correct_auth(self):
        self._publish()
        assert self.service.delete_transfer(self.tid, 'wrong')['error']  == 'auth_mismatch'
        assert self.service.delete_transfer(self.tid, self.auth)['status'] == 'deleted'
        # payload gone; subsequent download not available
        assert self.service.get_download_payload(self.tid, '', '') is None

    # --- expiry (native) --------------------------------------------------------
    def test__max_downloads_exhausts(self):
        self._publish(max_downloads=1)
        assert self.service.get_download_payload(self.tid, '', '') == b'cipher-bytes'   # 1st ok
        gone = self.service.get_download_payload(self.tid, '', '')                       # 2nd exhausted
        assert isinstance(gone, dict) and gone.get('status') == 410

    # --- default (allow_recreate=False): delete leaves a tombstone; id NOT reusable
    def test__default_delete_leaves_tombstone(self):
        self._publish(allow_recreate=False)
        self.service.delete_transfer(self.tid, self.auth)
        assert self.service.has_transfer(self.tid) is True                              # meta tombstone remains
        recreate = self.service.create_transfer(file_size_bytes=1, content_type_hint='application/json',
                                                sender_ip='', transfer_id=self.tid, delete_auth_hash=self.hash)
        assert recreate == {'error': 'transfer_id_exists'}                              # cannot reuse the id

    # --- allow_recreate=True: delete clears the meta; delete-then-recreate works -----
    #     This is what the public-preview in-place update (same share link) relies on.
    def test__allow_recreate_enables_delete_then_recreate(self):
        self._publish(payload=b'v1-cipher', allow_recreate=True)
        result = self.service.delete_transfer(self.tid, self.auth)
        assert result.get('recreatable') is True
        assert self.service.has_transfer(self.tid) is False                             # meta cleared, not a tombstone
        # recreate at the SAME id with new content
        self._publish(payload=b'v2-cipher', allow_recreate=True)
        assert self.service.get_download_payload(self.tid, '', '') == b'v2-cipher'       # same id, updated content
