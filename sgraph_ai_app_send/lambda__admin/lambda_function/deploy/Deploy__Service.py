import sgraph_ai_app_send__ui__admin
from osbot_fast_api_serverless.deploy.Deploy__Serverless__Fast_API          import Deploy__Serverless__Fast_API
from osbot_utils.utils.Env                                                  import get_env
from sgraph_ai_app_send.lambda__admin.admin__config                         import APP__SEND__ADMIN__LAMBDA_DEPENDENCIES, APP__SEND__ADMIN__SERVICE_NAME
from sgraph_ai_app_send.lambda__admin.lambda_function.lambda_handler__admin import run


class Deploy__Service(Deploy__Serverless__Fast_API):

    def deploy_lambda(self):
        with super().deploy_lambda() as _:
            _.add_folder(sgraph_ai_app_send__ui__admin.path)
            _.set_env_variable('CACHE__SERVICE__BUCKET_NAME', get_env('CACHE__SERVICE__BUCKET_NAME'))
            return _

    def handler(self):
        return run

    def lambda_dependencies(self):
        return APP__SEND__ADMIN__LAMBDA_DEPENDENCIES

    def lambda_name(self):
        return APP__SEND__ADMIN__SERVICE_NAME