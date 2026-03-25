// src/lib/jwt.ts
import type { DecodedToken } from "./types";

/**
 * Decode a JWT payload without verifying the signature.
 * Safe to use server-side (Node Buffer) and client-side (atob).
 */
export function decodeJWT(token: string): DecodedToken | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    // Works in both Node.js and browser
    const json =
      typeof Buffer !== "undefined"
        ? Buffer.from(part, "base64").toString("utf-8")
        : atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as DecodedToken;
  } catch {
    return null;
  }
}

export function isTokenExpired(exp: number): boolean {
  return Date.now() / 1000 > exp;
}

export function secondsUntilExpiry(exp: number): number {
  return Math.max(0, exp - Math.floor(Date.now() / 1000));
}
