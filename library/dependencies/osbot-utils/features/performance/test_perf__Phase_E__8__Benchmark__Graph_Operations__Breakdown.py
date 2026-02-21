# ═══════════════════════════════════════════════════════════════════════════════
# Performance Benchmark: Graph Operations Breakdown
# Analyzes: The underlying graph methods inside _create_in_graph and _register_attrs
# ═══════════════════════════════════════════════════════════════════════════════
#
# "Follow the Rabbit Hole" Pattern - Level 4
#
# _process_body__create_in_graph breakdown:
#   A_01: Node_Path(node_path) creation
#   A_02: body_graph.create_element(...)
#   A_03: body_graph.add_child(...)
#
# _process_body__register_attrs breakdown:
#   A_04: attrs_graph.register_element(...)
#   A_05: attrs_graph.add_attribute(...) - per attribute
#
# Full operations:
#   A_06: Full _create_in_graph (reference)
#   A_07: Full _register_attrs (reference)
#
# Section B: All elements (N iterations)
#
# ═══════════════════════════════════════════════════════════════════════════════

import phase_e
from unittest                                                                                                   import TestCase
from mgraph_ai_service_html_graph.service.html_mgraph.graphs.Html_MGraph__Body                                  import Html_MGraph__Body
from mgraph_ai_service_html_graph.utils.Version                                                                 import version__mgraph_ai_service_html_graph
from mgraph_ai_service_html_graph.service.html_mgraph.converters.Html__To__Html_Dict__With__Node_Ids            import Html__To__Html_Dict__With__Node_Ids
from mgraph_ai_service_html_graph.service.html_mgraph.converters.Html__To__Html_MGraph__Document__Node_Id_Reuse import Html__To__Html_MGraph__Document__Node_Id_Reuse
from mgraph_ai_service_html_graph.service.html_mgraph.graphs.Html_MGraph__Document                              import Html_MGraph__Document
from mgraph_db.mgraph.MGraph                                                                                    import MGraph
from mgraph_db.mgraph.schemas.identifiers.Node_Path                                                             import Node_Path
from osbot_utils.helpers.performance.benchmark.Perf_Benchmark__Timing                                           import Perf_Benchmark__Timing
from osbot_utils.helpers.performance.benchmark.schemas.enums.Enum__Measure_Mode                                 import Enum__Measure_Mode
from osbot_utils.helpers.performance.benchmark.schemas.timing.Schema__Perf_Benchmark__Timing__Config            import Schema__Perf_Benchmark__Timing__Config
from osbot_utils.testing.Graph__Deterministic__Ids                                                              import graph_deterministic_ids
from osbot_utils.type_safe.type_safe_core.config.type_safe_fast_create                                          import type_safe_fast_create
from osbot_utils.utils.Files                                                                                    import path_combine
from osbot_utils.helpers.performance.report.Perf_Report__Builder                                                import Perf_Report__Builder
from osbot_utils.helpers.performance.testing.Html_Generator__For_Benchmarks                                     import Html_Generator__For_Benchmarks
from osbot_utils.helpers.performance.report.schemas.Schema__Perf_Report__Metadata                               import Schema__Perf_Report__Metadata
from osbot_utils.helpers.performance.report.schemas.collections.Dict__Perf_Report__Legend                       import Dict__Perf_Report__Legend
from osbot_utils.helpers.performance.report.storage.Perf_Report__Storage__File_System                           import Perf_Report__Storage__File_System


# ═══════════════════════════════════════════════════════════════════════════════
# Report Metadata
# ═══════════════════════════════════════════════════════════════════════════════

REPORT_KEY         = 'perf_8__benchmark__graph_operations__breakdown'
REPORT_TITLE       = 'Graph Operations: Breakdown'
REPORT_DESCRIPTION = ('Follow the Rabbit Hole Level 4: Break down the graph operations. '
                      'Measures create_element, add_child, register_element, add_attribute.')
REPORT_TEST_INPUT  = 'Graph operations measured individually and in loops'
REPORT_LEGEND      = { 'A': 'Single operation measurements'  ,
                       'B': 'Full loop processing (all elements)' }


# ═══════════════════════════════════════════════════════════════════════════════
# Performance Test Class
# ═══════════════════════════════════════════════════════════════════════════════

class test_perf__Phase_E__8__Benchmark__Graph_Operations__Breakdown(TestCase):

    @classmethod
    def setUpClass(cls):
        cls.storage_path = path_combine(phase_e.path, '../perf_results')
        cls.storage      = Perf_Report__Storage__File_System(storage_path=cls.storage_path)
        cls.generator    = Html_Generator__For_Benchmarks()
        cls.config       = Schema__Perf_Benchmark__Timing__Config(title            = REPORT_TITLE,
                                                                  measure_fast     = True        ,
                                                                  print_to_console = False       ,
                                                                  asserts_enabled  = False       )

        # Pre-generate test data (change cls.html to test different sizes)
        with graph_deterministic_ids():
            cls.html_1       = cls.generator.generate__1    ()
            cls.html_10      = cls.generator.generate__10   ()
            cls.html_50      = cls.generator.generate__50   ()
            cls.html_100     = cls.generator.generate__100  ()
            cls.html_200     = cls.generator.generate__200  ()
            cls.html_1_000   = cls.generator.generate__1_000()
            cls.html         = cls.html_100
            cls.html_dict    = Html__To__Html_Dict__With__Node_Ids(html=cls.html).convert()

        # Pre-extract body_dict and nodes
        converter        = Html__To__Html_MGraph__Document__Node_Id_Reuse()
        _, cls.body_dict = converter._extract_head_body(cls.html_dict)
        cls.nodes        = cls.body_dict.get('nodes', [])


        # Extract first <p> element for single-element tests
        cls.first_p_node = cls.nodes[0] if cls.nodes else None

    # ═══════════════════════════════════════════════════════════════════════════
    # Benchmark Registration
    # ═══════════════════════════════════════════════════════════════════════════

    def benchmarks(self, timing: Perf_Benchmark__Timing):
        body_dict    = self.body_dict
        nodes        = self.nodes
        first_p_node = self.first_p_node
        body_node_id = 'f0000005'

        # ───────────────────────────────────────────────────────────────────────
        # Helper: Create fresh document with body root
        # ───────────────────────────────────────────────────────────────────────
        def create_fresh_document_with_body():
            document = Html_MGraph__Document().setup()
            document.body_graph.create_element(node_path=Node_Path('body'), node_id=body_node_id)
            document.body_graph.set_root(body_node_id)
            document.attrs_graph.register_element(body_node_id, 'body')

            assert type(document.body_graph       ) is Html_MGraph__Body
            assert type(document.body_graph.mgraph) is MGraph
            return document

        # ═══════════════════════════════════════════════════════════════════════
        # Section A: Single operation measurements
        # ═══════════════════════════════════════════════════════════════════════

        # ───────────────────────────────────────────────────────────────────────
        # A_01: Node_Path(node_path) creation
        # ───────────────────────────────────────────────────────────────────────
        def stage_A_01__node_path_creation():
            node_path = Node_Path('body.p[0]')
            return node_path

        timing.benchmark('A_01__node_path_creation', stage_A_01__node_path_creation)

        # ───────────────────────────────────────────────────────────────────────
        # A_02: body_graph.create_element(...)
        # ───────────────────────────────────────────────────────────────────────
        document_A_02  = create_fresh_document_with_body()
        converter_A_02 = Html__To__Html_MGraph__Document__Node_Id_Reuse()

        def stage_A_02__create_element():
            node_id = converter_A_02._generate_node_id()
            document_A_02.body_graph.create_element(node_path=Node_Path('body.p[0]'),
                                                     node_id=node_id)

        timing.benchmark('A_02__create_element', stage_A_02__create_element)

        # ───────────────────────────────────────────────────────────────────────
        # A_03: body_graph.add_child(...)
        # Note: Needs node to exist first, so we create then add_child
        # ───────────────────────────────────────────────────────────────────────
        document_A_03  = create_fresh_document_with_body()
        converter_A_03 = Html__To__Html_MGraph__Document__Node_Id_Reuse()

        def stage_A_03__add_child():
            node_id = converter_A_03._generate_node_id()
            document_A_03.body_graph.create_element(node_path=Node_Path('body.p[0]'),
                                                     node_id=node_id)
            document_A_03.body_graph.add_child(body_node_id, node_id, 0)

        timing.benchmark('A_03__add_child', stage_A_03__add_child)

        # Adjust A_03 to get isolated add_child cost
        benchmark_a_02__result = timing.results.get('A_02__create_element')
        benchmark_a_03__result = timing.results.get('A_03__add_child')
        benchmark_a_03__result.final_score -= benchmark_a_02__result.final_score
        benchmark_a_03__result.raw_score   -= benchmark_a_02__result.raw_score

        # ───────────────────────────────────────────────────────────────────────
        # A_04: attrs_graph.register_element(...)
        # ───────────────────────────────────────────────────────────────────────
        document_A_04  = create_fresh_document_with_body()
        converter_A_04 = Html__To__Html_MGraph__Document__Node_Id_Reuse()

        def stage_A_04__register_element():
            node_id = converter_A_04._generate_node_id()
            document_A_04.body_graph.create_element(node_path=Node_Path('body.p[0]'),
                                                     node_id=node_id)
            document_A_04.attrs_graph.register_element(node_id, 'p')

        timing.benchmark('A_04__register_element', stage_A_04__register_element)

        # Adjust A_04 to get isolated register_element cost
        benchmark_a_04__result = timing.results.get('A_04__register_element')
        benchmark_a_04__result.final_score -= benchmark_a_02__result.final_score
        benchmark_a_04__result.raw_score   -= benchmark_a_02__result.raw_score

        # ───────────────────────────────────────────────────────────────────────
        # A_05: attrs_graph.add_attribute(...) - single attribute
        # ───────────────────────────────────────────────────────────────────────
        document_A_05  = create_fresh_document_with_body()
        converter_A_05 = Html__To__Html_MGraph__Document__Node_Id_Reuse()

        def stage_A_05__add_attribute():
            node_id = converter_A_05._generate_node_id()
            document_A_05.body_graph.create_element(node_path=Node_Path('body.p[0]'),
                                                     node_id=node_id)
            document_A_05.attrs_graph.register_element(node_id, 'p')
            document_A_05.attrs_graph.add_attribute(node_id, 'class', 'test-class', 0)

        timing.benchmark('A_05__add_attribute', stage_A_05__add_attribute)

        # Adjust A_05 to get isolated add_attribute cost
        benchmark_a_05__result = timing.results.get('A_05__add_attribute')
        benchmark_a_05__result.final_score -= benchmark_a_02__result.final_score
        benchmark_a_05__result.raw_score   -= benchmark_a_02__result.raw_score
        benchmark_a_05__result.final_score -= benchmark_a_04__result.final_score
        benchmark_a_05__result.raw_score   -= benchmark_a_04__result.raw_score

        # ───────────────────────────────────────────────────────────────────────
        # A_06: Full _create_in_graph (create_element + add_child)
        # ───────────────────────────────────────────────────────────────────────
        document_A_06  = create_fresh_document_with_body()
        converter_A_06 = Html__To__Html_MGraph__Document__Node_Id_Reuse()

        def stage_A_06__full_create_in_graph():
            node_id = converter_A_06._generate_node_id()
            converter_A_06._process_body__create_in_graph(document_A_06, body_node_id,
                                                          node_id, 0, 'body.p[0]')

        timing.benchmark('A_06__full_create_in_graph', stage_A_06__full_create_in_graph)

        # ───────────────────────────────────────────────────────────────────────
        # A_07: Full _register_attrs (register_element + add_attributes loop)
        # Note: Our test <p> has no attributes, so this measures register only
        # ───────────────────────────────────────────────────────────────────────
        document_A_07  = create_fresh_document_with_body()
        converter_A_07 = Html__To__Html_MGraph__Document__Node_Id_Reuse()

        def stage_A_07__full_register_attrs():
            node_id = converter_A_07._generate_node_id()
            converter_A_07._process_body__create_in_graph(document_A_07, body_node_id,
                                                          node_id, 0, 'body.p[0]')
            converter_A_07._process_body__register_attrs(document_A_07, node_id, 'p', first_p_node)

        timing.benchmark('A_07__full_register_attrs', stage_A_07__full_register_attrs)

        # Adjust A_07 to get isolated _register_attrs cost
        benchmark_a_06__result = timing.results.get('A_06__full_create_in_graph')
        benchmark_a_07__result = timing.results.get('A_07__full_register_attrs')
        benchmark_a_07__result.final_score -= benchmark_a_06__result.final_score
        benchmark_a_07__result.raw_score   -= benchmark_a_06__result.raw_score

        # ═══════════════════════════════════════════════════════════════════════
        # Section B: Full loop processing (all elements)
        # ═══════════════════════════════════════════════════════════════════════

        # ───────────────────────────────────────────────────────────────────────
        # B_01: Node_Path creation for ALL elements
        # ───────────────────────────────────────────────────────────────────────
        converter_B_01 = Html__To__Html_MGraph__Document__Node_Id_Reuse()

        def stage_B_01__node_path_all():
            tag_counts     = converter_B_01._count_tags(nodes)
            tag_occurrence = {}
            for position, node in enumerate(nodes):
                if not isinstance(node, dict):
                    continue
                if 'tag' in node:
                    tag       = node.get('tag', '').lower()
                    tag_index = tag_occurrence.get(tag, 0)
                    tag_occurrence[tag] = tag_index + 1
                    if tag_counts.get(tag, 0) > 1:
                        node_path = Node_Path(f"body.{tag}[{tag_index}]")
                    else:
                        node_path = Node_Path(f"body.{tag}")

        timing.benchmark('B_01__node_path_all', stage_B_01__node_path_all)

        # ───────────────────────────────────────────────────────────────────────
        # B_02: create_element for ALL elements
        # ───────────────────────────────────────────────────────────────────────
        document_B_02  = create_fresh_document_with_body()
        converter_B_02 = Html__To__Html_MGraph__Document__Node_Id_Reuse()

        def stage_B_02__create_element_all():
            tag_counts     = converter_B_02._count_tags(nodes)
            tag_occurrence = {}
            for position, node in enumerate(nodes):
                if not isinstance(node, dict):
                    continue
                if 'tag' in node:
                    tag       = node.get('tag', '').lower()
                    tag_index = tag_occurrence.get(tag, 0)
                    tag_occurrence[tag] = tag_index + 1
                    if tag_counts.get(tag, 0) > 1:
                        node_path = f"body.{tag}[{tag_index}]"
                    else:
                        node_path = f"body.{tag}"
                    node_id = converter_B_02._generate_node_id()
                    document_B_02.body_graph.create_element(node_path=Node_Path(node_path),
                                                            node_id=node_id)

        timing.benchmark('B_02__create_element_all', stage_B_02__create_element_all)

        # ───────────────────────────────────────────────────────────────────────
        # B_03: create_element + add_child for ALL elements
        # ───────────────────────────────────────────────────────────────────────
        document_B_03  = create_fresh_document_with_body()
        converter_B_03 = Html__To__Html_MGraph__Document__Node_Id_Reuse()

        def stage_B_03__add_child_all():
            tag_counts     = converter_B_03._count_tags(nodes)
            tag_occurrence = {}
            for position, node in enumerate(nodes):
                if not isinstance(node, dict):
                    continue
                if 'tag' in node:
                    tag       = node.get('tag', '').lower()
                    tag_index = tag_occurrence.get(tag, 0)
                    tag_occurrence[tag] = tag_index + 1
                    if tag_counts.get(tag, 0) > 1:
                        node_path = f"body.{tag}[{tag_index}]"
                    else:
                        node_path = f"body.{tag}"
                    node_id = converter_B_03._generate_node_id()
                    document_B_03.body_graph.create_element(node_path=Node_Path(node_path),
                                                            node_id=node_id)
                    document_B_03.body_graph.add_child(body_node_id, node_id, position)

        timing.benchmark('B_03__add_child_all', stage_B_03__add_child_all)

        # Adjust B_03 to get isolated add_child cost
        benchmark_b_02__result = timing.results.get('B_02__create_element_all')
        benchmark_b_03__result = timing.results.get('B_03__add_child_all')
        benchmark_b_03__result.final_score -= benchmark_b_02__result.final_score
        benchmark_b_03__result.raw_score   -= benchmark_b_02__result.raw_score

        # ───────────────────────────────────────────────────────────────────────
        # B_04: register_element for ALL elements
        # ───────────────────────────────────────────────────────────────────────
        document_B_04  = create_fresh_document_with_body()
        converter_B_04 = Html__To__Html_MGraph__Document__Node_Id_Reuse()

        def stage_B_04__register_element_all():
            tag_counts     = converter_B_04._count_tags(nodes)
            tag_occurrence = {}
            for position, node in enumerate(nodes):
                if not isinstance(node, dict):
                    continue
                if 'tag' in node:
                    tag       = node.get('tag', '').lower()
                    tag_index = tag_occurrence.get(tag, 0)
                    tag_occurrence[tag] = tag_index + 1
                    if tag_counts.get(tag, 0) > 1:
                        node_path = f"body.{tag}[{tag_index}]"
                    else:
                        node_path = f"body.{tag}"
                    node_id = converter_B_04._generate_node_id()
                    document_B_04.body_graph.create_element(node_path=Node_Path(node_path),
                                                            node_id=node_id)
                    document_B_04.attrs_graph.register_element(node_id, tag)

        timing.benchmark('B_04__register_element_all', stage_B_04__register_element_all)

        # Adjust B_04 to get isolated register_element cost
        benchmark_b_04__result = timing.results.get('B_04__register_element_all')
        benchmark_b_04__result.final_score -= benchmark_b_02__result.final_score
        benchmark_b_04__result.raw_score   -= benchmark_b_02__result.raw_score

        # ───────────────────────────────────────────────────────────────────────
        # B_05: Full _process_body__create_in_graph for ALL (reference from perf_7)
        # ───────────────────────────────────────────────────────────────────────
        document_B_05  = create_fresh_document_with_body()
        converter_B_05 = Html__To__Html_MGraph__Document__Node_Id_Reuse()

        def stage_B_05__full_create_in_graph_all():
            tag_counts     = converter_B_05._count_tags(nodes)
            tag_occurrence = {}
            for position, node in enumerate(nodes):
                if not isinstance(node, dict):
                    continue
                if 'tag' in node:
                    tag       = node.get('tag', '').lower()
                    tag_index = tag_occurrence.get(tag, 0)
                    tag_occurrence[tag] = tag_index + 1
                    if tag_counts.get(tag, 0) > 1:
                        node_path = f"body.{tag}[{tag_index}]"
                    else:
                        node_path = f"body.{tag}"
                    node_id = converter_B_05._generate_node_id()
                    converter_B_05._process_body__create_in_graph(document_B_05, body_node_id,
                                                                   node_id, position, node_path)

        timing.benchmark('B_05__full_create_in_graph_all', stage_B_05__full_create_in_graph_all)

        # ───────────────────────────────────────────────────────────────────────
        # B_06: Full _register_attrs for ALL (reference from perf_7)
        # ───────────────────────────────────────────────────────────────────────
        document_B_06  = create_fresh_document_with_body()
        converter_B_06 = Html__To__Html_MGraph__Document__Node_Id_Reuse()

        def stage_B_06__full_register_attrs_all():
            tag_counts     = converter_B_06._count_tags(nodes)
            tag_occurrence = {}
            for position, node in enumerate(nodes):
                if not isinstance(node, dict):
                    continue
                if 'tag' in node:
                    tag       = node.get('tag', '').lower()
                    tag_index = tag_occurrence.get(tag, 0)
                    tag_occurrence[tag] = tag_index + 1
                    if tag_counts.get(tag, 0) > 1:
                        node_path = f"body.{tag}[{tag_index}]"
                    else:
                        node_path = f"body.{tag}"
                    node_id = converter_B_06._generate_node_id()
                    converter_B_06._process_body__create_in_graph(document_B_06, body_node_id,
                                                                   node_id, position, node_path)
                    converter_B_06._process_body__register_attrs(document_B_06, node_id, tag, node)

        timing.benchmark('B_06__full_register_attrs_all', stage_B_06__full_register_attrs_all)

        # Adjust B_06 to get isolated _register_attrs cost
        benchmark_b_05__result = timing.results.get('B_05__full_create_in_graph_all')
        benchmark_b_06__result = timing.results.get('B_06__full_register_attrs_all')
        benchmark_b_06__result.final_score -= benchmark_b_05__result.final_score
        benchmark_b_06__result.raw_score   -= benchmark_b_05__result.raw_score

    # ═══════════════════════════════════════════════════════════════════════════
    # Test Method
    # ═══════════════════════════════════════════════════════════════════════════

    @type_safe_fast_create
    def test__graph_operations__breakdown(self):
        builder = Perf_Report__Builder(metadata = Schema__Perf_Report__Metadata(title        = REPORT_TITLE                         ,
                                                                                version      = version__mgraph_ai_service_html_graph,
                                                                                description  = REPORT_DESCRIPTION                   ,
                                                                                test_input   = REPORT_TEST_INPUT                    ,
                                                                                measure_mode = Enum__Measure_Mode.FAST              ),
                                       legend   = Dict__Perf_Report__Legend(REPORT_LEGEND)                                           ,
                                       config   = self.config                                                                        )

        report = builder.run(self.benchmarks)

        self.storage.save(report, key=REPORT_KEY, formats=['txt'])

        #print(Perf_Report__Renderer__Text().render(report))