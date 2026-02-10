import os

if os.getenv('AWS_REGION'):  # only execute if we are not running inside an AWS Lambda function

    from osbot_aws.aws.lambda_.boto3__lambda            import load_dependencies       # using the lightweight file (which only has the boto3 calls required to load_dependencies)
    from sgraph_ai_app_send.lambda__admin.admin__config import APP__SEND__ADMIN__LAMBDA_DEPENDENCIES

    load_dependencies(APP__SEND__ADMIN__LAMBDA_DEPENDENCIES)

    def clear_osbot_modules():                            # todo: add this to load_dependencies method, since after it runs we don't need the osbot_aws.aws.lambda_.boto3__lambda
        import sys
        for module in list(sys.modules):
            if module.startswith('osbot_aws'):
                del sys.modules[module]

    clear_osbot_modules()

error   = None          # pin these variables
handler = None
app     = None

try:

    from sgraph_ai_app_send.lambda__admin.fast_api.Fast_API__SGraph__App__Send__Admin import Fast_API__SGraph__App__Send__Admin

    with Fast_API__SGraph__App__Send__Admin() as _:
        _.setup()
        handler = _.handler()
        app     = _.app()
except Exception as exc:
    if os.getenv("AWS_LAMBDA_FUNCTION_NAME") is None:       # raise exception when not running inside a lambda function
        raise
    error = (f"CRITICAL ERROR: Failed to start service with:\n\n"
             f"{type(exc).__name__}: {exc}")

def run(event, context=None):
    if error:
        return error
    return handler(event, context)