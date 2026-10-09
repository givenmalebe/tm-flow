#!/bin/bash
# TenderFlow API supervisor - keeps the backend alive
# Fully detached from the terminal

LOG=/home/z/my-project/mini-services/tender-api/api.log
PIDFILE=/home/z/my-project/mini-services/tender-api/.pid

while true; do
    # Check if port 8000 is in use; if so, skip starting
    if ! curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/api/health 2>/dev/null | grep -q "200"; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting uvicorn..." >> "$LOG"
        cd /home/z/my-project/mini-services/tender-api
        python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 >> "$LOG" 2>&1 &
        PID=$!
        echo $PID > "$PIDFILE"
        # Wait for it to be ready or die
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
    # Check every 5 seconds
    sleep 5
done
