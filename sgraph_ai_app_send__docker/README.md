# SG/Send Vault Container

A single-image, self-contained deployment of [SGraph Send](https://send.sgraph.ai) running the **vault application** as the default UI — zero-knowledge encrypted file sharing with the [sgit CLI](https://pypi.org/project/sgit-ai/).

Pull, run, open the URL. No external dependencies. The image hosts both the vault web UI and the API on the same port.

```bash
docker run --rm -p 8080:8080 diniscruz/sg-send-vault:latest
```

Open <http://localhost:8080/>.

---

## Table of contents

- [What this image is](#what-this-image-is)
- [Quick start](#quick-start)
- [Persistent storage](#persistent-storage)
- [Authentication](#authentication)
- [Configuration reference](#configuration-reference)
- [Architecture](#architecture)
- [Deployment scenarios](#deployment-scenarios)
- [Building from source](#building-from-source)
- [Troubleshooting](#troubleshooting)
- [Security notes](#security-notes)
- [Limitations](#limitations)

---

## What this image is

A FastAPI app (the Send "user lambda") running under uvicorn on port `8080`, with the SG/Vault web UI mounted at `/`. Everything talks to itself over the same origin — no CDN dependency, no external API.

Concretely, the image contains:

- **The Send API** — `/api/transfers/*`, `/api/vault/*`, `/api/presigned/*`, `/api/vault/presigned/*`, plus `/api/info/health`, `/api/info/status`, `/api/info/versions`, `/api/docs` (OpenAPI), `/auth/set-cookie-form`.
- **The Vault UI** — flattened from the IFD versioned tree (`v0.2.3`) by `scripts/build-vault-static.sh` at image build time. Server-relative URLs only — no calls to `dev.send.sgraph.ai`.
- **Storage** — pluggable via `Storage_FS` abstraction. Defaults to **disk** at `/data`; switchable to **memory** or **S3** at runtime.

The image is **multi-arch** (linux/amd64 + linux/arm64) so it runs natively on x86 servers, Apple Silicon (M1–M5), and ARM-based VMs.

---

## Quick start

### Ephemeral (data lost when the container stops)

```bash
docker run --rm -p 8080:8080 diniscruz/sg-send-vault:latest
```

Open <http://localhost:8080/>. Create or open a vault. Anything you push is held in the container's writable layer and discarded on `--rm`.

### Persistent (data survives container restart)

```bash
docker run --rm -p 8080:8080 \
  -v "$(pwd)/_sg-send_data:/data" \
  --name sg-send \
  diniscruz/sg-send-vault:latest
```

`_sg-send_data/` is created in your current directory. Stop the container with `Ctrl-C`; restart with the same command to pick up your vaults.

### What you should see

| URL | Result |
|---|---|
| `http://localhost:8080/` | Vault UI root (redirects internally to `/en-gb/`) |
| `http://localhost:8080/en-gb/` | Landing page — "Open a vault." |
| `http://localhost:8080/en-gb/vault/` | Vault shell (the file browser, settings, sgit views) |
| `http://localhost:8080/api/docs` | OpenAPI / Swagger UI |
| `http://localhost:8080/api/info/health` | `{"status": "ok"}` |
| `http://localhost:8080/api/info/versions` | App + dependency versions (Starlette, FastAPI, …) |

---

## Persistent storage

The default mode is **disk at `/data`**. To persist, mount a host directory:

```bash
-v "$(pwd)/_sg-send_data:/data"
```

The on-disk layout under your mount looks like:

```
_sg-send_data/
├── vault/
│   └── {2-char prefix}/{vault_id}/
│       ├── bare/{data,indexes,keys,refs}/
│       └── manifest.json
└── transfers/
    └── {2-char prefix}/{transfer_id}/{meta.json,payload}
```

This is the **flat layout** — no nested `sg-send__data/sg-send-api__v1.0/shared/` prefixes. If you ever need the prefix back (e.g. one bucket shared with other apps), set `SEND__STORAGE_BASE=sg-send__data` etc. at runtime — see [Configuration reference](#configuration-reference).

### Storage modes

| Mode | When | How to enable |
|---|---|---|
| **disk** (default) | Single-host deployment, data survives restarts when `/data` is mounted | (default) |
| **memory** | Quick demo, CI, throw-away | `-e SEND__STORAGE_MODE=memory` |
| **S3** | Multi-replica deployments, durability, lifecycle policies | Pass AWS credentials *or* `-e SEND__STORAGE_MODE=s3 -e SEND__S3_BUCKET=<name>` |

Backend selection follows this priority: explicit `SEND__STORAGE_MODE` → AWS credentials present → `SEND__DISK_PATH` set → memory.

---

## Authentication

By default the container is **unauthenticated** — anyone who can reach port 8080 can use the vault API.

To require an access token on every request:

```bash
docker run --rm -p 8080:8080 \
  -e SGRAPH_SEND__ACCESS_TOKEN=my-secret-token \
  -v "$(pwd)/_sg-send_data:/data" \
  --name sg-send \
  diniscruz/sg-send-vault:latest
```

Clients must then send the header `x-sgraph-access-token: my-secret-token` on every API call. The static UI is also gated — except `GET /auth/set-cookie-form`, which is a small page that sets the token as a cookie so the browser can use the UI.

To set the cookie from the form: open <http://localhost:8080/auth/set-cookie-form>, paste the token, submit. The vault UI then loads normally.

For sgit clients:

```bash
sgit clone <vault-key> --endpoint http://localhost:8080 --token my-secret-token
```

(Or set `SGIT_TOKEN` in the environment.)

---

## Configuration reference

All configuration is via environment variables. Defaults shown are what's baked into the image.

### Storage

| Variable | Default | Purpose |
|---|---|---|
| `SEND__STORAGE_MODE` | `disk` | `memory` \| `disk` \| `s3` — override the storage backend |
| `SEND__DISK_PATH` | `/data` | Filesystem path when in disk mode |
| `SEND__S3_BUCKET` | (auto) | Explicit S3 bucket name (otherwise derived from AWS account + region) |
| `SEND__PUBLIC_VAULT__S3_BUCKET` | unset | Enables a separate public-vault bucket |

### Storage path layout

These three pieces together build the path prefix under storage root (`{base}/{version}/{deployment}/vault/...`). Empty values are dropped from the joined path.

| Variable | Default (image) | Default (lib) | Purpose |
|---|---|---|---|
| `SEND__STORAGE_BASE` | (empty) | `sg-send__data` | Multi-tenant slot |
| `SEND__STORAGE_VERSION` | (empty) | `sg-send-api__v1.0` | Schema version |
| `SEND__DEPLOYMENT_ID` | (empty) | `shared` | Per-stage slot (dev/qa/prod) |

The image ships with all three empty → flat layout (`/data/vault/...`). The library defaults reproduce the production Lambda layout (`/data/sg-send__data/sg-send-api__v1.0/shared/vault/...`) if you re-enable them.

⚠ **Changing these for an existing deployment makes prior data unreadable** — they're deploy-time configuration, not runtime tuning.

### Authentication

| Variable | Default | Purpose |
|---|---|---|
| `SGRAPH_SEND__ACCESS_TOKEN` | unset | If set, all routes require this token (header `x-sgraph-access-token` or cookie) |
| `SEND__ENABLE_AUTH` | unset | Force-enable auth even without a token value (useful for tests) |

### TLS (HTTPS)

The container can terminate its own TLS — there is no reverse proxy. With TLS off
(the default) it serves plain HTTP on `:8080`, identical on Lambda / CI / laptop.
With TLS on it binds `:443` using a mounted cert/key pair.

| Variable | Default | Purpose |
|---|---|---|
| `FAST_API__TLS__ENABLED` | `false` | Master switch. `true` / `1` / `yes` turns TLS on. |
| `FAST_API__TLS__CERT_FILE` | `/certs/cert.pem` | Path to the cert file (mount it in). |
| `FAST_API__TLS__KEY_FILE` | `/certs/key.pem` | Path to the key file (mount it in). |
| `FAST_API__TLS__PORT` | `443` | Bind port when TLS is on. |

The container does **not** generate certs — mount them in (a `cert-init` sidecar
owns acquisition). If TLS is enabled but the cert/key files are missing, the
container **fails loud** (non-zero exit) — it never silently falls back to HTTP.

Why TLS matters for the vault UI: `crypto.subtle` (Web Crypto) is only available
in a secure context. Served over HTTPS, `window.isSecureContext` is `true` and
vaults open from any host — not just `localhost`. See
[Troubleshooting](#vault-wont-open-from-a-lan-ip-or-other-hostname).

```bash
docker run --rm -p 443:443 \
  -e FAST_API__TLS__ENABLED=true \
  -v "$(pwd)/certs:/certs:ro" \
  -v "$(pwd)/_sg-send_data:/data" \
  diniscruz/sg-send-vault:latest
```

### Internal (rarely overridden)

| Variable | Default | Purpose |
|---|---|---|
| `SEND__VAULT_STATIC_DIR` | `/app/static_vault` | Directory the vault UI is served from inside the container |

---

## Architecture

```
            Browser
              │
              │  HTTP/8080
              ▼
    ┌─────────────────────────────────────────────┐
    │  uvicorn  ←──  Fast_API__SGraph__Send__Container
    │                │
    │                ├── /        → vault index.html
    │                ├── /en-gb/* → vault UI static tree
    │                ├── /_common/* → JS / CSS / fonts
    │                ├── /api/*   → Send API routes
    │                ├── /info/*  → health, status
    │                └── /auth/*  → cookie-set form
    │
    │   Storage_FS (Memory / Disk / S3) ──→  /data  (volume mount)
    └─────────────────────────────────────────────┘
```

Key points:

- **Same origin for UI and API** — the vault UI uses relative paths (`/api/vault/read/...`), so it talks to whichever host is serving it. No CORS dance, no CDN dependency.
- **Static UI built at image build time** — `scripts/build-vault-static.sh` runs during `docker build`, flattening the IFD versioned tree and merging user-UI `_common/` layers (send-browse, sg-site-header, etc.). The result is `/app/static_vault/`.
- **Sub-path static mounts** — `/_common`, `/en-gb`, `/i18n` are mounted explicitly so they don't shadow the FastAPI routes.
- **Single Python process** — no separate API/UI services, no nginx, no supervisord.

---

## Deployment scenarios

### 1. Local dev on a laptop

```bash
docker run --rm -p 8080:8080 \
  -v "$(pwd)/_sg-send_data:/data" \
  diniscruz/sg-send-vault:latest
```

Open <http://localhost:8080/>. **Always use `localhost`** — see [Web Crypto note](#vault-wont-open-from-a-lan-ip-or-other-hostname).

### 2. Long-running on a VPS / EC2

```bash
docker run -d --restart=unless-stopped \
  -p 8080:8080 \
  -v /var/lib/sg-send:/data \
  -e SGRAPH_SEND__ACCESS_TOKEN=$(openssl rand -hex 32) \
  --name sg-send \
  diniscruz/sg-send-vault:latest
```

Put a reverse proxy with TLS in front (caddy, traefik, nginx). The vault UI requires a secure context — see [Web Crypto note](#vault-wont-open-from-a-lan-ip-or-other-hostname).

### 3. Behind caddy with auto-TLS

```caddy
send.example.com {
    reverse_proxy localhost:8080
}
```

Caddy obtains the cert; the browser sees `https://send.example.com`; Web Crypto works; vaults open.

### 4. Multi-arch CI image

The Docker Hub publish step builds for `linux/amd64,linux/arm64` so the same `:latest` tag works on x86 servers and ARM machines (Apple Silicon, Graviton, Raspberry Pi 4+).

### 5. Air-gapped

Pull the image once on a connected machine, save it, transfer it, load it:

```bash
docker pull diniscruz/sg-send-vault:latest
docker save diniscruz/sg-send-vault:latest | gzip > sg-send-vault.tar.gz
# transfer sg-send-vault.tar.gz to air-gapped host
gunzip -c sg-send-vault.tar.gz | docker load
docker run ...  # same as before
```

The image has no runtime external dependencies — the vault UI does not call out.

---

## Building from source

If you want to build the image yourself instead of pulling from Docker Hub:

```bash
git clone https://github.com/the-cyber-boardroom/SGraph-AI__App__Send.git
cd SGraph-AI__App__Send

docker build \
  -f sgraph_ai_app_send__docker/Dockerfile \
  -t sg-send-vault:local \
  .

docker run --rm -p 8080:8080 \
  -v "$(pwd)/_sg-send_data:/data" \
  sg-send-vault:local
```

Multi-arch local build:

```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -f sgraph_ai_app_send__docker/Dockerfile \
  -t sg-send-vault:local \
  .
```

The build step is idempotent — the static UI is rebuilt from source each time, so any vault UI change you make in `sgraph_ai_app_send__ui__vault/` (or user UI `_common/` layers) shows up in the next image.

---

## Troubleshooting

### Vault won't open from a LAN IP or other hostname

If you load the UI from `http://192.168.x.x:8080/` (or any other plain-HTTP origin that isn't `localhost`) and clicking "Decrypt & open" produces nothing — no API calls, page stays blank — the browser is blocking Web Crypto.

**Cause:** `crypto.subtle` (Web Crypto API) is only available in **secure contexts**:

- `https://` (any host)
- `http://localhost` and `http://127.0.0.1` (browser-allowlisted exceptions)
- **Not** plain `http://` on any other hostname or IP

`SGVault.open()` calls `crypto.subtle.digest(...)` during key derivation. On an insecure origin `crypto.subtle` is `undefined`, the call throws `Cannot read properties of undefined (reading 'digest')`, and the open flow aborts before any fetch can fire.

**Fixes:**

| Option | Effort |
|---|---|
| Use `http://localhost:8080` on the Docker host | none |
| Front the container with HTTPS (caddy auto-TLS, ngrok, cloudflared, tailscale) | small |
| Chrome flag `chrome://flags/#unsafely-treat-insecure-origin-as-secure`, add your origin | tiny, dev only |

### `sgit push` fails with 500

If you see `NotImplementedError` in the container logs, you're on an older image. The disk backend's `folder__files__all` is a stub in older `memory-fs` releases; the current image patches it locally. Pull `:latest`.

### Port 8080 already in use

```bash
docker run --rm -p 9000:8080 ...
```

The internal port is fixed at 8080; map it to whatever host port suits you.

### Need to inspect the running container

```bash
docker exec -it sg-send /bin/bash
# inside:
ls /data
ls /app/static_vault
cat /app/sgraph_ai_app_send/version
```

### Container starts but `/` returns 404

The `/app/static_vault/` directory might be missing. Rebuild — the build script must run successfully. Check `docker logs sg-send` for the build output during `docker build`.

---

## Security notes

The container itself is **not zero-knowledge** — it sees encrypted blobs only, but it does see *which* vault IDs exist, file sizes, request timing, and (if logging is enabled) client IPs. Zero-knowledge guarantees come from the **client-side** encryption: the vault key never leaves the browser.

Implications:

- **Operators can see metadata** — vault IDs, file counts, sizes. Not contents.
- **Operators cannot decrypt content** — files are encrypted with keys derived in the browser.
- **The mounted `/data` is the only persistent state** — back this up regularly.
- **Run behind HTTPS in production** — required for Web Crypto, also protects the access token in transit.
- **Set `SGRAPH_SEND__ACCESS_TOKEN`** for any container reachable from outside its own host.

See the [Security domain in the reality doc](../team/roles/librarian/reality/security/index.md) for the full list of verified security properties.

---

## Limitations

- **Single Python process.** No horizontal scaling within one image. For high-concurrency deployments, run multiple replicas behind a load balancer and point them at a shared S3 backend.
- **No automatic cleanup of expired transfers.** Transfer expiry is enforced at read time (a stale transfer 404s) but the on-disk artefacts stick around. A reaper is on the roadmap.
- **Admin UI is not bundled.** This image ships the **user / vault** surface only. The admin Lambda is a separate deployment.
- **Vault UI version is pinned** to `v0.2.3` at image build time (`scripts/build-vault-static.sh`). New vault UI versions require a rebuild.
- **No built-in metrics endpoint.** Health is at `/api/info/health`. Prometheus-style `/metrics` is on the roadmap.

---

## Image details

| Property | Value |
|---|---|
| Base image | `python:3.12-slim` |
| Architectures | `linux/amd64`, `linux/arm64` |
| Image size | ~250 MB |
| Default port | 8080 |
| Tag policy | `:latest` = most recent published build (dev or main) · `:vX.Y.Z` = immutable version tag for that build |
| Default user | `root` (inside container) |
| Source | <https://github.com/the-cyber-boardroom/SGraph-AI__App__Send> |
| Dockerfile | `sgraph_ai_app_send__docker/Dockerfile` |
| Build script | `scripts/build-vault-static.sh` |
| Container class | `sgraph_ai_app_send__docker.Fast_API__SGraph__Send__Container` |

## Related links

- [SG/Send](https://send.sgraph.ai) — hosted instance
- [SG/Vault UI source](../sgraph_ai_app_send__ui__vault/) — the web UI bundled in this image
- [sgit CLI](https://pypi.org/project/sgit-ai/) — push/pull from vaults
- [Send API source](../sgraph_ai_app_send/lambda__user/) — the FastAPI app
- [Reality document](../team/roles/librarian/reality/) — code-verified inventory of what exists
