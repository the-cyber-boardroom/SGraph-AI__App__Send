# ===============================================================================
# SGraph Send - Metrics Cache Service
# On-demand collection with cache layer via Send__Cache__Client
# Stores snapshots in cache with TTL-based freshness
# ===============================================================================

import json
import time
from osbot_utils.type_safe.Type_Safe                                                                         import Type_Safe
from osbot_utils.type_safe.primitives.core.Safe_UInt                                                         import Safe_UInt
from sgraph_ai_app_send.lambda__admin.server_analytics.Service__Metrics__Collector                           import Service__Metrics__Collector
from sgraph_ai_app_send.lambda__admin.service.Send__Cache__Client                                            import Send__Cache__Client

NS_METRICS = 'metrics'                                                     # Cache namespace for metrics data

CACHE_KEY__SNAPSHOT        = 'latest-snapshot'                              # Cache key for latest snapshot
CACHE_KEY__CF_LOGS_SUMMARY = 'cf-logs-summary'                             # Cache key for CF logs summary

class Service__Metrics__Cache(Type_Safe):                                  # Metrics collection with cache layer
    send_cache_client    : Send__Cache__Client                             # Cache service wrapper
    metrics_collector    : Service__Metrics__Collector                      # Metrics collection orchestrator
    cache_ttl_seconds    : Safe_UInt = 300                                 # 5 minute cache TTL

    def get_snapshot(self, force_refresh=False) -> dict:                   # Get metrics snapshot (cached or fresh)
        if not force_refresh:
            cached = self._get_cached(CACHE_KEY__SNAPSHOT)
            if cached:
                return cached

        snapshot      = self.metrics_collector.collect_snapshot()
        snapshot_dict = snapshot.json()
        snapshot_dict['_cached_at'] = int(time.time())

        self._store_cached(CACHE_KEY__SNAPSHOT, snapshot_dict)
        return snapshot_dict

    def get_cf_logs_summary(self, logs_bucket, lookback_hours=24, force_refresh=False) -> dict:  # Get CF logs summary (cached)
        if not force_refresh:
            cached = self._get_cached(CACHE_KEY__CF_LOGS_SUMMARY)
            if cached:
                return cached

        summary = self.metrics_collector.collect_cloudfront_logs_summary(
            logs_bucket    = logs_bucket    ,
            lookback_hours = lookback_hours )
        summary['_cached_at'] = int(time.time())

        self._store_cached(CACHE_KEY__CF_LOGS_SUMMARY, summary)
        return summary

    def get_cache_status(self) -> dict:                                    # Return cache freshness info
        snapshot_cached = self._get_cached(CACHE_KEY__SNAPSHOT)
        logs_cached     = self._get_cached(CACHE_KEY__CF_LOGS_SUMMARY)
        now             = int(time.time())

        def _age(cached):
            if cached and '_cached_at' in cached:
                return now - cached['_cached_at']
            return None

        return dict(snapshot_cached  = snapshot_cached is not None             ,
                    snapshot_age_s   = _age(snapshot_cached)                    ,
                    logs_cached      = logs_cached is not None                 ,
                    logs_age_s       = _age(logs_cached)                        ,
                    cache_ttl_s      = int(self.cache_ttl_seconds)             )

    # ═══════════════════════════════════════════════════════════════════════
    # Internal — Cache Operations
    # ═══════════════════════════════════════════════════════════════════════

    def _get_cached(self, cache_key) -> dict:                              # Get cached data if still fresh
        try:
            result = self.send_cache_client.cache_client.retrieve().retrieve__cache_key__json(
                cache_key = cache_key ,
                namespace = NS_METRICS)
            if result and '_cached_at' in result:
                age = int(time.time()) - result['_cached_at']
                if age <= int(self.cache_ttl_seconds):
                    return result
        except Exception:
            pass
        return None

    def _store_cached(self, cache_key, data):                              # Store data in cache
        try:
            self.send_cache_client.cache_client.store().store__json__cache_key(
                namespace = NS_METRICS ,
                strategy  = 'key_based',
                cache_key = cache_key  ,
                file_id   = cache_key  ,
                body      = data       )
        except Exception:
            pass
