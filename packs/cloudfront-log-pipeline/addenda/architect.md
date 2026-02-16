# CloudFront Log Pipeline — Architect Addendum

**Version:** v0.4.4
**Role:** Villager Architect

---

## Design Guidance for the Implementor

### 1. Follow Existing Patterns Exactly

The SA pipeline is NOT novel architecture. It follows patterns already proven in the codebase:

| Pattern | Existing Example | SA Pipeline Equivalent |
|---------|-----------------|----------------------|
| Collector class | `CloudFront__Logs__Collector` | Reuse directly (wrap, don't rewrite) |
| Service class | `Service__Metrics__Cache` | `Service__SA__Log__Ingestion`, etc. |
| Cache with TTL | `Service__Metrics__Cache._get_cached()` | Same pattern for pipeline state |
| Route class | `Routes__Metrics` | `Routes__SA` |
| Pipeline factory | `Metrics__Pipeline__Setup` | `SA__Pipeline__Setup` |
| Env var gating | `METRICS__ENABLED` | `SA__ENABLED` |
| Schema class | `Schema__Metrics__Snapshot` | `Schema__SA__Log__Event`, etc. |

### 2. Keep Services Thin

Each service does ONE thing:
- `Service__SA__Log__Ingestion` — reads from S3 collector, writes to cache. That's it.
- `Service__SA__Consolidation` — reads raw from cache, writes grouped to cache. That's it.
- `Service__SA__Temporal__Aggregation` — reads consolidated from cache, writes aggregated to cache. That's it.

No service knows about the others. The pipeline setup wires them; the routes call them.

### 3. The `/api/sa/` Prefix

Decision D058 confirms `/api/sa/` for all SA endpoints. This introduces a new prefix convention. Implementation options:

**Option A:** Set `tag = 'api/sa'` on the routes class. Method names become sub-paths:
```python
class Routes__SA(Fast_API__Routes):
    tag = 'api/sa'
    # def cloudfront__ingest -> /api/sa/cloudfront/ingest
```

**Option B:** Register routes with explicit paths:
```python
@route_path(path='/api/sa/cloudfront/ingest')
def cloudfront_ingest(self):
    ...
```

Option A is preferred if the framework supports slashes in tags. Test this. If not, use Option B.

### 4. Namespace Strategy

Use separate cache namespaces (not sub-paths within a single namespace):

```python
NS_SA_RAW          = 'sa-cloudfront-raw'
NS_SA_CONSOLIDATED = 'sa-cloudfront-consolidated'
NS_SA_AGGREGATE    = 'sa-cloudfront-aggregate'
```

This keeps each pipeline stage independently browsable and manageable.

### 5. Decisions That Constrain Implementation

| Decision | Constraint |
|----------|-----------|
| D050 | boto3 lazy imports in collector classes only |
| D054 | Domain is `sgraph.ai` (if any URL construction is needed) |
| D055 | Everything on Admin Lambda — no new Lambda functions |
| D057 | CloudFront logs first (not CloudWatch metrics) |
| D058 | `/api/sa/` prefix for all SA endpoints |
| D061 | No event-driven automation yet — manual/on-demand only |
| D062 | IP verification via tests, not manual inspection |

### 6. What NOT to Build

- No admin UI views (separate workstream)
- No digital twin collectors (separate workstream)
- No event-driven triggers (deferred)
- No Issues FS S3 adapter (deferred)
- No CloudWatch metrics pipeline (deferred — do logs first)
