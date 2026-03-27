"use client";

import { useState, useRef, useCallback, useEffect } from "react";

// ── constants ─────────────────────────────────────────────────────────────────

const PURPOSES: Record<string, string> = {
  INVESTMENT_ORDER_CONFIRMATION: "Investment Order",
  PAYMENT_ORDER_CONFIRMATION: "Payment Order",
  PORTFOLIO_DISCUSSION: "Portfolio Discussion",
  ADVICE: "Investment Advice",
  DUE_DILIGENCE: "KYC / Due Diligence",
  ONBOARDING: "Onboarding",
  COMPLIANCE_CONTROL: "Compliance",
  OTHER: "Other",
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// ── session ───────────────────────────────────────────────────────────────────

function getSession(): { token: string; userName: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem("pm1_session");
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

// ── email parsing helpers ─────────────────────────────────────────────────────

interface ParsedEmail {
  from: string;
  fromEmail: string;
  subject: string;
  body: string;
  date: string; // YYYY-MM-DD
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeRfc2047(str: string): string {
  return str.replace(/=\?([^?]+)\?([BQbq])\?([^?]*)\?=/g, (_, charset: string, enc: string, text: string) => {
    try {
      let bytes: Uint8Array;
      if (enc.toUpperCase() === "B") {
        const bin = atob(text);
        bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      } else {
        const raw = text.replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, (_, h) =>
          String.fromCharCode(parseInt(h, 16))
        );
        bytes = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      }
      return new TextDecoder(charset).decode(bytes);
    } catch { return text; }
  });
}

function decodeQP(str: string): string {
  return str
    .replace(/=\r?\n/g, "")
    .replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n").replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n").trim();
}

function extractMultipartText(text: string, boundary: string): string {
  const parts = text.split(new RegExp("--" + escapeRegex(boundary) + "(?:--)?"));
  // prefer plain text
  for (const part of parts) {
    const sep = part.indexOf("\n\n");
    if (sep < 0) continue;
    const ph = part.slice(0, sep).toLowerCase();
    const pb = part.slice(sep + 2);
    if (ph.includes("text/plain")) {
      const encM = ph.match(/content-transfer-encoding:\s*(\S+)/);
      return encM?.[1]?.trim() === "quoted-printable" ? decodeQP(pb) : pb;
    }
  }
  // fallback: html → strip
  for (const part of parts) {
    const sep = part.indexOf("\n\n");
    if (sep < 0) continue;
    const ph = part.slice(0, sep).toLowerCase();
    const pb = part.slice(sep + 2);
    if (ph.includes("text/html")) return stripHtml(pb);
  }
  return "";
}

function parseEml(text: string): ParsedEmail {
  const norm = text.replace(/\r\n/g, "\n");
  const blank = norm.indexOf("\n\n");
  const headerSrc = blank >= 0 ? norm.slice(0, blank) : norm;
  const bodySrc = blank >= 0 ? norm.slice(blank + 2) : "";

  // unfold continuation lines
  const unfolded = headerSrc.replace(/\n[ \t]+/g, " ");
  const hmap: Record<string, string> = {};
  for (const line of unfolded.split("\n")) {
    const c = line.indexOf(":");
    if (c > 0) {
      const k = line.slice(0, c).toLowerCase().trim();
      const v = line.slice(c + 1).trim();
      if (!hmap[k]) hmap[k] = v;
    }
  }

  const fromRaw = hmap["from"] ?? "";
  const emailM = fromRaw.match(/<([^>]+)>/);
  const fromEmail = emailM ? emailM[1].trim() : fromRaw.replace(/['"<>]/g, "").trim();
  const nameM = fromRaw.match(/^"?([^"<\n]+?)"?\s*</);
  const from = nameM ? decodeRfc2047(nameM[1].trim()) : fromEmail;

  const subject = decodeRfc2047(hmap["subject"] ?? "");

  let date = todayISO();
  const dateRaw = hmap["date"];
  if (dateRaw) {
    try {
      const d = new Date(dateRaw);
      if (!isNaN(d.getTime())) date = d.toISOString().slice(0, 10);
    } catch {}
  }

  const ct = hmap["content-type"] ?? "";
  let body = "";
  if (ct.toLowerCase().includes("multipart")) {
    const bM = ct.match(/boundary="?([^";\s\r\n]+)"?/i);
    if (bM) body = extractMultipartText(norm, bM[1]);
    if (!body) body = stripHtml(bodySrc);
  } else {
    const enc = (hmap["content-transfer-encoding"] ?? "").toLowerCase().trim();
    body = enc === "quoted-printable" ? decodeQP(bodySrc) : bodySrc;
    if (ct.toLowerCase().includes("text/html")) body = stripHtml(body);
  }

  return { from, fromEmail, subject, body: body.trim(), date };
}

async function parseMsg(buffer: ArrayBuffer): Promise<ParsedEmail> {
  const { default: MsgReader } = await import("msgreader");
  const reader = new MsgReader(buffer);
  const info = reader.getFileData();

  const subject = (info.subject as string) ?? "";
  const senderName = (info.senderName as string) ?? "";
  const senderEmail = (info.senderEmail as string) ?? "";
  const body = (info.body as string) ?? "";
  const headers = (info.headers as string) ?? "";

  // Try to parse date from headers
  let date = todayISO();
  const dateM = headers.match(/^Date:\s*(.+)$/im);
  if (dateM) {
    try {
      const d = new Date(dateM[1].trim());
      if (!isNaN(d.getTime())) date = d.toISOString().slice(0, 10);
    } catch {}
  }

  return {
    from: senderName || senderEmail,
    fromEmail: senderEmail,
    subject,
    body: body.trim(),
    date,
  };
}

// ── display helpers ───────────────────────────────────────────────────────────

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return iso; }
}

// ── shared styles ─────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: "var(--radius)",
  border: "1px solid var(--border)", fontSize: 13, color: "var(--navy)",
  outline: "none", background: "var(--white)", boxSizing: "border-box",
  fontFamily: "var(--font-sans)",
};

const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: "var(--slate)",
  textTransform: "uppercase", letterSpacing: "0.06em",
  display: "block", marginBottom: 7,
};

const fieldBlock: React.CSSProperties = { marginBottom: 20 };

const cardStyle: React.CSSProperties = {
  background: "var(--white)", borderRadius: "var(--radius-lg)",
  border: "1px solid var(--light-border)",
  boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
  overflow: "hidden",
};

const cardHeader: React.CSSProperties = {
  padding: "18px 24px", borderBottom: "1px solid var(--light-border)",
};

const cardBody: React.CSSProperties = { padding: 24 };

// ── main page ─────────────────────────────────────────────────────────────────

export default function ContactLogPage() {
  const session = getSession();
  const token = session?.token ?? "";

  // Client search
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ id: number; name: string; code?: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState<{ id: number; name: string; code?: string } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Email drop zone
  const [parsedEmail, setParsedEmail] = useState<ParsedEmail | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [parseError, setParseError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form fields derived/overridable
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [purpose, setPurpose] = useState("");
  const [date, setDate] = useState(todayISO());

  // Upload state
  const [uploadStep, setUploadStep] = useState(0);
  const [result, setResult] = useState<{ contactLogId: unknown } | null>(null);
  const [error, setError] = useState("");

  // ── person search ──────────────────────────────────────────────────────────

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim() || !token) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const res = await fetch(`/api/contact-log?email=${encodeURIComponent(q.trim())}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Search failed");
      const arr: unknown[] = Array.isArray(data) ? data : [];
      setSearchResults(arr.map((p: unknown) => {
        const person = p as Record<string, unknown>;
        const firstName = (person.firstName as string) ?? "";
        const lastName = (person.lastName as string) ?? "";
        const name = (person.name as string) ||
          [firstName, lastName].filter(Boolean).join(" ") ||
          `ID ${person.id}`;
        return { id: person.id as number, name, code: person.code as string | undefined };
      }));
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, [token]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) { setSearchResults([]); return; }
    debounceRef.current = setTimeout(() => runSearch(query), 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, runSearch]);

  // ── email file processing ──────────────────────────────────────────────────

  const processFile = useCallback(async (file: File) => {
    setParseError("");
    const name = file.name.toLowerCase();
    if (!name.endsWith(".msg") && !name.endsWith(".eml")) {
      setParseError("Only .msg and .eml files are supported.");
      return;
    }
    try {
      let parsed: ParsedEmail;
      if (name.endsWith(".msg")) {
        const buf = await file.arrayBuffer();
        parsed = await parseMsg(buf);
      } else {
        const text = await file.text();
        parsed = parseEml(text);
      }
      setParsedEmail(parsed);
      setSubject(parsed.subject);
      setBody(parsed.body);
      setDate(parsed.date);
      // auto-trigger person search with sender email
      if (parsed.fromEmail) {
        setQuery(parsed.fromEmail);
        setSelectedPerson(null);
        setSearchResults([]);
        runSearch(parsed.fromEmail);
      }
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Failed to parse email file.");
    }
  }, [runSearch]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const resetEmail = () => {
    setParsedEmail(null);
    setSubject("");
    setBody("");
    setDate(todayISO());
    setQuery("");
    setSearchResults([]);
    setSelectedPerson(null);
    setParseError("");
  };

  // ── upload ─────────────────────────────────────────────────────────────────

  const canSubmit = subject.trim() && body.trim() && purpose;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setError("");
    setResult(null);

    const bodyBytes = new TextEncoder().encode(body);
    const createdOn = date || todayISO();
    const participants = [{ email: "" }];

    try {
      setUploadStep(1);
      const r1 = await fetch("/api/contact-log", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ step: 1, subject, body, createdOn, contactPurposeTypeCode: purpose, participants }),
      });
      const d1 = await r1.json();
      if (!r1.ok) throw new Error(d1.error ?? "Step 1 failed");
      const contactLogId = d1.contactLogId;

      setUploadStep(2);
      const r2 = await fetch("/api/contact-log", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          step: 2, contactLogId,
          name: `${subject}.txt`,
          mimeType: "text/plain",
          fileSize: bodyBytes.length,
          type: "FILE",
        }),
      });
      const d2 = await r2.json();
      if (!r2.ok) throw new Error(d2.error ?? "Step 2 failed");
      const attachmentId = d2.attachmentId;

      setUploadStep(3);
      const r3 = await fetch("/api/contact-log", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ step: 3, attachmentId, content: body }),
      });
      const d3 = await r3.json();
      if (!r3.ok) throw new Error(d3.error ?? "Step 3 failed");

      setResult({ contactLogId });
      setUploadStep(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setUploadStep(0);
    }
  };

  // ── not authenticated ──────────────────────────────────────────────────────

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

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", fontFamily: "var(--font-sans)", background: "var(--bg)" }}>

      {/* Top bar */}
      <div style={{
        height: 56, background: "var(--navy)", display: "flex", alignItems: "center",
        padding: "0 24px", gap: 16, borderBottom: "1px solid rgba(255,255,255,0.05)", flexShrink: 0,
      }}>
        <a href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 10 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          <span style={{ fontSize: 12, color: "#64748b" }}>Explorer</span>
        </a>
        <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.08)" }} />
        <div style={{ fontSize: 16, fontFamily: "var(--font-serif)", color: "var(--white)", fontWeight: 600 }}>
          Contact Log
        </div>
        <div style={{ fontSize: 11, color: "var(--gold)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
          Plurimi
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 12, color: "#64748b" }}>{session?.userName}</div>
      </div>

      {/* Body */}
      <div style={{ maxWidth: 700, margin: "0 auto", padding: "32px 24px", display: "flex", flexDirection: "column", gap: 20 }}>

        {/* ── Section 1: Client search ── */}
        <div style={cardStyle}>
          <div style={cardHeader}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--navy)", fontFamily: "var(--font-serif)" }}>Client</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
              Search by email to link a contact
            </div>
          </div>
          <div style={cardBody}>
            {selectedPerson ? (
              <div style={{
                display: "flex", alignItems: "center", gap: 14,
                padding: "12px 16px", borderRadius: "var(--radius)",
                background: "#fff8f3", border: "1px solid #f3d5b5",
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: "50%",
                  background: "var(--navy)", color: "var(--white)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 14, fontWeight: 700, flexShrink: 0,
                }}>
                  {initials(selectedPerson.name)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--navy)" }}>{selectedPerson.name}</div>
                  {selectedPerson.code && (
                    <div style={{ fontSize: 11, color: "var(--muted)", fontFamily: "monospace", marginTop: 2 }}>{selectedPerson.code}</div>
                  )}
                </div>
                <button
                  onClick={() => { setSelectedPerson(null); setQuery(""); setSearchResults([]); }}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 18, lineHeight: 1, padding: "2px 4px" }}
                >×</button>
              </div>
            ) : (
              <div>
                <div style={{ position: "relative", marginBottom: 10 }}>
                  <div style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", pointerEvents: "none" }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                  </div>
                  <input
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Search by email…"
                    style={{ ...inputStyle, paddingLeft: 32 }}
                  />
                  {searching && (
                    <div style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "var(--muted)" }}>…</div>
                  )}
                </div>
                {searchResults.length > 0 && (
                  <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
                    {searchResults.map((p, i) => (
                      <div
                        key={p.id}
                        onClick={() => { setSelectedPerson(p); setQuery(""); setSearchResults([]); }}
                        style={{
                          padding: "10px 14px", cursor: "pointer", fontSize: 13,
                          background: "var(--white)", borderBottom: i < searchResults.length - 1 ? "1px solid var(--light-border)" : "none",
                          display: "flex", justifyContent: "space-between", alignItems: "center",
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = "var(--bg)")}
                        onMouseLeave={e => (e.currentTarget.style.background = "var(--white)")}
                      >
                        <span style={{ fontWeight: 500, color: "var(--navy)" }}>{p.name}</span>
                        {p.code && <span style={{ fontSize: 11, color: "var(--muted)", fontFamily: "monospace" }}>{p.code}</span>}
                      </div>
                    ))}
                  </div>
                )}
                {!searching && query.trim() && searchResults.length === 0 && (
                  <div style={{ fontSize: 12, color: "var(--muted)", padding: "6px 2px" }}>No contacts found for this email.</div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Section 2: Email + Form ── */}
        <div style={cardStyle}>
          <div style={cardHeader}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--navy)", fontFamily: "var(--font-serif)" }}>Contact Log</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>Record will be stored in PM1</div>
          </div>
          <div style={cardBody}>

            {/* ── Email drop zone or preview ── */}
            <div style={fieldBlock}>
              {parsedEmail ? (
                /* Parsed email preview card */
                <div style={{
                  borderRadius: "var(--radius)", border: "1px solid #f3d5b5",
                  background: "#fffaf7", overflow: "hidden",
                }}>
                  <div style={{ padding: "12px 16px", borderBottom: "1px solid #f3d5b5", display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                      background: "var(--navy)", color: "var(--white)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 13, fontWeight: 700,
                    }}>
                      {initials(parsedEmail.from || "?")}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--navy)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {parsedEmail.from}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--muted)", fontFamily: "monospace", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {parsedEmail.fromEmail}
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap", flexShrink: 0 }}>
                      {formatDate(parsedEmail.date)}
                    </div>
                  </div>
                  <div style={{ padding: "10px 16px 12px" }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--navy)", marginBottom: 6 }}>
                      {parsedEmail.subject || <span style={{ color: "var(--muted)", fontStyle: "italic" }}>No subject</span>}
                    </div>
                    <div style={{
                      fontSize: 12, color: "var(--slate)", lineHeight: 1.5,
                      maxHeight: 72, overflow: "hidden",
                      display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical",
                    }}>
                      {parsedEmail.body.slice(0, 400) || <span style={{ color: "var(--muted)", fontStyle: "italic" }}>No body</span>}
                    </div>
                  </div>
                  <div style={{ padding: "8px 16px", borderTop: "1px solid #f3d5b5" }}>
                    <button
                      onClick={resetEmail}
                      style={{ fontSize: 11, color: "var(--muted)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", padding: 0, fontFamily: "var(--font-sans)" }}
                    >
                      Drop a different file
                    </button>
                  </div>
                </div>
              ) : (
                /* Drop zone */
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".msg,.eml"
                    style={{ display: "none" }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f); e.target.value = ""; }}
                  />
                  <div
                    onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false); }}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      border: `2px dashed ${dragOver ? "#b07840" : "var(--gold)"}`,
                      borderRadius: "var(--radius-lg)",
                      padding: "40px 24px",
                      textAlign: "center",
                      cursor: "pointer",
                      background: dragOver ? "#fff3e8" : "#fffaf7",
                      transition: "all 0.15s",
                    }}
                  >
                    <svg
                      width="28" height="28" viewBox="0 0 24 24" fill="none"
                      stroke="var(--gold)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                      style={{ marginBottom: 12 }}
                    >
                      <rect x="2" y="4" width="20" height="16" rx="2" />
                      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                    </svg>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--navy)", marginBottom: 4 }}>
                      Drop your email here
                    </div>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>
                      .msg or .eml · or{" "}
                      <span style={{ color: "var(--gold)", fontWeight: 500 }}>browse</span>
                    </div>
                  </div>
                  {parseError && (
                    <div style={{ marginTop: 8, fontSize: 12, color: "#dc2626" }}>{parseError}</div>
                  )}
                </div>
              )}
            </div>

            {/* Purpose */}
            <div style={fieldBlock}>
              <label style={labelStyle}>Purpose</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {Object.entries(PURPOSES).map(([code, label]) => {
                  const active = purpose === code;
                  return (
                    <button
                      key={code}
                      onClick={() => setPurpose(active ? "" : code)}
                      style={{
                        padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 500,
                        border: `1px solid ${active ? "var(--gold)" : "var(--border)"}`,
                        background: active ? "#fff8f3" : "var(--white)",
                        color: active ? "var(--gold)" : "var(--slate)",
                        cursor: "pointer", transition: "all 0.15s",
                        fontFamily: "var(--font-sans)",
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Date */}
            <div style={{ ...fieldBlock, marginBottom: 0 }}>
              <label style={labelStyle}>Date</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                style={{ ...inputStyle, width: 200 }}
              />
            </div>

          </div>
        </div>

        {/* ── Section 3: Upload ── */}
        <div style={cardStyle}>
          <div style={cardBody}>

            {uploadStep > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, color: "var(--slate)", marginBottom: 10, fontWeight: 500 }}>
                  Saving to PM1… step {uploadStep} of 3
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {[1, 2, 3].map(s => (
                    <div key={s} style={{
                      flex: 1, height: 4, borderRadius: 2,
                      background: s <= uploadStep ? "var(--gold)" : "var(--border)",
                      transition: "background 0.3s",
                    }} />
                  ))}
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                  {["Create log", "Register attachment", "Upload content"].map((label, i) => (
                    <div key={i} style={{
                      flex: 1, fontSize: 10, color: i + 1 <= uploadStep ? "var(--gold)" : "var(--muted)",
                      textAlign: "center", transition: "color 0.3s",
                    }}>
                      {label}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {result && (
              <div style={{
                marginBottom: 16, padding: "14px 16px", background: "#f0fdf4",
                borderRadius: "var(--radius)", border: "1px solid #bbf7d0",
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#16a34a", marginBottom: 4 }}>
                  ✓ Contact log saved successfully
                </div>
                <div style={{ fontSize: 12, color: "#15803d" }}>
                  PM1 Contact Log ID:{" "}
                  <span style={{ fontFamily: "monospace", fontWeight: 700 }}>{String(result.contactLogId)}</span>
                </div>
              </div>
            )}

            {error && (
              <div style={{
                marginBottom: 16, padding: "10px 14px", background: "#fef2f2",
                borderRadius: "var(--radius)", fontSize: 13, color: "#dc2626", border: "1px solid #fecaca",
              }}>
                {error}
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={uploadStep > 0 || !canSubmit}
              style={{
                width: "100%", padding: 12, borderRadius: "var(--radius)",
                background: uploadStep > 0 || !canSubmit ? "#f1f5f9" : "var(--navy)",
                color: uploadStep > 0 || !canSubmit ? "var(--muted)" : "var(--white)",
                border: "none", fontSize: 14, fontWeight: 600,
                cursor: uploadStep > 0 || !canSubmit ? "not-allowed" : "pointer",
                transition: "all 0.15s", fontFamily: "var(--font-sans)",
              }}
            >
              {uploadStep > 0 ? `Saving… (${uploadStep}/3)` : "Save Contact Log"}
            </button>

            {!canSubmit && uploadStep === 0 && (
              <div style={{ fontSize: 11, color: "var(--muted)", textAlign: "center", marginTop: 8 }}>
                {!parsedEmail ? "Drop an email file above" : !purpose ? "Select a purpose" : "Subject and body are required"}
              </div>
            )}

          </div>
        </div>

      </div>
    </div>
  );
}
