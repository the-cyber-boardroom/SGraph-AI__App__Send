# Milestone Debrief: SGraph Desktop — Android App Launch
**Date:** 9 March 2026  
**Author:** Dinis Cruz

---

## Executive Summary

On 9 March 2026, the SGraph Desktop Android app was successfully built, signed, sideloaded onto both an Android emulator (macOS M2) and a real Pixel 6 device, and demonstrated end-to-end encrypted file transfer from within the Android environment. This marks the first validated Android delivery of the SGraph/Send secure file transfer product.

---

## What Was Achieved

### 1. Android APK Build & Multi-Architecture Distribution

The CI/CD pipeline produced APK/AAB artifacts for four architectures:

- `arm64-v8a` — primary target for modern Android devices (Pixel 6, etc.)
- `armeabi-v7a` — legacy ARM support
- `x86_64` — Intel emulator support

### 2. Sideload on macOS Android Emulator (M2)

The `arm64-v8a` APK was successfully zipaligned, signed with a debug keystore, and installed on a local Android emulator (`Medium_Phone_API_36.1:5554`) running on an Apple Silicon M2 MacBook Air. The correct ABI was identified after diagnosing an initial `INSTALL_FAILED_NO_MATCHING_ABIS` error caused by attempting to install the `x86_64` build on an ARM emulator.

### 3. Install on Real Pixel 6 Device

The same `arm64-v8a` signed APK was installed on a physical Google Pixel 6 via ADB over USB. The app launched and displayed the Beta Access / Early Access Programme screen, confirming the build is functional on real hardware.

### 4. End-to-End Encrypted File Transfer Demonstrated

A screenshot was pushed into the emulator via ADB and then sent securely using the SG/Send Android app. The file was successfully decrypted and received on a separate device, proving the full zero-knowledge encrypted transfer pipeline works on Android. This was shared publicly on [LinkedIn](https://www.linkedin.com/feed/update/urn:li:activity:7436603539763666944/).

---

## Technical Issues Resolved

| Issue | Root Cause | Resolution |
|---|---|---|
| `INSTALL_FAILED_NO_MATCHING_ABIS` | `x86_64` APK installed on `arm64-v8a` emulator — M2 Mac runs native ARM | Switched to `arm64-v8a` APK variant |
| APK downloaded as `.zip` | CI artifact packaging wraps files in zip | `unzip` before zipalign/sign pipeline |
| `adb: command not found` | Platform-tools not in PATH | Used full path `~/Library/Android/sdk/platform-tools/adb` |
| "You can't install this app" on Pixel 6 | APK was unsigned — Android rejects unsigned APKs on sideload | Signed with debug keystore via `apksigner` before install |
| `arm64-aligned.apk` already exists error | Re-running zipalign without cleaning up prior run | Added `-f` flag to `zipalign` to force overwrite |
| JDK warnings from `apksigner` | JDK 17+ module system noise (`java.lang.System::loadLibrary`) | Cosmetic only — no impact on signing or install |

---

## Toolchain

| Tool | Source | Purpose |
|---|---|---|
| `adb` | Android SDK platform-tools | Device communication & APK install |
| `zipalign` | build-tools/36.1.0 | APK alignment before signing |
| `apksigner` | build-tools/36.1.0 | APK signing with debug keystore |
| Temurin JDK | `brew install --cask temurin` | Required runtime for `apksigner` |
| Android Emulator | Android Studio AVD (`arm64-v8a`) | Local test device on macOS M2 |
| Pixel 6 | Physical device, USB debugging enabled | Real device validation |

### Sign & Install Pipeline

```bash
BT=~/Library/Android/sdk/build-tools/36.1.0
ADB=~/Library/Android/sdk/platform-tools/adb

# Unzip artifact
unzip SGraph-Desktop-Android-arm64-v8a-apk.zip
mv app-universal-release-unsigned.apk arm64-unsigned.apk

# Align + sign
$BT/zipalign -f -v 4 arm64-unsigned.apk arm64-aligned.apk
$BT/apksigner sign \
  --ks ~/.android/debug.keystore \
  --ks-pass pass:android --key-pass pass:android \
  --ks-key-alias androiddebugkey \
  --out arm64-signed.apk arm64-aligned.apk

# Install
$ADB install arm64-signed.apk
```

---

## Commercial & Product Implications

- Android extends SGraph/Send to the world's largest mobile platform, opening significant B2C and B2B opportunities
- The app working on a real Pixel 6 validates the product is ready for broader beta distribution
- Zero-knowledge encrypted file transfer working end-to-end on Android is a strong differentiator
- The multi-architecture build (arm64, armeabi, x86_64) ensures broad device compatibility
- Sideloading via debug keystore is sufficient for beta testing; Play Store distribution will require a production keystore

---

## Next Steps

- [ ] Set up a production keystore for Play Store submission
- [ ] Test on a wider range of Android devices and OS versions
- [ ] Evaluate Google Play internal testing track for beta distribution
- [ ] Document the sign & install pipeline in the main project README
- [ ] Explore automating the sign step in CI to produce ready-to-install signed APKs as artifacts
