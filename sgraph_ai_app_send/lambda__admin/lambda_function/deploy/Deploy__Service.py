import sgraph_ai_app_send__ui__admin
from osbot_fast_api_serverless.deploy.Deploy__Serverless__Fast_API          import Deploy__Serverless__Fast_API
from osbot_utils.utils.Env                                                  import get_env
from sgraph_ai_app_send.lambda__admin.admin__config                         import APP__SEND__ADMIN__LAMBDA_DEPENDENCIES, APP__SEND__ADMIN__SERVICE_NAME
from sgraph_ai_app_send.lambda__admin.admin__config                         import ENV_VAR__SGRAPH_SEND__CLOUDFRONT_DISTRIBUTION_ID
from sgraph_ai_app_send.lambda__admin.admin__config                         import ENV_VAR__SGRAPH_SEND__LAMBDA_USER_NAME
from sgraph_ai_app_send.lambda__admin.admin__config                         import ENV_VAR__SGRAPH_SEND__LAMBDA_ADMIN_NAME
from sgraph_ai_app_send.lambda__admin.admin__config                         import ENV_VAR__SGRAPH_SEND__S3_TRANSFERS_BUCKET
from sgraph_ai_app_send.lambda__admin.admin__config                         import ENV_VAR__SGRAPH_SEND__S3_CACHE_BUCKET
from sgraph_ai_app_send.lambda__admin.admin__config                         import ENV_VAR__SGRAPH_SEND__S3_FILTER_ID
from sgraph_ai_app_send.lambda__admin.admin__config                         import ENV_VAR__SGRAPH_SEND__AWS_REGION
from sgraph_ai_app_send.lambda__admin.lambda_function.lambda_handler__admin import run


class Deploy__Service(Deploy__Serverless__Fast_API):

    def deploy_lambda(self):
        with super().deploy_lambda() as _:
            _.add_folder(sgraph_ai_app_send__ui__admin.path)
            _.set_env_variable('CACHE__SERVICE__BUCKET_NAME'                 , get_env('CACHE__SERVICE__BUCKET_NAME'                 ))
            _.set_env_variable(ENV_VAR__SGRAPH_SEND__CLOUDFRONT_DISTRIBUTION_ID, get_env(ENV_VAR__SGRAPH_SEND__CLOUDFRONT_DISTRIBUTION_ID))
            _.set_env_variable(ENV_VAR__SGRAPH_SEND__LAMBDA_USER_NAME          , get_env(ENV_VAR__SGRAPH_SEND__LAMBDA_USER_NAME          ))
            _.set_env_variable(ENV_VAR__SGRAPH_SEND__LAMBDA_ADMIN_NAME         , get_env(ENV_VAR__SGRAPH_SEND__LAMBDA_ADMIN_NAME         ))
            _.set_env_variable(ENV_VAR__SGRAPH_SEND__S3_TRANSFERS_BUCKET       , get_env(ENV_VAR__SGRAPH_SEND__S3_TRANSFERS_BUCKET       ))
            _.set_env_variable(ENV_VAR__SGRAPH_SEND__S3_CACHE_BUCKET           , get_env(ENV_VAR__SGRAPH_SEND__S3_CACHE_BUCKET           ))
            _.set_env_variable(ENV_VAR__SGRAPH_SEND__S3_FILTER_ID              , get_env(ENV_VAR__SGRAPH_SEND__S3_FILTER_ID              ))
            _.set_env_variable(ENV_VAR__SGRAPH_SEND__AWS_REGION                , get_env(ENV_VAR__SGRAPH_SEND__AWS_REGION                ))
            return _

    def handler(self):
        return run

    def lambda_dependencies(self):
        return APP__SEND__ADMIN__LAMBDA_DEPENDENCIES

    def lambda_name(self):
        return APP__SEND__ADMIN__SERVICE_NAME