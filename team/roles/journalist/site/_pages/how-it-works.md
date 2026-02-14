---
layout: page
title: How It Works
subtitle: A step-by-step guide to zero-knowledge encrypted file sharing
permalink: /how-it-works/
---

SGraph Send encrypts your files in your browser before they ever leave your device. The decryption key stays with you. The server stores only encrypted bytes it cannot read. Here is how it works.

<div class="step">
  <span class="step-number">1</span>
  <h3>You pick a file</h3>
  <p>Open <a href="https://send.sgraph.ai">send.sgraph.ai</a> and drop a file onto the upload page, or click to browse. The file sits in your browser's memory. Nothing has been sent anywhere.</p>
</div>

<div class="step">
  <span class="step-number">2</span>
  <h3>Your browser encrypts it</h3>
  <p>When you click "Encrypt & Upload," your browser generates a fresh 256-bit encryption key using the <strong>Web Crypto API</strong> — a standard built into every modern browser. The file is encrypted with <strong>AES-256-GCM</strong>, a symmetric cipher that provides both confidentiality and integrity. The plaintext never touches the network.</p>
</div>

<div class="step">
  <span class="step-number">3</span>
  <h3>The encrypted blob is uploaded</h3>
  <p>The server receives an opaque binary blob — encrypted bytes that it cannot read. It stores the blob along with minimal metadata: a hashed version of your IP address, a timestamp, and the file size. It does <strong>not</strong> receive the file name, the decryption key, or any indication of what the file contains.</p>
</div>

<div class="step">
  <span class="step-number">4</span>
  <h3>You share the link and the key separately</h3>
  <p>After upload, you receive two things:</p>
  <ul>
    <li><strong>A download link</strong> — points to the encrypted file on the server</li>
    <li><strong>A decryption key</strong> — exists only in your browser</li>
  </ul>
  <p>For best security, share these via <strong>different channels</strong>. Send the link by email. Send the key by Signal, WhatsApp, or a text message. If someone intercepts one channel, they get something useless without the other half.</p>
</div>

<div class="step">
  <span class="step-number">5</span>
  <h3>The recipient decrypts in their browser</h3>
  <p>Your recipient opens the download link, pastes the decryption key, and clicks "Download & Decrypt." Their browser fetches the encrypted blob from the server, decrypts it locally using the Web Crypto API, and saves the original file. The server was a delivery mechanism for data it could not read.</p>
</div>

---

## The key stays with you

The decryption key is generated in your browser and **never transmitted to the server**. The server receives and stores an encrypted blob. Without the key, that blob is computationally useless — AES-256 has 2^256 possible keys, a number larger than the estimated atoms in the observable universe.

A full server compromise — every Lambda function, every S3 bucket, every log file — yields encrypted data that cannot be decrypted. This is the "zero-knowledge" guarantee: the server has zero knowledge of your file content, by construction.

## Channel separation

The security tip displayed after upload — "share the link and the key via different channels" — is the most important operational practice:

- An attacker who compromises your email gets a link to ciphertext they cannot read.
- An attacker who compromises your messenger gets a key with nothing to apply it to.
- Only an attacker who compromises **both channels simultaneously** can access the file.

This is a meaningful upgrade over the common practice of sending a file and its password in the same email thread.

## No silent corruption

AES-256-GCM includes a built-in authentication tag. If even a single bit of the encrypted data is altered, decryption fails entirely with a clear error message — rather than producing a corrupted file. You either get the exact original, or you get a clear failure. Never silent corruption.

---

*Want to try it?* Visit [send.sgraph.ai](https://send.sgraph.ai) — no account required.
