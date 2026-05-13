from typing                                                                         import List
from osbot_utils.type_safe.primitives.domains.files.safe_str.Safe_Str__File__Path   import Safe_Str__File__Path
from memory_fs.storage_fs.providers.Storage_FS__Local_Disk                          import Storage_FS__Local_Disk as Storage_FS__Local_Disk__Upstream


# Local patch: upstream Storage_FS__Local_Disk raises NotImplementedError for
# folder__files__all and folder__folders. The vault listing route depends on
# folder__files__all, so disk mode is unusable until upstream lands these.
# Remove this subclass once memory-fs ships them.
class Storage_FS__Local_Disk(Storage_FS__Local_Disk__Upstream):

    def folder__files__all(self, parent_folder: Safe_Str__File__Path) -> List[Safe_Str__File__Path]:
        prefix = str(parent_folder)
        if prefix and not prefix.endswith('/'):
            prefix += '/'
        matching = []
        for path in self.files__paths():
            if str(path).startswith(prefix):
                matching.append(path)
        return sorted(matching)

    def folder__folders(self, parent_folder   : Safe_Str__File__Path ,
                              return_full_path: bool = True
                         ) -> List[Safe_Str__File__Path]:
        prefix  = str(parent_folder)
        is_root = not prefix or prefix == '/'
        if not is_root and not prefix.endswith('/'):
            prefix += '/'

        subfolders = set()
        for path in self.files__paths():
            path_str = str(path)
            if not is_root and not path_str.startswith(prefix):
                continue
            remainder = path_str if is_root else path_str[len(prefix):]
            parts     = remainder.split('/')
            if len(parts) <= 1:
                continue
            first = parts[0]
            if not first:
                continue
            if return_full_path:
                subfolders.add(Safe_Str__File__Path(f'{prefix}{first}' if not is_root else first))
            else:
                subfolders.add(Safe_Str__File__Path(first))
        return sorted(subfolders)
