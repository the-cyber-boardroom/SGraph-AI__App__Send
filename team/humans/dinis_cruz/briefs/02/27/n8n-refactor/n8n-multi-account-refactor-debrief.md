# Technical Debrief: n8n Multi-Account Workflow Refactor

**Date:** 27 February 2026  
**Project:** Sherpa Agent Infrastructure — sgraph.ai  
**Session duration:** ~1 hour  
**Outcome:** Multi-account routing with input validation operational ✅

---

## 1. Why We Did This

The original workflow (`SG/Send - Sherpa workmail`) had the credential for `sherpa.explorer@sgraph.ai` hardcoded into the EWS nodes. It worked, but it had a fundamental scalability problem: **every account required a full duplicate of the entire workflow**.

As the Sherpa team grows (Explorer, Villager, Townplanner) and as more capability types are added (read-only, send, admin), the duplication matrix explodes:

```
Original model:
  3 accounts × 4 capability types = 12 workflows, all containing duplicate EWS logic
  Fix a parser bug → update it 12 times
```

The goal of the refactor was to reach a model where:
- **Account credentials live in exactly one place** — their own sub-workflow
- **EWS logic lives in exactly one place** — the capability workflow
- **Adding an account** = 1 new sub-workflow (2 nodes), 1 line change in the capability workflow
- **Adding a capability** = 1 new capability workflow (copy template, restrict operations)
- **Fixing a bug** = fix it once in the capability workflow

---

## 2. Architecture

### 2.1 Before

```
Claude (MCP) → SG/Send - Sherpa workmail
                 ↓
               [hardcoded Sherpa credential]
                 ↓
               EWS nodes → Parse → Respond
```

Single workflow, single account, credential baked in.

### 2.2 After

```
Claude (MCP)
  ↓
SG/Send - Sherpa workmail  (capability workflow, webhook trigger, MCP-exposed)
  ↓
Validate accounts (Code node)
  ↓
IF node
  ├── false → Respond to Webhook (400, error message)
  └── true →
        Switch (by account)
          ├── 0: sherpa → Execute Sub-workflow: workmail-sherpa-explorer
          │                    returns { auth_header, + all input fields }
          └── 1: dinis  → Execute Sub-workflow: workmail-dinis-cruz
                               returns { auth_header, + all input fields }
              ↓
        Route by Operation (Switch by operation)
          ├── 0: send_email → EWS: Send Email
          ├── 1: list_inbox → EWS: List Inbox
          ├── 2: get_message → EWS: Get Message
          └── 3: reply      → EWS: Reply to Message
              ↓
        Parse EWS XML Response
              ↓
        Respond to Webhook
```

**Account sub-workflows** (internal only, never MCP-exposed, 2 nodes each):
```
workmail-sherpa-explorer:
  Execute Sub-workflow Trigger → Edit Fields (adds auth_header, keeps all input)

workmail-dinis-cruz:
  Execute Sub-workflow Trigger → Edit Fields (adds auth_header, keeps all input)
```

### 2.3 New API Contract

All callers now pass `account` alongside `operation`:

```bash
# Sherpa's inbox
curl -X POST https://<your-instance>.app.n8n.cloud/webhook/workmail \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: <your-secret>" \
  -d '{"account": "sherpa", "operation": "list_inbox", "limit": 5}'

# Dinis's inbox
curl -X POST https://<your-instance>.app.n8n.cloud/webhook/workmail \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: <your-secret>" \
  -d '{"account": "dinis", "operation": "list_inbox", "limit": 5}'

# Invalid account → 400
curl ... -d '{"account": "hacker", "operation": "list_inbox"}'
→ {"valid":false,"error":"Invalid account 'hacker'. Valid values: sherpa, dinis"}
```

---

## 3. How Credentials Work Now

Credentials are no longer set in the EWS HTTP Request nodes. Instead:

1. Credentials are stored as **n8n Variables** (encrypted at rest):
   - `WORKMAIL_SHERPA_AUTH` = `base64("sherpa.explorer@sgraph.ai:password")`
   - `WORKMAIL_DINIS_AUTH` = `base64("dinis.cruz@sgraph.ai:password")`

2. Each account sub-workflow's **Edit Fields** node constructs the header:
   ```
   auth_header = "Basic {{ $vars.WORKMAIL_SHERPA_AUTH }}"
   ```

3. The **Edit Fields** node has `Include Other Input Fields = ON` — this means the sub-workflow output contains both the new `auth_header` field AND all the original request fields (`operation`, `item_id`, `subject`, etc.), merged into a single flat object.

4. All EWS HTTP Request nodes have:
   - **Authentication:** `None`
   - **Headers:** `Authorization: {{ $json.auth_header }}`

This means the EWS nodes are completely account-agnostic — they just use whatever `auth_header` was injected upstream.

---

## 4. Input Validation Layer

A **Code node** (`Check valid accounts`) sits immediately after the Webhook trigger, before any routing:

```javascript
const validAccounts = ['sherpa', 'dinis'];
const account = $json.body.account;

if (!account || !validAccounts.includes(account)) {
  return [{
    json: {
      valid: false,
      error: `Invalid account '${account}'. Valid values: ${validAccounts.join(', ')}`
    }
  }];
}

return [{ json: { ...$json, valid: true } }];
```

An **IF node** then branches on `{{ $json.valid }}`:
- **true** → proceeds to account Switch
- **false** → Respond to Webhook (400)

### Why this approach (not a Switch fallback)

The obvious approach was to use n8n's built-in Switch fallback output (`Continue (using error output)`). This works, but:
- The error message is whatever n8n generates — not controllable
- No clean 400 status code
- No structured JSON error body

The Code + IF pattern gives full control over the error response and is the **natural foundation for the authorization layer** planned later — caller identity checks, operation allowlists, and role-based access all slot in here.

---

## 5. Challenges Encountered

### Challenge 1: `$json.body.*` vs `$json.*` — again

After the sub-workflow executes and merges the payload, the data is flattened into `$json.*`. But the **account Switch** runs *before* the sub-workflow, while data is still wrapped under `$json.body.*`.

This meant:
- Account Switch: `$json.body.account` ✅
- Route by Operation Switch: `$json.body.operation` ✅ (also before sub-workflow flattening)
- EWS nodes: `$json.operation`, `$json.item_id`, etc. ✅ (after sub-workflow, now flat)

The rule: **anything before the Execute Sub-workflow nodes uses `$json.body.*`, anything after uses `$json.*`**.

### Challenge 2: `Include Other Input Fields` not toggled on

The Edit Fields (Set) node in the sub-workflow initially only output `auth_header` — dropping `operation`, `item_id`, and everything else. The EWS nodes downstream received a payload with only an auth header and nothing to work with.

Fix: toggle **Include Other Input Fields → All** in the Edit Fields node. This merges the new field into the existing item rather than replacing it.

### Challenge 3: Switch node `-1` output error

When an unknown `account` value was passed (e.g. `"abc"`), the Switch expression returned `-1` (no match), which n8n treats as a hard error:

```
Problem in node 'Switch'
The output -1 is not allowed
```

Three options were considered:
1. **Switch fallback output** (`Continue (using error output)`) — quick fix, limited control
2. **`throw` in Code node** — works but n8n truncates and modifies the error message, appending `[line N]`
3. **Code node + IF node** — full control over response format ✅ (chosen)

### Challenge 4: Workflows not published

Both sub-workflows were configured but not published. The main workflow was calling unpublished sub-workflows, so routing appeared to work (no crash) but both accounts resolved to Sherpa — because n8n fell back to the last published state.

Fix: publish sub-workflows first, then publish the main workflow.

---

## 6. Final Node Inventory

### `SG/Send - Sherpa workmail` (capability workflow, MCP-exposed)

| Node | Type | Purpose |
|---|---|---|
| MCP / Webhook Trigger | Webhook | Entry point for Claude and curl callers |
| Check valid accounts | Code | Validates `account` field, builds `valid` flag |
| If | IF | Routes valid vs invalid requests |
| Switch (account) | Switch | Routes to correct account sub-workflow |
| Call 'workmail-sherpa-explorer' | Execute Sub-workflow | Injects Sherpa auth header |
| Call 'workmail-dinis-cruz' | Execute Sub-workflow | Injects Dinis auth header |
| Route by Operation | Switch | Routes to correct EWS operation |
| EWS: Send Email | HTTP Request | CreateItem SOAP |
| EWS: List Inbox | HTTP Request | FindItem SOAP |
| EWS: Get Message | HTTP Request | GetItem SOAP |
| EWS: Reply to Message | HTTP Request | ReplyToItem SOAP |
| Parse EWS XML Response | Code | Converts SOAP/XML to clean JSON |
| Respond to Webhook | Respond | Returns JSON to caller |

### `workmail-sherpa-explorer` (account sub-workflow, internal only)

| Node | Type | Purpose |
|---|---|---|
| Execute Sub-workflow Trigger | Trigger | Receives call from parent workflow |
| Edit Fields | Set | Adds `auth_header`, keeps all input fields |

### `workmail-dinis-cruz` (account sub-workflow, internal only)

Identical structure to `workmail-sherpa-explorer`, different variable reference.

---

## 7. Adding New Accounts (Runbook)

1. Generate base64 credential:
   ```bash
   echo -n "villager@sgraph.ai:password" | base64
   ```

2. Add n8n Variable: `WORKMAIL_VILLAGER_AUTH` = `<base64 output>`

3. Duplicate `workmail-sherpa-explorer` → rename to `workmail-villager`

4. In the Edit Fields node, change value to `Basic {{ $vars.WORKMAIL_VILLAGER_AUTH }}`

5. Publish `workmail-villager`

6. In `SG/Send - Sherpa workmail`:
   - Add `'villager'` to the validAccounts array in the Code node
   - Add output 2 to the account Switch: expression adds `villager` at index 2
   - Add Execute Sub-workflow node pointing at `workmail-villager`, wire from Switch output 2

7. Publish main workflow

**What does NOT change:** EWS nodes, XML parser, Route by Operation Switch, Respond to Webhook.

---

## 8. Adding New Capability Workflows (Runbook)

Example: `workmail-readonly`

1. Duplicate `SG/Send - Sherpa workmail`

2. Rename to `workmail-readonly`

3. In Route by Operation Switch: remove `send_email` and `reply` outputs entirely (only keep `list_inbox` and `get_message`)

4. Delete the EWS: Send Email and EWS: Reply to Message nodes

5. Add any additional auth checks in the Code node (e.g. allowlist of caller identities)

6. Enable in **n8n Instance-level MCP settings** with a description scoped to read-only:
   > "Read-only WorkMail access. Supports list_inbox and get_message only. Pass account (sherpa|dinis) and operation."

7. Claude now has two distinct MCP tools and will pick the right one based on context

**What does NOT change:** account sub-workflows, credentials, variables.

---

## 9. Planned Authorization Layer

The Code node at the top of each capability workflow is the natural insertion point:

```javascript
// Future: full auth check
const validAccounts = ['sherpa', 'dinis'];
const allowedCallers = ['claude-mcp', 'internal-scheduler'];

const account = $json.body.account;
const callerId = $json.body.caller_id;        // future field
const operation = $json.body.operation;

// Validate caller
if (!allowedCallers.includes(callerId)) {
  return [{ json: { valid: false, error: 'Unauthorized caller' } }];
}

// Validate account
if (!validAccounts.includes(account)) {
  return [{ json: { valid: false, error: `Invalid account '${account}'` } }];
}

// workmail-readonly: validate operation scope
const allowedOps = ['list_inbox', 'get_message'];
if (!allowedOps.includes(operation)) {
  return [{ json: { valid: false, error: `Operation '${operation}' not allowed on this endpoint` } }];
}

return [{ json: { ...$json, valid: true } }];
```

Each capability workflow enforces its own scope independently.

---

## 10. Environment Reference

```
n8n Version:              2.9.4 (Cloud)
Main workflow:            SG/Send - Sherpa workmail
Account sub-workflows:    workmail-sherpa-explorer, workmail-dinis-cruz
Project:                  SG/Send - Claude MCP
WorkMail accounts active: sherpa.explorer@sgraph.ai, dinis.cruz@sgraph.ai
Credential storage:       n8n Variables (encrypted at rest)
EWS auth method:          Manual Authorization header (Basic base64)
Session date:             27 February 2026
```

---

*Document generated from live session — 27 February 2026*
