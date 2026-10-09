#!/bin/bash
# TenderFlow API - robust startup script
# Restarts the uvicorn server if it crashes

cd /home/z/my-project/mini-services/tender-api

while true; do
    echo "[$(date)] Starting uvicorn..."
    python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 >> /home/z/my-project/mini-services/tender-api/api.log 2>&1
    EXIT_CODE=$?
    echo "[$(date)] uvicorn exited with code $EXIT_CODE. Restarting in 2s..."
    sleep 2
done
