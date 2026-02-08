import sgraph_ai_app_send
from unittest                          import TestCase
from osbot_utils.utils.Files           import parent_folder, file_name
from sgraph_ai_app_send.utils.Version  import version__sgraph_ai_app_send, Version


class test_Version(TestCase):

    @classmethod
    def setUpClass(cls):
        cls.version = Version()

    def test_path_code_root(self):
        assert self.version.path_code_root() == sgraph_ai_app_send.path

    def test_path_version_file(self):
        with self.version as _:
            assert parent_folder(_.path_version_file()) == sgraph_ai_app_send.path
            assert file_name    (_.path_version_file()) == 'version'

    def test_value(self):
        assert self.version.value() == version__sgraph_ai_app_send