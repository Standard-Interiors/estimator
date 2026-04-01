# Stage 1: Build frontend
FROM node:20-alpine AS frontend-build
WORKDIR /app/renderer
COPY renderer/package.json renderer/package-lock.json ./
RUN npm ci
COPY renderer/ ./
RUN npm run build

# Stage 2: Python backend + built frontend
FROM python:3.11-slim

WORKDIR /app

# Install Python dependencies (only what extractor needs)
RUN pip install --no-cache-dir \
    fastapi>=0.95 \
    uvicorn>=0.20 \
    sqlalchemy>=2.0 \
    google-genai>=1.0 \
    pillow>=10.0 \
    pillow-heif>=0.18.0 \
    python-multipart

# Copy backend source
COPY extractor/ ./extractor/

# Copy built frontend
COPY --from=frontend-build /app/renderer/dist ./renderer/dist

# Create non-root user for security
RUN useradd --system --uid 1001 cabinet && \
    mkdir -p /data/images && \
    chown -R cabinet:cabinet /data

USER cabinet

EXPOSE 8001

HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8001/health')"

ENV DATA_DIR=/data

CMD ["python", "extractor/server.py"]
