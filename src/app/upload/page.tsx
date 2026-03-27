"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { Portfolio, DocumentType, Person, UploadRecord } from "@/lib/types";

// ── helpers ──────────────────────────────────────────────────────────────────

function pm1Base() {
  return process.env.NEXT_PUBLIC_PM1_API_BASE ?? "";
}

function getSession(): { token: string; portfolios: Portfolio[]; userName: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem("pm1_session");
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function formatTs(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]); // strip data URL prefix
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: "success" | "error" }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 20,
      background: status === "success" ? "#f0fdf4" : "#fef2f2",
      color: status === "success" ? "#16a34a" : "#dc2626",
      border: `1px solid ${status === "success" ? "#bbf7d0" : "#fecaca"}`,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: "50%",
        background: status === "success" ? "#22c55e" : "#ef4444",
      }} />
      {status === "success" ? "Uploaded" : "Failed"}
    </span>
  );
}

function PersonSearchInput({
  token,
  value,
  onChange,
}: {
  token: string;
  value: { id: number; name: string } | null;
  onChange: (p: { id: number; name: string } | null) => void;
}) {
  const [email, setEmail] = useState("");
  const [results, setResults] = useState<Person[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [manualId, setManualId] = useState("");
  const [mode, setMode] = useState<"search" | "manual">("search");

  const doSearch = async () => {
    if (!email.trim()) return;
    setSearching(true);
    setSearched(false);
    try {
      const res = await fetch(`${pm1Base()}/persons?email=${encodeURIComponent(email.trim())}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setResults(Array.isArray(data) ? data : []);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
      setSearched(true);
    }
  };

  const personDisplayName = (p: Person) =>
    p.name ?? [p.firstName, p.lastName].filter(Boolean).join(" ") ?? `ID ${p.id}`;

  return (
    <div>
      {/* Mode toggle */}
      <div style={{ display: "flex", gap: 0, marginBottom: 10, borderRadius: "var(--radius-sm)", overflow: "hidden", border: "1px solid var(--border)", width: "fit-content" }}>
        {(["search", "manual"] as const).map(m => (
          <button key={m} onClick={() => { setMode(m); onChange(null); }}
            style={{
              padding: "5px 14px", fontSize: 12, fontWeight: 500, border: "none",
              background: mode === m ? "var(--navy)" : "var(--white)",
              color: mode === m ? "var(--white)" : "var(--slate)",
              cursor: "pointer", transition: "all 0.15s",
            }}>
            {m === "search" ? "Email search" : "Manual ID"}
          </button>
        ))}
      </div>

      {mode === "search" ? (
        <div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input
              value={email}
              onChange={e => { setEmail(e.target.value); setSearched(false); }}
              onKeyDown={e => e.key === "Enter" && doSearch()}
              placeholder="client@email.com"
              style={inputStyle}
            />
            <button onClick={doSearch} disabled={searching || !email.trim()} style={secondaryBtnStyle}>
              {searching ? "…" : "Search"}
            </button>
          </div>
          {searched && results.length === 0 && (
            <div style={{ fontSize: 12, color: "var(--muted)", padding: "6px 0" }}>No persons found for this email.</div>
          )}
          {results.length > 0 && (
            <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
              {results.map(p => {
                const name = personDisplayName(p);
                const sel = value?.id === p.id;
                return (
                  <div key={p.id} onClick={() => onChange(sel ? null : { id: p.id, name })}
                    style={{
                      padding: "9px 12px", cursor: "pointer", fontSize: 13,
                      background: sel ? "#fff8f3" : "var(--white)",
                      borderBottom: "1px solid var(--light-border)",
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      transition: "background 0.1s",
                    }}>
                    <span style={{ fontWeight: sel ? 600 : 400, color: sel ? "var(--gold)" : "var(--navy)" }}>{name}</span>
                    <span style={{ fontSize: 11, color: "var(--muted)", fontFamily: "monospace" }}>ID {p.id}</span>
                  </div>
                );
              })}
            </div>
          )}
          {value && (
            <div style={{ marginTop: 8, fontSize: 12, color: "var(--gold)", fontWeight: 500 }}>
              ✓ {value.name} (ID {value.id})
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            value={manualId}
            onChange={e => {
              setManualId(e.target.value);
              const n = parseInt(e.target.value);
              onChange(isNaN(n) ? null : { id: n, name: `Person #${n}` });
            }}
            placeholder="e.g. 91518"
            type="number"
            style={{ ...inputStyle, width: 160, fontFamily: "monospace" }}
          />
          {value && (
            <span style={{ fontSize: 12, color: "var(--gold)", fontWeight: 500 }}>✓ Set</span>
          )}
        </div>
      )}
    </div>
  );
}

// ── shared styles ─────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  flex: 1, padding: "9px 12px", borderRadius: "var(--radius)",
  border: "1px solid var(--border)", fontSize: 13, color: "var(--navy)",
  outline: "none", background: "var(--white)", width: "100%",
  fontFamily: "var(--font-sans)",
};

const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: "var(--slate)",
  textTransform: "uppercase", letterSpacing: "0.06em",
  display: "block", marginBottom: 7,
};

const secondaryBtnStyle: React.CSSProperties = {
  padding: "9px 16px", borderRadius: "var(--radius)",
  border: "1px solid var(--border)", background: "var(--white)",
  color: "var(--navy)", fontSize: 13, fontWeight: 500,
  cursor: "pointer", whiteSpace: "nowrap", transition: "all 0.15s",
};

const fieldBlock: React.CSSProperties = { marginBottom: 22 };

// ── main page ─────────────────────────────────────────────────────────────────

export default function UploadPage() {
  const session = getSession();
  const token = session?.token ?? "";
  const portfolios: Portfolio[] = session?.portfolios ?? [];

  // Form state
  const [portfolioId, setPortfolioId] = useState<number | "">(portfolios[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [docTypes, setDocTypes] = useState<DocumentType[]>([]);
  const [docTypeId, setDocTypeId] = useState<number | "">("");
  const [person, setPerson] = useState<{ id: number; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<UploadRecord[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load document types
  useEffect(() => {
    if (!token) return;
    fetch(`${pm1Base()}/masterdata/com.expersoft.pm.document.masterdata.IDocumentType`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setDocTypes(data);
          if (data.length > 0) setDocTypeId(data[0].id);
        }
      })
      .catch(() => {});
  }, [token]);

  // Load history from sessionStorage
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("pm1_upload_history");
      if (raw) setHistory(JSON.parse(raw));
    } catch {}
  }, []);

  const saveHistory = (records: UploadRecord[]) => {
    setHistory(records);
    try { sessionStorage.setItem("pm1_upload_history", JSON.stringify(records)); } catch {}
  };

  const selectedPortfolio = portfolios.find(p => p.id === portfolioId);

  const handleFile = (f: File) => setFile(f);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, []);

  const handleSubmit = async () => {
    if (!portfolioId || !file || !docTypeId) {
      setError("Portfolio, file, and document type are required.");
      return;
    }
    setUploading(true);
    setError("");

    const docTypeName = docTypes.find(d => d.id === docTypeId)?.name ?? String(docTypeId);
    const record: UploadRecord = {
      id: uid(),
      timestamp: new Date().toISOString(),
      portfolioId: portfolioId as number,
      portfolioNumber: selectedPortfolio?.pfNumber ?? String(portfolioId),
      fileName: file.name,
      documentTypeName: docTypeName,
      personName: person?.name,
      status: "success",
    };

    try {
      const fileContent = await fileToBase64(file);
      const res = await fetch(`${pm1Base()}/documents`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({
          portfolioId,
          documentTypeId: docTypeId,
          personId: person?.id,
          fileName: file.name,
          fileContent,
          mimeType: file.type || "application/octet-stream",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        record.status = "error";
        record.errorMessage = data.error ?? `HTTP ${res.status}`;
        setError(record.errorMessage ?? "Upload failed");
      } else {
        // Reset form on success
        setFile(null);
        setPerson(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    } catch (err) {
      record.status = "error";
      record.errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(record.errorMessage ?? "Upload failed");
    } finally {
      setUploading(false);
      saveHistory([record, ...history]);
    }
  };

  if (!token) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-sans)", background: "var(--bg)" }}>
        <div style={{ textAlign: "center", color: "var(--muted)" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
          <div style={{ fontSize: 14 }}>No active session. <a href="/" style={{ color: "var(--gold)" }}>Return to login</a></div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", fontFamily: "var(--font-sans)", background: "var(--bg)" }}>

      {/* Top bar */}
      <div style={{
        height: 56, background: "var(--navy)", display: "flex", alignItems: "center",
        padding: "0 24px", gap: 16, borderBottom: "1px solid rgba(255,255,255,0.05)",
      }}>
        <a href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 10 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          <span style={{ fontSize: 12, color: "#64748b" }}>Explorer</span>
        </a>
        <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.08)" }} />
        <div style={{ fontSize: 16, fontFamily: "var(--font-serif)", color: "var(--white)", fontWeight: 600 }}>
          Document Upload
        </div>
        <div style={{ fontSize: 11, color: "var(--gold)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
          Plurimi
        </div>
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
        <div style={{ fontSize: 12, color: "#64748b" }}>{session?.userName}</div>
      </div>

      {/* Body */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px", display: "grid", gridTemplateColumns: "400px 1fr", gap: 24, alignItems: "start" }}>

        {/* ── Upload form ── */}
        <div style={{
          background: "var(--white)", borderRadius: "var(--radius-lg)",
          border: "1px solid var(--light-border)", overflow: "hidden",
          boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        }}>
          <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--light-border)" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--navy)", fontFamily: "var(--font-serif)" }}>
              Upload to PM1
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>
              Document will be stored in Expersoft
            </div>
          </div>

          <div style={{ padding: 24 }}>

            {/* Portfolio */}
            <div style={fieldBlock}>
              <label style={labelStyle}>Portfolio</label>
              <select
                value={portfolioId}
                onChange={e => setPortfolioId(Number(e.target.value))}
                style={{ ...inputStyle, appearance: "none", backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center", paddingRight: 32 }}
              >
                {portfolios.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.description || p.pfNumber} (#{p.pfNumber})
                  </option>
                ))}
              </select>
            </div>

            {/* File drop zone */}
            <div style={fieldBlock}>
              <label style={labelStyle}>Document</label>
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: `2px dashed ${dragOver ? "var(--gold)" : file ? "var(--gold)" : "var(--border)"}`,
                  borderRadius: "var(--radius)",
                  padding: "24px 16px",
                  textAlign: "center",
                  cursor: "pointer",
                  background: dragOver ? "#fff8f3" : file ? "#fffaf7" : "var(--white)",
                  transition: "all 0.15s",
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  style={{ display: "none" }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                />
                {file ? (
                  <div>
                    <div style={{ fontSize: 24, marginBottom: 6 }}>📄</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--navy)", wordBreak: "break-all" }}>{file.name}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>
                      {(file.size / 1024).toFixed(1)} KB · {file.type || "unknown type"}
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); setFile(null); }}
                      style={{ marginTop: 8, fontSize: 11, color: "var(--muted)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: 24, marginBottom: 6 }}>⬆️</div>
                    <div style={{ fontSize: 13, color: "var(--slate)" }}>Drop file here or <span style={{ color: "var(--gold)", fontWeight: 500 }}>browse</span></div>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>PDF, Word, Excel, images…</div>
                  </div>
                )}
              </div>
            </div>

            {/* Document type */}
            <div style={fieldBlock}>
              <label style={labelStyle}>Document Type</label>
              {docTypes.length === 0 ? (
                <div style={{ fontSize: 12, color: "var(--muted)", padding: "8px 0" }}>Loading types…</div>
              ) : (
                <select
                  value={docTypeId}
                  onChange={e => setDocTypeId(Number(e.target.value))}
                  style={{ ...inputStyle, appearance: "none", backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center", paddingRight: 32 }}
                >
                  {docTypes.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Person */}
            <div style={fieldBlock}>
              <label style={labelStyle}>Linked Person <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, color: "var(--muted)" }}>(optional)</span></label>
              <PersonSearchInput token={token} value={person} onChange={setPerson} />
            </div>

            {error && (
              <div style={{ marginBottom: 16, padding: "10px 14px", background: "#fef2f2", borderRadius: "var(--radius)", fontSize: 13, color: "#dc2626", border: "1px solid #fecaca" }}>
                {error}
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={uploading || !file || !portfolioId || !docTypeId}
              style={{
                width: "100%", padding: "12px", borderRadius: "var(--radius)",
                background: uploading || !file || !portfolioId || !docTypeId ? "#f1f5f9" : "var(--navy)",
                color: uploading || !file || !portfolioId || !docTypeId ? "var(--muted)" : "var(--white)",
                border: "none", fontSize: 14, fontWeight: 600,
                cursor: uploading || !file || !portfolioId || !docTypeId ? "not-allowed" : "pointer",
                transition: "all 0.15s",
              }}
            >
              {uploading ? "Uploading…" : "Upload to PM1"}
            </button>

          </div>
        </div>

        {/* ── Upload history ── */}
        <div style={{
          background: "var(--white)", borderRadius: "var(--radius-lg)",
          border: "1px solid var(--light-border)",
          boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
          overflow: "hidden",
        }}>
          <div style={{
            padding: "20px 24px", borderBottom: "1px solid var(--light-border)",
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--navy)", fontFamily: "var(--font-serif)" }}>
                Upload History
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>
                This session · {history.length} record{history.length !== 1 ? "s" : ""}
              </div>
            </div>
            {history.length > 0 && (
              <button
                onClick={() => saveHistory([])}
                style={{ fontSize: 11, color: "var(--muted)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
              >
                Clear
              </button>
            )}
          </div>

          {history.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
              No uploads yet this session
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "var(--bg)" }}>
                    {["Time", "Portfolio", "File", "Type", "Person", "Status"].map(h => (
                      <th key={h} style={{
                        padding: "10px 16px", textAlign: "left",
                        fontSize: 11, fontWeight: 600, color: "var(--slate)",
                        textTransform: "uppercase", letterSpacing: "0.05em",
                        borderBottom: "1px solid var(--border)",
                        whiteSpace: "nowrap",
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.map((rec, i) => (
                    <tr key={rec.id} style={{
                      borderBottom: i < history.length - 1 ? "1px solid var(--light-border)" : "none",
                      transition: "background 0.1s",
                    }}>
                      <td style={{ padding: "12px 16px", color: "var(--muted)", whiteSpace: "nowrap", fontFamily: "monospace", fontSize: 11 }}>
                        {formatTs(rec.timestamp)}
                      </td>
                      <td style={{ padding: "12px 16px", fontWeight: 500, color: "var(--navy)", whiteSpace: "nowrap" }}>
                        #{rec.portfolioNumber}
                      </td>
                      <td style={{ padding: "12px 16px", color: "var(--navy)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        title={rec.fileName}>
                        {rec.fileName}
                      </td>
                      <td style={{ padding: "12px 16px", color: "var(--slate)", whiteSpace: "nowrap" }}>
                        {rec.documentTypeName}
                      </td>
                      <td style={{ padding: "12px 16px", color: "var(--muted)", whiteSpace: "nowrap" }}>
                        {rec.personName ?? <span style={{ color: "#cbd5e1" }}>—</span>}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <div>
                          <StatusBadge status={rec.status} />
                          {rec.errorMessage && (
                            <div style={{ fontSize: 11, color: "#dc2626", marginTop: 3 }}>{rec.errorMessage}</div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
