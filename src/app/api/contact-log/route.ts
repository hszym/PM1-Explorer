// src/app/api/contact-log/route.ts
// Proxies the three-step contact log creation flow and the person search.

import { NextRequest, NextResponse } from "next/server";

function getBase(): string {
  const base = process.env.PM1_API_BASE;
  if (!base) throw new Error("PM1_API_BASE env variable is not set");
  return base;
}

function signal(ms = 8000) {
  return AbortSignal.timeout(ms);
}

function bearerHeaders(token: string, contentType?: string) {
  const h: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (contentType) h["Content-Type"] = contentType;
  return h;
}

/** GET /api/contact-log?email=... → PM1 GET /outlook/persons?email=... */
export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "No token" }, { status: 401 });

  const email = req.nextUrl.searchParams.get("email");
  if (!email) return NextResponse.json({ error: "email param required" }, { status: 400 });

  try {
    const url = new URL(`${getBase()}/outlook/persons`);
    url.searchParams.set("email", email);
    const res = await fetch(url.toString(), {
      headers: bearerHeaders(token),
      cache: "no-store",
      signal: signal(),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Person search failed ${res.status}: ${text}`);
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
 * step 1 → POST /outlook/contactLogs
 *   body: { step:1, subject, body, createdOn, contactPurposeTypeCode, participants }
 *   returns: { contactLogId }
 *
 * step 2 → POST /outlook/contactLogs/{contactLogId}/attachments
 *   body: { step:2, contactLogId, name, mimeType, fileSize, type }
 *   returns: { attachmentId }
 *
 * step 3 → POST /outlook/attachments/{attachmentId}  (octet-stream)
 *   body: { step:3, attachmentId, content: string }
 *   returns: { success: true }
 */
export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "No token" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { step } = body;

  try {
    // ── Step 1: create contact log ────────────────────────────────────────────
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
      // PM1 may return the ID directly, as data.id, or as the body
      const d = data as Record<string, unknown>;
      const contactLogId = d?.id ?? d?.contactLogId ?? data;
      return NextResponse.json({ contactLogId });
    }

    // ── Step 2: register attachment metadata ─────────────────────────────────
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

    // ── Step 3: upload binary content ─────────────────────────────────────────
    if (step === 3) {
      const { attachmentId, content } = body;
      if (typeof content !== "string") {
        return NextResponse.json({ error: "content must be a string" }, { status: 400 });
      }
      const bytes = Buffer.from(content as string, "utf-8");
      const res = await fetch(`${getBase()}/outlook/attachments/${attachmentId}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/octet-stream",
        },
        body: bytes,
        cache: "no-store",
        signal: signal(15000),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Step 3 failed ${res.status}: ${text}`);
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid step (must be 1, 2, or 3)" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Request failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
