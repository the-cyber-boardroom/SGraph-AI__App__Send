# ===============================================================================
# SGraph Send - Vault File Chunk Request Schema
# Type_Safe request body for POST /vault/file-chunk
# Supports uploading large files in chunks that fit under Lambda's 6MB limit
# ===============================================================================

from osbot_utils.type_safe.Type_Safe import Type_Safe


class Schema__Vault__File__Chunk__Request(Type_Safe):                        # POST /vault/file-chunk request body
    vault_cache_key : str                                                    # Vault identifier (derived from PKI key)
    file_guid       : str                                                    # GUID for the file
    chunk_index     : int                                                    # 0-based index of this chunk
    total_chunks    : int                                                    # Total number of chunks for this file
    chunk_data      : str                                                    # Base64-encoded encrypted chunk bytes


class Schema__Vault__File__Assemble__Request(Type_Safe):                     # POST /vault/file-assemble request body
    vault_cache_key : str                                                    # Vault identifier
    file_guid       : str                                                    # GUID for the file to assemble
    total_chunks    : int                                                    # Expected number of chunks
