"use client";

import { useEffect, useState, useRef } from "react";
import styles from "./page.module.css";
import type { Bet } from "@prisma/client";
import { BetSelection } from "@/lib/db";

type BetWithMeta = Bet & { sport?: string; market?: string; profit?: number };

export default function Home() {
  const [bets, setBets] = useState<BetWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [sportFilter, setSportFilter] = useState("All");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchBets = async () => {
    try {
      const res = await fetch("/api/bets");
      const data = await res.json();
      if (data.bets) setBets(data.bets);
    } catch (error) {
      console.error("Failed to fetch bets:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchBets(); }, []);

  const handleUpload = async (file: File) => {
    setUploading(true);
    const formData = new FormData();
    formData.append("image", file);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (data.error) alert("Upload failed: " + data.error);
      else await fetchBets();
    } catch (error) {
      console.error("Upload error:", error);
      alert("Something went wrong during upload.");
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files?.[0]) handleUpload(e.dataTransfer.files[0]);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) handleUpload(e.target.files[0]);
  };

  const updateBetStatus = async (id: string, status: 'won' | 'lost' | 'void') => {
    try {
      const res = await fetch(`/api/bets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) setBets(bets.map(b => b.id === id ? { ...b, status } : b));
    } catch (error) {
      console.error("Failed to update status", error);
    }
  };

  // ── Sport filter ──────────────────────────────────────────────
  const allSports = ["All", ...Array.from(new Set(bets.map(b => b.sport || "Other").filter(Boolean)))];
  const filteredBets = sportFilter === "All" ? bets : bets.filter(b => (b.sport || "Other") === sportFilter);

  // ── Stats (over ALL bets, not filtered) ──────────────────────
  const settledBets = bets.filter(b => b.status === "won" || b.status === "lost");
  const winRate = settledBets.length
    ? Math.round((bets.filter(b => b.status === "won").length / settledBets.length) * 100)
    : 0;

  const totalProfit = bets.reduce((acc, bet) => {
    if (bet.status === "won" || bet.status === "lost") {
      return acc + (bet.profit ?? (bet.status === "won" ? bet.potential_return - bet.stake : -bet.stake));
    }
    return acc;
  }, 0);

  const totalInvested = settledBets.reduce((acc, bet) => acc + bet.stake, 0);
  const yieldPct = totalInvested > 0 ? ((totalProfit / totalInvested) * 100).toFixed(1) : 0;
  const pendingCount = bets.filter(b => b.status === "pending").length;

  // ── Per-sport breakdown ───────────────────────────────────────
  const sportBreakdown = Array.from(new Set(bets.map(b => b.sport || "Other"))).map(sport => {
    const group = bets.filter(b => (b.sport || "Other") === sport);
    const settled = group.filter(b => b.status === "won" || b.status === "lost");
    const wins = group.filter(b => b.status === "won").length;
    const wr = settled.length ? Math.round((wins / settled.length) * 100) : null;
    const profit = settled.reduce((acc, b) =>
      acc + (b.profit ?? (b.status === "won" ? b.potential_return - b.stake : -b.stake)), 0);
    return { sport, bets: group.length, wr, profit, settled: settled.length };
  }).sort((a, b) => b.bets - a.bets);

  return (
    <main className={styles.container}>
      <header className={styles.header}>
        <h1 className={`${styles.title} gradient-text`}>Bet Tracker Pro</h1>
        <p className={styles.subtitle}>
          Drop a screenshot of your betslip, and our AI will automatically parse
          and track your performance. Manage your bets with effortless precision.
        </p>
      </header>

      <div className={styles.dashboard}>
        {/* Left Sidebar */}
        <section className={styles.uploadSection}>
          <div
            className={`${styles.uploadBox} glass-panel`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input type="file" accept="image/*" hidden ref={fileInputRef} onChange={handleFileChange} />
            {uploading ? (
              <div className={styles.loader}>Analyzing screenshot... ✨</div>
            ) : (
              <>
                <span className={styles.uploadIcon}>📸</span>
                <div className={styles.uploadTitle}>Upload Screenshot</div>
                <div className={styles.uploadDesc}>Drag and drop your betslip here,<br />or click to browse</div>
              </>
            )}
          </div>

          <div className={`${styles.statsGrid} glass-panel`}>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>Total Profit</div>
              <div className={`${styles.statValue} ${totalProfit >= 0 ? styles.positive : styles.negative}`}>
                {totalProfit >= 0 ? '+' : ''}{totalProfit.toFixed(2)} kr
              </div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>Win Rate</div>
              <div className={styles.statValue}>{winRate}%</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>Pending</div>
              <div className={styles.statValue}>{pendingCount}</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>Yield</div>
              <div className={`${styles.statValue} ${Number(yieldPct) >= 0 ? styles.positive : styles.negative}`}>
                {Number(yieldPct) >= 0 ? '+' : ''}{yieldPct}%
              </div>
            </div>
          </div>

          {/* Sport Performance Breakdown */}
          {sportBreakdown.length > 0 && (
            <div className={`glass-panel ${styles.breakdownPanel}`}>
              <div className={styles.breakdownTitle}>Performance by Sport</div>
              <table className={styles.breakdownTable}>
                <thead>
                  <tr>
                    <th>Sport</th>
                    <th>Bets</th>
                    <th>W%</th>
                    <th>Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {sportBreakdown.map(row => (
                    <tr key={row.sport}>
                      <td>{row.sport}</td>
                      <td>{row.bets}</td>
                      <td>{row.wr !== null ? `${row.wr}%` : '—'}</td>
                      <td className={row.profit >= 0 ? styles.breakdownPositive : styles.breakdownNegative}>
                        {row.profit >= 0 ? '+' : ''}{row.profit.toFixed(0)} kr
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Right Main — Recent Bets */}
        <section className={`${styles.betsSection} glass-panel`}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Recent Bets</h2>
          </div>

          {/* Sport filter bar */}
          {allSports.length > 1 && (
            <div className={styles.filterBar}>
              {allSports.map(sport => (
                <button
                  key={sport}
                  className={`${styles.filterBtn} ${sportFilter === sport ? styles.filterBtnActive : ''}`}
                  onClick={() => setSportFilter(sport)}
                >
                  {sport}
                </button>
              ))}
            </div>
          )}

          {loading ? (
            <div className={styles.emptyState}>Loading your bets...</div>
          ) : filteredBets.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>🎯</div>
              <p>{bets.length === 0 ? "No bets tracked yet. Upload a screenshot to get started." : "No bets match the selected filter."}</p>
            </div>
          ) : (
            <div className={styles.betsList}>
              {filteredBets.map((bet) => (
                <div key={bet.id} className={`${styles.betCard} ${styles[bet.status]}`}>
                  <div className={styles.betHeader}>
                    <div>
                      <div className={styles.betDate}>{new Date(bet.date).toLocaleDateString()}</div>
                      <div className={styles.metaBadges}>
                        {bet.sport && bet.sport !== "Other" && (
                          <span className={styles.sportBadge}>{bet.sport}</span>
                        )}
                        {bet.market && bet.market !== "Other" && (
                          <span className={styles.marketBadge}>{bet.market}</span>
                        )}
                      </div>
                    </div>
                    <div className={`${styles.badge} ${styles['badge-' + bet.status]}`}>
                      {bet.status.toUpperCase()}
                    </div>
                  </div>

                  <div className={styles.selections}>
                    {(bet.selections as unknown as BetSelection[]).map((sel: BetSelection, idx: number) => (
                      <div key={idx} className={styles.selectionItem}>
                        <div className={styles.match}>{sel.match}</div>
                        <div className={styles.pick}>
                          {sel.selection} {sel.odds ? <span className={styles.oddsBox}>@{sel.odds}</span> : null}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className={styles.betFooter}>
                    <div className={styles.betFinancials}>
                      <span>Stake: <strong>{bet.stake?.toFixed(2) || '0.00'} kr</strong></span>
                      <span className={styles.totalOdds}>Odds: <strong>{bet.odds?.toFixed(2) || '1.00'}</strong></span>
                      {(bet.status === 'won' || bet.status === 'lost') ? (
                        <span>
                          Profit: <strong className={((bet.profit ?? 0) >= 0) ? styles.positive : styles.negative}>
                            {((bet.profit ?? 0) >= 0 ? '+' : '')}{(bet.profit ?? 0).toFixed(0)} kr
                          </strong>
                        </span>
                      ) : (
                        <span>Return: <strong>{bet.potential_return?.toFixed(2) || '0.00'} kr</strong></span>
                      )}
                    </div>

                    {bet.status === "pending" && (
                      <div className={styles.actionButtons}>
                        <button onClick={() => updateBetStatus(bet.id, 'won')} className={`${styles.btn} ${styles.btnWin}`}>W</button>
                        <button onClick={() => updateBetStatus(bet.id, 'lost')} className={`${styles.btn} ${styles.btnLoss}`}>L</button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
