# Why Zero-Knowledge?

The phrase "zero-knowledge" gets misused. In SG/Send, it means something precise: **the server never has the information needed to decrypt your files**.

## What the server stores

- Encrypted ciphertext (AES-256-GCM)
- A vault ID (random hex)
- An IP hash (SHA-256 with daily salt — not reversible)

No filenames. No keys. No metadata that reveals what you sent.

## What happens in your browser

1. You select a file
2. Your browser generates a random 256-bit AES key via Web Crypto API
3. Your browser encrypts the file with that key
4. Encrypted ciphertext is uploaded
5. The key lives in the URL fragment (`#key`) — browsers never send this to servers

The recipient's browser decrypts locally. The server is never in the decryption path.

## Why this matters

Most "secure" file sharing services encrypt data **at rest** — meaning they hold the keys. GDPR, legal discovery, data breaches, insider threats — all require the server to hold your keys.

SG/Send holds no keys. There is nothing to compel, breach, or leak.
