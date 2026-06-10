# Partner Briefing: Identity And Key Management For Zero-Knowledge Healthcare Vaults

**A collaboration invitation from the SG/Vault project**

We have built a zero-knowledge encrypted vault platform, and we have a working healthcare use case in which a clinician creates a private, encrypted vault for each patient. The platform works today. What we want now is to find official technological partners to provide the identity and key-management layer that sits alongside it. This document explains what we have, what we need, and how to work with us.

---

## How We Work

Three things are true of everything we do, and they are the basis for any partnership:

- **Everything is public.** The work, the designs, and the proofs of concept are done in the open.
- **Everything is open source.** No closed components on our side.
- **No NDAs, collaboration first.** We are looking for joint projects, joint proofs of concept, and official integrations, not paperwork.

If that is how your company likes to work, we should talk.

---

## 1. What We Have Built And Shipped

The platform is real and running today. In short:

- **A zero-knowledge encrypted vault.** Data is encrypted client-side; we cannot read it.
- **Version control built in.** Every change to a vault is versioned, like a private encrypted git.
- **PKI throughout.** Vaults have key pairs, and updates are delivered as signed messages that only the holder of the parent key can send.
- **Vault-to-vault encrypted communication.** Two vaults exchange sealed messages both ways.
- **A working healthcare vault.** A clinician creates a vault for a patient from a template, the patient completes a workflow, and results flow back to the clinician over an encrypted, signed channel.

In other words, the hard zero-knowledge plumbing is done. What is missing is the part the wider industry has already solved better than we could alone.

---

## 2. Where We Need Partners

We have created a real need and we want the best existing technology to meet it, rather than rebuilding it. Two areas, in priority order.

**Identity and authentication (first priority).**
We need to validate and log in users to a standard suitable for medical data. Concretely: sign-in with OAuth and OpenID Connect, two-factor authentication, and the related controls, delivered through the simplest possible experience. Authorization (who can do what) follows from this.

**Secrets and key management, including public and private keys.**
The patient and the clinician each have a key to their vault, and the open question is where that key lives and how it is recovered. We are looking for a strong, recoverable home for private keys (secure enclaves, passkeys, key escrow, or split-key and social-recovery models), and a good way to manage and deploy public and private key pairs.

We are happy for two or three providers to cover this together, and **cloud providers are very much in scope**, because they already hold several pieces of the puzzle.

---

## 3. The Journeys We Want To Keep Simple

Our single objective for the user-facing side is simplicity. The patient journey and the clinician journey should each be effortless. This is where a partner's technology plugs in.

**Patient journey**

```
  Receive link        Open vault         Verify identity       Key available        Use the vault
  (email / message) ->(in the browser)-> (OAuth + 2FA)      -> (held safely)     -> (read, submit,
                                          << partner >>         << partner >>          continue later)
```

**Clinician journey**

```
  Create vault       Hold and manage      Send / receive        Review results
  (from template) -> keys safely       -> (signed messages)  -> (in the console)
                     << partner >>
```

The boxes marked `<< partner >>` are exactly where we want your technology: validating the user, and holding and recovering the key.

---

## 4. Where A Partner Plugs In

```
            +-----------------------------------------------+
            |          SG/Vault zero-knowledge core          |
            |   PKI  .  version control  .  vault-to-vault   |
            |        (this part is built and working)        |
            +-----------------------------------------------+
                  ^                ^                  ^
                  |                |                  |
        +-----------------+ +----------------+ +-----------------+
        |   Identity and   | |  Secrets and   | |     Cloud       |
        |  authentication  | | key management | |    provider     |
        |  OAuth + 2FA,    | | public/private | |  compute and    |
        |  validate users  | | key deployment | |  storage,       |
        |                  | | and recovery   | |  in-account     |
        +-----------------+ +----------------+ +-----------------+
                  ^                ^                  ^
                  |                |                  |
              <<<<<  partners we want to talk to  >>>>>
```

We keep the zero-knowledge core. You bring the identity layer, the key-management layer, or the cloud platform underneath. Two or three of you can collaborate on one solution.

---

## 5. What We Are Asking For

We are looking for official technological partners in these categories. The examples are illustrative, not endorsements; they show the kind of company we want to talk to.

- **Identity and authentication:** OAuth and OpenID Connect, passwordless and passkey platforms, B2B single-sign-on, and cloud identity. For example, the WorkOS, Stytch, Ory, Auth0 and Okta, and Amazon Cognito family of approaches.
- **Secrets and key management:** secret stores and key-management services, and modern key-custody models. For example, HashiCorp Vault, Infisical, cloud KMS, and passkey, secure-enclave, and split-key or multi-party approaches.
- **Cloud providers:** AWS, Azure, Google Cloud, and Cloudflare, all of whom already hold several pieces of the puzzle.

If you have solved public-and-private-key deployment for ordinary users in a way that is recoverable and simple, we especially want to hear from you.

---

## 6. What We Offer

- **A working, public proof point.** A real zero-knowledge platform with a live healthcare use case to integrate against.
- **A joint, open proof of concept.** We will build it in the open, with you, and show it publicly.
- **A path into real projects.** The next stage is to integrate properly and bring partners into the deployments.
- **A clear, narrow ask.** We are not asking you to learn our whole world. We want to leverage your platform for the identity and key-management layer, simply.

---

## Let's Talk

If your technology validates users to a medical-data standard, or gives ordinary people a safe and recoverable home for their keys, and you are happy to collaborate in the open with no NDA, reach out. We would like to start with a conversation and a small joint proof of concept.

---

This briefing is released under the Creative Commons Attribution 4.0 International licence (CC BY 4.0).
