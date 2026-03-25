// src/components/PortfolioCard.tsx
"use client";

import type { Portfolio } from "@/lib/types";
import { Icons } from "./Icons";

interface Props {
  pf: Portfolio;
  selected: boolean;
  onClick: () => void;
}

export default function PortfolioCard({ pf, selected, onClick }: Props) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: "11px 14px",
        borderRadius: "var(--radius)",
        cursor: "pointer",
        border: selected ? "1px solid var(--gold)" : "1px solid var(--border)",
        background: selected ? "#fff8f3" : "var(--white)",
        transition: "all 0.15s",
        display: "flex",
        alignItems: "center",
        gap: 11,
        userSelect: "none",
      }}
    >
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: "var(--radius-sm)",
          background: selected ? "var(--gold)" : "#f1f5f9",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: selected ? "var(--white)" : "var(--muted)",
          flexShrink: 0,
          transition: "all 0.15s",
        }}
      >
        {pf.isConsolidated ? Icons.consolidated : Icons.single}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: selected ? "var(--gold)" : "var(--navy)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            lineHeight: 1.3,
          }}
        >
          {pf.description || pf.pfNumber}
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--muted)",
            marginTop: 3,
            display: "flex",
            gap: 8,
            alignItems: "center",
          }}
        >
          <span>#{pf.pfNumber}</span>
          {pf.isConsolidated && (
            <span style={{ color: "var(--gold)", fontWeight: 500 }}>Consolidated</span>
          )}
          {pf.isAggregated && (
            <span style={{ color: "var(--slate)" }}>Aggregated</span>
          )}
        </div>
      </div>

      <div style={{ fontSize: 10, color: "#cbd5e1", fontFamily: "monospace", flexShrink: 0 }}>
        {pf.id}
      </div>
    </div>
  );
}
