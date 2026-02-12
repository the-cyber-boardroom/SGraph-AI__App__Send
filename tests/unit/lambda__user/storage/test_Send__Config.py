# ===============================================================================
# SGraph Send - Send__Config Tests
# Verify storage mode detection and backend creation
# ===============================================================================

from unittest                                                                    import TestCase
from memory_fs.storage_fs.providers.Storage_FS__Memory                           import Storage_FS__Memory
from sgraph_ai_app_send.lambda__user.storage.Enum__Storage__Mode                 import Enum__Storage__Mode
from sgraph_ai_app_send.lambda__user.storage.Send__Config                        import Send__Config


class test_Send__Config(TestCase):

    def test__determine_storage_mode__defaults_to_memory(self):
        config = Send__Config()
        assert config.storage_mode == Enum__Storage__Mode.MEMORY

    def test__create_storage_backend__returns_memory(self):
        config  = Send__Config()
        backend = config.create_storage_backend()
        assert type(backend) is Storage_FS__Memory

    def test__explicit_memory_mode(self):
        config = Send__Config(storage_mode=Enum__Storage__Mode.MEMORY)
        assert config.storage_mode == Enum__Storage__Mode.MEMORY
        backend = config.create_storage_backend()
        assert type(backend) is Storage_FS__Memory

    def test__has_aws_credentials__false_by_default(self):
        config = Send__Config()
        assert config.has_aws_credentials() is False

    def test__s3_bucket__none_in_memory_mode(self):
        config = Send__Config()
        assert config.s3_bucket is None

    def test__storage_backend__is_functional(self):
        config  = Send__Config()
        backend = config.create_storage_backend()
        backend.file__save('test/file.txt', b'hello')
        assert backend.file__exists('test/file.txt') is True
        assert backend.file__bytes('test/file.txt')  == b'hello'
