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

function pm1Base() {
  return process.env.NEXT_PUBLIC_PM1_API_BASE ?? "";
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

async function parseMsg(file: File): Promise<ParsedEmail> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/parse-email", { method: "POST", body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to parse .msg file");
  return {
    from: data.from ?? data.fromEmail ?? "",
    fromEmail: data.fromEmail ?? "",
    subject: data.subject ?? "",
    body: data.body ?? "",
    date: data.date ?? todayISO(),
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
  const [searchResults, setSearchResults] = useState<{ id: number; name: string; code?: string; personType?: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState<{ id: number; name: string; code?: string; personType?: string } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Email drop zone
  const [parsedEmail, setParsedEmail] = useState<ParsedEmail | null>(null);
  const [emailFile, setEmailFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [parseError, setParseError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form fields
  const [subject, setSubject] = useState("");
  const [note, setNote] = useState("");
  const [purpose, setPurpose] = useState("");
  const [date, setDate] = useState(todayISO());

  // Upload state
  const [uploadStep, setUploadStep] = useState(0);
  const [result, setResult] = useState<{ contactLogId: unknown } | null>(null);
  const [error, setError] = useState("");

  // ── person search ──────────────────────────────────────────────────────────

  const mapPersons = useCallback((arr: unknown[]) =>
    arr.map((p: unknown) => {
      const person = p as Record<string, unknown>;
      const firstName = (person.firstName as string) ?? "";
      const lastName = (person.lastName as string) ?? "";
      const name = (person.name as string) ||
        [firstName, lastName].filter(Boolean).join(" ") ||
        `ID ${person.id}`;
      return {
        id: person.id as number,
        name,
        code: (person.code as string) ?? undefined,
        personType: (person.type as string) ?? (person.personType as string) ?? undefined,
      };
    }), []);

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim() || !token) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const base = pm1Base();
      const auth = { Authorization: `Bearer ${token}` };

      // Stage 1: email lookup — /outlook/persons?email=
      const r1 = await fetch(`${base}/outlook/persons?email=${encodeURIComponent(q.trim())}`, { headers: auth });
      const d1 = await r1.json();
      const arr1: unknown[] = r1.ok && Array.isArray(d1) ? d1 : [];

      if (arr1.length > 0) {
        setSearchResults(mapPersons(arr1));
        return;
      }

      // Stage 2: text search — /persons?searchText=&maxResults=10
      const r2 = await fetch(`${base}/persons?searchText=${encodeURIComponent(q.trim())}&maxResults=10`, { headers: auth });
      const d2 = await r2.json();
      const arr2: unknown[] = r2.ok && Array.isArray(d2) ? d2 : [];
      setSearchResults(mapPersons(arr2));
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, [token, mapPersons]);

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
        parsed = await parseMsg(file);
      } else {
        const text = await file.text();
        parsed = parseEml(text);
      }
      setParsedEmail(parsed);
      setEmailFile(file);
      setSubject(parsed.subject);
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
    setEmailFile(null);
    setSubject("");
    setNote("");
    setDate(todayISO());
    setQuery("");
    setSearchResults([]);
    setSelectedPerson(null);
    setParseError("");
  };

  // ── upload ─────────────────────────────────────────────────────────────────

  const canSubmit = !!(emailFile && subject.trim() && purpose);

  const handleSubmit = async () => {
    if (!canSubmit || !emailFile || !parsedEmail) return;
    setError("");
    setResult(null);

    const autoDescription = `Email from ${parsedEmail.from || parsedEmail.fromEmail}: ${parsedEmail.subject}`;
    const contactBody = note.trim() ? `${note.trim()}\n\n${autoDescription}` : autoDescription;
    const createdOn = date || todayISO();
    const participants = [{ email: parsedEmail.fromEmail || "" }];
    const base = pm1Base();
    const auth = { Authorization: `Bearer ${token}` };

    const pm1Json = async (res: Response, label: string) => {
      const text = await res.text();
      if (!res.ok) throw new Error(`${label} failed ${res.status}: ${text}`);
      try { return JSON.parse(text); } catch { return text; }
    };

    try {
      // Step 1: create contact log
      setUploadStep(1);
      const d1 = await pm1Json(await fetch(`${base}/outlook/contactLogs`, {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ subject, body: contactBody, createdOn, contactPurposeTypeCode: purpose, participants }),
      }), "Step 1");
      const contactLogId = (d1 as Record<string, unknown>)?.id ?? (d1 as Record<string, unknown>)?.contactLogId ?? d1;

      // Step 2: register attachment metadata
      setUploadStep(2);
      const d2 = await pm1Json(await fetch(`${base}/outlook/contactLogs/${contactLogId}/attachments`, {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: emailFile.name,
          mimeType: emailFile.type || "application/octet-stream",
          fileSize: emailFile.size,
          type: "FILE",
        }),
      }), "Step 2");
      const attachmentId = (d2 as Record<string, unknown>)?.id ?? (d2 as Record<string, unknown>)?.attachmentId ?? d2;

      // Step 3: upload raw file bytes directly to PM1
      setUploadStep(3);
      const fileBytes = await emailFile.arrayBuffer();
      await pm1Json(await fetch(`${base}/outlook/attachments/${attachmentId}`, {
        method: "POST",
        headers: { ...auth, "Content-Type": emailFile.type || "application/octet-stream" },
        body: fileBytes,
      }), "Step 3");

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
              Search by name or email to link a contact
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
                    placeholder="Search by name or email…"
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
                        <span style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                          {p.personType && (
                            <span style={{
                              fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 10,
                              background: p.personType === "NATURAL_PERSON" ? "#f0f9ff" : "#f5f3ff",
                              color: p.personType === "NATURAL_PERSON" ? "#0369a1" : "#6d28d9",
                              border: `1px solid ${p.personType === "NATURAL_PERSON" ? "#bae6fd" : "#ddd6fe"}`,
                              textTransform: "uppercase", letterSpacing: "0.03em",
                            }}>
                              {p.personType === "NATURAL_PERSON" ? "Person" : p.personType === "LEGAL_ENTITY" ? "Entity" : p.personType}
                            </span>
                          )}
                          {p.code && <span style={{ fontSize: 11, color: "var(--muted)", fontFamily: "monospace" }}>{p.code}</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {!searching && query.trim() && searchResults.length === 0 && (
                  <div style={{ fontSize: 12, color: "var(--muted)", padding: "6px 2px" }}>No results — try a different name or email.</div>
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
                  <div style={{ padding: "10px 16px 12px", display: "flex", alignItems: "center", gap: 12 }}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--navy)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {emailFile?.name ?? parsedEmail.subject}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                        {emailFile ? `${(emailFile.size / 1024).toFixed(1)} KB · ${emailFile.type || "application/octet-stream"}` : parsedEmail.subject}
                      </div>
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

            {/* Note */}
            <div style={fieldBlock}>
              <label style={labelStyle}>
                Note <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, color: "var(--muted)" }}>(optional)</span>
              </label>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                rows={2}
                placeholder="Add context or additional notes…"
                style={{ ...inputStyle, resize: "vertical", minHeight: 60 }}
              />
              {parsedEmail && (
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 5, lineHeight: 1.4 }}>
                  Auto-description: <em style={{ color: "var(--slate)" }}>Email from {parsedEmail.from || parsedEmail.fromEmail}: {parsedEmail.subject}</em>
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
                <div style={{ fontSize: 13, fontWeight: 600, color: "#16a34a", marginBottom: 6 }}>
                  ✓ Contact log saved successfully
                </div>
                {subject && (
                  <div style={{ fontSize: 12, color: "#15803d", marginBottom: 2 }}>
                    <span style={{ fontWeight: 600 }}>Subject:</span> {subject}
                  </div>
                )}
                {selectedPerson && (
                  <div style={{ fontSize: 12, color: "#15803d", marginBottom: 2 }}>
                    <span style={{ fontWeight: 600 }}>Client:</span> {selectedPerson.name}
                    {selectedPerson.code && <span style={{ fontFamily: "monospace", marginLeft: 6, opacity: 0.7 }}>{selectedPerson.code}</span>}
                  </div>
                )}
                <div style={{ fontSize: 11, color: "#86efac", marginTop: 4, fontFamily: "monospace" }}>
                  ID {String(result.contactLogId)}
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
                {!emailFile ? "Drop an email file above" : !purpose ? "Select a purpose" : "Subject is required"}
              </div>
            )}

          </div>
        </div>

      </div>
    </div>
  );
}
