FROM python:3.12-slim

WORKDIR /app

COPY pyproject.toml ./
COPY sgraph_ai_app_send/ ./sgraph_ai_app_send/
COPY sgraph_ai_app_send__ui__user/ ./sgraph_ai_app_send__ui__user/
COPY sgraph_ai_app_send__ui__vault/ ./sgraph_ai_app_send__ui__vault/
COPY sgraph_ai_app_send__ui__workspace/ ./sgraph_ai_app_send__ui__workspace/

RUN pip install --no-cache-dir -e . && \
    pip install --no-cache-dir uvicorn

RUN mkdir -p /data

EXPOSE 8080

ENV SEND__STORAGE_MODE=memory
ENV SEND__DISK_PATH=/data

CMD ["uvicorn", "sgraph_ai_app_send.container.app:create_app", \
     "--factory", "--host", "0.0.0.0", "--port", "8080"]
