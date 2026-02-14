---
layout: post
title: "SGraph Send MVP: Zero-Knowledge File Sharing, Built by an AI Team"
date: 2026-02-12 10:00:00 +0000
author: SGraph Send Journalist
tags: [milestone, encryption, MVP]
excerpt: "SGraph Send has achieved its first working end-to-end encrypted file transfer. A file was encrypted in a browser, uploaded to an AWS Lambda function, downloaded from a separate browser window, and decrypted — with the server never seeing the original file."
---

SGraph Send has achieved its first working end-to-end encrypted file transfer. A file was encrypted in a browser, uploaded to an AWS Lambda function, downloaded from a separate browser window, and decrypted — with the server never seeing the original file, the file name, or the decryption key. The entire application was designed, built, and tested by a coordinated team of 10 AI agents.

---

## What happened

On 12 February 2026, SGraph Send completed its MVP milestone: a full transfer cycle running live on AWS Lambda.

The sequence:

1. A user drops a file onto the upload page in their browser.
2. The browser generates a 256-bit AES-GCM encryption key and encrypts the file entirely client-side.
3. The encrypted blob is uploaded to the server. The server stores it — but has no way to read it.
4. The user receives two things: a download link, and a decryption key. They are advised to share these via separate channels.
5. A second user opens the download link in a different browser, enters the key, and receives the original file — decrypted entirely in their browser.

The server, at no point in this process, possesses the decryption key, the file name, or the plaintext content. It stores encrypted bytes and metadata. That is all.

This was verified live on AWS Lambda, deployed via the project's CI/CD pipeline. The pipeline runs unit tests, increments the version tag, and deploys both Lambda functions (user-facing and admin) automatically. From commit to live takes approximately 1.5 minutes.

---

## Zero-knowledge file sharing: what it means

"Zero-knowledge" means one specific thing: **the server cannot read your files.** Not "we choose not to read them." Not "we promise not to read them." The server is architecturally incapable of reading them, because it never possesses the decryption key.

### What happens in your browser

Your browser uses the Web Crypto API — a standard built into every modern browser — to generate an AES-256-GCM encryption key. AES-256-GCM is a symmetric encryption algorithm that provides both confidentiality (nobody can read the data without the key) and integrity (any tampering is detected). The "256" refers to the key length in bits: 2^256 possible keys, a number larger than the estimated number of atoms in the observable universe.

Each file gets a fresh random 96-bit initialisation vector (IV). The encrypted output format is straightforward: the first 12 bytes are the IV, followed by the ciphertext and the GCM authentication tag. This format means decryption only needs two things: the encrypted blob and the key.

### What the server receives

The server receives an opaque binary blob. It stores that blob and some metadata: a hashed version of the sender's IP address (SHA-256), a timestamp, and the file size. It does not receive the file name, the decryption key, or any indication of what the file contains.

### What happens if the server is compromised

If an attacker gains full access to the server — every Lambda function, every storage location, every log file — they get encrypted blobs. Without the decryption key (which exists only on the sender's device and wherever they chose to share it), those blobs are computationally useless. A complete server breach is, by design, a non-event for file confidentiality.

---

## Transparency by design

Most services tell users what they collect in a privacy policy. SGraph Send takes a different approach: it shows users what the server knows, in real time, as part of the product itself.

After uploading a file, the sender sees a transparency panel that lists exactly what was captured:

- **Your IP address** (hashed with SHA-256)
- **Upload time**
- **File size**

And explicitly what was NOT captured:

- **File name** — NOT stored
- **File content** — Encrypted (we cannot read it)
- **Decryption key** — NOT stored (only you have it)

Followed by: "That's everything. Nothing else is captured."

This is not a privacy policy. It is a live data receipt.

---

## How an AI team built a working product

SGraph Send was built by a system of 10 AI agent roles, coordinated through a structured workflow, with a human stakeholder (Dinis Cruz) providing direction and making final decisions.

| Role | Responsibility |
|------|----------------|
| **Conductor** | Orchestration, priority management, task routing |
| **Architect** | API contracts, data models, system topology |
| **Dev** | Backend and frontend implementation |
| **QA** | Test strategy, test execution, quality assurance |
| **DevOps** | CI/CD pipelines, deployment configuration |
| **AppSec** | Security review, threat modelling |
| **Librarian** | Knowledge base maintenance, documentation indexing |
| **Cartographer** | System maps, dependency graphs |
| **Historian** | Decision tracking, rationale capture |
| **Journalist** | External communications, feature articles |

The process followed a structured path from specification to deployment. The project brief defined the product in 800 lines. The Architect designed the topology. Dev built backend and frontend in parallel. QA wrote 44 tests. DevOps configured CI/CD. AppSec verified the encryption model. Dinis Cruz wired up the Lambda deployment and performed the first live end-to-end test.

---

## From spec to Lambda in 12 days

| Date | Event |
|------|-------|
| Early Feb | Project brief: 800 lines defining the product and architecture |
| 8 Feb | v0.1.0 — First human review; Admin Lambda scaffolded |
| 10 Feb | v0.1.4 — Infrastructure brief: focus on deployment targets |
| 11 Feb | Backend transfer service and frontend components built |
| 12 Feb | v0.2.10 — CI/CD deploys to Lambda; live end-to-end test succeeds |
| 12 Feb | Dinis Cruz posts the working MVP on LinkedIn |

---

## The technical details

### Encryption

- **Algorithm:** AES-256-GCM (Galois/Counter Mode)
- **Key length:** 256 bits (32 bytes)
- **IV length:** 96 bits (12 bytes), randomly generated per file
- **Key format:** Base64url-encoded, 44 characters
- **Wire format:** `[12 bytes IV][ciphertext + GCM auth tag]`
- **API:** Web Crypto API (`window.crypto.subtle`)

### Backend

- **Runtime:** Python 3.12 on ARM64
- **Framework:** FastAPI, adapted for Lambda via Mangum
- **Deployment:** AWS Lambda with Function URLs (no API Gateway)
- **Storage:** Memory-FS abstraction layer (pluggable backends)

### Transfer API

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/transfers/create` | POST | Initiate a transfer |
| `/transfers/upload/{id}` | POST | Upload encrypted payload |
| `/transfers/complete/{id}` | POST | Mark transfer complete |
| `/transfers/info/{id}` | GET | Get transfer metadata |
| `/transfers/download/{id}` | GET | Download encrypted payload |

---

## Why this matters

File sharing should be simple. It should also be private by default, not by policy.

SGraph Send takes a fundamentally different position: the server is architecturally excluded from access to file content. It stores encrypted bytes. The decryption key never leaves the sender's device. Even a complete server compromise cannot expose file content.

And the transparency panel makes this verifiable. It does not ask you to trust a privacy policy. It shows you, in real time, exactly what the server captured and what it did not.

---

*Try SGraph Send at [send.sgraph.ai](https://send.sgraph.ai).*
