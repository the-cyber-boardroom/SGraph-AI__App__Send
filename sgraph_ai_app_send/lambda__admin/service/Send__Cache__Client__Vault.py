# ===============================================================================
# SGraph Send - Vault Cache Client
# Separate cache client for vault operations (PKI-keyed personal data vault)
# Uses Cache Service child data API: one cache entry per vault, with
# folders/files/index stored as child data under data_keys
# ===============================================================================

from mgraph_ai_service_cache_client.client.cache_client.Cache__Service__Client import Cache__Service__Client
from osbot_utils.helpers.cache.Cache__Hash__Generator                          import Cache__Hash__Generator
from osbot_utils.type_safe.Type_Safe                                           import Type_Safe

NS_VAULT = 'vault'                                                            # Namespace for all vault data


class Send__Cache__Client__Vault(Type_Safe):                                   # Cache client for vault operations
    cache_client   : Cache__Service__Client                                    # Official cache service client
    hash_generator : Cache__Hash__Generator                                    # Hash generator for cache keys

    # ═══════════════════════════════════════════════════════════════════════
    # Vault Lifecycle — create, lookup, exists
    # ═══════════════════════════════════════════════════════════════════════

    def vault__create(self, vault_cache_key, manifest_data):                   # Create a new vault (one cache entry)
        manifest_data['vault_key'] = vault_cache_key                           # Ensure body contains the cache_key for hash matching
        return self.cache_client.store().store__json__cache_key(
            namespace       = NS_VAULT           ,
            strategy        = 'key_based'        ,
            cache_key       = vault_cache_key    ,
            file_id         = vault_cache_key    ,
            body            = manifest_data      ,
            json_field_path = 'vault_key'        )

    def vault__lookup(self, vault_cache_key):                                  # Retrieve vault manifest by cache_key
        cache_hash = self.hash_generator.from_string(vault_cache_key)
        response   = self.cache_client.retrieve().retrieve__hash__cache_hash__cache_id(
            cache_hash = str(cache_hash) ,
            namespace  = NS_VAULT        )
        if response and response.get('cache_id'):
            cache_id = response.get('cache_id')
            return self.cache_client.retrieve().retrieve__cache_id__json(
                cache_id  = cache_id  ,
                namespace = NS_VAULT  )
        return None

    def vault__lookup_cache_id(self, vault_cache_key):                         # Get cache_id for a vault by cache_key
        cache_hash = self.hash_generator.from_string(vault_cache_key)
        response   = self.cache_client.retrieve().retrieve__hash__cache_hash__cache_id(
            cache_hash = str(cache_hash) ,
            namespace  = NS_VAULT        )
        if response:
            return response.get('cache_id')
        return None

    # ═══════════════════════════════════════════════════════════════════════
    # Folder Operations — store, get, update, list, delete
    # ═══════════════════════════════════════════════════════════════════════

    def folder__store(self, cache_id, folder_guid, folder_data):               # Store a folder as JSON child data
        return self.cache_client.data_store().data__store_json__with__id_and_key(
            cache_id     = cache_id      ,
            namespace    = NS_VAULT      ,
            data_key     = 'folders'     ,
            data_file_id = folder_guid   ,
            body         = folder_data   )

    def folder__get(self, cache_id, folder_guid):                              # Retrieve folder JSON by GUID
        return self.cache_client.data().retrieve().data__json__with__id_and_key(
            cache_id     = cache_id      ,
            namespace    = NS_VAULT      ,
            data_key     = 'folders'     ,
            data_file_id = folder_guid   )

    def folder__update(self, cache_id, folder_guid, folder_data):              # Update folder children list
        return self.cache_client.data().update().data__update_json__with__id_and_key(
            cache_id     = cache_id      ,
            namespace    = NS_VAULT      ,
            data_key     = 'folders'     ,
            data_file_id = folder_guid   ,
            body         = folder_data   )

    def folder__list(self, cache_id):                                          # List all folders in a vault
        return self.cache_client.data().list().data__list__with__key(
            cache_id  = cache_id  ,
            namespace = NS_VAULT  ,
            data_key  = 'folders' )

    def folder__delete(self, cache_id, folder_guid):                           # Delete a folder
        return self.cache_client.data().delete().delete__data__file__with__id_and_key(
            cache_id     = cache_id      ,
            namespace    = NS_VAULT      ,
            data_key     = 'folders'     ,
            data_file_id = folder_guid   )

    # ═══════════════════════════════════════════════════════════════════════
    # File Operations — store, get, list, delete
    # ═══════════════════════════════════════════════════════════════════════

    def file__store(self, cache_id, file_guid, encrypted_bytes):               # Store encrypted file blob as binary child data
        return self.cache_client.data_store().data__store_binary__with__id_and_key(
            cache_id     = cache_id          ,
            namespace    = NS_VAULT          ,
            data_key     = 'files'           ,
            data_file_id = file_guid         ,
            body         = encrypted_bytes   )

    def file__get(self, cache_id, file_guid):                                  # Retrieve encrypted file blob
        return self.cache_client.data().retrieve().data__binary__with__id_and_key(
            cache_id     = cache_id      ,
            namespace    = NS_VAULT      ,
            data_key     = 'files'       ,
            data_file_id = file_guid     )

    def file__list(self, cache_id):                                            # List all files in a vault
        return self.cache_client.data().list().data__list__with__key(
            cache_id  = cache_id  ,
            namespace = NS_VAULT  ,
            data_key  = 'files'   )

    def file__delete(self, cache_id, file_guid):                               # Delete a single file
        return self.cache_client.data().delete().delete__data__file__with__id_and_key(
            cache_id     = cache_id      ,
            namespace    = NS_VAULT      ,
            data_key     = 'files'       ,
            data_file_id = file_guid     )

    # ═══════════════════════════════════════════════════════════════════════
    # Index Operations — store, get, update
    # ═══════════════════════════════════════════════════════════════════════

    def index__store(self, cache_id, encrypted_index_bytes):                   # Store encrypted vault index
        return self.cache_client.data_store().data__store_binary__with__id_and_key(
            cache_id     = cache_id              ,
            namespace    = NS_VAULT              ,
            data_key     = 'index'               ,
            data_file_id = 'vault-index'         ,
            body         = encrypted_index_bytes )

    def index__get(self, cache_id):                                            # Retrieve encrypted vault index
        return self.cache_client.data().retrieve().data__binary__with__id_and_key(
            cache_id     = cache_id       ,
            namespace    = NS_VAULT       ,
            data_key     = 'index'        ,
            data_file_id = 'vault-index'  )

    def index__update(self, cache_id, encrypted_index_bytes):                  # Update encrypted vault index
        return self.cache_client.data().update().data__update_binary__with__id_and_key(
            cache_id     = cache_id              ,
            namespace    = NS_VAULT              ,
            data_key     = 'index'               ,
            data_file_id = 'vault-index'         ,
            body         = encrypted_index_bytes )

    # ═══════════════════════════════════════════════════════════════════════
    # Bulk Operations — list all, delete all
    # ═══════════════════════════════════════════════════════════════════════

    def vault__list_all(self, cache_id):                                       # List everything in a vault
        return self.cache_client.data().list().data__list(
            cache_id  = cache_id  ,
            namespace = NS_VAULT  )

    def vault__delete_all(self, cache_id):                                     # Delete ALL vault contents
        return self.cache_client.data().delete().delete__all__data__files(
            cache_id  = cache_id  ,
            namespace = NS_VAULT  )
