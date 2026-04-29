import pytest
# from osbot_aws.AWS_Config                                                   import AWS_Config
# from osbot_aws.apis.test_helpers.Temp_Aws_Roles                             import Temp_Aws_Roles
from osbot_utils.utils.Misc                                                  import list_set
from osbot_fast_api_serverless.deploy.Deploy__Serverless__Fast_API           import DEFAULT__ERROR_MESSAGE__WHEN_FAST_API_IS_OK
from sgraph_ai_app_send.lambda__user.user__config                            import APP__SEND__USER__LAMBDA_DEPENDENCIES
from sgraph_ai_app_send.lambda__user.lambda_function.deploy.Deploy__Service  import Deploy__Service


class test_Deploy__User__Service__base():     # Base class for deployment tests - override stage in subclasses

    stage: str = None  # Must be set by subclass

    @classmethod
    def setUpClass(cls):
        if cls.stage is None:
            pytest.skip("Can't run when 'stage' class variable is not set")

        cls.deploy_fast_api = Deploy__Service(stage=cls.stage)

        with cls.deploy_fast_api as _:
            if _.aws_config.aws_configured() is False:
                pytest.skip("this test needs valid AWS credentials")

    def test_1__check_stages(self):
        assert self.deploy_fast_api.stage == self.stage

    def test_2__upload_dependencies(self):                                       # Legacy: individual per-package zips (kept until combined zip is validated)
        upload_results = self.deploy_fast_api.upload_lambda_dependencies_to_s3()
        assert list_set(upload_results) == APP__SEND__USER__LAMBDA_DEPENDENCIES

    def test_2b__upload_combined_dependencies(self):                             # Phase 1: single combined zip replaces 6 individual downloads
        result = self.deploy_fast_api.upload_combined_dependencies_to_s3()
        assert result['status']  in ('uploaded', 'skipped')
        assert 'combined_name'    in result
        assert 'sgraph-send-user' in result['combined_name']
        assert result['s3_key'].startswith('lambdas-dependencies-combined/')

    # def test_3__create_lambda_iam_user(self):
    #     aws_config      = AWS_Config()
    #     account_id      = aws_config.account_id()
    #     lambda_role_arn = f'arn:aws:iam::{account_id}:role/temp_role_for_lambda_invocation'
    #     assert Temp_Aws_Roles().for_lambda_invocation__create()  == lambda_role_arn

    def test_4_create__lambda_function(self):
        assert self.deploy_fast_api.create() is True

    def test_5__update_lambda_runtime__to_3_13(self):                                       # todo: add support to OSBot_AWS lambda deploy methods for configuring the version of the python runtime
        self.deploy_fast_api.lambda_function().configuration_update(Runtime='python3.13')
        self.deploy_fast_api.lambda_function().wait_for_function_update_to_complete()

    def test_5b__enable_snapstart(self):                                          # Publish version + create 'snapstart' alias + alias Function URL
        result = self.deploy_fast_api.enable_snapstart()
        assert result['version']   != '$LATEST'
        assert result['alias']     == 'snapstart'
        assert result['alias_url'].startswith('https://')

    def test_6__invoke(self):
        assert self.deploy_fast_api.invoke().get('errorMessage') == DEFAULT__ERROR_MESSAGE__WHEN_FAST_API_IS_OK

    def test_7__invoke__function_url(self):
        assert self.deploy_fast_api.invoke__function_url('/info/health') == {'status': 'ok'}

    def test_7b__invoke__snapstart_url(self):                                     # Validate SnapStart alias Function URL responds correctly
        assert self.deploy_fast_api.invoke__snapstart_url('/info/health') == {'status': 'ok'}

    # def test_8__delete(self):
    #     assert self.deploy_fast_api.delete() is True









