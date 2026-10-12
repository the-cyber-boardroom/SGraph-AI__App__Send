# How To Clone, Edit, And Update A Vault With SGit

**A self-contained guide.** You can drop this whole document into a Claude session, attach it, and say "read this and go for it", or you can follow the steps yourself in a terminal. It assumes no prior knowledge of SGit or vaults.

---

## What You Are About To Do

You are going to take an existing encrypted vault, make changes to it, and send those changes back, all without anyone but you ever seeing the unencrypted contents. By the end you will have cloned the vault to your machine, edited its files, and pushed your changes to the server.

## What A Vault Is (In One Minute)

A vault is a versioned, encrypted folder. Think of it as "git for encrypted files":

- Everything is encrypted on your own device before it leaves, so the server never sees the unencrypted contents (this is what "zero-knowledge" means).
- It keeps a version history, so every change is a commit you can review or undo.
- You access a vault with a vault key, which has the form `passphrase:vault-id`. The passphrase decrypts the contents and never leaves your machine; the vault ID tells the server which vault you mean.
- There is no password reset. If you lose the vault key, the contents are unrecoverable. Save your vault key somewhere safe.

The tool that does all of this is a command-line program called `sgit`.

## Before You Start: Two Preconditions

1. **Network access to the SGit service.** The machine running this needs to reach the SGit domains (for example `*.sgit.ai`). If you are in an environment that restricts network access, allow those domains first. From a normal terminal with internet access this is already fine.
2. **The vault key.** You need the vault key for the vault you want to edit, in the form `passphrase:vault-id`. Whoever shared the vault with you provides this. Keep it private.

That is all. Everything else the guide installs and does for you.

---

## Step 1: Install SGit

```bash
pip3 install sgit-ai --break-system-packages
```

This installs the `sgit` command. You only need to do this once per machine.

## Step 2: Clone The Vault

Replace the example key with your real vault key (`passphrase:vault-id`):

```bash
sgit clone mypassphrase:vault-abc123 my-vault
```

This downloads the vault, decrypts it locally, and creates a folder called `my-vault` with the vault's files inside. Move into it:

```bash
cd my-vault
```

## Step 3: Look Around And Understand The Vault

See what is in the vault and read the files normally:

```bash
ls -la
sgit status
```

`ls` lists the files; `sgit status` shows the current state (which branch you are on, whether you have changes, and the next recommended command). Open and read any file with `cat` or your editor to understand how the vault is built before you change anything. If you want a fuller picture of how the vault is structured, run:

```bash
sgit status --explain
```

## Step 4: Make Your Changes

Edit, add, or delete files in the `my-vault` folder exactly as you would with any normal folder. Use your editor, or create and change files from the command line. There is no special "vault mode": you are just changing files in a folder, and SGit will track what changed.

When you want to see what you have changed so far:

```bash
sgit diff
```

## Step 5: Save Your Changes (Commit)

A commit is a saved snapshot of all your changes, with a short description. SGit snapshots the whole folder, so you do not need to stage individual files:

```bash
sgit commit "describe what you changed"
```

## Step 6: Send Your Changes Back (Push)

Pushing uploads your committed changes to the server (encrypted, as always). The first time you push you may need an access token, which whoever shared the vault can give you:

```bash
sgit push --token your-token-here
```

After the first use the token is remembered, so later you can simply run:

```bash
sgit push
```

That is the whole loop: clone, edit, commit, push.

---

## If Someone Else Changed The Vault

To pull in changes other people have made since you cloned:

```bash
sgit pull
```

Do this before you start editing if the vault is shared, so you are working from the latest version.

## If You Want To Undo Something

```bash
sgit diff                 # see what you have changed since the last commit
sgit revert               # throw away all uncommitted changes, back to the last commit
sgit revert filename      # undo changes to just one file
```

Because every commit is saved in the history, you can always get back to a known-good state.

## How It Works (The Mental Model)

You do not need this to use the vault, but it helps:

- **You work on a local copy.** Your clone has its own private key that never leaves your machine. `sgit push` is what forwards your committed changes to the shared copy on the server.
- **Commit then push.** Just like git, you commit first (save a snapshot locally) and push second (upload it). Nothing reaches the server until you push.
- **Only changes are uploaded.** SGit uploads only what actually changed, not the whole vault every time.
- **The server never sees your data.** All encryption and decryption happen on your machine. The server stores encrypted blobs it cannot read.

## Quick Reference

| Goal | Command |
|------|---------|
| Install | `pip3 install sgit-ai --break-system-packages` |
| Clone a vault | `sgit clone passphrase:vault-id my-vault` |
| See the state | `sgit status` |
| See your changes | `sgit diff` |
| Save changes | `sgit commit "message"` |
| Send changes back | `sgit push --token your-token` (then just `sgit push`) |
| Get others' changes | `sgit pull` |
| Undo changes | `sgit revert` |

## Troubleshooting

- **A network or connection error on clone or push.** The machine cannot reach the SGit service; allow network access to the SGit domains (for example `*.sgit.ai`) and try again.
- **A permission or token error on push.** Push needs an access token the first time; add `--token your-token`.
- **`sgit: command not found`.** The install did not complete or is not on your path; re-run the install in Step 1.
- **Cannot decrypt or clone.** Check the vault key is exactly `passphrase:vault-id`, with the right passphrase and the right vault ID.

---

## How To Use This Document As A Prompt

If you are handing this to a Claude session: attach this file, provide your vault key (`passphrase:vault-id`), and say something like "Read the attached guide and use it to clone my vault, then make the following changes ...". The session will install SGit, clone the vault, make the changes, and push them back, following the steps above. If you are working in a terminal yourself, just follow the steps in order.
