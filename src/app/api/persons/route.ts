// src/app/api/persons/route.ts
import { NextRequest, NextResponse } from "next/server";
import { pm1SearchPersons } from "@/lib/pm1-client";

export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "No token" }, { status: 401 });

  const email = req.nextUrl.searchParams.get("email");
  if (!email) return NextResponse.json({ error: "email param required" }, { status: 400 });

  try {
    const persons = await pm1SearchPersons(token, email);
    return NextResponse.json(persons);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
