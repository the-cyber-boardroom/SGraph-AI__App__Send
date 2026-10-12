# How A Recipient Manages Their Vault Key: The Options On The Table

**version** v0.33.16
**date** 10 June 2026
**from** Human (project lead)
**to** Architect, Security, Developer (lead), Product, @Dev
**type** Arch brief

---

## What This Is

The current thinking on a question raised by giving recipients their own vaults: **how does a recipient manage the key to their vault, and what options do we have, from password managers to public-and-private keys, to per-app account storage and secure enclaves, to the provider holding the keys?** It addresses the private-key-storage problem flagged across the PKI work (cross-ref: the v0.32.3 NHI-2.0-PKI-foundations and v0.32.7 central-key-management briefs) and is accompanied by a separate research document on the industry landscape and best practices (cross-ref: the v0.33.16 consumer-key-storage research brief). The recipient-and-provider relationship (the patient-and-doctor use case) is rendered neutrally. New contributions: **the recipient key-management problem stated, four concrete options, the two-mode solution, and the market observation.**

## The Problem

The question, raised directly by the product: **now that recipients have their own vaults, how does a recipient manage the key to their vault?**

The project lead: **"there was a really interesting question: now that we have vaults for recipients, how does the recipient manage the key of their vault? I am going to describe the current thinking and the current options we have."** So this brief lays out the options rather than settling on one, because the right answer depends on who manages the key and how easy it can be made (below). The key insight running through all the options is that a vault key behaves like a credential, and the hard part is not encrypting with it but storing and recovering it.

## Option 1: Password Managers

The simplest option: **treat the vault key like a password and store it in an existing password manager.**

The project lead: **"the vault key is just like a password, so you can use password managers for it: your local or Google password manager, LastPass, all sorts of existing password managers to save it. That is one way, which is not the best one."** So because the key behaves like a credential, any existing password manager can hold it (cross-ref: the research brief, where password managers now store SSH keys, secrets, and passkeys as a matter of course). It is the short-term answer, easy and familiar, but the project lead notes it is not the best one, because it leaves the key as a single secret the user must look after.

## Option 2: Public And Private Key, And The Private-Key Problem

The mode being added: **a public-and-private-key model, where the public key encrypts and the open problem is managing the private key.**

The project lead: **"the other mode we started to add support for is public and private key. The public key is the one that saves it. The question becomes how you manage the private key, which is a separate problem, a problem the industry needs to solve. The user should have a way to decrypt private data, and that is something we are going to implement to make it easy."** So the platform supports public-key encryption (the public key seals data into the vault; cross-ref: the v0.32.4 PKI-public-key-registry and the vault-to-vault-comms briefs), and the unsolved part is private-key management: where the private key lives and how the user decrypts with it. The project lead is candid that this is an industry-wide open problem, and the goal is to make decryption easy (the options below are the candidate answers).

## Option 3: Per-App Account Storage And Secure Enclaves

A storage location worth using: **secure enclaves and per-app account storage, such as storing the key in a Google account's per-app private data, so logging in with Google can hold and decrypt it.**

The project lead: **"one place is to use security enclaves. A Google account can store private data per app, so that is a nice place to put it. If the user logs in with Google, we can use it to decrypt, to hold the keys for the vault."** So the private key (or a wrapping key) can live in platform-provided secure storage: a secure enclave on the device, or per-app private storage tied to an account such as Google, so that signing in with that account makes the key available to decrypt the vault. This leans on infrastructure consumers already have and trust (cross-ref: the research brief on Secure Enclave, iCloud Keychain, and per-app key storage, and the v0.32.4 ephemeral-compute brief's secure enclaves).

## Option 4: The Provider Holds The Keys

The short-term, provider-side option: **the provider holds the private keys, which fits the first phase where the provider creates the vaults, with safe provider-side secret management and possibly a browser extension.**

The project lead: **"the other option in the short term is that the provider manages the keys for the recipient. Then we need to manage the secrets safely on the provider side too, and I am even thinking of creating a browser extension to manage some of the secrets from the provider's point of view. The provider will hold the private keys, because in the first phase the provider is creating the vaults."** So in the near term the provider holds the keys, which is natural because the provider creates the vaults (cross-ref: the central-key-management and shipping-vault briefs). This shifts the secret-management burden to the provider, who then needs safe storage (a browser extension is one candidate), and it is the custodial end of the spectrum the research brief frames as a convenience-versus-control trade-off.

## The Two-Mode Solution: The Provider Can Get Only The Results

A capability the current design already enables: **because the provider and the vault communicate securely with public and private keys, there can be a mode where the provider receives only the results and not all the materials are kept on the client side.**

The project lead: **"what is interesting is the solution already supports two modes, because there is already a way for the provider and the vault to communicate securely using public and private keys. That means you can have a mode where the provider only gets the results and not all the materials are saved on the client side. So it becomes a question of who manages it and how we make it super easy."** So the secure provider-to-vault channel (cross-ref: the vault-to-vault-comms and shipping-vault signed-message briefs) supports a data-minimising mode: the provider receives only the results, with less held client-side. This is a meaningful privacy lever, and it reframes the key question as who manages the key and how to make it effortless, rather than a single fixed design.

## The Market Observation

A closing strategic note: **there is a market for new services to help manage this information, and the password-manager companies should enter it.**

The project lead: **"there is a market here for new services that help manage this information, and the password-manager companies should be getting into this business."** So the recipient key-management problem is not only the platform's to solve: it is a market opportunity for dedicated key-management services, and the incumbent password-manager vendors are the natural entrants (the research brief shows several already moving toward secrets and key management).

## What This Asks For

1. **State the recipient key-management problem** (a vault key behaves like a credential; storage and recovery are the hard parts).
2. **Support password managers as the short-term path** (the key as a credential in an existing manager; easy, not best).
3. **Implement easy private-key management for the public-and-private-key mode** (where the private key lives; how the user decrypts; make it easy).
4. **Use per-app account storage and secure enclaves** (a Google-account per-app key, a device enclave; sign in to decrypt).
5. **Support the provider holding keys in phase one** (provider-side secret management; a possible browser extension).
6. **Offer the results-only mode** (the provider receives only results; less held client-side; a privacy lever).
7. **Make it super easy, and decide who manages the key** (the real questions).
8. **Watch the market** (dedicated key-management services; password-manager vendors as entrants).

Estimated effort: this is an options and direction brief, not a single build; the public-key encryption, the secure provider channel, and the central key management exist; the contribution is choosing and easing the private-key-management path. The near-term answer is likely the provider holding keys plus password-manager and enclave options for recipients, with the results-only mode available, informed by the accompanying research.

## What This Does Not Try To Be

- **Not a single fixed design.** A set of options chosen by who manages the key and how easy it is.
- **Not password-manager-only.** That is the easy short-term path, not the best one.
- **Not a solved private-key problem.** Managing the private key is an open, industry-wide problem.
- **Not always client-heavy.** A results-only mode keeps less on the client side.
- **Not only the platform's problem.** A market for key-management services exists.

## Honest Risks

**Risk 1: Lost keys mean lost data.** If a recipient loses their key with no recovery, their vault is unrecoverable. Mitigation: recovery is the central design question (cross-ref: the research brief on escrow, social recovery, and account recovery); choose an option with a recovery path.

**Risk 2: The provider holding keys concentrates trust.** Provider-held keys make the provider a custodian and a target. Mitigation: safe provider-side secret management; the results-only mode; scope and protect provider keys (cross-ref: the central-key-management brief).

**Risk 3: Password managers are a single secret to lose.** Convenient but the key is one secret. Mitigation: short-term only; move to enclave or recoverable models; strong authentication.

**Risk 4: Per-app account storage ties the key to a platform.** Depending on Google or a platform creates a dependency. Mitigation: treat it as one option; the research brief shows these models are mature and recoverable; avoid single lock-in (cross-ref: the sovereignty briefs).

**Risk 5: A sensitive domain raises the stakes.** Recipient data in a sensitive domain makes key handling weighty. Mitigation: the results-only mode; data minimisation; the privacy posture (cross-ref: the shipping-vault and event-capture briefs).

## Open Questions

| Question | Notes |
|----------|-------|
| Who manages the recipient's key by default? | Provider-held in phase one; recipient-held options later |
| How is the private key recovered if lost? | Escrow, social recovery, account recovery; the research brief |
| Which storage do we recommend to recipients? | Password manager, enclave, per-app account |
| How do we make decryption super easy? | The core usability goal |
| When is the results-only mode the default? | The data-minimising privacy lever |
| What does provider-side secret management look like? | Safe storage; a possible browser extension |
| Do we build or partner for key management? | The market for dedicated services |

## Relationship To Previous Briefs

| Date | Document | Relationship |
|---|---|---|
| 10 Jun | `v0.33.16__research-brief__sg-send-consumer-key-storage-recovery-industry-landscape.md` | The industry landscape and best practices behind these options |
| 4 Jun | `v0.32.3__arch-brief__sg-send-nhi-2.0-pki-foundations-accountability-key-controlled-memory.md` | The PKI foundations and the private-key-storage problem |
| 7 Jun | `v0.32.7__dev-brief__sg-send-central-key-management-openrouter-keys-to-child-vaults.md` | The provider managing keys for child vaults |
| 5 Jun | `v0.32.4__dev-brief__sg-send-pki-public-key-registry-on-vaults.md` | The public-and-private-key model and registry |
| 7 Jun | `vault-to-vault-comms-guide.md` (reference) | The secure provider-to-vault channel behind the results-only mode |
| 8 Jun | `v0.33.2__dev-brief__sg-send-shipping-vault-product-ui-crm-signed-message-updates.md` | The provider creating vaults; signed provider-to-vault messages |
| 5 Jun | `v0.32.4__arch-brief__sg-send-ephemeral-compute-actions-on-vaults-task-registry.md` | Secure enclaves as a key-holding location |

---

## Acceptance Criteria

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | The recipient key-management problem is stated | The key as a credential; storage and recovery are the hard parts |
| 2 | Password managers are supported short-term | The key stored in an existing manager |
| 3 | Easy private-key management is implemented | Where it lives; how the user decrypts; made easy |
| 4 | Per-app account storage and enclaves are used | A Google-account per-app key; a device enclave |
| 5 | The provider can hold keys in phase one | Provider-side secret management; possible browser extension |
| 6 | The results-only mode is available | The provider receives only results; less held client-side |
| 7 | The market is tracked | Dedicated key-management services; password-manager entrants |

---

This document is released under the Creative Commons Attribution 4.0 International licence (CC BY 4.0).
