from sgraph_ai_app_send import package_name

APP__SEND__ADMIN__SERVICE_NAME              = package_name
APP__SEND__ADMIN__FAST_API__TITLE           = "SGraph Send - Admin"
APP__SEND__ADMIN__FAST_API__DESCRIPTION     = "SGraph Send - Admin"
APP__SEND__ADMIN__LAMBDA_DEPENDENCIES       = ['httpx==0.28.1'                          ,
                                               'memory-fs==v0.40.0'                     ,
                                               'osbot-fast-api-serverless==v1.33.0'     ]


APP_SEND__UI__ADMIN__ROUTE__PATH__CONSOLE    = 'admin'
APP_SEND__UI__ADMIN__START_PAGE              = 'index'
APP_SEND__UI__ADMIN__MAJOR__VERSION          = "v0/v0.1"
APP_SEND__UI__ADMIN__LATEST__VERSION         = "v0.1.0"
