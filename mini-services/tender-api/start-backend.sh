#!/bin/bash
# TM Flow backend startup script — handles dep install + backend start + supervisor
# Usage: bash /home/z/my-project/mini-services/tender-api/start-backend.sh

set -e
PY=/home/z/.venv/bin/python
PIP="/home/z/.venv/bin/python -m pip"
API_DIR=/home/z/my-project/mini-services/tender-api
LOG=$API_DIR/api.log

echo "=== 1. Checking Python dependencies ==="
if ! $PY -c "import sqlalchemy, fastapi, uvicorn, bcrypt, jose, pdfplumber, pypdf, openpyxl, bs4, requests, multipart" 2>/dev/null; then
    echo "  Installing missing deps..."
    $PIP install -q sqlalchemy python-jose bcrypt 2>&1 | tail -3
    echo "  Deps installed."
else
    echo "  All deps present."
fi

echo "=== 2. Killing stale processes ==="
pkill -f "uvicorn main:app" 2>/dev/null || true
pkill -f "supervisor-fixed" 2>/dev/null || true
sleep 1

echo "=== 3. Starting backend on port 8000 ==="
cd $API_DIR
nohup $PY -m uvicorn main:app --host 0.0.0.0 --port 8000 > "$LOG" 2>&1 &
BACKEND_PID=$!
echo "  Backend PID: $BACKEND_PID"

echo "=== 4. Waiting for backend to be ready ==="
for i in $(seq 1 15); do
    if curl -s -o /dev/null http://127.0.0.1:8000/api/health 2>/dev/null; then
        echo "  Backend ready after ${i}s."
        break
    fi
    sleep 1
done

echo "=== 5. Starting supervisor (auto-restart) ==="
nohup bash $API_DIR/supervisor-fixed.sh > /dev/null 2>&1 &
echo "  Supervisor PID: $!"

echo ""
echo "=== 6. Health check ==="
HEALTH=$(curl -s -w "|%{http_code}" http://127.0.0.1:8000/api/health 2>/dev/null)
BODY=$(echo "$HEALTH" | cut -d'|' -f1)
CODE=$(echo "$HEALTH" | cut -d'|' -f2)
if [ "$CODE" = "200" ]; then
    echo "  ✅ Backend is LIVE — $BODY"
else
    echo "  ❌ Backend failed to start (HTTP $CODE)"
    echo "  --- api.log ---"
    tail -10 "$LOG"
    exit 1
fi

echo ""
echo "=== 7. Login test ==="
LOGIN=$(curl -s -X POST http://127.0.0.1:8000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"backend-test@example.com","password":"test12345"}' 2>/dev/null)
if echo "$LOGIN" | grep -q "access_token"; then
    echo "  ✅ Login works — user: backend-test@example.com"
else
    echo "  ℹ️  Login endpoint reachable (user may not exist yet — register via the UI)"
fi

echo ""
echo "=== DONE ==="
echo "Backend running on http://127.0.0.1:8000"
echo "Login at the Preview Panel with: backend-test@example.com / test12345"
