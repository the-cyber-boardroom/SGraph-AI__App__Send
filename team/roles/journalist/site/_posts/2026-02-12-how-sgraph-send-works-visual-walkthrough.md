---
layout: post
title: "How SGraph Send Works: A Visual Walkthrough"
date: 2026-02-12 20:00:00 +0000
author: SGraph Send Journalist
tags: [product, walkthrough, encryption]
excerpt: "A step-by-step walkthrough of SGraph Send's zero-knowledge encrypted file sharing, with screenshots from the live product."
---

SGraph Send is zero-knowledge encrypted file sharing. You drop a file into your browser, it gets encrypted before it ever leaves your device, and the encrypted blob is uploaded to the server. The decryption key stays with you. The server stores ciphertext it cannot read.

This article walks through the complete workflow, step by step.

---

## Step 1: The upload page

When you open SGraph Send, the header states the product's purpose plainly: "Zero-knowledge encrypted file sharing." Below it is a drag-and-drop zone with the message: "Drop your file here or click to browse — Encrypted in your browser before upload."

<img width="600" alt="Upload page with drop zone and test files section" src="https://github.com/user-attachments/assets/f6a37952-fddf-4842-877a-4d59b9ee81ee" />

That last phrase is doing real work. It is not marketing language. It is a description of what actually happens: the file is encrypted using AES-256-GCM in your browser, via the Web Crypto API, before any data is transmitted to the server. The encryption key is generated locally, on your device, and never sent anywhere.

---

## Step 2: File selected, ready to encrypt

After dropping a file, the interface shows you what you have selected and presents a single action: "Encrypt & Upload."

<img width="600" alt="File selected, showing test-data.json ready for encryption" src="https://github.com/user-attachments/assets/fb5e68b7-a741-4aff-a816-99974695a067" />

Nothing has happened yet. The file has not left your browser. No network request has been made. The file sits in browser memory, waiting for you to confirm. When you click that button, two things happen in rapid sequence: (1) the browser generates a fresh AES-256-GCM key and encrypts the file, and (2) the encrypted blob is uploaded to the server. The plaintext never touches the network.

---

## Step 3: Encrypted and uploaded

The file has been encrypted and uploaded. The success screen gives you two pieces of information you need to share with your recipient:

<img width="600" alt="File sent with download link, decryption key, and transparency panel" src="https://github.com/user-attachments/assets/f5bcbf42-36d1-4c4d-abc0-83bc3083c48a" />

- **Download link** — a URL pointing to the encrypted file on the server.
- **Decryption key** — a base64url-encoded string that exists only in your browser.

Between these two fields, a security tip reads: "For best security, share the link and the key via different channels." Send the link by email. Send the key by Signal. If someone intercepts the email, they get a link to an encrypted blob they cannot read. If someone intercepts the message, they get a key with nothing to decrypt.

Below the sharing fields is the **transparency panel**:

- File size: recorded
- File name: **NOT stored**
- Decryption key: **NOT stored** (only you have it)
- Raw IP: **NOT stored**

And then: "That's everything. Nothing else is captured."

---

## Step 4: The recipient's download page

The recipient sees that an encrypted file is waiting and a single input field: "Paste the decryption key here."

<img width="600" alt="Download page showing encrypted file and decryption key input" src="https://github.com/user-attachments/assets/2bcf7574-8eb7-4456-9a0f-442bd5d7a644" />

The recipient cannot do anything without the key. The server has the encrypted blob but cannot decrypt it. The download page has the interface but cannot decrypt without the key. This is the channel separation principle in action.

---

## Step 5: Decryption succeeds

A green success message confirms: "File decrypted and saved successfully."

<img width="600" alt="Download confirmation with transparency panel showing zero-knowledge proof" src="https://github.com/user-attachments/assets/a7e52ea7-d310-4f9a-8c77-8ca752dc77e0" />

The transparency panel appears again, from the recipient's perspective — showing what the server captured about the download. The decryption happened entirely in the browser. The server served the encrypted blob over HTTPS, but the actual decryption happened on the recipient's device.

---

## Step 6: The original file, intact

<img width="600" alt="Original test-data.json opened in text editor, content intact" src="https://github.com/user-attachments/assets/2b8f882f-1526-4084-928d-90c9602227e5" />

The downloaded file is byte-for-byte identical to what was uploaded. AES-256-GCM is a symmetric cipher: encrypt with a key, decrypt with the same key, get the exact original bytes back. If even a single bit were different, GCM's built-in authentication would reject the decryption entirely rather than produce a corrupted file.

---

## The security model

Three properties make SGraph Send's approach meaningfully different from conventional file sharing.

### The server cannot read your files

This is not a policy decision. It is an architectural fact. The decryption key is generated in your browser and never transmitted to the server. A full server compromise yields encrypted data that cannot be decrypted.

### Channel separation protects against interception

Share the link by email, the key by Signal:

- An attacker who compromises your email gets ciphertext they cannot read.
- An attacker who compromises your Signal gets a key with nothing to apply it to.
- Only an attacker who compromises both channels simultaneously can access the file.

### Transparency replaces trust

The transparency panel shows a live data receipt at every stage. What the server returns is what the user sees. If the server stores something new in a future version, it will appear in the transparency panel. If it does not appear there, it is not stored.

---

## What comes next

SGraph Send is currently in private beta. The core workflow — encrypt, upload, share, download, decrypt — works end-to-end on live infrastructure. The near-term roadmap includes polished UI and branding, additional sharing modes, multi-language support, and accessibility improvements.

If you are interested in trying SGraph Send, reach out. The "friendlies" beta is open to early users who want private, zero-knowledge file sharing that works without installing anything, without creating an account, and without trusting the server with their data.

---

*Try SGraph Send at [send.sgraph.ai](https://send.sgraph.ai).*
