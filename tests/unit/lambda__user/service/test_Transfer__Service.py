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
        assert result['upload_url'].startswith('/transfers/upload/')

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
