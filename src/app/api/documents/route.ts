// src/app/api/documents/route.ts
import { NextRequest, NextResponse } from "next/server";
import { pm1UploadDocument } from "@/lib/pm1-client";

export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "No token" }, { status: 401 });

  try {
    const body = await req.json();

    const { portfolioId, documentTypeId, repositoryTypeId, personId, fileName, fileContent, mimeType } = body;

    if (!portfolioId || !documentTypeId || !fileName || !fileContent) {
      return NextResponse.json(
        { error: "portfolioId, documentTypeId, fileName, fileContent are required" },
        { status: 400 }
      );
    }

    const result = await pm1UploadDocument(token, {
      portfolioId,
      documentTypeId,
      repositoryTypeId,
      personId,
      fileName,
      fileContent,
      mimeType: mimeType ?? "application/octet-stream",
    });

    return NextResponse.json({ success: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
