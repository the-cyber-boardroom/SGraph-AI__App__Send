import os
from sgraph_ai_app_send import package_name

APP__SEND__ADMIN__SERVICE_NAME              = package_name
APP__SEND__ADMIN__FAST_API__TITLE           = "SGraph Send - Admin"
APP__SEND__ADMIN__FAST_API__DESCRIPTION     = "SGraph Send - Admin"
APP__SEND__ADMIN__LAMBDA_DEPENDENCIES       = ['httpx==0.28.1'                           ,
                                               'memory-fs==v0.40.0'                      ,
                                               'mgraph-ai-service-cache-client==v0.33.0' ,
                                               'mgraph-ai-service-cache==v0.14.0'        ,
                                               'osbot-fast-api-serverless==v1.33.0'      ]


APP_SEND__UI__ADMIN__ROUTE__PATH__CONSOLE    = 'admin'
APP_SEND__UI__ADMIN__START_PAGE              = 'index'
APP_SEND__UI__ADMIN__MAJOR__VERSION          = "v0/v0.1"
APP_SEND__UI__ADMIN__LATEST__VERSION         = "v0.1.5"

# ═══════════════════════════════════════════════════════════════════════════════
# Observability Pipeline — Environment Variables
# Set these on the admin Lambda to enable the /metrics/* endpoints
# ═══════════════════════════════════════════════════════════════════════════════

ENV_VAR__SGRAPH_SEND__CLOUDFRONT_DISTRIBUTION_ID = 'SGRAPH_SEND__CLOUDFRONT_DISTRIBUTION_ID'
ENV_VAR__SGRAPH_SEND__LAMBDA_USER_NAME           = 'SGRAPH_SEND__LAMBDA_USER_NAME'
ENV_VAR__SGRAPH_SEND__LAMBDA_ADMIN_NAME          = 'SGRAPH_SEND__LAMBDA_ADMIN_NAME'
ENV_VAR__SGRAPH_SEND__S3_TRANSFERS_BUCKET        = 'SGRAPH_SEND__S3_TRANSFERS_BUCKET'
ENV_VAR__SGRAPH_SEND__S3_CACHE_BUCKET            = 'SGRAPH_SEND__S3_CACHE_BUCKET'
ENV_VAR__SGRAPH_SEND__S3_FILTER_ID               = 'SGRAPH_SEND__S3_FILTER_ID'
ENV_VAR__SGRAPH_SEND__AWS_REGION                 = 'SGRAPH_SEND__AWS_REGION'

METRICS__CLOUDFRONT_DISTRIBUTION_ID  = os.getenv(ENV_VAR__SGRAPH_SEND__CLOUDFRONT_DISTRIBUTION_ID , '')
METRICS__LAMBDA_USER_NAME            = os.getenv(ENV_VAR__SGRAPH_SEND__LAMBDA_USER_NAME           , '')
METRICS__LAMBDA_ADMIN_NAME           = os.getenv(ENV_VAR__SGRAPH_SEND__LAMBDA_ADMIN_NAME          , '')
METRICS__S3_TRANSFERS_BUCKET         = os.getenv(ENV_VAR__SGRAPH_SEND__S3_TRANSFERS_BUCKET        , '')
METRICS__S3_CACHE_BUCKET             = os.getenv(ENV_VAR__SGRAPH_SEND__S3_CACHE_BUCKET            , '')
METRICS__S3_FILTER_ID                = os.getenv(ENV_VAR__SGRAPH_SEND__S3_FILTER_ID               , 'all-requests')
METRICS__AWS_REGION                  = os.getenv(ENV_VAR__SGRAPH_SEND__AWS_REGION                 , 'eu-west-2')
METRICS__ENABLED                     = bool(METRICS__CLOUDFRONT_DISTRIBUTION_ID and
                                            METRICS__LAMBDA_USER_NAME           and
                                            METRICS__LAMBDA_ADMIN_NAME          and
                                            METRICS__S3_TRANSFERS_BUCKET        and
                                            METRICS__S3_CACHE_BUCKET            )
METRICS__USE_STUB                    = os.getenv('SGRAPH_SEND__METRICS_USE_STUB', '').lower() in ('1', 'true', 'yes')
