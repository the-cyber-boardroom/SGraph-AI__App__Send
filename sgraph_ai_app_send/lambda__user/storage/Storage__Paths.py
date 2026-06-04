import os

# The on-disk / in-bucket path tree is built from three pieces, each independently
# overridable via env var. Empty values are dropped, so SEND__STORAGE_BASE="" and
# SEND__STORAGE_VERSION="" produces a flat tree rooted at the deployment slug
# (or fully flat if SEND__DEPLOYMENT_ID is also empty).
#
# CAUTION: changing these values for an existing deployment makes prior data
# unreadable (different path tree). Treat them as deploy-time configuration.

STORAGE__BASE       = os.environ.get('SEND__STORAGE_BASE'   , 'sg-send__data'    )   # multi-tenant slot (one bucket can host multiple apps)
STORAGE__VERSION    = os.environ.get('SEND__STORAGE_VERSION', 'sg-send-api__v1.0')   # schema version
STORAGE__DEPLOYMENT = os.environ.get('SEND__DEPLOYMENT_ID'  , 'shared'           )   # per-stage slot (dev / qa / prod / etc.)

_ROOT = '/'.join(p for p in (STORAGE__BASE, STORAGE__VERSION, STORAGE__DEPLOYMENT) if p)


def path__transfer_meta(transfer_id: str) -> str:
    return f'{_ROOT}/transfers/{transfer_id[:2]}/{transfer_id}/meta.json'

def path__transfer_payload(transfer_id: str) -> str:
    return f'{_ROOT}/transfers/{transfer_id[:2]}/{transfer_id}/payload'

def path__transfer_prefix(transfer_id: str) -> str:
    return f'{_ROOT}/transfers/{transfer_id[:2]}/{transfer_id}/'

def path__vault_manifest(vault_id: str) -> str:
    return f'{_ROOT}/vault/{vault_id[:2]}/{vault_id}/manifest.json'

def path__vault_tombstone(vault_id: str) -> str:
    return f'{_ROOT}/vault/{vault_id[:2]}/{vault_id}/deleted.json'

def path__vault_payload(vault_id: str, file_id: str) -> str:
    return f'{_ROOT}/vault/{vault_id[:2]}/{vault_id}/{file_id}/payload'

def path__vault_prefix(vault_id: str) -> str:
    return f'{_ROOT}/vault/{vault_id[:2]}/{vault_id}/'

def path__vault_zip(vault_id: str, content_hash: str) -> str:
    return f'{_ROOT}/cache/vault-zips/{vault_id}/{content_hash}.zip'

def path__vault_zip_prefix(vault_id: str) -> str:
    return f'{_ROOT}/cache/vault-zips/{vault_id}/'

def path__vault_public_vault_json(vault_id: str) -> str:
    return f'{_ROOT}/vault/{vault_id[:2]}/{vault_id}/public-vault.json'

def path__vault_inbox(vault_id: str, append_token: str, file_name: str) -> str:
    return f'{_ROOT}/vault/{vault_id[:2]}/{vault_id}/inbox/{append_token}/{file_name}'

def path__vault_inbox_prefix(vault_id: str, append_token: str) -> str:
    return f'{_ROOT}/vault/{vault_id[:2]}/{vault_id}/inbox/{append_token}/'

def path__vault_processed(vault_id: str, append_token: str, file_name: str) -> str:
    return f'{_ROOT}/vault/{vault_id[:2]}/{vault_id}/processed/{append_token}/{file_name}'

def path__vault_processed_prefix(vault_id: str, append_token: str) -> str:
    return f'{_ROOT}/vault/{vault_id[:2]}/{vault_id}/processed/{append_token}/'
