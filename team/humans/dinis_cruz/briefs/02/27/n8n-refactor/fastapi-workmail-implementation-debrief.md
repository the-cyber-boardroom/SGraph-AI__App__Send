# Implementation Debrief: WorkMail EWS Service in FastAPI

**Purpose:** This document is a complete technical specification for an LLM to implement the current n8n WorkMail workflow as a FastAPI service. It contains every SOAP body, the full XML parsing logic, all validation rules, and the exact response schemas currently in production.

---

## 1. What This Service Does

A FastAPI HTTP service that acts as a structured gateway to AWS WorkMail via EWS (Exchange Web Services) SOAP. It supports multiple named accounts and four email operations. It is consumed by Claude via MCP (handled separately — this document covers only the FastAPI service itself).

---

## 2. Accounts and Credentials

Accounts are identified by a short string name. Credentials are Basic Auth (base64 of `username:password`) stored in environment variables.

**Current accounts:**

| Account name | Email address | Env var |
|---|---|---|
| `sherpa` | `sherpa.explorer@sgraph.ai` | `WORKMAIL_SHERPA_AUTH` |
| `dinis` | `dinis.cruz@sgraph.ai` | `WORKMAIL_DINIS_AUTH` |

`WORKMAIL_SHERPA_AUTH` and `WORKMAIL_DINIS_AUTH` are pre-computed base64 strings:
```
base64("sherpa.explorer@sgraph.ai:password")
```

They are used directly as the value of the `Authorization: Basic <value>` HTTP header sent to EWS. Do not re-encode them — they are already base64.

**EWS endpoint:**
```
https://ews.mail.<WORKMAIL_REGION>.awsapps.com/EWS/Exchange.asmx
```
`WORKMAIL_REGION` is an env var, currently `eu-west-1`.

Full URL: `https://ews.mail.eu-west-1.awsapps.com/EWS/Exchange.asmx`

**Adding a new account** requires only adding a new env var and registering it in the accounts dict. No other code changes.

---

## 3. API Design

### 3.1 Request format

All endpoints accept JSON POST bodies. The account is a path parameter, not a body field.

```
POST /workmail/{account}/{operation}
```

### 3.2 Webhook secret

All requests must include `X-Webhook-Secret: <secret>` header. Reject with 401 if missing or wrong. Secret stored in env var `WEBHOOK_SECRET`.

### 3.3 Endpoints

```
POST /workmail/{account}/list_inbox
POST /workmail/{account}/get_message
POST /workmail/{account}/send_email
POST /workmail/{account}/reply
```

### 3.4 Request bodies

**list_inbox:**
```json
{
  "limit": 20,
  "since": "2026-02-26T00:00:00Z"
}
```
Both fields optional. `limit` defaults to 20. `since` defaults to 24 hours ago (ISO 8601).

**get_message:**
```json
{
  "item_id": "<EWS item ID string>"
}
```

**send_email:**
```json
{
  "to": "recipient@example.com",
  "subject": "Subject line",
  "body": "<p>HTML or plain text body</p>",
  "cc": "optional@example.com"
}
```
`cc` is optional.

**reply:**
```json
{
  "item_id": "<EWS item ID string>",
  "body": "<p>Reply body HTML or plain text</p>"
}
```

### 3.5 Response format

All responses return JSON. All success responses include `"success": true`. All error responses include `"success": false` and `"error": "<message>"`.

---

## 4. EWS SOAP Requests

All four operations POST to the same EWS endpoint with `Content-Type: text/xml; charset=utf-8` and `Authorization: Basic <value>`.

The EWS schema version declared in requests is `Exchange2007_SP1`. The server responds as `Exchange2010_SP2` — this is normal for AWS WorkMail.

### 4.1 list_inbox — FindItem

```xml
<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages"
  xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types"
  xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Header>
    <t:RequestServerVersion Version="Exchange2007_SP1" />
  </soap:Header>
  <soap:Body>
    <m:FindItem Traversal="Shallow">
      <m:ItemShape>
        <t:BaseShape>AllProperties</t:BaseShape>
        <t:AdditionalProperties>
          <t:FieldURI FieldURI="message:From" />
          <t:FieldURI FieldURI="message:Sender" />
        </t:AdditionalProperties>
      </m:ItemShape>
      <m:IndexedPageItemView MaxEntriesReturned="{limit}" Offset="0" BasePoint="Beginning" />
      <m:Restriction>
        <t:IsGreaterThan>
          <t:FieldURI FieldURI="item:DateTimeReceived" />
          <t:FieldURIOrConstant>
            <t:Constant Value="{since}" />
          </t:FieldURIOrConstant>
        </t:IsGreaterThan>
      </m:Restriction>
      <m:SortOrder>
        <t:FieldOrder Order="Descending">
          <t:FieldURI FieldURI="item:DateTimeReceived" />
        </t:FieldOrder>
      </m:SortOrder>
      <m:ParentFolderIds>
        <t:DistinguishedFolderId Id="inbox" />
      </m:ParentFolderIds>
    </m:FindItem>
  </soap:Body>
</soap:Envelope>
```

**Critical:** The element order inside `FindItem` is schema-enforced by EWS. Any deviation returns 400. The required order is exactly: `ItemShape` → `IndexedPageItemView` → `Restriction` → `SortOrder` → `ParentFolderIds`.

**Critical:** `AdditionalProperties` with `message:From` and `message:Sender` FieldURIs must be included inside `ItemShape`. Without them, `FindItem` does not return the `From` field even with `BaseShape=AllProperties` — this is an AWS WorkMail quirk, not standard EWS behaviour.

### 4.2 get_message — GetItem

```xml
<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages"
  xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types"
  xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Header>
    <t:RequestServerVersion Version="Exchange2007_SP1" />
  </soap:Header>
  <soap:Body>
    <m:GetItem>
      <m:ItemShape>
        <t:BaseShape>AllProperties</t:BaseShape>
        <t:IncludeMimeContent>false</t:IncludeMimeContent>
        <t:AdditionalProperties>
          <t:FieldURI FieldURI="item:Body" />
          <t:FieldURI FieldURI="message:From" />
          <t:FieldURI FieldURI="message:ToRecipients" />
          <t:FieldURI FieldURI="item:Subject" />
          <t:FieldURI FieldURI="item:DateTimeReceived" />
        </t:AdditionalProperties>
      </m:ItemShape>
      <m:ItemIds>
        <t:ItemId Id="{item_id}" />
      </m:ItemIds>
    </m:GetItem>
  </soap:Body>
</soap:Envelope>
```

### 4.3 send_email — CreateItem

```xml
<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages"
  xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types"
  xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Header>
    <t:RequestServerVersion Version="Exchange2007_SP1" />
  </soap:Header>
  <soap:Body>
    <m:CreateItem MessageDisposition="SendAndSaveCopy">
      <m:SavedItemFolderId>
        <t:DistinguishedFolderId Id="sentitems" />
      </m:SavedItemFolderId>
      <m:Items>
        <t:Message>
          <t:Subject>{subject}</t:Subject>
          <t:Body BodyType="HTML">{body}</t:Body>
          <t:ToRecipients>
            <t:Mailbox>
              <t:EmailAddress>{to}</t:EmailAddress>
            </t:Mailbox>
          </t:ToRecipients>
          {cc_block}
        </t:Message>
      </m:Items>
    </m:CreateItem>
  </soap:Body>
</soap:Envelope>
```

`{cc_block}` when cc is present:
```xml
<t:CcRecipients>
  <t:Mailbox>
    <t:EmailAddress>{cc}</t:EmailAddress>
  </t:Mailbox>
</t:CcRecipients>
```
Omit entirely when cc is None.

**Critical:** Use `t:EmailAddress` for recipient fields, not `t:Name`. Using `t:Name` causes `ErrorInvalidNameForNameResolution` from WorkMail.

### 4.4 reply — ReplyToItem

```xml
<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages"
  xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types"
  xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Header>
    <t:RequestServerVersion Version="Exchange2007_SP1" />
  </soap:Header>
  <soap:Body>
    <m:CreateItem MessageDisposition="SendAndSaveCopy">
      <m:Items>
        <t:ReplyToItem>
          <t:ReferenceItemId Id="{item_id}" />
          <t:NewBodyContent BodyType="HTML">{body}</t:NewBodyContent>
        </t:ReplyToItem>
      </m:Items>
    </m:CreateItem>
  </soap:Body>
</soap:Envelope>
```

---

## 5. EWS Response Parsing

Use Python's `xml.etree.ElementTree` or `lxml`. The following namespaces must be registered:

```python
NS = {
    'soap': 'http://schemas.xmlsoap.org/soap/envelope/',
    'm': 'http://schemas.microsoft.com/exchange/services/2006/messages',
    't': 'http://schemas.microsoft.com/exchange/services/2006/types',
}
```

### 5.1 Error checking (all responses)

Always check for EWS-level errors first regardless of HTTP status (EWS returns errors inside 200 responses):

```python
response_code = root.findtext('.//m:ResponseCode', namespaces=NS) \
             or root.findtext('.//ResponseCode', namespaces=NS)

if response_code and response_code != 'NoError':
    message_text = root.findtext('.//m:MessageText', namespaces=NS) \
                or root.findtext('.//MessageText', namespaces=NS) \
                or 'Unknown EWS error'
    return {"success": False, "error": response_code, "message": message_text}
```

### 5.2 list_inbox response

Detect by presence of `FindItemResponse` in the response XML.

For each `t:Message` element:

```python
messages = []
for msg in root.findall('.//t:Message', NS):
    item_id_el = msg.find('t:ItemId', NS)
    from_el    = msg.find('.//t:From/t:Mailbox', NS)
    messages.append({
        'item_id':    item_id_el.get('Id') if item_id_el is not None else None,
        'change_key': item_id_el.get('ChangeKey') if item_id_el is not None else None,
        'subject':    msg.findtext('t:Subject', namespaces=NS),
        'from':       from_el.findtext('t:EmailAddress', namespaces=NS) if from_el is not None else None,
        'from_name':  from_el.findtext('t:Name', namespaces=NS) if from_el is not None else None,
        'received':   msg.findtext('t:DateTimeReceived', namespaces=NS),
        'is_read':    msg.findtext('t:IsRead', namespaces=NS),
    })

return {"success": True, "count": len(messages), "messages": messages}
```

**Critical:** `t:From` contains `t:Mailbox` which contains `t:EmailAddress` and `t:Name`. Always navigate the full path `t:From/t:Mailbox/t:EmailAddress`. A direct search for `t:EmailAddress` will match other fields.

**Critical:** `t:IsRead` must be matched exactly. The response also contains `t:IsReadReceiptRequested` and `t:IsDeliveryReceiptRequested` — any substring-based extraction will pick up the wrong field. ElementTree's `findtext` with exact tag path avoids this.

### 5.3 get_message response

Detect by presence of `GetItemResponse`.

```python
msg = root.find('.//t:Message', NS)
from_el = root.find('.//t:From/t:Mailbox', NS)

return {
    "success":    True,
    "item_id":    root.find('.//t:ItemId', NS).get('Id'),
    "subject":    root.findtext('.//t:Subject', namespaces=NS),
    "from_email": from_el.findtext('t:EmailAddress', namespaces=NS) if from_el else None,
    "from_name":  from_el.findtext('t:Name', namespaces=NS) if from_el else None,
    "received":   root.findtext('.//t:DateTimeReceived', namespaces=NS),
    "body":       root.findtext('.//t:Body', namespaces=NS),
    "is_read":    root.findtext('.//t:IsRead', namespaces=NS),
}
```

Note: `t:Body` returns HTML-encoded content. This is correct and expected — do not decode it server-side.

### 5.4 send_email and reply responses

Detect by presence of `CreateItemResponse` or `ReplyToItemResponse`.

```python
return {"success": True, "operation": "created"}
```

---

## 6. Validation Rules

### 6.1 Account validation

```python
VALID_ACCOUNTS = {'sherpa', 'dinis'}

if account not in VALID_ACCOUNTS:
    raise HTTPException(
        status_code=400,
        detail=f"Invalid account '{account}'. Valid values: {', '.join(sorted(VALID_ACCOUNTS))}"
    )
```

### 6.2 Webhook secret

```python
if request.headers.get('X-Webhook-Secret') != settings.WEBHOOK_SECRET:
    raise HTTPException(status_code=401, detail="Unauthorized")
```

Implement as a FastAPI dependency injected into all routes.

---

## 7. Environment Variables

| Variable | Description | Example |
|---|---|---|
| `WORKMAIL_REGION` | AWS region | `eu-west-1` |
| `WORKMAIL_SHERPA_AUTH` | Base64 of `sherpa.explorer@sgraph.ai:password` | `c2hlcnBh...` |
| `WORKMAIL_DINIS_AUTH` | Base64 of `dinis.cruz@sgraph.ai:password` | `ZGluaXMu...` |
| `WEBHOOK_SECRET` | Shared secret for `X-Webhook-Secret` header | `<your-secret>` |

Add new accounts by adding a new env var and registering it:

```python
ACCOUNTS = {
    'sherpa': os.environ['WORKMAIL_SHERPA_AUTH'],
    'dinis':  os.environ['WORKMAIL_DINIS_AUTH'],
}
```

---

## 8. Recommended Project Structure

```
workmail_service/
├── main.py              # FastAPI app, route definitions
├── ews.py               # EWS HTTP client — builds SOAP, calls endpoint, returns raw XML
├── parser.py            # XML response parser — converts raw XML to dicts
├── models.py            # Pydantic request/response models
├── auth.py              # Webhook secret dependency
├── config.py            # Settings from env vars (pydantic BaseSettings)
└── requirements.txt
```

**Key dependencies:**
```
fastapi
uvicorn
httpx          # async HTTP client for EWS calls
lxml           # XML parsing (or use stdlib xml.etree.ElementTree)
pydantic-settings
python-dotenv
```

---

## 9. EWS HTTP Client Notes

- Use `httpx.AsyncClient` for async FastAPI compatibility
- Set a reasonable timeout — EWS can be slow: `timeout=30.0`
- EWS always returns HTTP 200 even for errors — check the SOAP body for `ResponseCode`
- The response body is always XML, never JSON
- No SOAPAction header needed — WorkMail EWS does not require it (sending `""` as a literal string causes errors)

```python
async def call_ews(auth_header: str, soap_body: str) -> str:
    url = f"https://ews.mail.{settings.WORKMAIL_REGION}.awsapps.com/EWS/Exchange.asmx"
    headers = {
        "Content-Type": "text/xml; charset=utf-8",
        "Authorization": f"Basic {auth_header}",
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(url, content=soap_body, headers=headers)
        response.raise_for_status()
        return response.text
```

---

## 10. Example curl calls (for testing)

```bash
# List Sherpa's inbox
curl -X POST http://localhost:8000/workmail/sherpa/list_inbox \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: <secret>" \
  -d '{"limit": 5}'

# List Dinis's inbox (last 48h)
curl -X POST http://localhost:8000/workmail/dinis/list_inbox \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: <secret>" \
  -d '{"limit": 10, "since": "2026-02-25T00:00:00Z"}'

# Get full message
curl -X POST http://localhost:8000/workmail/sherpa/get_message \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: <secret>" \
  -d '{"item_id": "<EWS_ITEM_ID>"}'

# Send email
curl -X POST http://localhost:8000/workmail/sherpa/send_email \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: <secret>" \
  -d '{"to": "recipient@example.com", "subject": "Hello", "body": "Message body"}'

# Reply to message
curl -X POST http://localhost:8000/workmail/sherpa/reply \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: <secret>" \
  -d '{"item_id": "<EWS_ITEM_ID>", "body": "Reply text"}'

# Invalid account → 400
curl -X POST http://localhost:8000/workmail/hacker/list_inbox \
  -H "X-Webhook-Secret: <secret>" \
  -d '{}'
```

---

## 11. Known EWS Gotchas

These are issues discovered during the n8n implementation that apply equally to the Python version:

1. **`FindItem` does not return `From` without `AdditionalProperties`** — `BaseShape=AllProperties` is misleading. You must explicitly request `message:From` and `message:Sender` via `AdditionalProperties` or the From field will be absent from all responses.

2. **`FindItem` element order is strictly enforced** — EWS returns 400 if children are out of order. Required order: `ItemShape` → `IndexedPageItemView` → `Restriction` → `SortOrder` → `ParentFolderIds`. No exceptions.

3. **`t:IsRead` vs `t:IsReadReceiptRequested`** — these share a tag name prefix. Always use exact XPath navigation, never substring search.

4. **`t:From` nesting** — the path is `t:From/t:Mailbox/t:EmailAddress`, not `t:EmailAddress` directly. A shallow search for `t:EmailAddress` may match `t:ToRecipients` or other address fields instead.

5. **HTTP 200 on EWS errors** — EWS returns HTTP 200 for application-level errors like `ErrorInvalidIdEmpty` or `ErrorInvalidNameForNameResolution`. Always check `ResponseCode` in the SOAP body, not just the HTTP status code.

6. **Wrong password returns 401 with NTLM challenge** — easy to distinguish from a 400 (schema/content error). If you see `WWW-Authenticate: NTLM` in the response headers, the credential is wrong.

7. **`MessageDisposition="SendAndSaveCopy"`** — both send_email and reply use this. It sends the message AND saves a copy to Sent Items. Using `SendOnly` will send but not save — use `SendAndSaveCopy`.

---

*Specification extracted from production n8n workflow — 27 February 2026*
