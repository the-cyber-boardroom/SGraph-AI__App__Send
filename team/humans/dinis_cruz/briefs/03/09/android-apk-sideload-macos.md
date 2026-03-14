# Sideloading an Android APK on macOS (Android Emulator)

A guide to signing and installing an unsigned APK on a local Android emulator on macOS — without needing to upload to the Play Store or a real device.

---

## Prerequisites

- macOS with [Homebrew](https://brew.sh) installed
- Android Studio installed (provides the emulator and SDK)

---

## Step 1: Install ADB (Android Debug Bridge)

If you don't have Android Studio's platform-tools in your PATH:

```bash
brew install android-platform-tools
```

Or, if Android Studio is already installed, add its platform-tools to your shell:

```bash
export PATH="$PATH:$HOME/Library/Android/sdk/platform-tools"
```

Add that line to `~/.zshrc` to make it permanent.

---

## Step 2: Install Java (required for apksigner)

`apksigner` requires a JDK. Install Temurin (free OpenJDK):

```bash
brew install --cask temurin
```

---

## Step 3: Start the Android Emulator

List available AVDs (Android Virtual Devices):

```bash
~/Library/Android/sdk/emulator/emulator -list-avds
```

Start one:

```bash
~/Library/Android/sdk/emulator/emulator -avd <AVD_NAME> &
```

Wait ~30 seconds for the emulator to fully boot, then verify ADB sees it:

```bash
adb devices
```

---

## Step 4: Zipalign the APK

APKs must be zipaligned before signing. Find your build-tools version first:

```bash
ls ~/Library/Android/sdk/build-tools/
# e.g. 36.1.0
```

Then run:

```bash
BT=~/Library/Android/sdk/build-tools/36.1.0

$BT/zipalign -v 4 \
  ~/Downloads/app-universal-release-unsigned.apk \
  ~/Downloads/app-aligned.apk
```

---

## Step 5: Generate a Debug Keystore

The debug keystore (`~/.android/debug.keystore`) is not created automatically unless you've run a full Android Studio build. Generate it manually:

```bash
keytool -genkey -v \
  -keystore ~/.android/debug.keystore \
  -alias androiddebugkey \
  -keyalg RSA -keysize 2048 \
  -validity 10000 \
  -storepass android \
  -keypass android \
  -dname "CN=Android Debug,O=Android,C=US"
```

---

## Step 6: Sign the APK

```bash
BT=~/Library/Android/sdk/build-tools/36.1.0

$BT/apksigner sign \
  --ks ~/.android/debug.keystore \
  --ks-pass pass:android \
  --key-pass pass:android \
  --ks-key-alias androiddebugkey \
  --out ~/Downloads/app-signed.apk \
  ~/Downloads/app-aligned.apk
```

---

## Step 7: Install on the Emulator

```bash
adb install ~/Downloads/app-signed.apk
```

Expected output:

```
Performing Incremental Install
Serving...
All files should be loaded. Notifying the device.
Success
Install command complete in 672 ms
```

The app will now appear in the emulator's app drawer.

---

## Summary of Tools Installed

| Tool | How Installed | Purpose |
|---|---|---|
| `adb` | `brew install android-platform-tools` | Connect to emulator / install APKs |
| Android Emulator + AVD | Android Studio | Run the virtual device |
| Temurin JDK | `brew install --cask temurin` | Required by `apksigner` |
| `zipalign` | Bundled with Android SDK build-tools | Align APK before signing |
| `apksigner` | Bundled with Android SDK build-tools | Sign APK with debug keystore |

---

## Notes

- This uses a **debug keystore** — fine for local testing, not for Play Store distribution.
- The universal APK works on the emulator as-is (contains `x86_64` libs). ABI splitting (e.g. arm64-v8a only for a Pixel 6) is only needed when distributing to real devices to reduce download size.
- A Dockerized Android emulator (e.g. `dockerify-android`) is **not suitable on macOS** as it requires KVM, which is a Linux-only kernel feature unavailable in Docker Desktop's VM.
