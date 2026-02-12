from unittest                                                               import TestCase
from tests.deploy.admin_lambda.deploy_aws.test_Deploy__Admin__Service__base import test_Deploy__Admin__Service__base

class test_Deploy__Admin__Service__to__qa(test_Deploy__Admin__Service__base, TestCase):
    stage = 'admin-qa'
