'use client';

import { useEffect, useState, useCallback } from 'react';

const PM1_BASE = 'https://plu-pm1api.cloud.expersoft.com/pm1j-web-services/REST';

const PURPOSE_WHITELIST = [
  { code: 'INVESTMENT_ORDER_CONFIRMATION', label: 'Investment Order' },
  { code: 'PAYMENT_ORDER_CONFIRMATION',    label: 'Payment Order' },
  { code: 'PORTFOLIO_DISCUSSION',          label: 'Portfolio Discussion' },
  { code: 'ADVICE',                        label: 'Investment Advice' },
  { code: 'DUE_DILIGENCE',                 label: 'KYC / Due Diligence' },
  { code: 'ONBOARDING',                    label: 'Onboarding' },
  { code: 'COMPLIANCE_CONTROL',            label: 'Compliance' },
  { code: 'OTHER',                         label: 'Other' },
];

// ─── Auth helpers ────────────────────────────────────────────────────────────

function makeBasicHeader(username, password) {
  return 'Basic ' + btoa(`${username}:${password}`);
}

function getStoredAuth() {
  try { return localStorage.getItem('pm1_basic_auth'); } catch { return null; }
}

function setStoredAuth(header) {
  try { localStorage.setItem('pm1_basic_auth', header); } catch {}
}

function clearStoredAuth() {
  try { localStorage.removeItem('pm1_basic_auth'); } catch {}
}

// ─── PM1 API calls ───────────────────────────────────────────────────────────

async function pm1Get(path, auth) {
  const res = await fetch(`${PM1_BASE}${path}`, {
    headers: { Authorization: auth, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

async function pm1Post(path, auth, body) {
  const res = await fetch(`${PM1_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: auth,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status}`);
  if (res.status === 204) return null;
  return res.json();
}

async function pm1PostBinary(path, auth, buffer, mimeType) {
  const res = await fetch(`${PM1_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: auth,
      'Content-Type': mimeType || 'application/octet-stream',
    },
    body: buffer,
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function OutlookAddin() {
  const [phase, setPhase]           = useState('boot'); // boot | login | main | uploading | success | error
  const [auth, setAuth]             = useState(null);
  const [loginForm, setLoginForm]   = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState('');

  // Email context
  const [email, setEmail] = useState(null);

  // Client resolution
  const [participants, setParticipants] = useState([]);
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [personSearch, setPersonSearch] = useState('');
  const [personResults, setPersonResults] = useState([]);
  const [searchingPerson, setSearchingPerson] = useState(false);

  // Purpose
  const [selectedPurpose, setSelectedPurpose] = useState(PURPOSE_WHITELIST[0].code);

  // Status
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg]   = useState('');

  // ── Boot: check stored auth + load Office context ──
  useEffect(() => {
    const stored = getStoredAuth();
    if (stored) {
      setAuth(stored);
      loadEmailContext();
      setPhase('main');
    } else {
      setPhase('login');
    }
  }, []);

  // ── Load Office.js email context ──
  function loadEmailContext() {
    if (typeof Office === 'undefined') {
      // Dev fallback
      setEmail({
        subject: '[DEV] Test email subject',
        body: 'This is a test email body for development.',
        messageId: 'dev-message-id-001',
        createdOn: new Date().toISOString(),
        senderEmail: 'client@example.com',
        senderName: 'Test Client',
        toEmails: ['hugo@plurimi.com'],
      });
      return;
    }

    Office.onReady(() => {
      const item = Office.context.mailbox.item;
      item.body.getAsync(Office.CoercionType.Text, (result) => {
        const emailData = {
          subject: item.subject,
          body: result.value || '',
          messageId: item.internetMessageId,
          createdOn: item.dateTimeCreated?.toISOString() || new Date().toISOString(),
          senderEmail: item.sender?.emailAddress || item.from?.emailAddress || '',
          senderName: item.sender?.displayName || item.from?.displayName || '',
          toEmails: (item.to || []).map(r => r.emailAddress),
        };
        setEmail(emailData);

        // Auto-resolve sender to PM1 person
        if (emailData.senderEmail) {
          resolveEmail(emailData.senderEmail, stored => stored || auth);
        }
      });
    });
  }

  // ── Login ──
  async function handleLogin() {
    setLoginError('');
    const header = makeBasicHeader(loginForm.username, loginForm.password);
    try {
      // Verify credentials by hitting a lightweight endpoint
      await pm1Get('/outlook/purposes', header);
      setStoredAuth(header);
      setAuth(header);
      loadEmailContext();
      setPhase('main');
    } catch (e) {
      setLoginError('Invalid credentials. Please try again.');
    }
  }

  // ── Resolve email to PM1 person ──
  async function resolveEmail(emailAddr, getAuth) {
    const a = typeof getAuth === 'function' ? getAuth() : (auth);
    if (!a || !emailAddr) return;
    try {
      const results = await pm1Get(`/outlook/persons?email=${encodeURIComponent(emailAddr)}`, a);
      if (results?.length === 1) {
        setSelectedPerson(results[0]);
      } else if (results?.length > 1) {
        setParticipants(results);
      }
    } catch {}
  }

  // ── Manual person search ──
  const searchPerson = useCallback(async (query) => {
    if (!query || query.length < 2) { setPersonResults([]); return; }
    setSearchingPerson(true);
    try {
      const results = await pm1Get(`/outlook/persons?email=${encodeURIComponent(query)}`, auth);
      setPersonResults(results || []);
    } catch {
      setPersonResults([]);
    } finally {
      setSearchingPerson(false);
    }
  }, [auth]);

  useEffect(() => {
    const t = setTimeout(() => searchPerson(personSearch), 400);
    return () => clearTimeout(t);
  }, [personSearch, searchPerson]);

  // ── Upload flow ──
  async function handleUpload() {
    if (!selectedPerson) { setErrorMsg('Please select a client.'); return; }
    if (!email) { setErrorMsg('No email loaded.'); return; }

    setPhase('uploading');
    setStatusMsg('Creating contact log…');
    setErrorMsg('');

    try {
      // Step 1 — create contact log
      const allEmails = [email.senderEmail, ...email.toEmails].filter(Boolean);
      const contactLog = await pm1Post('/outlook/contactLogs', auth, {
        subject: email.subject,
        body: email.body.slice(0, 4000), // truncate to avoid payload issues
        createdOn: email.createdOn,
        messageId: email.messageId,
        contactPurposeTypeCode: selectedPurpose,
        participants: allEmails.map(e => ({ email: e })),
      });

      if (!contactLog?.id) throw new Error('No contact log ID returned');
      const contactLogId = contactLog.id;

      // Step 2 — register attachment metadata
      setStatusMsg('Registering attachment…');
      const filename = `${email.subject.replace(/[^a-zA-Z0-9 _-]/g, '').trim().slice(0, 60)}.txt`;
      const bodyBytes = new TextEncoder().encode(email.body);

      const attachment = await pm1Post(
        `/outlook/contactLogs/${contactLogId}/attachments`,
        auth,
        {
          name: filename,
          mimeType: 'text/plain',
          fileSize: bodyBytes.byteLength,
          type: 'FILE',
        }
      );

      if (!attachment?.id) throw new Error('No attachment ID returned');

      // Step 3 — post binary
      setStatusMsg('Uploading content…');
      await pm1PostBinary(
        `/outlook/attachments/${attachment.id}`,
        auth,
        bodyBytes,
        'text/plain'
      );

      setPhase('success');
      setStatusMsg(`Saved to PM1 · Contact log #${contactLogId}`);

    } catch (e) {
      setPhase('error');
      setErrorMsg(`Upload failed: ${e.message}`);
    }
  }

  function handleReset() {
    setPhase('main');
    setStatusMsg('');
    setErrorMsg('');
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  if (phase === 'boot') return <Screen><Spinner /></Screen>;

  if (phase === 'login') return (
    <Screen>
      <div style={styles.loginBox}>
        <Logo />
        <p style={styles.loginSubtitle}>Sign in to PM1</p>
        <input
          style={styles.input}
          placeholder="Username"
          value={loginForm.username}
          onChange={e => setLoginForm(f => ({ ...f, username: e.target.value }))}
          onKeyDown={e => e.key === 'Enter' && handleLogin()}
          autoComplete="username"
        />
        <input
          style={styles.input}
          type="password"
          placeholder="Password"
          value={loginForm.password}
          onChange={e => setLoginForm(f => ({ ...f, password: e.target.value }))}
          onKeyDown={e => e.key === 'Enter' && handleLogin()}
          autoComplete="current-password"
        />
        {loginError && <p style={styles.errorText}>{loginError}</p>}
        <button style={styles.btnPrimary} onClick={handleLogin}>Sign in</button>
      </div>
    </Screen>
  );

  if (phase === 'uploading') return (
    <Screen>
      <div style={styles.centered}>
        <Spinner />
        <p style={styles.statusText}>{statusMsg}</p>
      </div>
    </Screen>
  );

  if (phase === 'success') return (
    <Screen>
      <div style={styles.centered}>
        <div style={styles.successIcon}>✓</div>
        <p style={styles.successText}>Saved to PM1</p>
        <p style={styles.mutedText}>{statusMsg}</p>
        <button style={styles.btnSecondary} onClick={handleReset}>Save another</button>
      </div>
    </Screen>
  );

  if (phase === 'error') return (
    <Screen>
      <div style={styles.centered}>
        <div style={styles.errorIcon}>✗</div>
        <p style={styles.errorText}>{errorMsg}</p>
        <button style={styles.btnSecondary} onClick={handleReset}>Try again</button>
      </div>
    </Screen>
  );

  // ── Main panel ──
  return (
    <Screen>
      <div style={styles.panel}>
        {/* Header */}
        <div style={styles.header}>
          <Logo />
          <button style={styles.signOutBtn} onClick={() => { clearStoredAuth(); setPhase('login'); }}>
            Sign out
          </button>
        </div>

        {/* Email subject */}
        {email && (
          <div style={styles.emailCard}>
            <p style={styles.emailSubject} title={email.subject}>
              {email.subject || '(no subject)'}
            </p>
            <p style={styles.emailMeta}>{email.senderName} · {formatDate(email.createdOn)}</p>
          </div>
        )}

        <div style={styles.divider} />

        {/* Client */}
        <label style={styles.label}>Client</label>
        {selectedPerson ? (
          <div style={styles.personCard}>
            <div style={styles.personAvatar}>{initials(selectedPerson)}</div>
            <div style={styles.personInfo}>
              <p style={styles.personName}>{selectedPerson.displayName || selectedPerson.name}</p>
              <p style={styles.personCode}>{selectedPerson.code}</p>
            </div>
            <button style={styles.clearBtn} onClick={() => setSelectedPerson(null)}>×</button>
          </div>
        ) : (
          <>
            {participants.length > 1 && (
              <div style={styles.participantList}>
                {participants.map(p => (
                  <button key={p.id} style={styles.participantBtn} onClick={() => setSelectedPerson(p)}>
                    {p.displayName || p.name}
                  </button>
                ))}
              </div>
            )}
            <input
              style={styles.input}
              placeholder="Search by email or name…"
              value={personSearch}
              onChange={e => setPersonSearch(e.target.value)}
            />
            {searchingPerson && <p style={styles.mutedText}>Searching…</p>}
            {personResults.length > 0 && (
              <div style={styles.dropdown}>
                {personResults.map(p => (
                  <button
                    key={p.id}
                    style={styles.dropdownItem}
                    onClick={() => { setSelectedPerson(p); setPersonResults([]); setPersonSearch(''); }}
                  >
                    <span style={styles.dropdownName}>{p.displayName || p.name}</span>
                    <span style={styles.dropdownCode}>{p.code}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        <div style={{ height: 12 }} />

        {/* Purpose */}
        <label style={styles.label}>Purpose</label>
        <div style={styles.purposeGrid}>
          {PURPOSE_WHITELIST.map(p => (
            <button
              key={p.code}
              style={{
                ...styles.purposeChip,
                ...(selectedPurpose === p.code ? styles.purposeChipActive : {}),
              }}
              onClick={() => setSelectedPurpose(p.code)}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div style={{ height: 16 }} />

        {/* Error */}
        {errorMsg && <p style={styles.errorText}>{errorMsg}</p>}

        {/* Upload button */}
        <button
          style={{ ...styles.btnPrimary, opacity: selectedPerson ? 1 : 0.4 }}
          onClick={handleUpload}
          disabled={!selectedPerson}
        >
          Save to PM1
        </button>
      </div>
    </Screen>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Screen({ children }) {
  return (
    <div style={styles.screen}>
      <style>{globalStyles}</style>
      {children}
    </div>
  );
}

function Logo() {
  return (
    <div style={styles.logo}>
      <span style={styles.logoText}>PLURIMI</span>
      <span style={styles.logoSub}>PM1</span>
    </div>
  );
}

function Spinner() {
  return <div style={styles.spinner} />;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return iso; }
}

function initials(person) {
  const name = person.displayName || person.name || '?';
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const C = {
  navy:   '#1E2B3C',
  gold:   '#C4874A',
  grey:   '#f3f4f5',
  white:  '#ffffff',
  muted:  '#8a9bb0',
  border: '#dde3ea',
  error:  '#c0392b',
  success:'#27ae60',
};

const globalStyles = `
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600&family=DM+Sans:wght@400;500&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: ${C.white}; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
`;

const styles = {
  screen: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: 13,
    color: C.navy,
    background: C.white,
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
  },
  panel: {
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
    animation: 'fadeIn 0.2s ease',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  logo: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 6,
  },
  logoText: {
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: 18,
    fontWeight: 600,
    color: C.navy,
    letterSpacing: '0.12em',
  },
  logoSub: {
    fontSize: 10,
    fontWeight: 500,
    color: C.gold,
    letterSpacing: '0.08em',
    background: C.navy,
    padding: '1px 5px',
    borderRadius: 3,
  },
  signOutBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: C.muted,
    fontSize: 11,
    padding: '2px 4px',
  },
  emailCard: {
    background: C.grey,
    borderRadius: 6,
    padding: '10px 12px',
    marginBottom: 14,
    borderLeft: `3px solid ${C.gold}`,
  },
  emailSubject: {
    fontSize: 13,
    fontWeight: 500,
    color: C.navy,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  emailMeta: {
    fontSize: 11,
    color: C.muted,
    marginTop: 3,
  },
  divider: {
    height: 1,
    background: C.border,
    marginBottom: 14,
  },
  label: {
    fontSize: 10,
    fontWeight: 500,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: C.muted,
    marginBottom: 6,
    display: 'block',
  },
  input: {
    width: '100%',
    padding: '8px 10px',
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    fontSize: 13,
    color: C.navy,
    outline: 'none',
    background: C.white,
    marginBottom: 6,
  },
  personCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    background: C.grey,
    borderRadius: 6,
    padding: '8px 10px',
    marginBottom: 4,
  },
  personAvatar: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    background: C.navy,
    color: C.white,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 11,
    fontWeight: 500,
    flexShrink: 0,
  },
  personInfo: {
    flex: 1,
    minWidth: 0,
  },
  personName: {
    fontSize: 13,
    fontWeight: 500,
    color: C.navy,
  },
  personCode: {
    fontSize: 11,
    color: C.muted,
    marginTop: 1,
  },
  clearBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: C.muted,
    fontSize: 18,
    lineHeight: 1,
    padding: '0 2px',
  },
  participantList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    marginBottom: 8,
  },
  participantBtn: {
    background: C.grey,
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    padding: '7px 10px',
    cursor: 'pointer',
    fontSize: 12,
    color: C.navy,
    textAlign: 'left',
  },
  dropdown: {
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 6,
    background: C.white,
    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
  },
  dropdownItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 12px',
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    width: '100%',
    textAlign: 'left',
    borderBottom: `1px solid ${C.border}`,
  },
  dropdownName: {
    fontSize: 13,
    color: C.navy,
  },
  dropdownCode: {
    fontSize: 11,
    color: C.muted,
  },
  purposeGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
  },
  purposeChip: {
    padding: '5px 10px',
    borderRadius: 20,
    border: `1px solid ${C.border}`,
    background: C.white,
    color: C.navy,
    fontSize: 11,
    cursor: 'pointer',
    fontFamily: "'DM Sans', sans-serif",
    transition: 'all 0.15s',
  },
  purposeChipActive: {
    background: C.navy,
    color: C.white,
    border: `1px solid ${C.navy}`,
  },
  btnPrimary: {
    width: '100%',
    padding: '10px',
    background: C.navy,
    color: C.white,
    border: 'none',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: "'DM Sans', sans-serif",
    letterSpacing: '0.02em',
    transition: 'background 0.15s',
  },
  btnSecondary: {
    padding: '8px 20px',
    background: 'none',
    color: C.navy,
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    fontSize: 13,
    cursor: 'pointer',
    fontFamily: "'DM Sans', sans-serif",
    marginTop: 12,
  },
  centered: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '60vh',
    padding: 24,
    gap: 8,
  },
  loginBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    padding: 24,
    maxWidth: 280,
    margin: '0 auto',
    marginTop: 40,
  },
  loginSubtitle: {
    fontSize: 12,
    color: C.muted,
    marginBottom: 4,
  },
  spinner: {
    width: 28,
    height: 28,
    border: `2px solid ${C.border}`,
    borderTopColor: C.gold,
    borderRadius: '50%',
    animation: 'spin 0.7s linear infinite',
  },
  statusText: {
    fontSize: 13,
    color: C.muted,
    marginTop: 12,
  },
  successIcon: {
    width: 48,
    height: 48,
    borderRadius: '50%',
    background: C.success,
    color: C.white,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 22,
    marginBottom: 4,
  },
  successText: {
    fontSize: 15,
    fontWeight: 500,
    color: C.navy,
  },
  errorIcon: {
    width: 48,
    height: 48,
    borderRadius: '50%',
    background: C.error,
    color: C.white,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 22,
    marginBottom: 4,
  },
  errorText: {
    fontSize: 12,
    color: C.error,
    marginBottom: 6,
  },
  mutedText: {
    fontSize: 12,
    color: C.muted,
    textAlign: 'center',
  },
};
