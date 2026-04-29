from mgraph_ai_service_cache_client.schemas.consts.const__Fast_API import ENV_VAR__CACHE__SERVICE__BUCKET_NAME

import sgraph_ai_app_send__ui__user
from osbot_fast_api_serverless.deploy.Deploy__Serverless__Fast_API          import Deploy__Serverless__Fast_API
from osbot_utils.utils.Env                                                  import get_env
from sgraph_ai_app_send._for_osbot_aws.Lambda__Dependencies__Builder        import Lambda__Dependencies__Builder
from sgraph_ai_app_send.lambda__user.user__config                           import APP__SEND__USER__LAMBDA_DEPENDENCIES, APP__SEND__USER__SERVICE_NAME
from sgraph_ai_app_send.lambda__user.user__config                           import ENV_VAR__SGRAPH_SEND__ADMIN__BASE_URL
from sgraph_ai_app_send.lambda__user.user__config                           import ENV_VAR__SGRAPH_SEND__ADMIN__API_KEY__NAME
from sgraph_ai_app_send.lambda__user.user__config                           import ENV_VAR__SGRAPH_SEND__ADMIN__API_KEY__VALUE
from sgraph_ai_app_send.lambda__user.lambda_function.lambda_handler__user   import run
from sgraph_ai_app_send.lambda__user.storage.Send__Config                   import ENV_VAR__SEND__STORAGE_MODE


class Deploy__Service(Deploy__Serverless__Fast_API):

    def deploy_lambda(self):
        with super().deploy_lambda() as _:
            _.add_folder(sgraph_ai_app_send__ui__user.path)
            _.set_env_variable(ENV_VAR__SGRAPH_SEND__ADMIN__BASE_URL      , get_env(ENV_VAR__SGRAPH_SEND__ADMIN__BASE_URL      ))
            _.set_env_variable(ENV_VAR__SGRAPH_SEND__ADMIN__API_KEY__NAME , get_env(ENV_VAR__SGRAPH_SEND__ADMIN__API_KEY__NAME  ))
            _.set_env_variable(ENV_VAR__SGRAPH_SEND__ADMIN__API_KEY__VALUE, get_env(ENV_VAR__SGRAPH_SEND__ADMIN__API_KEY__VALUE ))
            _.set_env_variable(ENV_VAR__CACHE__SERVICE__BUCKET_NAME       , get_env(ENV_VAR__CACHE__SERVICE__BUCKET_NAME        ))
            _.set_env_variable(ENV_VAR__SEND__STORAGE_MODE                , 's3'                                                )  # Explicit S3 mode — bypasses aws_configured() check which fails during SnapStart snapshot creation
            return _

    def handler(self):
        return run

    def lambda_dependencies(self):                                               # Kept for base class compatibility — combined zip supersedes individual uploads
        return APP__SEND__USER__LAMBDA_DEPENDENCIES

    def lambda_name(self):
        return APP__SEND__USER__SERVICE_NAME

    def upload_combined_dependencies_to_s3(self, force=False):                   # Phase 1: single combined zip — replaces per-package upload_lambda_dependencies_to_s3()
        builder = Lambda__Dependencies__Builder('sgraph-send-user'               ,
                                                APP__SEND__USER__LAMBDA_DEPENDENCIES)
        return builder.upload(force=force)

    SNAPSTART_ALIAS = 'snapstart'

    def enable_snapstart(self):                                                   # Enable SnapStart: configure → wait → publish version → alias → alias Function URL
        lf = self.lambda_function()

        lf.configuration_update(SnapStart={'ApplyOn': 'PublishedVersions'})      # 1. Enable SnapStart on the function
        lf.wait_for_function_update_to_complete()

        result   = lf.client().publish_version(FunctionName=lf.name)             # 2. Publish a version (creates the snapshot)
        version  = result['Version']

        fn_name  = lf.name
        alias    = self.SNAPSTART_ALIAS
        existing = lf.aliases(fn_name)
        alias_names = [a['Name'] for a in (existing or [])]

        if alias in alias_names:                                                  # 3. Create or update alias pointing to the published version
            lf.client().update_alias(FunctionName=fn_name, Name=alias, FunctionVersion=version)
        else:
            lf.alias_create(fn_name, version, alias, 'SnapStart alias — points to latest published version')

        if not lf.function_url_exists(alias):                                    # 4. Create Function URL for alias (once only)
            lf.client().create_function_url_config(
                FunctionName    = fn_name            ,
                Qualifier       = alias              ,
                AuthType        = 'NONE'             ,
                InvokeMode      = 'BUFFERED'         ,
            )

        self._ensure_alias_url_permissions(lf, fn_name, alias)                  # 5. Always ensure both permissions exist (idempotent)

        alias_url = lf.function_url(alias)
        return dict(version    = version  ,
                    alias      = alias    ,
                    alias_url  = alias_url)

    def _ensure_alias_url_permissions(self, lf, fn_name, alias):                  # Both permissions required for public Function URL access
        permissions = [
            (f'public-access-{alias}', 'lambda:InvokeFunctionUrl', {'FunctionUrlAuthType': 'NONE'}),
            (f'public-invoke-{alias}',  'lambda:InvokeFunction',   {}                             ),
        ]
        for stmt_id, action, extra in permissions:
            try:
                lf.client().add_permission(FunctionName = fn_name  ,
                                           Qualifier    = alias     ,
                                           StatementId  = stmt_id  ,
                                           Action       = action    ,
                                           Principal    = '*'       ,
                                           **extra)
            except Exception:
                pass                                                              # Statement already exists — idempotent

    def invoke__snapstart_url(self, path='', retries=5, retry_delay=5):            # Invoke via SnapStart alias URL — retries because snapshot init takes a few seconds after publish
        import time
        from osbot_utils.utils.Http import GET_json
        url     = self.lambda_function().function_url(self.SNAPSTART_ALIAS) + path
        headers = {self.api_key__name(): self.api_key__value()}
        last_exc = None
        for attempt in range(retries):
            try:
                return GET_json(url, headers=headers)
            except Exception as exc:
                last_exc = exc
                if attempt < retries - 1:
                    time.sleep(retry_delay)
        raise last_exc
