from unittest                                                               import TestCase
from osbot_utils.utils.Env                                                  import load_dotenv
from osbot_utils.utils.Files                                                import path_combine, file_exists
from tests.deploy.User__Lambda.deploy_aws.test_Deploy__User__Service__base  import test_Deploy__User__Service__base


class test_Deploy__User__Service__to__dev(test_Deploy__User__Service__base, TestCase):
    stage = 'user-dev'

    # @classmethod
    # def setUpClass(cls):
    #     dot_env_file = path_combine(__file__, "../.deploy.env")
    #     assert file_exists(dot_env_file)
    #     load_dotenv(dotenv_path=dot_env_file, override=True)
    #     super().setUpClass()

    # def test_2__upload_dependencies(self):
    #     super().test_2__upload_dependencies()
    # todo:
    # add these changes to osbot-aws
    # if self.target_aws_lambda:
    # args.extend([
    #     '--platform',       'manylinux2014_x86_64',
    #     '--only-binary=:all:',
    #     '--python-version', '3.13',
    #     '--implementation', 'cp',
    #     '--abi',            'cp313',        # must match python-version
    # ])

    # def test_4_create__lambda_function(self):
    #     super().test_4_create__lambda_function()

    # def test_6__invoke(self):
    #     super().test_6__invoke()
    #     from osbot_utils.utils.Dev import pprint
    #     #self.deploy_fast_api.create()
    #     result = self.deploy_fast_api.invoke()
    #     pprint(result)

