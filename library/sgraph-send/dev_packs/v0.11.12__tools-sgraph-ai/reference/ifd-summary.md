# IFD Methodology Summary for Vanilla JS Modules

**Source:** `library/guides/development/ifd/v1.2.1__ifd__intro-and-how-to-use.md`

---

## What Is IFD?

**Incremental Feature Development** — a methodology for building software in small, independently deployable increments. Each increment is:

- **Versioned:** Lives in its own versioned folder (`v1.0.0/`, `v1.1.0/`)
- **Isolated:** Changes to one module don't affect others
- **Deployable:** Can go to production independently
- **Testable:** Has its own tests, runs independently

---

## IFD Applied to tools.sgraph.ai Modules

### Module Versioning

Each core module and component has its own version, independent of all others:

```
core/crypto/v1.0.0/sg-crypto.js     <- crypto at v1.0.0
core/crypto/v1.1.0/sg-crypto.js     <- crypto bug fix
core/api-client/v1.0.0/sg-api.js    <- api-client at v1.0.0 (unrelated to crypto)
```

A change to `crypto` bumps crypto's version only. `api-client` stays at v1.0.0.

### The `latest` Alias

Each module has a `latest/` folder that mirrors the most recent stable version. This is updated by CI/CD on every deployment.

- Tools on tools.sgraph.ai use `latest` (we control them, can fix fast)
- Production projects (send, vault) pin to specific versions (stability)

### Surgical Versioning

Never modify a published version. If `v1.0.0` has a bug:

1. Create `v1.0.1` with the fix
2. Update `latest` to point to `v1.0.1`
3. `v1.0.0` remains as-is (consumers pinned to it keep working until they upgrade)

### IFD for Tools

Tools themselves are versioned through the tools folder, but since they use `latest` imports, they automatically get the newest module versions. Tool-level versioning is lighter — tools are thin composition layers, not libraries.

---

## IFD Principles Relevant to This Build

1. **Never modify a deployed version** — create a new version instead
2. **Each change is a commit** — atomic, reviewable, revertible
3. **Test before deploy** — even for "simple" changes
4. **One module per CI/CD trigger** — changes to crypto don't rebuild api-client
5. **Backward compatibility within major versions** — `v1.x` always backward-compatible with `v1.0`
