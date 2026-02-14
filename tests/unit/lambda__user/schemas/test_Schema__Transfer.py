# ===============================================================================
# SGraph Send - Schema__Transfer Tests
# Verify all transfer schemas instantiate correctly with Type_Safe
# ===============================================================================

from unittest                                                                    import TestCase
from osbot_utils.type_safe.Type_Safe                                             import Type_Safe
from sgraph_ai_app_send.lambda__user.schemas.Schema__Transfer                    import Schema__Transfer__Create
from sgraph_ai_app_send.lambda__user.schemas.Schema__Transfer                    import Schema__Transfer__Initiated
from sgraph_ai_app_send.lambda__user.schemas.Schema__Transfer                    import Schema__Transfer__Complete_Response
from sgraph_ai_app_send.lambda__user.schemas.Schema__Transfer                    import Schema__Transfer__Info
from sgraph_ai_app_send.lambda__user.schemas.Schema__Transfer                    import Schema__Transfer__Download_Response


class test_Schema__Transfer(TestCase):

    def test__create__defaults(self):
        schema = Schema__Transfer__Create()
        assert type(schema)              is Schema__Transfer__Create
        assert isinstance(schema, Type_Safe)
        assert schema.file_size_bytes    == 0
        assert schema.content_type_hint  == ''

    def test__create__with_values(self):
        schema = Schema__Transfer__Create(file_size_bytes   = 1024,
                                          content_type_hint = 'application/pdf')
        assert schema.file_size_bytes    == 1024
        assert schema.content_type_hint  == 'application/pdf'

    def test__initiated__defaults(self):
        schema = Schema__Transfer__Initiated()
        assert type(schema)              is Schema__Transfer__Initiated
        assert schema.transfer_id        == ''
        assert schema.upload_url         == ''

    def test__complete_response__defaults(self):
        schema = Schema__Transfer__Complete_Response()
        assert type(schema)              is Schema__Transfer__Complete_Response
        assert schema.transfer_id        == ''
        assert schema.download_url       == ''
        assert type(schema.transparency) is dict

    def test__info__defaults(self):
        schema = Schema__Transfer__Info()
        assert type(schema)              is Schema__Transfer__Info
        assert schema.transfer_id        == ''
        assert schema.status             == ''
        assert schema.file_size_bytes    == 0
        assert schema.created_at         == ''
        assert schema.download_count     == 0

    def test__download_response__defaults(self):
        schema = Schema__Transfer__Download_Response()
        assert type(schema)              is Schema__Transfer__Download_Response
        assert schema.transfer_id        == ''
        assert schema.file_size_bytes    == 0
        assert type(schema.transparency) is dict
