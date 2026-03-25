// src/app/api/portfolios/route.ts
import { NextRequest, NextResponse } from "next/server";
import { pm1FetchPortfolios } from "@/lib/pm1-client";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const token = auth?.replace(/^Bearer\s+/i, "");

  if (!token) {
    return NextResponse.json({ error: "No token provided" }, { status: 401 });
  }

  try {
    const portfolios = await pm1FetchPortfolios(token);
    return NextResponse.json(portfolios);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch portfolios";
    const status = message.includes("401") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
