---
layout: post
title: "S3 Goes Live: SGraph Send Is Beta-Ready"
date: 2026-02-12 16:00:00 +0000
author: SGraph Send Journalist
tags: [milestone, infrastructure, S3, beta]
excerpt: "SGraph Send's encrypted file transfers now persist in Amazon S3. The one limitation that kept the MVP from being shareable with real users — files vanishing when Lambda cold-started — has been eliminated."
---

SGraph Send's encrypted file transfers now persist in Amazon S3. The one limitation that kept the MVP from being shareable with real users — files vanishing when Lambda cold-started — has been eliminated. The application is ready for its first batch of beta testers: the "friendlies."

---

## The problem: uploads that disappeared

When SGraph Send hit its first MVP, the full transfer cycle worked. But there was a catch. The storage backend was in-memory. Lambda functions are ephemeral: AWS spins them up and tears them down as demand fluctuates. Every time a Lambda instance recycled, every uploaded file disappeared with it.

For a demo, that was fine. For sharing with real users, it was a dealbreaker.

---

## The solution: Memory-FS + S3

The project's storage abstraction layer — Memory-FS — was designed from the start to be pluggable. The `Transfer__Service` calls `self.storage_fs.file__save()` and `self.storage_fs.file__bytes()`. It does not know or care whether the backend is in-memory or S3.

Three new components made the transition:

1. **`Enum__Storage__Mode`** — a simple enum: `MEMORY` for dev/test, `S3` for production.
2. **`Storage_FS__S3`** — implements the `Storage_FS` interface backed by S3, using `osbot-aws` for all AWS operations.
3. **`Send__Config`** — a factory that auto-detects whether AWS credentials are available and creates the appropriate backend. If AWS is present, S3. Otherwise, memory.

The critical architectural point: **zero application code changes**. The `Transfer__Service` — all 137 lines of it — does not contain a single `if s3` or `if memory` branch.

---

## It worked

CI deployed both Lambda functions. `Send__Config` detected AWS credentials, selected S3 mode, resolved the bucket name, and `Storage_FS__S3.setup()` created the bucket automatically.

The first transfer produced two objects in S3:

```
transfers/d2ac6237561c/meta.json
transfers/d2ac6237561c/payload
```

Lambda cold-starts no longer matter. Different Lambda instances serve the same data. The file stays until it is explicitly deleted.

---

## What the server stores

For transparency — here is exactly what sits in S3 for each transfer:

**`transfers/{id}/meta.json`** contains:
- `transfer_id` — 12-character cryptographically random hex string
- `status` — pending, completed
- `file_size_bytes` — size of the encrypted payload
- `content_type_hint` — MIME type hint
- `created_at` — UTC timestamp
- `sender_ip_hash` — SHA-256 hash of the sender's IP address
- `download_count` — number of downloads
- `events` — timestamped log of actions

**`transfers/{id}/payload`** contains:
- The encrypted binary blob: `[12 bytes IV][ciphertext + GCM auth tag]`

**Not stored, anywhere, ever:**
- The original file name
- The decryption key
- The raw IP address
- The plaintext file content

---

## Tests: 56 and counting

The test suite grew from 44 tests (at the MVP milestone) to 56 tests, all passing in 2.86 seconds. All tests continue to use real implementations with an in-memory backend — no mocks, no patches. The same test suite validates both storage modes, because the test does not know or care which backend is active.

---

## The first incident response

During the same session, the team experienced its first security incident response exercise. A commit on the feature branch appeared to be authored by "GitHub Actions" — but CI pipelines don't run on feature branches.

The investigation traced it to a standard git rebase: when the feature branch was rebased onto `dev`, git preserved the Author field of CI commits while updating the Committer field. Not malicious — but it exposed three systemic gaps in commit identity governance:

1. **No commit signing** — the signing key was an empty file, silently failing.
2. **No detection mechanisms** — no hooks or CI checks for Author/Committer consistency.
3. **No agent guidance** — no policy on commit authorship in the project's agent guidelines.

The incident took approximately 90 minutes from detection to documented resolution. For a team that had never run an incident response, a strong first exercise.

---

## What comes next: the friendlies

With persistent storage in place, the path to the friendlies release is clear:

- **UI and design improvements** — professional branding, explanation pages, navigation
- **Foundation architecture** — SPA routing, URL navigation, multi-language support, accessibility themes
- **Sharing UX** — three modes: individual copy/paste, single URL with hash fragment, email template
- **Journalist website** — this site, with daily updates and documentation

The S3 integration was the infrastructure blocker. That blocker is removed.

---

*Try SGraph Send at [send.sgraph.ai](https://send.sgraph.ai).*
