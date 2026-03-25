// src/app/api/portfolio/[id]/[resource]/route.ts
//
// Stub for endpoints that are pending Expersoft support confirmation.
// When params are confirmed, replace the 501 stub with real pm1Get() calls.
//
// Supported (future) resources:  positions | transactions | performance
//
import { NextRequest, NextResponse } from "next/server";
// import { pm1Get } from "@/lib/pm1-client";  // uncomment when activating

interface Params {
  params: { id: string; resource: string };
}

const PENDING_RESOURCES = ["positions", "transactions", "performance"];

export async function GET(req: NextRequest, { params }: Params) {
  const { id, resource } = params;
  const auth = req.headers.get("authorization");
  const token = auth?.replace(/^Bearer\s+/i, "");

  if (!token) {
    return NextResponse.json({ error: "No token provided" }, { status: 401 });
  }

  if (!PENDING_RESOURCES.includes(resource)) {
    return NextResponse.json({ error: "Unknown resource" }, { status: 404 });
  }

  // ── STUB ─────────────────────────────────────────────────────────────────
  // Uncomment and adapt once Expersoft confirms required query params:
  //
  // const queryParams = Object.fromEntries(req.nextUrl.searchParams.entries());
  // try {
  //   const data = await pm1Get(token, `/portfolios/${id}/${resource}`, queryParams);
  //   return NextResponse.json(data);
  // } catch (err) {
  //   const msg = err instanceof Error ? err.message : "Failed";
  //   return NextResponse.json({ error: msg }, { status: 500 });
  // }

  return NextResponse.json(
    {
      pending: true,
      resource,
      portfolioId: id,
      message: `/${resource} endpoint parameters are pending confirmation from Expersoft support`,
    },
    { status: 501 }
  );
}
