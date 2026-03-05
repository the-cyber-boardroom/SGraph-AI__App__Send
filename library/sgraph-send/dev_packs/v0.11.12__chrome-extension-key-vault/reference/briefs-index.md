# Briefs Index

**Version:** v0.11.12

All source briefs referenced by this dev pack, with summaries.

---

## Primary Brief

| Version | Date | File | Summary |
|---------|------|------|---------|
| v0.11.1 | 4 Mar 2026 | `team/humans/dinis_cruz/briefs/03/04/v0.11.1__dev-brief__chrome-extension-key-vault.md` | 11-part comprehensive brief: core architecture (Part 1), security posture detection (Part 2), extension vs other extensions (Part 3), independent API channel (Part 4), page detection (Part 5), cross-device 2FA (Part 6), multi-browser support (Part 7), extension.sgraph.ai management UI (Part 8), Chrome Web Store distribution (Part 9), corporate branded extensions (Part 10), DevOps pipeline (Part 11) |

## Related Briefs (Same Date)

| Version | Date | File | Relevance |
|---------|------|------|-----------|
| v0.11.1 | 4 Mar 2026 | `v0.11.1__daily-brief__sgraph-send-04-mar-2026.md` | Daily brief context |

## Related Architecture (Other Dates)

| Version | Date | File | Relevance |
|---------|------|------|-----------|
| v0.11.08 | 5 Mar 2026 | `v0.11.08__arch-brief__tools-canonical-component-library.md` | tools.sgraph.ai — the extension will import shared JS from here |

## Cross-References

The extension interacts with multiple SG/Send subsystems:
- **Vaults** — extension stores and provides vault keys
- **Workspace** — extension provides persistent session keys
- **Data rooms** — extension auto-provides decryption keys to recipients
- **PKI** — extension holds Ed25519 identity keys for signing
- **Transfer API** — extension uses as relay for cross-device communication
