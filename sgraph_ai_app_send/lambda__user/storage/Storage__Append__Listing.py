# ===============================================================================
# SGraph Send - Append lane listing (bounded)
# Counting, paging, lane discovery and copy for append lanes. On S3 these use the
# backend's bounded fast paths (early stop, StartAfter, Delimiter, CopyObject), so
# a request costs what it asks for, not the size of the lane. Every other backend
# (memory, disk) uses the generic Storage_FS methods, with identical results.
# ===============================================================================

from memory_fs.storage_fs.Storage_FS                                            import Storage_FS
from osbot_utils.type_safe.Type_Safe                                            import Type_Safe


class Storage__Append__Listing(Type_Safe):
    storage_fs : Storage_FS = None

    def _has(self, method_name):
        return callable(getattr(self.storage_fs, method_name, None))

    @staticmethod
    def _name(path):                                                             # last path segment of a listed file
        return str(path).rstrip('/').rsplit('/', 1)[-1]

    def count_up_to(self, folder, up_to):                                        # number of files in folder, capped at up_to (enough for a capacity check)
        if self._has('folder__files__count'):
            return self.storage_fs.folder__files__count(folder, up_to)
        return min(len(self.storage_fs.folder__files__all(folder)), up_to)

    def page(self, folder, start_after=None, max_keys=1000):                     # file names in key order, strictly after start_after, at most max_keys
        if self._has('folder__files__page'):
            return self.storage_fs.folder__files__page(folder, start_after=start_after, max_keys=max_keys)
        names = sorted(self._name(path) for path in self.storage_fs.folder__files__all(folder))
        if start_after:
            names = [name for name in names if name > start_after]
        return names[:max_keys]

    def subfolder_names(self, folder):                                           # immediate subfolder names
        if self._has('folder__subfolder_names'):
            return self.storage_fs.folder__subfolder_names(folder)
        return sorted(self._name(path) for path in self.storage_fs.folder__folders(folder))

    def copy(self, source_path, target_path):                                    # copy one file (server-side on S3)
        if self._has('file__copy'):
            return self.storage_fs.file__copy(source_path, target_path)
        file_bytes = self.storage_fs.file__bytes(source_path)
        if file_bytes is None:
            return False
        self.storage_fs.file__save(target_path, file_bytes)
        return True
