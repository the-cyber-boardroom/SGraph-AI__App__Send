# ═══════════════════════════════════════════════════════════════════════════════
# Performance Hypothesis: Fast Create Impact
# Compares: Default Type_Safe vs fast_create=True for Dict → MGraph conversion
# ═══════════════════════════════════════════════════════════════════════════════
#
# BASELINE (Before): Normal Type_Safe.__init__ (full validation)
# HYPOTHESIS (After): fast_create=True (schema-based direct __dict__ assignment)
#
# Expected: 50%+ improvement
#
# ═══════════════════════════════════════════════════════════════════════════════

import phase_e
from unittest                                                                                                   import TestCase
from mgraph_ai_service_html_graph.service.html_mgraph.converters.Html__To__Html_Dict__With__Node_Ids            import Html__To__Html_Dict__With__Node_Ids
from mgraph_ai_service_html_graph.service.html_mgraph.converters.Html__To__Html_MGraph__Document__Node_Id_Reuse import Html__To__Html_MGraph__Document__Node_Id_Reuse
from osbot_utils.helpers.performance.benchmark.Perf_Benchmark__Timing                                           import Perf_Benchmark__Timing
from osbot_utils.helpers.performance.benchmark.Perf_Benchmark__Hypothesis                                       import Perf_Benchmark__Hypothesis
from osbot_utils.type_safe.type_safe_core.config.Type_Safe__Config                                              import Type_Safe__Config
from osbot_utils.utils.Files                                                                                    import path_combine
from osbot_utils.helpers.performance.testing.Html_Generator__For_Benchmarks                                     import Html_Generator__For_Benchmarks



# ═══════════════════════════════════════════════════════════════════════════════
# Hypothesis Metadata (edit here for quick iteration)
# ═══════════════════════════════════════════════════════════════════════════════

HYPOTHESIS_DESCRIPTION  = 'Fast Create Impact: Default vs fast_create=True for Dict→MGraph'

HYPOTHESIS_TARGET       = 0.5                                                     # Expect 50%+ improvement

HYPOTHESIS_COMMENTS     = ('Bypasses Type_Safe.__init__ validation, '
                           'uses pre-computed schemas for direct __dict__ assignment')

REPORT_FILENAME         = 'perf_3__hypothesis__fast_create__impact__report.txt'
RESULT_FILENAME         = 'perf_3__hypothesis__fast_create__impact__result.json'


# ═══════════════════════════════════════════════════════════════════════════════
# Test Data (module-level for benchmark function access)
# ═══════════════════════════════════════════════════════════════════════════════

_generator = Html_Generator__For_Benchmarks()
_html_1    = _generator.generate__1()
_html_10   = _generator.generate__10()
_dict_1    = Html__To__Html_Dict__With__Node_Ids(html=_html_1 ).convert()
_dict_10   = Html__To__Html_Dict__With__Node_Ids(html=_html_10).convert()


# ═══════════════════════════════════════════════════════════════════════════════
# Benchmark Functions (same IDs for before/after comparison)
# ═══════════════════════════════════════════════════════════════════════════════

def run_baseline_benchmarks(timing: Perf_Benchmark__Timing):
    """BEFORE: Default Type_Safe (full validation)"""

    timing.benchmark('A_01__convert__1_node',
        lambda: Html__To__Html_MGraph__Document__Node_Id_Reuse().convert_from_dict(_dict_1))

    timing.benchmark('A_02__convert__10_nodes',
        lambda: Html__To__Html_MGraph__Document__Node_Id_Reuse().convert_from_dict(_dict_10))


def run_hypothesis_benchmarks(timing: Perf_Benchmark__Timing):
    """AFTER: fast_create=True (schema-based direct assignment)"""

    with Type_Safe__Config(fast_create=True, skip_validation=True):

        timing.benchmark('A_01__convert__1_node',
            lambda: Html__To__Html_MGraph__Document__Node_Id_Reuse().convert_from_dict(_dict_1))

        timing.benchmark('A_02__convert__10_nodes',
            lambda: Html__To__Html_MGraph__Document__Node_Id_Reuse().convert_from_dict(_dict_10))


# ═══════════════════════════════════════════════════════════════════════════════
# Performance Test Class
# ═══════════════════════════════════════════════════════════════════════════════

class test_perf__Phase_E__3__Hypothesis__Fast_Create__Impact(TestCase):

    @classmethod
    def setUpClass(cls):
        cls.output_path = path_combine(phase_e.path, '../perf_results')

    def test__fast_create__impact(self):
        """
        HYPOTHESIS: fast_create=True provides 50%+ improvement for Dict→MGraph

        Baseline: Normal Type_Safe.__init__ (full validation)
        Hypothesis: fast_create=True (schema-based direct __dict__ assignment)
        """

        hypothesis = Perf_Benchmark__Hypothesis(
            description        = HYPOTHESIS_DESCRIPTION ,
            target_improvement = HYPOTHESIS_TARGET      ,
            comments           = HYPOTHESIS_COMMENTS    )

        # ───────────────────────────────────────────────────────────────────────
        # Warmup (results discarded)
        # ───────────────────────────────────────────────────────────────────────
        hypothesis.run_before(run_baseline_benchmarks)

        # ───────────────────────────────────────────────────────────────────────
        # Run BEFORE: Default Type_Safe
        # ───────────────────────────────────────────────────────────────────────
        hypothesis.run_before(run_baseline_benchmarks)

        # ───────────────────────────────────────────────────────────────────────
        # Run AFTER: fast_create=True
        # ───────────────────────────────────────────────────────────────────────
        hypothesis.run_after(run_hypothesis_benchmarks)

        # ───────────────────────────────────────────────────────────────────────
        # Evaluate and Report
        # ───────────────────────────────────────────────────────────────────────
        result = hypothesis.evaluate()

        hypothesis.print_report()
        hypothesis.save_report(path_combine(self.output_path, REPORT_FILENAME))
        hypothesis.save(path_combine(self.output_path, RESULT_FILENAME))

        # Verify hypothesis succeeded
        from osbot_utils.helpers.performance.benchmark.schemas.enums.Enum__Hypothesis__Status import Enum__Hypothesis__Status
        assert result.status == Enum__Hypothesis__Status.SUCCESS, f'Expected SUCCESS, got {result.status}'