# SG Vault Hub: GitHub for Encrypted Vaults

**version** v0.13.30
**date** 14 Mar 2026
**audience** Team, product stakeholders
**status** Vision — not yet in implementation

---

## The Analogy

GitHub sits on top of Git and provides hosting, collaboration, discovery,
and sharing for repositories.

SG Vault Hub sits on top of SG Vault and provides the same — for
encrypted, cryptographically-signed vaults.

---

## What the Hub Would Provide

### Vault Hosting

Users can publish vaults publicly or privately. Public vaults are
discoverable; private vaults require the vault key to access content.

In both cases, the hub stores only encrypted blobs. The hub itself
cannot read vault contents — not file names, not commit messages, not
branch structures. This is fundamentally different from GitHub, which
has full access to every hosted repository.

### Collaboration

Users share access by sharing vault keys. The hub facilitates key
exchange, but never holds decrypted keys. Collaboration flows use
the same push/pull/merge model documented in the architecture.

### Branch Visibility

The encrypted branch index (`bare/indexes/idx-{id}`) allows clients
to enumerate branches after decrypting locally. The hub can surface
metadata that vault owners choose to publish (branch count, last update
timestamp, contributor count) without exposing encrypted content.

### Change Packs (Keyless Contributions)

One of SG Vault's most distinctive features: contributors who don't have
the vault key can submit encrypted change packs to `bare/pending/`. These
are self-contained, signed blobs that a vault owner can review and merge.

This is **stronger than a pull request.** A GitHub PR requires forking
the repo, which means the contributor has full read access to the
codebase. A change pack requires **zero knowledge** of the vault contents.
The contributor has never cloned the vault, cannot read any files, and
has no access to the vault key. They need only:

- A scoped write-only token (one `PUT` to `bare/pending/`)
- The branch public key (to encrypt their contribution)
- Their own signing key (to prove who submitted it)

The vault becomes a **write-only append target** for external systems.
This is particularly powerful for the hub: external contributors can
propose changes to a vault without ever accessing its contents — a
trust model that has no equivalent in existing code hosting platforms.

---

## The Key Difference from GitHub

| Property | GitHub | SG Vault Hub |
|----------|--------|-------------|
| Server reads repo contents | Yes | **No** |
| Server knows file names | Yes | **No** |
| Server knows branch names | Yes | **No** |
| Server knows commit messages | Yes | **No** |
| Search across repo content | Full-text | Not possible (encrypted) |
| Contributor identity | Account-based | Cryptographic (branch keys) |
| History integrity | Platform-guaranteed | **Self-verifiable** |

The trade-off is explicit: the hub cannot provide server-side code search,
rendered diffs, or content-aware features — because it never sees the
content. What it provides instead is a hosting platform where trust is
in the cryptography, not the platform.

---

## Optional Public Views

If vault owners choose, they can publish decrypted views:

- Rendered README
- File listings
- Documentation
- Rendered markdown

These are opt-in and controlled entirely by the vault owner. The hub
cannot generate these views itself — it cannot decrypt the vault. Instead,
the vault owner (or an authorised agent) decrypts locally, renders the
desired views, and publishes them to the hub as separate public artefacts.
The hub hosts and serves these artefacts, but they are produced client-side.

This means public views are always an explicit choice, never automatic.
The vault owner decides what to reveal and when to update it.

---

## Ecosystem Potential

SG Vault Hub opens the door to a broader ecosystem:

**Secure code collaboration.** Teams working on sensitive codebases
get Git-style collaboration with end-to-end encryption and verifiable
authorship — without trusting the hosting platform.

**Encrypted document sharing.** Non-code use cases: legal documents,
medical records, financial reports. Version-controlled, encrypted,
with cryptographic provenance.

**Agent collaboration platforms.** AI agents get first-class identity
via branch keys. An agent contributing to a vault has the same trust
model as a human — its commits are signed, its changes are traceable,
and its identity is cryptographic.

**Verifiable AI workflows.** When an AI agent produces output, the
commit signature proves which agent, on which device, at what time.
The provenance chain is embedded in the vault itself.

---

## Where We Are

SG Vault Hub is a natural extension of the architecture, not a separate
product. The `bare/` vault structure is already designed as a portable
unit — it syncs to any backend that supports `read`, `write`, `delete`,
`list`. The hub is one such backend, with a web interface on top.

The architecture supports it today. The implementation is a matter of
building the hosting layer and the web UI. The vault engine, the
collaboration model, and the trust layer are already specified.

---

*SGraph Send — v0.13.30 — 14 March 2026*
