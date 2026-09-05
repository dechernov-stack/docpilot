FROM python:3.12-slim

ARG TARGETARCH
ARG TYPST_VERSION=0.15.1

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    DOCPILOT_DB=/app/backend/data/docpilot.db \
    DOCPILOT_DOCS_ROOT=/app/backend/data/repos \
    DOCPILOT_NATIVE_PRINT=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates chromium chromium-driver curl fonts-dejavu-core git xz-utils \
    && rm -rf /var/lib/apt/lists/*

RUN case "$TARGETARCH" in \
      "arm64") TYPST_ARCH="aarch64" ;; \
      *) TYPST_ARCH="x86_64" ;; \
    esac \
    && curl -fsSL "https://github.com/typst/typst/releases/download/v${TYPST_VERSION}/typst-${TYPST_ARCH}-unknown-linux-musl.tar.xz" -o /tmp/typst.tar.xz \
    && tar -xJf /tmp/typst.tar.xz -C /tmp \
    && mv "/tmp/typst-${TYPST_ARCH}-unknown-linux-musl/typst" /usr/local/bin/typst \
    && chmod +x /usr/local/bin/typst \
    && rm -rf /tmp/typst*

WORKDIR /app
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install -r /app/backend/requirements.txt

COPY backend /app/backend
COPY templates /app/templates

EXPOSE 8000
CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]

