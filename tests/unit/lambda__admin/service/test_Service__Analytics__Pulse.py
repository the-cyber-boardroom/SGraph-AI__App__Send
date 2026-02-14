# ===============================================================================
# Tests for Service__Analytics__Pulse
# Pulse computation from recent analytics events
# ===============================================================================

from unittest                                                                   import TestCase
from sgraph_ai_app_send.lambda__admin.service.Send__Cache__Setup               import create_send_cache_client
from sgraph_ai_app_send.lambda__admin.service.Service__Analytics__Pulse        import compute_pulse


class test_Service__Analytics__Pulse(TestCase):

    @classmethod
    def setUpClass(cls):
        cls.cache_client = create_send_cache_client()

        for i in range(5):
            cls.cache_client.analytics__record_event(dict(
                event_id   = f'pulse-evt-{i}'    ,
                event_type = 'page_view'          ,
                path       = '/index.html'        ,
                method     = 'GET'                ,
                status_code = 200                 ,
                ip_hash    = f'visitor-{i % 3}'   ,       # 3 unique visitors
                content_bytes = 1024              ))

        cls.cache_client.analytics__record_event(dict(
            event_id   = 'pulse-upload'   ,
            event_type = 'file_upload'    ,
            path       = '/transfers/upload/abc' ,
            method     = 'POST'           ,
            status_code = 200             ,
            ip_hash    = 'uploader-1'     ))

    def test__pulse__returns_counts(self):
        result = compute_pulse(self.cache_client, window_minutes=60)
        assert result is not None
        assert 'active_requests'  in result
        assert 'active_visitors'  in result
        assert 'active_transfers' in result
        assert 'window_minutes'   in result

    def test__pulse__counts_requests(self):
        result = compute_pulse(self.cache_client, window_minutes=60)
        assert result['active_requests'] >= 6                                      # At least our 6 events

    def test__pulse__counts_unique_visitors(self):
        result = compute_pulse(self.cache_client, window_minutes=60)
        assert result['active_visitors'] >= 3                                      # At least 3 unique + uploader

    def test__pulse__empty_window(self):
        fresh_client = create_send_cache_client()
        result = compute_pulse(fresh_client, window_minutes=5)
        assert result is not None
        assert result['active_requests'] == 0
