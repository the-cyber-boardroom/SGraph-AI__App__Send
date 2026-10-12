FROM python:3.12-slim

# AWS Lambda Web Adapter (ADR-1) — makes this SAME image runnable as a Lambda
# container-image function: it translates Function-URL events <-> HTTP on :8080.
# Inert everywhere else (activates only when AWS_LAMBDA_RUNTIME_API is present).
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.9.1 /lambda-adapter /opt/extensions/lambda-adapter
ENV AWS_LWA_READINESS_CHECK_PATH=/api/info/health

# bash needed by build-vault-static.sh (slim ships dash as /bin/sh)
RUN apt-get update && apt-get install -y --no-install-recommends bash && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY pyproject.toml README.md ./
COPY sgraph_ai_app_send/ ./sgraph_ai_app_send/
COPY sgraph_ai_app_send__docker/ ./sgraph_ai_app_send__docker/
COPY sgraph_ai_app_send__ui__user/ ./sgraph_ai_app_send__ui__user/
COPY sgraph_ai_app_send__ui__vault/ ./sgraph_ai_app_send__ui__vault/
COPY sgraph_ai_app_send__ui__workspace/ ./sgraph_ai_app_send__ui__workspace/
COPY scripts/ ./scripts/

# Build the flattened vault static tree (replicates dev.vault.sgraph.ai layout).
# VAULT_DEFAULT_ENDPOINT="" → vault UI defaults to relative API paths (same-origin),
# so /api/vault/read/... is served by THIS container, not dev.send.sgraph.ai.
RUN VAULT_DEFAULT_ENDPOINT="" bash scripts/build-vault-static.sh /app/static_vault

# Drop raw UI source trees — only the built /app/static_vault is needed at runtime
RUN rm -rf sgraph_ai_app_send__ui__user sgraph_ai_app_send__ui__vault \
           sgraph_ai_app_send__ui__workspace scripts \
    && mkdir -p sgraph_ai_app_send__ui__admin \
                sgraph_ai_app_send__ui__user \
                sgraph_ai_app_send__ui__vault \
                sgraph_ai_app_send__ui__workspace \
    && touch sgraph_ai_app_send__ui__admin/__init__.py \
             sgraph_ai_app_send__ui__user/__init__.py \
             sgraph_ai_app_send__ui__vault/__init__.py \
             sgraph_ai_app_send__ui__workspace/__init__.py

RUN pip install --no-cache-dir -e . && \
    pip install --no-cache-dir uvicorn

# Non-root runtime user (ADR — marketplace/container-scan hardening).
# /data must be writable by the app user for disk storage mode.
RUN mkdir -p /data \
    && useradd --create-home --uid 10001 app \
    && chown -R app:app /data /app

# Non-root cannot bind :443 — native-TLS mode binds :8443 instead.
# Map it however you like on the host: `-p 443:8443`.
EXPOSE 8080 8443

# Defaults: disk storage at /data, flat layout (no nested sg-send__data/v1.0/shared/).
# Without a -v mount, /data is in the container's writable layer — ephemeral with --rm.
# With   `-v <host>:/data`, data persists on the host.
# Override any of these at runtime with `-e VAR=value`.
ENV SEND__STORAGE_MODE=disk
ENV SEND__DISK_PATH=/data
ENV SEND__STORAGE_BASE=
ENV SEND__STORAGE_VERSION=
ENV SEND__DEPLOYMENT_ID=
ENV SEND__VAULT_STATIC_DIR=/app/static_vault
ENV FAST_API__TLS__PORT=8443

# OCI provenance labels (marketplace + enterprise scans expect these)
LABEL org.opencontainers.image.source="https://github.com/the-cyber-boardroom/SGraph-AI__App__Send" \
      org.opencontainers.image.title="sg-send-vault" \
      org.opencontainers.image.description="SG/Send zero-knowledge encrypted vault server + web UI (self-contained)" \
      org.opencontainers.image.licenses="Apache-2.0"

# Container-level health check — same endpoint LWA uses for readiness.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD python -c "import os,urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{os.environ.get(\"PORT\",\"8080\")}/api/info/health')" || exit 1

USER app

# Entrypoint honours the FAST_API__TLS__* contract. With TLS off (default)
# this serves plain HTTP on $PORT (default :8080), identical on Lambda / CI /
# laptop / Cloud Run / Heroku. With FAST_API__TLS__ENABLED=true it binds
# :8443 using the mounted cert/key.
CMD ["python", "-m", "sgraph_ai_app_send__docker.serve"]
