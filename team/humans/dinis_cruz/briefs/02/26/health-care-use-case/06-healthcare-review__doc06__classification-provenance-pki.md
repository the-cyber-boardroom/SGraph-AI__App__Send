# Reply to Other Claude Session + Doc 06

---

## MESSAGE TO PASTE INTO THE OTHER CLAUDE SESSION

---

Yes, please write Doc 06. Here's what "really good PKI" means in the SG/Send context — this is documented in detail so you can represent it accurately:

**What SG/Send's PKI actually does:**

**Zero-knowledge architecture (both modes).** The server stores only AES-256-GCM encrypted ciphertext. The decryption key never reaches the server — ever. A complete server breach exposes only encrypted blobs. This is a verifiable architectural property, not a policy claim.

**Two distinct modes with fundamentally different threat profiles:**

*Symmetric mode (default):* The file is encrypted with a fresh random AES-256 key per transfer. The key is embedded in the download URL fragment (`#transfer_id/key_b64url`). The URL fragment is never sent to the server by browsers. Anyone with the full URL can decrypt — so security = secrecy of the URL. The entity list that can see the key includes the generating session, n8n (if used for email delivery), AWS SES, and the recipient's email provider. Mitigated by one-time use (link dies after first download) and short expiry (24h default).

*PKI mode:* The content is encrypted with the recipient's public key before it leaves the sender's context. The decryption key is never transmitted — the recipient already holds the only key that matters (their private key, generated in their browser, never leaves it). The download URL is an opaque reference, not a key. Interception of the URL gives an attacker nothing. The email provider sees a URL. Not a key. Not the content.

**Sender signing (PKI + signed):** The sender signs the content with their private key before encrypting with the recipient's public key. The recipient can verify: (1) this was encrypted specifically for me — nobody else can decrypt it, and (2) this was signed by the stated sender — it cannot have been forged. This is non-repudiation. It is the thing incumbents using server-side signing cannot provide, because their proof is "the server says so" not "the cryptographic proof says so."

**Key formats:** Ed25519 (SSH-style) and PGP. Public keys published at `sgraph.ai/agents/keys.json` for agents; same model for users. Key discovery is a predictable public URL — like `github.com/{username}.keys` but for SG/Send identities.

**SGMETA envelope:** Every file is wrapped in a structured envelope before encryption. The envelope carries the original filename and metadata inside the ciphertext — so the filename itself is encrypted and invisible to the server. The recipient sees the correct filename when they decrypt; the server never saw it.

**What this creates for healthcare specifically:**

- Document authenticity that is cryptographically provable, not server-assertion-based
- Non-repudiation: the sending clinician's signature on a referral or consent document cannot be forged and cannot be denied
- Chain of custody that travels with the document (inside the encrypted payload) rather than living only in server logs
- Classification metadata that can be embedded in the SGMETA envelope and survives the transmission — the label travels with the document, not separately
- Zero exposure to the hosting provider: a healthcare organisation using SG/Send can demonstrate to a regulator that their document hosting provider literally cannot read the documents — not as a policy statement but as a mathematical property

The competitive comparison for healthcare: incumbents use server-side PKI (X.509, DKIM/DMARC) to prove *the server* received and forwarded the document. SG/Send uses client-side PKI to prove *the person* signed the document. The server is not in the trust chain. That distinction matters enormously for audit, for regulatory compliance, and for any situation where "the system says so" is not sufficient.

Please write Doc 06 around those three axes (classification, provenance, PKI as differentiator) with healthcare as the primary context. I'll share it with the team.

---
---

# Doc 06: Data Classification, Document Provenance, and PKI as Competitive Differentiator

*Supplement to the healthcare product security review*  
*date: 26 Feb 2026 | licence: CC BY 4.0*

---

## Why This Document Exists

The previous five documents in this review analysed the incumbent healthcare document platform across security architecture, compliance posture, UX, and integration. Three significant gaps were not covered:

1. **Data classification** — how sensitive data is labelled, and whether that label survives the document's lifecycle
2. **Document provenance** — chain of custody, tamper evidence, and the difference between server-assertion and cryptographic proof
3. **PKI as differentiator** — where SG/Send's client-side PKI creates a story incumbents cannot match, particularly in regulated healthcare

This document addresses all three. It is structured around the practical question healthcare organisations actually need to answer: *can I prove, to a regulator, an auditor, or a court, what happened to this document, who touched it, and that it has not been altered?*

---

## Part 1: Data Classification

### What the Incumbent Does

The incumbent's classification capability is limited to routing logic. Documents can be tagged at the point of upload (manually, by the sender) and those tags can trigger policy responses: different retention windows, different access controls, different notification rules. This is useful operational tooling.

What it is not: a classification system that travels with the document.

The tag lives in the server's database. If the document is downloaded, forwarded as an attachment, printed, or extracted from the platform by any means, the classification metadata stays behind. The document itself carries no record of what sensitivity level was assigned to it at creation.

This is a fundamental gap in regulated environments. GDPR special category data (health data is explicitly listed under Article 9) must be handled throughout its lifecycle under appropriate controls. A classification that exists only in the originating system's database provides no protection — and no evidence of protection — once the document leaves that system.

### The Classification Problem in Healthcare Specifically

Healthcare documents span an enormous sensitivity range within a single workflow:

| Document type | Sensitivity level | Why it matters |
|---|---|---|
| Appointment reminder | LOW — name and date only | GDPR standard personal data |
| Referral letter | HIGH — diagnosis, clinical history | GDPR Article 9 special category |
| Consent form (signed) | HIGH + legal weight | Article 9 + non-repudiation requirement |
| Prescription | HIGH + regulatory | Controlled substances carry additional legal obligations |
| Mental health records | CRITICAL | Highest sensitivity within Article 9; additional legal protections in UK law |
| Genomic data | CRITICAL | Irreversible; family implications; specific ICO guidance |

A system that does not carry classification metadata inside the document itself cannot reliably enforce different handling for these categories once they are in motion. A CRITICAL mental health record that has been downloaded and re-attached to an email is indistinguishable from an appointment reminder.

### What Good Classification Looks Like

Classification should be embedded in the document's envelope at the point of creation, travel with the document regardless of the transmission channel, and be verifiable without accessing the originating server.

In the SG/Send model, the SGMETA envelope — the structured wrapper applied to every document before encryption — is the natural carrier for classification metadata:

```json
{
  "filename": "patient-referral-dr-jones-2026-02-26.pdf",
  "classification": "RESTRICTED",
  "gdpr_basis": "Article_9_explicit_consent",
  "data_categories": ["health_data", "mental_health"],
  "created_by": "dr.jones@nhs.example",
  "created_by_key_fingerprint": "b12a...",
  "created_at": "2026-02-26T14:32:00Z",
  "expiry": "2027-02-26T00:00:00Z",
  "handling_instructions": "recipient_only_do_not_forward"
}
```

This metadata is inside the ciphertext. It is encrypted along with the document content. The server never sees it. But when the recipient decrypts the document in their browser, they see the full classification context — and the system can enforce handling restrictions based on that context, even if the document is being opened in a completely different system from the one that created it.

The classification label cannot be stripped without breaking the encryption. It cannot be altered without invalidating the signature. It travels with the document because it is inside the document.

### Classification Tiers for Healthcare

A practical classification scheme for healthcare SG/Send usage:

| Tier | Label | Content | Handling |
|---|---|---|---|
| 1 | UNRESTRICTED | Administrative, appointment logistics, no health data | Standard send, symmetric key acceptable |
| 2 | RESTRICTED | Personal data, identifiable but not clinical | Symmetric with one-time use; PKI preferred |
| 3 | CONFIDENTIAL | Clinical data, diagnoses, prescriptions | PKI required; no symmetric mode |
| 4 | SENSITIVE | Mental health, genomic, safeguarding | PKI required; signing required; audit on every access |
| 5 | LEGAL | Consent forms, legal disclosures, complaints | PKI + signing required; timestamping; permanent audit trail |

---

## Part 2: Document Provenance

### The Two Models of Provenance

There is a fundamental distinction that the incumbent's marketing does not make clearly — and that healthcare buyers need to understand:

**Server-assertion provenance:** "Our server records show that this document was uploaded by user X at time T and was not modified after that point." The proof is a server log entry, a database record, or a server-generated signature. The server is the authority.

**Cryptographic provenance:** "This document carries a signature that can only have been produced by the private key of X. The signature covers every byte of the document content. If any byte has changed since signing, the signature verification fails." The proof is mathematical. The server is not in the trust chain.

In non-contentious situations, server-assertion is fine. In contentious situations — a medical negligence claim, a GDPR enforcement action, a disciplinary process, a court proceeding — "the server says so" is not sufficient. The server could have been compromised. The database record could have been altered. The audit log could be incomplete. Server-side evidence requires trusting the server, and in adversarial contexts, that trust is exactly what is contested.

Cryptographic provenance requires trusting mathematics. Mathematics cannot be leaned on by a regulator, compromised by an attacker, or selectively presented by a party with interests.

### What the Incumbent Provides

The incumbent uses X.509 certificate chains for server-to-server communication (DKIM/DMARC for email authentication) and embeds a signature blob in its proprietary secure document format. The incumbent's documentation notes that the signature covers the document content and the sender's identity certificate.

The gap: this signature is generated by the *platform*, using a certificate the platform controls. If the platform's certificate infrastructure is compromised, the signature can be forged. If the platform is ordered to alter records, the signature can be regenerated. The trust root is the platform's certificate authority, not the sending clinician's private key.

Most users ignore the "Signature is VALID" banner in the incumbent's UI because they do not understand what it proves. What it proves is: "This document was processed by a server holding this certificate." That is useful. It is not the same as: "This document was signed by Dr. Jones's private key, which only Dr. Jones holds."

### The SG/Send Provenance Chain

SG/Send's provenance model is built from the other direction: the document is signed by the sender's private key, not by the platform's certificate.

```
PROVENANCE CHAIN FOR A SIGNED CLINICAL DOCUMENT:

1. Dr. Jones creates the referral letter
2. Dr. Jones signs it with her private key (Ed25519 or PGP)
   → Signature covers: document content + SGMETA envelope
   → Signature is inside the ciphertext: server cannot see or alter it
3. Document is encrypted with patient's/receiving clinician's public key
4. Encrypted blob uploaded to SG/Send
   → Server stores: encrypted bytes + opaque transfer ID + timestamp
   → Server cannot see: content, filename, classification, signature
5. Recipient decrypts in their browser
   → Decryption reveals: document + SGMETA + Dr. Jones's signature
6. Recipient verifies signature against Dr. Jones's published public key
   → Verification is local: no server call required
   → Result: mathematical proof that Dr. Jones signed this exact document
             and that it has not been altered since she signed it

What the server has in its logs:
  - An encrypted blob was uploaded at T1
  - The same blob was downloaded at T2
  - Nothing else

What a court or regulator has if they inspect the document:
  - Dr. Jones's signature, verifiable against her public key
  - The exact content she signed
  - The timestamp embedded in the signature
  - The classification metadata she assigned
  - Proof that nothing has changed
```

This is chain of custody that travels with the document, not chain of custody that lives in server logs.

### Tamper Evidence

In the SG/Send model, tamper evidence is not a feature — it is a mathematical property of authenticated encryption.

AES-256-GCM includes a 16-byte authentication tag computed over the ciphertext and associated data. Any modification to the ciphertext — even a single flipped bit — causes decryption to fail with an authentication error. The document cannot be silently altered. Any attempt to alter it produces a document that refuses to decrypt.

The incumbent's tamper evidence is server-side: the platform monitors for unexpected changes and alerts. This is useful. It relies on the server working correctly and acting in good faith. It is not the same as a mathematical guarantee that the ciphertext cannot be altered without detection.

---

## Part 3: PKI as Differentiator in Healthcare

### The Specific Claims Incumbents Cannot Match

The incumbent's PKI story is: we use X.509 certificates to authenticate our servers and sign our outgoing communications. This is standard, correct, and insufficient for healthcare's specific requirements.

The SG/Send PKI story is different:

| Capability | Incumbent | SG/Send |
|---|---|---|
| Document signed by *sender's* key | No — signed by platform key | Yes — sender's private key |
| Recipient cannot be impersonated | Partial — platform controls sender certificates | Yes — only private key holder can decrypt |
| Server cannot read documents | No — server has decryption keys | Yes — zero-knowledge by design |
| Signature verifiable without platform | No — requires platform's CA | Yes — public key is published; verification is local |
| Non-repudiation | No — platform could regenerate signature | Yes — sender's private key is not on the platform |
| Classification travels with document | No — stays in platform database | Yes — inside SGMETA envelope, inside ciphertext |
| Proof survives platform shutdown | No — audit trail lives on platform servers | Yes — signature travels with document |

### Non-Repudiation in Healthcare: Why It Matters

Non-repudiation is the property that a signed action cannot be credibly denied by the signer. In healthcare, this matters in at least three specific scenarios:

**Consent:** A patient signs a consent form electronically. If a dispute arises about whether consent was given, and the consent management platform is involved in the dispute, the plaintiff's lawyers will challenge the platform's evidence. "The platform says the patient clicked 'I consent'" is a weak evidential claim. "The patient's private key signed this consent document" is a strong one.

**Clinical decisions:** A consultant approves a treatment plan and the outcome is adverse. The question of exactly what was approved, when, and in what form, matters for both clinical governance and legal liability. A signed document that the signing clinician's key provably signed — and that has not been altered since — is the relevant evidence.

**Prescriptions and referrals:** These are legally significant documents. The chain of who authorised what, when, in what form, needs to be unambiguous. Server logs can be challenged. Cryptographic signatures are much harder to challenge, because challenging them requires demonstrating either that the private key was compromised or that the mathematics of Ed25519/RSA is broken.

### The Regulatory Argument

The UK ICO's guidance on Article 9 special category data requires "appropriate technical and organisational measures." The NHS DSPT (Data Security and Protection Toolkit) requires organisations to demonstrate that clinical data is handled with appropriate controls throughout its lifecycle.

Neither document specifies exactly what "appropriate" means technically. But the direction of regulatory expectation is clear: accountability, audit trails, and controls that can be demonstrated — not just asserted.

SG/Send's zero-knowledge architecture, combined with signed classification metadata and cryptographic provenance, creates an evidence base that is significantly stronger than server-log-based compliance demonstrations. When a healthcare organisation's DPO needs to respond to an ICO investigation with evidence of how a specific patient document was handled, the answer "here is the cryptographic proof of who signed it, when, and that it has not been altered" is a categorically different quality of evidence from "here are our server logs."

### The Pitch to Healthcare Buyers

The incumbent's security story is: "Trust us. We have certifications. Our servers are secure. Our audit logs are comprehensive."

SG/Send's security story for healthcare is: "Don't trust us. Verify us. Our server cannot read your documents — you can verify this by inspecting the code. Your documents are signed by your clinicians' keys — you can verify this independently of our platform. If we are ever served with a court order, we can comply with it and produce only encrypted bytes that we cannot decrypt. Your data remains yours, cryptographically, even while it's on our infrastructure."

In a post-NHS-data-breach, post-GDPR-enforcement world, "don't trust us, verify us" is a more compelling healthcare security story than "trust us, we're certified."

---

## Summary for the Healthcare Product Comparison

| Gap in incumbent | SG/Send position |
|---|---|
| Classification lives only in server database | Classification in SGMETA envelope inside ciphertext — travels with document |
| Tamper evidence is server-monitored | Tamper evidence is mathematical — AES-GCM auth tag |
| Provenance is server-assertion | Provenance is cryptographic — sender's private key signature |
| Non-repudiation relies on platform's CA | Non-repudiation relies on sender's private key — not platform-controlled |
| Platform can read documents | Server stores only ciphertext it cannot decrypt — zero-knowledge by design |
| Audit trail lives in platform logs | Proof travels with document, survives platform shutdown |
| PKI is server-to-server | PKI is sender-to-recipient, with server not in the trust chain |

---

*Released under Creative Commons Attribution 4.0 International (CC BY 4.0).*
