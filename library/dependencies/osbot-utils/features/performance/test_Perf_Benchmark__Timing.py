# ═══════════════════════════════════════════════════════════════════════════════
# test_Perf_Benchmark__Timing - Tests for core benchmark timing class
# ═══════════════════════════════════════════════════════════════════════════════

from unittest                                                                                             import TestCase
from osbot_utils.helpers.performance.benchmark.schemas.collections.Dict__Benchmark_Sessions               import Dict__Benchmark_Sessions
from osbot_utils.helpers.performance.benchmark.testing.QA__Benchmark__Test_Data                           import QA__Benchmark__Test_Data
from osbot_utils.testing.__                                                                               import __, __SKIP__
from osbot_utils.type_safe.Type_Safe                                                                      import Type_Safe
from osbot_utils.type_safe.primitives.core.Safe_UInt                                                      import Safe_UInt
from osbot_utils.helpers.performance.benchmark.Perf_Benchmark__Timing                                     import Perf_Benchmark__Timing, time_100_ns, time_500_ns, time_1_kns, time_2_kns, time_5_kns, time_10_kns, time_20_kns, time_50_kns, time_100_kns
from osbot_utils.helpers.performance.benchmark.schemas.timing.Schema__Perf_Benchmark__Timing__Config      import Schema__Perf_Benchmark__Timing__Config
from osbot_utils.helpers.performance.benchmark.Perf_Benchmark__Timing__Reporter                           import Perf_Benchmark__Timing__Reporter
from osbot_utils.helpers.performance.benchmark.schemas.collections.Dict__Benchmark_Results                import Dict__Benchmark_Results
from osbot_utils.helpers.performance.benchmark.schemas.benchmark.Schema__Perf__Benchmark__Result          import Schema__Perf__Benchmark__Result
from osbot_utils.helpers.performance.benchmark.schemas.safe_str.Safe_Str__Benchmark_Id                    import Safe_Str__Benchmark_Id


class test_Perf_Benchmark__Timing(TestCase):

    @classmethod
    def setUpClass(cls):                                                         # Shared test data
        cls.test_data = QA__Benchmark__Test_Data()
        cls.config    = Schema__Perf_Benchmark__Timing__Config(title            ='Test Benchmarks',
                                                               print_to_console = False)

    def test__init__(self):                                                      # Test initialization
        with Perf_Benchmark__Timing() as _:
            assert type(_)           is Perf_Benchmark__Timing
            assert isinstance(_, Type_Safe)
            assert type(_.config) is Schema__Perf_Benchmark__Timing__Config
            assert type(_.results)   is Dict__Benchmark_Results
            assert _.obj()           == __(config=__(time_unit='ns',
                                                     print_to_console=True,
                                                     auto_save_on_completion=False,
                                                     asserts_enabled=True,
                                                     measure_quick=True,
                                                     measure_fast=False,
                                                     measure_only_3=False,
                                                     title='',
                                                     description='',
                                                     output_path='',
                                                     output_prefix='',
                                                     legend=__()),
                                           results=__(),
                                           sessions=__())



    def test__init____with_config(self):                                         # Test with config
        with Perf_Benchmark__Timing(config=self.config) as _:
            assert str(_.config.title) == 'Test Benchmarks'

    def test_thresholds(self):                                                   # Test threshold constants
        with Perf_Benchmark__Timing() as _:
            assert time_100_ns == 100
            assert time_500_ns == 500
            assert time_1_kns  == 1_000
            assert time_2_kns  == 2_000
            assert time_5_kns  == 5_000
            assert time_10_kns  == 10_000
            assert time_20_kns  == 20_000
            assert time_50_kns  == 50_000
            assert time_100_kns == 100_000


    # ═══════════════════════════════════════════════════════════════════════════════
    # Lifecycle Tests
    # ═══════════════════════════════════════════════════════════════════════════════

    def test_start(self):                                                        # Test start() method
        timing = Perf_Benchmark__Timing(config=self.config)
        result = timing.start()

        assert result is timing                                                  # Returns self
        assert type(timing.sessions) is Dict__Benchmark_Sessions
        assert type(timing.results)  is Dict__Benchmark_Results
        assert len(timing.results)   == 0


    def test_stop(self):                                                         # Test stop() method
        timing = Perf_Benchmark__Timing(config=self.config)
        timing.start()
        result = timing.stop()

        assert result is timing                                                  # Returns self

    def test_context_manager(self):                                              # Test context manager
        with Perf_Benchmark__Timing(config=self.config) as timing:
            assert type(timing)          is Perf_Benchmark__Timing
            assert type(timing.sessions) is Dict__Benchmark_Sessions

    def test_context_manager__returns_timing(self):                              # Test __enter__ return
        timing = Perf_Benchmark__Timing(config=self.config)

        with timing as _:
            assert _ is timing


    # ═══════════════════════════════════════════════════════════════════════════════
    # Benchmark Method Tests
    # ═══════════════════════════════════════════════════════════════════════════════

    def test_benchmark(self):                                                    # Test benchmark() method
        with Perf_Benchmark__Timing(config=self.config) as timing:
            benchmark_id = Safe_Str__Benchmark_Id('A_01__test')
            result       = timing.benchmark(benchmark_id, self.test_data.target_nop)

            assert type(result)            is Schema__Perf__Benchmark__Result
            assert str(result.benchmark_id) == 'A_01__test'
            assert int(result.final_score)  >= 0
            assert int(result.raw_score)    >= 0

            assert result.obj() == __(benchmark_id = 'A_01__test' ,
                                      section      = 'A'           ,
                                      index        = '01'          ,
                                      name         = 'test'        ,
                                      final_score  = __SKIP__      ,
                                      raw_score    = __SKIP__      )


            assert timing.obj() == __(config=__( time_unit='ns',
                                                 print_to_console=False,
                                                 auto_save_on_completion=False,
                                                 asserts_enabled=True,
                                                 measure_quick=True,
                                                 measure_fast=False,
                                                 measure_only_3=False,
                                                 title='Test Benchmarks',
                                                 description='',
                                                 output_path='',
                                                 output_prefix='',
                                                 legend=__()),
                                      results = __(A_01__test              = __(benchmark_id = 'A_01__test' ,
                                                                               section      = 'A'           ,
                                                                               index        = '01'          ,
                                                                               name         = 'test'        ,
                                                                               final_score  = __SKIP__      ,
                                                                               raw_score    = __SKIP__      )),
                                      sessions = __(A_01__test              = __(result     = __(measurements = __( _1 = __(avg_time     = __SKIP__ ,
                                                                                                                        min_time     = __SKIP__ ,
                                                                                                                        max_time     = __SKIP__ ,
                                                                                                                        median_time  = __SKIP__ ,
                                                                                                                        stddev_time  = __SKIP__ ,
                                                                                                                        raw_times    = __SKIP__ ,
                                                                                                                        sample_size  = __SKIP__ ,
                                                                                                                        score        = __SKIP__ ,
                                                                                                                        raw_score    = __SKIP__ ),
                                                                                                                   _2 = __SKIP__,
                                                                                                                   _3 = __SKIP__,
                                                                                                                   _5 = __SKIP__,
                                                                                                                   _8 = __SKIP__),
                                                                                          name         = 'target_nop'         ,
                                                                                          raw_score    = __SKIP__              ,
                                                                                          final_score  = __SKIP__              ),
                                                                              assert_enabled = True                            ,
                                                                              padding        = 30                              )))


    def test_benchmark__stored_in_results(self):                                 # Test result stored
        with Perf_Benchmark__Timing(config=self.config) as timing:
            benchmark_id = Safe_Str__Benchmark_Id('A_01__test')
            timing.benchmark(benchmark_id, self.test_data.target_nop)

            assert len(timing.results)    == 1
            assert benchmark_id in timing.results

    def test_benchmark__multiple(self):                                          # Test multiple benchmarks
        with Perf_Benchmark__Timing(config=self.config) as timing:
            timing.benchmark(Safe_Str__Benchmark_Id('A_01__test1'), self.test_data.target_nop)
            timing.benchmark(Safe_Str__Benchmark_Id('A_02__test2'), self.test_data.target_simple)
            timing.benchmark(Safe_Str__Benchmark_Id('B_01__test3'), self.test_data.target_list)

            assert len(timing.results) == 3


    def test_benchmark__with_threshold(self):                                    # Test with threshold
        with Perf_Benchmark__Timing(config=self.config) as timing:
            benchmark_id = Safe_Str__Benchmark_Id('A_01__test')
            result = timing.benchmark(benchmark_id                               ,
                                      self.test_data.target_nop                  ,
                                      assert_less_than=Safe_UInt(10_000_000)     )  # 10ms - should pass

            assert result is not None


    # ═══════════════════════════════════════════════════════════════════════════════
    # Parse Benchmark ID Tests
    # ═══════════════════════════════════════════════════════════════════════════════

    def test_parse_benchmark_id(self):                                           # Test ID parsing
        with Perf_Benchmark__Timing(config=self.config) as timing:
            section, index, name = timing.parse_benchmark_id(Safe_Str__Benchmark_Id('A_01__python__nop'))

            assert str(section) == 'A'
            assert str(index)   == '01'
            assert str(name)    == 'python__nop'

    def test_parse_benchmark_id__complex(self):                                  # Test complex ID
        with Perf_Benchmark__Timing(config=self.config) as timing:
            section, index, name = timing.parse_benchmark_id(Safe_Str__Benchmark_Id('B_02__type_safe__with_prims'))

            assert str(section) == 'B'
            assert str(index)   == '02'
            assert str(name)    == 'type_safe__with_prims'

    def test_parse_benchmark_id__simple(self):                                   # Test simple ID (no section)
        with Perf_Benchmark__Timing(config=self.config) as timing:
            section, index, name = timing.parse_benchmark_id(Safe_Str__Benchmark_Id('simple'))

            assert str(name) == 'simple'


    # ═══════════════════════════════════════════════════════════════════════════════
    # Reporter Tests
    # ═══════════════════════════════════════════════════════════════════════════════

    def test_reporter(self):                                                     # Test reporter() method
        with Perf_Benchmark__Timing(config=self.config) as timing:
            timing.benchmark(Safe_Str__Benchmark_Id('A_01__test'), self.test_data.target_nop)

            reporter = timing.reporter()

            assert type(reporter)         is Perf_Benchmark__Timing__Reporter
            assert reporter.results       is timing.results
            assert reporter.config        is timing.config

    def test_reporter__with_results(self):                                       # Test reporter has results
        with Perf_Benchmark__Timing(config=self.config) as timing:
            timing.benchmark(Safe_Str__Benchmark_Id('A_01__test'), self.test_data.target_nop)

            reporter = timing.reporter()

            assert len(reporter.results) == 1


    # ═══════════════════════════════════════════════════════════════════════════════
    # Integration Tests
    # ═══════════════════════════════════════════════════════════════════════════════

    def test_integration__full_workflow(self):                                   # Test complete workflow
        config = Schema__Perf_Benchmark__Timing__Config(title            ='Integration Test',
                                                        print_to_console = False)

        timing = Perf_Benchmark__Timing(config=config)
        timing.start()

        timing.benchmark(Safe_Str__Benchmark_Id('A_01__nop'),    self.test_data.target_nop)
        timing.benchmark(Safe_Str__Benchmark_Id('A_02__simple'), self.test_data.target_simple)

        timing.stop()

        assert len(timing.results) == 2

        reporter = timing.reporter()
        text     = reporter.build_text()

        assert 'Integration Test' in str(text)

    def test_integration__type_safe_measurement(self):                           # Test measuring Type_Safe
        with Perf_Benchmark__Timing(config=self.config) as timing:
            result = timing.benchmark(Safe_Str__Benchmark_Id('A_01__type_safe__empty'),
                                      self.test_data.TS__Empty)

            assert int(result.final_score) > 0
            assert str(result.section)     == 'A'
            assert str(result.index)       == '01'
