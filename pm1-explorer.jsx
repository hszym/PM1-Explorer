import { useState, useEffect, useCallback } from "react";

const BASE_URL = "https://plu-pm1api.cloud.expersoft.com/pm1j-web-services/REST";

// ── JWT decode (no library needed) ──────────────────────────────────────────
function decodeJWT(token) {
  try {
    const payload = token.split(".")[1];
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
}

// ── API calls ────────────────────────────────────────────────────────────────
async function authenticate(username, password) {
  const cred = btoa(`${username}:${password}`);
  const res = await fetch(`${BASE_URL}/authenticate`, {
    method: "GET",
    headers: { Authorization: `Basic ${cred}` },
  });
  if (!res.ok) throw new Error(`Auth failed: ${res.status}`);
  const token = await res.text();
  return token.trim().replace(/^"|"$/g, "");
}

async function fetchPortfolios(token) {
  const res = await fetch(`${BASE_URL}/portfolios`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Portfolios failed: ${res.status}`);
  return res.json();
}

// ── Icons (inline SVG) ───────────────────────────────────────────────────────
const Icon = {
  lock: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
  portfolio: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-4 0v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/></svg>,
  search: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  refresh: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>,
  consolidated: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10z"/></svg>,
  single: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 7H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="2"/></svg>,
  logout: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  clock: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
};

// ── Token timer ──────────────────────────────────────────────────────────────
function TokenTimer({ exp, onExpired }) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    const tick = () => {
      const secs = Math.max(0, exp - Math.floor(Date.now() / 1000));
      setRemaining(secs);
      if (secs === 0) onExpired();
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [exp, onExpired]);

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const pct = (remaining / (30 * 60)) * 100;
  const urgent = remaining < 120;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ color: urgent ? "#ef4444" : "#94a3b8", display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
        {Icon.clock}
        <span style={{ fontFamily: "monospace", fontWeight: 600, color: urgent ? "#ef4444" : "#64748b" }}>
          {mins}:{String(secs).padStart(2, "0")}
        </span>
      </div>
      <div style={{ width: 60, height: 4, background: "#e2e8f0", borderRadius: 2, overflow: "hidden" }}>
        <div style={{
          height: "100%", borderRadius: 2,
          width: `${pct}%`,
          background: urgent ? "#ef4444" : "#C4874A",
          transition: "width 1s linear"
        }} />
      </div>
    </div>
  );
}

// ── Portfolio card ───────────────────────────────────────────────────────────
function PortfolioCard({ pf, selected, onClick }) {
  return (
    <div onClick={onClick} style={{
      padding: "12px 16px",
      borderRadius: 8,
      cursor: "pointer",
      border: selected ? "1px solid #C4874A" : "1px solid #e2e8f0",
      background: selected ? "#fff8f3" : "#fff",
      transition: "all 0.15s",
      display: "flex",
      alignItems: "center",
      gap: 12,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 8,
        background: selected ? "#C4874A" : "#f1f5f9",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: selected ? "#fff" : "#94a3b8",
        flexShrink: 0,
      }}>
        {pf.isConsolidated ? Icon.consolidated : Icon.single}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 600,
          color: selected ? "#C4874A" : "#1e2b3c",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"
        }}>
          {pf.description || pf.pfNumber}
        </div>
        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2, display: "flex", gap: 8 }}>
          <span>#{pf.pfNumber}</span>
          {pf.isConsolidated && <span style={{ color: "#C4874A", fontWeight: 500 }}>Consolidated</span>}
          {pf.isAggregated && <span style={{ color: "#64748b" }}>Aggregated</span>}
        </div>
      </div>
      <div style={{ fontSize: 10, color: "#cbd5e1", fontFamily: "monospace" }}>
        {pf.id}
      </div>
    </div>
  );
}

// ── Detail panel ─────────────────────────────────────────────────────────────
function DetailPanel({ pf, token }) {
  const tabs = ["Overview", "Positions", "Transactions", "Performance"];
  const [tab, setTab] = useState("Overview");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div style={{ padding: "20px 24px 0", borderBottom: "1px solid #f1f5f9" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#1e2b3c", fontFamily: "'Cormorant Garamond', serif" }}>
              {pf.description || pf.pfNumber}
            </div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4, display: "flex", gap: 12 }}>
              <span>Portfolio #{pf.pfNumber}</span>
              <span>ID: {pf.id}</span>
              <span>Type: {pf.portfolioTypeId}</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {pf.isConsolidated && (
              <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 20, background: "#fff8f3", color: "#C4874A", border: "1px solid #f3d5b5", fontWeight: 500 }}>
                Consolidated
              </span>
            )}
            {pf.isAggregated && (
              <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 20, background: "#f8fafc", color: "#64748b", border: "1px solid #e2e8f0", fontWeight: 500 }}>
                Aggregated
              </span>
            )}
          </div>
        </div>
        {/* Tabs */}
        <div style={{ display: "flex", gap: 0 }}>
          {tabs.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: "8px 16px",
              border: "none", background: "none", cursor: "pointer",
              fontSize: 13, fontWeight: tab === t ? 600 : 400,
              color: tab === t ? "#C4874A" : "#94a3b8",
              borderBottom: tab === t ? "2px solid #C4874A" : "2px solid transparent",
              transition: "all 0.15s",
            }}>{t}</button>
          ))}
        </div>
      </div>

      {/* Tab content */}
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
                <div key={label} style={{ padding: 16, background: "#f8fafc", borderRadius: 8, border: "1px solid #f1f5f9" }}>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#1e2b3c" }}>{String(value)}</div>
                </div>
              ))}
            </div>
            <div style={{ padding: 16, background: "#f8fafc", borderRadius: 8, border: "1px solid #f1f5f9" }}>
              <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Raw API Response</div>
              <pre style={{ fontSize: 12, color: "#475569", margin: 0, fontFamily: "monospace", whiteSpace: "pre-wrap" }}>
                {JSON.stringify(pf, null, 2)}
              </pre>
            </div>
          </div>
        )}
        {tab !== "Overview" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 200, color: "#94a3b8", gap: 12 }}>
            <div style={{ fontSize: 32 }}>⏳</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: "#64748b" }}>Awaiting Expersoft API docs</div>
            <div style={{ fontSize: 12, color: "#94a3b8", textAlign: "center", maxWidth: 280 }}>
              {tab} endpoint parameters are pending confirmation from Expersoft support. Will be activated once params are confirmed.
            </div>
            <div style={{ marginTop: 8, padding: "6px 12px", background: "#f8fafc", borderRadius: 6, border: "1px solid #e2e8f0", fontSize: 11, color: "#64748b", fontFamily: "monospace" }}>
              GET /portfolios/{pf.id}/{tab.toLowerCase()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────────────────────────
export default function PM1Explorer() {
  const [screen, setScreen] = useState("login"); // login | app
  const [username, setUsername] = useState("SZH_30215");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState(null);
  const [decoded, setDecoded] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [portfolios, setPortfolios] = useState([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState("all"); // all | single | consolidated

  const handleLogin = async () => {
    setLoading(true);
    setError("");
    try {
      const t = await authenticate(username, password);
      const d = decodeJWT(t);
      setToken(t);
      setDecoded(d);
      const pfs = await fetchPortfolios(t);
      setPortfolios(pfs);
      setSelected(pfs[0] || null);
      setScreen("app");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleExpired = useCallback(() => {
    setScreen("login");
    setToken(null);
    setError("Session expired. Please log in again.");
  }, []);

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

  // ── Login screen ────────────────────────────────────────────────────────
  if (screen === "login") {
    return (
      <div style={{
        minHeight: "100vh", background: "#1e2b3c",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "'DM Sans', sans-serif",
      }}>
        <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet" />
        <div style={{ width: 380 }}>
          {/* Logo area */}
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <div style={{ fontSize: 13, letterSpacing: "0.2em", color: "#C4874A", textTransform: "uppercase", marginBottom: 8 }}>
              Plurimi Wealth Management
            </div>
            <div style={{ fontSize: 32, fontFamily: "'Cormorant Garamond', serif", color: "#fff", fontWeight: 600 }}>
              PM1 Explorer
            </div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 6 }}>
              Internal API integration tool
            </div>
          </div>

          {/* Card */}
          <div style={{
            background: "#fff", borderRadius: 16, padding: 32,
            boxShadow: "0 24px 48px rgba(0,0,0,0.3)"
          }}>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: "#64748b", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                PM1 Username
              </label>
              <input
                value={username}
                onChange={e => setUsername(e.target.value)}
                style={{
                  width: "100%", padding: "10px 14px", borderRadius: 8,
                  border: "1px solid #e2e8f0", fontSize: 14, color: "#1e2b3c",
                  outline: "none", boxSizing: "border-box",
                  fontFamily: "monospace"
                }}
              />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: "#64748b", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleLogin()}
                placeholder="Enter PM1 password"
                style={{
                  width: "100%", padding: "10px 14px", borderRadius: 8,
                  border: "1px solid #e2e8f0", fontSize: 14, color: "#1e2b3c",
                  outline: "none", boxSizing: "border-box",
                }}
              />
            </div>

            {error && (
              <div style={{ marginBottom: 16, padding: "10px 14px", background: "#fef2f2", borderRadius: 8, fontSize: 13, color: "#dc2626", border: "1px solid #fecaca" }}>
                {error}
              </div>
            )}

            <button
              onClick={handleLogin}
              disabled={loading || !password}
              style={{
                width: "100%", padding: "12px", borderRadius: 8,
                background: loading || !password ? "#f1f5f9" : "#1e2b3c",
                color: loading || !password ? "#94a3b8" : "#fff",
                border: "none", fontSize: 14, fontWeight: 600,
                cursor: loading || !password ? "not-allowed" : "pointer",
                transition: "all 0.15s",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8
              }}
            >
              {loading ? "Connecting..." : <>{Icon.lock} Connect to PM1</>}
            </button>

            <div style={{ marginTop: 16, padding: "10px 14px", background: "#f8fafc", borderRadius: 8, fontSize: 11, color: "#94a3b8" }}>
              <strong style={{ color: "#64748b" }}>Endpoint:</strong> plu-pm1api.cloud.expersoft.com
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── App screen ──────────────────────────────────────────────────────────
  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", fontFamily: "'DM Sans', sans-serif", background: "#f8fafc" }}>
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet" />

      {/* Top bar */}
      <div style={{
        height: 56, background: "#1e2b3c", display: "flex", alignItems: "center",
        padding: "0 24px", gap: 16, flexShrink: 0,
        borderBottom: "1px solid rgba(255,255,255,0.05)"
      }}>
        <div style={{ fontSize: 16, fontFamily: "'Cormorant Garamond', serif", color: "#fff", fontWeight: 600, letterSpacing: "0.02em" }}>
          PM1 Explorer
        </div>
        <div style={{ fontSize: 11, color: "#C4874A", letterSpacing: "0.1em", textTransform: "uppercase" }}>
          Plurimi
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 12, color: "#64748b" }}>
          {decoded?.name}
        </div>
        {decoded?.exp && (
          <TokenTimer exp={decoded.exp} onExpired={handleExpired} />
        )}
        <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.1)" }} />
        <div style={{ fontSize: 12, color: "#64748b", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />
          {portfolios.length} portfolios
        </div>
        <button onClick={() => setScreen("login")} style={{
          background: "none", border: "none", color: "#64748b", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 6, fontSize: 12, padding: "4px 8px",
          borderRadius: 6, transition: "color 0.15s"
        }}>
          {Icon.logout} Logout
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* Sidebar */}
        <div style={{ width: 320, background: "#fff", borderRight: "1px solid #f1f5f9", display: "flex", flexDirection: "column", flexShrink: 0 }}>
          {/* Search + filter */}
          <div style={{ padding: 16, borderBottom: "1px solid #f1f5f9" }}>
            <div style={{ position: "relative", marginBottom: 10 }}>
              <div style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }}>
                {Icon.search}
              </div>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search portfolios..."
                style={{
                  width: "100%", padding: "8px 10px 8px 32px",
                  border: "1px solid #e2e8f0", borderRadius: 8,
                  fontSize: 13, outline: "none", boxSizing: "border-box", color: "#1e2b3c"
                }}
              />
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {[["all", "All"], ["single", "Single"], ["consolidated", "Consolidated"]].map(([val, label]) => (
                <button key={val} onClick={() => setFilter(val)} style={{
                  padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 500,
                  border: "1px solid " + (filter === val ? "#C4874A" : "#e2e8f0"),
                  background: filter === val ? "#fff8f3" : "#fff",
                  color: filter === val ? "#C4874A" : "#64748b",
                  cursor: "pointer", transition: "all 0.15s"
                }}>{label}</button>
              ))}
            </div>
          </div>

          {/* Portfolio list */}
          <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 6 }}>
            {filtered.length === 0 ? (
              <div style={{ textAlign: "center", color: "#94a3b8", fontSize: 13, marginTop: 40 }}>No portfolios found</div>
            ) : filtered.map(pf => (
              <PortfolioCard
                key={pf.id}
                pf={pf}
                selected={selected?.id === pf.id}
                onClick={() => setSelected(pf)}
              />
            ))}
          </div>

          <div style={{ padding: "10px 16px", borderTop: "1px solid #f1f5f9", fontSize: 11, color: "#94a3b8", display: "flex", justifyContent: "space-between" }}>
            <span>{filtered.length} shown</span>
            <span>{portfolios.filter(p => p.isConsolidated).length} consolidated · {portfolios.filter(p => !p.isConsolidated).length} single</span>
          </div>
        </div>

        {/* Detail */}
        <div style={{ flex: 1, overflow: "hidden", background: "#fff", margin: 16, borderRadius: 12, border: "1px solid #f1f5f9", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
          {selected ? (
            <DetailPanel pf={selected} token={token} />
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#94a3b8", fontSize: 14 }}>
              Select a portfolio
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
