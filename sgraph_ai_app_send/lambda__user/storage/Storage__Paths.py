import os

STORAGE__BASE       = 'sg-send__data'
STORAGE__VERSION    = 'sg-send-api__v1.0'
STORAGE__DEPLOYMENT = os.environ.get('SEND__DEPLOYMENT_ID', 'shared')

_ROOT = f'{STORAGE__BASE}/{STORAGE__VERSION}/{STORAGE__DEPLOYMENT}'


def path__transfer_meta(transfer_id: str) -> str:
    return f'{_ROOT}/transfers/{transfer_id[:2]}/{transfer_id}/meta.json'

def path__transfer_payload(transfer_id: str) -> str:
    return f'{_ROOT}/transfers/{transfer_id[:2]}/{transfer_id}/payload'

def path__transfer_prefix(transfer_id: str) -> str:
    return f'{_ROOT}/transfers/{transfer_id[:2]}/{transfer_id}/'

def path__vault_manifest(vault_id: str) -> str:
    return f'{_ROOT}/vault/{vault_id[:2]}/{vault_id}/manifest.json'

def path__vault_payload(vault_id: str, file_id: str) -> str:
    return f'{_ROOT}/vault/{vault_id[:2]}/{vault_id}/{file_id}/payload'

def path__vault_prefix(vault_id: str) -> str:
    return f'{_ROOT}/vault/{vault_id[:2]}/{vault_id}/'

def path__vault_zip(vault_id: str, content_hash: str) -> str:
    return f'{_ROOT}/cache/vault-zips/{vault_id}/{content_hash}.zip'

def path__vault_zip_prefix(vault_id: str) -> str:
    return f'{_ROOT}/cache/vault-zips/{vault_id}/'
