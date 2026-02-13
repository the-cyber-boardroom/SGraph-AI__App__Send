# ===============================================================================
# Tests for Routes__Analytics
# Integration tests: admin FastAPI app with pulse endpoint
# ===============================================================================

from unittest                                                                       import TestCase
from tests.unit.lambda__admin.Fast_API__Test_Objs__SGraph__App__Send__Admin        import setup__html_graph_service__fast_api_test_objs


class test_Routes__Analytics(TestCase):

    @classmethod
    def setUpClass(cls):
        test_objs       = setup__html_graph_service__fast_api_test_objs()
        cls.client      = test_objs.fast_api__client
        cls.fast_api    = test_objs.fast_api

    def test__pulse__returns_200(self):
        response = self.client.get('/health/pulse')
        assert response.status_code == 200

    def test__pulse__returns_counts(self):
        response = self.client.get('/health/pulse')
        data = response.json()
        assert 'active_requests'  in data
        assert 'active_visitors'  in data
        assert 'active_transfers' in data
        assert 'window_minutes'   in data

    def test__pulse__custom_window(self):
        response = self.client.get('/health/pulse?window_minutes=15')
        assert response.status_code == 200
        data = response.json()
        assert data.get('window_minutes') == 15
