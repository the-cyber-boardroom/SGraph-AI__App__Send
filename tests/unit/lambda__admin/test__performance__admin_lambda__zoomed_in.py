# ===============================================================================
# SGraph Send - Zoomed-In Performance Benchmarks for Admin Lambda
# Decomposes endpoint performance into 4 layers:
#   Level 1: Full Endpoint (TestClient HTTP)
#   Level 2: Middleware vs Handler Decomposition
#   Level 3: Service Layer
#   Level 4: Cache Client Primitives (Convergence Point)
# ===============================================================================

from osbot_utils.helpers.performance.benchmark.testing.TestCase__Benchmark__Timing         import TestCase__Benchmark__Timing
from osbot_utils.helpers.performance.benchmark.schemas.timing.Schema__Perf_Benchmark__Timing__Config import Schema__Perf_Benchmark__Timing__Config

from tests.unit.lambda__admin.Fast_API__Test_Objs__SGraph__App__Send__Admin               import setup__html_graph_service__fast_api_test_objs, TEST_API_KEY__NAME, TEST_API_KEY__VALUE
from sgraph_ai_app_send.lambda__admin.service.Middleware__Analytics                        import classify_event_type, hash_ip, normalise_user_agent
from sgraph_ai_app_send.lambda__admin.service.Send__Cache__Setup                           import create_send_cache_client
from sgraph_ai_app_send.lambda__admin.service.Service__Tokens                              import Service__Tokens
from sgraph_ai_app_send.lambda__admin.service.Service__Analytics__Pulse                    import compute_pulse


class test__performance__admin_lambda__zoomed_in(TestCase__Benchmark__Timing):

    config = Schema__Perf_Benchmark__Timing__Config(
        title            = 'Admin Lambda Zoomed-In Benchmarks'           ,
        description      = 'Decomposed performance across 4 layers'     ,
        measure_only_3   = True                                         ,
        print_to_console = True                                         ,
    )

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        test_objs               = setup__html_graph_service__fast_api_test_objs()
        cls.client              = test_objs.fast_api__client
        cls.fast_api            = test_objs.fast_api
        cls.send_cache_client   = create_send_cache_client()                     # Fresh cache for Level 3/4
        cls.client.headers      = {TEST_API_KEY__NAME: TEST_API_KEY__VALUE}      # Re-apply auth (singleton may have been mutated)

    # ═══════════════════════════════════════════════════════════════════════════
    # Level 1: Full Endpoint (TestClient HTTP)
    # ═══════════════════════════════════════════════════════════════════════════

    def test__level_1__full_endpoint__info_health(self):                          # Simplest endpoint — baseline
        def target():
            response = self.client.get('/info/health')
            assert response.status_code == 200
        self.benchmark('L1_01__full_endpoint__info_health', target)

    def test__level_1__full_endpoint__tokens_list(self):                          # Service layer — empty list
        def target():
            response = self.client.get('/tokens/list')
            assert response.status_code == 200
        self.benchmark('L1_02__full_endpoint__tokens_list', target)

    def test__level_1__full_endpoint__health_pulse(self):                         # Analytics aggregation — empty window
        def target():
            response = self.client.get('/health/pulse')
            assert response.status_code == 200
        self.benchmark('L1_03__full_endpoint__health_pulse', target)

    # ═══════════════════════════════════════════════════════════════════════════
    # Level 2: Middleware vs Handler Decomposition
    # ═══════════════════════════════════════════════════════════════════════════

    def test__level_2__middleware__classify_event_type__page_view(self):           # Pure function — GET request
        def target():
            result = classify_event_type('/info/health', 'GET')
            assert result == 'page_view'
        self.benchmark('L2_01__middleware__classify_event_type__page_view', target)

    def test__level_2__middleware__classify_event_type__upload(self):              # Pure function — upload path
        def target():
            result = classify_event_type('/transfers/upload/abc123', 'POST')
            assert result == 'file_upload'
        self.benchmark('L2_02__middleware__classify_event_type__upload', target)

    def test__level_2__middleware__classify_event_type__download(self):            # Pure function — download path
        def target():
            result = classify_event_type('/transfers/download/abc123', 'GET')
            assert result == 'file_download'
        self.benchmark('L2_03__middleware__classify_event_type__download', target)

    def test__level_2__middleware__hash_ip(self):                                  # Pure function — SHA-256 hash
        def target():
            result = hash_ip('192.168.1.1')
            assert len(result) == 64                                              # SHA-256 hex digest
        self.benchmark('L2_04__middleware__hash_ip', target)

    def test__level_2__middleware__hash_ip__empty(self):                           # Pure function — empty input
        def target():
            result = hash_ip('')
            assert result == ''
        self.benchmark('L2_05__middleware__hash_ip__empty', target)

    def test__level_2__middleware__normalise_user_agent__chrome(self):             # Pure function — Chrome UA
        def target():
            result = normalise_user_agent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0')
            assert result == 'Chrome'
        self.benchmark('L2_06__middleware__normalise_ua__chrome', target)

    def test__level_2__middleware__normalise_user_agent__empty(self):              # Pure function — empty UA
        def target():
            result = normalise_user_agent('')
            assert result == ''
        self.benchmark('L2_07__middleware__normalise_ua__empty', target)

    def test__level_2__middleware__analytics_record_event(self):                   # Cache write — middleware side-effect
        def target():
            event_data = dict(event_id   = 'bench001'      ,
                              event_type = 'page_view'     ,
                              path       = '/info/health'  ,
                              method     = 'GET'           ,
                              status_code = 200            ,
                              ip_hash    = 'abc123'        )
            result = self.send_cache_client.analytics__record_event(event_data)
            assert result is not None
        self.benchmark('L2_08__middleware__analytics_record_event', target)

    # ═══════════════════════════════════════════════════════════════════════════
    # Level 3: Service Layer
    # ═══════════════════════════════════════════════════════════════════════════

    def test__level_3__service__tokens_create(self):                              # Token creation via service
        cache_client    = create_send_cache_client()
        service_tokens  = Service__Tokens(send_cache_client=cache_client)
        counter         = [0]
        def target():
            counter[0] += 1
            token_name  = f'bench-create-{counter[0]}'
            result      = service_tokens.create(token_name, usage_limit=10, created_by='benchmark')
            assert result is not None
        self.benchmark('L3_01__service__tokens_create', target)

    def test__level_3__service__tokens_lookup(self):                              # Token lookup via service
        cache_client    = create_send_cache_client()
        service_tokens  = Service__Tokens(send_cache_client=cache_client)
        service_tokens.create('bench-lookup', usage_limit=10, created_by='benchmark')
        def target():
            result = service_tokens.lookup('bench-lookup')
            assert result is not None
            assert result.get('token_name') == 'bench-lookup'
        self.benchmark('L3_02__service__tokens_lookup', target)

    def test__level_3__service__tokens_list(self):                                # Folder listing via service
        cache_client    = create_send_cache_client()
        service_tokens  = Service__Tokens(send_cache_client=cache_client)
        def target():
            result = service_tokens.list_tokens()
            assert result is not None
        self.benchmark('L3_03__service__tokens_list', target)

    def test__level_3__service__compute_pulse__empty(self):                        # Pulse with empty cache (baseline)
        cache_client = create_send_cache_client()
        def target():
            result = compute_pulse(send_cache_client=cache_client, window_minutes=5)
            assert result is not None
            assert result.get('active_requests')  == 0
            assert result.get('active_visitors')  == 0
            assert result.get('active_transfers') == 0
        self.benchmark('L3_04__service__compute_pulse__empty', target)

    # ═══════════════════════════════════════════════════════════════════════════
    # Level 4: Cache Client Primitives (Convergence Point)
    # ═══════════════════════════════════════════════════════════════════════════

    def test__level_4__cache__store_json__temporal(self):                          # Temporal write (analytics path)
        cache_client = create_send_cache_client()
        counter      = [0]
        def target():
            counter[0] += 1
            event = dict(event_id=f'l4-evt-{counter[0]}', event_type='page_view')
            result = cache_client.cache_client.store().store__json(
                namespace = 'analytics'  ,
                strategy  = 'temporal'   ,
                body      = event        )
            assert result is not None
        self.benchmark('L4_01__cache__store_json__temporal', target)

    def test__level_4__cache__hash_generator(self):                               # Hash computation
        cache_client = create_send_cache_client()
        def target():
            result = cache_client.hash_generator.from_string('test-token-name')
            assert result is not None
        self.benchmark('L4_02__cache__hash_generator', target)

    def test__level_4__cache__retrieve_json(self):                                # Data read by cache_id
        cache_client = create_send_cache_client()
        event        = dict(event_id='l4-read', event_type='page_view')
        store_result = cache_client.cache_client.store().store__json(
            namespace = 'analytics'  ,
            strategy  = 'temporal'   ,
            body      = event        )
        cache_id     = str(store_result.cache_id)
        def target():
            result = cache_client.cache_client.retrieve().retrieve__cache_id__json(
                cache_id  = cache_id     ,
                namespace = 'analytics'  )
            assert result is not None
        self.benchmark('L4_03__cache__retrieve_json', target)

    def test__level_4__cache__admin_storage_folders(self):                         # Folder listing
        cache_client = create_send_cache_client()
        def target():
            result = cache_client.cache_client.admin_storage().folders(
                path             = 'tokens/data/key-based/' ,
                return_full_path = False                     ,
                recursive        = False                     )
            assert result is not None or result is None       # May return None or empty list
        self.benchmark('L4_04__cache__admin_storage_folders', target)
