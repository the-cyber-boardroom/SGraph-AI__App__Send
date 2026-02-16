from sgraph_ai_app_send import package_name

APP__SEND__USER__SERVICE_NAME              = package_name
APP__SEND__USER__FAST_API__TITLE           = "SGraph Send"
APP__SEND__USER__FAST_API__DESCRIPTION     = "SGraph Send — Zero-Knowledge Encrypted File Sharing"
APP__SEND__USER__LAMBDA_DEPENDENCIES       = ['httpx==0.28.1'                          ,
                                              'memory-fs==v0.40.0'                     ,
                                              'mgraph-ai-service-cache-client==v0.33.0',
                                              'mgraph-ai-service-cache==v0.14.0'       ,
                                              'osbot-fast-api-serverless==v1.33.0'     ]


APP_SEND__UI__USER__ROUTE__PATH__CONSOLE    = 'send'
APP_SEND__UI__USER__START_PAGE              = 'index'
APP_SEND__UI__USER__MAJOR__VERSION          = "v0/v0.1"
APP_SEND__UI__USER__LATEST__VERSION         = "v0.1.6"

ENV_VAR__SGRAPH_SEND__ACCESS_TOKEN          = 'SGRAPH_SEND__ACCESS_TOKEN'
HEADER__SGRAPH_SEND__ACCESS_TOKEN           = 'x-sgraph-access-token'

ENV_VAR__SGRAPH_SEND__ADMIN__BASE_URL       = 'SGRAPH_SEND__ADMIN__BASE_URL'
ENV_VAR__SGRAPH_SEND__ADMIN__API_KEY__NAME  = 'SGRAPH_SEND__ADMIN__API_KEY__NAME'
ENV_VAR__SGRAPH_SEND__ADMIN__API_KEY__VALUE = 'SGRAPH_SEND__ADMIN__API_KEY__VALUE'
