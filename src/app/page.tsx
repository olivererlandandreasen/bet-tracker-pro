"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import s from "./page.module.css";
import type { Bet } from "@prisma/client";
import { BetSelection } from "@/lib/db";

type BetFull = Bet & { sport?: string; market?: string; profit?: number };
type StatusFilter = "all" | "pending" | "won" | "lost";

// Sport emoji map
const SPORT_ICON: Record<string, string> = {
  "Horse Racing": "🏇",
  "Football": "⚽",
  "Tennis": "🎾",
  "Basketball": "🏀",
  "Golf": "⛳",
  "Cricket": "🏏",
  "Other": "🎯",
};

// Simple SVG P&L chart
function PnlChart({ bets }: { bets: BetFull[] }) {
  const settled = [...bets]
    .filter(b => b.status === "won" || b.status === "lost")
    .sort((a, b) => a.date.localeCompare(b.date));

  if (settled.length < 2) {
    return (
      <div style={{ height: 120, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ color: "var(--text-3)", fontSize: "0.82rem" }}>
          Not enough settled bets to draw a chart yet.
        </span>
      </div>
    );
  }

  // Build cumulative series
  let cum = 0;
  const series = settled.map(b => {
    const p = b.profit ?? (b.status === "won" ? b.potential_return - b.stake : -b.stake);
    cum += p;
    return cum;
  });

  const W = 1000; // viewBox width
  const H = 120;
  const pad = 8;
  const minV = Math.min(0, ...series);
  const maxV = Math.max(0, ...series);
  const range = maxV - minV || 1;

  const toX = (i: number) => pad + (i / (series.length - 1)) * (W - pad * 2);
  const toY = (v: number) => H - pad - ((v - minV) / range) * (H - pad * 2);

  const points = series.map((v, i) => `${toX(i)},${toY(v)}`).join(" ");
  const zeroY = toY(0);
  const last = series[series.length - 1];
  const lineColor = last >= 0 ? "var(--green)" : "var(--red)";

  // Area fill
  const areaPoints = `${toX(0)},${zeroY} ${points} ${toX(series.length - 1)},${zeroY}`;

  return (
    <div className={s.chartWrap}>
      <svg className={s.chartSvg} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.18" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Zero line */}
        <line x1={pad} y1={zeroY} x2={W - pad} y2={zeroY}
          stroke="rgba(255,255,255,0.08)" strokeWidth="1" strokeDasharray="4 4" />
        {/* Area */}
        <polygon points={areaPoints} fill="url(#areaFill)" />
        {/* Line */}
        <polyline points={points} fill="none" stroke={lineColor} strokeWidth="2.5"
          strokeLinejoin="round" strokeLinecap="round" />
        {/* Last dot */}
        <circle cx={toX(series.length - 1)} cy={toY(last)} r="4"
          fill={lineColor} stroke="var(--surface)" strokeWidth="2" />
      </svg>
    </div>
  );
}

export default function Home() {
  const [bets, setBets] = useState<BetFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [sportFilter, setSportFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchBets = useCallback(async () => {
    try {
      const res = await fetch("/api/bets");
      const data = await res.json();
      if (data.bets) setBets(data.bets);
    } catch (e) {
      console.error("Failed to fetch bets:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchBets(); }, [fetchBets]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    const fd = new FormData();
    fd.append("image", file);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (data.error) alert("Upload failed: " + data.error);
      else await fetchBets();
    } catch (e) {
      console.error("Upload error:", e);
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) handleUpload(e.target.files[0]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files?.[0]) handleUpload(e.dataTransfer.files[0]);
  };

  const updateStatus = async (id: string, status: "won" | "lost") => {
    const bet = bets.find(b => b.id === id);
    if (!bet) return;
    // Optimistic
    setBets(prev => prev.map(b => b.id === id ? {
      ...b, status,
      profit: status === "won" ? b.potential_return - b.stake : -b.stake
    } : b));
    await fetch(`/api/bets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
  };

  // ── Computed values ──────────────────────────────────────────
  const settled = bets.filter(b => b.status === "won" || b.status === "lost");
  const wins = bets.filter(b => b.status === "won").length;
  const winRate = settled.length ? Math.round((wins / settled.length) * 100) : 0;

  const totalProfit = settled.reduce((acc, b) =>
    acc + (b.profit ?? (b.status === "won" ? b.potential_return - b.stake : -b.stake)), 0);

  const totalInvested = settled.reduce((acc, b) => acc + b.stake, 0);
  const roi = totalInvested > 0 ? totalProfit / totalInvested * 100 : 0;
  const pending = bets.filter(b => b.status === "pending").length;

  // ── Filters ──────────────────────────────────────────────────
  const allSports = ["All", ...Array.from(new Set(bets.map(b => b.sport || "Other")))];

  const filtered = bets.filter(b => {
    const sp = sportFilter === "All" || (b.sport || "Other") === sportFilter;
    const st = statusFilter === "all" || b.status === statusFilter;
    return sp && st;
  });

  // ── Format helpers ───────────────────────────────────────────
  const fmt = (n: number) => {
    const abs = Math.abs(n);
    return (n >= 0 ? "+" : "−") + abs.toFixed(0) + " kr";
  };

  return (
    <div
      className={s.app}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {/* ── Navbar ── */}
      <nav className={s.navbar}>
        <div className={s.navLogo}>
          <span className={s.navLogoIcon}>📊</span>
          <span className={s.navLogoText}>Bet Tracker <span>Pro</span></span>
        </div>
        <div className={s.navActions}>
          <input
            type="file"
            accept="image/*"
            hidden
            ref={fileInputRef}
            onChange={handleFileChange}
          />
          {uploading ? (
            <div className={s.uploadingSpinner}>
              <div className={s.spinner} />
              Analyzing...
            </div>
          ) : (
            <button className={s.uploadBtn} onClick={() => fileInputRef.current?.click()}>
              ↑ Upload screenshot
            </button>
          )}
        </div>
      </nav>

      <main className={s.main}>
        {/* ── Stats Strip ── */}
        <div className={s.statsStrip}>
          <div className={s.statCard}>
            <span className={s.statLabel}>Total P&amp;L</span>
            <span className={`${s.statValue} ${totalProfit >= 0 ? s.pos : s.neg}`}>
              {totalProfit >= 0 ? "+" : "−"}{Math.abs(totalProfit).toFixed(0)} kr
            </span>
            <span className={s.statSub}>{settled.length} settled</span>
          </div>
          <div className={s.statCard}>
            <span className={s.statLabel}>Win Rate</span>
            <span className={s.statValue}>{winRate}%</span>
            <span className={s.statSub}>{wins}W / {settled.length - wins}L</span>
          </div>
          <div className={s.statCard}>
            <span className={s.statLabel}>ROI</span>
            <span className={`${s.statValue} ${roi >= 0 ? s.pos : s.neg}`}>
              {roi >= 0 ? "+" : ""}{roi.toFixed(1)}%
            </span>
            <span className={s.statSub}>{totalInvested.toFixed(0)} kr staked</span>
          </div>
          <div className={s.statCard}>
            <span className={s.statLabel}>Total Bets</span>
            <span className={s.statValue}>{bets.length}</span>
            <span className={s.statSub}>all time</span>
          </div>
          <div className={s.statCard}>
            <span className={s.statLabel}>Pending</span>
            <span className={s.statValue}>{pending}</span>
            <span className={s.statSub}>awaiting result</span>
          </div>
        </div>

        {/* ── P&L Chart ── */}
        <div className={s.chartPanel}>
          <div className={s.chartHeader}>
            <span className={s.chartTitle}>Cumulative P&amp;L</span>
            <span className={s.chartLegend}>
              {settled.length} data points
            </span>
          </div>
          <PnlChart bets={bets} />
        </div>

        {/* ── Filter Bar ── */}
        <div className={s.filterRow}>
          {/* Sport filters */}
          <div className={s.filterGroup}>
            {allSports.map(sp => (
              <button
                key={sp}
                className={`${s.pill} ${sportFilter === sp ? s.pillActive : ""}`}
                onClick={() => setSportFilter(sp)}
              >
                {sp !== "All" ? (SPORT_ICON[sp] || "🎯") + " " : ""}{sp}
              </button>
            ))}
          </div>

          {allSports.length > 1 && <div className={s.filterDivider} />}

          {/* Status filters */}
          <div className={s.filterGroup}>
            {(["all", "pending", "won", "lost"] as StatusFilter[]).map(st => (
              <button
                key={st}
                className={`${s.pill} ${statusFilter === st
                  ? st === "won" ? s.pillWon : st === "lost" ? s.pillLost : s.pillActive
                  : ""}`}
                onClick={() => setStatusFilter(st)}
              >
                {st === "all" ? "All" : st.charAt(0).toUpperCase() + st.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* ── Bet Table ── */}
        <div className={s.tablePanel}>
          <div className={s.tableHeader}>
            <span className={s.tableTitle}>Bet History</span>
            <span className={s.tableCount}>{filtered.length} bets</span>
          </div>

          {/* Column headings */}
          <div className={s.colHeads}>
            <span>Event</span>
            <span>Selection</span>
            <span>Odds</span>
            <span className={s.colRight}>Stake</span>
            <span className={s.colRight}>Status</span>
            <span className={s.colRight}>Profit</span>
            <span className={s.colRight}>Action</span>
          </div>

          {loading ? (
            <div className={s.emptyState}>
              <div className={s.emptyIcon}>⏳</div>
              <p className={s.emptyText}>Loading bets...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className={s.emptyState}>
              <div className={s.emptyIcon}>🎯</div>
              <p className={s.emptyText}>
                {bets.length === 0
                  ? "No bets yet — upload a screenshot to get started."
                  : "No bets match the current filters."}
              </p>
            </div>
          ) : (
            filtered.map(bet => {
              const sels = bet.selections as unknown as BetSelection[];
              const firstSel = sels?.[0];
              const sport = bet.sport || "Other";
              const profit = bet.profit ?? (
                bet.status === "won" ? bet.potential_return - bet.stake :
                  bet.status === "lost" ? -bet.stake : 0
              );

              return (
                <div
                  key={bet.id}
                  className={`${s.betRow} ${bet.status === "won" ? s.rowWon :
                      bet.status === "lost" ? s.rowLost : s.rowPending
                    }`}
                >
                  {/* Event */}
                  <div className={s.cellEvent}>
                    <div className={s.cellEventTop}>
                      <span className={s.sportIcon}>{SPORT_ICON[sport] || "🎯"}</span>
                      <span className={s.eventName}>
                        {firstSel?.match || "—"}
                        {sels?.length > 1 ? ` +${sels.length - 1}` : ""}
                      </span>
                    </div>
                    <span className={s.eventDate}>{bet.date}</span>
                  </div>

                  {/* Selection */}
                  <div className={s.cellSel}>
                    <span className={s.selName}>{firstSel?.selection || "—"}</span>
                    {bet.market && bet.market !== "Other" && (
                      <span className={s.marketTag}>{bet.market}</span>
                    )}
                  </div>

                  {/* Odds */}
                  <span className={s.oddsTag}>{bet.odds?.toFixed(2)}</span>

                  {/* Stake */}
                  <span className={s.cellNum}>{bet.stake?.toFixed(0)} kr</span>

                  {/* Status */}
                  <div className={s.cellStatus}>
                    <span className={`${s.statusBadge} ${bet.status === "won" ? s.badgeWon :
                        bet.status === "lost" ? s.badgeLost :
                          bet.status === "void" ? s.badgeVoid : s.badgePending
                      }`}>
                      {bet.status.toUpperCase()}
                    </span>
                  </div>

                  {/* Profit */}
                  <span className={`${s.cellNum} ${bet.status === "pending" ? "" :
                      profit >= 0 ? s.profitPos : s.profitNeg
                    }`}>
                    {bet.status === "pending" ? `${bet.potential_return?.toFixed(0)} kr` : fmt(profit)}
                  </span>

                  {/* Action */}
                  <div className={s.cellActions}>
                    {bet.status === "pending" ? (
                      <>
                        <button
                          className={`${s.actionBtn} ${s.btnW}`}
                          title="Mark as won"
                          onClick={() => updateStatus(bet.id, "won")}
                        >W</button>
                        <button
                          className={`${s.actionBtn} ${s.btnL}`}
                          title="Mark as lost"
                          onClick={() => updateStatus(bet.id, "lost")}
                        >L</button>
                      </>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </main>
    </div>
  );
}
