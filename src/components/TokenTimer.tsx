// src/components/TokenTimer.tsx
"use client";

import { useState, useEffect } from "react";

interface Props {
  exp: number; // Unix timestamp seconds
  onExpired: () => void;
}

export default function TokenTimer({ exp, onExpired }: Props) {
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
  const pct = Math.min(100, (remaining / (30 * 60)) * 100);
  const urgent = remaining < 120;
  const color = urgent ? "#ef4444" : "var(--gold)";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <svg
        width="12" height="12" viewBox="0 0 24 24"
        fill="none" stroke={color} strokeWidth="2"
        style={{ flexShrink: 0 }}
      >
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
      <span style={{
        fontFamily: "monospace",
        fontSize: 12,
        fontWeight: 600,
        color,
        minWidth: 36,
      }}>
        {mins}:{String(secs).padStart(2, "0")}
      </span>
      <div style={{
        width: 48, height: 3,
        background: "rgba(255,255,255,0.1)",
        borderRadius: 2,
        overflow: "hidden",
      }}>
        <div style={{
          height: "100%",
          width: `${pct}%`,
          background: color,
          borderRadius: 2,
          transition: "width 1s linear, background 0.5s",
        }} />
      </div>
    </div>
  );
}
