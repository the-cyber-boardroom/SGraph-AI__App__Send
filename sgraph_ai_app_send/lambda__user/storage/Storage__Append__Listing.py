# ===============================================================================
# SGraph Send - Append lane storage helpers (bounded)
# Counting, paging, usage, lane discovery, copy and conditional config writes for
# append lanes. On S3 these use the backend's bounded fast paths (early stop,
# StartAfter, Delimiter, CopyObject with tagging, If-Match / If-None-Match), so a
# request costs what it asks for, not the size of the lane. Every other backend
# (memory, disk) uses the generic Storage_FS methods, with identical results.
# ===============================================================================

import hashlib
import threading
from   memory_fs.storage_fs.Storage_FS                                          import Storage_FS
from   osbot_utils.type_safe.Type_Safe                                          import Type_Safe

_GENERIC_WRITE_LOCK = threading.Lock()                                           # conditional writes on memory/disk: one process, one lock


class Storage__Append__Listing(Type_Safe):
    storage_fs : Storage_FS = None

    def _has(self, method_name):
        return callable(getattr(self.storage_fs, method_name, None))

    def is_s3(self):                                                             # S3 enforces retention by lifecycle; other backends sweep on access
        return self._has('folder__files__usage')

    @staticmethod
    def _name(path):                                                             # last path segment of a listed file
        return str(path).rstrip('/').rsplit('/', 1)[-1]

    def count_up_to(self, folder, up_to):                                        # number of files in folder, capped at up_to (enough for a capacity check)
        if self._has('folder__files__count'):
            return self.storage_fs.folder__files__count(folder, up_to)
        return min(len(self.storage_fs.folder__files__all(folder)), up_to)

    def usage(self, folder, up_to):                                              # count, bytes, first and last names of up to up_to files, in key order
        if self._has('folder__files__usage'):
            return self.storage_fs.folder__files__usage(folder, up_to)
        names = sorted(self._name(path) for path in self.storage_fs.folder__files__all(folder))[:up_to]
        size  = 0
        for name in names:
            size += len(self.storage_fs.file__bytes(f'{str(folder).rstrip("/")}/{name}') or b'')
        return dict(count=len(names), bytes=size, first=names[0] if names else None, last=names[-1] if names else None)

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

    def copy(self, source_path, target_path, tags=None):                         # copy one file (server-side on S3); tags: None = keep, {} = clear, {k: v} = replace
        if self._has('file__copy'):
            return self.storage_fs.file__copy(source_path, target_path, tags=tags)
        file_bytes = self.storage_fs.file__bytes(source_path)
        if file_bytes is None:
            return False
        self.storage_fs.file__save(target_path, file_bytes)                      # memory/disk have no object tags: retention is swept on access instead
        return True

    # --- blobs (v2 Phase 3) ---------------------------------------------------------------

    def sizes(self, folder, up_to):                                              # [(name relative to folder, size)] in key order, at most up_to
        if self._has('folder__files__sizes'):
            return self.storage_fs.folder__files__sizes(folder, up_to)
        prefix = str(folder).rstrip('/') + '/'
        items  = []
        for path in sorted(str(path) for path in self.storage_fs.folder__files__all(folder)):
            if path.startswith(prefix):
                items.append((path[len(prefix):], len(self.storage_fs.file__bytes(path) or b'')))
        return items[:up_to]

    def save_tagged(self, path, data, tags):                                     # tags only exist on S3; elsewhere the service sweeps expired reservations itself
        if self._has('file__save__tagged'):
            return self.storage_fs.file__save__tagged(path, data, tags)
        return self.storage_fs.file__save(path, data)

    def can_presign(self):                                                       # presigned URLs need S3 (memory/disk answer 501 presigned_not_available)
        return self._has('presigned__put')

    def presign_put(self, path, size, checksum_sha256_b64, tags, expires_in):
        return self.storage_fs.presigned__put(path, size, checksum_sha256_b64, tags, expires_in)

    def presign_get(self, path, expires_in):
        return self.storage_fs.presigned__get(path, expires_in)

    # --- conditional writes (config.json) -----------------------------------------------

    def read_versioned(self, path):                                              # (bytes, version) — version is the S3 etag, or a content hash elsewhere
        if self._has('file__bytes__versioned'):
            return self.storage_fs.file__bytes__versioned(path)
        data = self.storage_fs.file__bytes(path)
        return (data, hashlib.sha256(data).hexdigest()) if data is not None else (None, None)

    def write_if_version(self, path, data, version):                             # True if written; False if someone else wrote first
        if self._has('file__save__if_version'):
            return self.storage_fs.file__save__if_version(path, data, version)
        with _GENERIC_WRITE_LOCK:
            current = self.storage_fs.file__bytes(path)
            current_version = hashlib.sha256(current).hexdigest() if current is not None else None
            if current_version != version:
                return False
            self.storage_fs.file__save(path, data)
            return True
