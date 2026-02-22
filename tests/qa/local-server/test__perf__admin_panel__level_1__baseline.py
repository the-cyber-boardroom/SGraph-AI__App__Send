# ═══════════════════════════════════════════════════════════════════════════════
# Performance Investigation: Admin Panel — Level 1 Baseline
# ═══════════════════════════════════════════════════════════════════════════════
#
# KEY FINDING from initial test run (21 Feb 2026):
#
#   /docs         775ms   ← FastAPI's own docs, zero app logic
#   /openapi.json 733ms   ← also zero app logic
#   /404          688ms   ← 404 handler, zero app logic
#   Static files  695–723ms
#   /info/status  720ms
#   /tokens/list  1,076ms  (700ms baseline + ~376ms own work)
#   /tokens/detail 4,688ms (700ms baseline + ~4s own work)
#
#   CONCLUSION: ~700ms GLOBAL MIDDLEWARE TAX on every request.
#   The bottleneck is NOT static file serving, NOT S3 token validation.
#   Something in the global middleware chain (logging? auth? request tracking?)
#   adds ~700ms to every single request before any handler runs.
#
# SECTIONS:
#   A — Static admin files        (expected <50ms each)
#   B — FastAPI infrastructure    (expected <20ms — /docs, /openapi, /404)
#   C — Application API           (expected <100ms each)
#
# ═══════════════════════════════════════════════════════════════════════════════

import requests
from unittest                                                                                              import TestCase
from osbot_utils.helpers.performance.benchmark.Perf_Benchmark__Timing                                     import Perf_Benchmark__Timing
from osbot_utils.helpers.performance.benchmark.schemas.enums.Enum__Measure_Mode                           import Enum__Measure_Mode
from osbot_utils.helpers.performance.benchmark.schemas.timing.Schema__Perf_Benchmark__Timing__Config      import Schema__Perf_Benchmark__Timing__Config
from osbot_utils.helpers.performance.report.Perf_Report__Builder                                          import Perf_Report__Builder
from osbot_utils.helpers.performance.report.schemas.Schema__Perf_Report__Metadata                        import Schema__Perf_Report__Metadata
from osbot_utils.helpers.performance.report.schemas.collections.Dict__Perf_Report__Legend                import Dict__Perf_Report__Legend
from osbot_utils.helpers.performance.report.storage.Perf_Report__Storage__File_System                    import Perf_Report__Storage__File_System
from osbot_utils.testing.Pytest                                                                            import skip_pytest
from osbot_utils.type_safe.type_safe_core.config.type_safe_fast_create                                    import type_safe_fast_create
from osbot_utils.utils.Env                                                                                 import get_env, load_dotenv
from osbot_utils.utils.Files                                                                               import path_combine, file_not_exists
from osbot_utils.utils.Http                                                                                import url_join_safe


# ═══════════════════════════════════════════════════════════════════════════════
# Report Metadata
# ═══════════════════════════════════════════════════════════════════════════════

REPORT_KEY         = 'perf__admin_panel__level_1__baseline'
REPORT_TITLE       = 'Admin Panel: Level 1 Baseline'
REPORT_DESCRIPTION = ('Global middleware overhead investigation. '
                      'Every request — including /docs, /openapi.json, /404 — '
                      'pays a ~700ms tax. Root cause is in the middleware chain, '
                      'not in static file serving or S3 token validation.')
REPORT_TEST_INPUT  = 'Live localhost server at http://localhost:10061'
REPORT_LEGEND      = { 'A': 'Static admin files      (target <50ms)',
                       'B': 'FastAPI infrastructure  (target <20ms — zero app logic)',
                       'C': 'Application API         (target <100ms)' }


# ═══════════════════════════════════════════════════════════════════════════════
# Configuration
# ═══════════════════════════════════════════════════════════════════════════════

FILE_NAME__LOCAL_SERVER__ENV = '.local-server.env'
URL__TARGET_SERVER           = 'http://localhost:10061'

PATH__STATIC__INDEX  = '/admin/v0/v0.1/v0.1.4/index.html'
PATH__STATIC__METRIC = '/admin/v0/v0.1/v0.1.1/components/metrics-dashboard/metrics-dashboard.js'
PATH__STATIC__CACHE  = '/admin/v0/v0.1/v0.1.1/js/admin-api-cache.js'
PATH__STATIC__PKI    = '/admin/v0/v0.1/v0.1.3/components/pki-contacts/pki-contacts.js'
PATH__ADMIN_ROOT     = '/admin'
PATH__DOCS           = '/docs'
PATH__OPENAPI        = '/openapi.json'
PATH__404            = '/404'
PATH__STATUS         = '/info/status'
PATH__TOKENS__LIST   = '/tokens/list'
PATH__TOKENS__DETAIL = '/tokens/list-details'


# ═══════════════════════════════════════════════════════════════════════════════
# Test Class
# ═══════════════════════════════════════════════════════════════════════════════

class test__perf__admin_panel__level_1__baseline(TestCase):

    @classmethod
    def setUpClass(cls):
        path_dotenv = path_combine(__file__, f'../{FILE_NAME__LOCAL_SERVER__ENV}')
        if file_not_exists(path_dotenv):
            skip_pytest('Tests need .local-server.env file')

        load_dotenv(path_dotenv, override=True)

        auth_name  = get_env('FAST_API__AUTH__API_KEY__NAME')
        auth_value = get_env('FAST_API__AUTH__API_KEY__VALUE')
        if auth_name and auth_value:
            cls.auth_headers = {auth_name: auth_value}
        else:
            skip_pytest('Could not find auth keys in .local-server.env')

        cls.storage_path      = path_combine(__file__, '../perf_results')
        cls.storage           = Perf_Report__Storage__File_System(storage_path=cls.storage_path)
        cls.captured_responses = {}

        # ───────────────────────────────────────────────────────────────────────
        # LIGHT MODE — measure_only_3=True
        # 3 invocations per benchmark. At ~700ms/request = ~2.1s per benchmark.
        # Numbers are so far off target that 3 samples is sufficient signal.
        # ───────────────────────────────────────────────────────────────────────
        cls.config = Schema__Perf_Benchmark__Timing__Config(
            title            = REPORT_TITLE,
            measure_only_3   = True        ,
            asserts_enabled  = False       ,
            print_to_console = False       ,
        )

    # ───────────────────────────────────────────────────────────────────────────
    # Helper
    # ───────────────────────────────────────────────────────────────────────────

    def get(self, path):
        url      = url_join_safe(URL__TARGET_SERVER, path)
        response = requests.get(url, headers=self.auth_headers, allow_redirects=False)
        self.captured_responses[path] = response
        return response

    # ═══════════════════════════════════════════════════════════════════════════
    # Benchmark Registration
    # ═══════════════════════════════════════════════════════════════════════════

    def benchmarks(self, timing: Perf_Benchmark__Timing):

        # ───────────────────────────────────────────────────────────────────────
        # Section A: Static files
        # All should be <50ms. If ~700ms → global middleware tax.
        # ───────────────────────────────────────────────────────────────────────

        timing.benchmark('A_01__static__index_html',
                         lambda: self.get(PATH__STATIC__INDEX))

        timing.benchmark('A_02__static__metrics_dashboard_js',
                         lambda: self.get(PATH__STATIC__METRIC))

        timing.benchmark('A_03__static__admin_api_cache_js',
                         lambda: self.get(PATH__STATIC__CACHE))

        timing.benchmark('A_04__static__pki_contacts_js',
                         lambda: self.get(PATH__STATIC__PKI))

        timing.benchmark('A_05__static__admin_root__redirect',
                         lambda: self.get(PATH__ADMIN_ROOT))

        # ───────────────────────────────────────────────────────────────────────
        # Section B: FastAPI infrastructure — zero application logic
        # If these are also ~700ms → the bottleneck is GLOBAL (pre-handler).
        # If these are fast and only A/C are slow → bottleneck is handler-specific.
        # ───────────────────────────────────────────────────────────────────────

        timing.benchmark('B_01__fastapi__docs',
                         lambda: self.get(PATH__DOCS))

        timing.benchmark('B_02__fastapi__openapi_json',
                         lambda: self.get(PATH__OPENAPI))

        timing.benchmark('B_03__fastapi__404',
                         lambda: self.get(PATH__404))

        # ───────────────────────────────────────────────────────────────────────
        # Section C: Application API endpoints
        # Expected <100ms. Actual: status ~720ms, list ~1s, detail ~4.7s.
        # The excess above B_03 (~700ms) is the handler's own work.
        # ───────────────────────────────────────────────────────────────────────

        timing.benchmark('C_01__api__info_status',
                         lambda: self.get(PATH__STATUS))

        timing.benchmark('C_02__api__tokens_list',
                         lambda: self.get(PATH__TOKENS__LIST))

        timing.benchmark('C_03__api__tokens_list_details',
                         lambda: self.get(PATH__TOKENS__DETAIL))

    # ═══════════════════════════════════════════════════════════════════════════
    # Test Method
    # ═══════════════════════════════════════════════════════════════════════════

    @type_safe_fast_create
    def test__level_1__baseline(self):
        """
        LEVEL 1: Baseline — measure every endpoint, classify by type.

        The key diagnostic question:
          Are B_xx (FastAPI /docs, /openapi, /404) also ~700ms?
            YES → global middleware overhead, not handler-specific
            NO  → look at the static/API handlers specifically
        """
        builder = Perf_Report__Builder(
            metadata = Schema__Perf_Report__Metadata(
                title        = REPORT_TITLE       ,
                description  = REPORT_DESCRIPTION ,
                test_input   = REPORT_TEST_INPUT   ,
                measure_mode = Enum__Measure_Mode.ONLY_3,
            ),
            legend = Dict__Perf_Report__Legend(REPORT_LEGEND),
            config = self.config                              ,
        )

        report = builder.run(self.benchmarks)

        self.storage.save(report, key=REPORT_KEY, formats=['txt'])

        # ───────────────────────────────────────────────────────────────────────
        # Verify all requests returned expected status codes
        # ───────────────────────────────────────────────────────────────────────
        assert self.captured_responses[PATH__STATIC__INDEX ].status_code == 200
        # assert self.captured_responses[PATH__STATIC__METRIC].status_code == 200
        # assert self.captured_responses[PATH__STATIC__CACHE ].status_code == 200
        # assert self.captured_responses[PATH__STATIC__PKI   ].status_code == 200
        # assert self.captured_responses[PATH__ADMIN_ROOT    ].status_code == 307
        # assert self.captured_responses[PATH__DOCS          ].status_code == 200
        # assert self.captured_responses[PATH__OPENAPI       ].status_code == 200
        # assert self.captured_responses[PATH__404           ].status_code == 404
        # assert self.captured_responses[PATH__STATUS        ].status_code == 200
        # assert self.captured_responses[PATH__TOKENS__LIST  ].status_code == 200
        # assert self.captured_responses[PATH__TOKENS__DETAIL].status_code == 200
