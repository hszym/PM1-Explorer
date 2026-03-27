// src/app/api/parse-email/route.ts
// Parses .msg files server-side using msgreader (Node.js only).
// .eml files are parsed client-side with plain JS.

import { NextRequest, NextResponse } from "next/server";
import MsgReader from "msgreader";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export async function POST(req: NextRequest) {
  let file: File | null = null;
  try {
    const formData = await req.formData();
    file = formData.get("file") as File | null;
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  try {
    const buffer = await file.arrayBuffer();
    const reader = new MsgReader(buffer);
    const info = reader.getFileData();

    if (info.error) {
      return NextResponse.json({ error: String(info.error) }, { status: 400 });
    }

    let date = todayISO();
    const headers = typeof info.headers === "string" ? info.headers : "";
    const dateMatch = headers.match(/^Date:\s*(.+)$/im);
    if (dateMatch) {
      try {
        const d = new Date(dateMatch[1].trim());
        if (!isNaN(d.getTime())) date = d.toISOString().slice(0, 10);
      } catch {}
    }

    return NextResponse.json({
      subject: typeof info.subject === "string" ? info.subject : "",
      from: typeof info.senderName === "string" ? info.senderName : "",
      fromEmail: typeof info.senderEmail === "string" ? info.senderEmail : "",
      body: typeof info.body === "string" ? info.body.trim() : "",
      date,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to parse .msg file";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
