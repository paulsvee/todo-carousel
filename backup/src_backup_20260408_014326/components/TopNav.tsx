"use client";

import React from "react";
import Link from "next/link";

type TopNavCurrent = "main" | "trash";

export default function TopNav({
  current, titleValue, mottoValue, onChangeTitle, onChangeMotto,
  titleReadOnly = false, mottoReadOnly = false, sidebarToggle, children,
}: {
  current: TopNavCurrent;
  titleValue: string; mottoValue: string;
  onChangeTitle: (v: string) => void; onChangeMotto: (v: string) => void;
  titleReadOnly?: boolean; mottoReadOnly?: boolean;
  sidebarToggle?: React.ReactNode; children?: React.ReactNode;
}) {
  const onStyle = { background: "rgba(255,255,255,0.10)", borderColor: "rgba(255,255,255,0.26)" } as const;
  return (
    <div className="topbar">
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {sidebarToggle}
        <div className="psv-brand">
          <input className="psv-titleText psv-titleInput" value={titleValue} readOnly={titleReadOnly}
            onChange={(e) => onChangeTitle(e.target.value)} aria-label="App title"
            style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.2, letterSpacing: "-0.03em" }} />
          <input className="psv-subText psv-titleInput" value={mottoValue} readOnly={mottoReadOnly}
            onChange={(e) => onChangeMotto(e.target.value)} placeholder="좌우명 / 오늘 한 줄 메모"
            style={{ fontSize: 12, lineHeight: 1.3 }} />
        </div>
      </div>
      <div className="topActions">
        <Link className="iconBtn" href="/" title="Home" style={current === "main" ? onStyle : {}}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M3 10.5L12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V10.5Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          </svg>
        </Link>

        <Link className="iconBtn" href="/trash" title="휴지통" style={current === "trash" ? onStyle : {}}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M9 3h6m-8 4h10m-9 0l1 14h6l1-14M10 11v7m4-7v7M5 7h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
        {children}
      </div>
    </div>
  );
}
