"use client";

import { useEffect, useState, useRef } from "react";
import styles from "./page.module.css";
import type { Bet } from "@prisma/client";
import { BetSelection } from "@/lib/db";

export default function Home() {
  const [bets, setBets] = useState<Bet[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchBets = async () => {
    try {
      const res = await fetch("/api/bets");
      const data = await res.json();
      if (data.bets) {
        setBets(data.bets);
      }
    } catch (error) {
      console.error("Failed to fetch bets:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBets();
  }, []);

  const handleUpload = async (file: File) => {
    setUploading(true);
    const formData = new FormData();
    formData.append("image", file);

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (data.error) {
        alert("Upload failed: " + data.error);
      } else {
        // Refresh bets after successful upload
        await fetchBets();
      }
    } catch (error) {
      console.error("Upload error:", error);
      alert("Something went wrong during upload.");
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleUpload(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleUpload(e.target.files[0]);
    }
  };

  const updateBetStatus = async (id: string, status: 'won' | 'lost' | 'void') => {
    try {
      const res = await fetch(`/api/bets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setBets(bets.map(b => b.id === id ? { ...b, status } : b));
      }
    } catch (error) {
      console.error("Failed to update status", error);
    }
  };

  // Calculate Stats
  const settledBets = bets.filter(b => b.status === "won" || b.status === "lost");
  const winRate = settledBets.length ? Math.round((bets.filter(b => b.status === "won").length / settledBets.length) * 100) : 0;

  const totalProfit = bets.reduce((acc, bet) => {
    if (bet.status === "won") return acc + (bet.potential_return - bet.stake);
    if (bet.status === "lost") return acc - bet.stake;
    return acc;
  }, 0);

  const totalInvested = settledBets.reduce((acc, bet) => acc + bet.stake, 0);
  const yieldPct = totalInvested > 0 ? ((totalProfit / totalInvested) * 100).toFixed(1) : 0;

  const pendingCount = bets.filter(b => b.status === "pending").length;

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
        {/* Left Sidebar - Upload & Stats */}
        <section className={styles.uploadSection}>
          <div
            className={`${styles.uploadBox} glass-panel`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              type="file"
              accept="image/*"
              hidden
              ref={fileInputRef}
              onChange={handleFileChange}
            />
            {uploading ? (
              <div className={styles.loader}>Analyzing screenshot... ✨</div>
            ) : (
              <>
                <span className={styles.uploadIcon}>📸</span>
                <div className={styles.uploadTitle}>Upload Screenshot</div>
                <div className={styles.uploadDesc}>
                  Drag and drop your betslip here,<br />or click to browse
                </div>
              </>
            )}
          </div>

          <div className={`${styles.statsGrid} glass-panel`}>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>Total Profit</div>
              <div className={`${styles.statValue} ${totalProfit >= 0 ? styles.positive : styles.negative}`}>
                {totalProfit >= 0 ? '+' : ''}${totalProfit.toFixed(2)}
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
        </section>

        {/* Right Main Area - Recent Bets */}
        <section className={`${styles.betsSection} glass-panel`}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Recent Bets</h2>
          </div>

          {loading ? (
            <div className={styles.emptyState}>Loading your bets...</div>
          ) : bets.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>🎯</div>
              <p>No bets tracked yet. Upload a screenshot to get started.</p>
            </div>
          ) : (
            <div className={styles.betsList}>
              {bets.map((bet) => (
                <div key={bet.id} className={`${styles.betCard} ${styles[bet.status]}`}>
                  <div className={styles.betHeader}>
                    <div className={styles.betDate}>{new Date(bet.date).toLocaleDateString()}</div>
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
                      <span>Stake: <strong>${bet.stake?.toFixed(2) || '0.00'}</strong></span>
                      <span className={styles.totalOdds}>Total Odds: <strong>{bet.odds?.toFixed(2) || '1.00'}</strong></span>
                      <span>Return: <strong>${bet.potential_return?.toFixed(2) || '0.00'}</strong></span>
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
