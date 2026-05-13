import importlib
import os
from unittest                                                                   import TestCase


def _reload_storage_paths():
    from sgraph_ai_app_send.lambda__user.storage import Storage__Paths
    return importlib.reload(Storage__Paths)


class test_Storage__Paths(TestCase):

    def setUp(self):
        # Snapshot env vars that the module reads at import time
        self._saved = {k: os.environ.get(k) for k in (
            'SEND__STORAGE_BASE'   ,
            'SEND__STORAGE_VERSION',
            'SEND__DEPLOYMENT_ID'  ,
        )}
        for k in self._saved:
            os.environ.pop(k, None)

    def tearDown(self):
        for k, v in self._saved.items():
            if v is None: os.environ.pop(k, None)
            else        : os.environ[k] = v
        _reload_storage_paths()

    def test__defaults(self):
        sp = _reload_storage_paths()
        assert sp._ROOT == 'sg-send__data/sg-send-api__v1.0/shared'
        assert sp.path__vault_prefix('abc123') == 'sg-send__data/sg-send-api__v1.0/shared/vault/ab/abc123/'

    def test__all_empty_env_vars_collapse_to_flat_tree(self):
        os.environ['SEND__STORAGE_BASE'   ] = ''
        os.environ['SEND__STORAGE_VERSION'] = ''
        os.environ['SEND__DEPLOYMENT_ID'  ] = ''
        sp = _reload_storage_paths()
        assert sp._ROOT == ''
        assert sp.path__vault_prefix('abc123') == '/vault/ab/abc123/'         # leading slash because _ROOT is empty

    def test__only_base_overridden(self):
        os.environ['SEND__STORAGE_BASE'] = 'my-app'
        sp = _reload_storage_paths()
        assert sp._ROOT == 'my-app/sg-send-api__v1.0/shared'

    def test__base_and_version_empty_keeps_deployment(self):
        os.environ['SEND__STORAGE_BASE'   ] = ''
        os.environ['SEND__STORAGE_VERSION'] = ''
        os.environ['SEND__DEPLOYMENT_ID'  ] = 'prod'
        sp = _reload_storage_paths()
        assert sp._ROOT == 'prod'
        assert sp.path__vault_prefix('abc123') == 'prod/vault/ab/abc123/'
