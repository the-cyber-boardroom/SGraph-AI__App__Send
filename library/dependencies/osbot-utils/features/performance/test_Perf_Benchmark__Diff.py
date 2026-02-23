# ═══════════════════════════════════════════════════════════════════════════════
# test_Perf_Benchmark__Diff - Tests for multi-session comparison class
# ═══════════════════════════════════════════════════════════════════════════════

import tempfile
import os
from unittest                                                                                             import TestCase
from osbot_utils.helpers.performance.benchmark.schemas.benchmark.Schema__Perf__Benchmark__Session         import Schema__Perf__Benchmark__Session
from osbot_utils.helpers.performance.benchmark.schemas.benchmark.Schema__Perf__Comparison__Two            import Schema__Perf__Comparison__Two
from osbot_utils.helpers.performance.benchmark.testing.QA__Benchmark__Test_Data                           import QA__Benchmark__Test_Data
from osbot_utils.testing.Pytest                                                                           import skip__if_not__in_github_actions
from osbot_utils.testing.__                                                                               import __, __SKIP__
from osbot_utils.type_safe.Type_Safe                                                                      import Type_Safe
from osbot_utils.utils.Files                                                                              import file_create, folder_delete_all, file_exists
from osbot_utils.utils.Json                                                                               import json_dumps
from osbot_utils.helpers.performance.benchmark.Perf_Benchmark__Diff                                       import Perf_Benchmark__Diff
from osbot_utils.helpers.performance.benchmark.schemas.collections.List__Benchmark_Sessions               import List__Benchmark_Sessions
from osbot_utils.helpers.performance.benchmark.schemas.Schema__Perf__Evolution                            import Schema__Perf__Evolution
from osbot_utils.helpers.performance.benchmark.schemas.Schema__Perf__Statistics                           import Schema__Perf__Statistics
from osbot_utils.helpers.performance.benchmark.schemas.enums.Enum__Comparison__Status                     import Enum__Comparison__Status
from osbot_utils.helpers.performance.benchmark.schemas.enums.Enum__Benchmark__Trend                       import Enum__Benchmark__Trend
from osbot_utils.helpers.performance.benchmark.export.Perf_Benchmark__Export__Text                        import Perf_Benchmark__Export__Text
from osbot_utils.helpers.performance.benchmark.export.Perf_Benchmark__Export__HTML                        import Perf_Benchmark__Export__HTML
from osbot_utils.helpers.performance.benchmark.export.Perf_Benchmark__Export__JSON                        import Perf_Benchmark__Export__JSON


class test_Perf_Benchmark__Diff(TestCase):

    @classmethod
    def setUpClass(cls):                                                         # Shared test data
        skip__if_not__in_github_actions()
        cls.test_data    = QA__Benchmark__Test_Data()
        cls.text_export  = Perf_Benchmark__Export__Text()
        cls.html_export  = Perf_Benchmark__Export__HTML()
        cls.json_export  = Perf_Benchmark__Export__JSON()

        # Create temp folder with JSON files
        cls.temp_dir = tempfile.mkdtemp()

        # Create sessions with varying performance
        # sessions = [('Session 1', 1.0),                                          # Baseline
        #             ('Session 2', 0.8),                                          # 20% improvement
        #             ('Session 3', 0.6)]                                          # 40% improvement
        sessions = [('Session 1', 1.0),                                          # Baseline
                    ('Session 2', 0.9),                                          # 10% improvement
                    ('Session 3', 1.2)]                                          # 20% regression from baseline

        for i, (title, multiplier) in enumerate(sessions):
            session   = cls.test_data.create_session_with_scores(title, multiplier)
            json_data = session.json()
            filepath  = os.path.join(cls.temp_dir, f'session_{i+1}.json')
            file_create(filepath, json_dumps(json_data, indent=2))

    @classmethod
    def tearDownClass(cls):                                                         # Shared test data
        assert folder_delete_all(cls.temp_dir) is True

    def test__init__(self):                                                      # Test initialization
        with Perf_Benchmark__Diff() as _:
            assert type(_)          is Perf_Benchmark__Diff
            assert isinstance(_, Type_Safe)
            assert type(_.sessions) is List__Benchmark_Sessions
            assert len(_.sessions)  == 0
            assert _.obj()          == __(sessions=[])


    # ═══════════════════════════════════════════════════════════════════════════════
    # Loading Tests
    # ═══════════════════════════════════════════════════════════════════════════════

    def test_load_session(self):                                                 # Test load single file
        filepath = os.path.join(self.temp_dir, 'session_1.json')

        with Perf_Benchmark__Diff() as _:
            result = _.load_session(filepath)

            assert result               is _                                    # Returns self
            assert len(_.sessions)      == 1
            assert type(_.sessions[0])  is Schema__Perf__Benchmark__Session
            assert result.obj()         == __(sessions = [__(title       = 'Session 1'                    ,
                                                             description = 'Test description'              ,
                                                             timestamp   = __SKIP__                   ,
                                                             results     = __(A_01__python__nop         = __(benchmark_id = 'A_01__python__nop'         ,
                                                                                                            section      = 'A'                          ,
                                                                                                            index        = '01'                         ,
                                                                                                            name         = 'python__nop'                ,
                                                                                                            final_score  = 1000                         ,
                                                                                                            raw_score    = 870                          ),
                                                                               A_02__python__class_empty = __(benchmark_id = 'A_02__python__class_empty' ,
                                                                                                            section      = 'A'                          ,
                                                                                                            index        = '02'                         ,
                                                                                                            name         = 'python__class_empty'        ,
                                                                                                            final_score  = 500                          ,
                                                                                                            raw_score    = 455                          ),
                                                                               B_01__type_safe__empty    = __(benchmark_id = 'B_01__type_safe__empty'    ,
                                                                                                            section      = 'B'                          ,
                                                                                                            index        = '01'                         ,
                                                                                                            name         = 'type_safe__empty'           ,
                                                                                                            final_score  = 2000                         ,
                                                                                                            raw_score    = 1760                         )),
                                                             legend      = __()                            )])



    def test_load_session__missing_file(self):                                   # Test missing file
        with Perf_Benchmark__Diff() as _:
            _.load_session('/nonexistent/file.json')

            assert len(_.sessions) == 0                                          # No session loaded

    def test_load_session__multiple(self):                                       # Test loading multiple
        filepath_1 = os.path.join(self.temp_dir, 'session_1.json')
        filepath_2 = os.path.join(self.temp_dir, 'session_2.json')

        with Perf_Benchmark__Diff() as _:
            _.load_session(filepath_1)
            _.load_session(filepath_2)

            assert len(_.sessions) == 2

        assert type(_.sessions[0])      is Schema__Perf__Benchmark__Session
        assert type(_.sessions[1])      is Schema__Perf__Benchmark__Session

    def test_load_folder(self):                                                  # Test load folder
        with Perf_Benchmark__Diff() as _:
            result = _.load_folder(self.temp_dir)

            assert result is _                                                   # Returns self
            assert len(_.sessions) == 3                                          # All 3 JSON files

    def test_load_folder__sorted(self):                                          # Test files loaded sorted
        with Perf_Benchmark__Diff() as _:
            _.load_folder(self.temp_dir)

            # Files should be sorted alphabetically
            assert _.sessions[0].title == 'Session 1'
            assert _.sessions[1].title == 'Session 2'
            assert _.sessions[2].title == 'Session 3'


    # ═══════════════════════════════════════════════════════════════════════════════
    # compare_two Tests
    # ═══════════════════════════════════════════════════════════════════════════════

    def test_compare_two(self):                                                  # Test two-session compare
        with Perf_Benchmark__Diff() as _:
            _.load_folder(self.temp_dir)
            sessions = _.sessions
            result   = _.compare_two()

            assert type(result)           is Schema__Perf__Comparison__Two
            assert result.status          == Enum__Comparison__Status.SUCCESS
            assert result.title_a         == 'Session 1'
            assert result.title_b         == 'Session 3'
            assert len(result.comparisons) > 0
            assert result.obj()           == __(status      = 'success'                ,
   error       = ''                       ,
   title_a     = 'Session 1'              ,
   title_b     = 'Session 3'              ,
   comparisons = [__(benchmark_id   = 'A_01__python__nop'        ,
                     name           = 'python__nop'              ,
                     score_a        = 1000                       ,
                     score_b        = 1200                       ,
                     change_percent = -20.0                      ,
                     trend          = 'strong_regression'        ),
                  __(benchmark_id   = 'A_02__python__class_empty',
                     name           = 'python__class_empty'      ,
                     score_a        = 500                        ,
                     score_b        = 600                        ,
                     change_percent = -20.0                      ,
                     trend          = 'strong_regression'        ),
                  __(benchmark_id   = 'B_01__type_safe__empty'   ,
                     name           = 'type_safe__empty'         ,
                     score_a        = 2000                       ,
                     score_b        = 2400                       ,
                     change_percent = -20.0                      ,
                     trend          = 'strong_regression'        )],
   timestamp   = __SKIP__          )



            result_0_0 = _.compare_two(sessions[0], sessions[0])
            result_0_1 = _.compare_two(sessions[0], sessions[1])
            result_0_2 = _.compare_two(sessions[0], sessions[2])

            result_1_0 = _.compare_two(sessions[1], sessions[0])
            result_1_1 = _.compare_two(sessions[1], sessions[1])
            result_1_2 = _.compare_two(sessions[1], sessions[2])

            result_2_0 = _.compare_two(sessions[2], sessions[0])
            result_2_1 = _.compare_two(sessions[2], sessions[1])
            result_2_2 = _.compare_two(sessions[2], sessions[2])

            assert result_0_0.obj() == __(status      = 'success'                ,
                                          error       = ''                       ,
                                          title_a     = 'Session 1'              ,
                                          title_b     = 'Session 1'              ,
                                          comparisons = [__(benchmark_id   = 'A_01__python__nop'        ,
                                                            name           = 'python__nop'              ,
                                                            score_a        = 1000                       ,
                                                            score_b        = 1000                       ,
                                                            change_percent = 0.0                        ,
                                                            trend          = 'unchanged'                ),
                                                         __(benchmark_id   = 'A_02__python__class_empty',
                                                            name           = 'python__class_empty'      ,
                                                            score_a        = 500                        ,
                                                            score_b        = 500                        ,
                                                            change_percent = 0.0                        ,
                                                            trend          = 'unchanged'                ),
                                                         __(benchmark_id   = 'B_01__type_safe__empty'   ,
                                                            name           = 'type_safe__empty'         ,
                                                            score_a        = 2000                       ,
                                                            score_b        = 2000                       ,
                                                            change_percent = 0.0                        ,
                                                            trend          = 'unchanged'                )],
                                          timestamp   = __SKIP__                 )

            assert result_0_1.obj() == __(status      = 'success'                ,
                                          error       = ''                       ,
                                          title_a     = 'Session 1'              ,
                                          title_b     = 'Session 2'              ,
                                          comparisons = [__(benchmark_id   = 'A_01__python__nop'        ,
                                                            name           = 'python__nop'              ,
                                                            score_a        = 1000                       ,
                                                            score_b        = 900                        ,
                                                            change_percent = 10.0                       ,
                                                            trend          = 'improvement'              ),
                                                         __(benchmark_id   = 'A_02__python__class_empty',
                                                            name           = 'python__class_empty'      ,
                                                            score_a        = 500                        ,
                                                            score_b        = 450                        ,
                                                            change_percent = 10.0                       ,
                                                            trend          = 'improvement'              ),
                                                         __(benchmark_id   = 'B_01__type_safe__empty'   ,
                                                            name           = 'type_safe__empty'         ,
                                                            score_a        = 2000                       ,
                                                            score_b        = 1800                       ,
                                                            change_percent = 10.0                       ,
                                                            trend          = 'improvement'              )],
                                          timestamp   = __SKIP__                 )

            assert result_0_2.obj() == __(status      = 'success'                ,
                                          error       = ''                       ,
                                          title_a     = 'Session 1'              ,
                                          title_b     = 'Session 3'              ,
                                          comparisons = [__(benchmark_id   = 'A_01__python__nop'        ,
                                                            name           = 'python__nop'              ,
                                                            score_a        = 1000                       ,
                                                            score_b        = 1200                       ,
                                                            change_percent = -20.0                      ,
                                                            trend          = 'strong_regression'        ),
                                                         __(benchmark_id   = 'A_02__python__class_empty',
                                                            name           = 'python__class_empty'      ,
                                                            score_a        = 500                        ,
                                                            score_b        = 600                        ,
                                                            change_percent = -20.0                      ,
                                                            trend          = 'strong_regression'        ),
                                                         __(benchmark_id   = 'B_01__type_safe__empty'   ,
                                                            name           = 'type_safe__empty'         ,
                                                            score_a        = 2000                       ,
                                                            score_b        = 2400                       ,
                                                            change_percent = -20.0                      ,
                                                            trend          = 'strong_regression'        )],
                                          timestamp   = __SKIP__                 )


            assert result_1_0.obj() == __(status='success',
                                          error='',
                                          title_a='Session 2',
                                          title_b='Session 1',
                                          comparisons=[__(benchmark_id='A_01__python__nop',
                                                          name='python__nop',
                                                          score_a=900,
                                                          score_b=1000,
                                                          change_percent=-11.11,
                                                          trend='strong_regression'),
                                                       __(benchmark_id='A_02__python__class_empty',
                                                          name='python__class_empty',
                                                          score_a=450,
                                                          score_b=500,
                                                          change_percent=-11.11,
                                                          trend='strong_regression'),
                                                       __(benchmark_id='B_01__type_safe__empty',
                                                          name='type_safe__empty',
                                                          score_a=1800,
                                                          score_b=2000,
                                                          change_percent=-11.11,
                                                          trend='strong_regression')],
                                          timestamp=__SKIP__)

            assert result_1_1.obj() == __(status='success',
                                          error='',
                                          title_a='Session 2',
                                          title_b='Session 2',
                                          comparisons=[__(benchmark_id='A_01__python__nop',
                                                          name='python__nop',
                                                          score_a=900,
                                                          score_b=900,
                                                          change_percent=0.0,
                                                          trend='unchanged'),
                                                       __(benchmark_id='A_02__python__class_empty',
                                                          name='python__class_empty',
                                                          score_a=450,
                                                          score_b=450,
                                                          change_percent=0.0,
                                                          trend='unchanged'),
                                                       __(benchmark_id='B_01__type_safe__empty',
                                                          name='type_safe__empty',
                                                          score_a=1800,
                                                          score_b=1800,
                                                          change_percent=0.0,
                                                          trend='unchanged')],
                                          timestamp=__SKIP__)

            assert result_1_2.obj() == __(status='success',
                                          error='',
                                          title_a='Session 2',
                                          title_b='Session 3',
                                          comparisons=[__(benchmark_id='A_01__python__nop',
                                                          name='python__nop',
                                                          score_a=900,
                                                          score_b=1200,
                                                          change_percent=-33.33,
                                                          trend='strong_regression'),
                                                       __(benchmark_id='A_02__python__class_empty',
                                                          name='python__class_empty',
                                                          score_a=450,
                                                          score_b=600,
                                                          change_percent=-33.33,
                                                          trend='strong_regression'),
                                                       __(benchmark_id='B_01__type_safe__empty',
                                                          name='type_safe__empty',
                                                          score_a=1800,
                                                          score_b=2400,
                                                          change_percent=-33.33,
                                                          trend='strong_regression')],
                                          timestamp=__SKIP__)

            assert result_2_0.obj() == __(status='success',
                                          error='',
                                          title_a='Session 3',
                                          title_b='Session 1',
                                          comparisons=[__(benchmark_id='A_01__python__nop',
                                                          name='python__nop',
                                                          score_a=1200,
                                                          score_b=1000,
                                                          change_percent=16.67,
                                                          trend='strong_improvement'),
                                                       __(benchmark_id='A_02__python__class_empty',
                                                          name='python__class_empty',
                                                          score_a=600,
                                                          score_b=500,
                                                          change_percent=16.67,
                                                          trend='strong_improvement'),
                                                       __(benchmark_id='B_01__type_safe__empty',
                                                          name='type_safe__empty',
                                                          score_a=2400,
                                                          score_b=2000,
                                                          change_percent=16.67,
                                                          trend='strong_improvement')],
                                          timestamp=__SKIP__)

            assert result_2_1.obj() == __(status='success',
                                          error='',
                                          title_a='Session 3',
                                          title_b='Session 2',
                                          comparisons=[__(benchmark_id='A_01__python__nop',
                                                          name='python__nop',
                                                          score_a=1200,
                                                          score_b=900,
                                                          change_percent=25.0,
                                                          trend='strong_improvement'),
                                                       __(benchmark_id='A_02__python__class_empty',
                                                          name='python__class_empty',
                                                          score_a=600,
                                                          score_b=450,
                                                          change_percent=25.0,
                                                          trend='strong_improvement'),
                                                       __(benchmark_id='B_01__type_safe__empty',
                                                          name='type_safe__empty',
                                                          score_a=2400,
                                                          score_b=1800,
                                                          change_percent=25.0,
                                                          trend='strong_improvement')],
                                          timestamp=__SKIP__)

            assert result_2_2.obj() == __(status='success',
                                          error='',
                                          title_a='Session 3',
                                          title_b='Session 3',
                                          comparisons=[__(benchmark_id='A_01__python__nop',
                                                          name='python__nop',
                                                          score_a=1200,
                                                          score_b=1200,
                                                          change_percent=0.0,
                                                          trend='unchanged'),
                                                       __(benchmark_id='A_02__python__class_empty',
                                                          name='python__class_empty',
                                                          score_a=600,
                                                          score_b=600,
                                                          change_percent=0.0,
                                                          trend='unchanged'),
                                                       __(benchmark_id='B_01__type_safe__empty',
                                                          name='type_safe__empty',
                                                          score_a=2400,
                                                          score_b=2400,
                                                          change_percent=0.0,
                                                          trend='unchanged')],
                                          timestamp=__SKIP__)



    def test_compare_two__explicit_sessions(self):                               # Test explicit sessions
        with Perf_Benchmark__Diff() as _:
            _.load_folder(self.temp_dir)

            result = _.compare_two(_.sessions[0], _.sessions[2])

            assert type(result) is Schema__Perf__Comparison__Two
            assert result.status == Enum__Comparison__Status.SUCCESS

    def test_compare_two__no_sessions(self):                                     # Test no sessions
        with Perf_Benchmark__Diff() as _:
            result = _.compare_two()

            assert result.status == Enum__Comparison__Status.ERROR_NO_SESSIONS
            assert 'No sessions' in result.error

    def test_compare_two__insufficient_sessions(self):                           # Test not enough sessions
        with Perf_Benchmark__Diff() as _:
            _.load_session(os.path.join(self.temp_dir, 'session_1.json'))

            result = _.compare_two()

            assert result.status == Enum__Comparison__Status.ERROR_INSUFFICIENT_SESSIONS
            assert 'at least 2' in result.error

    def test_compare_two__comparison_fields(self):                               # Test comparison schema
        with Perf_Benchmark__Diff() as _:
            _.load_folder(self.temp_dir)

            result     = _.compare_two()
            comparison = result.comparisons[0]

            assert comparison.benchmark_id is not None
            assert comparison.name         is not None
            assert comparison.score_a      >= 0
            assert comparison.score_b      >= 0
            assert comparison.trend        in list(Enum__Benchmark__Trend)


    # ═══════════════════════════════════════════════════════════════════════════════
    # compare_all Tests
    # ═══════════════════════════════════════════════════════════════════════════════

    def test_compare_all(self):                                                  # Test multi-session compare
        with Perf_Benchmark__Diff() as _:
            _.load_folder(self.temp_dir)

            result = _.compare_all()

            assert type(result) is Schema__Perf__Evolution
            assert result.status == Enum__Comparison__Status.SUCCESS
            assert result.session_count  == 3
            assert len(result.titles)    == 3
            assert len(result.evolutions) > 0

            assert result.obj() == __(status        = 'success'                ,
                                      error         = ''                       ,
                                      session_count = 3                        ,
                                      titles        = ['Session 1', 'Session 2', 'Session 3'],
                                      evolutions    = [__(benchmark_id   = 'A_01__python__nop'        ,
                                                          name           = 'python__nop'              ,
                                                          scores         = [1000, 900, 1200]          ,
                                                          first_score    = 1000                       ,
                                                          last_score     = 1200                       ,
                                                          change_percent = -20.0                      ,
                                                          trend          = 'strong_regression'        ),
                                                       __(benchmark_id   = 'A_02__python__class_empty',
                                                          name           = 'python__class_empty'      ,
                                                          scores         = [500, 450, 600]            ,
                                                          first_score    = 500                        ,
                                                          last_score     = 600                        ,
                                                          change_percent = -20.0                      ,
                                                          trend          = 'strong_regression'        ),
                                                       __(benchmark_id   = 'B_01__type_safe__empty'   ,
                                                          name           = 'type_safe__empty'         ,
                                                          scores         = [2000, 1800, 2400]         ,
                                                          first_score    = 2000                       ,
                                                          last_score     = 2400                       ,
                                                          change_percent = -20.0                      ,
                                                          trend          = 'strong_regression'        )],
                                      timestamp      = __SKIP__          )


    def test_compare_all__no_sessions(self):                                     # Test no sessions
        with Perf_Benchmark__Diff() as _:
            result = _.compare_all()

            assert result.status == Enum__Comparison__Status.ERROR_NO_SESSIONS

    def test_compare_all__single_session(self):                                  # Test single session
        with Perf_Benchmark__Diff() as _:
            _.load_session(os.path.join(self.temp_dir, 'session_1.json'))

            result = _.compare_all()

            assert result.status == Enum__Comparison__Status.ERROR_INSUFFICIENT_SESSIONS

    def test_compare_all__evolution_fields(self):                                # Test evolution schema
        with Perf_Benchmark__Diff() as _:
            _.load_folder(self.temp_dir)

            result    = _.compare_all()
            evolution = result.evolutions[0]

            assert evolution.benchmark_id   is not None
            assert evolution.name           is not None
            assert len(evolution.scores)    == 3                                 # One per session
            assert evolution.first_score    >= 0
            assert evolution.last_score     >= 0
            assert evolution.trend          in list(Enum__Benchmark__Trend)


    # ═══════════════════════════════════════════════════════════════════════════════
    # statistics Tests
    # ═══════════════════════════════════════════════════════════════════════════════

    def test_statistics(self):                                                   # Test statistics
        with Perf_Benchmark__Diff() as _:
            _.load_folder(self.temp_dir)

            result = _.statistics()

            assert type(result)            is Schema__Perf__Statistics
            assert result.status           == Enum__Comparison__Status.SUCCESS
            assert result.session_count    == 3
            assert result.benchmark_count  > 0

            assert result.obj()            == __(status           = 'success'  ,
                                                 error            = ''         ,
                                                 session_count    = 3          ,
                                                 benchmark_count  = 3          ,
                                                 improvement_count= __SKIP__   ,
                                                 regression_count = __SKIP__   ,
                                                 avg_improvement  = __SKIP__   ,
                                                 avg_regression   = __SKIP__  ,
                                                 best_improvement = __SKIP__  ,
                                                 worst_regression = __SKIP__  ,
                                                 timestamp         = __SKIP__ )


    def test_statistics__no_sessions(self):                                      # Test no sessions
        with Perf_Benchmark__Diff() as _:
            result = _.statistics()

            assert result.status == Enum__Comparison__Status.ERROR_NO_SESSIONS

    def test_statistics__insufficient(self):                                     # Test insufficient
        with Perf_Benchmark__Diff() as _:
            _.load_session(os.path.join(self.temp_dir, 'session_1.json'))

            result = _.statistics()

            assert result.status == Enum__Comparison__Status.ERROR_INSUFFICIENT_SESSIONS


    # ═══════════════════════════════════════════════════════════════════════════════
    # Text Export Tests
    # ═══════════════════════════════════════════════════════════════════════════════

    def test_export_text__comparison(self):                                      # Test text comparison
        with Perf_Benchmark__Diff() as _:
            _.load_folder(self.temp_dir)
            sessions = _.sessions

            # Session 1 vs Session 3: strong_regression (-20%)
            result = _.compare_two()
            text   = self.text_export.export_comparison(result)

            assert type(text)   is str
            assert 'Comparison' in text
            assert 'Session 1'  in text
            assert 'Session 3'  in text
            assert text         == ('┌──────────────────────────────────────────────────────────┐\n'
                                    '│ Comparison: Session 1 vs Session 3                       │\n'
                                    '├──────────────────────────────────────────────────────────┤\n'
                                    '│ Benchmark           │ Session 1 │ Session 3 │ Change     │\n'
                                    '├──────────────────────────────────────────────────────────┤\n'
                                    '│ python__nop         │ 1,000 ns  │ 1,200 ns  │ +20.0% ▲▲▲ │\n'
                                    '│ python__class_empty │ 500 ns    │ 600 ns    │ +20.0% ▲▲▲ │\n'
                                    '│ type_safe__empty    │ 2,000 ns  │ 2,400 ns  │ +20.0% ▲▲▲ │\n'
                                    '└──────────────────────────────────────────────────────────┘')

            # Session 1 vs Session 1: unchanged (0%)
            result_0_0 = _.compare_two(sessions[0], sessions[0])
            text_0_0   = self.text_export.export_comparison(result_0_0)

            assert text_0_0     == ('┌──────────────────────────────────────────────────────┐\n'
                                    '│ Comparison: Session 1 vs Session 1                   │\n'
                                    '├──────────────────────────────────────────────────────┤\n'
                                    '│ Benchmark           │ Session 1 │ Session 1 │ Change │\n'
                                    '├──────────────────────────────────────────────────────┤\n'
                                    '│ python__nop         │ 1,000 ns  │ 1,000 ns  │ 0% ─   │\n'
                                    '│ python__class_empty │ 500 ns    │ 500 ns    │ 0% ─   │\n'
                                    '│ type_safe__empty    │ 2,000 ns  │ 2,000 ns  │ 0% ─   │\n'
                                    '└──────────────────────────────────────────────────────┘')

            # Session 1 vs Session 2: improvement (10%)
            result_0_1 = _.compare_two(sessions[0], sessions[1])
            text_0_1   = self.text_export.export_comparison(result_0_1)

            assert text_0_1     == ('┌────────────────────────────────────────────────────────┐\n'
                                    '│ Comparison: Session 1 vs Session 2                     │\n'
                                    '├────────────────────────────────────────────────────────┤\n'
                                    '│ Benchmark           │ Session 1 │ Session 2 │ Change   │\n'
                                    '├────────────────────────────────────────────────────────┤\n'
                                    '│ python__nop         │ 1,000 ns  │ 900 ns    │ -10.0% ▼ │\n'
                                    '│ python__class_empty │ 500 ns    │ 450 ns    │ -10.0% ▼ │\n'
                                    '│ type_safe__empty    │ 2,000 ns  │ 1,800 ns  │ -10.0% ▼ │\n'
                                    '└────────────────────────────────────────────────────────┘')

            # Session 3 vs Session 1: strong_improvement (+16.67%)
            result_2_0 = _.compare_two(sessions[2], sessions[0])
            text_2_0   = self.text_export.export_comparison(result_2_0)


            assert text_2_0     == ('┌──────────────────────────────────────────────────────────┐\n'
                                    '│ Comparison: Session 3 vs Session 1                       │\n'
                                    '├──────────────────────────────────────────────────────────┤\n'
                                    '│ Benchmark           │ Session 3 │ Session 1 │ Change     │\n'
                                    '├──────────────────────────────────────────────────────────┤\n'
                                    '│ python__nop         │ 1,200 ns  │ 1,000 ns  │ -16.7% ▼▼▼ │\n'
                                    '│ python__class_empty │ 600 ns    │ 500 ns    │ -16.7% ▼▼▼ │\n'
                                    '│ type_safe__empty    │ 2,400 ns  │ 2,000 ns  │ -16.7% ▼▼▼ │\n'
                                    '└──────────────────────────────────────────────────────────┘')

            # Session 3 vs Session 2: strong_improvement (+25%)
            result_2_1 = _.compare_two(sessions[2], sessions[1])
            text_2_1   = self.text_export.export_comparison(result_2_1)

            assert text_2_1     == ('┌──────────────────────────────────────────────────────────┐\n'
                                    '│ Comparison: Session 3 vs Session 2                       │\n'
                                    '├──────────────────────────────────────────────────────────┤\n'
                                    '│ Benchmark           │ Session 3 │ Session 2 │ Change     │\n'
                                    '├──────────────────────────────────────────────────────────┤\n'
                                    '│ python__nop         │ 1,200 ns  │ 900 ns    │ -25.0% ▼▼▼ │\n'
                                    '│ python__class_empty │ 600 ns    │ 450 ns    │ -25.0% ▼▼▼ │\n'
                                    '│ type_safe__empty    │ 2,400 ns  │ 1,800 ns  │ -25.0% ▼▼▼ │\n'
                                    '└──────────────────────────────────────────────────────────┘')

            # Session 2 vs Session 3: strong_regression (-33.33%)
            result_1_2 = _.compare_two(sessions[1], sessions[2])
            text_1_2   = self.text_export.export_comparison(result_1_2)

            assert text_1_2     == ('┌──────────────────────────────────────────────────────────┐\n'
                                    '│ Comparison: Session 2 vs Session 3                       │\n'
                                    '├──────────────────────────────────────────────────────────┤\n'
                                    '│ Benchmark           │ Session 2 │ Session 3 │ Change     │\n'
                                    '├──────────────────────────────────────────────────────────┤\n'
                                    '│ python__nop         │ 900 ns    │ 1,200 ns  │ +33.3% ▲▲▲ │\n'
                                    '│ python__class_empty │ 450 ns    │ 600 ns    │ +33.3% ▲▲▲ │\n'
                                    '│ type_safe__empty    │ 1,800 ns  │ 2,400 ns  │ +33.3% ▲▲▲ │\n'
                                    '└──────────────────────────────────────────────────────────┘')


    def test_export_text__evolution(self):                                       # Test text evolution
        with Perf_Benchmark__Diff() as _:
            _.load_folder(self.temp_dir)

            result = _.compare_all()
            text   = self.text_export.export_evolution(result)

            assert type(text)   is str
            assert 'Evolution'  in text
            assert '3 sessions' in text

            assert text         == ('┌────────────────────────────────────────────────────────────────────┐\n'
                                    '│ Performance Evolution: 3 sessions                                  │\n'
                                    '├────────────────────────────────────────────────────────────────────┤\n'
                                    '│ Benchmark           │ Session 1 │ Session 2 │ Session 3 │ Trend    │\n'
                                    '├────────────────────────────────────────────────────────────────────┤\n'
                                    '│ python__nop         │ 1,000 ns  │ 900 ns    │ 1,200 ns  │ ▲▲▲ +20% │\n'
                                    '│ python__class_empty │ 500 ns    │ 450 ns    │ 600 ns    │ ▲▲▲ +20% │\n'
                                    '│ type_safe__empty    │ 2,000 ns  │ 1,800 ns  │ 2,400 ns  │ ▲▲▲ +20% │\n'
                                    '└────────────────────────────────────────────────────────────────────┘') != ''


    def test_export_text__statistics(self):                                      # Test text statistics
        with Perf_Benchmark__Diff() as _:
            _.load_folder(self.temp_dir)

            result = _.statistics()
            text   = self.text_export.export_statistics(result)

            assert type(text)          is str
            assert 'Statistics'        in text
            assert result.obj()        == __(status           = 'success'                ,
                                             error            = ''                       ,
                                             session_count    = 3                        ,
                                             benchmark_count  = 3                        ,
                                             improvement_count= 0                        ,
                                             regression_count = 3                        ,
                                             avg_improvement  = 0.0                      ,
                                             avg_regression   = 20.0                     ,
                                             best_improvement = None                     ,
                                             worst_regression = __(benchmark_id   =  __SKIP__ ,
                                                                   name           =  __SKIP__ ,
                                                                   score_a        =  __SKIP__ ,
                                                                   score_b        =  __SKIP__ ,
                                                                   change_percent =  __SKIP__ ,
                                                                   trend          = __SKIP__  ),
                                             timestamp         = __SKIP__          )


    def test_export_text__error_status(self):                                    # Test error output
        with Perf_Benchmark__Diff() as _:
            result = _.compare_two()                                             # No sessions
            text   = self.text_export.export_comparison(result)

            assert 'No sessions' in text


    # ═══════════════════════════════════════════════════════════════════════════════
    # HTML Export Tests
    # ═══════════════════════════════════════════════════════════════════════════════

    def test_export_html__comparison(self):                                      # Test HTML comparison
        with Perf_Benchmark__Diff() as _:
            _.load_folder(self.temp_dir)

            result = _.compare_two()
            html   = self.html_export.export_comparison(result)

            assert type(html)   is str
            assert '<html>'     in html
            assert '<table>'    in html
            assert 'Session 1'  in html


    def test_export_html__evolution(self):                                       # Test HTML evolution
        with Perf_Benchmark__Diff() as _:
            _.load_folder(self.temp_dir)

            result = _.compare_all()
            html   = self.html_export.export_evolution(result)

            assert type(html)          is str
            assert '<html>'            in html
            assert 'chart.js'          in html
            assert 'evolutionChart'    in html
            assert '3 Sessions'        in html

    def test_export_html__statistics(self):                                      # Test HTML statistics
        with Perf_Benchmark__Diff() as _:
            _.load_folder(self.temp_dir)

            result = _.statistics()
            html   = self.html_export.export_statistics(result)

            assert type(html)   is str
            assert '<html>'     in html
            assert 'Statistics' in html

    def test_export_html__error_status(self):                                    # Test error output
        with Perf_Benchmark__Diff() as _:
            result = _.compare_all()                                             # No sessions
            html   = self.html_export.export_evolution(result)

            assert '<html>'      in html
            assert 'No sessions' in html


    # ═══════════════════════════════════════════════════════════════════════════════
    # JSON Export Tests
    # ═══════════════════════════════════════════════════════════════════════════════

    def test_export_json__comparison(self):                                      # Test JSON comparison
        with Perf_Benchmark__Diff() as _:
            _.load_folder(self.temp_dir)

            result = _.compare_two()
            json_str = self.json_export.export_comparison(result)

            assert type(json_str) is str
            assert '"status"'     in json_str
            assert '"comparisons"' in json_str

    def test_export_json__evolution(self):                                       # Test JSON evolution
        with Perf_Benchmark__Diff() as _:
            _.load_folder(self.temp_dir)

            result   = _.compare_all()
            json_str = self.json_export.export_evolution(result)

            assert type(json_str) is str
            assert '"evolutions"' in json_str

    def test_export_json__statistics(self):                                      # Test JSON statistics
        with Perf_Benchmark__Diff() as _:
            _.load_folder(self.temp_dir)

            result   = _.statistics()
            json_str = self.json_export.export_statistics(result)

            assert type(json_str)       is str
            assert '"session_count"'    in json_str
            assert '"benchmark_count"'  in json_str


    # ═══════════════════════════════════════════════════════════════════════════════
    # File Save Tests
    # ═══════════════════════════════════════════════════════════════════════════════

    def test_save_comparison_text(self):                                         # Test save text
        with tempfile.NamedTemporaryFile(suffix='.txt', delete=False) as f:
            filepath = f.name

        with Perf_Benchmark__Diff() as _:
            _.load_folder(self.temp_dir)

            result = _.compare_two()
            text   = self.text_export.export_comparison(result)
            file_create(filepath, text)

            assert file_exists(filepath) is True

    def test_save_evolution_html(self):                                          # Test save HTML
        with tempfile.NamedTemporaryFile(suffix='.html', delete=False) as f:
            filepath = f.name

        with Perf_Benchmark__Diff() as _:
            _.load_folder(self.temp_dir)

            result = _.compare_all()
            html   = self.html_export.export_evolution(result)
            file_create(filepath, html)

            assert file_exists(filepath) is True


    # ═══════════════════════════════════════════════════════════════════════════════
    # Integration Tests
    # ═══════════════════════════════════════════════════════════════════════════════

    def test_integration__full_workflow(self):                                   # Test complete workflow
        diff = Perf_Benchmark__Diff()

        # Load sessions
        diff.load_folder(self.temp_dir)
        assert len(diff.sessions) == 3

        # Compare two - get schema
        comparison = diff.compare_two()
        assert comparison.status == Enum__Comparison__Status.SUCCESS

        # Export to text
        text = self.text_export.export_comparison(comparison)
        assert 'Comparison' in text

        # Compare all - get schema
        evolution = diff.compare_all()
        assert evolution.status == Enum__Comparison__Status.SUCCESS

        # Export to HTML
        html = self.html_export.export_evolution(evolution)
        assert '<html>' in html

        # Statistics - get schema
        stats = diff.statistics()
        assert stats.status == Enum__Comparison__Status.SUCCESS

        # Export to JSON
        json_str = self.json_export.export_statistics(stats)
        assert '"session_count"' in json_str

        # Save files
        with tempfile.TemporaryDirectory() as temp_out:
            file_create(os.path.join(temp_out, 'comparison.txt'), text)
            file_create(os.path.join(temp_out, 'evolution.html'), html)
            file_create(os.path.join(temp_out, 'stats.json'), json_str)

            assert file_exists(os.path.join(temp_out, 'comparison.txt')) is True
            assert file_exists(os.path.join(temp_out, 'evolution.html')) is True
            assert file_exists(os.path.join(temp_out, 'stats.json'))     is True