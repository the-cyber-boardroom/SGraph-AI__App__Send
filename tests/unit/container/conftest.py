import os
import shutil
import subprocess
import tempfile
import pytest

_vault_static_dir = None


def _build_vault_static():
    global _vault_static_dir
    if _vault_static_dir and os.path.isdir(_vault_static_dir):
        return _vault_static_dir

    out_dir  = tempfile.mkdtemp(prefix='sg-send-vault-test-')
    repo_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    script   = os.path.join(repo_root, 'scripts', 'build-vault-static.sh')

    env = os.environ.copy()
    env['VAULT_DEFAULT_ENDPOINT'] = ''         # Matches container build — relative API paths
    result = subprocess.run(['bash', script, out_dir], capture_output=True, text=True, env=env)
    if result.returncode != 0:
        raise RuntimeError(f'build-vault-static.sh failed:\n{result.stderr}')

    _vault_static_dir = out_dir
    return out_dir


@pytest.fixture(scope='session', autouse=True)
def vault_static_dir():
    out_dir = _build_vault_static()
    os.environ['SEND__VAULT_STATIC_DIR'] = out_dir
    yield out_dir
    del os.environ['SEND__VAULT_STATIC_DIR']
    shutil.rmtree(out_dir, ignore_errors=True)
