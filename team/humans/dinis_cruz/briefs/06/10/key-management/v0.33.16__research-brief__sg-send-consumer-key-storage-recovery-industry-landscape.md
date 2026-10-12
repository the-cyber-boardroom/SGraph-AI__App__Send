# Research: How The Industry Helps People Store And Recover Their Keys

**version** v0.33.16
**date** 10 June 2026
**from** Research (executed for the project lead)
**to** Architect, Security, Developer (lead), Product, @Dev
**type** Research brief (executed findings)

---

## What This Is

Executed research, requested alongside the recipient key-management options brief (cross-ref: the v0.33.16 recipient-vault-key-management-options brief): **a survey of how the industry helps ordinary people store and recover the keys that protect their data, the leading products and patterns, the recognised best practices, and how they map onto the options on the table.** It covers passkeys and platform credential stores, device secure enclaves, password managers as key stores, crypto-wallet self-custody, and the NIST and OWASP key-management guidance. Findings are paraphrased from the sources listed at the end. The recipient-and-provider framing is kept neutral.

## The Central Finding: Storage Is Easy, Recovery Is The Hard Part

The single most important theme across every source is that storing a key safely is well solved, but recovering a key the user has lost is the genuinely hard problem, and the two pull in opposite directions. The OWASP Key Management Cheat Sheet is blunt that data encrypted with a lost key is gone for good, which is why a secure key-backup capability matters. The crypto-wallet literature frames the same tension as convenience versus control, or custodial versus self-custody: the more the user alone holds the key, the more sovereign they are and the more easily they lose everything; the more a provider helps hold or recover it, the more convenient and the less sovereign. Every option in the companion brief sits somewhere on that spectrum, and the design question is really where on it to sit and how to make recovery safe.

## Landscape 1: Passkeys, FIDO2, And Synced Credential Stores

The clearest industry direction for consumer key handling is passkeys, the user-facing form of FIDO2 and WebAuthn. The model is exactly the public-and-private-key model in the options brief: the device generates a key pair, the public key goes to the service, and the private key stays on the device and signs a challenge to authenticate, so nothing reusable is stored on the server and the credential is phishing-resistant by design.

The relevant part for key storage is how passkeys are kept and synced. The industry splits them into device-bound passkeys, where the private key never leaves a single device or security key, and synced passkeys, where the private key is encrypted and synced through a provider's cloud so it is available across the user's devices. The major synced-credential providers are Apple's iCloud Keychain (Apple Passwords), Google Password Manager, and the password managers 1Password and Bitwarden. NIST's updated digital-identity guidance now recognises synced passkeys as phishing-resistant authentication, and Apple, Google, and Microsoft have committed jointly to the standard, so this is the mainstream consumer direction. The lesson for the project is that the synced-credential providers are exactly the infrastructure a recipient could lean on to hold a vault key across devices.

## Landscape 2: Device Secure Enclaves And Platform Escrow Recovery

Underneath the synced model sits hardware: private keys are generated and held in secure hardware such as Apple's Secure Enclave, a TPM, or a hardware security key, so the key material is protected even on a compromised device. This is the secure-enclave option in the brief, and it is mature consumer infrastructure.

Apple's published security documentation is the best worked example of making such keys both end-to-end encrypted and recoverable, which is the hard combination. Apple's end-to-end-encrypted categories (including passwords and keychain) use keys that exist only on the user's trusted devices and are never available to Apple's servers. To make recovery possible without giving Apple the keys, iCloud Keychain uses an escrow service: the keychain is escrowed, wrapped to the user's device passcode or security code and to the public key of a hardware-security-module cluster, and recovery requires authenticating to the account, responding to an SMS, and proving knowledge of the security code via the Secure Remote Password protocol so the code itself is never sent. The HSM cluster allows only ten attempts before it destroys the escrow record, defeating brute force at the cost of the data. The candid trade-off Apple documents is that if the user loses access to the keychain and all its recovery mechanisms, the end-to-end-encrypted data is lost and Apple cannot help. Apple also offers account recovery contacts and an account recovery key as additional recovery paths. The lesson is that a recoverable end-to-end-encrypted key store is achievable, but recovery has to be engineered deliberately, with rate-limited, hardware-backed escrow and explicit fallback paths.

## Landscape 3: Password Managers As Key Stores

The options brief's short-term path, a password manager, is increasingly a first-class key store rather than just a password vault. Both leading products now store cryptographic material directly: 1Password manages SSH keys, API tokens, infrastructure secrets, and passkeys in its core product, with an SSH agent that stores and syncs keys and avoids unencrypted local key files; Bitwarden added an SSH item type that encrypts and stores private keys in the vault, can generate Ed25519 and RSA keys, and releases them only after user authentication. Both encrypt the vault at rest and in transit, and 1Password additionally protects the account with a device-generated secret key on top of the master password, so a stolen master password alone cannot decrypt the data.

So password managers validate the brief's option one and have moved well beyond it: storing a vault key as a secure item in a password manager is a real, supported pattern today. The caveat is the obvious one, the user must protect the master credential, and recovery of the manager itself becomes the new single point of failure.

## Landscape 4: Crypto Wallets, The Most Tested Self-Custody UX

No domain has stress-tested consumer key custody more than cryptocurrency, and its lessons map directly onto provider-held versus recipient-held keys. The traditional model is a seed phrase, a master backup the user must store offline (paper or metal), which is a notorious single point of failure: lose it and the funds are gone, and anyone who finds it has full control. Hardware wallets keep the key offline and are treated as the gold standard for individuals.

The more interesting development is the move beyond the seed phrase. Multi-party computation wallets split the private key into encrypted shares distributed across parties, for example the user, the service provider, and a recovery backup, so a full key never exists in one place and no single share can be stolen. This enables social recovery (regaining access through trusted parties or a provider rather than a memorised phrase), biometric restoration, and web-style logins while remaining non-custodial. A closely related classic technique is splitting a secret into shares given to several trusted contacts, any threshold of whom can reconstruct it, so the key survives losing some shares. The crypto literature is explicit that the security profile depends entirely on the distribution model: the more shares the user alone holds, the more sovereign but the more fragile; delegating a share to a provider buys convenience and recovery at the cost of some sovereignty. This is precisely the provider-held-keys option in the brief, expressed as a spectrum rather than a binary.

## Recognised Best Practices: NIST And OWASP

The standards converge on a few rules directly relevant to the recipient key problem. NIST SP 800-57 is the canonical reference for key management and key strength. The OWASP Key Management Cheat Sheet adds the operational rules: encrypted data with a lost key is unrecoverable, so a secure key-backup capability is essential for long-term data at rest; when keys are backed up, the store should use a FIPS-validated module; it can be useful to escrow encryption keys for recovery or re-provisioning, but signing keys should never be escrowed; keys should be wrapped (encrypted) with a key of equal or greater strength; and there should be an accountability system tracking every access to private keys in plaintext.

| Best Practice | Why It Matters Here |
|---------------|---------------------|
| Lost key means lost data; provide secure backup | Recovery must be designed in, not bolted on |
| Escrow encryption keys, never signing keys | A recoverable decryption key is fine; a recoverable signing key breaks accountability |
| Back up keys in a FIPS-validated module or HSM | The Apple escrow model in practice |
| Wrap keys with an equal-or-stronger key | Standard for storing or distributing keys |
| Account for every plaintext private-key access | Provenance and accountability, consistent with the PKI work |

The escrow rule is the sharpest for the project: because the platform uses keys both to encrypt vault data and to sign updates (cross-ref: the shipping-vault signed-message brief), the encryption keys can have a recovery or escrow path, but the signing keys must not, or the accountability the signed-update model depends on is lost.

## How The Industry Maps Onto The Options

| Option In The Brief | Industry Analogue | Best-Practice Note |
|---------------------|-------------------|--------------------|
| Password managers | 1Password and Bitwarden storing keys, secrets, passkeys | Real and supported; protect the master credential; manager recovery becomes the single point of failure |
| Public-and-private key | Passkeys, FIDO2, WebAuthn | The mainstream direction; the private-key handling is the work |
| Per-app account storage and enclaves | Secure Enclave, iCloud Keychain, Google Password Manager, Android Keystore | Mature; pair with rate-limited, HSM-backed escrow for recovery |
| Provider holds the keys | Custodial and delegated-share MPC wallets | A point on the custody spectrum; buys recovery; escrow encryption keys only |
| Results-only mode | Data minimisation | Reduces what a lost key can lose; complements any option |

## What This Suggests For The Recipient Key Problem

1. **Design recovery first.** The hard problem is the lost key, not storage; choose options that have a safe recovery path (escrow, social recovery, account recovery).
2. **Lean on synced credential stores and enclaves.** iCloud Keychain, Google Password Manager, 1Password, and Bitwarden, backed by device secure enclaves, are the mature consumer answer to holding a private key across devices.
3. **Copy Apple's escrow pattern for recoverable end-to-end encryption.** Wrap the recovery key to a user secret and an HSM, rate-limit attempts, and offer explicit fallback contacts or a recovery key.
4. **Treat provider-held keys as one point on a spectrum.** Custodial and MPC delegated-share models give recovery and convenience; use the results-only mode to limit exposure.
5. **Never escrow the signing keys.** Encryption keys can be recoverable; signing keys must not be, to preserve the signed-update accountability model.
6. **Consider MPC or secret-sharing for the high-assurance path.** Splitting the key across the recipient, the provider, and a backup removes the single point of failure while keeping it non-custodial.
7. **Account for every plaintext key access.** Consistent with the platform's PKI and provenance work.

## Honest Limitations

- This is a landscape survey, not a security review of any specific product or a recommendation of one vendor.
- Synced-credential and per-app models create a platform dependency that must be weighed against the platform's sovereignty principles.
- Escrow and social-recovery designs add trusted parties; each must be assessed for the sensitive domain.
- The crypto-wallet patterns are mature but come from a high-stakes adversarial environment; adopt the techniques (MPC, social recovery, secret sharing), not the culture.

## Sources

- Microsoft Learn, passkeys (FIDO2) in Microsoft Entra ID: https://learn.microsoft.com/en-us/entra/identity/authentication/concept-authentication-passkeys-fido2 and https://learn.microsoft.com/en-us/entra/identity/authentication/how-to-enable-passkey-fido2
- FIDO Alliance, passkeys overview: https://fidoalliance.org/passkeys/
- WebAuthn passkeys explainer: https://www.webauthn.me/passkeys
- Apple Support, Secure iCloud Keychain recovery: https://support.apple.com/guide/security/secure-icloud-keychain-recovery-secdeb202947/web
- Apple Support, Escrow security for iCloud Keychain: https://support.apple.com/guide/security/escrow-security-for-icloud-keychain-sec3e341e75d/web
- Apple Support, iCloud data security overview: https://support.apple.com/en-us/102651
- Apple Support, iCloud encryption (end-to-end encrypted service keys): https://support.apple.com/guide/security/icloud-encryption-sec3cac31735/web
- OWASP Key Management Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Key_Management_Cheat_Sheet.html
- NIST SP 800-57 Part 1 (Recommendation for Key Management): https://csrc.nist.gov/projects/key-management/key-management-guidelines
- Ledger Academy, seedless wallets versus recovery key: https://www.ledger.com/academy/topics/ledgersolutions/seedless-wallets-vs-ledger-recovery-key
- ChainUp, MPC self-custody wallets beyond seed phrases: https://www.chainup.com/blog/mpc-self-custody-wallets-beyond-seed-phrases/
- 1Password, secrets management and SSH keys: https://1password.com/compare/bitwarden-vs-1password
- Bitwarden SSH agent announcement: https://www.businesswire.com/news/home/20250128318950/en/

---

This document is released under the Creative Commons Attribution 4.0 International licence (CC BY 4.0).
