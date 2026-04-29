import os

if os.getenv('AWS_REGION'):                                                      # Only runs inside Lambda (AWS_REGION is set by the runtime)

    from sgraph_ai_app_send._for_osbot_aws.Lambda__Dependencies__Loader  import load_combined_dependency
    from sgraph_ai_app_send.lambda__user.user__config                     import APP__SEND__USER__LAMBDA_DEPENDENCIES

    load_combined_dependency('sgraph-send-user', APP__SEND__USER__LAMBDA_DEPENDENCIES)
                                                                                 # Replaces load_dependencies() from osbot_aws:
                                                                                 #   - Was: 1 STS call + 1 S3 download per package (6× each)
                                                                                 #   - Now: 1 STS call + 1 S3 download total

error   = None          # pin these variables
handler = None
app     = None

try:

    from sgraph_ai_app_send.lambda__user.fast_api.Fast_API__SGraph__App__Send__User import Fast_API__SGraph__App__Send__User

    with Fast_API__SGraph__App__Send__User() as _:
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
