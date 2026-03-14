# Element Spec: sg-crypto.js (Production Copy)

**Layer:** Core
**IFD path:** `core/crypto/v1/v1.0/v1.0.0/sg-crypto.js`
**Effort:** Low
**Batch:** 1 (Foundation)
**Priority:** #1 — must be done first

---

## What

Replace the current sg-crypto.js (written from scratch, unverified) with an exact copy of Send's production crypto module.

## Why

The tools repo's current crypto module was written independently. Its wire format (how it encodes the IV, the ciphertext structure, the key export format) has NOT been tested against send.sgraph.ai. If they differ, a file encrypted by tools.sgraph.ai cannot be decrypted by send.sgraph.ai. This is a correctness risk that blocks every crypto-dependent element.

## Source File

```
sgraph_ai_app_send__ui__user/v0/v0.2/v0.2.0/_common/js/crypto.js
```

Clone the SG/Send repo to get the production file:
```bash
git clone https://github.com/the-cyber-boardroom/SGraph-AI__App__Send.git /tmp/sgraph-send-ref
```

## Instructions

1. **Copy** the production file byte-for-byte
2. **Convert** from object-literal pattern (`const SendCrypto = { ... }`) to ES module with named exports — if the production file already uses named exports, copy as-is
3. **Place** at `core/crypto/v1/v1.0/v1.0.0/sg-crypto.js`
4. **Create** `manifest.json` (see architecture.md)
5. **Verify** wire-format compatibility:
   - Encrypt a test file with the tools version
   - Decrypt it using the same API flow that Send uses
   - Encrypt a file using Send's exact flow, decrypt with tools version
   - Both must produce identical plaintext

## Do NOT

- Improve, refactor, or "clean up" the code
- Add features
- Change function signatures
- Rename exports (beyond the object-to-named-export conversion)
- Add error handling that the original doesn't have

## Acceptance Criteria

- [ ] sg-crypto.js is a faithful copy of Send production
- [ ] Wire-format test passes (encrypt with tools, decrypt with Send pattern)
- [ ] manifest.json exists with correct exports list
- [ ] Existing SSH Key Generator still works (no regressions)

## Reference

- Tools team briefing section 9: "Crypto module not verified against Send production"
- UX Components brief: all crypto-dependent components need this fixed first
