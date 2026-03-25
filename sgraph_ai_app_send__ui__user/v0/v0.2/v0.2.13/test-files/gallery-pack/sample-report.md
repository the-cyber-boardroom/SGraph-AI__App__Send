# Quarterly Security Report

**date** 18 March 2026
**classification** Internal

---

## Executive Summary

All systems passed penetration testing with zero critical findings.
The zero-knowledge architecture ensures that **encrypted data at rest
cannot be decrypted** without the client-held key.

## Key Metrics

| Metric | Q1 | Q2 | Q3 |
|--------|-----|-----|-----|
| Uptime | 99.97% | 99.99% | 99.98% |
| Incidents | 2 | 0 | 1 |
| Mean response | 12ms | 9ms | 11ms |

## Architecture Highlights

The system uses a **three-layer** encryption model:

1. Client-side AES-256-GCM encryption
2. TLS 1.3 in transit
3. Server-side storage encryption (redundant — data already encrypted)

### Code Example

```python
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

key = AESGCM.generate_key(bit_length=256)
aesgcm = AESGCM(key)
ct = aesgcm.encrypt(nonce, plaintext, associated_data)
```

> "The server never sees plaintext. By design, not by policy."
> — SG/Send Architecture Brief

## Next Steps

- [ ] Implement PKI-signed audit trails
- [ ] Add hardware key support (FIDO2)
- [x] Zero-knowledge file sharing (shipped v0.1.0)
- [x] Client-side thumbnail generation (shipped v0.2.12)
