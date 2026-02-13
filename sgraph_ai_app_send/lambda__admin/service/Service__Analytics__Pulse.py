# ===============================================================================
# SGraph Send - Analytics Pulse Service
# Computes real-time traffic pulse from recent temporal analytics events
# ===============================================================================

from datetime                                                                   import datetime, timezone, timedelta
from sgraph_ai_app_send.lambda__admin.service.Send__Cache__Client              import Send__Cache__Client


def compute_pulse(send_cache_client: Send__Cache__Client,                  # Compute pulse for last N minutes
                  window_minutes: int = 5
                 ):
    now        = datetime.now(timezone.utc)
    year       = now.strftime('%Y')
    month      = now.strftime('%m')
    day        = now.strftime('%d')
    hour       = now.strftime('%H')

    path_prefix = f'data/temporal/{year}/{month}/{day}/{hour}'

    files = send_cache_client.analytics__list_recent_files(path_prefix)

    if not files:
        previous = now - timedelta(hours=1)
        prev_hour = previous.strftime('%H')
        prev_day  = previous.strftime('%d')
        prev_month = previous.strftime('%m')
        prev_year  = previous.strftime('%Y')
        prev_prefix = f'data/temporal/{prev_year}/{prev_month}/{prev_day}/{prev_hour}'
        files = send_cache_client.analytics__list_recent_files(prev_prefix)

    active_requests  = 0
    active_visitors  = set()
    active_transfers = 0

    cutoff = now - timedelta(minutes=window_minutes)

    for file_path in files:
        if not str(file_path).endswith('.json') or str(file_path).endswith('.config') or str(file_path).endswith('.metadata'):
            continue

        cache_id = _extract_cache_id_from_path(str(file_path))
        if not cache_id:
            continue

        event = send_cache_client.analytics__retrieve_event(cache_id)
        if event is None:
            continue

        active_requests += 1

        ip_hash = event.get('ip_hash', '')
        if ip_hash:
            active_visitors.add(ip_hash)

        event_type = event.get('event_type', '')
        if event_type in ('file_upload', 'file_download'):
            active_transfers += 1

    return dict(
        window_minutes   = window_minutes          ,
        active_requests  = active_requests          ,
        active_visitors  = len(active_visitors)     ,
        active_transfers = active_transfers         )


def _extract_cache_id_from_path(file_path):                                # Extract cache_id from temporal file path
    parts = file_path.replace('\\', '/').split('/')
    if not parts:
        return None
    filename = parts[-1]
    if filename.endswith('.json'):
        return filename[:-5]                                               # Remove .json extension
    return None
