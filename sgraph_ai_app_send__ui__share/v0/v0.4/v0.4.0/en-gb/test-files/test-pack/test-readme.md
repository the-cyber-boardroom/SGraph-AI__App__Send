# SG/Send Test Document

**Version:** v0.16.26
**Date:** 19 March 2026

## Overview

SG/Send is a zero-knowledge encrypted file sharing service. Files are encrypted
in the browser using AES-256-GCM before upload. The decryption key never leaves
the sender's device.

## Key Features

- **Zero-knowledge encryption** — server never sees plaintext
- **Gallery mode** — browse files with rich preview
- **Folder support** — drag and drop entire folders
- **Multiple delivery modes** — download, browse, gallery, or zip

## Architecture

| Component | Technology |
|-----------|-----------|
| Frontend | Vanilla JS + Web Components |
| Encryption | Web Crypto API (AES-256-GCM) |
| Backend | FastAPI + Lambda |
| Storage | Memory-FS (pluggable) |

## Getting Started

1. Drop a file or folder onto the upload area
2. Choose a delivery mode
3. Encrypt and send
4. Share the link with the recipient

> "Your files, your keys, your privacy."

---

*This is a test file for validating markdown rendering in gallery mode.*
