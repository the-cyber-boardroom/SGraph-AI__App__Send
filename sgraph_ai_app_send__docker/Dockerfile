FROM python:3.12-slim

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

# Build the flattened vault static tree (replicates dev.vault.sgraph.ai layout)
RUN bash scripts/build-vault-static.sh /app/static_vault

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

RUN mkdir -p /data

EXPOSE 8080

ENV SEND__STORAGE_MODE=memory
ENV SEND__DISK_PATH=/data
ENV SEND__VAULT_STATIC_DIR=/app/static_vault

CMD ["uvicorn", "sgraph_ai_app_send__docker.app:create_app", \
     "--factory", "--host", "0.0.0.0", "--port", "8080"]
