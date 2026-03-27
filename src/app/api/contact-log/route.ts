// src/app/api/contact-log/route.ts
// Proxies the three-step contact log creation flow and the person search.

import { NextRequest, NextResponse } from "next/server";

function getBase(): string {
  const base = process.env.PM1_API_BASE;
  if (!base) throw new Error("PM1_API_BASE env variable is not set");
  return base;
}

function signal(ms = 30000) {
  return AbortSignal.timeout(ms);
}

function bearerHeaders(token: string, contentType?: string) {
  const h: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (contentType) h["Content-Type"] = contentType;
  return h;
}

/**
 * GET /api/contact-log?email={q}  → PM1 GET /outlook/persons?email={q}
 * GET /api/contact-log?text={q}   → PM1 GET /persons?searchText={q}&maxResults=10
 */
export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "No token" }, { status: 401 });

  const email = req.nextUrl.searchParams.get("email");
  const text = req.nextUrl.searchParams.get("text");

  if (!email && !text) {
    return NextResponse.json({ error: "email or text param required" }, { status: 400 });
  }

  try {
    let pm1Url: URL;
    if (email) {
      pm1Url = new URL(`${getBase()}/outlook/persons`);
      pm1Url.searchParams.set("email", email);
    } else {
      pm1Url = new URL(`${getBase()}/persons`);
      pm1Url.searchParams.set("searchText", text!);
      pm1Url.searchParams.set("maxResults", "10");
    }

    const res = await fetch(pm1Url.toString(), {
      headers: bearerHeaders(token),
      cache: "no-store",
      signal: signal(),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Person search failed ${res.status}: ${txt}`);
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Search failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/contact-log
 *
 * Steps 1 & 2 — JSON body:
 *   step 1 → POST /outlook/contactLogs
 *   step 2 → POST /outlook/contactLogs/{contactLogId}/attachments
 *
 * Step 3 — multipart/form-data  { attachmentId, file }
 *   → POST /outlook/attachments/{attachmentId}  (raw file bytes as octet-stream)
 */
export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "No token" }, { status: 401 });

  const contentType = req.headers.get("content-type") ?? "";

  // ── Step 3: raw file upload via FormData ──────────────────────────────────
  if (contentType.includes("multipart/form-data")) {
    try {
      const form = await req.formData();
      const attachmentId = form.get("attachmentId") as string | null;
      const file = form.get("file") as File | null;
      if (!attachmentId || !file) {
        return NextResponse.json({ error: "attachmentId and file required" }, { status: 400 });
      }
      const bytes = await file.arrayBuffer();
      const res = await fetch(`${getBase()}/outlook/attachments/${attachmentId}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": file.type || "application/octet-stream",
        },
        body: bytes,
        cache: "no-store",
        signal: signal(30000),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Step 3 failed ${res.status}: ${text}`);
      }
      return NextResponse.json({ success: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Step 3 failed";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  // ── Steps 1 & 2: JSON ─────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { step } = body;

  try {
    if (step === 1) {
      const { subject, body: logBody, createdOn, contactPurposeTypeCode, participants } = body;
      const res = await fetch(`${getBase()}/outlook/contactLogs`, {
        method: "POST",
        headers: bearerHeaders(token, "application/json"),
        body: JSON.stringify({ subject, body: logBody, createdOn, contactPurposeTypeCode, participants }),
        cache: "no-store",
        signal: signal(),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Step 1 failed ${res.status}: ${text}`);
      }
      const text = await res.text();
      let data: unknown;
      try { data = JSON.parse(text); } catch { data = { raw: text }; }
      const d = data as Record<string, unknown>;
      const contactLogId = d?.id ?? d?.contactLogId ?? data;
      return NextResponse.json({ contactLogId });
    }

    if (step === 2) {
      const { contactLogId, name, mimeType, fileSize, type } = body;
      const res = await fetch(`${getBase()}/outlook/contactLogs/${contactLogId}/attachments`, {
        method: "POST",
        headers: bearerHeaders(token, "application/json"),
        body: JSON.stringify({ name, mimeType, fileSize, type }),
        cache: "no-store",
        signal: signal(),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Step 2 failed ${res.status}: ${text}`);
      }
      const text = await res.text();
      let data: unknown;
      try { data = JSON.parse(text); } catch { data = { raw: text }; }
      const d = data as Record<string, unknown>;
      const attachmentId = d?.id ?? d?.attachmentId ?? data;
      return NextResponse.json({ attachmentId });
    }

    return NextResponse.json({ error: "Invalid step (must be 1 or 2 for JSON; use multipart for step 3)" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Request failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
