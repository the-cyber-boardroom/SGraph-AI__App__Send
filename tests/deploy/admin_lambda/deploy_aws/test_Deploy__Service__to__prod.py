from unittest                                    import TestCase
from tests.deploy_aws.test_Deploy__Service__base import test_Deploy__Service__base

class test_Deploy__Service__to__prod(test_Deploy__Service__base, TestCase):
    stage = 'prod'