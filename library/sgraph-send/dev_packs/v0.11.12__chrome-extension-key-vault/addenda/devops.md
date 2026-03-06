# DevOps Addendum: CI/CD, Publishing, and Testing Infrastructure

**Version:** v0.11.12

---

## CI/CD Pipeline

### Workflow Files

```
.github/workflows/
├── ci.yml                    # Reusable base
├── ci__dev.yml               # Push to dev → lint + tests
├── ci__main.yml              # Push to main → lint + tests + package + publish
└── deploy__extension-ui.yml  # Deploy extension.sgraph.ai to S3 + CloudFront
```

### ci.yml (Reusable Base)

```yaml
name: CI Pipeline
on:
  workflow_call:
    inputs:
      publish:
        type: boolean
        default: false

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npx eslint extension/ --ext .js

  test:
    runs-on: ubuntu-latest
    needs: lint
    steps:
      - uses: actions/checkout@v4
      - uses: browser-actions/setup-chrome@latest
      - run: npm test

  package:
    runs-on: ubuntu-latest
    needs: test
    steps:
      - uses: actions/checkout@v4
      - name: Build extension zip
        run: |
          cd extension
          zip -r ../sgraph-key-vault.zip . -x "*.DS_Store" -x "tests/*"
      - uses: actions/upload-artifact@v4
        with:
          name: extension-zip
          path: sgraph-key-vault.zip

  publish:
    if: inputs.publish
    runs-on: ubuntu-latest
    needs: package
    steps:
      - uses: actions/download-artifact@v4
        with:
          name: extension-zip
      - name: Upload to Chrome Web Store
        env:
          EXTENSION_ID: ${{ secrets.CHROME_EXTENSION_ID }}
          CLIENT_ID: ${{ secrets.CHROME_CLIENT_ID }}
          CLIENT_SECRET: ${{ secrets.CHROME_CLIENT_SECRET }}
          REFRESH_TOKEN: ${{ secrets.CHROME_REFRESH_TOKEN }}
        run: |
          npx chrome-webstore-upload upload \
            --source sgraph-key-vault.zip \
            --extension-id $EXTENSION_ID \
            --client-id $CLIENT_ID \
            --client-secret $CLIENT_SECRET \
            --refresh-token $REFRESH_TOKEN
```

---

## Chrome Web Store Publishing

### First-Time Setup

1. Register Chrome Web Store developer account ($5 fee)
2. Create extension listing (unlisted initially)
3. Record the extension ID (permanent after first upload)
4. Set up OAuth2 credentials for automated publishing
5. Store credentials as GitHub secrets

### GitHub Secrets Required

| Secret | Purpose |
|--------|---------|
| `CHROME_EXTENSION_ID` | Permanent extension ID |
| `CHROME_CLIENT_ID` | OAuth2 client ID |
| `CHROME_CLIENT_SECRET` | OAuth2 client secret |
| `CHROME_REFRESH_TOKEN` | OAuth2 refresh token |

### Publishing Flow

1. Developer merges to `main`
2. CI builds .zip, runs tests
3. CI uploads to Chrome Web Store (draft)
4. **Human reviews** changelog + test results
5. Human triggers publish (or CI auto-publishes if approved)
6. Google reviews (typically <24h for updates)
7. Chrome auto-updates all installed extensions

---

## Testing Infrastructure

### Unit Tests (Node.js)

Test crypto modules in Node.js (Web Crypto API available via `globalThis.crypto`):

```javascript
// tests/unit/crypto/test-bundle-crypto.js
import { deriveMasterKey, encryptBundle, decryptBundle } from '../../extension/background/crypto/bundle-crypto.js'

describe('Bundle Crypto', () => {
    test('encrypt then decrypt round-trip', async () => {
        const salt = crypto.getRandomValues(new Uint8Array(32))
        const masterKey = await deriveMasterKey('test-passphrase', salt)
        const bundle = JSON.stringify({ version: 1, rooms: {} })
        const encrypted = await encryptBundle(masterKey, bundle)
        const decrypted = await decryptBundle(masterKey, encrypted)
        expect(decrypted).toBe(bundle)
    })
})
```

### Browser Tests (Puppeteer)

Load the extension in Chrome and test real interactions:

```javascript
const browser = await puppeteer.launch({
    headless: false,
    args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`
    ]
})

// Get the extension's background page
const targets = await browser.targets()
const extensionTarget = targets.find(t =>
    t.type() === 'service_worker' && t.url().includes(extensionId)
)
```

### Integration Tests

Test page ↔ extension communication:

1. Start a local HTTPS server (needed for `externally_connectable`)
2. Load a test page that sends `chrome.runtime.sendMessage`
3. Verify extension responds with correct data
4. Verify origin validation rejects non-sgraph.ai origins

---

## Extension.sgraph.ai Deployment

Same S3 + CloudFront pattern as other sgraph.ai sites:

| Component | Detail |
|-----------|--------|
| S3 bucket | `extension-sgraph-ai` (or subfolder of existing bucket) |
| CloudFront | `extension.sgraph.ai`, ACM cert for `*.sgraph.ai` |
| Default root | `index.html` |
| Cache: HTML | `max-age=300` |
| Cache: JS/CSS | `max-age=31536000, immutable` (versioned paths) |

---

## Local Development

```bash
# Load extension in Chrome:
# 1. Navigate to chrome://extensions/
# 2. Enable "Developer mode"
# 3. Click "Load unpacked"
# 4. Select the extension/ directory
# 5. Note the extension ID (changes each load for unpacked)

# For the management UI:
cd extension-ui/
python3 -m http.server 8080
# Open https://localhost:8080 (need HTTPS for externally_connectable)
```

### Testing with Real sgraph.ai Pages

During development, the unpacked extension ID changes on each reload. To test `externally_connectable` with real sgraph.ai pages, you must:

1. Publish unlisted to Chrome Web Store (locks the ID)
2. Install from Chrome Web Store
3. sgraph.ai pages use the permanent ID

Or for local testing: use the content script relay (postMessage) which doesn't require a known extension ID.

---

## Rollback Strategy

Chrome Web Store does not support rollback. To roll back:

1. Re-publish the last known-good version with an incremented version number
2. Google reviews (typically <24h)
3. Chrome auto-updates all users

Worst case: users on bad version for a few hours before fix propagates.

The extension should have "safe mode" — if it detects corrupted state (bundle won't decrypt, service worker crashes), it locks all keys and shows a "please update" message.
