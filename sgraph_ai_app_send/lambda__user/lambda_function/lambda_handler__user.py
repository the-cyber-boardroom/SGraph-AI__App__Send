import os
import time

_t_init = time.time()                                                            # Cold-start profiling — module load time

if os.getenv('AWS_REGION'):                                                      # Only runs inside Lambda (AWS_REGION is set by the runtime)

    from sgraph_ai_app_send._for_osbot_aws.Lambda__Dependencies__Loader  import load_combined_dependency
    from sgraph_ai_app_send.lambda__user.user__config                     import APP__SEND__USER__LAMBDA_DEPENDENCIES

    _t_deps = time.time()
    load_combined_dependency('sgraph-send-user', APP__SEND__USER__LAMBDA_DEPENDENCIES)
    print(f'[init] load_combined_dependency — {(time.time()-_t_deps)*1000:.0f}ms')

error   = None          # pin these variables
handler = None
app     = None

try:
    _t_import = time.time()
    from sgraph_ai_app_send.lambda__user.fast_api.Fast_API__SGraph__App__Send__User import Fast_API__SGraph__App__Send__User
    print(f'[init] Fast_API import — {(time.time()-_t_import)*1000:.0f}ms')

    _t_setup = time.time()
    with Fast_API__SGraph__App__Send__User() as _:
        _.setup()
        handler = _.handler()
        app     = _.app()
    print(f'[init] Fast_API setup — {(time.time()-_t_setup)*1000:.0f}ms')
    print(f'[init] total init — {(time.time()-_t_init)*1000:.0f}ms')

except Exception as exc:
    if os.getenv("AWS_LAMBDA_FUNCTION_NAME") is None:       # raise exception when not running inside a lambda function
        raise
    error = (f"CRITICAL ERROR: Failed to start service with:\n\n"
             f"{type(exc).__name__}: {exc}")

def run(event, context=None):
    if error:
        return error
    return handler(event, context)
