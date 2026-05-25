# 09 — Security Review: Controlled Exposure

**version** v0.27.62
**date** 25 May 2026
**from** Architect (security pass; AppSec/Security role to ratify)
**to** Security, Developer (lead), Dinis
**source** brief risks R1–R4 · docs 02, 03 · code-verified `__Send` crypto + transfer service

The whole feature is an *intentional, opt-in exposure*. This review proves the exposure is bounded to exactly what the owner chose and cannot reach the real vault — and flags the one new risk that DELETE-being-real introduces.

---

## Threat model in one line

The public-vault-about-key is **public by design** (URLs, logs). The question is not "can it be guessed" but "**does possessing the public string reach anything the owner did not intend to expose**" — the real vault's contents/keys, or the ability to **modify** the public preview.

---

## R1 — It deliberately creates an exposure

**Assessment.** Intended behaviour, not a defect. Bounded by three properties: **opt-in** (no preview unless published; default nothing public — R2); **scoped** (the leaked key decrypts only the preview blob — R3); **reversible** (owner delete + native expiry — `Transfer__Service` `delete`/`expires_at`/`max_downloads`).
**Verdict: GO.** The exposure is the feature; it is bounded, opt-in, and reversible.

---

## R2 — Users might expose more than intended

**Failure modes:** human over-share; machine leak of a key into the public JSON.
**Mitigations.** Default nothing public (editor opens empty/disabled). **Field-name guard:** `validatePreview()` and the editor reject any field literally named `write_key` / `read_key` / `passphrase` anywhere in the JSON; publish is blocked if found. (Note: unlike the upstream pack, there is **no `sg-vault-manifest` guard to reuse here** — build the scan inline, doc 06 §G.) Explicit "THIS WILL BE PUBLIC" confirmation echoing the rendered card. The read path is decrypt-only and cannot write back.
**Verdict: GO** with the confirmation + field-name guard as required acceptance items.

---

## R3 — The deterministic derivation must be sound (read-only, public-layer only)

**Proof the read-only key cannot reach real vault contents:**
1. **Different secret.** The vault `read_key` is `PBKDF2(passphrase, salt='sg-vault-v1:<id>')` — input is a **secret passphrase**. The public-preview key is `PBKDF2(publicId, salt='sgraph-public-preview-v1')` — input is a **public string**. PBKDF2 is one-way; the public string is not the passphrase and cannot derive it.
2. **Different salt + id namespace.** The public-preview PBKDF2 salt and the `pvp-transfer-v1:` id prefix differ from the vault stack (`sg-vault-v1:<id>`, `sg-vault-v1:write:<id>`) and from Simple Tokens (`sgraph-send-v1`, bare-SHA-256 id). Outputs are cryptographically unrelated; even a public-id with the same text as a Simple Token maps to a **different** transfer-id.
3. **Decrypt-only import.** The read path imports the key `['decrypt']` only — it cannot encrypt.
4. **No write material in the read path.** `derivePublicPreviewKeys` returns no write key and no `delete_auth` (doc 03 §1.2). The real vault key arrives only via the independent `#<vault-key>` fragment, never in a server-visible URL.
5. **Separate blob.** The preview is a separate transfer from the vault's objects; decrypting it yields only the preview JSON.

**Verdict: GO.** Security to ratify the constants and run a **known-answer test**: confirm the public-preview key bytes and transfer-id differ from the vault read key and the Simple-Token key for the same input string.

---

## R4 — Server-side rendering (OG meta) has performance / exposure implications

**Exposure.** The in-repo OG-render route reads the **same already-public transfer** with the **same public-derived read-only key** the browser would use, and injects OG tags. It stores nothing new (correction 1 preserved) and never touches vault contents — the public-id was already public.
**Performance.** One transfer fetch + one AES-GCM decrypt per cold request, cacheable by public-id (TTL ≈ preview expiry). Measure and record (doc 08 Q-meta).
**Mitigations.** Cache by public-id; cap thumbnail size so the decrypt is cheap; **fail closed** (serve the plain shell, never vault data) on any error. Reject static prerender (conflicts with no-build-step + dynamic ids + edits).
**Verdict: GO** for the in-repo Lambda OG route, CONDITIONAL on DevOps publishing a latency measurement. NO-GO on static prerender.

---

## Added risks (found during design)

### R-leak — Public-id in URL/logs: blast radius
**Blast radius = exactly the preview blob.** Anyone with the public-id (log reader, referrer recipient, link finder) can render the preview — the intent. They get **no** vault contents (R3) and **no** ability to modify the preview (read key is decrypt-only; delete requires the random `delete_auth` held only in the owner vault — R-deface).
**Mitigations.** The real vault key stays in the `#` fragment only (never sent/logged). Document to owners that the public-id is genuinely public. Expiry bounds the window.
**Verdict: GO.** Blast radius is the preview only, by design.

### R-deface — Modifying the public preview (the key gate, given DELETE is real)
**Risk.** DELETE **exists** in this repo. If `delete_auth` were **derived from the public string**, anyone holding the public-id could delete the preview and recreate it with their own content — defacement / phishing under the owner's link. (This is the real-world version of the upstream pack's "R-mutable" — except DELETE is not hypothetical here, so the gate is mandatory.)
**Mitigation (hard requirement).** `delete_auth` is a **random 32-byte secret generated at publish time and stored only inside the owner's encrypted vault** (doc 03 §3.3, §4). The server stores only `SHA-256(delete_auth)`. The public string yields no delete capability. **Never** derive `delete_auth` (or any write capability) from the public-id.
**Verdict: NO-GO on any design that derives `delete_auth` from the public string. GO on the random owner-held `delete_auth`.**

### R-thumb — Thumbnail / metadata leakage
**Risk.** Thumbnails may carry sensitive content (EXIF GPS, internal screenshots, hidden text).
**Mitigation.** The editor strips EXIF and re-encodes to WebP before publish; the size cap forces a re-encode (which drops EXIF anyway). The owner-confirmation step shows the exact rendered card. Disclaimer text is owner-authored — treat as public.
**Verdict: GO** with EXIF-strip + re-encode on publish as a required editor behaviour.

### R-transparency — Surfacing the SG/Send file + the `/en-gb/preview/<key>` tester
**Risk.** The transparency disclosure (doc 02 §9, doc 04 §6a) and the `/en-gb/preview/<key>` social-card tester page (doc 02 §6) display the transfer-id, the read-only key, and a `send.sgraph.ai` link, and render the preview as a crawler would.
**Assessment.** Every value shown is **derivable by anyone from the public-id**, which is public by design; the key is **read-only / decrypt-only** and reaches **only the preview blob** (R3, R-leak). So these surfaces add **zero** new exposure — they make the existing exposure legible/testable. The owner's `delete_auth` (the only write capability) is **never** derivable and **never** shown (doc 03 §3.3). The tester page renders only the public preview — it never opens the vault and never prompts for the vault key.
**Mitigations.** The transparency disclosure is collapsed by default ("maybe not always visible" — lead). The tester page must, like the OG route, **fail closed** (show "no preview" on any error) and never touch vault contents.
**Verdict: GO.** Read-only, public-derivable material only.

### R-expiry — Expiry enforcement
**Assessment (better than upstream).** In this repo expiry is **server-enforced**, not merely advisory: `expires_at` and `max_downloads` cause the transfer service to return `410` and (with `auto_delete`) wipe the payload (`Transfer__Service.py:151-170`). A viewer who already fetched the ciphertext can still decrypt their copy — true of any delivered content — but the **server stops serving it** at the boundary, and the owner can delete outright.
**Mitigation.** UX states what is enforced ("the link stops working — server-enforced"). The client also reads `expires_at_ms` to render the expired state before a round-trip.
**Verdict: GO** — both time and open-count expiry are real and server-enforced.

---

## Go / no-go summary

| Risk | Verdict | Condition |
|---|---|---|
| R1 — deliberate exposure | **GO** | opt-in, bounded, reversible |
| R2 — over-exposure | **GO** | editor confirmation + inline key-field guard |
| R3 — derivation soundness | **GO** | Security ratifies constants + KAT |
| R4 — OG-render perf/exposure | **GO (in-repo Lambda)** | DevOps publishes latency; NO-GO on static prerender |
| R-leak — public-id in logs | **GO** | vault key stays in `#` fragment only |
| **R-deface — modify the preview** | **NO-GO if `delete_auth` from public string; GO on random owner-held `delete_auth`** | mandatory gate |
| R-thumb — thumbnail/metadata leak | **GO** | EXIF strip + re-encode on publish |
| R-transparency — show SG/Send file + `/preview` tester | **GO** | read-only, public-derivable only; never shows `delete_auth`; fails closed |
| R-expiry — enforcement | **GO** | server-enforced (time + open-count) |

**Overall: GO to build v0.1.0** (core module + components + the in-repo route + OG render), with two hard gates: (1) **never derive a write key OR `delete_auth` from the public string**, and (2) **Security ratifies the derivation constants with a known-answer test** before release.

---

This document is released under the Creative Commons Attribution 4.0 International licence (CC BY 4.0).
