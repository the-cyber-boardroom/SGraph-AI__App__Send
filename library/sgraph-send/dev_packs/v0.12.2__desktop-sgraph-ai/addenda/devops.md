# DevOps Summary for SGraph-AI__Desktop

---

## Distribution: GitHub Releases (Not App Store)

SGraph Desktop is distributed via GitHub Releases, not the Mac App Store. This gives:
- Full control over release timing
- No App Store review delays
- No sandbox restrictions (needed for file associations and keychain)
- Tauri updater works natively with GitHub Releases

### Release Artifacts

| Artifact | Purpose |
|----------|---------|
| `SGraph-Desktop_x.y.z_aarch64.dmg` | macOS Apple Silicon installer |
| `SGraph-Desktop_x.y.z_x64.dmg` | macOS Intel installer |
| `SGraph-Desktop_x.y.z_universal.dmg` | macOS universal binary (future) |
| `latest.json` | Tauri updater manifest |

---

## CI/CD Pipeline

### Build Matrix

```yaml
# .github/workflows/build-macos.yml
name: Build macOS
on:
  push:
    branches: [dev, main]
    paths:
      - 'src-tauri/**'
      - 'src/**'
      - '.github/workflows/build-macos.yml'

jobs:
  build:
    strategy:
      matrix:
        include:
          - target: aarch64-apple-darwin
            runner: macos-14
            arch: aarch64
          # - target: x86_64-apple-darwin    # Enable later
          #   runner: macos-13
          #   arch: x64

    runs-on: ${{ matrix.runner }}
    steps:
      - uses: actions/checkout@v4

      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: ${{ matrix.target }}

      - name: Build Tauri app
        run: cargo tauri build --target ${{ matrix.target }}

      - name: Upload artifact
        uses: actions/upload-artifact@v4
        with:
          name: SGraph-Desktop-${{ matrix.arch }}
          path: |
            src-tauri/target/${{ matrix.target }}/release/bundle/dmg/*.dmg
            src-tauri/target/${{ matrix.target }}/release/bundle/macos/*.app
```

### Release Workflow

```yaml
# .github/workflows/release.yml
name: Release
on:
  push:
    tags: ['v*']

jobs:
  build:
    # ... same as build-macos.yml

  release:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - name: Download artifacts
        uses: actions/download-artifact@v4

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          draft: false
          files: |
            SGraph-Desktop-aarch64/*.dmg
          body: |
            ## SGraph Desktop ${{ github.ref_name }}

            Download the DMG for your Mac and drag SGraph Desktop to Applications.

      - name: Update latest.json
        run: |
          # Generate Tauri updater manifest
          # Upload to release assets
```

---

## Code Signing

### Prerequisites

1. **Apple Developer Program** membership ($99/year)
2. **Developer ID Application** certificate (for distribution outside App Store)
3. **App-specific password** for notarisation

### Signing Steps (in CI/CD)

```bash
# 1. Import certificate
echo $APPLE_CERTIFICATE | base64 --decode > certificate.p12
security create-keychain -p "" build.keychain
security import certificate.p12 -k build.keychain -P $APPLE_CERTIFICATE_PASSWORD -T /usr/bin/codesign
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "" build.keychain

# 2. Sign the app
codesign --deep --force --verbose --sign "Developer ID Application: SGraph AI Ltd" \
  --options runtime \
  --entitlements Entitlements.plist \
  "SGraph Desktop.app"

# 3. Notarise
xcrun notarytool submit "SGraph Desktop.dmg" \
  --apple-id $APPLE_ID \
  --team-id $APPLE_TEAM_ID \
  --password $APPLE_PASSWORD \
  --wait

# 4. Staple
xcrun stapler staple "SGraph Desktop.dmg"
```

---

## Local Development

```bash
# Prerequisites
rustup toolchain install stable
cargo install tauri-cli

# Dev mode (hot-reload for frontend, rebuilds Rust on change)
cargo tauri dev

# Build release
cargo tauri build

# Build for specific target
cargo tauri build --target aarch64-apple-darwin
```

### Dev Mode Features

- Frontend changes hot-reload (Tauri watches `src/`)
- Rust changes trigger recompile
- DevTools available (Cmd+Option+I)
- Console output visible in terminal

---

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

---

## Versioning

- App version in `src-tauri/tauri.conf.json` (Tauri reads this)
- Project version in `version` file (team convention)
- Git tags for releases: `v0.1.0`, `v0.2.0`, etc.
- All three must stay in sync

### Release Checklist

1. Update version in `version`, `tauri.conf.json`, `Cargo.toml`
2. Update reality document
3. Commit: "bump version to v0.x.0"
4. Tag: `git tag v0.x.0`
5. Push: `git push origin main --tags`
6. CI builds, signs, notarises, creates GitHub Release
7. Tauri updater picks up new version on next app launch
