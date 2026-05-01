# Identity — Proposed Items Index

**Domain:** identity/proposed/ | **Last updated:** 2026-04-28 | **Maintained by:** Librarian (daily run)

All items below are PROPOSED. None have been code-verified. Do not describe any of these as existing features.

Full content for each item is in the archived monolith: `../v0.16.26__what-exists-today.md` (sections noted).

---

## OAuth and Social Login

| Feature | One-Line Description | Monolith Section / Doc |
|---------|---------------------|----------------------|
| Google OAuth integration | Social login for Google users; vault key stored in Google app:data | Section 31, doc 317 |
| `sg1.` prefix on stored credential | Namespace prefix for vault keys stored in credential stores | Open decision #15 |
| Google OAuth client ID across multiple domains | Single OAuth client ID working across send.sgraph.ai and tools.sgraph.ai | Open decision #22 |
| Auth MVP — social login + vault key storage | Minimal viable auth: social login → vault key persisted | doc 291 |

## Per-User Vaults and Credits

| Feature | One-Line Description | Monolith Section / Doc |
|---------|---------------------|----------------------|
| Per-user encrypted vault | One vault per user storing files, usage stats, settings, generation history | Section 20, doc 214 |
| User vault creation flow | Simple token, user-controlled encryption, "save this token" warning UX | Section 20, doc 214 |
| "My Workspace" / "My Account" page | Vault viewer, API key stats, access token management, shared files | Section 20, doc 214 |
| OpenRouter API key provisioning | Programmatic creation with £5 credit cap per user | Section 20, doc 214 |
| Per-key credit limits | Set and manage spending cap per user OpenRouter key | Section 20, doc 214 |
| Admin UI: OpenRouter key management | Create, view, top up, revoke keys from admin console | Section 20, doc 214 |
| £5 credit outreach | First batch issued to all Early Access + paying users (~50) | Section 20, doc 214 |
| Usage monitoring | Track credit burn rate and which tools are used | Section 20, doc 214 |
| Profile page + credit activation | Profile UI built on `<sg-vault-picker>` (open decision #1 resolved) | Open decision #1 |

## Billing Automation

| Feature | One-Line Description | Monolith Section / Doc |
|---------|---------------------|----------------------|
| Stripe webhook for auto-token creation | Auto-create access token when Stripe payment confirmed | Section 6 (DOES NOT EXIST) |
| Credit expiry period | Determine whether credits expire after 1 month or 3 months | Open decision #23 |
| Dynamic credit allocation | Gatekeeper agent state machine for allocating credits based on usage | Section 16 |
| LLM 25% markup pricing | OpenRouter token pricing with 25% SG/Send markup | Section 16 |

## Free Tier Identity

| Feature | One-Line Description | Monolith Section / Doc |
|---------|---------------------|----------------------|
| Browser fingerprinting | Anonymous device fingerprint for free tier credit allocation | Section 16 |
| 5 credits/day per fingerprint | Free tier: 5 credits daily per device fingerprint | Section 16 |
| Free tier: 5 transfers/day | Volume limit for unauthenticated users (no code) | Section 6 |

## Secrets Management

| Feature | One-Line Description | Monolith Section / Doc |
|---------|---------------------|----------------------|
| Secrets manager integration | AWS Secrets Manager or equivalent for storing sensitive credentials | doc 320 |
| Secure API key sharing via vault PKI | Encrypt API keys for a specific reader using their PKI public key | Section 16 |
| OpenRouter token provisioning via PKI | Agent receives OpenRouter token encrypted for their public key | Section 16 |
| `sg-send-cli secrets store/get/list/delete` | OS keychain integration for CLI credential storage | Section 6 |

## Email and Outreach

| Feature | One-Line Description | Monolith Section / Doc |
|---------|---------------------|----------------------|
| Sherpa CLI | Email campaigns and WorkMail integration for outreach workflows | Section 16 |
| Move from WorkMail to SES | Replace WorkMail sending with Amazon SES | Section 16 |
| Email pipeline: Composer→Reviewer→Sender | Three-agent email pipeline for outbound communications | Section 16 |

---

*Full content for all items: `../v0.16.26__what-exists-today.md` (Sections 6, 16, 20, 31)*
