# SG/Send Beta Invite Email — Operational Debrief

## Purpose
This document captures the full working setup for sending SG/Send early access beta invite emails via Claude + n8n + AWS WorkMail EWS. Use it to resume sending in a new Claude session.

---

## Architecture Overview

```
Claude (composes HTML email)
  → n8n workflow (webhook trigger)
    → Sub-workflow (workmail-sherpa-explorer)
      → AWS WorkMail EWS API (SOAP/XML CreateItem)
        → Email delivered from sherpa.explorer@sgraph.ai
```

## n8n Workflow Details

### Main Workflow: "SG/Send - Sherpa workmail"
- **Workflow ID**: `LNTb1Smmt91x8iGn`
- **Trigger**: Webhook (POST)
- **Flow**: Webhook Trigger → Check valid accounts → If error → Switch (by account) → Call sub-workflow → Route by Operation → EWS: Send Email → Parse XML → Respond

### Sub-workflow: workmail-sherpa-explorer
- **Workflow ID**: `tgXsmcudgccn75r9`
- **Purpose**: Injects auth credentials for the sherpa.explorer@sgraph.ai WorkMail account

### Sub-workflow: workmail-dinis-cruz
- **Workflow ID**: `h4KiR3YEKjiDMshO`
- **Purpose**: Injects auth credentials for dinis.cruz@sgraph.ai (not used for beta sends)

## How to Send an Email

Use the `n8n:execute_workflow` tool with this payload structure:

```json
{
  "workflowId": "LNTb1Smmt91x8iGn",
  "inputs": {
    "type": "webhook",
    "webhookData": {
      "method": "POST",
      "body": {
        "operation": "send_email",
        "account": "sherpa",
        "to": "recipient@example.com",
        "cc": "dinis.cruz@sgraph.ai",
        "subject": "You're in — your SG/Send early access is ready",
        "body": "<FULL HTML EMAIL STRING HERE>"
      }
    }
  }
}
```

### Key Parameters
- **account**: Always `"sherpa"` — routes to sherpa.explorer@sgraph.ai
- **cc**: Always `"dinis.cruz@sgraph.ai"` — project lead gets a copy
- **subject**: `"You're in — your SG/Send early access is ready"`
- **body**: Full HTML email as a single string (all quotes escaped)

### Sender Identity
- **From**: `Sherpa @ SG/Send <sherpa.explorer@sgraph.ai>`
- Display name was updated in AWS WorkMail admin console from "Sherpa Explorer" to "Sherpa @ SG/Send"

## Email Template Spec (v0.7.2 final, 700px)

### Design
- **Width**: 700px (confirmed optimal after testing 580→660→700)
- **Background**: #12121F (dark)
- **Card**: #1A1A2E with 12px border-radius, 1px border rgba(78,205,196,0.12)
- **Accent**: #4ECDC4 (teal)
- **Text**: #E0E0E0 (primary), #8892A0 (secondary)
- **Code/highlight bg**: #16213E
- **Font**: 'Helvetica Neue', Helvetica, Arial, sans-serif

### Structure (top to bottom)
1. **Header**: SG/Send logo text + "Zero-knowledge encrypted file sharing" tagline
2. **Greeting**: "Hi {FirstName}," (or "Hi there," if no name available)
3. **Intro paragraph**: Sherpa introduces itself as an AI agent, mentions waitlist signup
4. **Dinis CC note**: Italic grey text noting project lead is CC'd
5. **"What is SG/Send?"** section: Zero-knowledge encryption explainer
6. **Access code box**: Dark card with `eap-feb-w4` in large monospace teal
7. **CTA button**: "Get Started →" linking to https://send.sgraph.ai
8. **"Built by an agentic team"** section: Explains AI+human team, links to Sherpa role def + GitHub repo
9. **"Messages from the team"** — 3 agent voice cards:
   - **The Ambassador** (Growth & Community) — encourages word-of-mouth
   - **The Librarian** (Knowledge & Documentation) — points to repo docs
   - **The Dev** (Implementation & Code Quality) — mentions 393 tests, AES-256-GCM, asks for bug reports
   - Each card has a left teal border, role name, description, and link to their ROLE.md
10. **Closing**: "Reply to this email" CTA
11. **Footer**: SG/Send branding, send.sgraph.ai + GitHub links, getLaunch attribution, unsubscribe line

### Unsubscribe Footer Text
> "If you'd prefer not to receive emails like this, simply reply with "unsubscribe" and we'll remove you from future mailings."

### Personalization
- When a first name is known, use `Hi {FirstName},`
- When only a handle/alias is given (like "dalini"), fall back to `Hi there,`
- The only thing that changes per recipient is the greeting and the `to` field

## Access Code
- **Code**: `eap-feb-w4`
- Same code for all recipients in this batch

## Success Verification
A successful send returns EWS XML with:
```xml
<m:CreateItemResponseMessage ResponseClass="Success">
  <m:ResponseCode>NoError</m:ResponseCode>
</m:CreateItemResponseMessage>
```

The n8n workflow parses this and returns `{"success": true, "operation": "created"}`.

## Important Notes for Next Session

1. **HTML escaping**: The email body must be a single HTML string with all internal quotes escaped. The template is large (~15KB). Copy it exactly from a previous successful send.

2. **No template file needed**: The full HTML is passed inline in the webhook body. There's no stored template — Claude constructs the payload each time.

3. **Rate**: Send one at a time. No batching support in the workflow.

4. **CC always included**: dinis.cruz@sgraph.ai is always CC'd.

5. **Transcript location**: Full conversation history including all HTML source is at `/mnt/transcripts/2026-02-27-03-09-41-beta-email-almeida-send.txt`

6. **The email HTML is identical for all recipients** except for the greeting line. To send to a new recipient, just swap the `to` field and the greeting in the HTML body.

## Quick-Start for New Session

Tell Claude:
> "I need to send more SG/Send beta invite emails. Read the debrief at `/mnt/user-data/uploads/sg-send-beta-email-debrief.md` for full context. Here are the next recipients: ..."

Claude should:
1. Read this debrief
2. Use the HTML template from the last successful send (grab from transcript if needed)
3. Swap the greeting and `to` field for each recipient
4. Execute via `n8n:execute_workflow` with workflow ID `LNTb1Smmt91x8iGn`
5. Confirm `NoError` response for each
