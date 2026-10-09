# TM Flow — FastAPI backend (AI + REST)
#
# Deployed to Cloud Run. Cloud Run filesystems are ephemeral, so the SQLite
# database and uploads live on a mounted volume (DATA_DIR).
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    DATA_DIR=/data

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    && pip install --no-cache-dir pdfplumber python-docx python-pptx openpyxl beautifulsoup4 requests \
    && pip install --no-cache-dir firebase-admin

COPY *.py ./

# Uploads and the SQLite file are written under DATA_DIR so they survive
# restarts on the mounted volume.
RUN mkdir -p /data/uploads /app/uploads \
    && ln -sfn /data/uploads /app/uploads

ENV UPLOAD_DIR=/data/uploads \
    DB_PATH=/data/tender.db

EXPOSE 8080

# Cloud Run injects PORT=8080 and probes that port. Binding 8000 fails the
# startup TCP probe.
ENV PORT=8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
    CMD curl -fsS "http://127.0.0.1:${PORT}/api/health" || exit 1

CMD ["sh", "-c", "exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080}"]
