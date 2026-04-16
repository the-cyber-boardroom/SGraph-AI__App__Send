# ===============================================================================
# SGraph Send - Routes__Vault__Zip Tests
# Vault zip download endpoint via the shared FastAPI test client
# ===============================================================================

import zipfile
import io
from   unittest                                                                  import TestCase
from   tests.unit.lambda__user.Fast_API__Test_Objs__SGraph__App__Send__User      import setup__fast_api__user__test_objs

VAULT_ID  = 'ziproutevlt01'
WRITE_KEY = 'deadbeef1234567890abcdef'


class test_Routes__Vault__Zip(TestCase):

    @classmethod
    def setUpClass(cls):
        with setup__fast_api__user__test_objs() as _:
            cls.client = _.fast_api__client

    def _write(self, vault_id=VAULT_ID, file_id='file-1', payload=b'encrypted-data', write_key=WRITE_KEY):
        return self.client.put(f'/api/vault/write/{vault_id}/{file_id}',
                               content = payload,
                               headers = {'content-type'              : 'application/octet-stream',
                                          'x-sgraph-vault-write-key'  : write_key                 })

    def _zip(self, vault_id=VAULT_ID, write_key=WRITE_KEY):
        return self.client.get(f'/api/vault/zip/{vault_id}',
                               headers = {'x-sgraph-vault-write-key': write_key})

    # --- Happy path ---

    def test__zip__single_file(self):
        vault = 'zipsingle001'
        self._write(vault_id=vault, file_id='doc.txt', payload=b'hello')
        response = self._zip(vault_id=vault)
        assert response.status_code == 200
        assert response.headers['content-type'] == 'application/zip'

        with zipfile.ZipFile(io.BytesIO(response.content)) as zf:
            assert 'doc.txt' in zf.namelist()
            assert zf.read('doc.txt') == b'hello'

    def test__zip__multiple_files(self):
        vault = 'zipmulti0001'
        self._write(vault_id=vault, file_id='a.txt', payload=b'aaa')
        self._write(vault_id=vault, file_id='b.txt', payload=b'bbb')
        self._write(vault_id=vault, file_id='c.txt', payload=b'ccc')

        response = self._zip(vault_id=vault)
        assert response.status_code == 200

        with zipfile.ZipFile(io.BytesIO(response.content)) as zf:
            assert sorted(zf.namelist()) == ['a.txt', 'b.txt', 'c.txt']
            assert zf.read('a.txt') == b'aaa'
            assert zf.read('b.txt') == b'bbb'
            assert zf.read('c.txt') == b'ccc'

    # --- Auth ---

    def test__zip__missing_write_key(self):
        response = self.client.get(f'/api/vault/zip/{VAULT_ID}')
        assert response.status_code == 400

    def test__zip__wrong_write_key(self):
        vault = 'zipwrongkey01'
        self._write(vault_id=vault, file_id='doc.txt', payload=b'data')
        response = self._zip(vault_id=vault, write_key='wrong-key')
        assert response.status_code == 403

    # --- Vault not found ---

    def test__zip__vault_not_found(self):
        response = self._zip(vault_id='noexistzvlt01')
        assert response.status_code == 404

    # --- Cache: second download uses cache ---

    def test__zip__cache_hit(self):
        vault = 'zipcache0001'
        self._write(vault_id=vault, file_id='cached.txt', payload=b'cached-data')

        response_1 = self._zip(vault_id=vault)
        response_2 = self._zip(vault_id=vault)

        assert response_1.status_code == 200
        assert response_2.status_code == 200
        assert response_1.content     == response_2.content                    # Same zip bytes
