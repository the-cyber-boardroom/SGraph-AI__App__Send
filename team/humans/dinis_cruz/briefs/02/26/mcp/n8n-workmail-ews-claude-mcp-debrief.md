# Technical Debrief: n8n + AWS WorkMail EWS + Claude MCP Integration

**Date:** 26 February 2026  
**Project:** Sherpa Agent Infrastructure — sgraph.ai  
**Session duration:** ~2 hours  
**Outcome:** Full autonomous agent email loop operational ✅

---

## 1. Executive Summary

This document captures the end-to-end implementation of a Claude AI agent capable of autonomously reading, composing, and sending emails via AWS WorkMail — using n8n as the orchestration middleware and the Anthropic MCP protocol as the agent interface.

**The full stack:**

```
Claude (claude.ai) → n8n MCP Connector → n8n Cloud Workflow
  → Webhook Trigger → Switch Node → EWS HTTP Request Node
  → SOAP/XML → AWS WorkMail (eu-west-1) → External Inbox
```

By the end of the session, Claude was autonomously calling `list_inbox`, reading the full message body with `get_message`, and offering to send replies — all without any manual intervention, directly from a claude.ai conversation.

---

## 2. Architecture

### 2.1 Component Stack

| Component | Value |
|---|---|
| AI Orchestrator | Claude (claude.ai web) via n8n MCP connector |
| Workflow Engine | n8n Cloud |
| Email Platform | AWS WorkMail, eu-west-1 region |
| Email Domain | sgraph.ai (Route 53 verified) |
| Protocol | EWS (Exchange Web Services) SOAP over HTTPS |
| EWS Endpoint | `https://ews.mail.eu-west-1.awsapps.com/EWS/Exchange.asmx` |
| EWS Schema | `Exchange2007_SP1` (request) / `Exchange2010_SP2` (response) |
| n8n Webhook URL | `https://<your-instance>.app.n8n.cloud/webhook/workmail` |
| n8n MCP Server URL | `https://<your-instance>.app.n8n.cloud/mcp-server/http` |
| Webhook Auth | `X-Webhook-Secret: <your-secret>` |
| EWS Auth | HTTP Basic Auth — n8n Generic credential |
| MCP Auth | OAuth via official n8n connector (n8n GmbH) |

### 2.2 n8n Workflow Structure

Workflow ID: `<your-workflow-id>`  
Workflow Name: `SG/Send - Sherpa workmail`

**Nodes:**

1. **Webhook Trigger** — POST endpoint, Header Auth enforced
2. **Route by Operation** (Switch node) — routes to one of 4 branches
3. **EWS: List Inbox** — `FindItem` SOAP, returns message summaries
4. **EWS: Get Message** — `GetItem` SOAP, returns full message + body
5. **EWS: Send Email** — `CreateItem` SOAP, `MessageDisposition="SendAndSaveCopy"`
6. **EWS: Reply to Message** — `ReplyToItem` SOAP, threaded reply
7. **Parse EWS XML Response** (Code node) — converts SOAP/XML to clean JSON
8. **Respond to Webhook** — returns JSON to caller

### 2.3 Supported Operations

```bash
# List inbox (last 24h by default)
curl -X POST https://<your-instance>.app.n8n.cloud/webhook/workmail \
  -H "X-Webhook-Secret: <your-secret>" \
  -d '{"operation": "list_inbox", "limit": 5}'

# Get full message
curl -X POST https://<your-instance>.app.n8n.cloud/webhook/workmail \
  -H "X-Webhook-Secret: <your-secret>" \
  -d '{"operation": "get_message", "item_id": "<EWS_ITEM_ID>"}'

# Send email
curl -X POST https://<your-instance>.app.n8n.cloud/webhook/workmail \
  -H "X-Webhook-Secret: <your-secret>" \
  -d '{"operation": "send_email", "to": "user@example.com", "subject": "Hello", "body": "Message body"}'

# Reply to message
curl -X POST https://<your-instance>.app.n8n.cloud/webhook/workmail \
  -H "X-Webhook-Secret: <your-secret>" \
  -d '{"operation": "reply", "item_id": "<EWS_ITEM_ID>", "body": "Reply text"}'
```

---

## 3. Challenges Encountered and Fixed

Seven distinct bugs were identified and resolved during the session.

---

### Challenge 1: Switch Node Routing Failure

**Symptom:**
```
Cannot read properties of undefined (reading 'push')
```
Workflow crashed on every request before reaching any EWS node.

**Root Cause:**  
Two separate issues combined:

1. The Switch node's Output Index expression was referencing `$json.operation`, but n8n's Webhook trigger wraps the POST body under a `body` key, so the actual path is `$json.body.operation`.
2. The Switch node in Expression mode requires a **number** (0–3) as output, not a string like `"list_inbox"`.

**Fix:**  
Set the Output Index expression to:
```
{{ ['send_email','list_inbox','get_message','reply'].indexOf($json.body.operation) }}
```
This maps: `send_email` → 0, `list_inbox` → 1, `get_message` → 2, `reply` → 3. Returns -1 for unknown operations.

---

### Challenge 2: All SOAP Body Expressions Using Wrong JSON Path

**Symptom:**  
Each EWS node returned `ErrorInvalidIdEmpty` or similar — values were empty/undefined in the SOAP body.

**Root Cause:**  
Same `$json.body.*` issue as above, but across all four EWS nodes. The SOAP body templates were referencing `$json.limit`, `$json.since`, `$json.item_id`, `$json.subject`, `$json.body`, `$json.to`, `$json.cc` — all missing the `body.` prefix.

**Fix:**  
Updated every expression reference across all nodes:

| Old expression | Correct expression |
|---|---|
| `$json.operation` | `$json.body.operation` |
| `$json.limit` | `$json.body.limit` |
| `$json.since` | `$json.body.since` |
| `$json.item_id` | `$json.body.item_id` |
| `$json.subject` | `$json.body.subject` |
| `$json.body` (body text) | `$json.body.body` |
| `$json.to` | `$json.body.to` |
| `$json.cc` | `$json.body.cc` |

> **Note:** `$json.body.body` looks odd but is correct — the outer `body` is the webhook wrapper, the inner `body` is the email body field in the JSON payload.

---

### Challenge 3: EWS 400 Bad Request — SOAP Element Order

**Symptom:**
```json
{"errorMessage": "Bad request - please check your parameters", "httpCode": "400"}
```

**Root Cause:**  
WorkMail EWS enforces strict schema validation on element ordering within `FindItem`. The original SOAP had `SortOrder` before `IndexedPageItemView`, which violates the schema.

EWS schema requires this exact order inside `FindItem`:
1. `ItemShape`
2. `IndexedPageItemView`
3. `Restriction`
4. `SortOrder`
5. `ParentFolderIds`

**Fix:**  
Reordered the SOAP body to match the schema:

```xml
<m:FindItem Traversal="Shallow">
  <m:ItemShape>
    <t:BaseShape>AllProperties</t:BaseShape>
  </m:ItemShape>
  <m:IndexedPageItemView MaxEntriesReturned="{{ $json.body.limit ?? 20 }}" Offset="0" BasePoint="Beginning" />
  <m:Restriction>
    <t:IsGreaterThan>
      <t:FieldURI FieldURI="item:DateTimeReceived" />
      <t:FieldURIOrConstant>
        <t:Constant Value="{{ $json.body.since ?? new Date(Date.now() - 24*60*60*1000).toISOString() }}" />
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
```

---

### Challenge 4: `is_read` Field Leaking Raw XML

**Symptom:**  
The `is_read` field in the response contained raw XML instead of a clean boolean:
```
"is_read": "false</t:IsReadReceiptRequested><t:IsDeliveryReceiptRequested>false</t:IsDeliveryReceiptRequested><t:IsRead>true"
```

**Root Cause:**  
The `extractBetweenTags` helper function searched for `<t:IsRead` which matched `<t:IsReadReceiptRequested>` first (partial tag name match). The function did not verify that the tag name ended at a `>` or space boundary.

**Fix:**  
Added an exact tag boundary check to both `extractBetweenTags` and `extractAll`:

```javascript
function extractBetweenTags(xml, tag) {
  const closeTag = `</${tag}>`;
  let searchFrom = 0;
  while (true) {
    const start = xml.indexOf(`<${tag}`, searchFrom);
    if (start === -1) return null;
    const charAfter = xml[start + tag.length + 1];
    if (charAfter === '>' || charAfter === ' ') {
      const contentStart = xml.indexOf('>', start) + 1;
      const end = xml.indexOf(closeTag, contentStart);
      if (end === -1) return null;
      return xml.substring(contentStart, end).trim();
    }
    searchFrom = start + 1;
  }
}

function extractAll(xml, tag) {
  const results = [];
  let searchFrom = 0;
  while (true) {
    const start = xml.indexOf(`<${tag}`, searchFrom);
    if (start === -1) break;
    const charAfter = xml[start + tag.length + 1];
    if (charAfter !== '>' && charAfter !== ' ') {
      searchFrom = start + 1;
      continue;
    }
    const contentStart = xml.indexOf('>', start) + 1;
    const end = xml.indexOf(`</${tag}>`, contentStart);
    if (end === -1) break;
    results.push(xml.substring(contentStart, end).trim());
    searchFrom = end + `</${tag}>`.length;
  }
  return results;
}
```

**Result:** `"is_read": "true"` — clean.

---

### Challenge 5: `from` Field Always Null

**Symptom:**  
`"from": null` despite the email clearly having a sender.

**Root Cause (iteration 1):**  
The parser was calling `extractBetweenTags(block, 't:EmailAddress')` directly on the message block. EWS nests the from address as `t:From → t:Mailbox → t:EmailAddress`. The direct extraction matched a different `EmailAddress` field in the block (or none at all).

**First fix attempt:**
```javascript
from: (() => {
  const f = extractBetweenTags(block, 't:From');
  return f ? extractBetweenTags(f, 't:EmailAddress') : null;
})()
```
Still returned null.

**Root Cause (iteration 2):**  
WorkMail's `FindItem` response with `BaseShape=AllProperties` does **not** include the `t:From` element at all. It returns a limited field set for performance reasons. The `t:From` block simply wasn't present in the XML.

**Final Fix:**  
Added `AdditionalProperties` to the `ItemShape` in the `FindItem` SOAP request to explicitly request the `From` and `Sender` fields:

```xml
<m:ItemShape>
  <t:BaseShape>AllProperties</t:BaseShape>
  <t:AdditionalProperties>
    <t:FieldURI FieldURI="message:From" />
    <t:FieldURI FieldURI="message:Sender" />
  </t:AdditionalProperties>
</m:ItemShape>
```

And updated the parser to navigate the full nested structure:

```javascript
from: (() => {
  const f = extractBetweenTags(block, 't:From');
  if (!f) return null;
  const m = extractBetweenTags(f, 't:Mailbox');
  return m ? extractBetweenTags(m, 't:EmailAddress') : extractBetweenTags(f, 't:EmailAddress');
})(),
from_name: (() => {
  const f = extractBetweenTags(block, 't:From');
  if (!f) return null;
  const m = extractBetweenTags(f, 't:Mailbox');
  return m ? extractBetweenTags(m, 't:Name') : extractBetweenTags(f, 't:Name');
})(),
```

**Result:** `"from": "sender@example.com"`, `"from_name": "Sender Name"` — both clean.

---

### Challenge 6: `send_email` Returning `ErrorInvalidNameForNameResolution`

**Symptom:**
```json
{"error": "ErrorInvalidNameForNameResolution"}
```

**Root Cause:**  
Same `$json.body.*` prefix bug (Challenge 2), but specifically on the send_email node. The SOAP body was referencing `$json.subject`, `$json.body`, `$json.to` — all undefined because of the missing `body.` prefix. EWS received empty values and tried to resolve them as display names rather than SMTP addresses.

**Fix:**  
Applied the same `$json.body.*` prefix fix to all four fields in the send email SOAP body.

---

### Challenge 7: n8n Official MCP Connector OAuth Error on First Attempt

**Symptom:**  
Clicking "Connect" on the official n8n connector (by n8n GmbH) in Claude.ai produced an OAuth error code `83af799b663e86ee`.

**Root Cause:**  
Unknown — likely a transient OAuth handshake failure or state mismatch on first attempt.

**Fix:**  
Retried the OAuth flow a second time. It succeeded. No configuration change was needed.

> **Note:** The alternative custom connector approach (URL + Bearer token) was explored before the retry succeeded. The correct URL format would be `https://<your-instance>.app.n8n.cloud/mcp-server/http?token=<ACCESS_TOKEN>`. This is a useful fallback if OAuth continues to fail.

---

## 4. Final Validated State

### Operations Test Results

```
# list_inbox ✅
curl -X POST https://<your-instance>.app.n8n.cloud/webhook/workmail \
  -H "X-Webhook-Secret: <your-secret>" \
  -d '{"operation": "list_inbox", "limit": 5}'

Response:
{"success":true,"count":1,"messages":[{
  "item_id":"<EWS_ITEM_ID>",
  "subject":"Re: Hello from SG/Send Sherpa Agent",
  "from":"sender@example.com",
  "from_name":"Sender Name",
  "received":"2026-02-25T23:52:24Z",
  "is_read":"true"
}]}

# get_message ✅
→ Returns full HTML body: "Hello Sherpa, Good to see that you have an inbox now :)"

# send_email ✅
→ {"success":true,"operation":"created"}
→ Delivered to recipient@example.com
→ Headers: from: Sherpa Explorer <sherpa.explorer@sgraph.ai>
→ mailed-by: eu-west-1.amazonses.com | signed: sgraph.ai | TLS encrypted
→ Google flagged: "Important according to Google magic"

# reply ✅
→ {"success":true,"operation":"created"}
→ Delivered with correct threading (Re: subject, quoted original)
```

### Claude MCP Agent Loop (Demonstrated Live)

Claude was asked: _"can you list the emails in my inbox?"_

Claude autonomously:
1. Called `search_workflows` to discover available n8n workflows
2. Read the workflow description to understand available operations
3. Called `execute_workflow` with `list_inbox` payload
4. Parsed and summarised the result (1 email from Dinis Cruz)
5. Was asked "yes" to read the full body
6. Called `execute_workflow` with `get_message` and the item_id
7. Returned the full message content
8. Offered to compose and send a reply

---

## 5. XML Parser — Final Working Code

The complete `Parse EWS XML Response` Code node (key excerpts):

```javascript
function extractBetweenTags(xml, tag) {
  const closeTag = `</${tag}>`;
  let searchFrom = 0;
  while (true) {
    const start = xml.indexOf(`<${tag}`, searchFrom);
    if (start === -1) return null;
    const charAfter = xml[start + tag.length + 1];
    if (charAfter === '>' || charAfter === ' ') {
      const contentStart = xml.indexOf('>', start) + 1;
      const end = xml.indexOf(closeTag, contentStart);
      if (end === -1) return null;
      return xml.substring(contentStart, end).trim();
    }
    searchFrom = start + 1;
  }
}

// FindItem parser — from field with AdditionalProperties
from: (() => {
  const f = extractBetweenTags(block, 't:From');
  if (!f) return null;
  const m = extractBetweenTags(f, 't:Mailbox');
  return m ? extractBetweenTags(m, 't:EmailAddress') : extractBetweenTags(f, 't:EmailAddress');
})(),
from_name: (() => {
  const f = extractBetweenTags(block, 't:From');
  if (!f) return null;
  const m = extractBetweenTags(f, 't:Mailbox');
  return m ? extractBetweenTags(m, 't:Name') : extractBetweenTags(f, 't:Name');
})(),
```

---

## 6. Key Learnings

**1. n8n webhooks wrap the body.**  
All payload fields are at `$json.body.*`, not `$json.*`. This applies to every expression in every node downstream of a webhook trigger. It will catch you on every new workflow.

**2. EWS schema element order is strictly enforced.**  
`FindItem` children must be in schema order: `ItemShape` → `IndexedPageItemView` → `Restriction` → `SortOrder` → `ParentFolderIds`. Any deviation returns a generic 400 with no hint about which element is wrong.

**3. `FindItem` with `AllProperties` does not return `From`.**  
Despite the name, `AllProperties` is not all properties. `From` and `Sender` must be explicitly requested via `AdditionalProperties` / `FieldURI`. This is a well-known EWS gotcha that affects any inbox-listing implementation.

**4. Tag name matching in XML parsers requires exact boundaries.**  
`<t:IsRead>` and `<t:IsReadReceiptRequested>` share a prefix. Any `indexOf`-based parser must verify the character after the tag name is `>` or a space, not another letter. Generic regex or substring matching will silently extract the wrong element.

**5. EWS authentication errors are distinguishable.**  
Wrong password → `401 Unauthorized` with a specific NTLM challenge. Correct password with bad SOAP → `400 Bad Request`. These two error shapes make it fast to distinguish auth failures from schema/content errors.

**6. n8n's instance-level MCP works cleanly with Claude.ai.**  
The official n8n MCP connector (OAuth) exposes `search_workflows`, `get_workflow_details`, and `execute_workflow`. Claude can discover workflows by description, understand their capabilities, and call them with structured payloads — with no prompt engineering or manual tool definitions required on the Claude side.

**7. The MCP agent loop is genuinely autonomous.**  
Claude did not need to be told which tool to call, what parameters to pass, or how to interpret the response. Given a natural language request ("list my emails"), it reasoned through the full sequence of tool calls independently.

---

## 7. Pending Work

| Item | Priority | Notes |
|---|---|---|
| Create sherpa.villager@sgraph.ai | High | Pending WorkMail user creation |
| Create sherpa.townplanner@sgraph.ai | High | Pending WorkMail user creation |
| Per-identity n8n workflows | High | Each Sherpa role needs its own workflow with role-specific system prompt |
| HTML body decoding in parser | Medium | Body returned as HTML-encoded entities — needs unescape before display |
| MCP Server Trigger node | Low | Alternative to webhook for tighter Claude integration |
| SG/Send PDF filename fix | High | Pass `content_type_hint: "application/pdf"` in `transfers_create`; encrypt raw bytes (no JSON wrapper) |

---

## 8. Environment Reference

```
n8n Version:         2.9.4 (Cloud)
n8n Workflow ID:     <your-workflow-id>
WorkMail Region:     eu-west-1
WorkMail Org:        sgraph.ai
EWS Server Version:  Exchange2010_SP2 (reported by server)
EWS Request Version: Exchange2007_SP1
Node:                EWS: HTTP Request (n8n-nodes-base.httpRequest v4.2)
Claude Model:        Claude Sonnet 4.6 (claude.ai web)
MCP Connector:       n8n by n8n GmbH (official, OAuth)
Session Date:        26 February 2026, ~00:25–02:05 UTC
```

---

*Document generated from live session transcript — 26 February 2026*
