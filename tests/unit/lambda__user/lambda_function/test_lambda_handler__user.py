import re
import types
import pytest
from unittest                                                              import TestCase
from sgraph_ai_app_send.lambda__user.lambda_function.lambda_handler__user  import run
from tests.unit.lambda__user.Fast_API__Test_Objs__SGraph__App__Send__User  import setup__fast_api__user__test_objs


class test_lambda_handler(TestCase):

    @classmethod
    def setUpClass(cls):
        setup__fast_api__user__test_objs()     # this will setup the fast api app
        cls.handler = staticmethod(run)

    def test__setUpClass(self):
        assert type(self.handler) is types.FunctionType

    def test_run(self):
        expected_error = ("The adapter was unable to infer a handler to use for the event. "
                          "This is likely related to how the Lambda function was invoked. "
                          "(Are you testing locally? Make sure the request payload is valid for a supported handler.)")
        with pytest.raises(RuntimeError, match=re.escape(expected_error)):
            self.handler(event={}, context=None)

        event = {'version'       : '2.0',
                 'requestContext': {'http': {'method'  : 'GET',
                                           'path'     : '/info/health',
                                           'sourceIp' : '127.0.0.1'}}}

        response = self.handler(event=event)
        assert type(response) is dict
        assert response.get('statusCode') == 200
