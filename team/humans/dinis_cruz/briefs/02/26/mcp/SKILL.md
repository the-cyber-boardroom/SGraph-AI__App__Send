---
name: sg-send-encrypted
description: >
  Zero-knowledge encrypted file transfer via SG/Send MCP with optional email delivery via n8n.
  Use this skill whenever the user wants to send a file securely, encrypt and upload a file,
  share an encrypted document, send a file via SG/Send, or email an encrypted download link.
  Also trigger when the user mentions "SG/Send", "sgraph", "zero-knowledge file transfer",
  "encrypted send", or asks to "send a file securely" or "encrypt and email a file".
  This skill handles the full pipeline: file creation, SGMETA envelope wrapping, AES-256-GCM
  encryption, upload to SG/Send via MCP, round-trip verification, download URL construction,
  and optional email delivery via n8n Sherpa WorkMail.
---

# SG/Send Encrypted File Transfer

Send any file through a zero-knowledge encrypted pipeline using the SG/Send MCP connector,
with optional email delivery via n8n.

## When to Use

- User wants to send a file securely / privately
- User wants to encrypt and share a document
- User mentions SG/Send, SGraph Send, or zero-knowledge transfer
- User wants to email an encrypted download link
- User wants to upload an encrypted file and get a shareable link

## Required MCP Connectors

| Connector | Purpose | Required? |
|-----------|---------|-----------|
| **SG/Send** (`send.sgraph.ai`) | Encrypted file storage + transfer | Yes |
| **n8n** | Email delivery via Sherpa WorkMail | Only if emailing |

## Pre-Flight Checks

Before starting, verify both connectors:

```
# Check SG/Send token
transfers_check-token(token_name = "<token-name>")
# Expect: {valid: true, status: "active"}

# Check n8n email workflow (only if emailing)
search_workflows(query = "sherpa")
# Look for: "SG/Send - Sherpa workmail" → workflow ID
```

**Ask the user for** (if not provided):
1. **Access token name** — e.g. `graphs-and-maps` (the SG/Send token to authenticate uploads)
2. **Recipient email** — only if they want email delivery
3. **File content** — what to put in the file, or the user may upload a file to send

## The 7-Step Pipeline

### Step 1 — Create or Prepare the File

If creating a PDF, install `reportlab` and `cryptography`:

```bash
pip install reportlab cryptography --break-system-packages -q
```

Generate the file (PDF, text, or any binary). Save the raw bytes and the desired filename.
If the user uploaded a file, read it from `/mnt/user-data/uploads/`.

### Step 2 — SGMETA Envelope + AES-256-GCM Encryption

**CRITICAL:** The file MUST be wrapped in an SGMETA envelope BEFORE encryption.
This preserves the original filename inside the encrypted payload so the recipient
sees the correct filename on download. This matches the SG/Send browser client behavior.

For the full encryption code, see `references/encryption.md`.

The high-level flow is:

```
plaintext = [SGMETA\x00][4-byte metadata length][{"filename": "name.pdf"}][file bytes]
key       = random 32 bytes (AES-256)
nonce     = random 12 bytes (GCM)
encrypted = [12-byte nonce][AES-256-GCM ciphertext + 16-byte auth tag]
b64_payload = base64encode(encrypted)
key_b64url  = base64url_encode(key, no padding)
```

**Save state** for later steps: `encrypted_size`, `b64_payload`, `key_b64url`, `key` (hex),
original file bytes hash.

### Step 3 — Upload to SG/Send via MCP

Three sequential MCP calls:

```
# 3a. Create transfer
transfers_create(
    file_size_bytes   = <len(encrypted)>,
    content_type_hint = "<mime-type>",
    access_token      = "<token-name>"
)
# Returns: {transfer_id, upload_url}

# 3b. Upload encrypted payload
transfers_upload(
    transfer_id  = "<transfer_id>",
    access_token = "<token-name>",
    data         = "<b64_payload>"
)
# Returns: {status: "uploaded", size: <n>}
# ⚠️ VERIFY: size must be > 0 and match encrypted size

# 3c. Complete transfer
transfers_complete(
    transfer_id  = "<transfer_id>",
    access_token = "<token-name>"
)
# Returns: {transfer_id, download_url, transparency}
```

### Step 4 — Construct Download URL

```python
download_url = f"https://send.sgraph.ai/send/v0/v0.1/v0.1.8/download.html#{transfer_id}/{key_b64url}"
```

The URL fragment (`#transfer_id/key`) is **never sent to the server**. The recipient's
browser reads the fragment, fetches the encrypted blob, and decrypts locally.

### Step 5 — Verify (MANDATORY)

**Never skip verification. Never email a link without verifying first.**

```
# Download via MCP
transfers_download-base64(transfer_id = "<transfer_id>")
# Returns: {transfer_id, data: "<base64>", file_size_bytes: <n>}
```

Then in the sandbox, verify all 5 checks:

1. **Size match** — downloaded encrypted size == original encrypted size
2. **Decryption succeeds** — AES-256-GCM decrypt with same key/nonce
3. **SGMETA magic present** — first 7 bytes are `SGMETA\x00`
4. **Filename correct** — extracted JSON filename matches original
5. **Content identical** — extracted file bytes match original

See `references/encryption.md` for the full verification code.

**If any check fails → STOP. Do not email. Report the error to the user.**

### Step 6 — Email via n8n (Optional)

If the user wants email delivery, use the Sherpa WorkMail workflow:

```
execute_workflow(
    workflowId = "<sherpa-workflow-id>",
    inputs = {
        type: "webhook",
        webhookData: {
            method: "POST",
            body: {
                operation: "send_email",
                to: "<recipient-email>",
                subject: "<subject>",
                body: "<XML-escaped HTML>"
            }
        }
    }
)
```

**CRITICAL — XML Escaping:** The email body goes into an EWS SOAP envelope.
You MUST XML-escape ALL HTML in the body:

| Character | Escape |
|-----------|--------|
| `<` | `&lt;` |
| `>` | `&gt;` |
| `'` | `&apos;` |
| `&` | `&amp;` |

The Sherpa WorkMail workflow ID is typically `LNTb1Smmt91x8iGn` — confirm with
`search_workflows(query="sherpa")`.

### Step 7 — Report to User

Always report:
- Filename and size of the original file
- Transfer ID
- Full download URL (with key in fragment)
- Verification result (all 5 checks)
- Email delivery status (if applicable)

## Error Reference

| Error | Cause | Fix |
|-------|-------|-----|
| `transfers_upload` returns `size: 0` | `data` param not passed | Pass `data=<b64_payload>` explicitly |
| Decryption fails on verify | Key mismatch or corrupted upload | Re-upload from scratch |
| SGMETA magic missing | Envelope not applied before encryption | Re-do Step 2: wrap THEN encrypt |
| Filename mismatch | Wrong filename in SGMETA JSON | Fix filename in Step 2 |
| n8n XML parse error | Raw HTML in email body | XML-escape all HTML entities |
| 401 on SG/Send | Invalid or expired token | Check with `transfers_check-token` |

## Security Properties

- **Zero-knowledge:** Server stores only encrypted ciphertext
- **Encrypted filename:** Filename is inside SGMETA envelope, encrypted
- **Key never on server:** Key travels only in URL fragment (`#`), never sent to server
- **Fresh key per transfer:** New random 256-bit key for every file
- **Authenticated encryption:** AES-256-GCM = confidentiality + integrity + authenticity
- **Verified before sending:** Round-trip decryption + content match verified before emailing
