import sgraph_ai_app_send
from osbot_utils.type_safe.primitives.domains.common.safe_str.Safe_Str__Version import Safe_Str__Version
from osbot_utils.type_safe.Type_Safe                                            import Type_Safe
from osbot_utils.utils.Files                                                    import file_contents, path_combine

class Version(Type_Safe):

    FILE_NAME_VERSION = 'version'

    def path_code_root(self):
        return sgraph_ai_app_send.path

    def path_version_file(self):
        return path_combine(self.path_code_root(), self.FILE_NAME_VERSION)

    def value(self):
        version = file_contents(self.path_version_file()) or ""
        return Safe_Str__Version(version)

version__sgraph_ai_app_send = Version().value()