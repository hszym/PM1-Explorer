// src/app/api/auth/route.ts
import { NextRequest, NextResponse } from "next/server";
import { pm1Authenticate } from "@/lib/pm1-client";
import { decodeJWT } from "@/lib/jwt";

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json();

    if (!username || !password) {
      return NextResponse.json(
        { error: "username and password are required" },
        { status: 400 }
      );
    }

    const token = await pm1Authenticate(username, password);
    const decoded = decodeJWT(token);

    if (!decoded) {
      return NextResponse.json(
        { error: "Received an invalid token from PM1" },
        { status: 500 }
      );
    }

    // Return token + decoded claims to the client.
    // The raw token is needed client-side only to pass back to our own
    // /api/* routes — it never touches PM1 from the browser.
    return NextResponse.json({ token, decoded });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Authentication failed";
    console.error("[/api/auth]", message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
