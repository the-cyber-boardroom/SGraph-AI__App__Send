# AppSec Summary for SGraph-AI__Desktop

---

## Security Model: Webview Isolation + Native Privilege Separation

The desktop app introduces a new security boundary: native OS capabilities (keychain, filesystem) accessible from web content via IPC. This requires careful privilege separation.

### 1. Webview Isolation (Critical)

Each `*.sgraph.ai` webview runs in its own WebKit process. The security boundary:

| Webview | Trust Level | IPC Access |
|---------|-------------|------------|
| Local app shell (`index.html`) | Full trust | All commands |
| `send.sgraph.ai` | Scoped trust | `keychain_get`, `keychain_set` (sgraph-send service only) |
| `vault.sgraph.ai` | Scoped trust | `keychain_get`, `keychain_set` (sgraph-vault service only) |
| `workspace.sgraph.ai` | Scoped trust | `keychain_get` (read-only) |
| `tools.sgraph.ai` | Minimal trust | No IPC commands (tools are client-side only) |
| Non-sgraph URLs | Zero trust | No IPC, blocked from loading in webviews |

**Implementation:** Tauri v2's capability system defines which commands each webview can access:

```json
// src-tauri/capabilities/default.json
{
  "identifier": "default",
  "windows": ["main"],
  "permissions": [
    "keychain:allow-set",
    "keychain:allow-get",
    "keychain:allow-delete",
    "files:allow-read",
    "files:allow-info",
    "window:allow-save-state",
    "window:allow-load-state"
  ]
}
```

### 2. Navigation Control (Critical)

Webviews MUST NOT navigate to arbitrary URLs. A compromised or XSS'd `*.sgraph.ai` page could redirect to a malicious URL that then accesses IPC commands.

**Mitigation:**

```rust
// Allow only *.sgraph.ai URLs in webviews
webview.on_navigation(|url| {
    url.host_str()
        .map(|h| h.ends_with(".sgraph.ai") || h == "sgraph.ai")
        .unwrap_or(false)
});
```

External links (non-sgraph.ai) open in the default browser, not in the app.

### 3. Keychain Security (High)

macOS Keychain is the correct place for secrets. However:

| Risk | Mitigation |
|------|-----------|
| Any app can read its own keychain items | SGraph Desktop's keychain items are scoped to its bundle ID |
| Keychain dump by privileged user | This is an OS-level concern, not app-level |
| IPC command called by malicious webview | Capability scoping: only `*.sgraph.ai` webviews can access keychain, and only for their own service name |

**Service naming convention:** `sgraph-{site}` (e.g., `sgraph-send`, `sgraph-vault`). Each webview can only access its own service.

### 4. Code Signing and Notarisation (Critical)

Unsigned macOS apps:
- Trigger Gatekeeper warnings
- May not launch at all on recent macOS
- Cannot use certain system APIs

**Requirements:**
- Apple Developer ID certificate for signing
- Notarisation via Apple's notary service
- Stapling the notarisation ticket to the app bundle
- Hardened runtime entitlements

### 5. Entitlements (macOS Sandbox)

```xml
<!-- Entitlements.plist -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.app-sandbox</key>
    <false/>
    <!-- Not sandboxed initially — needed for file associations and keychain -->

    <key>com.apple.security.network.client</key>
    <true/>
    <!-- Required: webviews load remote URLs -->

    <key>com.apple.security.files.user-selected.read-only</key>
    <true/>
    <!-- Required: file open dialog -->

    <key>com.apple.security.keychain-access-groups</key>
    <array>
        <string>$(AppIdentifierPrefix)ai.sgraph.desktop</string>
    </array>
</dict>
</plist>
```

### 6. Auto-Update Security (Medium)

Tauri's updater verifies signatures before applying updates:

- Updates are signed with a private key (stored in CI/CD secrets)
- The app verifies the signature before applying
- Updates are downloaded from GitHub Releases (HTTPS)
- The updater JSON endpoint is pinned in `tauri.conf.json`

**Risk:** Compromised GitHub account could push malicious update.
**Mitigation:** Require 2FA on the GitHub org. Consider additional signing with a separate key.

### 7. File Association Security (Low)

When the app registers as a handler for `.md`, `.pdf`, etc.:

- Files are opened read-only via `read_file` command
- No write-back to the original file
- File contents are displayed in a local viewer webview (no remote upload)
- Large files (>50MB) should be rejected with a user-friendly message

---

## Already Handled by Architecture

| Concern | How It's Addressed |
|---------|-------------------|
| Data exfiltration via desktop app | App shell has no analytics, no telemetry, no outbound calls |
| Encryption key exposure | Keys stay in webview's Web Crypto store or macOS Keychain |
| Man-in-the-middle on webviews | All `*.sgraph.ai` URLs are HTTPS |
| Local storage tampering | Keychain items are protected by macOS security framework |
| Cross-webview attacks | Each webview is a separate WebKit process |
