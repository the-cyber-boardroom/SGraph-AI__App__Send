---
layout: page
title: Transparency
subtitle: What the server stores, what it does not, and how you can verify it
permalink: /transparency/
---

Most services tell you what they collect in a privacy policy — a legal document that nobody reads, written after the product is built. SGraph Send takes a different approach: it shows you what the server knows, in real time, as part of the product itself.

---

## The transparency panel

After every upload and every download, SGraph Send displays a **transparency panel** — a live data receipt that lists exactly what was captured and what was not. This is not buried in settings. It is displayed right there, immediately, as part of the product experience.

---

<div class="data-grid">
  <div class="data-card stored">
    <h3>What we store</h3>
    <ul>
      <li><strong>Encrypted file</strong> — the binary blob your browser encrypted. We cannot read it.</li>
      <li><strong>File size</strong> — the size in bytes of the encrypted payload.</li>
      <li><strong>IP hash</strong> — a SHA-256 hash of your IP address. We cannot reverse this to get your actual IP.</li>
      <li><strong>Timestamp</strong> — when the upload or download happened.</li>
      <li><strong>Content type hint</strong> — what your browser reports as the MIME type (not the actual file type).</li>
      <li><strong>Download count</strong> — how many times the file has been downloaded.</li>
    </ul>
  </div>

  <div class="data-card not-stored">
    <h3>What we do NOT store</h3>
    <ul>
      <li><strong>File name</strong> — the original file name is never sent to the server.</li>
      <li><strong>Decryption key</strong> — only you have it. It exists in your browser and nowhere else.</li>
      <li><strong>Raw IP address</strong> — we hash it immediately. The original IP is discarded.</li>
      <li><strong>File content</strong> — the server stores encrypted bytes. Without your key, the content is unreadable.</li>
      <li><strong>User accounts</strong> — there are no accounts. No emails. No passwords. No tracking across transfers.</li>
    </ul>
  </div>
</div>

---

## "Show live, store anonymised"

SGraph Send follows a simple pattern: **show the user what is happening in real time, store only the anonymised version.**

When you upload a file, the transparency panel shows you exactly what was recorded. When someone downloads your file, the download event is logged with their hashed IP and a timestamp — and you can see this on the transfer's status page.

Nothing is hidden. Nothing is retroactively added. If the server stores something new in a future version, it will appear in the transparency panel. If it does not appear there, it is not stored.

---

## Why this matters

### Privacy policies are promises. Transparency panels are proof.

A privacy policy says "we collect X and Y." A transparency panel says "here is exactly what was collected from this specific action, right now." One is a general statement about intent. The other is a verifiable receipt.

### The server cannot cheat

Because the encryption happens in your browser, the server has no opportunity to intercept the plaintext. The decryption key never touches the server. Even if the server wanted to read your files, it architecturally cannot.

### Verify it yourself

The transparency panel displays the same data that the server's API returns. There is no client-side filtering or selective presentation. What the server sends is what you see. The [source code is open](https://github.com/the-cyber-boardroom/SGraph-AI__App__Send) — you can verify this yourself.

---

## What a complete server breach looks like

If an attacker gains full access to the server — every Lambda function, every S3 bucket, every log file — they get:

- Encrypted binary blobs they cannot decrypt (no key)
- SHA-256 hashes of IP addresses they cannot reverse
- Timestamps and file sizes
- That is all

They do **not** get file names, file content, decryption keys, or raw IP addresses. A full server breach is, by design, a non-event for file confidentiality.

---

*This is what we mean by zero-knowledge. Not a policy. An architecture.*

*Try it yourself at [send.sgraph.ai](https://send.sgraph.ai).*
