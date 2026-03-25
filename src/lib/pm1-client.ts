// src/lib/pm1-client.ts
// SERVER ONLY — import only from API routes / Server Components

import type { Portfolio } from "./types";

const BASE = process.env.PM1_API_BASE!;

if (!BASE) {
  throw new Error("PM1_API_BASE env variable is not set");
}

/**
 * Authenticate with PM1 and return a raw JWT string.
 * Called from the /api/auth route — password never reaches the browser.
 */
export async function pm1Authenticate(
  username: string,
  password: string
): Promise<string> {
  const cred = Buffer.from(`${username}:${password}`).toString("base64");

  const res = await fetch(`${BASE}/authenticate`, {
    method: "GET",
    headers: {
      Authorization: `Basic ${cred}`,
      Accept: "application/json, text/plain, */*",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`PM1 auth failed ${res.status}: ${body}`);
  }

  const raw = await res.text();
  // PM1 returns the JWT as a quoted string — strip surrounding quotes
  return raw.trim().replace(/^"|"$/g, "");
}

/**
 * Fetch all portfolios accessible to the authenticated user.
 */
export async function pm1FetchPortfolios(token: string): Promise<Portfolio[]> {
  const res = await fetch(`${BASE}/portfolios`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`PM1 portfolios failed ${res.status}`);
  }

  return res.json() as Promise<Portfolio[]>;
}

export async function pm1Get<T>(
  token: string,
  path: string,
  params?: Record<string, string>
): Promise<T> {
  const url = new URL(`${BASE}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`PM1 ${path} failed ${res.status}: ${body}`);
  }

  return res.json() as Promise<T>;
}

/**
 * Fetch masterdata by interface type name.
 * e.g. type = "IDocumentType" → /masterdata/com.expersoft.pm.document.masterdata.IDocumentType
 */
export async function pm1FetchMasterdata<T>(
  token: string,
  typeName: string
): Promise<T[]> {
  return pm1Get<T[]>(
    token,
    `/masterdata/com.expersoft.pm.document.masterdata.${typeName}`
  );
}

/**
 * Search persons by email address.
 */
export async function pm1SearchPersons(
  token: string,
  email: string
) {
  return pm1Get<unknown[]>(token, "/persons", { email });
}

/**
 * Upload a document. The file is sent as base64 in the JSON body.
 * Exact payload shape TBC — using the field names extracted from WsSync.dll.
 */
export async function pm1UploadDocument(
  token: string,
  payload: {
    portfolioId: number;
    documentTypeId: number;
    repositoryTypeId?: number;
    personId?: number;
    fileName: string;
    fileContent: string; // base64
    mimeType: string;
  }
) {
  const res = await fetch(`${BASE}/documents`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`PM1 /documents upload failed ${res.status}: ${body}`);
  }

  // PM1 may return JSON or plain text — handle both
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { raw: text }; }
}
