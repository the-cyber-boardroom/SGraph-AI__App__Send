# Reference: The LETS Pipeline Methodology

**Purpose:** Explain the LETS (Load, Extract, Transform, Store) pipeline pattern used for all Server Analytics data processing.

---

## What Is LETS?

LETS is a lightweight ETL variant designed for SGraph Send's server analytics. Instead of a monolithic ETL job, LETS breaks processing into discrete, cacheable steps that can run independently:

1. **Load** — Read raw data from source (S3, CloudWatch API, etc.)
2. **Extract** — Parse raw format into typed structures (JSON)
3. **Transform** — Consolidate, aggregate, compress
4. **Store** — Write results to the cache service

Each step produces output that is stored in the cache before the next step runs. This means:
- Steps can be re-run independently
- Intermediate results are inspectable (via cache browser)
- Failures are isolated — a failed Transform doesn't lose the Load/Extract work
- Each step can have its own cadence (ingest every minute, aggregate every hour)

---

## Applied to CloudFront Logs

### Step 1: Raw Ingestion (Load + Extract)

**Input:** S3 objects (gzip, tab-delimited)
**Output:** Typed JSON events in cache under `sa-cloudfront-raw/`

```
S3: cloudfront-realtime/year=2026/month=02/day=16/file.gz
    → Parse tab-delimited lines
    → Map to CF_LOG_FIELDS
    → Store each event as JSON in cache
```

### Step 2: Consolidation (Transform — grouping)

**Input:** Raw events from cache (`sa-cloudfront-raw/`)
**Output:** Grouped summaries in cache under `sa-cloudfront-consolidated/`

- Count requests per path
- Count requests per status code
- Count requests per edge location
- Calculate cache hit rate
- Identify unique user agents
- Sum bytes transferred

### Step 3: Temporal Aggregation (Transform — time windows)

**Input:** Consolidated data from cache
**Output:** Time-bucketed aggregates in cache under `sa-cloudfront-aggregate/`

```
30-minute windows → hourly rollups → daily rollups → monthly rollups
```

Each aggregate tracks **finality**:
- `partial` — source data may still arrive (e.g., current hour)
- `final` — all source data complete (e.g., yesterday)

Partial aggregates are recomputed on request. Final aggregates are never recomputed.

### Step 4: Archive (Store — lifecycle)

**Input:** Processed raw log files in S3
**Output:** Files moved to S3 Glacier/IA

The live S3 bucket acts as a queue:
- Unprocessed files = "pending work"
- After successful ingestion, the original S3 file is archived or marked as processed

---

## Key Design Principles

1. **Cache everything** — every step's output lives in the cache service, browsable and inspectable
2. **Idempotent** — re-running any step with the same input produces the same output
3. **Independent steps** — each step reads from cache, writes to cache; no in-memory state between steps
4. **Manual first, automate later** — Steps 1–3 are triggered via REST API; Step 5 (S3 events → Lambda) comes later
5. **Finality tracking** — don't recompute what's already final

---

## Data Flow Diagram

```
[S3 Bucket]
    │ gzip + tab-delimited
    ▼
[Step 1: Raw Ingestion]
    │ typed JSON events
    ▼
[Cache: sa-cloudfront-raw/]
    │
    ▼
[Step 2: Consolidation]
    │ grouped summaries
    ▼
[Cache: sa-cloudfront-consolidated/]
    │
    ▼
[Step 3: Temporal Aggregation]
    │ 30min → hourly → daily → monthly
    ▼
[Cache: sa-cloudfront-aggregate/]
    │
    ▼
[SA REST API]
    │
    ▼
[Admin UI — Traffic Dashboard]
```

---

## What Makes LETS Different from Standard ETL

| Traditional ETL | LETS |
|----------------|------|
| Runs as a batch job | Runs as on-demand API calls |
| All-or-nothing | Each step independent |
| Results go to a data warehouse | Results go to cache service |
| Hard to inspect intermediate state | Every step's output is browsable |
| Scheduled (cron) | Manual first, then event-driven |
| Heavy infrastructure | Runs inside existing Lambda |
