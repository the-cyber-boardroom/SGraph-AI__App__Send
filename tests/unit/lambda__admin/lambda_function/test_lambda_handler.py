import re
import types
import pytest
from unittest                                                               import TestCase
from osbot_utils.utils.Json                                                 import str_to_json
from sgraph_ai_app_send.lambda__admin.lambda_function.lambda_handler__admin import run
from tests.unit.lambda__admin.Fast_API__Test_Objs__SGraph__App__Send__Admin import setup__html_graph_service__fast_api_test_objs


class test_lambda_handler(TestCase):

    @classmethod
    def setUpClass(cls):
        setup__html_graph_service__fast_api_test_objs()     # this will setup the env vars
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
                                           'path'     : '/',
                                           'sourceIp' : '127.0.0.1'}}}

        response = self.handler(event=event)
        assert type(response) is dict
        assert response.get('statusCode') == 401

        assert str_to_json(response.get('body')).get('message') == 'Client API key is missing, you need to set it on a header or cookie'
