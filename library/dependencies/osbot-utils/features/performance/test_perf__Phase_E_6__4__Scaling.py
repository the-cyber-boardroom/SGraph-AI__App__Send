# ═══════════════════════════════════════════════════════════════════════════════
# Performance Benchmark: Phase E_6 - Scaling Analysis
# Analyzes: Pipeline performance scaling with HTML size
# ═══════════════════════════════════════════════════════════════════════════════
#
# Phase E_6 Test 4: Validate linear scaling behavior
#
# Tests pipeline at multiple sizes:
#   1 paragraph   (~3 nodes)
#   5 paragraphs  (~15 nodes)
#   10 paragraphs (~30 nodes)
#   50 paragraphs (~150 nodes)
#   100 paragraphs (~300 nodes)
#
# SECTIONS:
#   A_xx - Full pipeline (L1→L2→L3) at each size
#   B_xx - L2 only (MGraph construction) at each size - the known bottleneck
#
# ═══════════════════════════════════════════════════════════════════════════════

import phase_e
from unittest                                                                                                   import TestCase
from mgraph_ai_service_html_graph.utils.Version                                                                 import version__mgraph_ai_service_html_graph
from mgraph_ai_service_html_graph.service.html_mgraph.converters.Html__To__Html_Dict__With__Node_Ids            import Html__To__Html_Dict__With__Node_Ids
from mgraph_ai_service_html_graph.service.html_mgraph.converters.Html__To__Html_MGraph__Document__Node_Id_Reuse import Html__To__Html_MGraph__Document__Node_Id_Reuse
from osbot_utils.helpers.performance.benchmark.Perf_Benchmark__Timing                                           import Perf_Benchmark__Timing
from osbot_utils.helpers.performance.benchmark.schemas.enums.Enum__Measure_Mode                                 import Enum__Measure_Mode
from osbot_utils.helpers.performance.benchmark.schemas.timing.Schema__Perf_Benchmark__Timing__Config            import Schema__Perf_Benchmark__Timing__Config
from osbot_utils.testing.Graph__Deterministic__Ids                                                              import graph_deterministic_ids
from osbot_utils.type_safe.type_safe_core.config.type_safe_fast_create                                          import type_safe_fast_create
from osbot_utils.utils.Files                                                                                    import path_combine
from phase_e.mgraph.Html_MGraph__Document__To__Html__With_Original_Head                                         import Html_MGraph__Document__To__Html__With_Original_Head
from osbot_utils.helpers.performance.report.Perf_Report__Builder                                                import Perf_Report__Builder
from osbot_utils.helpers.performance.testing.Html_Generator__For_Benchmarks                                     import Html_Generator__For_Benchmarks
from osbot_utils.helpers.performance.report.schemas.Schema__Perf_Report__Metadata                               import Schema__Perf_Report__Metadata
from osbot_utils.helpers.performance.report.schemas.collections.Dict__Perf_Report__Legend                       import Dict__Perf_Report__Legend
from osbot_utils.helpers.performance.report.storage.Perf_Report__Storage__File_System                           import Perf_Report__Storage__File_System


# ═══════════════════════════════════════════════════════════════════════════════
# Report Metadata
# ═══════════════════════════════════════════════════════════════════════════════

REPORT_KEY         = 'perf_6_4__scaling__1_to_100_paragraphs'
REPORT_TITLE       = 'Phase E_6: Scaling Analysis'
REPORT_DESCRIPTION = ('Measures pipeline performance scaling from 1 to 100 paragraphs. '
                      'Validates linear scaling behavior. Tests full pipeline (L1→L2→L3) '
                      'and L2 only (MGraph construction) at each size.')
REPORT_TEST_INPUT  = 'Synthetic HTML: 1, 5, 10, 50, 100 paragraphs'
REPORT_LEGEND      = {'A': 'Full pipeline (L1→L2→L3)  = Parse + Graph + Reconstruct',
                      'B': 'L2 only (Dict→MGraph)     = MGraph construction bottleneck'}


# ═══════════════════════════════════════════════════════════════════════════════
# Performance Test Class
# ═══════════════════════════════════════════════════════════════════════════════

class test_perf__Phase_E_6__4__Scaling(TestCase):

    @classmethod
    def setUpClass(cls):
        cls.storage_path = path_combine(phase_e.path, '../perf_results')
        cls.storage      = Perf_Report__Storage__File_System(storage_path=cls.storage_path)
        cls.generator    = Html_Generator__For_Benchmarks()
        cls.config       = Schema__Perf_Benchmark__Timing__Config(title            = REPORT_TITLE,
                                                                  measure_fast     = True        ,
                                                                  print_to_console = False       ,
                                                                  asserts_enabled  = False       )

        # ───────────────────────────────────────────────────────────────────────
        # Pre-generate test HTML at each size
        # ───────────────────────────────────────────────────────────────────────
        with graph_deterministic_ids():
            cls.html_1   = cls.generator.generate__1()
            cls.html_5   = cls.generator.generate_with_paragraphs(num_paragraphs=5  , words_per_para=5)
            cls.html_10  = cls.generator.generate__10()
            cls.html_50  = cls.generator.generate__50()
            cls.html_100 = cls.generator.generate__100()
            # cls.html_200 = cls.generator.generate__200()
            # cls.html_300 = cls.generator.generate__300()
            # cls.html_500 = cls.generator.generate__500()

        # ───────────────────────────────────────────────────────────────────────
        # Pre-compute html_dict for L2-only benchmarks
        # ───────────────────────────────────────────────────────────────────────
        with graph_deterministic_ids():
            cls.dict_1   = Html__To__Html_Dict__With__Node_Ids(html=cls.html_1  ).convert()
            cls.dict_5   = Html__To__Html_Dict__With__Node_Ids(html=cls.html_5  ).convert()
            cls.dict_10  = Html__To__Html_Dict__With__Node_Ids(html=cls.html_10 ).convert()
            cls.dict_50  = Html__To__Html_Dict__With__Node_Ids(html=cls.html_50 ).convert()
            cls.dict_100 = Html__To__Html_Dict__With__Node_Ids(html=cls.html_100).convert()
            # cls.dict_200 = Html__To__Html_Dict__With__Node_Ids(html=cls.html_200).convert()
            # cls.dict_300 = Html__To__Html_Dict__With__Node_Ids(html=cls.html_300).convert()
            # cls.dict_500 = Html__To__Html_Dict__With__Node_Ids(html=cls.html_500).convert()

    # ═══════════════════════════════════════════════════════════════════════════
    # Benchmark Registration
    # ═══════════════════════════════════════════════════════════════════════════

    def benchmarks(self, timing: Perf_Benchmark__Timing):

        # ───────────────────────────────────────────────────────────────────────
        # Section A: Full Pipeline (L1→L2→L3) at Each Size
        # ───────────────────────────────────────────────────────────────────────

        def full_pipeline(html: str) -> str:                                    # Helper: run complete pipeline
            html_dict  = Html__To__Html_Dict__With__Node_Ids(html=html).convert()
            document   = Html__To__Html_MGraph__Document__Node_Id_Reuse().convert_from_dict(html_dict)
            converter  = Html_MGraph__Document__To__Html__With_Original_Head(original_html_dict=html_dict)
            return converter.convert(document)

        # A_01: 1 paragraph
        def stage_A_01__full__1_para():
            return full_pipeline(self.html_1)

        timing.benchmark('A_01__full__1_para', stage_A_01__full__1_para)

        # A_02: 5 paragraphs
        def stage_A_02__full__5_para():
            return full_pipeline(self.html_5)

        timing.benchmark('A_02__full__5_para', stage_A_02__full__5_para)

        # A_03: 10 paragraphs
        def stage_A_03__full__10_para():
            return full_pipeline(self.html_10)

        timing.benchmark('A_03__full__10_para', stage_A_03__full__10_para)

        # A_04: 50 paragraphs
        def stage_A_04__full__50_para():
            return full_pipeline(self.html_50)

        timing.benchmark('A_04__full__50_para', stage_A_04__full__50_para)

        # A_05: 100 paragraphs
        def stage_A_05__full__100_para():
            return full_pipeline(self.html_100)

        timing.benchmark('A_05__full__100_para', stage_A_05__full__100_para)

        # # A_06: 200 paragraphs
        # def stage_A_06__full__200_para():
        #     return full_pipeline(self.html_200)
        #
        # timing.benchmark('A_06__full__200_para', stage_A_06__full__200_para)
        #
        # # A_06: 200 paragraphs
        # def stage_A_07__full__300_para():
        #     return full_pipeline(self.html_300)
        #
        # timing.benchmark('A_07__full__300_para', stage_A_07__full__300_para)

        # ───────────────────────────────────────────────────────────────────────
        # Section B: L2 Only (Dict→MGraph) at Each Size
        # ───────────────────────────────────────────────────────────────────────

        # B_01: 1 paragraph
        def stage_B_01__L2__1_para():
            return Html__To__Html_MGraph__Document__Node_Id_Reuse().convert_from_dict(self.dict_1)

        timing.benchmark('B_01__L2__1_para', stage_B_01__L2__1_para)

        # B_02: 5 paragraphs
        def stage_B_02__L2__5_para():
            return Html__To__Html_MGraph__Document__Node_Id_Reuse().convert_from_dict(self.dict_5)

        timing.benchmark('B_02__L2__5_para', stage_B_02__L2__5_para)

        # B_03: 10 paragraphs
        def stage_B_03__L2__10_para():
            return Html__To__Html_MGraph__Document__Node_Id_Reuse().convert_from_dict(self.dict_10)

        timing.benchmark('B_03__L2__10_para', stage_B_03__L2__10_para)

        # B_04: 50 paragraphs
        def stage_B_04__L2__50_para():
            return Html__To__Html_MGraph__Document__Node_Id_Reuse().convert_from_dict(self.dict_50)

        timing.benchmark('B_04__L2__50_para', stage_B_04__L2__50_para)

        # B_05: 100 paragraphs
        def stage_B_05__L2__100_para():
            return Html__To__Html_MGraph__Document__Node_Id_Reuse().convert_from_dict(self.dict_100)

        timing.benchmark('B_05__L2__100_para', stage_B_05__L2__100_para)

        # # B_06: 200 paragraphs
        # def stage_B_06__L2__200_para():
        #     return Html__To__Html_MGraph__Document__Node_Id_Reuse().convert_from_dict(self.dict_200)
        #
        # timing.benchmark('B_06__L2__200_para', stage_B_06__L2__200_para)
        #
        # # B_06: 200 paragraphs
        # def stage_B_07__L2__300_para():
        #     return Html__To__Html_MGraph__Document__Node_Id_Reuse().convert_from_dict(self.dict_300)
        #
        # timing.benchmark('B_07__L2__300_para', stage_B_07__L2__300_para)

    # ═══════════════════════════════════════════════════════════════════════════
    # Test Method
    # ═══════════════════════════════════════════════════════════════════════════

    @type_safe_fast_create
    def test__scaling(self):
        builder = Perf_Report__Builder(metadata = Schema__Perf_Report__Metadata(title        = REPORT_TITLE                         ,
                                                                                version      = version__mgraph_ai_service_html_graph,
                                                                                description  = REPORT_DESCRIPTION                   ,
                                                                                test_input   = REPORT_TEST_INPUT                    ,
                                                                                measure_mode = Enum__Measure_Mode.FAST              ),
                                       legend   = Dict__Perf_Report__Legend(REPORT_LEGEND)                                           ,
                                       config   = self.config                                                                        )

        report = builder.run(self.benchmarks)

        # Save report (txt only)
        self.storage.save(report, key=REPORT_KEY, formats=['txt'])

        # Validate structure
        # assert report.metadata.benchmark_count == 10                            # A_01-A_05, B_01-B_05
        # assert len(report.benchmarks)          == 10
        # assert len(report.categories)          == 2                             # A and B sections

        # Print report to console
        #print(Perf_Report__Renderer__Text().render(report))
