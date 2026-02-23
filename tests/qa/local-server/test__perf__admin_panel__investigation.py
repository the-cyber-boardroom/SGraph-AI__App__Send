# # ═══════════════════════════════════════════════════════════════════════════════
# # Performance Investigation: Admin Panel Performance
# # Bug: Static files ~800–900ms, API endpoints ~5–10s on localhost
# # ═══════════════════════════════════════════════════════════════════════════════
# #
# # Follow the "zoomed-in" pattern — progressively narrow from symptom to root cause.
# # Each level is a test. The test suite is the investigation log.
# # When the root cause is fixed, these tests become the regression suite.
# #
# # LEVEL 1 — Baseline
# #   Confirm the problem exists. Measure every endpoint. Classify by type.
# #   Expected: static <50ms, API <100ms. Actual: static ~850ms, API ~5s.
# #
# # LEVEL 2 — Response Analysis
# #   Inspect what the server is actually returning. No extra requests — uses
# #   responses captured during Level 1 benchmarks as side effects.
# #   Check: Cache-Control headers, auth headers present on static, response sizes.
# #
# # LEVEL 3 — Middleware Isolation
# #   Run the same requests without auth headers, compare timing.
# #   If static timing drops → auth middleware is running on static files (wrong).
# #   If static timing is unchanged → the bottleneck is elsewhere.
# #   Measure the static-vs-API gap to quantify auth-vs-handler overhead.
# #
# # LEVEL 4 — Root Cause Hypotheses (Separate Test Methods)
# #   H1: Auth middleware runs S3 calls for static files         → measure auth-gated vs open
# #   H2: Health/stats endpoints scan S3 buckets on every call  → measure S3 call count
# #   H3: Static files not cached / read from disk per-request  → check ETag, Last-Modified
# #
# # ───────────────────────────────────────────────────────────────────────────────
# # LIGHT MODE ONLY — measure_only_3=True
# #   3 invocations per benchmark. At 800ms/req → ~2.4s per static benchmark.
# #   At 5s/req → ~15s per API benchmark. We're looking for 10–100x anomalies,
# #   not statistical precision. Three samples is enough to see 800ms vs 50ms.
# # ═══════════════════════════════════════════════════════════════════════════════
#
# import requests
# from unittest                                                                                              import TestCase
# from osbot_utils.helpers.performance.benchmark.Perf_Benchmark__Timing                                     import Perf_Benchmark__Timing
# from osbot_utils.helpers.performance.benchmark.schemas.timing.Schema__Perf_Benchmark__Timing__Config      import Schema__Perf_Benchmark__Timing__Config
# from osbot_utils.helpers.performance.benchmark.schemas.safe_str.Safe_Str__Benchmark_Id                    import Safe_Str__Benchmark_Id
# from osbot_utils.testing.Pytest                                                                            import skip_pytest
# from osbot_utils.utils.Env                                                                                 import get_env, load_dotenv
# from osbot_utils.utils.Files                                                                               import path_combine, file_not_exists
# from osbot_utils.utils.Http                                                                                import url_join_safe
#
#
# # ═══════════════════════════════════════════════════════════════════════════════
# # Configuration
# # ═══════════════════════════════════════════════════════════════════════════════
#
# FILE_NAME__LOCAL_SERVER__ENV = '.local-server.env'
# URL__TARGET_SERVER           = 'http://localhost:10061'
#
# # ───────────────────────────────────────────────────────────────────────────────
# # Time thresholds (nanoseconds) — for assert_less_than
# # These are what the values SHOULD be once fixed, used to confirm regression.
# # ───────────────────────────────────────────────────────────────────────────────
#
# time_50_ms    =    50_000_000   # 50ms   — target for static files
# time_100_ms   =   100_000_000   # 100ms  — target for fast API (health, stats)
# time_500_ms   =   500_000_000   # 500ms  — upper bound for API under investigation
# time_1_sec    = 1_000_000_000   # 1s     — current (broken) fast path
# time_10_sec   = 10_000_000_000  # 10s    — current (broken) slow path
#
# # ───────────────────────────────────────────────────────────────────────────────
# # Endpoint paths
# # ───────────────────────────────────────────────────────────────────────────────
#
# PATH__DOCS           = '/docs'
# PATH__STATUS         = '/info/status'
# PATH__OPENAPI        = '/openapi.json'
# PATH__404            = '/404'
# PATH__ADMIN_ROOT     = '/admin'
# PATH__STATIC__INDEX  = '/admin/v0/v0.1/v0.1.4/index.html'
# PATH__STATIC__METRIC = '/admin/v0/v0.1/v0.1.1/components/metrics-dashboard/metrics-dashboard.js'
# PATH__STATIC__CACHE  = '/admin/v0/v0.1/v0.1.1/js/admin-api-cache.js'
# PATH__STATIC__PKI    = '/admin/v0/v0.1/v0.1.3/components/pki-contacts/pki-contacts.js'
# PATH__TOKENS__LIST   = '/tokens/list'
# PATH__TOKENS__DETAIL = '/tokens/list-details'
#
#
# # ═══════════════════════════════════════════════════════════════════════════════
# # Investigation Test Class
# # ═══════════════════════════════════════════════════════════════════════════════
#
# class test__perf__admin_panel__investigation(TestCase):
#
#     @classmethod
#     def setUpClass(cls):
#         path_dotenv = path_combine(__file__, f'../{FILE_NAME__LOCAL_SERVER__ENV}')
#         if file_not_exists(path_dotenv):
#             skip_pytest('Tests need .local-server.env file')
#
#         load_dotenv(path_dotenv, override=True)
#
#         auth_name  = get_env('FAST_API__AUTH__API_KEY__NAME')
#         auth_value = get_env('FAST_API__AUTH__API_KEY__VALUE')
#
#         if auth_name and auth_value:
#             cls.auth_headers = {auth_name: auth_value}
#         else:
#             skip_pytest('Could not find auth keys in .local-server.env')
#
#         # ───────────────────────────────────────────────────────────────────────
#         # Shared benchmark config — LIGHT MODE ONLY
#         # measure_only_3=True: 3 invocations per benchmark
#         # asserts_enabled=False: we are measuring, not asserting thresholds yet
#         # print_to_console=True: see progress as the suite runs
#         # ───────────────────────────────────────────────────────────────────────
#         cls.config = Schema__Perf_Benchmark__Timing__Config(
#             title            = 'Admin Panel Performance Investigation',
#             measure_only_3   = True ,
#             asserts_enabled  = False,
#             print_to_console = True ,
#         )
#
#         # ───────────────────────────────────────────────────────────────────────
#         # Response capture dict — populated during Level 1 benchmark runs
#         # so Level 2 can inspect headers without making additional requests
#         # ───────────────────────────────────────────────────────────────────────
#         cls.captured_responses = {}
#
#     # ───────────────────────────────────────────────────────────────────────────
#     # Helpers
#     # ───────────────────────────────────────────────────────────────────────────
#
#     def get(self, path, headers=None, allow_redirects=False):
#         """Make authenticated GET request, capturing response as side-effect."""
#         used_headers = headers if headers is not None else self.auth_headers
#         url          = url_join_safe(URL__TARGET_SERVER, path)
#         response     = requests.get(url, headers=used_headers, allow_redirects=allow_redirects)
#         self.captured_responses[path] = response
#         return response
#
#     def get__no_auth(self, path, allow_redirects=False):
#         """Make unauthenticated GET request."""
#         url      = url_join_safe(URL__TARGET_SERVER, path)
#         response = requests.get(url, allow_redirects=allow_redirects)
#         self.captured_responses[f'{path}__no_auth'] = response
#         return response
#
#     def print_response_analysis(self, label, response):
#         """Print response header breakdown for Level 2 inspection."""
#         headers = response.headers
#         print(f'\n  [{label}]')
#         print(f'    Status         : {response.status_code}')
#         print(f'    Elapsed        : {response.elapsed.total_seconds() * 1000:.1f} ms')
#         print(f'    Content-Type   : {headers.get("Content-Type", "(none)")}')
#         print(f'    Content-Length : {headers.get("Content-Length", "(none)")}')
#         print(f'    Cache-Control  : {headers.get("Cache-Control", "(none)")}')
#         print(f'    ETag           : {headers.get("ETag", "(none)")}')
#         print(f'    Last-Modified  : {headers.get("Last-Modified", "(none)")}')
#         print(f'    X-Auth-*       : {[k for k in headers if k.lower().startswith("x-auth")]}')
#         print(f'    All headers    : {dict(headers)}')
#
#
#     # ═══════════════════════════════════════════════════════════════════════════
#     # LEVEL 1 — Baseline: confirm the problem, measure every endpoint
#     # ═══════════════════════════════════════════════════════════════════════════
#     #
#     # Expected (healthy):
#     #   Static files : A_xx  <50ms
#     #   FastAPI infra : B_xx  <50ms  (docs, openapi.json are special — may be larger)
#     #   API endpoints : C_xx  <100ms
#     #
#     # Actual (broken):
#     #   Static files : ~850ms  → 17× over target
#     #   API endpoints: ~5–10s  → 50–100× over target
#     # ═══════════════════════════════════════════════════════════════════════════
#
#     def _level_1_benchmarks(self, timing: Perf_Benchmark__Timing):
#         """
#         Register all endpoint benchmarks for Level 1.
#         Responses are captured as a side-effect for Level 2 inspection.
#         """
#
#         # ───────────────────────────────────────────────────────────────────────
#         # Section A: Static files — the known 800ms problem
#         # ───────────────────────────────────────────────────────────────────────
#
#         def a_01__static__index_html():
#             return self.get(PATH__STATIC__INDEX)
#
#         timing.benchmark(Safe_Str__Benchmark_Id('A_01__static__index_html'), a_01__static__index_html)
#
#         # def a_02__static__metrics_dashboard_js():
#         #     return self.get(PATH__STATIC__METRIC)
#         #
#         # timing.benchmark(Safe_Str__Benchmark_Id('A_02__static__metrics_dashboard_js'), a_02__static__metrics_dashboard_js)
#         #
#         # def a_03__static__admin_api_cache_js():
#         #     return self.get(PATH__STATIC__CACHE)
#         #
#         # timing.benchmark(Safe_Str__Benchmark_Id('A_03__static__admin_api_cache_js'), a_03__static__admin_api_cache_js)
#         #
#         # def a_04__static__pki_contacts_js():
#         #     return self.get(PATH__STATIC__PKI)
#         #
#         # timing.benchmark(Safe_Str__Benchmark_Id('A_04__static__pki_contacts_js'), a_04__static__pki_contacts_js)
#         #
#         # def a_05__admin_root__redirect():
#         #     return self.get(PATH__ADMIN_ROOT)
#         #
#         # timing.benchmark(Safe_Str__Benchmark_Id('A_05__admin_root__redirect'), a_05__admin_root__redirect)
#         #
#         # # ───────────────────────────────────────────────────────────────────────
#         # # Section B: FastAPI infrastructure routes
#         # # These bypass most application logic — if they are slow,
#         # # the overhead is in the framework itself or middleware wrapping everything.
#         # # ───────────────────────────────────────────────────────────────────────
#         #
#         # def b_01__fastapi__docs():
#         #     return self.get(PATH__DOCS)
#         #
#         # timing.benchmark(Safe_Str__Benchmark_Id('B_01__fastapi__docs'), b_01__fastapi__docs)
#         #
#         # def b_02__fastapi__openapi_json():
#         #     return self.get(PATH__OPENAPI)
#         #
#         # timing.benchmark(Safe_Str__Benchmark_Id('B_02__fastapi__openapi_json'), b_02__fastapi__openapi_json)
#         #
#         # def b_03__fastapi__404():
#         #     return self.get(PATH__404)
#         #
#         # timing.benchmark(Safe_Str__Benchmark_Id('B_03__fastapi__404'), b_03__fastapi__404)
#         #
#         # # ───────────────────────────────────────────────────────────────────────
#         # # Section C: Application API endpoints — the 5–10s problem
#         # # ───────────────────────────────────────────────────────────────────────
#         #
#         # def c_01__api__status():
#         #     return self.get(PATH__STATUS)
#         #
#         # timing.benchmark(Safe_Str__Benchmark_Id('C_01__api__status'), c_01__api__status)
#         #
#         # def c_02__api__tokens_list():
#         #     return self.get(PATH__TOKENS__LIST)
#         #
#         # timing.benchmark(Safe_Str__Benchmark_Id('C_02__api__tokens_list'), c_02__api__tokens_list)
#         #
#         # def c_03__api__tokens_list_details():
#         #     return self.get(PATH__TOKENS__DETAIL)
#         #
#         # timing.benchmark(Safe_Str__Benchmark_Id('C_03__api__tokens_list_details'), c_03__api__tokens_list_details)
#
#
#     def test__level_1__baseline(self):
#         """
#         LEVEL 1: Baseline measurement of all endpoints.
#
#         Prints a timing table. Look for:
#           - A_xx (static): should be <50ms, if ~850ms → static path is broken
#           - B_xx (infra):  should be <50ms, if also slow → middleware wraps everything
#           - C_xx (API):    should be <100ms, if ~5–10s  → expensive backend calls
#
#         Key diagnostic: if B_xx (FastAPI /docs, /openapi.json) is also slow,
#         the bottleneck is in middleware that runs before every request, not just
#         the application handler. If B_xx is fast but A_xx is slow, the problem
#         is specifically in the static file serving path.
#         """
#         print('\n' + '═' * 70)
#         print('  LEVEL 1: Baseline — measuring all endpoints (light mode, 3 reps)')
#         print('═' * 70)
#
#         with Perf_Benchmark__Timing(config=self.config) as timing:
#             self._level_1_benchmarks(timing)
#
#         # ───────────────────────────────────────────────────────────────────────
#         # Print summary with interpretation
#         # ───────────────────────────────────────────────────────────────────────
#         results = timing.results
#         print('\n  Summary:')
#         for benchmark_id, result in results.items():
#             score_ms = int(result.raw_score) / 1_000_000
#             flag     = '🔴' if score_ms > 500 else ('🟡' if score_ms > 100 else '🟢')
#             print(f'    {flag}  {str(benchmark_id):<45} {score_ms:>8.1f} ms')
#
#         # ───────────────────────────────────────────────────────────────────────
#         # Verify all requests at least returned expected status codes
#         # (even if slow — confirms we're measuring the right things)
#         # ───────────────────────────────────────────────────────────────────────
#         assert self.captured_responses[PATH__STATIC__INDEX ].status_code == 200
#         # assert self.captured_responses[PATH__STATIC__METRIC].status_code == 200
#         # assert self.captured_responses[PATH__STATIC__CACHE ].status_code == 200
#         # assert self.captured_responses[PATH__STATIC__PKI   ].status_code == 200
#         # assert self.captured_responses[PATH__ADMIN_ROOT    ].status_code == 307  # redirect
#         # assert self.captured_responses[PATH__DOCS          ].status_code == 200
#         # assert self.captured_responses[PATH__OPENAPI       ].status_code == 200
#         # assert self.captured_responses[PATH__404           ].status_code == 404
#         # assert self.captured_responses[PATH__STATUS        ].status_code == 200
#         # assert self.captured_responses[PATH__TOKENS__LIST  ].status_code == 200
#         # assert self.captured_responses[PATH__TOKENS__DETAIL].status_code == 200
#
#
#
#     # ═══════════════════════════════════════════════════════════════════════════
#     # LEVEL 2 — Response Analysis: inspect what the server is returning
#     # ═══════════════════════════════════════════════════════════════════════════
#     #
#     # Uses responses captured by Level 1 benchmarks — no extra requests.
#     # Checks that should reveal the static file bottleneck root cause:
#     #
#     #   Cache-Control missing  → server not telling clients to cache → re-fetch every time
#     #   ETag / Last-Modified   → needed for conditional GET (304 Not Modified)
#     #   Auth headers on static → auth middleware intercepting static files
#     #   Huge content-length    → static files too large (unlikely but worth checking)
#     #
#     # Run Level 1 first: test__level_1__baseline must run before this test.
#     # ═══════════════════════════════════════════════════════════════════════════
#
#     def test__level_2__response_analysis(self):
#         """
#         LEVEL 2: Inspect response headers for all captured endpoint responses.
#
#         Look for:
#           Cache-Control: should be 'public, max-age=...' for static — if absent, no caching
#           ETag:          should be present for static — enables 304 conditional responses
#           Last-Modified: same — enables conditional GET
#           X-Auth-*:      if present on static responses → auth middleware ran on static file
#         """
#         if not self.captured_responses:
#             self.test__level_1__baseline()                                       # ensure responses exist
#
#         print('\n' + '═' * 70)
#         print('  LEVEL 2: Response analysis — header inspection')
#         print('═' * 70)
#
#         static_paths = [PATH__STATIC__INDEX, PATH__STATIC__METRIC,
#                         PATH__STATIC__CACHE, PATH__STATIC__PKI   ]
#         api_paths    = [PATH__STATUS, PATH__TOKENS__LIST, PATH__TOKENS__DETAIL]
#
#         # ───────────────────────────────────────────────────────────────────────
#         # Analyse static file responses
#         # ───────────────────────────────────────────────────────────────────────
#         print('\n  Static files:')
#         static_has_cache_control  = []
#         static_has_etag           = []
#         static_has_auth_header    = []
#         static_elapsed_ms         = []
#
#         for path in static_paths:
#             response = self.captured_responses.get(path)
#             if not response:
#                 print(f'    ⚠️  No captured response for {path} — run Level 1 first')
#                 continue
#             self.print_response_analysis(path, response)
#             static_has_cache_control.append(bool(response.headers.get('Cache-Control')))
#             static_has_etag         .append(bool(response.headers.get('ETag')))
#             static_elapsed_ms       .append(response.elapsed.total_seconds() * 1000)
#             static_has_auth_header  .append(
#                 any(k.lower().startswith('x-auth') for k in response.headers)
#             )
#
#         # ───────────────────────────────────────────────────────────────────────
#         # Analyse API responses
#         # ───────────────────────────────────────────────────────────────────────
#         print('\n  API endpoints:')
#         for path in api_paths:
#             response = self.captured_responses.get(path)
#             if response:
#                 self.print_response_analysis(path, response)
#
#         # ───────────────────────────────────────────────────────────────────────
#         # Diagnostic summary — these print findings, not hard assertions,
#         # because the point is to identify root causes, not to fail fast
#         # ───────────────────────────────────────────────────────────────────────
#         print('\n  Findings:')
#
#         if not all(static_has_cache_control):
#             print('  🔴  FINDING: Static files missing Cache-Control header')
#             print('              → clients re-fetch on every navigation')
#             print('              → fix: add Cache-Control: public, max-age=3600 to StaticFiles mount')
#
#         if not all(static_has_etag):
#             print('  🔴  FINDING: Static files missing ETag header')
#             print('              → conditional GET (304) not possible')
#             print('              → fix: ensure StaticFiles is configured with ETag support')
#
#         if any(static_has_auth_header):
#             print('  🔴  FINDING: Auth-related headers present on static file responses')
#             print('              → auth middleware is processing static file requests')
#             print('              → fix: exclude /admin/v0/* paths from auth middleware')
#
#         avg_static_ms = sum(static_elapsed_ms) / len(static_elapsed_ms) if static_elapsed_ms else 0
#         print(f'\n  Average static elapsed (requests.elapsed): {avg_static_ms:.1f} ms')
#         if avg_static_ms > 100:
#             print('  🔴  FINDING: Static file latency is >100ms even by requests.elapsed')
#             print('              → the overhead is in the server-side request path, not network')
#
#
#     # ═══════════════════════════════════════════════════════════════════════════
#     # LEVEL 3 — Middleware Isolation: auth vs no-auth comparison
#     # ═══════════════════════════════════════════════════════════════════════════
#     #
#     # Compare the same static file request:
#     #   A_xx: WITH auth headers (as the browser sends them)
#     #   B_xx: WITHOUT auth headers
#     #
#     # If B_xx is significantly faster than A_xx → auth middleware is the bottleneck
#     #   (it's running on static files and making backend calls to validate the key)
#     #
#     # If both are equally slow → the bottleneck is before auth (e.g. logging middleware,
#     #   connection overhead, or disk read per request)
#     #
#     # Also compare:
#     #   C_xx: FastAPI infra routes (should bypass most middleware)
#     #   D_xx: Static files (should be fast, currently broken)
#     # ═══════════════════════════════════════════════════════════════════════════
#
#     def test__level_3__middleware_isolation(self):
#         """
#         LEVEL 3: Isolate middleware overhead by comparing authenticated vs
#         unauthenticated requests to the same static endpoints.
#
#         Interpretation:
#           with_auth >> without_auth  → auth middleware calls backend per static request
#           with_auth ~= without_auth  → auth is not the bottleneck; look at logging/disk
#           both slow, FastAPI fast    → static file handler specifically is the issue
#           FastAPI also slow          → global middleware wrapping everything
#         """
#         print('\n' + '═' * 70)
#         print('  LEVEL 3: Middleware isolation — with-auth vs without-auth')
#         print('═' * 70)
#
#         config_l3 = Schema__Perf_Benchmark__Timing__Config(
#             title            = 'Level 3: Middleware Isolation',
#             measure_only_3   = True ,
#             asserts_enabled  = False,
#             print_to_console = True ,
#         )
#
#         with Perf_Benchmark__Timing(config=config_l3) as timing:
#
#             # ─────────────────────────────────────────────────────────────────
#             # Section A: Static files WITH auth (current behaviour)
#             # ─────────────────────────────────────────────────────────────────
#
#             def a_01__static__with_auth__index():
#                 return self.get(PATH__STATIC__INDEX)
#
#             timing.benchmark(Safe_Str__Benchmark_Id('A_01__static__with_auth__index'), a_01__static__with_auth__index)
#
#             def a_02__static__with_auth__js():
#                 return self.get(PATH__STATIC__CACHE)
#
#             timing.benchmark(Safe_Str__Benchmark_Id('A_02__static__with_auth__js'), a_02__static__with_auth__js)
#
#             # ─────────────────────────────────────────────────────────────────
#             # Section B: Static files WITHOUT auth
#             # Note the expected status codes: may be 401/403 if auth is required,
#             # or 200 if static files are (incorrectly) world-readable,
#             # or same 200 but much faster if auth check is the bottleneck.
#             # ─────────────────────────────────────────────────────────────────
#
#             def b_01__static__no_auth__index():
#                 return self.get__no_auth(PATH__STATIC__INDEX)
#
#             timing.benchmark(Safe_Str__Benchmark_Id('B_01__static__no_auth__index'), b_01__static__no_auth__index)
#
#             def b_02__static__no_auth__js():
#                 return self.get__no_auth(PATH__STATIC__CACHE)
#
#             timing.benchmark(Safe_Str__Benchmark_Id('B_02__static__no_auth__js'), b_02__static__no_auth__js)
#
#             # ─────────────────────────────────────────────────────────────────
#             # Section C: FastAPI infrastructure — should be fast regardless
#             # If C_xx is also slow, the overhead is in a global middleware that
#             # wraps EVERYTHING, not just the static or auth path.
#             # ─────────────────────────────────────────────────────────────────
#
#             def c_01__infra__docs():
#                 return self.get(PATH__DOCS)
#
#             timing.benchmark(Safe_Str__Benchmark_Id('C_01__infra__docs'), c_01__infra__docs)
#
#             def c_02__infra__openapi():
#                 return self.get(PATH__OPENAPI)
#
#             timing.benchmark(Safe_Str__Benchmark_Id('C_02__infra__openapi'), c_02__infra__openapi)
#
#         # ─────────────────────────────────────────────────────────────────────
#         # Compute and print the differential
#         # ─────────────────────────────────────────────────────────────────────
#         results   = timing.results
#         a01_score = int(results['A_01__static__with_auth__index'].raw_score)
#         b01_score = int(results['B_01__static__no_auth__index'  ].raw_score)
#         a02_score = int(results['A_02__static__with_auth__js'   ].raw_score)
#         b02_score = int(results['B_02__static__no_auth__js'     ].raw_score)
#         c01_score = int(results['C_01__infra__docs'             ].raw_score)
#         c02_score = int(results['C_02__infra__openapi'          ].raw_score)
#
#         auth_overhead_index = (a01_score - b01_score) / 1_000_000
#         auth_overhead_js    = (a02_score - b02_score) / 1_000_000
#
#         print(f'\n  Middleware overhead analysis:')
#         print(f'    index.html  — with auth: {a01_score / 1_000_000:.1f}ms | '
#               f'no auth: {b01_score / 1_000_000:.1f}ms | '
#               f'overhead: {auth_overhead_index:.1f}ms')
#         print(f'    admin-api-cache.js — with auth: {a02_score / 1_000_000:.1f}ms | '
#               f'no auth: {b02_score / 1_000_000:.1f}ms | '
#               f'overhead: {auth_overhead_js:.1f}ms')
#         print(f'    FastAPI /docs:       {c01_score / 1_000_000:.1f}ms')
#         print(f'    FastAPI /openapi:    {c02_score / 1_000_000:.1f}ms')
#
#         no_auth_response_index = self.captured_responses.get(f'{PATH__STATIC__INDEX}__no_auth')
#         if no_auth_response_index:
#             print(f'\n    No-auth static response status: {no_auth_response_index.status_code}')
#             if no_auth_response_index.status_code == 200:
#                 print('    ℹ️  Static files are world-readable (no auth enforced on them)')
#             elif no_auth_response_index.status_code in (401, 403):
#                 print('    🔴  FINDING: Static files return 401/403 without auth')
#                 print('               → auth IS enforced on static files (should not be)')
#
#         print('\n  Conclusion:')
#         if abs(auth_overhead_index) > 200:
#             print('  🔴  Auth middleware adds >200ms to static requests')
#             print('      → auth middleware is the primary bottleneck')
#             print('      → NEXT: Level 4 H1 — what does auth middleware call?')
#         else:
#             print('  ℹ️  Auth overhead is <200ms — auth is not the main bottleneck')
#             print('      → Look at global middleware (logging, connection setup)')
#             print('      → NEXT: Level 4 H2 — inspect global middleware chain')
#
#
#     # ═══════════════════════════════════════════════════════════════════════════
#     # LEVEL 4 — Root Cause Hypothesis H1: Auth middleware S3 calls on static
#     # ═══════════════════════════════════════════════════════════════════════════
#     #
#     # Hypothesis: Auth middleware validates the API key by calling S3 (list or
#     # get) on every request, including static file requests. One S3 round-trip
#     # from localhost to AWS adds ~200–300ms. Three S3 calls = 600–900ms.
#     #
#     # This test can't directly instrument S3 calls (that requires server-side
#     # access). Instead it:
#     #   1. Times with a known-valid key vs known-invalid key
#     #   2. Times with a request that hits a fast endpoint to estimate auth overhead
#     #   3. Documents what to look for in the server code
#     # ═══════════════════════════════════════════════════════════════════════════
#
#     def test__level_4__hypothesis_h1__auth_s3_calls_on_static(self):
#         """
#         LEVEL 4 / H1: Does auth middleware make S3 calls for static files?
#
#         Timing pattern to look for:
#           valid key (200)   →  850ms
#           invalid key (401) →  250ms  ← SHORTER because S3 lookup returned quickly?
#
#         If invalid key is faster → auth is doing a lookup (fast failure on invalid key)
#           and a slower multi-step validation on valid keys.
#         If both are the same speed → the overhead is pre-auth (global middleware).
#
#         TODO (requires server-side access):
#           - Add boto3 call counting to the auth middleware
#           - Log the exact S3 API calls made per request
#           - grep server logs for 'ListObjectsV2' or 'GetObject' during static request
#         """
#         print('\n' + '═' * 70)
#         print('  LEVEL 4 H1: Auth middleware S3 call hypothesis')
#         print('═' * 70)
#         print()
#         print('  Testing: valid key vs invalid key timing on static file request.')
#         print('  If invalid is faster → auth makes S3 calls during validation.')
#         print()
#
#         config_h1 = Schema__Perf_Benchmark__Timing__Config(
#             title            = 'Level 4 H1: Auth S3 Call Hypothesis',
#             measure_only_3   = True ,
#             asserts_enabled  = False,
#             print_to_console = True ,
#         )
#
#         with Perf_Benchmark__Timing(config=config_h1) as timing:
#
#             # A_01: Valid API key — measures full auth path including S3 lookup
#             def a_01__static__valid_key():
#                 return self.get(PATH__STATIC__INDEX)
#
#             timing.benchmark(Safe_Str__Benchmark_Id('A_01__static__valid_key'), a_01__static__valid_key)
#
#             # A_02: Invalid API key — measures early-exit auth path
#             def a_02__static__invalid_key():
#                 invalid_headers = {k: 'invalid-key-aaaaa' for k in self.auth_headers}
#                 url             = url_join_safe(URL__TARGET_SERVER, PATH__STATIC__INDEX)
#                 return requests.get(url, headers=invalid_headers, allow_redirects=False)
#
#             timing.benchmark(Safe_Str__Benchmark_Id('A_02__static__invalid_key'), a_02__static__invalid_key)
#
#             # A_03: No key at all — measures pre-auth overhead only
#             def a_03__static__no_key():
#                 url = url_join_safe(URL__TARGET_SERVER, PATH__STATIC__INDEX)
#                 return requests.get(url, allow_redirects=False)
#
#             timing.benchmark(Safe_Str__Benchmark_Id('A_03__static__no_key'), a_03__static__no_key)
#
#         results        = timing.results
#         valid_ms       = int(results['A_01__static__valid_key'  ].raw_score) / 1_000_000
#         invalid_ms     = int(results['A_02__static__invalid_key'].raw_score) / 1_000_000
#         no_key_ms      = int(results['A_03__static__no_key'     ].raw_score) / 1_000_000
#         s3_estimate_ms = valid_ms - no_key_ms
#
#         print(f'\n  Timing breakdown:')
#         print(f'    Valid key:   {valid_ms:.1f}ms  (full auth path)')
#         print(f'    Invalid key: {invalid_ms:.1f}ms  (early exit path)')
#         print(f'    No key:      {no_key_ms:.1f}ms  (pre-auth only)')
#         print(f'    S3 estimate: {s3_estimate_ms:.1f}ms  (valid_key - no_key)')
#
#         print(f'\n  Server-side investigation checklist (inspect source code):')
#         print(f'    [ ] Find the auth middleware class in the FastAPI app setup')
#         print(f'    [ ] Trace which S3 API calls are made in validate_api_key()')
#         print(f'    [ ] Count: how many s3.list_objects_v2 / s3.get_object calls per request?')
#         print(f'    [ ] Check: is validate_api_key() called for /admin/v0/* paths?')
#         print(f'    [ ] Check: is there a token cache (in-memory dict or Redis)?')
#         print(f'    [ ] If no cache: adding one should reduce auth to ~0ms for repeated keys')
#
#
#     # ═══════════════════════════════════════════════════════════════════════════
#     # LEVEL 4 — Root Cause Hypothesis H2: API endpoints scan S3 buckets
#     # ═══════════════════════════════════════════════════════════════════════════
#     #
#     # Hypothesis: The /info/status and /tokens/* endpoints call s3.list_objects_v2
#     # without pagination on large buckets. Each call takes ~1–2 seconds.
#     # Three sequential calls = 3–6 seconds per endpoint.
#     #
#     # Evidence pattern: if the 2nd call to the same endpoint is the same speed
#     # as the 1st → no S3 result caching. If the 2nd call is fast → S3 results
#     # are cached somewhere (good, but then why is 1st slow?).
#     # ═══════════════════════════════════════════════════════════════════════════
#
#     def test__level_4__hypothesis_h2__api_s3_bucket_scan(self):
#         """
#         LEVEL 4 / H2: Are API endpoints scanning S3 buckets on every call?
#
#         Test: call each API endpoint twice in immediate succession.
#           - 1st call: cold (includes S3 scan if any)
#           - 2nd call: if fast → there is caching; if same speed → no caching, pure S3
#
#         Also tests: sequential vs behaviour (can we see if it's 1 slow call or N fast ones?)
#         """
#         print('\n' + '═' * 70)
#         print('  LEVEL 4 H2: API S3 bucket scan hypothesis')
#         print('═' * 70)
#         print()
#         print('  Testing: cold vs warm call timing for each API endpoint.')
#         print('  Same speed on both → no caching → every call hits S3.')
#         print()
#
#         config_h2 = Schema__Perf_Benchmark__Timing__Config(
#             title            = 'Level 4 H2: API S3 Scan Hypothesis',
#             measure_only_3   = True ,
#             asserts_enabled  = False,
#             print_to_console = True ,
#         )
#
#         with Perf_Benchmark__Timing(config=config_h2) as timing:
#
#             # ─────────────────────────────────────────────────────────────────
#             # Section A: /info/status — should be a trivial health check
#             # ─────────────────────────────────────────────────────────────────
#
#             def a_01__status__call_1():
#                 return self.get(PATH__STATUS)
#
#             timing.benchmark(Safe_Str__Benchmark_Id('A_01__status__call_1'), a_01__status__call_1)
#
#             def a_02__status__call_2():
#                 return self.get(PATH__STATUS)
#
#             timing.benchmark(Safe_Str__Benchmark_Id('A_02__status__call_2'), a_02__status__call_2)
#
#             # ─────────────────────────────────────────────────────────────────
#             # Section B: /tokens/list — index read, should be fast
#             # ─────────────────────────────────────────────────────────────────
#
#             def b_01__tokens_list__call_1():
#                 return self.get(PATH__TOKENS__LIST)
#
#             timing.benchmark(Safe_Str__Benchmark_Id('B_01__tokens_list__call_1'), b_01__tokens_list__call_1)
#
#             def b_02__tokens_list__call_2():
#                 return self.get(PATH__TOKENS__LIST)
#
#             timing.benchmark(Safe_Str__Benchmark_Id('B_02__tokens_list__call_2'), b_02__tokens_list__call_2)
#
#             # ─────────────────────────────────────────────────────────────────
#             # Section C: /tokens/list-details — likely the more expensive one
#             # ─────────────────────────────────────────────────────────────────
#
#             def c_01__tokens_detail__call_1():
#                 return self.get(PATH__TOKENS__DETAIL)
#
#             timing.benchmark(Safe_Str__Benchmark_Id('C_01__tokens_detail__call_1'), c_01__tokens_detail__call_1)
#
#             def c_02__tokens_detail__call_2():
#                 return self.get(PATH__TOKENS__DETAIL)
#
#             timing.benchmark(Safe_Str__Benchmark_Id('C_02__tokens_detail__call_2'), c_02__tokens_detail__call_2)
#
#         results         = timing.results
#         status_1_ms     = int(results['A_01__status__call_1'      ].raw_score) / 1_000_000
#         status_2_ms     = int(results['A_02__status__call_2'      ].raw_score) / 1_000_000
#         tokens_1_ms     = int(results['B_01__tokens_list__call_1' ].raw_score) / 1_000_000
#         tokens_2_ms     = int(results['B_02__tokens_list__call_2' ].raw_score) / 1_000_000
#         detail_1_ms     = int(results['C_01__tokens_detail__call_1'].raw_score) / 1_000_000
#         detail_2_ms     = int(results['C_02__tokens_detail__call_2'].raw_score) / 1_000_000
#
#         def cache_verdict(call1_ms, call2_ms):
#             ratio = call2_ms / call1_ms if call1_ms > 0 else 1.0
#             if ratio < 0.2:
#                 return '🟢 CACHED   (2nd call much faster → result is cached)'
#             elif ratio < 0.7:
#                 return '🟡 PARTIAL  (2nd call somewhat faster → partial caching)'
#             else:
#                 return '🔴 NO CACHE (both calls same speed → hits S3 every time)'
#
#         print(f'\n  Results:')
#         print(f'    /info/status      : {status_1_ms:.0f}ms → {status_2_ms:.0f}ms  {cache_verdict(status_1_ms, status_2_ms)}')
#         print(f'    /tokens/list      : {tokens_1_ms:.0f}ms → {tokens_2_ms:.0f}ms  {cache_verdict(tokens_1_ms, tokens_2_ms)}')
#         print(f'    /tokens/list-detail: {detail_1_ms:.0f}ms → {detail_2_ms:.0f}ms  {cache_verdict(detail_1_ms, detail_2_ms)}')
#
#         print(f'\n  Server-side investigation checklist:')
#         print(f'    [ ] Find /info/status handler — what does it query?')
#         print(f'    [ ] Count s3.list_objects_v2 calls in the status handler')
#         print(f'    [ ] Find /tokens/list handler — does it call ListObjectsV2?')
#         print(f'    [ ] Does it paginate or load ALL tokens?')
#         print(f'    [ ] Is there any in-memory cache for token lists?')
#         print(f'    [ ] Is there a TTL/invalidation strategy?')
#         print(f'    [ ] Check: is /tokens/list-details fetching S3 metadata per token?')
#
#
#     # ═══════════════════════════════════════════════════════════════════════════
#     # LEVEL 4 — Root Cause Hypothesis H3: Static files read from disk per request
#     # ═══════════════════════════════════════════════════════════════════════════
#     #
#     # Hypothesis: FastAPI's StaticFiles mount reads from disk on every request
#     # with no in-memory caching. This is the default behaviour and can cause
#     # overhead, especially if combined with middleware overhead.
#     #
#     # Test: second request to same file should be faster if OS file cache has
#     # warmed (this is OS-level, not application-level).
#     # If 2nd == 1st → something is invalidating/bypassing the OS cache too.
#     # ═══════════════════════════════════════════════════════════════════════════
#
#     def test__level_4__hypothesis_h3__static_disk_read_per_request(self):
#         """
#         LEVEL 4 / H3: Are static files read from disk on every request?
#
#         If a conditional GET (If-None-Match / If-Modified-Since) returns 304
#         in < 50ms, the static handler correctly supports ETags.
#         If it returns 200 every time regardless of If-None-Match → no ETag support.
#         """
#         print('\n' + '═' * 70)
#         print('  LEVEL 4 H3: Static file disk-read-per-request hypothesis')
#         print('═' * 70)
#
#         # ─────────────────────────────────────────────────────────────────────
#         # First request — get the ETag
#         # ─────────────────────────────────────────────────────────────────────
#         first_response = self.get(PATH__STATIC__INDEX)
#         etag           = first_response.headers.get('ETag')
#         last_modified  = first_response.headers.get('Last-Modified')
#
#         print(f'\n  First request:')
#         print(f'    Status        : {first_response.status_code}')
#         print(f'    Elapsed       : {first_response.elapsed.total_seconds() * 1000:.1f}ms')
#         print(f'    ETag          : {etag or "(not present)"}')
#         print(f'    Last-Modified : {last_modified or "(not present)"}')
#
#         # ─────────────────────────────────────────────────────────────────────
#         # Conditional GET — should return 304 Not Modified if ETag supported
#         # ─────────────────────────────────────────────────────────────────────
#         if etag:
#             conditional_headers = {**self.auth_headers, 'If-None-Match': etag}
#         elif last_modified:
#             conditional_headers = {**self.auth_headers, 'If-Modified-Since': last_modified}
#         else:
#             conditional_headers = None
#
#         print(f'\n  Conditional GET (If-None-Match / If-Modified-Since):')
#         if conditional_headers:
#             url               = url_join_safe(URL__TARGET_SERVER, PATH__STATIC__INDEX)
#             cond_response     = requests.get(url, headers=conditional_headers, allow_redirects=False)
#             cond_elapsed_ms   = cond_response.elapsed.total_seconds() * 1000
#             print(f'    Status        : {cond_response.status_code}')
#             print(f'    Elapsed       : {cond_elapsed_ms:.1f}ms')
#
#             if cond_response.status_code == 304:
#                 print('    🟢 304 returned — ETag/conditional GET works correctly')
#                 if cond_elapsed_ms > 100:
#                     print(f'    🟡 But 304 took {cond_elapsed_ms:.1f}ms — still hitting middleware')
#             elif cond_response.status_code == 200:
#                 print('    🔴 FINDING: Server returned 200 despite matching ETag')
#                 print('               → conditional GET not implemented → full file sent every time')
#         else:
#             print('    🔴 FINDING: No ETag or Last-Modified in first response')
#             print('               → conditional GET impossible → full file re-sent every request')
#             print('               → fix: ensure StaticFiles mount enables ETags (usually default)')
#
#         # ─────────────────────────────────────────────────────────────────────
#         # Warm vs cold static file timing
#         # ─────────────────────────────────────────────────────────────────────
#         print(f'\n  Cold vs warm static file timing (3 sequential requests):')
#         timings_ms = []
#         for i in range(3):
#             url      = url_join_safe(URL__TARGET_SERVER, PATH__STATIC__INDEX)
#             response = requests.get(url, headers=self.auth_headers, allow_redirects=False)
#             elapsed  = response.elapsed.total_seconds() * 1000
#             timings_ms.append(elapsed)
#             print(f'    Request {i + 1}: {elapsed:.1f}ms  (status {response.status_code})')
#
#         if max(timings_ms) - min(timings_ms) < 50:
#             print('  ℹ️  Consistent latency — not a cold-start issue; overhead is structural')
#         else:
#             print('  🟡 Variable latency — cold-start or contention may be a factor')
