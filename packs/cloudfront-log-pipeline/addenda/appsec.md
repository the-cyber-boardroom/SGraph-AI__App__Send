# CloudFront Log Pipeline — AppSec Addendum

**Version:** v0.4.4
**Role:** AppSec + DPO

---

## Privacy-by-Design: No IP Addresses

The CloudFront real-time log configuration deliberately **excludes the `c-ip` field** (client IP address). This is the project's primary privacy guarantee — the server never stores data that can identify individual users.

### What Must Be Verified

1. **The `c-ip` field is NOT in `CF_LOG_FIELDS`** — the field list in `CloudFront__Logs__Collector.py` defines exactly which fields are parsed. If `c-ip` is not in this list, it cannot appear in parsed data.

2. **No IP address patterns in raw log data** — even though the CloudFront configuration excludes `c-ip`, we must empirically verify that no IP-like strings appear in the actual log files.

3. **No IP address patterns in cached data** — after ingestion, the cached JSON must not contain any field that looks like an IP address.

### Testing Approach (Decision D062)

The human decided that IP verification will be done via tests:

**Unit tests:**
```python
def test__no_ip_in_field_list():
    """CF_LOG_FIELDS must not contain c-ip or any IP-related field"""
    ip_fields = ['c-ip', 'cs-ip', 'client-ip', 'x-forwarded-for']
    for field in CF_LOG_FIELDS:
        assert field not in ip_fields

def test__no_ip_in_parsed_event():
    """Parsed events must not contain IP address patterns"""
    import re
    ip_pattern = re.compile(r'\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b')
    events = collector.collect()
    for event in events:
        for key, value in event.items():
            assert not ip_pattern.search(str(value)), \
                f"IP address found in field '{key}': {value}"
```

**Integration tests:**
- Parse synthetic log files with known content
- Verify no field in the parsed output contains IP-like patterns

**Live tests (run by human):**
- Connect to real S3 bucket with real CloudFront logs
- Process actual log files
- Assert no IP patterns in any parsed field

### Data Classification

| Data Element | Classification | Stored? | Notes |
|-------------|---------------|---------|-------|
| URL paths (`cs-uri-stem`) | Non-sensitive | Yes | Public URL structure |
| HTTP status codes | Non-sensitive | Yes | Aggregate metric |
| User agents | Low sensitivity | Yes | Browser identification, not user identification |
| Edge locations | Non-sensitive | Yes | CloudFront POP codes (e.g. LHR62-C5) |
| Request IDs | Non-sensitive | Yes | CloudFront internal reference |
| TLS versions/ciphers | Non-sensitive | Yes | Security posture metrics |
| IP addresses | **PII — MUST NOT EXIST** | **NO** | Excluded at CloudFront config level |

### Recommendations

1. Add a CI test that fails if `c-ip` is ever added to `CF_LOG_FIELDS`
2. Add a runtime assertion in the ingestion service that checks for IP patterns
3. Document the CloudFront real-time log field selection in the deployment runbook (so it's never accidentally changed)
