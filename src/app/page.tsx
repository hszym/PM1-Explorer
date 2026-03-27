"use client";

import { useState, useEffect, useCallback } from "react";
import type { Portfolio, DecodedToken } from "@/lib/types";
import TokenTimer from "@/components/TokenTimer";
import PortfolioCard from "@/components/PortfolioCard";
import { Icons } from "@/components/Icons";

// ── helpers ───────────────────────────────────────────────────────────────────

function saveSession(token: string, decoded: DecodedToken, portfolios: Portfolio[]) {
  try {
    sessionStorage.setItem("pm1_session", JSON.stringify({
      token,
      portfolios,
      userName: decoded.name,
    }));
  } catch {}
}

function clearSession() {
  try { sessionStorage.removeItem("pm1_session"); } catch {}
}

// ── Detail panel ──────────────────────────────────────────────────────────────

function DetailPanel({ pf }: { pf: Portfolio }) {
  const tabs = ["Overview", "Positions", "Transactions", "Performance"];
  const [tab, setTab] = useState("Overview");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "20px 24px 0", borderBottom: "1px solid var(--light-border)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--navy)", fontFamily: "var(--font-serif)" }}>
              {pf.description || pf.pfNumber}
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4, display: "flex", gap: 12 }}>
              <span>Portfolio #{pf.pfNumber}</span>
              <span>ID: {pf.id}</span>
              <span>Type: {pf.portfolioTypeId}</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {pf.isConsolidated && (
              <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 20, background: "#fff8f3", color: "var(--gold)", border: "1px solid #f3d5b5", fontWeight: 500 }}>
                Consolidated
              </span>
            )}
            {pf.isAggregated && (
              <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 20, background: "var(--bg)", color: "var(--slate)", border: "1px solid var(--border)", fontWeight: 500 }}>
                Aggregated
              </span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 0 }}>
          {tabs.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: "8px 16px", border: "none", background: "none", cursor: "pointer",
              fontSize: 13, fontWeight: tab === t ? 600 : 400,
              color: tab === t ? "var(--gold)" : "var(--muted)",
              borderBottom: tab === t ? "2px solid var(--gold)" : "2px solid transparent",
              transition: "all 0.15s", fontFamily: "var(--font-sans)",
            }}>{t}</button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, padding: 24, overflowY: "auto" }}>
        {tab === "Overview" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
              {[
                ["Portfolio ID", pf.id],
                ["Portfolio Number", pf.pfNumber],
                ["Type ID", pf.portfolioTypeId],
                ["Consolidated", pf.isConsolidated ? "Yes" : "No"],
                ["Aggregated", pf.isAggregated ? "Yes" : "No"],
              ].map(([label, value]) => (
                <div key={String(label)} style={{ padding: 16, background: "var(--bg)", borderRadius: "var(--radius)", border: "1px solid var(--light-border)" }}>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--navy)" }}>{String(value)}</div>
                </div>
              ))}
            </div>
            <div style={{ padding: 16, background: "var(--bg)", borderRadius: "var(--radius)", border: "1px solid var(--light-border)" }}>
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Raw API Response</div>
              <pre style={{ fontSize: 12, color: "#475569", margin: 0, fontFamily: "monospace", whiteSpace: "pre-wrap" }}>
                {JSON.stringify(pf, null, 2)}
              </pre>
            </div>
          </div>
        )}
        {tab !== "Overview" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 200, color: "var(--muted)", gap: 12 }}>
            <div style={{ fontSize: 32 }}>⏳</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: "var(--slate)" }}>Awaiting Expersoft API docs</div>
            <div style={{ fontSize: 12, color: "var(--muted)", textAlign: "center", maxWidth: 280 }}>
              {tab} endpoint parameters are pending confirmation from Expersoft support.
            </div>
            <div style={{ marginTop: 8, padding: "6px 12px", background: "var(--bg)", borderRadius: 6, border: "1px solid var(--border)", fontSize: 11, color: "var(--slate)", fontFamily: "monospace" }}>
              GET /portfolios/{pf.id}/{tab.toLowerCase()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────

export default function PM1Explorer() {
  const [screen, setScreen] = useState<"login" | "app">("login");
  const [username, setUsername] = useState("SZH_30215");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [decoded, setDecoded] = useState<DecodedToken | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Portfolio | null>(null);
  const [filter, setFilter] = useState<"all" | "single" | "consolidated">("all");

  const handleLogin = async () => {
    setLoading(true);
    setError("");
    try {
      const base = process.env.NEXT_PUBLIC_PM1_API_BASE;
      if (!base) throw new Error("NEXT_PUBLIC_PM1_API_BASE is not configured");

      // 1. Authenticate directly from the browser (same as old version)
      const cred = btoa(`${username}:${password}`);
      const authRes = await fetch(`${base}/authenticate`, {
        method: "GET",
        headers: {
          Authorization: `Basic ${cred}`,
          Accept: "application/json, text/plain, */*",
        },
      });
      if (!authRes.ok) {
        const body = await authRes.text().catch(() => "");
        throw new Error(`Auth failed ${authRes.status}: ${body}`);
      }
      const raw = await authRes.text();
      const t = raw.trim().replace(/^"|"$/g, "");

      const { decodeJWT } = await import("@/lib/jwt");
      const d = decodeJWT(t);
      if (!d) throw new Error("Received an invalid token from PM1");

      // 2. Fetch portfolios directly from the browser
      const pfRes = await fetch(`${base}/portfolios`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (!pfRes.ok) throw new Error(`Portfolios failed ${pfRes.status}`);
      const pfs: Portfolio[] = await pfRes.json();

      setToken(t);
      setDecoded(d);
      setPortfolios(pfs);
      setSelected(pfs[0] ?? null);
      saveSession(t, d, pfs);
      setScreen("app");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleExpired = useCallback(() => {
    clearSession();
    setScreen("login");
    setToken(null);
    setError("Session expired. Please log in again.");
  }, []);

  const handleLogout = () => {
    clearSession();
    setScreen("login");
    setToken(null);
    setPassword("");
  };

  const filtered = portfolios.filter(pf => {
    const matchSearch = !search ||
      pf.description?.toLowerCase().includes(search.toLowerCase()) ||
      pf.pfNumber?.toLowerCase().includes(search.toLowerCase()) ||
      String(pf.id).includes(search);
    const matchFilter =
      filter === "all" ||
      (filter === "consolidated" && pf.isConsolidated) ||
      (filter === "single" && !pf.isConsolidated);
    return matchSearch && matchFilter;
  });

  // ── Login ─────────────────────────────────────────────────────────────────
  if (screen === "login") {
    return (
      <div style={{
        minHeight: "100vh", background: "var(--navy)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "var(--font-sans)",
      }}>
        <div style={{ width: 380 }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <div style={{ fontSize: 13, letterSpacing: "0.2em", color: "var(--gold)", textTransform: "uppercase", marginBottom: 8 }}>
              Plurimi Wealth Management
            </div>
            <div style={{ fontSize: 32, fontFamily: "var(--font-serif)", color: "var(--white)", fontWeight: 600 }}>
              PM1 Explorer
            </div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 6 }}>Internal API integration tool</div>
          </div>

          <div style={{ background: "var(--white)", borderRadius: "var(--radius-xl)", padding: 32, boxShadow: "0 24px 48px rgba(0,0,0,0.3)" }}>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: "var(--slate)", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                PM1 Username
              </label>
              <input
                value={username}
                onChange={e => setUsername(e.target.value)}
                style={{ width: "100%", padding: "10px 14px", borderRadius: "var(--radius)", border: "1px solid var(--border)", fontSize: 14, color: "var(--navy)", outline: "none", boxSizing: "border-box", fontFamily: "monospace" }}
              />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: "var(--slate)", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleLogin()}
                placeholder="Enter PM1 password"
                style={{ width: "100%", padding: "10px 14px", borderRadius: "var(--radius)", border: "1px solid var(--border)", fontSize: 14, color: "var(--navy)", outline: "none", boxSizing: "border-box", fontFamily: "var(--font-sans)" }}
              />
            </div>

            {error && (
              <div style={{ marginBottom: 16, padding: "10px 14px", background: "#fef2f2", borderRadius: "var(--radius)", fontSize: 13, color: "#dc2626", border: "1px solid #fecaca" }}>
                {error}
              </div>
            )}

            <button
              onClick={handleLogin}
              disabled={loading || !password}
              style={{
                width: "100%", padding: 12, borderRadius: "var(--radius)",
                background: loading || !password ? "#f1f5f9" : "var(--navy)",
                color: loading || !password ? "var(--muted)" : "var(--white)",
                border: "none", fontSize: 14, fontWeight: 600,
                cursor: loading || !password ? "not-allowed" : "pointer",
                transition: "all 0.15s", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                fontFamily: "var(--font-sans)",
              }}
            >
              {loading ? "Connecting…" : <>{Icons.lock} Connect to PM1</>}
            </button>

            <div style={{ marginTop: 16, padding: "10px 14px", background: "var(--bg)", borderRadius: "var(--radius)", fontSize: 11, color: "var(--muted)" }}>
              <strong style={{ color: "var(--slate)" }}>Endpoint:</strong> plu-pm1api.cloud.expersoft.com
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── App ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", fontFamily: "var(--font-sans)", background: "var(--bg)" }}>

      {/* Top bar */}
      <div style={{
        height: 56, background: "var(--navy)", display: "flex", alignItems: "center",
        padding: "0 24px", gap: 16, flexShrink: 0,
        borderBottom: "1px solid rgba(255,255,255,0.05)",
      }}>
        <div style={{ fontSize: 16, fontFamily: "var(--font-serif)", color: "var(--white)", fontWeight: 600, letterSpacing: "0.02em" }}>
          PM1 Explorer
        </div>
        <div style={{ fontSize: 11, color: "var(--gold)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
          Plurimi
        </div>

        {/* Upload nav link */}
        <a href="/upload" style={{
          display: "flex", alignItems: "center", gap: 6,
          fontSize: 12, color: "#94a3b8", textDecoration: "none",
          padding: "4px 10px", borderRadius: 6,
          border: "1px solid rgba(255,255,255,0.08)",
          transition: "all 0.15s",
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          Upload Doc
        </a>

        {/* Contact Log nav link */}
        <a href="/log" style={{
          display: "flex", alignItems: "center", gap: 6,
          fontSize: 12, color: "#94a3b8", textDecoration: "none",
          padding: "4px 10px", borderRadius: 6,
          border: "1px solid rgba(255,255,255,0.08)",
          transition: "all 0.15s",
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
          Contact Log
        </a>

        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 12, color: "#64748b" }}>{decoded?.name}</div>
        {decoded?.exp && <TokenTimer exp={decoded.exp} onExpired={handleExpired} />}
        <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.1)" }} />
        <div style={{ fontSize: 12, color: "#64748b", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />
          {portfolios.length} portfolios
        </div>
        <button onClick={handleLogout} style={{
          background: "none", border: "none", color: "#64748b", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 6, fontSize: 12, padding: "4px 8px",
          borderRadius: 6, fontFamily: "var(--font-sans)",
        }}>
          {Icons.logout} Logout
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* Sidebar */}
        <div style={{ width: 320, background: "var(--white)", borderRight: "1px solid var(--light-border)", display: "flex", flexDirection: "column", flexShrink: 0 }}>
          <div style={{ padding: 16, borderBottom: "1px solid var(--light-border)" }}>
            <div style={{ position: "relative", marginBottom: 10 }}>
              <div style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--muted)" }}>
                {Icons.search}
              </div>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search portfolios…"
                style={{
                  width: "100%", padding: "8px 10px 8px 32px",
                  border: "1px solid var(--border)", borderRadius: "var(--radius)",
                  fontSize: 13, outline: "none", boxSizing: "border-box", color: "var(--navy)",
                  fontFamily: "var(--font-sans)",
                }}
              />
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {(["all", "single", "consolidated"] as const).map(val => (
                <button key={val} onClick={() => setFilter(val)} style={{
                  padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 500,
                  border: `1px solid ${filter === val ? "var(--gold)" : "var(--border)"}`,
                  background: filter === val ? "#fff8f3" : "var(--white)",
                  color: filter === val ? "var(--gold)" : "var(--slate)",
                  cursor: "pointer", transition: "all 0.15s", fontFamily: "var(--font-sans)",
                  textTransform: "capitalize",
                }}>{val}</button>
              ))}
            </div>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 6 }}>
            {filtered.length === 0 ? (
              <div style={{ textAlign: "center", color: "var(--muted)", fontSize: 13, marginTop: 40 }}>No portfolios found</div>
            ) : filtered.map(pf => (
              <PortfolioCard key={pf.id} pf={pf} selected={selected?.id === pf.id} onClick={() => setSelected(pf)} />
            ))}
          </div>

          <div style={{ padding: "10px 16px", borderTop: "1px solid var(--light-border)", fontSize: 11, color: "var(--muted)", display: "flex", justifyContent: "space-between" }}>
            <span>{filtered.length} shown</span>
            <span>{portfolios.filter(p => p.isConsolidated).length} consolidated · {portfolios.filter(p => !p.isConsolidated).length} single</span>
          </div>
        </div>

        {/* Detail */}
        <div style={{ flex: 1, overflow: "hidden", background: "var(--white)", margin: 16, borderRadius: "var(--radius-lg)", border: "1px solid var(--light-border)", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
          {selected ? (
            <DetailPanel pf={selected} />
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--muted)", fontSize: 14 }}>
              Select a portfolio
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
