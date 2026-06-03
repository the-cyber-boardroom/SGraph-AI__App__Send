# Security finding — vault apps run same-origin, so the permission model is bypassable

**For:** Vault Web team + AppSec
**Date:** 2026-05-27
**Severity:** **Latent today, serious the moment any non-first-party vault app code can run.**
**Remedy:** the nested-kernel architecture in `SPEC-viv-nested-kernel-architecture.md` (same fix also enables vault-in-vault).

---

## The finding

Vault app code runs in an iframe that is **same-origin** with the kernel (`sandbox="allow-scripts allow-forms allow-same-origin"`, a real vault origin — confirmed live). Because the app frame shares the origin with the kernel, **app code can bypass the `sg.*` bridge entirely**:

- read the **vault key** and **access token** directly from `localStorage`;
- read/modify the DOM and globals of the kernel;
- reach `window.parent` / `window.top`.

The permission model (Phases 1–4B: `app.json` deny-by-default writes, the `EPROTECTED` floor on `.vault/**` and root `app.json`, `fs.*` / `vault.*` grants, `EPERM`/`ECONSENT` codes) is enforced **inside `sg.*`**. Untrusted code simply doesn't call `sg.*` — it reads the bytes and sets the commit header itself. So:

> The permission model is a real security boundary **only for cooperative code**. For uncooperative code in the same origin, it is advisory and fully bypassable.

A sharp example: the migration notes say `.vault/app.json` "is always denied" and may hold "an embedded access token." But the floor protects the *file path through the bridge* — it does **not** keep the secret away from same-origin app code, which can read the token from `localStorage` or the network layer without ever touching `sg.vfs`.

## Why it's the same root cause as vault-in-vault

The ViV problem ("a child vault app must not read the parent / sibling vaults") and this finding ("untrusted app code must not read its own origin's secrets / bypass `sg.*`") are the **same issue pointed in two directions**. Both exist because app code shares an origin — and thus secrets and session — with the kernel. Both are closed by the **same** change: run app code at a `null` origin with no ambient secrets, and give it a capability (`sg.*` RPC to a secret-holding kernel) instead of the credentials. See the spec.

## Threat model — when this bites

- **First-party only (today):** all vault app code is authored by the platform/first-party team. No adversary runs in the app frame, so the bypass is **latent** — a design constraint, not an active hole.
- **The day any of these is true, it is an active vulnerability:**
  - a vault hosts **customer- or third-party-authored** HTML app code;
  - a user can be induced to **open an untrusted shared vault** whose `app.json`/app code then runs;
  - app templates or snippets from an untrusted source execute in a vault context. In those cases the app code can exfiltrate the vault key + access token, and (if a parent vault is open) reach `window.parent` to read **another** vault's secrets — defeating the entire permission model and any cross-vault isolation.

## Recommendation

1. **Document the current trust assumption explicitly:** "vault apps are first-party and trusted; the permission model assumes cooperative app code." So nobody enables third-party apps without first closing this.
2. **Adopt the nested-kernel architecture** (`SPEC-viv-nested-kernel-architecture.md`), specifically the bridge split (§4e there): a secret-less `sg.*` stub in a `null`-origin app frame + a secret-holding kernel that runs the enforcing checks. Then the permission model becomes a real boundary (the only path to act on the vault is a message the kernel validates), and it holds even against untrusted app code.
3. **Treat this as the gating prerequisite for any "bring your own vault app" / third-party app roadmap.** It does not need to block first-party work today, but it must land before the platform accepts untrusted app code.

## Verified facts behind this finding

From `viv-crypto-lab.html` (a dev PoC page) and earlier cross-vault testing (real browser):
- Running app frame is a real vault origin, `allow-same-origin` present → same-origin with the kernel; parent/child can script each other.
- By contrast, a `null`-origin frame (`sandbox="allow-scripts"`, no `allow-same-origin`) **cannot** read its parent's document (`parentDocReadable:false`) and **cannot** access `localStorage` (`localStorageReadable:false`) — i.e. the isolation we need is achievable, and is exactly what the remedy uses.
