# ===============================================================================
# Tests — Storage_FS__S3 (structural)
# B-1 regression: the S3 backend MUST override folder__folders. The base
# Storage_FS.folder__folders is a `return []` stub — if S3 inherits it,
# inbox_list(inbox=None) silently returns empty on Lambda/S3 even when the
# inbox is full. Behavioural coverage requires LocalStack; this locks the
# structural contract without needing S3 connectivity.
# ===============================================================================

import inspect
from unittest                                                        import TestCase
from botocore.exceptions                                             import ClientError
from memory_fs.storage_fs.Storage_FS                                 import Storage_FS
from sgraph_ai_app_send.lambda__user.storage.Storage_FS__S3          import Storage_FS__S3


class test_Storage_FS__S3(TestCase):

    def test__folder__folders__is_overridden(self):                             # must NOT inherit the base `return []` stub
        assert Storage_FS__S3.folder__folders is not Storage_FS.folder__folders

    def test__folder__files__all__is_overridden(self):                          # the scoped-list the inbox depends on
        assert Storage_FS__S3.folder__files__all is not Storage_FS.folder__files__all

    # --- catch-404 reads (V-1): single GetObject, no pre-HeadObject -------------

    def test___is_not_found__classifies_client_errors(self):                    # missing-key → None; real failures must propagate
        not_found = ClientError({'Error': {'Code': 'NoSuchKey'   }}, 'GetObject')
        no_bucket = ClientError({'Error': {'Code': 'NoSuchBucket'}}, 'GetObject')
        real_fail = ClientError({'Error': {'Code': 'AccessDenied'}}, 'GetObject')
        assert Storage_FS__S3._is_not_found(not_found) is True
        assert Storage_FS__S3._is_not_found(no_bucket) is True
        assert Storage_FS__S3._is_not_found(real_fail) is False                  # propagates — must NOT be silently turned into None

    def test__reads__do_not_pre_head(self):                                     # regression guard: the pre-`file__exists` HeadObject is gone
        assert 'file__exists' not in inspect.getsource(Storage_FS__S3.file__bytes)
        assert 'file__exists' not in inspect.getsource(Storage_FS__S3.file__str)
        assert 'ClientError'  in     inspect.getsource(Storage_FS__S3.file__bytes)   # the catch-404 path is present
