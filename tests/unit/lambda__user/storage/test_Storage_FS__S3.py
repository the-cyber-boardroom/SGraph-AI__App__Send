# ===============================================================================
# Tests — Storage_FS__S3 (structural)
# B-1 regression: the S3 backend MUST override folder__folders. The base
# Storage_FS.folder__folders is a `return []` stub — if S3 inherits it,
# inbox_list(inbox=None) silently returns empty on Lambda/S3 even when the
# inbox is full. Behavioural coverage requires LocalStack; this locks the
# structural contract without needing S3 connectivity.
# ===============================================================================

from unittest                                                        import TestCase
from memory_fs.storage_fs.Storage_FS                                 import Storage_FS
from sgraph_ai_app_send.lambda__user.storage.Storage_FS__S3          import Storage_FS__S3


class test_Storage_FS__S3(TestCase):

    def test__folder__folders__is_overridden(self):                             # must NOT inherit the base `return []` stub
        assert Storage_FS__S3.folder__folders is not Storage_FS.folder__folders

    def test__folder__files__all__is_overridden(self):                          # the scoped-list the inbox depends on
        assert Storage_FS__S3.folder__files__all is not Storage_FS.folder__files__all
