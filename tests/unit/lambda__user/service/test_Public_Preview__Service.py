# ===============================================================================
# SGraph Send - Public_Preview__Service tests
# Cross-verifies the Python derivation against the browser (node) reference values,
# and the OG-render happy path + fail-closed behaviour.
# ===============================================================================

import base64
import hashlib
import json
import os
from unittest                                                  import TestCase
from cryptography.hazmat.primitives.ciphers.aead               import AESGCM
from sgraph_ai_app_send.lambda__user.service.Transfer__Service import Transfer__Service
from sgraph_ai_app_send.lambda__user.service.Public_Preview__Service import Public_Preview__Service

# Reference values produced by the browser module (public-preview-crypto.js) via node:
#   deriveTransferId('vault-demo-health-data')   -> '4c37e20f4a0b'
#   readKeyBase64url('vault-demo-health-data')   -> 'nkCUa65oHF_4NIL0BNPoJkr022-9mwpORbHWzC5PWe4'
NODE_PUBLIC_ID   = 'vault-demo-health-data'
NODE_TRANSFER_ID = '4c37e20f4a0b'
NODE_READ_KEY_B64 = 'nkCUa65oHF_4NIL0BNPoJkr022-9mwpORbHWzC5PWe4'


class test_Public_Preview__Service(TestCase):

    def setUp(self):
        self.transfers = Transfer__Service()
        self.service   = Public_Preview__Service(transfer_service=self.transfers, debug_timings=False)

    # --- cross-language derivation parity (the critical correctness property) ---
    def test__derivation_matches_browser(self):
        assert self.service.derive_transfer_id(NODE_PUBLIC_ID)  == NODE_TRANSFER_ID
        assert self.service.read_key_base64url(NODE_PUBLIC_ID)  == NODE_READ_KEY_B64

    def test__derivation_is_case_insensitive(self):
        assert self.service.derive_transfer_id('  Vault-Demo  ') == self.service.derive_transfer_id('vault-demo')

    # --- helper: publish a preview the way the browser write path would ---------
    def _publish(self, public_id, preview):
        transfer_id = self.service.derive_transfer_id(public_id)
        key         = self.service.derive_read_key_bytes(public_id)
        iv          = os.urandom(12)
        ct          = AESGCM(key).encrypt(iv, json.dumps(preview).encode(), None)
        cipher      = iv + ct
        auth        = 'owner-delete-secret'
        self.transfers.create_transfer(file_size_bytes=len(cipher), content_type_hint='application/json',
                                       sender_ip='', transfer_id=transfer_id,
                                       delete_auth_hash=hashlib.sha256(auth.encode()).hexdigest(),
                                       allow_recreate=True)
        self.transfers.upload_payload(transfer_id, cipher)
        self.transfers.complete_transfer(transfer_id)

    def test__fetch_preview_roundtrip(self):
        preview = {'schema': 'sgraph-public-preview/v1', 'title': 'Health Data Demo Vault',
                   'description': 'Public demo materials.'}
        self._publish(NODE_PUBLIC_ID, preview)
        got = self.service.fetch_preview(NODE_PUBLIC_ID)
        assert got == preview

    def test__render_og_html_contains_title_and_description(self):
        preview = {'schema': 'sgraph-public-preview/v1', 'title': 'Acme <Q3> Board',
                   'description': 'Confidential & restricted',
                   'thumbnail': {'mode': 'inline', 'media_type': 'image/webp', 'data': 'data:image/webp;base64,AAAA',
                                 'width': 1200, 'height': 630}}
        self._publish(NODE_PUBLIC_ID, preview)
        image_url = 'https://dev.send.sgraph.ai/api/public-preview/og-image/' + NODE_PUBLIC_ID
        html = self.service.render_og_html(NODE_PUBLIC_ID, app_url='https://dev.vault.sgraph.ai/en-gb/app/' + NODE_PUBLIC_ID, image_url=image_url)
        assert 'og:title' in html
        assert 'Acme &lt;Q3&gt; Board' in html                                   # HTML-escaped (no injection)
        assert 'Confidential &amp; restricted' in html
        # og:image is an HTTP URL (crawlers don't fetch data: URIs), NOT the inline data
        assert image_url in html
        assert 'data:image/webp' not in html
        # declared dimensions → crawlers pick the LARGE image card
        assert 'og:image:width' in html and '1200' in html
        assert 'og:image:height' in html and '630' in html

    def test__thumbnail_bytes_decodes_inline_image(self):
        png = b'\x89PNG\r\n\x1a\n' + b'\x00' * 16
        preview = { 'schema': 'sgraph-public-preview/v1', 'title': 'T',
                    'thumbnail': { 'mode': 'inline', 'media_type': 'image/webp',
                                   'data': 'data:image/webp;base64,' + base64.b64encode(png).decode() } }
        self._publish(NODE_PUBLIC_ID, preview)
        media, raw = self.service.thumbnail_bytes(NODE_PUBLIC_ID)
        assert media == 'image/webp'
        assert raw == png
        assert self.service.thumbnail_bytes('no-such-id') is None             # no preview → None (route returns 404)

    def test__og_image_dimensions_parsed_from_bytes(self):
        import struct
        # minimal PNG header carrying 1200x630 (no stored width/height in the preview JSON)
        png = b'\x89PNG\r\n\x1a\n' + b'\x00\x00\x00\x0dIHDR' + struct.pack('>II', 1200, 630) + b'\x08\x02\x00\x00\x00' + b'\x00' * 16
        assert self.service._image_dimensions(png) == (1200, 630)
        data_url = 'data:image/png;base64,' + base64.b64encode(png).decode()
        preview = {'schema': 'sgraph-public-preview/v1', 'title': 'T',
                   'thumbnail': {'mode': 'inline', 'media_type': 'image/png', 'data': data_url}}   # no width/height stored
        self._publish(NODE_PUBLIC_ID, preview)
        html = self.service.render_og_html(NODE_PUBLIC_ID, image_url='https://dev.send.sgraph.ai/api/public-preview/og-image/' + NODE_PUBLIC_ID)
        assert 'og:image:width' in html and '1200' in html
        assert 'og:image:height' in html and '630' in html

    def test__description_fallback_meta(self):
        self._publish(NODE_PUBLIC_ID, {'schema': 'sgraph-public-preview/v1', 'title': 'T', 'description': 'hello world'})
        html = self.service.render_og_html(NODE_PUBLIC_ID)
        assert '<meta name="description"' in html and 'hello world' in html
        assert 'og:site_name' in html

    # --- fail closed ------------------------------------------------------------
    def test__unknown_preview_fails_closed(self):
        html = self.service.render_og_html('no-such-preview-here')
        assert 'og:title' in html and 'SG/Vault' in html                         # default shell, no exception
        assert self.service.fetch_preview('no-such-preview-here') is None

    def test__corrupt_payload_fails_closed(self):
        transfer_id = self.service.derive_transfer_id('broken-one')
        self.transfers.create_transfer(file_size_bytes=5, content_type_hint='application/json',
                                       sender_ip='', transfer_id=transfer_id)
        self.transfers.upload_payload(transfer_id, b'not-encrypted-garbage')
        self.transfers.complete_transfer(transfer_id)
        assert self.service.fetch_preview('broken-one') is None                  # decrypt fails -> None, no raise
