# Architecture Brief: GitHub as PKI Registry

**version** v0.6.14  
**date** 23 Feb 2026  
**from** Human (project lead)  
**to** Architect (lead), Developer, Ambassador  
**type** Architecture brief — living off the land with existing PKI infrastructure  

---

## The Breakthrough

GitHub already publishes public keys for every user:

```
SSH keys:  https://github.com/{username}.keys
GPG keys:  https://github.com/{username}.gpg
```

Millions of developers already have published public keys. They already have the private keys on their machines. GitHub has done the identity verification (account ownership, email verification, 2FA).

**We don't need to build a registry. One already exists.**

---

## What This Means

| Today | With GitHub as Registry |
|---|---|
| To send someone an encrypted file, they need to visit send.sgraph.ai and generate a key pair | To send someone an encrypted file, look up their GitHub username |
| Cold start problem: recipient has no key | Most developers already have SSH keys published on GitHub |
| We maintain our own public key registry | GitHub maintains it for us (and has for years) |
| Identity verification is our problem | GitHub has already verified the account (email, 2FA, contribution history) |

**Any GitHub user with published keys can receive encrypted messages without doing anything new.** They already have the infrastructure. We just need to use it.

---

## The Two Key Types

### SSH Keys (Ed25519)

```
$ curl https://github.com/username.keys
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAA...
```

- **Published by default** — anyone who's set up SSH for GitHub has these
- **Millions of users** — practically every active GitHub developer
- **Ed25519** — modern, fast, secure
- **Challenge**: SSH keys are for signing/authentication, not encryption. Need a deterministic conversion to an X25519 key pair for encryption.

**The conversion**: Ed25519 (signing) → X25519 (encryption) is a well-known, deterministic operation. The public key can be converted. Only the holder of the private key can derive the corresponding X25519 private key.

Libraries that do this:
- **AGE** (age-encryption.org) — designed exactly for this. Accepts SSH Ed25519 keys directly.
- **libsodium** — `crypto_sign_ed25519_pk_to_curve25519()` converts Ed25519 → X25519
- **TweetNaCl** — JavaScript implementation available for browser use

### GPG Keys

```
$ curl https://github.com/username.gpg
-----BEGIN PGP PUBLIC KEY BLOCK-----
...
```

- **Published by users who set up GPG** — fewer than SSH, but growing (signed commits)
- **Standard PGP** — well-understood encryption format
- **Already designed for encryption** — no conversion needed
- **Challenge**: GPG keys are less commonly set up than SSH keys

**Libraries**: OpenPGP.js (browser-compatible PGP implementation)

---

## Architecture: Send to Any GitHub User

### Workflow 1: Encrypt for a GitHub User (SSH Key)

```
1. Sender enters GitHub username: "octocat"

2. SG/Send fetches: https://github.com/octocat.keys
   → Gets Ed25519 public key

3. Convert Ed25519 → X25519 (deterministic, client-side)
   → Now we have an encryption public key

4. Encrypt the file with the X25519 public key
   (using NaCl box / libsodium sealed box)

5. Send the encrypted file to recipient
   (email attachment, data room, direct link — any channel)

6. Recipient has their Ed25519 private key (in ~/.ssh/)
   → Convert Ed25519 private key → X25519 private key
   → Decrypt the file

The recipient doesn't install anything new.
They use a key they already have.
GitHub verified their identity.
```

### Workflow 2: Encrypt for a GitHub User (GPG Key)

```
1. Sender enters GitHub username: "octocat"

2. SG/Send fetches: https://github.com/octocat.gpg
   → Gets PGP public key

3. Encrypt the file with the PGP public key
   (using OpenPGP.js, client-side)

4. Send the encrypted file (.gpg or .sgenc)

5. Recipient decrypts with their GPG private key
   → Using gpg CLI, or any PGP-compatible tool, or SG/Send browser
```

### Workflow 3: In the Browser (SG/Send)

```
1. Sender goes to send.sgraph.ai
2. Types recipient's GitHub username
3. SG/Send fetches their public key (SSH or GPG)
4. Sender drops a file → encrypted with recipient's key
5. Sender gets encrypted file back (or sends via SG/Send)

Recipient:
1. Gets the encrypted file (email, download, etc.)
2. Goes to send.sgraph.ai
3. Imports their private key (one-time, from ~/.ssh/ or password manager)
4. Drops the encrypted file → decrypted in browser
```

---

## Multiple Decryption Options

The recipient has choices — meet them where they are:

| Method | How | Complexity |
|---|---|---|
| **SG/Send browser** | Drag and drop into send.sgraph.ai | Lowest — works in any browser |
| **AGE CLI** | `age -d -i ~/.ssh/id_ed25519 file.age` | Low — one command |
| **GPG CLI** | `gpg --decrypt file.gpg` | Low — standard tool |
| **OpenSSL CLI** | `openssl pkeyutl -decrypt ...` | Medium — more flags |
| **SG/Send CLI** | `sgsend decrypt file.sgenc` | Low — our tool, wraps the above |
| **Node.js script** | Our npm package | For developers / automation |
| **Docker** | `docker run sgsend/decrypt file.sgenc` | For isolated environments |

The server never sees the file. The decryption happens locally. The channel (email, USB, pigeon) is irrelevant.

---

## GitHub as Identity Verification

GitHub provides several trust signals:

| Signal | What It Tells Us |
|---|---|
| **Account age** | How long the account has existed |
| **Contribution history** | Real activity vs empty account |
| **Email verification** | GitHub verifies email addresses |
| **2FA enabled** | Account has additional security (visible on some profiles) |
| **Organisation membership** | Account belongs to a verified organisation |
| **Signed commits** | User already uses GPG for signing (they understand PKI) |
| **Followers / stars** | Social proof (weak but useful) |

For our trust web, a GitHub identity with years of contributions, verified email, 2FA, and signed commits is a STRONG identity signal — much stronger than a freshly generated key with no history.

---

## Signed Commits: A Campaign to Promote

Most developers don't sign their commits. With agentic AI making commits on behalf of developers, this is becoming critical. How do you know a commit was made by the developer and not by a rogue agent?

**Campaign idea**: promote signed commits as essential hygiene, especially in the agentic era. "If your agent can commit to your repo, how do you prove which commits are yours?" This naturally drives GPG key adoption on GitHub, which grows the registry we're using.

Connection to our codebase: the human already encountered this — an agent committed on their behalf and it wasn't clear which commits were human vs agent. Signed commits solve this.

---

## GitLab and Other Platforms

GitLab also exposes user keys:

```
SSH keys: https://gitlab.com/{username}.keys
GPG keys: via GitLab API
```

Any platform that publishes user public keys is a potential registry. The more platforms we support, the more users we can reach without them doing anything new.

---

## Priority and Phasing

| Phase | What | Effort |
|---|---|---|
| **Phase 1: GPG support** | Add OpenPGP.js to SG/Send. Accept GPG-encrypted files. Encrypt for GPG public keys fetched from GitHub. | Medium — library exists, integration needed |
| **Phase 2: SSH Ed25519 support** | Add Ed25519 → X25519 conversion. Accept AGE-encrypted files. Encrypt using SSH public keys from GitHub. | Medium — crypto conversion well-documented |
| **Phase 3: GitHub username lookup** | Add "Send to GitHub user" in the UI. Fetch keys, show identity signals, encrypt. | Low — UI + fetch |
| **Phase 4: CLI tools** | `sgsend encrypt --to github:username file.pdf` | Low — wraps existing crypto |
| **Phase 5: Marketing campaign** | "Send encrypted files to any GitHub user" + signed commits promotion | Ambassador + Journalist |

**Defer until customer demand**: complex Ed25519 edge cases, key pinning against GitHub compromise, multi-key handling (users with multiple SSH keys).

---

## Security Considerations

| Concern | Mitigation |
|---|---|
| **GitHub account compromise** | If someone takes over a GitHub account, they could publish new keys. Pin keys on first use (TOFU). Alert if keys change. |
| **GitHub as trust anchor** | We're trusting GitHub to correctly publish keys. GitHub is a strong trust anchor but it's centralised. Support multiple registries. |
| **SSH keys not designed for encryption** | The Ed25519 → X25519 conversion is mathematically sound and widely used (AGE, libsodium). Not a novel operation. |
| **Key rotation** | Users who rotate SSH keys invalidate the old encryption path. Need to handle gracefully — check for key changes before encrypting. |

---

## Acceptance Criteria

| # | Criterion |
|---|---|
| 1 | GPG encryption/decryption working in browser (OpenPGP.js) |
| 2 | SSH Ed25519 → X25519 conversion working in browser |
| 3 | Fetch public keys from `github.com/{username}.keys` and `.gpg` |
| 4 | "Send to GitHub user" UI: enter username → fetch key → encrypt → deliver |
| 5 | Recipient can decrypt by drag-and-drop in SG/Send browser |
| 6 | Recipient can decrypt via CLI (AGE, GPG, or sgsend CLI) |
| 7 | GitLab key fetch also supported |
| 8 | GitHub identity signals displayed (account age, contributions, 2FA, orgs) |

---

This document is released under the Creative Commons Attribution 4.0 International licence (CC BY 4.0). You are free to share and adapt this material for any purpose, including commercially, as long as you give appropriate credit.
