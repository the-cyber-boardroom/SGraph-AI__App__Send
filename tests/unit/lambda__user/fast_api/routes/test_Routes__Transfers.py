# ===============================================================================
# SGraph Send - Routes__Transfers Tests
# Full transfer API lifecycle via the shared FastAPI test client
# ===============================================================================

from unittest                                                                    import TestCase
from tests.unit.lambda__user.Fast_API__Test_Objs__SGraph__App__Send__User        import setup__fast_api__user__test_objs


class test_Routes__Transfers(TestCase):

    @classmethod
    def setUpClass(cls):
        with setup__fast_api__user__test_objs() as _:
            cls.client = _.fast_api__client

    def test__create_transfer(self):
        response = self.client.post('/transfers/create',
                                    json=dict(file_size_bytes   = 2048,
                                              content_type_hint = 'text/plain'))
        assert response.status_code           == 200
        data = response.json()
        assert 'transfer_id'                   in data
        assert 'upload_url'                    in data
        assert len(data['transfer_id'])        == 12

    def test__upload_payload(self):
        create = self.client.post('/transfers/create',
                                  json=dict(file_size_bytes = 4)).json()
        tid      = create['transfer_id']
        response = self.client.post(f'/transfers/upload/{tid}',
                                    content = b'\xde\xad\xbe\xef',
                                    headers = {'content-type': 'application/octet-stream'})
        assert response.status_code           == 200
        data = response.json()
        assert data['status']                  == 'uploaded'
        assert data['size']                    == 4

    def test__upload_payload__not_found(self):
        response = self.client.post('/transfers/upload/nonexistent',
                                    content = b'data',
                                    headers = {'content-type': 'application/octet-stream'})
        assert response.status_code           == 404

    def test__complete_transfer(self):
        create = self.client.post('/transfers/create',
                                  json=dict(file_size_bytes = 8)).json()
        tid = create['transfer_id']
        self.client.post(f'/transfers/upload/{tid}',
                         content = b'\x00' * 8,
                         headers = {'content-type': 'application/octet-stream'})
        response = self.client.post(f'/transfers/complete/{tid}')
        assert response.status_code           == 200
        data = response.json()
        assert data['transfer_id']             == tid
        assert 'download_url'                  in data
        assert 'transparency'                  in data

    def test__transfer_info(self):
        create = self.client.post('/transfers/create',
                                  json=dict(file_size_bytes = 512)).json()
        tid      = create['transfer_id']
        response = self.client.get(f'/transfers/info/{tid}')
        assert response.status_code           == 200
        data = response.json()
        assert data['transfer_id']             == tid
        assert data['status']                  == 'pending'
        assert data['file_size_bytes']         == 512

    def test__transfer_info__not_found(self):
        response = self.client.get('/transfers/info/nonexistent')
        assert response.status_code           == 404

    def test__download_payload(self):
        payload = b'\x89PNG\x00\x01\x02\x03'
        create  = self.client.post('/transfers/create',
                                   json=dict(file_size_bytes = len(payload))).json()
        tid = create['transfer_id']
        self.client.post(f'/transfers/upload/{tid}',
                         content = payload,
                         headers = {'content-type': 'application/octet-stream'})
        self.client.post(f'/transfers/complete/{tid}')

        response = self.client.get(f'/transfers/download/{tid}')
        assert response.status_code           == 200
        assert response.content               == payload
        assert response.headers['content-type'] == 'application/octet-stream'

    def test__download_payload__not_found(self):
        response = self.client.get('/transfers/download/nonexistent')
        assert response.status_code           == 404

    def test__full_flow(self):
        payload = b'encrypted_file_content_here'

        # Create
        create   = self.client.post('/transfers/create',
                                    json=dict(file_size_bytes   = len(payload),
                                              content_type_hint = 'application/pdf')).json()
        tid = create['transfer_id']
        assert len(tid) == 12

        # Upload
        upload   = self.client.post(f'/transfers/upload/{tid}',
                                    content = payload,
                                    headers = {'content-type': 'application/octet-stream'}).json()
        assert upload['status'] == 'uploaded'

        # Complete
        complete = self.client.post(f'/transfers/complete/{tid}').json()
        assert complete['transfer_id']           == tid
        assert 'raw_ip' in complete['transparency']['not_stored']

        # Info
        info     = self.client.get(f'/transfers/info/{tid}').json()
        assert info['status']                    == 'completed'
        assert info['download_count']            == 0

        # Download
        download = self.client.get(f'/transfers/download/{tid}')
        assert download.content                  == payload

        # Download count incremented
        info     = self.client.get(f'/transfers/info/{tid}').json()
        assert info['download_count']            == 1
