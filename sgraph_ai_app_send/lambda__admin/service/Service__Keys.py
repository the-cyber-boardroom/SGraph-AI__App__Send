# ===============================================================================
# SGraph Send - Key Registry Service
# Public key lifecycle: publish, lookup, unpublish, list, transparency log
# Uses KEY_BASED strategy in the 'keys' namespace
# ===============================================================================

import base64
import hashlib
import secrets
from   datetime                                                              import datetime, timezone
from   osbot_utils.type_safe.Type_Safe                                      import Type_Safe
from   sgraph_ai_app_send.lambda__admin.service.Send__Cache__Client         import Send__Cache__Client


def _generate_lookup_code():                                                 # Generate XX-XXXX lookup code (base-36: a-z, 0-9)
    chars  = 'abcdefghijklmnopqrstuvwxyz0123456789'
    part1  = ''.join(secrets.choice(chars) for _ in range(2))
    part2  = ''.join(secrets.choice(chars) for _ in range(4))
    return f'{part1}-{part2}'


def _compute_fingerprint_from_pem(pem):                                      # SHA-256 fingerprint of DER-encoded public key
    lines    = pem.strip().split('\n')
    b64_data = ''.join(line for line in lines if not line.startswith('-----'))
    der      = base64.b64decode(b64_data)
    digest   = hashlib.sha256(der).hexdigest()
    return f'sha256:{digest[:16]}'


def _detect_algorithm(pem):                                                   # Detect RSA vs EC from PEM length heuristic
    lines    = pem.strip().split('\n')
    b64_data = ''.join(line for line in lines if not line.startswith('-----'))
    der      = base64.b64decode(b64_data)
    if len(der) > 256:                                                        # RSA keys are typically 550+ bytes
        return 'RSA-OAEP', 4096
    return 'ECDH', 256


class Service__Keys(Type_Safe):                                              # Key registry lifecycle management
    send_cache_client : Send__Cache__Client                                  # Injected cache client

    def publish(self, public_key_pem, signing_key_pem=''):                   # Publish a public key, return lookup code
        if not public_key_pem or not public_key_pem.strip():
            return None

        fingerprint = _compute_fingerprint_from_pem(public_key_pem)

        # Check for duplicate fingerprint (scan all entries)
        all_codes = self.send_cache_client.key__list_all()
        for existing_code in all_codes:
            if existing_code and not existing_code.startswith('log-'):
                existing_entry = self.send_cache_client.key__lookup(existing_code)
                if existing_entry and existing_entry.get('fingerprint') == fingerprint:
                    return dict(error='duplicate', fingerprint=fingerprint)

        # Generate unique lookup code (retry on collision)
        for _ in range(10):
            code = _generate_lookup_code()
            if self.send_cache_client.key__lookup(code) is None:
                break
        else:
            return None                                                      # Could not generate unique code

        algorithm, key_size = _detect_algorithm(public_key_pem)
        obj_id              = secrets.token_hex(4)                           # 8-hex Obj_Id

        entry = dict(
            code            = code                                           ,
            obj_id          = obj_id                                         ,
            public_key_pem  = public_key_pem                                 ,
            signing_key_pem = signing_key_pem                                ,
            fingerprint     = fingerprint                                    ,
            algorithm       = algorithm                                      ,
            key_size        = key_size                                       ,
            created         = datetime.now(timezone.utc).isoformat()         ,
            active          = True                                           )

        result = self.send_cache_client.key__create(entry)
        if result is None:
            return None

        # Append to transparency log
        self._append_log('publish', code, fingerprint)

        return dict(code        = code                                       ,
                    obj_id      = obj_id                                     ,
                    fingerprint = fingerprint                                ,
                    created     = entry['created']                           )

    def lookup(self, code):                                                  # Lookup key by code (case-insensitive)
        code  = code.lower().strip()
        entry = self.send_cache_client.key__lookup(code)
        if entry is None:
            return None
        if not entry.get('active', True):
            return None
        return entry

    def unpublish(self, code):                                               # Unpublish (soft-delete) a key
        code  = code.lower().strip()
        entry = self.send_cache_client.key__lookup(code)
        if entry is None:
            return None

        entry['active'] = False
        cache_id = self.send_cache_client.key__lookup_cache_id(code)
        if cache_id:
            self.send_cache_client.key__update(cache_id, entry)

        log_hash = self._append_log('unpublish', code, entry.get('fingerprint', ''))
        return dict(code   = code            ,
                    status = 'unpublished'   ,
                    log_entry_hash = log_hash)

    def list_keys(self):                                                     # List all published keys
        codes = self.send_cache_client.key__list_all()
        keys  = []
        for code in codes:
            if code:
                entry = self.send_cache_client.key__lookup(code)
                if entry and entry.get('active', True):
                    keys.append(entry)
        return keys

    def get_log(self):                                                       # Get transparency log entries
        return self.send_cache_client.key__get_log_entries()

    def _append_log(self, action, code, fingerprint):                        # Append entry to transparency log
        entries  = self.send_cache_client.key__get_log_entries()
        seq      = len(entries)
        prev_hash = entries[-1].get('entry_hash', '') if entries else ''

        entry_data = f'{seq}:{action}:{code}:{fingerprint}:{prev_hash}'
        entry_hash = hashlib.sha256(entry_data.encode()).hexdigest()[:16]

        log_entry = dict(
            seq         = seq                                                ,
            action      = action                                             ,
            code        = code                                               ,
            fingerprint = fingerprint                                        ,
            timestamp   = datetime.now(timezone.utc).isoformat()             ,
            prev_hash   = prev_hash                                          ,
            entry_hash  = entry_hash                                         )

        self.send_cache_client.key__append_log(log_entry)
        return entry_hash
