import tempfile
from unittest                                                                    import TestCase
from sgraph_ai_app_send.lambda__user.storage.Storage_FS__Local_Disk              import Storage_FS__Local_Disk


class test_Storage_FS__Local_Disk(TestCase):

    def setUp(self):
        self.tmp     = tempfile.mkdtemp()
        self.storage = Storage_FS__Local_Disk(root_path=self.tmp)

    def test__folder__files__all__returns_files_under_prefix(self):
        self.storage.file__save('vaults/abc/manifest.json'       , b'{}')
        self.storage.file__save('vaults/abc/refs/ref-1/payload'  , b'a' )
        self.storage.file__save('vaults/abc/refs/ref-2/payload'  , b'b' )
        self.storage.file__save('vaults/xyz/manifest.json'       , b'{}')

        files = self.storage.folder__files__all('vaults/abc')
        assert sorted(str(p) for p in files) == [ 'vaults/abc/manifest.json'      ,
                                                  'vaults/abc/refs/ref-1/payload' ,
                                                  'vaults/abc/refs/ref-2/payload' ]

    def test__folder__files__all__returns_empty_for_missing_prefix(self):
        self.storage.file__save('vaults/abc/manifest.json', b'{}')
        assert self.storage.folder__files__all('vaults/missing') == []

    def test__folder__files__all__prefix_isolation(self):
        # 'vaults/ab' must NOT match 'vaults/abc/...'
        self.storage.file__save('vaults/abc/file.txt', b'a')
        self.storage.file__save('vaults/ab/file.txt' , b'b')
        files = self.storage.folder__files__all('vaults/ab')
        assert [str(p) for p in files] == ['vaults/ab/file.txt']

    def test__folder__folders__returns_first_level_subfolders(self):
        self.storage.file__save('vaults/abc/refs/ref-1/payload', b'a')
        self.storage.file__save('vaults/abc/refs/ref-2/payload', b'b')
        self.storage.file__save('vaults/abc/manifest.json'     , b'{}')

        folders = self.storage.folder__folders('vaults/abc', return_full_path=False)
        assert sorted(str(f) for f in folders) == ['refs']
