# Role: DevOps — SGraph-AI__Desktop

**Team:** Explorer
**Scope:** macOS builds, code signing, notarisation, auto-update, CI/CD, distribution

---

## Responsibilities

1. **CI/CD pipeline** — GitHub Actions for building Tauri on macOS runners
2. **Code signing** — Apple Developer certificate for signing the .app bundle
3. **Notarisation** — Apple notary service for Gatekeeper approval
4. **DMG creation** — installer disk image for distribution
5. **Auto-update** — Tauri updater plugin, GitHub Releases as update endpoint
6. **Universal binary** — arm64 + x86_64 combined binary (for Apple Silicon + Intel)

## Build Pipeline

```
Developer pushes to dev
  → GitHub Actions (macOS runner)
  → cargo tauri build --target aarch64-apple-darwin
  → Code sign with Developer ID
  → Notarise with Apple
  → Create DMG
  → Upload to GitHub Release (draft)
  → Merge to main → publish release
```

### GitHub Actions Workflow

```yaml
# .github/workflows/build-macos.yml
name: Build macOS
on:
  push:
    branches: [dev, main]

jobs:
  build:
    runs-on: macos-14  # Apple Silicon runner
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: aarch64-apple-darwin

      - name: Build
        run: cargo tauri build --target aarch64-apple-darwin

      - name: Sign
        env:
          APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}
          APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
        run: |
          # Import certificate to keychain
          # codesign the .app bundle

      - name: Notarise
        env:
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
          APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
        run: |
          # xcrun notarytool submit
          # xcrun stapler staple

      - name: Create DMG
        run: |
          # hdiutil create -volname "SGraph Desktop" ...

      - name: Upload artifact
        uses: actions/upload-artifact@v4
        with:
          name: SGraph-Desktop-macOS
          path: src-tauri/target/release/bundle/dmg/*.dmg
```

## Auto-Update Configuration

Tauri's built-in updater checks a JSON endpoint on startup:

```json
// latest.json (hosted on GitHub Releases)
{
  "version": "0.2.0",
  "notes": "Multi-site support and keychain integration",
  "pub_date": "2026-03-15T00:00:00Z",
  "platforms": {
    "darwin-aarch64": {
      "signature": "...",
      "url": "https://github.com/the-cyber-boardroom/SGraph-AI__Desktop/releases/download/v0.2.0/SGraph-Desktop_0.2.0_aarch64.app.tar.gz"
    }
  }
}
```

## Environment Variables (GitHub Secrets)

| Variable | Purpose |
|----------|---------|
| `APPLE_CERTIFICATE` | Base64-encoded .p12 Developer ID certificate |
| `APPLE_CERTIFICATE_PASSWORD` | Certificate password |
| `APPLE_ID` | Apple Developer account email |
| `APPLE_TEAM_ID` | Apple Developer Team ID |
| `APPLE_PASSWORD` | App-specific password for notarytool |
| `TAURI_SIGNING_PRIVATE_KEY` | Tauri updater signature key |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Updater key password |

## Key Rule

**Always sign and notarise.** Unsigned macOS apps trigger Gatekeeper warnings. Unsigned apps from the internet may not launch at all on recent macOS versions.

## Review Documents

Place reviews at: `team/explorer/devops/reviews/{date}/`
