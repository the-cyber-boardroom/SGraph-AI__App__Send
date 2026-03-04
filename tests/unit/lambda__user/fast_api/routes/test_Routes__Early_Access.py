# ===============================================================================
# SGraph Send - Routes__Early_Access Tests
# Early Access signup endpoint — validation, locale detection, webhook call
# ===============================================================================

from unittest                                                                       import TestCase
from unittest.mock                                                                  import patch
from tests.unit.lambda__user.Fast_API__Test_Objs__SGraph__App__Send__User           import setup__fast_api__user__test_objs


class test_Routes__Early_Access(TestCase):

    @classmethod
    def setUpClass(cls):
        with setup__fast_api__user__test_objs() as _:
            cls.client = _.fast_api__client

    # --- Validation ---

    def test__signup__success(self):
        response = self.client.post('/api/early-access/signup',
                                    json=dict(name  = 'Alice Test',
                                              email = 'alice@example.com'))
        assert response.status_code == 200
        data = response.json()
        assert data['success']       is True
        assert data['email']         == 'alice@example.com'
        assert 'timestamp'           in data

    def test__signup__missing_name(self):
        response = self.client.post('/api/early-access/signup',
                                    json=dict(name  = '',
                                              email = 'alice@example.com'))
        assert response.status_code == 422

    def test__signup__missing_email(self):
        response = self.client.post('/api/early-access/signup',
                                    json=dict(name  = 'Alice',
                                              email = ''))
        assert response.status_code == 422

    def test__signup__invalid_email(self):
        response = self.client.post('/api/early-access/signup',
                                    json=dict(name  = 'Alice',
                                              email = 'not-an-email'))
        assert response.status_code == 422

    def test__signup__whitespace_name(self):
        response = self.client.post('/api/early-access/signup',
                                    json=dict(name  = '   ',
                                              email = 'alice@example.com'))
        assert response.status_code == 422

    def test__signup__email_trimmed(self):
        response = self.client.post('/api/early-access/signup',
                                    json=dict(name  = 'Alice',
                                              email = ' alice@example.com '))
        assert response.status_code == 200
        assert response.json()['email'] == 'alice@example.com'

    # --- Locale detection ---

    def test__signup__locale_from_referer(self):
        response = self.client.post('/api/early-access/signup',
                                    json=dict(name  = 'Bob',
                                              email = 'bob@example.com'),
                                    headers={'referer': 'https://send.sgraph.ai/send/v0/v0.2/v0.2.0/pt-br/index.html'})
        assert response.status_code == 200

    def test__signup__locale_from_accept_language(self):
        response = self.client.post('/api/early-access/signup',
                                    json=dict(name  = 'Carlos',
                                              email = 'carlos@example.com'),
                                    headers={'accept-language': 'de-DE,de;q=0.9,en;q=0.8'})
        assert response.status_code == 200


class test_Service__Early_Access(TestCase):

    def test__validate_signup__valid(self):
        from sgraph_ai_app_send.lambda__user.service.Service__Early_Access import Service__Early_Access
        service = Service__Early_Access()
        result  = service.validate_signup('Alice', 'alice@example.com')
        assert result['valid']  is True
        assert result['errors'] == []

    def test__validate_signup__empty_name(self):
        from sgraph_ai_app_send.lambda__user.service.Service__Early_Access import Service__Early_Access
        service = Service__Early_Access()
        result  = service.validate_signup('', 'alice@example.com')
        assert result['valid']  is False
        assert 'Name is required' in result['errors']

    def test__validate_signup__invalid_email(self):
        from sgraph_ai_app_send.lambda__user.service.Service__Early_Access import Service__Early_Access
        service = Service__Early_Access()
        result  = service.validate_signup('Alice', 'bad-email')
        assert result['valid']  is False
        assert 'A valid email address is required' in result['errors']

    def test__validate_signup__both_invalid(self):
        from sgraph_ai_app_send.lambda__user.service.Service__Early_Access import Service__Early_Access
        service = Service__Early_Access()
        result  = service.validate_signup('', '')
        assert result['valid']  is False
        assert len(result['errors']) == 2

    def test__build_email_body(self):
        from sgraph_ai_app_send.lambda__user.service.Service__Early_Access import Service__Early_Access
        service    = Service__Early_Access()
        email_data = service.build_email_body('Alice Test', 'alice@example.com', 'en-gb')
        assert email_data['subject'] == '[SG/Send] New Early Access Signup: Alice Test'
        assert 'alice@example.com'   in email_data['body']
        assert 'en-gb'               in email_data['body']
        assert 'timestamp'           in email_data

    def test__send_notification__no_webhook_configured(self):
        from sgraph_ai_app_send.lambda__user.service.Service__Early_Access import Service__Early_Access
        service = Service__Early_Access()                                          # No webhook URL
        result  = service.send_notification('Alice', 'alice@example.com')
        assert 'notifications' in result
        assert 'timestamp'     in result
        for notification in result['notifications']:
            assert notification['success'] is False                                # Fails gracefully — no webhook URL

    def test__is_valid_email(self):
        from sgraph_ai_app_send.lambda__user.service.Service__Early_Access import Service__Early_Access
        service = Service__Early_Access()
        assert service._is_valid_email('user@example.com')      is True
        assert service._is_valid_email('user@sub.example.co')   is True
        assert service._is_valid_email('a+b@example.com')       is True
        assert service._is_valid_email('not-an-email')           is False
        assert service._is_valid_email('@example.com')           is False
        assert service._is_valid_email('user@')                  is False
        assert service._is_valid_email('')                       is False
