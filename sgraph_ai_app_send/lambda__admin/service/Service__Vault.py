# ===============================================================================
# SGraph Send - Vault Service
# Vault lifecycle: create, lookup, folder/file/index CRUD
# Uses Send__Cache__Client__Vault for all cache operations
# ===============================================================================

import secrets
from   datetime                                                                    import datetime, timezone
from   osbot_utils.type_safe.Type_Safe                                            import Type_Safe
from   sgraph_ai_app_send.lambda__admin.service.Send__Cache__Client__Vault        import Send__Cache__Client__Vault


class Service__Vault(Type_Safe):                                               # Vault lifecycle management
    vault_cache_client : Send__Cache__Client__Vault                            # Dedicated vault cache client

    # ═══════════════════════════════════════════════════════════════════════
    # Vault Lifecycle
    # ═══════════════════════════════════════════════════════════════════════

    def create(self, vault_cache_key, key_fingerprint=''):                     # Create a new vault with root folder
        existing = self.vault_cache_client.vault__lookup_cache_id(vault_cache_key)
        if existing:
            return None                                                        # Vault already exists

        root_folder_guid = secrets.token_hex(4)                                # 8-hex GUID for root folder

        manifest = dict(type            = 'vault_root'                             ,
                        created         = datetime.now(timezone.utc).isoformat()   ,
                        key_fingerprint = key_fingerprint                           ,
                        root_folder     = root_folder_guid                         )

        result = self.vault_cache_client.vault__create(vault_cache_key, manifest)
        if result is None or not hasattr(result, 'cache_id'):
            return None

        cache_id = str(result.cache_id)

        # Create the root folder as child data
        root_folder = dict(type     = 'folder'         ,
                           id       = root_folder_guid  ,
                           children = []                )
        self.vault_cache_client.folder__store(cache_id, root_folder_guid, root_folder)

        return dict(cache_id    = cache_id         ,
                    root_folder = root_folder_guid ,
                    created     = manifest['created'])

    def lookup(self, vault_cache_key):                                         # Lookup vault manifest
        return self.vault_cache_client.vault__lookup(vault_cache_key)

    def exists(self, vault_cache_key):                                         # Check if vault exists
        cache_id = self.vault_cache_client.vault__lookup_cache_id(vault_cache_key)
        return cache_id is not None

    # ═══════════════════════════════════════════════════════════════════════
    # Folder Operations
    # ═══════════════════════════════════════════════════════════════════════

    def store_folder(self, vault_cache_key, folder_guid, folder_data):         # Store a folder
        cache_id = self.vault_cache_client.vault__lookup_cache_id(vault_cache_key)
        if cache_id is None:
            return None
        return self.vault_cache_client.folder__store(cache_id, folder_guid, folder_data)

    def get_folder(self, vault_cache_key, folder_guid):                        # Get a folder
        cache_id = self.vault_cache_client.vault__lookup_cache_id(vault_cache_key)
        if cache_id is None:
            return None
        return self.vault_cache_client.folder__get(cache_id, folder_guid)

    def update_folder(self, vault_cache_key, folder_guid, folder_data):        # Update a folder
        cache_id = self.vault_cache_client.vault__lookup_cache_id(vault_cache_key)
        if cache_id is None:
            return None
        return self.vault_cache_client.folder__update(cache_id, folder_guid, folder_data)

    def list_folders(self, vault_cache_key):                                    # List all folders
        cache_id = self.vault_cache_client.vault__lookup_cache_id(vault_cache_key)
        if cache_id is None:
            return None
        return self.vault_cache_client.folder__list(cache_id)

    def delete_folder(self, vault_cache_key, folder_guid):                     # Delete a folder
        cache_id = self.vault_cache_client.vault__lookup_cache_id(vault_cache_key)
        if cache_id is None:
            return None
        return self.vault_cache_client.folder__delete(cache_id, folder_guid)

    # ═══════════════════════════════════════════════════════════════════════
    # File Operations
    # ═══════════════════════════════════════════════════════════════════════

    def store_file(self, vault_cache_key, file_guid, encrypted_bytes):         # Store encrypted file
        cache_id = self.vault_cache_client.vault__lookup_cache_id(vault_cache_key)
        if cache_id is None:
            return None
        return self.vault_cache_client.file__store(cache_id, file_guid, encrypted_bytes)

    def get_file(self, vault_cache_key, file_guid):                            # Get encrypted file
        cache_id = self.vault_cache_client.vault__lookup_cache_id(vault_cache_key)
        if cache_id is None:
            return None
        return self.vault_cache_client.file__get(cache_id, file_guid)

    def list_files(self, vault_cache_key):                                     # List all files
        cache_id = self.vault_cache_client.vault__lookup_cache_id(vault_cache_key)
        if cache_id is None:
            return None
        return self.vault_cache_client.file__list(cache_id)

    def delete_file(self, vault_cache_key, file_guid):                         # Delete a file
        cache_id = self.vault_cache_client.vault__lookup_cache_id(vault_cache_key)
        if cache_id is None:
            return None
        return self.vault_cache_client.file__delete(cache_id, file_guid)

    # ═══════════════════════════════════════════════════════════════════════
    # Index Operations
    # ═══════════════════════════════════════════════════════════════════════

    def store_index(self, vault_cache_key, encrypted_index_bytes):             # Store encrypted index
        cache_id = self.vault_cache_client.vault__lookup_cache_id(vault_cache_key)
        if cache_id is None:
            return None
        return self.vault_cache_client.index__store(cache_id, encrypted_index_bytes)

    def get_index(self, vault_cache_key):                                      # Get encrypted index
        cache_id = self.vault_cache_client.vault__lookup_cache_id(vault_cache_key)
        if cache_id is None:
            return None
        return self.vault_cache_client.index__get(cache_id)

    def update_index(self, vault_cache_key, encrypted_index_bytes):            # Update encrypted index
        cache_id = self.vault_cache_client.vault__lookup_cache_id(vault_cache_key)
        if cache_id is None:
            return None
        return self.vault_cache_client.index__update(cache_id, encrypted_index_bytes)

    # ═══════════════════════════════════════════════════════════════════════
    # Bulk Operations
    # ═══════════════════════════════════════════════════════════════════════

    def list_all(self, vault_cache_key):                                       # List everything in vault
        cache_id = self.vault_cache_client.vault__lookup_cache_id(vault_cache_key)
        if cache_id is None:
            return None
        return self.vault_cache_client.vault__list_all(cache_id)

    def delete_all(self, vault_cache_key):                                     # Delete all vault contents
        cache_id = self.vault_cache_client.vault__lookup_cache_id(vault_cache_key)
        if cache_id is None:
            return None
        return self.vault_cache_client.vault__delete_all(cache_id)
