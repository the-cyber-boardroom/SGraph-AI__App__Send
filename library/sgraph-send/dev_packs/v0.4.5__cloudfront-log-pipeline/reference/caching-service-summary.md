# Reference: MGraph-AI Caching Service

**Purpose:** Explain how the cache service works for an implementor without repo access.

---

## What It Is

The MGraph-AI Cache Service is an external service that provides key-value storage with metadata, temporal indexing, and hierarchical browsing. SGraph Send communicates with it via `Cache__Service__Client` (from the `mgraph-ai-service-cache-client` package), wrapped in a domain-specific `Send__Cache__Client`.

## How SGraph Send Uses It

All application data (analytics events, token metadata, metrics snapshots) goes through the cache service. The SA pipeline will use it to store all pipeline output.

### Storage Strategies

**Temporal** — auto-generates time-based keys. Good for event streams:
```python
cache_client.store().store__json(
    namespace = 'my-namespace',
    strategy  = 'temporal',
    body      = {'key': 'value'}
)
```

**Key-based** — you provide the key. Good for addressable data:
```python
cache_client.store().store__json__cache_key(
    namespace = 'my-namespace',
    strategy  = 'key_based',
    cache_key = 'my-unique-key',
    file_id   = 'my-unique-key',
    body      = {'key': 'value'}
)
```

### Retrieval

**By cache key:**
```python
result = cache_client.retrieve().retrieve__cache_key__json(
    cache_key = 'my-unique-key',
    namespace = 'my-namespace'
)
# Returns: dict or None
```

**By cache ID:**
```python
result = cache_client.retrieve().retrieve__cache_id__json(
    cache_id  = 'abc123',
    namespace = 'my-namespace'
)
```

**By hash (for key lookup):**
```python
response = cache_client.retrieve().retrieve__hash__cache_hash__cache_id(
    cache_hash = 'hash-value',
    namespace  = 'my-namespace'
)
# Returns: {'cache_id': '...'} or None
```

### Admin / Browsing

**List files under a path:**
```python
result = cache_client.admin_storage().files__all__path(path='namespace/subpath')
# Returns object with .files attribute (list of file paths)
```

**List folders:**
```python
folders = cache_client.admin_storage().folders(
    path             = 'namespace/',
    return_full_path = False,
    recursive        = False
)
# Returns: list of folder names
```

### Data Store (child data)

For attaching sub-records to a parent entry:
```python
cache_client.data_store().data__store_json__with__id_and_key(
    cache_id     = 'parent-id',
    namespace    = 'my-namespace',
    data_key     = 'usage_events',
    data_file_id = 'event-001',
    body         = {'event': 'data'}
)
```

### Update

```python
cache_client.update().update__json(
    cache_id  = 'abc123',
    namespace = 'my-namespace',
    body      = {'updated': 'data'}
)
```

## Namespaces Used in SGraph Send

| Namespace | Purpose | Strategy |
|-----------|---------|----------|
| `analytics` | Raw analytics events | Temporal |
| `tokens` | Token metadata + usage | Key-based |
| `costs` | AWS cost data | Key-based |
| `transfers` | Transfer summaries | Key-based |
| `metrics` | Metrics snapshots | Key-based |
| `sa-cloudfront-raw` | **NEW** SA raw log events | Temporal |
| `sa-cloudfront-consolidated` | **NEW** SA consolidated data | Key-based |
| `sa-cloudfront-aggregate` | **NEW** SA time aggregations | Key-based |

## Important Notes

- The cache service is external (not in this repo). You interact with it only through `Send__Cache__Client`.
- `Send__Cache__Client` is a `Type_Safe` class with a `cache_client: Cache__Service__Client` attribute.
- For the SA pipeline, consider adding SA-specific convenience methods to `Send__Cache__Client` (following the existing `analytics__*` and `token__*` patterns).
- The cache service client is initialised in `Send__Cache__Setup.create_send_cache_client()`.
