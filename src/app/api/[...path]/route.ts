import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";

const BACKEND_PORT = 8000;
const BACKEND_HOST = "127.0.0.1";
const BACKEND_URL = `http://${BACKEND_HOST}:${BACKEND_PORT}`;
const BACKEND_DIR = "/home/z/my-project/mini-services/tender-api";
// Use the venv Python which has all required packages installed.
// The system /usr/bin/python3 does NOT have sqlalchemy/uvicorn/etc.
const PYTHON_BIN = "/home/z/.venv/bin/python3";

// Global state to track backend startup and avoid concurrent starts
let backendStarting: Promise<boolean> | null = null;
let lastHealthCheck = 0;
let lastHealthStatus = false;

async function isBackendAlive(): Promise<boolean> {
  // Cache health status for 2 seconds only
  const now = Date.now();
  if (now - lastHealthCheck < 2000) return lastHealthStatus;

  lastHealthCheck = now;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${BACKEND_URL}/api/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    lastHealthStatus = res.ok;
    return lastHealthStatus;
  } catch {
    lastHealthStatus = false;
    return false;
  }
}

async function startBackend(): Promise<boolean> {
  // Use a lock to prevent concurrent starts
  if (backendStarting) return backendStarting;

  backendStarting = (async () => {
    try {
      // Kill any stale process on the port
      try {
        execSync(`fuser -k ${BACKEND_PORT}/tcp 2>/dev/null || true`, {
          timeout: 3000,
        });
      } catch {
        // ignore
      }
      await new Promise((r) => setTimeout(r, 800));

      // Start uvicorn fully detached using setsid + nohup so it survives
      // even when the sandbox reaps child processes of the Node server.
      const logFile = `${BACKEND_DIR}/api.log`;
      const startCmd = `cd ${BACKEND_DIR} && setsid nohup ${PYTHON_BIN} -m uvicorn main:app --host 0.0.0.0 --port ${BACKEND_PORT} >> ${logFile} 2>&1 < /dev/null &`;
      execSync(startCmd, {
        timeout: 5000,
        env: { ...process.env, PYTHONUNBUFFERED: "1" },
      });

      // Wait for the backend to become ready (up to 25 seconds)
      for (let i = 0; i < 50; i++) {
        await new Promise((r) => setTimeout(r, 500));
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 2000);
          const res = await fetch(`${BACKEND_URL}/api/health`, {
            signal: controller.signal,
          });
          clearTimeout(timeout);
          if (res.ok) {
            lastHealthCheck = Date.now();
            lastHealthStatus = true;
            return true;
          }
        } catch {
          // keep waiting
        }
      }
      return false;
    } catch (e) {
      console.error("Failed to start backend:", e);
      return false;
    } finally {
      backendStarting = null;
    }
  })();

  return backendStarting;
}

async function ensureBackend(): Promise<boolean> {
  const alive = await isBackendAlive();
  if (alive) return true;
  return startBackend();
}

/**
 * Catch-all API proxy.
 * Forwards all /api/* requests to the Python FastAPI backend on port 8000.
 * Automatically starts the backend if it's not running (the sandbox kills
 * background processes periodically, so we warm it up on demand).
 */
async function handler(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path } = await context.params;
  const pathStr = path.join("/");

  // Build the target URL - preserve query string but drop XTransformPort
  const url = new URL(req.url);
  const searchParams = new URLSearchParams(url.search);
  searchParams.delete("XTransformPort");
  const queryString = searchParams.toString();
  const targetUrl = `${BACKEND_URL}/api/${pathStr}${queryString ? "?" + queryString : ""}`;

  // Ensure backend is alive (start if needed)
  const ready = await ensureBackend();
  if (!ready) {
    return NextResponse.json(
      { detail: "Backend service is starting up. Please retry in a moment." },
      { status: 503 }
    );
  }

  // Build headers
  const headers = new Headers();
  req.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower !== "host" && lower !== "content-length") {
      headers.set(key, value);
    }
  });

  // Read the body
  let body: BodyInit | null = null;
  if (req.method !== "GET" && req.method !== "HEAD") {
    body = await req.arrayBuffer();
  }

  try {
    const controller = new AbortController();
    // 5 min timeout — AI endpoints (read-document, generate, readiness-report)
    // make multiple z-ai CLI calls that can each take up to 120s.
    const timeout = setTimeout(() => controller.abort(), 300000);
    const response = await fetch(targetUrl, {
      method: req.method,
      headers,
      body,
      // @ts-ignore
      duplex: "half",
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const responseHeaders = new Headers();
    response.headers.forEach((value, key) => {
      responseHeaders.set(key, value);
    });

    const responseBody = await response.arrayBuffer();
    return new NextResponse(responseBody, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error: any) {
    // Backend died mid-request. Force restart and retry once.
    lastHealthStatus = false;
    lastHealthCheck = 0;
    backendStarting = null;

    // Try to restart the backend
    const restarted = await startBackend();
    if (!restarted) {
      return NextResponse.json(
        { detail: "Backend service is starting up. Please retry in a moment." },
        { status: 503 }
      );
    }

    // Retry the request
    try {
      const controller2 = new AbortController();
      const timeout2 = setTimeout(() => controller2.abort(), 300000);
      const response2 = await fetch(targetUrl, {
        method: req.method,
        headers,
        body,
        // @ts-ignore
        duplex: "half",
        signal: controller2.signal,
      });
      clearTimeout(timeout2);

      const responseHeaders2 = new Headers();
      response2.headers.forEach((value, key) => {
        responseHeaders2.set(key, value);
      });

      const responseBody2 = await response2.arrayBuffer();
      return new NextResponse(responseBody2, {
        status: response2.status,
        statusText: response2.statusText,
        headers: responseHeaders2,
      });
    } catch (error2: any) {
      return NextResponse.json(
        { detail: `Backend request failed after retry: ${error2.message}. Please retry.` },
        { status: 502 }
      );
    }
  }
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
export const PATCH = handler;
export const OPTIONS = handler;
