// src/app/api/masterdata/route.ts
import { NextRequest, NextResponse } from "next/server";
import { pm1FetchMasterdata } from "@/lib/pm1-client";

export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "No token" }, { status: 401 });

  const type = req.nextUrl.searchParams.get("type");
  if (!type) return NextResponse.json({ error: "type param required" }, { status: 400 });

  try {
    const data = await pm1FetchMasterdata(token, type);
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
