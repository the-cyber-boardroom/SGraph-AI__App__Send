# SG/Vault — Human Skill Guide

**Version:** v0.2.3  
**Audience:** Developers and users new to SG/Vault

---

## What is SG/Vault?

SG/Vault is a zero-knowledge encrypted vault hosted at `vault.sgraph.ai`. Files are encrypted in your browser using AES-256-GCM before upload. The server stores only ciphertext — it never sees your files, their names, or your encryption key.

Each vault is identified by a **vault token** (e.g. `apple-river-1234`) — a human-readable key that is also the encryption passphrase. Whoever has the token can read the vault. To write, you also need an **access key** (a write token).

---

## Opening a Vault

1. Navigate to `vault.sgraph.ai` or go directly to `vault.sgraph.ai/en-gb/vault#your-token`
2. The vault opens automatically when a token is in the URL hash
3. If no token is present, type your vault token into the entry form and click **Open Vault**

Once open, the vault decrypts the file tree in your browser and shows the file browser.

---

## Navigating the Vault

The vault has three views in the left sidebar:

| View | Icon | What it shows |
|------|------|--------------|
| **Files** | Folder icon | The file browser (default) |
| **SGit** | Git icon | Commit history, refs, branches, repair |
| **Settings** | Gear icon | Vault name, access key, danger zone |

Click a file in the **Files** view to open it in a tab. Multiple files can be open simultaneously in the tabbed panel.

---

## Page Layouts (`_page.json`)

If a vault contains a `_page.json` file, the vault renders it as a structured page with named sections. Each section maps to a file in the vault. Click a section name to navigate to it.

Example `_page.json`:
```json
{
  "title": "Private Health Score",
  "sections": [
    { "title": "Overview",     "file": "overview.md" },
    { "title": "Patient Flow", "file": "patient-flow.html" },
    { "title": "Data",         "file": "data.json" }
  ]
}
```

---

## HTML Apps Inside the Vault (app.json)

A vault can contain an `app.json` file that tells the vault to auto-open a specific HTML file in **App Mode** — a full-viewport iframe with vault chrome hidden. This is the **Change 5** / SG/App framework.

Example `app.json`:
```json
{
  "entry": "index.html",
  "auto_open": true,
  "present": true
}
```

The HTML app inside the vault can call `window.sg.vfs.*` to read and write vault files from within the iframe.

---

## Sharing

| Credential | Access | Use case |
|-----------|--------|---------|
| **Vault token** (e.g. `apple-river-1234`) | Read + navigate | Open vault, read all files |
| **Access key** | Write | Push changes, edit files, rename |
| **Share token** (from `sgit share`) | Read-only snapshot | Share a point-in-time view |

**Never commit vault tokens or access keys to Git.** Share them out-of-band (chat, email).

---

## SGit CLI

Install: `pip install sgit-ai`

```bash
sgit clone apple-river-1234     # Clone vault to local directory
sgit commit -m "Update docs"    # Commit local changes
sgit push                        # Push to server (requires access key)
sgit pull                        # Pull server changes
sgit share                       # Create read-only share token
```
