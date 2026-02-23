# ===============================================================================
# Tests for Service__Keys
# Key registry lifecycle: publish, lookup, unpublish, list, log
# ===============================================================================

from unittest                                                                   import TestCase
from sgraph_ai_app_send.lambda__admin.service.Send__Cache__Setup               import create_send_cache_client
from sgraph_ai_app_send.lambda__admin.service.Service__Keys                    import Service__Keys

TEST_PEM = """-----BEGIN PUBLIC KEY-----
MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEA0Z3VS5JJcds3xfn/ygWe
p3rH4Y5uh4PBCskYeFGaYGLJBSMaFTl+3kcFnIWluqQEKmjWMpKT38GUvvFKp0RG
Rl+aEPFhFzLVBuaXKELrFvMV8GrF0VtDL0iiJODZ6gxwV7SfwA8PvL1MbXM2cCJm
6EZTkOPMxSKwzHXV9M2JJHO0VWn5qPznxYivyXUD4LMRqMVAVNDNlSA6DJCQWLR
GNjcjqMFzLxSVOp/VEC3XNMvhJlRS9FtXb6MQOHNMhJSaCEJaJoAbxkXBYnYNb1h
SJMJaQIZ3XKknr1VGvIgDwl7xfZMPIzDRNUuCOasNRlMh4PuoGPHBrOFuSK5y+am
ZfFRB1rdDQ3V/qPmE9GisMWNOzMdq9rauPXcmWmIoR31fGslJPfXaE4dSUcMhgQq
c3hMgZb1VfCJn3eBuSf+NjrD8R5ylNPGl9BFEwj6tUoTP3VeMDmsLwP0KdMJ9Vp2
X4MQ3tEX3LvlZQk8FGQD1YXkaieAJFyOUFOkiIN3OZgVBFzIj3L5cWn3MFG6PPP
8SOhFQZjBvP3GDOH+h8BIwxN/+aAxwm0SDq0rMoafZE+GH1XZFT3TCeMcutahBU3
v5S0CZJPA8GNfPDZz9LF/Z4DaF4xRfXqxWGG/x1mKsJi8P+LQxGPxu/LGWaR3y/
cMrcQ/9s/LLcXc8qYqjvqXcCAwEAAQ==
-----END PUBLIC KEY-----"""

TEST_PEM_2 = """-----BEGIN PUBLIC KEY-----
MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEA1B4VS5JJcds3xfn/ygWe
p3rH4Y5uh4PBCskYeFGaYGLJBSMaFTl+3kcFnIWluqQEKmjWMpKT38GUvvFKp0RG
Rl+aEPFhFzLVBuaXKELrFvMV8GrF0VtDL0iiJODZ6gxwV7SfwA8PvL1MbXM2cCJm
6EZTkOPMxSKwzHXV9M2JJHO0VWn5qPznxYivyXUD4LMRqMVAVNDNlSA6DJCQWLR
GNjcjqMFzLxSVOp/VEC3XNMvhJlRS9FtXb6MQOHNMhJSaCEJaJoAbxkXBYnYNb1h
SJMJaQIZ3XKknr1VGvIgDwl7xfZMPIzDRNUuCOasNRlMh4PuoGPHBrOFuSK5y+am
ZfFRB1rdDQ3V/qPmE9GisMWNOzMdq9rauPXcmWmIoR31fGslJPfXaE4dSUcMhgQq
c3hMgZb1VfCJn3eBuSf+NjrD8R5ylNPGl9BFEwj6tUoTP3VeMDmsLwP0KdMJ9Vp2
X4MQ3tEX3LvlZQk8FGQD1YXkaieAJFyOUFOkiIN3OZgVBFzIj3L5cWn3MFG6PPP
8SOhFQZjBvP3GDOH+h8BIwxN/+aAxwm0SDq0rMoafZE+GH1XZFT3TCeMcutahBU3
v5S0CZJPA8GNfPDZz9LF/Z4DaF4xRfXqxWGG/x1mKsJi8P+LQxGPxu/LGWaR3y/
dNrcQ/9s/LLcXc8qYqjvqXcCAwEAAQ==
-----END PUBLIC KEY-----"""


class test_Service__Keys(TestCase):

    @classmethod
    def setUpClass(cls):
        cls.cache_client = create_send_cache_client()
        cls.service      = Service__Keys(send_cache_client=cls.cache_client)

    def test__publish_key(self):
        result = self.service.publish(TEST_PEM)
        assert result is not None
        assert 'code'        in result
        assert 'obj_id'      in result
        assert 'fingerprint' in result
        assert 'created'     in result
        assert '-' in result['code']                                          # XX-XXXX format
        assert result['fingerprint'].startswith('sha256:')

    def test__publish_key__duplicate_rejected(self):
        result = self.service.publish(TEST_PEM)
        assert result is not None
        assert result.get('error') == 'duplicate'

    def test__publish_key__empty_pem_rejected(self):
        result = self.service.publish('')
        assert result is None

    def test__lookup_key(self):
        result = self.service.publish(TEST_PEM_2)
        code   = result['code']
        entry  = self.service.lookup(code)
        assert entry is not None
        assert entry.get('code')           == code
        assert entry.get('public_key_pem') == TEST_PEM_2
        assert entry.get('algorithm')      == 'RSA-OAEP'
        assert entry.get('active')         is True

    def test__lookup_key__case_insensitive(self):
        keys  = self.service.list_keys()
        code  = keys[0]['code']
        upper = self.service.lookup(code.upper())
        lower = self.service.lookup(code.lower())
        assert upper is not None
        assert lower is not None
        assert upper.get('fingerprint') == lower.get('fingerprint')

    def test__lookup_key__not_found(self):
        result = self.service.lookup('zz-zzzz')
        assert result is None

    def test__unpublish_key(self):
        keys   = self.service.list_keys()
        code   = keys[-1]['code']
        result = self.service.unpublish(code)
        assert result is not None
        assert result.get('status') == 'unpublished'
        assert result.get('log_entry_hash') is not None

        # Unpublished key should not be found via lookup
        entry = self.service.lookup(code)
        assert entry is None

    def test__unpublish_key__not_found(self):
        result = self.service.unpublish('zz-zzzz')
        assert result is None

    def test__list_keys(self):
        keys = self.service.list_keys()
        assert isinstance(keys, list)
        # Only active keys should be returned
        for key in keys:
            assert key.get('active') is True

    def test__transparency_log(self):
        entries = self.service.get_log()
        assert isinstance(entries, list)
        assert len(entries) >= 2                                              # At least publish + unpublish
        # Verify hash chain
        for i, entry in enumerate(entries):
            assert entry.get('seq')         == i
            assert entry.get('action')      in ('publish', 'unpublish')
            assert entry.get('entry_hash')  is not None
            if i > 0:
                assert entry.get('prev_hash') == entries[i-1].get('entry_hash')
