"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import s from "./page.module.css";
import type { Bet } from "@prisma/client";
import { BetSelection } from "@/lib/db";

type BetFull = Bet & { sport?: string; market?: string; profit?: number };
type StatusFilter = "all" | "pending" | "won" | "lost";

const SPORT_ICON: Record<string, string> = {
  "Horse Racing": "🏇", "Football": "⚽", "Tennis": "🎾",
  "Basketball": "🏀", "Golf": "⛳", "Cricket": "🏏", "Other": "🎯",
};

const SPORTS = ["Horse Racing", "Football", "Tennis", "Basketball", "Golf", "Cricket", "Other"];
const MARKETS = ["Win", "Each Way", "Place", "Match Winner", "Over/Under", "Handicap",
  "Both Teams to Score", "Correct Score", "Outright", "Other"];

// ── P&L Chart ─────────────────────────────────────────────────────
function PnlChart({ bets }: { bets: BetFull[] }) {
  const settled = [...bets]
    .filter(b => b.status === "won" || b.status === "lost")
    .sort((a, b) => a.date.localeCompare(b.date));

  if (settled.length < 2) return (
    <div style={{ height: 120, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ color: "var(--text-3)", fontSize: "0.82rem" }}>
        Not enough settled bets to draw a chart yet.
      </span>
    </div>
  );

  let cum = 0;
  const series = settled.map(b => {
    const p = b.profit ?? (b.status === "won" ? b.potential_return - b.stake : -b.stake);
    cum += p;
    return cum;
  });

  const W = 1000; const H = 120; const pad = 8;
  const minV = Math.min(0, ...series);
  const maxV = Math.max(0, ...series);
  const range = maxV - minV || 1;
  const toX = (i: number) => pad + (i / (series.length - 1)) * (W - pad * 2);
  const toY = (v: number) => H - pad - ((v - minV) / range) * (H - pad * 2);
  const points = series.map((v, i) => `${toX(i)},${toY(v)}`).join(" ");
  const zeroY = toY(0);
  const last = series[series.length - 1];
  const lineColor = last >= 0 ? "var(--green)" : "var(--red)";

  return (
    <div className={s.chartWrap}>
      <svg className={s.chartSvg} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.18" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1={pad} y1={zeroY} x2={W - pad} y2={zeroY}
          stroke="rgba(255,255,255,0.08)" strokeWidth="1" strokeDasharray="4 4" />
        <polygon points={`${toX(0)},${zeroY} ${points} ${toX(series.length - 1)},${zeroY}`}
          fill="url(#areaFill)" />
        <polyline points={points} fill="none" stroke={lineColor} strokeWidth="2.5"
          strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={toX(series.length - 1)} cy={toY(last)} r="4"
          fill={lineColor} stroke="var(--surface)" strokeWidth="2" />
      </svg>
    </div>
  );
}

// ── Edit Modal ─────────────────────────────────────────────────────
type EditForm = {
  date: string; odds: string; stake: string;
  potential_return: string; profit: string;
  status: string; sport: string; market: string;
  selections: Array<{ match: string; selection: string; odds: string }>;
};

function EditModal({ bet, onClose, onSaved }: {
  bet: BetFull;
  onClose: () => void;
  onSaved: (updated: BetFull) => void;
}) {
  const rawSels = bet.selections as unknown as BetSelection[];
  const [form, setForm] = useState<EditForm>({
    date: bet.date,
    odds: String(bet.odds),
    stake: String(bet.stake),
    potential_return: String(bet.potential_return),
    profit: String(bet.profit ?? 0),
    status: bet.status,
    sport: bet.sport || "Other",
    market: bet.market || "Other",
    selections: (rawSels || []).map(s => ({
      match: s.match, selection: s.selection, odds: String(s.odds ?? "")
    })),
  });
  const [saving, setSaving] = useState(false);

  const setField = (k: keyof EditForm, v: any) => setForm(f => ({ ...f, [k]: v }));

  const setSel = (idx: number, k: "match" | "selection" | "odds", v: string) =>
    setForm(f => {
      const sels = [...f.selections];
      sels[idx] = { ...sels[idx], [k]: v };
      return { ...f, selections: sels };
    });

  const addSel = () => setForm(f => ({ ...f, selections: [...f.selections, { match: "", selection: "", odds: "" }] }));
  const removeSel = (i: number) => setForm(f => ({ ...f, selections: f.selections.filter((_, idx) => idx !== i) }));

  const save = async () => {
    setSaving(true);
    const res = await fetch(`/api/bets/${bet.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: form.date,
        odds: Number(form.odds),
        stake: Number(form.stake),
        potential_return: Number(form.potential_return),
        profit: Number(form.profit),
        status: form.status,
        sport: form.sport,
        market: form.market,
        selections: form.selections.map(s => ({ ...s, odds: Number(s.odds) || 0 })),
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (data.bet) onSaved(data.bet as BetFull);
  };

  return (
    <div className={s.modalOverlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={s.modal}>
        <div className={s.modalHead}>
          <span className={s.modalTitle}>Rediger bet</span>
          <button className={s.modalClose} onClick={onClose}>✕</button>
        </div>

        <div className={s.modalBody}>
          <div className={s.formGrid}>
            <div className={s.formGroup}>
              <label className={s.formLabel}>Dato</label>
              <input className={s.formInput} type="date" value={form.date}
                onChange={e => setField("date", e.target.value)} />
            </div>
            <div className={s.formGroup}>
              <label className={s.formLabel}>Status</label>
              <select className={s.formSelect} value={form.status}
                onChange={e => setField("status", e.target.value)}>
                <option value="pending">Pending</option>
                <option value="won">Won</option>
                <option value="lost">Lost</option>
                <option value="void">Void</option>
              </select>
            </div>
            <div className={s.formGroup}>
              <label className={s.formLabel}>Sport</label>
              <select className={s.formSelect} value={form.sport}
                onChange={e => setField("sport", e.target.value)}>
                {SPORTS.map(sp => <option key={sp}>{sp}</option>)}
              </select>
            </div>
            <div className={s.formGroup}>
              <label className={s.formLabel}>Marked</label>
              <select className={s.formSelect} value={form.market}
                onChange={e => setField("market", e.target.value)}>
                {MARKETS.map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div className={s.formGroup}>
              <label className={s.formLabel}>Odds</label>
              <input className={s.formInput} type="number" step="0.01" value={form.odds}
                onChange={e => setField("odds", e.target.value)} />
            </div>
            <div className={s.formGroup}>
              <label className={s.formLabel}>Stake (kr)</label>
              <input className={s.formInput} type="number" step="1" value={form.stake}
                onChange={e => setField("stake", e.target.value)} />
            </div>
            <div className={s.formGroup}>
              <label className={s.formLabel}>Mulig gevinst (kr)</label>
              <input className={s.formInput} type="number" step="1" value={form.potential_return}
                onChange={e => setField("potential_return", e.target.value)} />
            </div>
            <div className={s.formGroup}>
              <label className={s.formLabel}>Profit (kr)</label>
              <input className={s.formInput} type="number" step="0.01" value={form.profit}
                onChange={e => setField("profit", e.target.value)} />
            </div>
          </div>

          {/* Selections */}
          <div className={s.formGroup}>
            <label className={s.formLabel}>Valg</label>
            <div className={s.selEditor}>
              {form.selections.map((sel, i) => (
                <div key={i} className={s.selRow}>
                  <input className={s.formInput} placeholder="Event (kamp/løb)" value={sel.match}
                    onChange={e => setSel(i, "match", e.target.value)} />
                  <input className={s.formInput} placeholder="Selektion" value={sel.selection}
                    onChange={e => setSel(i, "selection", e.target.value)} />
                  <input className={s.formInput} placeholder="Odds" type="number" step="0.01"
                    value={sel.odds} onChange={e => setSel(i, "odds", e.target.value)} />
                  <button className={s.selRemoveBtn} onClick={() => removeSel(i)}>−</button>
                </div>
              ))}
              <button className={s.addSelBtn} onClick={addSel}>+ Tilføj selektion</button>
            </div>
          </div>
        </div>

        <div className={s.modalActions}>
          <button className={s.btnCancel} onClick={onClose}>Annuller</button>
          <button className={s.btnSave} onClick={save} disabled={saving}>
            {saving ? "Gemmer..." : "Gem ændringer"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────
export default function Home() {
  const [bets, setBets] = useState<BetFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [sportFilter, setSportFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [editingBet, setEditingBet] = useState<BetFull | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchBets = useCallback(async () => {
    try {
      const res = await fetch("/api/bets");
      const data = await res.json();
      if (data.bets) setBets(data.bets);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchBets(); }, [fetchBets]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    const fd = new FormData(); fd.append("image", file);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (data.error) alert("Upload failed: " + data.error);
      else await fetchBets();
    } finally { setUploading(false); }
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

  const deleteBet = async (id: string) => {
    if (!confirm("Slet dette bet?")) return;
    setBets(prev => prev.filter(b => b.id !== id));
    await fetch(`/api/bets/${id}`, { method: "DELETE" });
  };

  const handleSaved = (updated: BetFull) => {
    setBets(prev => prev.map(b => b.id === updated.id ? updated : b));
    setEditingBet(null);
  };

  // ── Computed ────────────────────────────────────────────────────
  const settled = bets.filter(b => b.status === "won" || b.status === "lost");
  const wins = bets.filter(b => b.status === "won").length;
  const winRate = settled.length ? Math.round((wins / settled.length) * 100) : 0;
  const totalProfit = settled.reduce((acc, b) =>
    acc + (b.profit ?? (b.status === "won" ? b.potential_return - b.stake : -b.stake)), 0);
  const totalInvested = settled.reduce((acc, b) => acc + b.stake, 0);
  const roi = totalInvested > 0 ? totalProfit / totalInvested * 100 : 0;
  const pending = bets.filter(b => b.status === "pending").length;

  const allSports = ["All", ...Array.from(new Set(bets.map(b => b.sport || "Other")))];
  const filtered = bets.filter(b => {
    const sp = sportFilter === "All" || (b.sport || "Other") === sportFilter;
    const st = statusFilter === "all" || b.status === statusFilter;
    return sp && st;
  });

  const fmt = (n: number) => (n >= 0 ? "+" : "−") + Math.abs(n).toFixed(0) + " kr";

  return (
    <div className={s.app} onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
      {/* Edit Modal */}
      {editingBet && (
        <EditModal
          bet={editingBet}
          onClose={() => setEditingBet(null)}
          onSaved={handleSaved}
        />
      )}

      {/* Navbar */}
      <nav className={s.navbar}>
        <div className={s.navLogo}>
          <span className={s.navLogoIcon}>📊</span>
          <span className={s.navLogoText}>Bet Tracker <span>Pro</span></span>
        </div>
        <div className={s.navActions}>
          <input type="file" accept="image/*" hidden ref={fileInputRef} onChange={handleFileChange} />
          {uploading ? (
            <div className={s.uploadingSpinner}><div className={s.spinner} /> Analyzing...</div>
          ) : (
            <button className={s.uploadBtn} onClick={() => fileInputRef.current?.click()}>
              ↑ Upload screenshot
            </button>
          )}
        </div>
      </nav>

      <main className={s.main}>
        {/* Stats Strip */}
        <div className={s.statsStrip}>
          {[
            { label: "Total P&L", value: `${totalProfit >= 0 ? "+" : "−"}${Math.abs(totalProfit).toFixed(0)} kr`, sub: `${settled.length} settled`, cls: totalProfit >= 0 ? s.pos : s.neg },
            { label: "Win Rate", value: `${winRate}%`, sub: `${wins}W / ${settled.length - wins}L` },
            { label: "ROI", value: `${roi >= 0 ? "+" : ""}${roi.toFixed(1)}%`, sub: `${totalInvested.toFixed(0)} kr staked`, cls: roi >= 0 ? s.pos : s.neg },
            { label: "Total Bets", value: String(bets.length), sub: "all time" },
            { label: "Pending", value: String(pending), sub: "awaiting result" },
          ].map(({ label, value, sub, cls }) => (
            <div key={label} className={s.statCard}>
              <span className={s.statLabel}>{label}</span>
              <span className={`${s.statValue} ${cls || ""}`}>{value}</span>
              <span className={s.statSub}>{sub}</span>
            </div>
          ))}
        </div>

        {/* P&L Chart */}
        <div className={s.chartPanel}>
          <div className={s.chartHeader}>
            <span className={s.chartTitle}>Cumulative P&L</span>
            <span className={s.chartLegend}>{settled.length} data points</span>
          </div>
          <PnlChart bets={bets} />
        </div>

        {/* Filters */}
        <div className={s.filterRow}>
          <div className={s.filterGroup}>
            {allSports.map(sp => (
              <button key={sp}
                className={`${s.pill} ${sportFilter === sp ? s.pillActive : ""}`}
                onClick={() => setSportFilter(sp)}>
                {sp !== "All" ? (SPORT_ICON[sp] || "🎯") + " " : ""}{sp}
              </button>
            ))}
          </div>
          {allSports.length > 1 && <div className={s.filterDivider} />}
          <div className={s.filterGroup}>
            {(["all", "pending", "won", "lost"] as StatusFilter[]).map(st => (
              <button key={st}
                className={`${s.pill} ${statusFilter === st
                  ? st === "won" ? s.pillWon : st === "lost" ? s.pillLost : s.pillActive : ""}`}
                onClick={() => setStatusFilter(st)}>
                {st === "all" ? "All" : st.charAt(0).toUpperCase() + st.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Bet Table */}
        <div className={s.tablePanel}>
          <div className={s.tableHeader}>
            <span className={s.tableTitle}>Bet History</span>
            <span className={s.tableCount}>{filtered.length} bets</span>
          </div>

          <div className={s.colHeads}>
            <span>Event</span>
            <span>Selection</span>
            <span>Odds</span>
            <span className={s.colRight}>Stake</span>
            <span className={s.colRight}>Status</span>
            <span className={s.colRight}>P&amp;L</span>
            <span className={s.colRight}>Actions</span>
          </div>

          {loading ? (
            <div className={s.emptyState}><div className={s.emptyIcon}>⏳</div><p className={s.emptyText}>Loading...</p></div>
          ) : filtered.length === 0 ? (
            <div className={s.emptyState}>
              <div className={s.emptyIcon}>🎯</div>
              <p className={s.emptyText}>
                {bets.length === 0 ? "No bets yet — upload a screenshot to get started." : "No bets match the current filters."}
              </p>
            </div>
          ) : filtered.map(bet => {
            const sels = bet.selections as unknown as BetSelection[];
            const first = sels?.[0];
            const sport = bet.sport || "Other";
            const profit = bet.profit ?? (
              bet.status === "won" ? bet.potential_return - bet.stake :
                bet.status === "lost" ? -bet.stake : 0
            );

            return (
              <div key={bet.id}
                className={`${s.betRow} ${bet.status === "won" ? s.rowWon : bet.status === "lost" ? s.rowLost : s.rowPending}`}>

                {/* Event */}
                <div className={s.cellEvent}>
                  <div className={s.cellEventTop}>
                    <span className={s.sportIcon}>{SPORT_ICON[sport] || "🎯"}</span>
                    <span className={s.eventName}>
                      {first?.match || "—"}{sels?.length > 1 ? ` +${sels.length - 1}` : ""}
                    </span>
                  </div>
                  <span className={s.eventDate}>{bet.date}</span>
                </div>

                {/* Selection */}
                <div className={s.cellSel}>
                  <span className={s.selName}>{first?.selection || "—"}</span>
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
                        bet.status === "void" ? s.badgeVoid : s.badgePending}`}>
                    {bet.status.toUpperCase()}
                  </span>
                </div>

                {/* Profit */}
                <span className={`${s.cellNum} ${bet.status === "pending" ? "" : profit >= 0 ? s.profitPos : s.profitNeg}`}>
                  {bet.status === "pending" ? `${bet.potential_return?.toFixed(0)} kr` : fmt(profit)}
                </span>

                {/* Actions */}
                <div className={s.cellActions}>
                  {bet.status === "pending" && <>
                    <button className={`${s.actionBtn} ${s.btnW}`} title="Mark won" onClick={() => updateStatus(bet.id, "won")}>W</button>
                    <button className={`${s.actionBtn} ${s.btnL}`} title="Mark lost" onClick={() => updateStatus(bet.id, "lost")}>L</button>
                  </>}
                  <button className={`${s.iconBtn} ${s.iconBtnEdit}`} title="Rediger" onClick={() => setEditingBet(bet)}>✏</button>
                  <button className={`${s.iconBtn} ${s.iconBtnDel}`} title="Slet" onClick={() => deleteBet(bet.id)}>🗑</button>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
