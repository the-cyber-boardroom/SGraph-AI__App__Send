# ===============================================================================
# SGraph Send - Public Vault Preview Service
# Server-side derivation + decrypt of the (deliberately public) preview, used to
# render crawler-visible Open Graph meta tags for /en-gb/app/<public-id> and to
# feed the /en-gb/preview/<public-id> card-tester page.
#
# The derivation MUST match the browser (public-preview-crypto.js):
#   transfer_id = SHA-256('pvp-transfer-v1:' + id)[:12 hex]
#   read_key    = PBKDF2-HMAC-SHA256(id, salt='sgraph-public-preview-v1', 600000, 32 bytes)
#   wire        = AES-256-GCM, [12-byte IV][ciphertext+tag]
# It reads only the already-public transfer; it stores nothing new and never
# touches vault contents. Fails closed (no preview) on any error.
# ===============================================================================

import base64
import hashlib
import html
import json
import time
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from osbot_utils.type_safe.Type_Safe             import Type_Safe


PREVIEW_PBKDF2_SALT = b'sgraph-public-preview-v1'
PREVIEW_ITERATIONS  = 600000
TRANSFER_PREFIX     = 'pvp-transfer-v1:'


class Public_Preview__Service(Type_Safe):
    transfer_service : object = None                                             # Transfer__Service (download source)
    debug_timings    : bool   = True                                             # TEMP: print per-stage timings (remove after perf sign-off)

    # --- derivation (must match public-preview-crypto.js) ----------------------
    def derive_transfer_id(self, public_id):
        norm = (public_id or '').lower().strip()
        return hashlib.sha256((TRANSFER_PREFIX + norm).encode()).hexdigest()[:12]

    def derive_read_key_bytes(self, public_id):
        norm = (public_id or '').lower().strip()
        return hashlib.pbkdf2_hmac('sha256', norm.encode(), PREVIEW_PBKDF2_SALT, PREVIEW_ITERATIONS, dklen=32)

    def read_key_base64url(self, public_id):
        return base64.urlsafe_b64encode(self.derive_read_key_bytes(public_id)).decode().rstrip('=')

    def _decrypt(self, data: bytes, key_bytes: bytes) -> bytes:
        iv         = data[:12]
        ciphertext = data[12:]                                                   # AES-GCM ciphertext+tag (Web Crypto appends the 16-byte tag)
        return AESGCM(key_bytes).decrypt(iv, ciphertext, None)

    # --- fetch + decrypt + validate the public preview -------------------------
    # Returns the preview dict, or None (fail closed) on any miss/error.
    def fetch_preview(self, public_id):
        t0 = time.time()
        transfer_id = self.derive_transfer_id(public_id)
        timings = dict(public_id=public_id, transfer_id=transfer_id, hit=False)
        try:
            if self.transfer_service is None:
                return self._done(None, timings, t0, 'no-service')
            payload = self.transfer_service.get_download_payload(transfer_id, '', '')
            if not isinstance(payload, (bytes, bytearray)):                      # None (404) or dict (410 expired/exhausted)
                return self._done(None, timings, t0, 'not-available')
            t_fetch = time.time()
            key   = self.derive_read_key_bytes(public_id)
            plain = self._decrypt(bytes(payload), key)
            t_dec = time.time()
            preview = json.loads(plain.decode('utf-8'))
            if preview.get('schema') != 'sgraph-public-preview/v1' or not preview.get('title'):
                return self._done(None, timings, t0, 'invalid')
            timings.update(hit=True, fetch_ms=round((t_fetch - t0) * 1000, 1), decrypt_ms=round((t_dec - t_fetch) * 1000, 1))
            return self._done(preview, timings, t0, 'ok')
        except Exception as error:                                               # decrypt/parse failure → fail closed
            return self._done(None, timings, t0, f'error:{type(error).__name__}')

    def _done(self, preview, timings, t0, status):
        timings['status']   = status
        timings['total_ms'] = round((time.time() - t0) * 1000, 1)
        if self.debug_timings:
            print(f"[public-preview] {timings}")                                 # TEMP: remove after perf sign-off
        self.last_timings = timings
        return preview

    # --- render the OG-tagged HTML shell (crawler-visible) ---------------------
    def render_og_html(self, public_id, app_url='', image_url=''):
        preview = self.fetch_preview(public_id)
        if not preview:
            return self._shell(title='SG/Vault', description='An encrypted SGraph vault.', image='', url=app_url)
        # og:image MUST be an HTTP(S) URL — crawlers (WhatsApp/LinkedIn/…) do NOT fetch
        # data: URIs. Point it at the og-image endpoint (served by og_image()) only when
        # the preview actually has a thumbnail.
        image = image_url if (image_url and self._has_thumbnail(preview)) else ''
        thumb = preview.get('thumbnail') if isinstance(preview.get('thumbnail'), dict) else {}
        iw, ih = thumb.get('width'), thumb.get('height')
        if image and not (iw and ih):                                            # older previews didn't store dims
            raw = self._decode_inline_thumb(thumb)                               # parse them from the image bytes
            dims = self._image_dimensions(raw) if raw else None
            if dims and all(1 <= d <= 8000 for d in dims):                       # sanity-bound parsed values
                iw, ih = dims
        return self._shell(title       = preview.get('title', 'SG/Vault'),
                           description = preview.get('description', ''),
                           image       = image,
                           url         = app_url,
                           img_w       = iw,
                           img_h       = ih)

    @staticmethod
    def _has_thumbnail(preview):
        t = preview.get('thumbnail')
        return isinstance(t, dict) and bool(t.get('data'))

    @staticmethod
    def _decode_inline_thumb(thumb):
        import re as _re
        m = _re.match(r'^data:([^;]+);base64,(.*)$', (thumb or {}).get('data', ''), _re.DOTALL)
        if not m:
            return None
        try:
            return base64.b64decode(m.group(2))
        except Exception:
            return None

    # Read pixel dimensions straight from the image bytes (no Pillow). Handles the
    # WebP the editor produces, plus PNG/JPEG. Returns (w, h) or None.
    @staticmethod
    def _image_dimensions(data):
        try:
            if not data or len(data) < 30:
                return None
            if data[:8] == b'\x89PNG\r\n\x1a\n':                                  # PNG
                return (int.from_bytes(data[16:20], 'big'), int.from_bytes(data[20:24], 'big'))
            if data[:2] == b'\xff\xd8':                                           # JPEG — scan SOF markers
                i = 2
                while i < len(data) - 9:
                    if data[i] != 0xFF:
                        i += 1; continue
                    marker = data[i + 1]
                    if marker in (0xC0, 0xC1, 0xC2, 0xC3):
                        return (int.from_bytes(data[i + 7:i + 9], 'big'), int.from_bytes(data[i + 5:i + 7], 'big'))
                    i += 2 + int.from_bytes(data[i + 2:i + 4], 'big')
                return None
            if data[:4] == b'RIFF' and data[8:12] == b'WEBP':                     # WebP
                fourcc = data[12:16]
                if fourcc == b'VP8X':
                    return ((data[24] | data[25] << 8 | data[26] << 16) + 1,
                            (data[27] | data[28] << 8 | data[29] << 16) + 1)
                if fourcc == b'VP8 ':                                             # lossy (canvas toDataURL q<1)
                    return ((data[26] | data[27] << 8) & 0x3FFF, (data[28] | data[29] << 8) & 0x3FFF)
                if fourcc == b'VP8L':                                             # lossless
                    b = data[21:25]
                    return (((b[0] | (b[1] << 8)) & 0x3FFF) + 1,
                            (((b[1] >> 6) | (b[2] << 2) | ((b[3] & 0x0F) << 10)) & 0x3FFF) + 1)
        except Exception:
            return None
        return None

    # Decode the (deliberately public) inline thumbnail to raw bytes for the og-image
    # endpoint. Returns (media_type, bytes) or None.
    def thumbnail_bytes(self, public_id):
        preview = self.fetch_preview(public_id)
        if not preview or not self._has_thumbnail(preview):
            return None
        data_url = preview['thumbnail'].get('data', '')
        import re as _re
        m = _re.match(r'^data:([^;]+);base64,(.*)$', data_url, _re.DOTALL)
        if not m:
            return None
        try:
            return (m.group(1), base64.b64decode(m.group(2)))
        except Exception:
            return None

    def _shell(self, title, description, image, url, img_w=None, img_h=None):
        e = html.escape
        tags = [
            f'<meta property="og:title" content="{e(title)}">',
            f'<meta property="og:description" content="{e(description)}">',
            f'<meta name="description" content="{e(description)}">',          # standard fallback (LinkedIn et al.)
            f'<meta property="og:site_name" content="SG/Vault">',
            f'<meta property="og:type" content="website">',
            f'<meta name="twitter:card" content="summary_large_image">',
            f'<meta name="twitter:title" content="{e(title)}">',
            f'<meta name="twitter:description" content="{e(description)}">',
        ]
        if url:   tags.append(f'<meta property="og:url" content="{e(url)}">')
        if image:
            tags += [f'<meta property="og:image" content="{e(image)}">',
                     f'<meta name="twitter:image" content="{e(image)}">']
            # Declaring dimensions nudges crawlers (WhatsApp/LinkedIn) to the LARGE image card.
            if img_w and img_h:
                tags += [f'<meta property="og:image:width" content="{int(img_w)}">',
                         f'<meta property="og:image:height" content="{int(img_h)}">']
        return ('<!doctype html><html lang="en-GB"><head><meta charset="utf-8">'
                f'<title>{e(title)}</title>' + ''.join(tags) +
                '</head><body><div id="app"></div></body></html>')
