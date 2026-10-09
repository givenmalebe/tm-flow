import { NextRequest, NextResponse } from "next/server";

/**
 * Catch-all API proxy.
 *
 * Forwards /api/* to the Python FastAPI backend. The backend URL comes from
 * BACKEND_URL so the same code targets a local uvicorn process during
 * development and a Cloud Run service in deployed environments.
 *
 * An earlier version spawned uvicorn as a child process on demand. That only
 * works where a writable filesystem and a shell exist; Cloud Run and App
 * Hosting have neither. Backend availability is the platform's responsibility,
 * not this proxy's.
 */
const BACKEND_URL = (
  process.env.BACKEND_URL ?? "http://127.0.0.1:8000"
).replace(/\/+$/, "");

const REQUEST_TIMEOUT_MS = 300000;

async function handler(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path } = await context.params;
  const pathStr = path.join("/");

  const url = new URL(req.url);
  const searchParams = new URLSearchParams(url.search);
  searchParams.delete("XTransformPort");
  const queryString = searchParams.toString();
  const targetUrl = `${BACKEND_URL}/api/${pathStr}${queryString ? "?" + queryString : ""}`;

  // Rebuild the header set rather than forwarding req.headers wholesale. Host
  // and Content-Length describe the inbound hop and are rejected or mismatched
  // by the upstream service.
  const headers = new Headers();
  req.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower === "host" || lower === "content-length" || lower === "connection") return;
    // Browsers send `Expect: 100-continue` on larger POST bodies. undici
    // rejects the header outright ("expect header not supported"), so any
    // request over ~1KB would fail with "fetch failed". Drop it; the upstream
    // accepts the body without it.
    if (lower === "expect") return;
    headers.set(key, value);
  });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const response = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : await req.arrayBuffer(),
      // @ts-ignore
      duplex: "half",
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeout);

    const responseHeaders = new Headers();
    response.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (lower === "content-length" || lower === "transfer-encoding") return;
      responseHeaders.set(key, value);
    });

    return new NextResponse(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    console.error(
      "[api-proxy] upstream fetch failed",
      targetUrl,
      err instanceof Error ? `${err.name}: ${err.message}` : String(err)
    );
    return NextResponse.json(
      {
        detail: aborted
          ? "The request timed out. AI generation can take up to 5 minutes — please retry."
          : `Backend unreachable at ${BACKEND_URL}.`,
      },
      { status: aborted ? 504 : 503 }
    );
  }
}

export {
  handler as GET,
  handler as POST,
  handler as PUT,
  handler as PATCH,
  handler as DELETE,
  handler as HEAD,
  handler as OPTIONS,
};
