#!/bin/bash
# TenderFlow API supervisor - keeps the backend alive with correct Python
LOG=/home/z/my-project/mini-services/tender-api/api.log
PY=/home/z/.venv/bin/python
cd /home/z/my-project/mini-services/tender-api

while true; do
    if ! curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/api/health 2>/dev/null | grep -q "200"; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting uvicorn..." >> "$LOG"
        $PY -m uvicorn main:app --host 0.0.0.0 --port 8000 >> "$LOG" 2>&1 &
        PID=$!
        for i in $(seq 1 10); do
            sleep 1
            if curl -s -o /dev/null http://127.0.0.1:8000/api/health 2>/dev/null; then
                echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backend ready (PID $PID)" >> "$LOG"
                break
            fi
            if ! ps -p $PID > /dev/null 2>&1; then
                echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backend died during startup" >> "$LOG"
                break
            fi
        done
    fi
    sleep 5
done
