# ═══════════════════════════════════════════════════════════════════════════════
# Html_Cache__Client - Wrapper for MGraph-AI Cache Service Client
# Provides type-safe interface for HTML cache operations
# ═══════════════════════════════════════════════════════════════════════════════
from typing                                                                                     import List
from mgraph_ai_service_cache_client.client.cache_client.Cache__Service__Client                  import Cache__Service__Client
from mgraph_ai_service_cache_client.schemas.cache.file.Schema__Cache__File__Metadata            import Schema__Cache__File__Metadata
from mgraph_ai_service_cache_client.schemas.cache.file.Schema__Cache__File__Refs                import Schema__Cache__File__Refs
from mgraph_ai_service_cache_client.schemas.cache.Schema__Cache__Retrieve__Success              import Schema__Cache__Retrieve__Success
from mgraph_ai_service_cache_client.schemas.cache.Schema__Cache__Store__Response                import Schema__Cache__Store__Response
from mgraph_ai_service_cache_client.schemas.cache.data.Schema__Cache__Data__Store__Response     import Schema__Cache__Data__Store__Response
from mgraph_ai_service_cache_client.schemas.cache.data.Schema__Cache__Data__List__Response      import Schema__Cache__Data__List__Response
from mgraph_ai_service_cache_client.schemas.cache.enums.Enum__Cache__Data_Type                  import Enum__Cache__Data_Type
from mgraph_ai_service_cache_client.schemas.cache.enums.Enum__Cache__Store__Strategy            import Enum__Cache__Store__Strategy
from mgraph_ai_service_cache_client.schemas.cache.safe_str.Safe_Str__Cache__File__Cache_Key     import Safe_Str__Cache__File__Cache_Key
from mgraph_ai_service_cache_client.schemas.cache.safe_str.Safe_Str__Cache__File__Data_Key      import Safe_Str__Cache__File__Data_Key
from mgraph_ai_service_cache_client.schemas.cache.safe_str.Safe_Str__Cache__Namespace           import Safe_Str__Cache__Namespace
from mgraph_ai_service_html_graph.service.cache_storage.safe_str.Safe_Str__Data_File_Id         import Safe_Str__Data_File_Id
from mgraph_ai_service_html_graph.service.cache_storage.schemas.Schema__Html_Cache__Entry       import Schema__Html_Cache__Entry
from osbot_utils.helpers.cache.Cache__Hash__Generator                                           import Cache__Hash__Generator
from osbot_utils.type_safe.Type_Safe                                                            import Type_Safe
from osbot_utils.type_safe.primitives.domains.cryptography.safe_str.Safe_Str__Cache_Hash        import Safe_Str__Cache_Hash
from osbot_utils.type_safe.primitives.domains.files.safe_str.Safe_Str__File__Path               import Safe_Str__File__Path
from osbot_utils.type_safe.primitives.domains.identifiers.Cache_Id                              import Cache_Id
from osbot_utils.type_safe.primitives.domains.identifiers.safe_str.Safe_Str__Namespace          import Safe_Str__Namespace
from osbot_utils.type_safe.type_safe_core.decorators.type_safe                                  import type_safe


class Html_Cache__Client(Type_Safe):                                             # Cache service client wrapper
    cache_client   : Cache__Service__Client                                      # Official cache client
    hash_generator : Cache__Hash__Generator                                      # Hash generator for cache keys

    # ═══════════════════════════════════════════════════════════════════════════
    # Entry Operations (main cache entries with key_based strategy)
    # ═══════════════════════════════════════════════════════════════════════════

    @type_safe
    def entry__store(self,                                                # Store main entry
                     namespace       : Safe_Str__Namespace,               # Cache namespace
                     cache_key       : Safe_Str__Cache__File__Cache_Key,  # Semantic path key
                     file_id         : Safe_Str__Data_File_Id,            # File identifier
                     entry           : Schema__Html_Cache__Entry = None   # Entry data
                ) -> Schema__Cache__Store__Response:
        if entry is None:                                                           # if we did not receive a Schema__Html_Cache__Entry instance
            entry = Schema__Html_Cache__Entry(cache_key = cache_key)                #   create one with the correct cache_key
        else:                                                                       # if we did receive one
            entry.cache_key = cache_key                                             #   make sure the entry's cache_key is the provided cache_key in this method
        json_field_path     = 'cache_key'                                           # tell cache service to use the cache_key field to calculate the cache_hash
        body                = entry.json()
        return self.cache_client.store().store__json__cache_key(namespace       = namespace                            ,
                                                                strategy        = Enum__Cache__Store__Strategy.KEY_BASED,
                                                                cache_key       = cache_key                            ,
                                                                body            = body                                 ,
                                                                file_id         = file_id                              ,
                                                                json_field_path = json_field_path                      )

    @type_safe
    def entry__retrieve(self,                                                    # Retrieve entry by ID
                        namespace : Safe_Str__Namespace,                         # Cache namespace
                        cache_id  : Cache_Id                                     # Cache entry ID
                   ) -> dict:                                                    # Returns None if not found
        return self.cache_client.retrieve().retrieve__cache_id__json(cache_id  = cache_id ,
                                                                     namespace = namespace)

    @type_safe
    def entry__exists(self,                                                      # Check if entry exists by ID
                      namespace : Safe_Str__Namespace,                           # Cache namespace
                      cache_id  : Cache_Id                                       # Cache entry ID
                ) -> bool:
        response = self.cache_client.exists().exists__cache_id(cache_id  = cache_id ,
                                                               namespace = namespace)
        if response:
            return response.exists
        return False

    @type_safe
    def entry__exists_by_hash(self,                                              # Check if entry exists by hash
                              namespace  : Safe_Str__Namespace ,                 # Cache namespace
                              cache_hash : Safe_Str__Cache_Hash                  # Content hash
                         ) -> bool:
        response = self.cache_client.exists().exists__hash__cache_hash(cache_hash = cache_hash,
                                                                       namespace  = namespace )
        if response:
            return response.exists
        return False

    @type_safe
    def entry__update(self,                                                      # Update entry data
                      namespace : Safe_Str__Namespace,                           # Cache namespace
                      cache_id  : Cache_Id           ,                           # Cache entry ID
                      entry     : Type_Safe                                      # Updated entry data
                 ) -> bool:
        data   = entry.json()
        result = self.cache_client.update().update__json(cache_id  = cache_id ,
                                                         namespace = namespace,
                                                         body      = data     )
        if result:
            return result.updated_content
        return False

    @type_safe
    def entry__delete(self,                                                      # Delete entry by ID
                      namespace : Safe_Str__Namespace,                           # Cache namespace
                      cache_id  : Cache_Id                                       # Cache entry ID
                ) -> bool:                                                       # Returns True if deleted
        response = self.cache_client.delete().delete__cache_id(cache_id  = cache_id ,
                                                               namespace = namespace)
        if response:
            return response.get('status') == 'success'
        return False

    @type_safe
    def cache_id__from_key(self,                                            # Find entry by semantic key
                           namespace : Safe_Str__Namespace,                 # Cache namespace
                           cache_key : Safe_Str__Cache__File__Cache_Key     # Semantic path key
                           ) -> Cache_Id:                                             # Returns Cache_Id if found
        cache_hash = self.hash_generator.from_string(cache_key)
        cache_id   = self.cache_id__from_hash(namespace = namespace, cache_hash = cache_hash)
        return cache_id

    def cache_id__from_hash(self,
                            namespace : Safe_Str__Namespace ,
                            cache_hash : Safe_Str__Cache_Hash
                       ) -> Cache_Id:
        response   = self.cache_client.retrieve().retrieve__hash__cache_hash__cache_id(cache_hash = cache_hash,
                                                                                       namespace  = namespace )
        if response:
            return response.get('cache_id')
        return None

    # ═══════════════════════════════════════════════════════════════════════════
    # Data Operations (data files attached to cache entries)
    # ═══════════════════════════════════════════════════════════════════════════

    @type_safe
    def data__store_string(self,                                                 # Store string data file
                           namespace    : Safe_Str__Namespace             ,      # Cache namespace
                           cache_id     : Cache_Id                        ,      # Parent cache ID
                           data_key     : Safe_Str__Cache__File__Cache_Key,      # Data path key
                           data_file_id : Safe_Str__Data_File_Id,                # File identifier
                           content      : str                                    # String content
                      ) -> Schema__Cache__Data__Store__Response:
        return self.cache_client.data_store().data__store_string__with__id_and_key(cache_id     = cache_id    ,
                                                                                   namespace    = namespace   ,
                                                                                   data_key     = data_key    ,
                                                                                   data_file_id = data_file_id,
                                                                                   body         = content     )

    @type_safe
    def data__store_json(self,                                                   # Store JSON data file
                         namespace    : Safe_Str__Namespace              ,       # Cache namespace
                         cache_id     : Cache_Id                         ,       # Parent cache ID
                         data_key     : Safe_Str__Cache__File__Cache_Key ,       # Data path key
                         data_file_id : Safe_Str__Data_File_Id           ,       # File identifier
                         data         : dict                                     # JSON data
                    ) -> Schema__Cache__Data__Store__Response:
        return self.cache_client.data_store().data__store_json__with__id_and_key(cache_id     = cache_id    ,
                                                                                 namespace    = namespace   ,
                                                                                 data_key     = data_key    ,
                                                                                 data_file_id = data_file_id,
                                                                                 body         = data        )

    @type_safe
    def data__retrieve_string(self,                                              # Retrieve string data file
                              namespace    : Safe_Str__Namespace              ,   # Cache namespace
                              cache_id     : Cache_Id                         ,   # Parent cache ID
                              data_key     : Safe_Str__Cache__File__Cache_Key , # Data path key
                              data_file_id : Safe_Str__Data_File_Id              # File identifier
                         ) -> str:                                               # Returns None if not found
        response = self.cache_client.data().retrieve().data__string__with__id_and_key(cache_id     = cache_id    ,
                                                                                      namespace    = namespace   ,
                                                                                      data_key     = data_key    ,
                                                                                      data_file_id = data_file_id)
        if type(response) is dict:                                               # Handle error response
            return None
        if response:                                                             # since this method actually a string
            return response                                                      # it means that when the file doesn't exist we will have response = ''
        return None                                                              # which in that case it is better to return None

    @type_safe
    def data__retrieve_json(self,                                                # Retrieve JSON data file
                            namespace    : Safe_Str__Namespace              ,    # Cache namespace
                            cache_id     : Cache_Id                         ,    # Parent cache ID
                            data_key     : Safe_Str__Cache__File__Cache_Key ,    # Data path key
                            data_file_id : Safe_Str__Data_File_Id                # File identifier
                       ) -> dict:                                                # Returns None if not found
        return self.cache_client.data().retrieve().data__json__with__id_and_key(cache_id     = cache_id    ,
                                                                                namespace    = namespace   ,
                                                                                data_key     = data_key    ,
                                                                                data_file_id = data_file_id)

    @type_safe
    def data__exists(self,                                                       # Check if data file exists
                     namespace    : Safe_Str__Namespace              ,           # Cache namespace
                     cache_id     : Cache_Id                         ,           # Parent cache ID
                     data_key     : Safe_Str__Cache__File__Cache_Key ,           # Data path key
                     data_file_id : Safe_Str__Data_File_Id           ,           # File identifier
                     data_type    : Enum__Cache__Data_Type                       # Data type
                ) -> bool:
        result = self.cache_client.data().exists().data__exists__with__id_and_key(cache_id     = cache_id    ,
                                                                                  namespace    = namespace   ,
                                                                                  data_key     = data_key    ,
                                                                                  data_file_id = data_file_id,
                                                                                  data_type    = data_type   )
        if result:
            return result.exists
        return False

    @type_safe
    def data__list(self,                                                            # List data files
                   namespace : Safe_Str__Namespace                    ,             # Cache namespace
                   cache_id  : Cache_Id                               ,             # Parent cache ID
                   data_key  : Safe_Str__Cache__File__Cache_Key = None,             # Data path key
                   recursive : bool                             = True              # Include subdirectories
              ) -> Schema__Cache__Data__List__Response:
        if data_key:
            return self.cache_client.data().list().data__list__with__key(cache_id  = cache_id ,
                                                                         namespace = namespace,
                                                                         data_key  = data_key ,
                                                                         recursive = recursive)
        return self.cache_client.data().list().data__list(cache_id  = cache_id ,
                                                          namespace = namespace,
                                                          recursive = recursive)

    @type_safe
    def data__update_string(self,                                                # Update string data file
                            namespace    : Safe_Str__Namespace              ,    # Cache namespace
                            cache_id     : Cache_Id                         ,    # Parent cache ID
                            data_key     : Safe_Str__Cache__File__Cache_Key ,    # Data path key
                            data_file_id : Safe_Str__Data_File_Id,               # File identifier
                            content      : str                                   # New content
                       ) -> bool:
        result = self.cache_client.data().update().data__update_string__with__id_and_key(cache_id     = cache_id    ,
                                                                                         namespace    = namespace   ,
                                                                                         data_key     = data_key    ,
                                                                                         data_file_id = data_file_id,
                                                                                         body         = content     )
        if result:
            return result.success
        return False

    @type_safe
    def data__update_json(self,                                                  # Update JSON data file
                          namespace    : Safe_Str__Namespace              ,      # Cache namespace
                          cache_id     : Cache_Id                         ,      # Parent cache ID
                          data_key     : Safe_Str__Cache__File__Cache_Key ,      # Data path key
                          data_file_id : Safe_Str__Data_File_Id,                 # File identifier
                          data         : dict                                    # New JSON data
                     ) -> bool:
        result = self.cache_client.data().update().data__update_json__with__id_and_key(cache_id     = cache_id    ,
                                                                                       namespace    = namespace   ,
                                                                                       data_key     = data_key    ,
                                                                                       data_file_id = data_file_id,
                                                                                       body         = data        )
        if result:
            return result.success
        return False

    @type_safe
    def data__delete(self,                                                       # Delete data file
                     namespace    : Safe_Str__Namespace              ,           # Cache namespace
                     cache_id     : Cache_Id                         ,           # Parent cache ID
                     data_key     : Safe_Str__Cache__File__Cache_Key ,           # Data path key
                     data_file_id : Safe_Str__Data_File_Id           ,           # File identifier
                     data_type    : Enum__Cache__Data_Type                       # Data type
                ) -> bool:
        result = self.cache_client.data().delete().delete__data__file__with__id_and_key(cache_id     = cache_id    ,
                                                                                        namespace    = namespace   ,
                                                                                        data_key     = data_key    ,
                                                                                        data_file_id = data_file_id,
                                                                                        data_type    = data_type   )
        if result:
            return result.get('status') == 'success'
        return False

    @type_safe
    def data__delete_all(self                                      ,                # Delete all data files for entity
                         namespace : Safe_Str__Cache__Namespace    ,                # Cache namespace
                         cache_id  : Cache_Id                                       # Entity cache ID
                    ) -> bool:
        result = self.cache_client.data().delete().delete__all__data__files(namespace = namespace ,
                                                                            cache_id  = cache_id  )
        if result:
            return result.get('status') == 'success'
        return False

    @type_safe
    def data__delete_all_with_key(self                                            , # Delete all files under data_key
                                  namespace : Safe_Str__Cache__Namespace          , # Cache namespace
                                  cache_id  : Cache_Id                            , # Entity cache ID
                                  data_key  : Safe_Str__Cache__File__Data_Key       # Data key prefix to delete
                             ) -> bool:
        result = self.cache_client.data().delete().delete__all__data__files__with__key(namespace = namespace ,
                                                                                       cache_id  = cache_id  ,
                                                                                       data_key  = data_key  )

        return result.get('deleted', False) if result else False

    # ═══════════════════════════════════════════════════════════════════════════
    # Cache Operations (direct access to cache objects)
    # ═══════════════════════════════════════════════════════════════════════════

    @type_safe
    def cache__entry(self,                                                    # Retrieve entry data from cache
                     namespace : Safe_Str__Cache__Namespace,                  # Cache namespace
                     cache_id  : Cache_Id                                     # Cache entry ID
                ) -> Schema__Cache__Retrieve__Success:                        # Returns None if not found
        return self.cache_client.retrieve().retrieve__cache_id(cache_id  = cache_id ,
                                                               namespace = namespace)

    @type_safe
    def cache__entry__refs(self,                                                    # Retrieve entry refs from cache
                           namespace : Safe_Str__Cache__Namespace,                  # Cache namespace
                           cache_id  : Cache_Id                                     # Cache entry ID
                      ) -> Schema__Cache__File__Refs:                               # Returns None if not found
        return self.cache_client.retrieve().retrieve__cache_id__refs(cache_id  = cache_id ,
                                                                     namespace = namespace)

    @type_safe
    def cache__entry__metadata(self,                                                    # Retrieve entry metadata from cache
                               namespace : Safe_Str__Cache__Namespace,                  # Cache namespace
                               cache_id  : Cache_Id                                     # Cache entry ID
                          ) -> Schema__Cache__File__Metadata:                                                    # Returns None if not found
        return self.cache_client.retrieve().retrieve__cache_id__metadata(cache_id  = cache_id ,
                                                                         namespace = namespace)

    # ═══════════════════════════════════════════════════════════════════════════
    # Namespace Operations (direct access to cache objects)
    # ═══════════════════════════════════════════════════════════════════════════

    def namespace__all_files(self,                                                    # Retrieve all files in the current namespace
                             namespace : Safe_Str__Cache__Namespace,                  # Cache namespace
                          ) -> List[Safe_Str__File__Path]:
        return self.cache_client.admin_storage().files__all__path(path=namespace)

    # ═══════════════════════════════════════════════════════════════════════════
    # Health Check
    # ═══════════════════════════════════════════════════════════════════════════

    def health_check(self) -> bool:                                              # Check service availability
        result = self.cache_client.info().health()
        if result:
            return result.get('status') == 'ok'
        return False