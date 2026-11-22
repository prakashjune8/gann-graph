import React, { useState, useMemo } from "react";
import { useGridState } from "../../store/useGridState";
import {
  runSutraScaleVerification,
  CandidateSweepResult,
} from "./SutraScaleEngine";

interface SutraScaleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSeedModal?: () => void;
}

/**
 * W.D. Gann SutraScale Vibration Verification Modal
 * Module: src/modules/sutrascale-vibration/SutraScaleModal.tsx
 *
 * Provides institutional vibration verification over Indian market instruments:
 * - Sweeps candidate harmonic scales (e.g. 20, 25, 33.33, 37.5, 50, 100).
 * - Tests 0.5% wick collisions and fatal breaches forward from manual seed.
 * - Computes Geometric R-Squared and touch density scoring.
 * - Allows locking the true vibration scale into the active drafting desk with 1-click.
 */
export const SutraScaleModal: React.FC<SutraScaleModalProps> = ({
  isOpen,
  onClose,
  onOpenSeedModal,
}) => {
  const candles = useGridState((s) => s.candles);
  const lowestSeed = useGridState((s) => s.lowestSeed);
  const highestSeed = useGridState((s) => s.highestSeed);
  const setCustomScale = useGridState((s) => s.setCustomScale);
  const setVibrationRay = useGridState((s) => s.setVibrationRay);
  const setVaultSyncBadge = useGridState((s) => s.setVaultSyncBadge);

  const [activeTab, setActiveTab] = useState<"SWEEP" | "OCTAVES">("SWEEP");
  const [selectedAnchor, setSelectedAnchor] = useState<"AUTO" | "LOWEST" | "HIGHEST">("AUTO");

  // Run verification whenever candles or seeds change
  const report = useMemo(() => {
    return runSutraScaleVerification(candles, lowestSeed, highestSeed, 60, selectedAnchor);
  }, [candles, lowestSeed, highestSeed, selectedAnchor]);

  if (!isOpen) return null;

  const handleLockScale = (candidate: CandidateSweepResult) => {
    const activeSeed = report.anchorSeed;
    if (!activeSeed) return;

    // 1. Lock the custom scale in Zustand store (disables auto-scale overwrites)
    setCustomScale(candidate.scale);

    // 2. Wire the verified 1x1 vibration ray starting strictly from manual seed
    setVibrationRay({
      originCol: activeSeed.gridCol,
      originPrice: activeSeed.price,
      originDate: activeSeed.date,
      scale: candidate.scale,
      type: report.anchorType === "BULL_LOW" ? "BULL" : "BEAR",
      active: true,
      touchCount: candidate.touchCount,
      breachCount: candidate.breachCount,
      score: candidate.geometricRSquared,
      touches: candidate.touches.map((t) => ({ col: t.col, price: t.price, date: t.date })),
      breaches: candidate.breaches.map((b) => ({ col: b.col, price: b.close, date: b.date })),
    });

    // 3. Show confirmation badge
    setVaultSyncBadge({
      visible: true,
      text: `⚡ SutraScale Locked: ₹${candidate.scale}/sq (${candidate.touchCount} touches, R²: ${candidate.geometricRSquared}%)`,
      timestamp: Date.now(),
    });

    onClose();
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        backgroundColor: "rgba(0, 0, 0, 0.45)",
        backdropFilter: "blur(3px)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 2000,
        fontFamily: "'Courier New', Courier, monospace",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: "740px",
          maxHeight: "85vh",
          backgroundColor: "#FAF9F5",
          border: "2px solid #2E7D32",
          borderRadius: "8px",
          boxShadow: "0 12px 32px rgba(0, 0, 0, 0.28)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          color: "#1E2A24",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "12px 18px",
            backgroundColor: "#E8F5E9",
            borderBottom: "1.5px solid #2E7D32",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "16px" }}>⚡</span>
            <div>
              <strong style={{ fontSize: "13px", color: "#1B5E20", letterSpacing: "0.5px" }}>
                SUTRA-SCALE VIBRATION VERIFIER
              </strong>
              <div style={{ fontSize: "10px", color: "#4A7866" }}>
                Algorithmic 1x1 Ray Math • 0.5% Wick Collision Test • Geometric R² Sweep
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              fontSize: "16px",
              cursor: "pointer",
              color: "#555",
              fontWeight: "bold",
            }}
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: "16px", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: "12px" }}>
          {/* Anchor Status Card */}
          <div
            style={{
              padding: "10px 14px",
              backgroundColor: report.hasAnchor ? "#F1F8E9" : "#FFF3E0",
              border: `1px solid ${report.hasAnchor ? "#81C784" : "#FFB74D"}`,
              borderRadius: "6px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontSize: "11px", fontWeight: "bold", color: report.hasAnchor ? "#2E7D32" : "#E65100" }}>
                {report.hasAnchor
                  ? `ANCHOR: ${report.anchorType === "BULL_LOW" ? "🌱 SEED LOW (BULL RAY)" : "🍁 SEED HIGH (BEAR RAY)"}`
                  : "⚠️ NO MANUAL SEED ACTIVE"}
              </div>
              <div style={{ fontSize: "10px", color: "#555", marginTop: "2px" }}>
                {report.hasAnchor && report.anchorSeed ? (
                  <>
                    Price: <strong>₹{report.anchorSeed.price.toLocaleString("en-IN")}</strong> | Col:{" "}
                    <strong>{report.anchorSeed.gridCol}</strong> | Date:{" "}
                    <strong>{report.anchorSeed.date || "N/A"}</strong> | Speed:{" "}
                    <strong>{report.initialSpeedSummary}</strong>
                  </>
                ) : (
                  "Zero auto-seed override: SutraScale requires an explicit manual seed point to anchor ray math."
                )}
              </div>
            </div>

            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              {lowestSeed && highestSeed && (
                <div style={{ display: "flex", gap: "4px" }}>
                  <button
                    onClick={() => setSelectedAnchor("LOWEST")}
                    style={{
                      padding: "4px 8px",
                      backgroundColor: report.anchorType === "BULL_LOW" ? "#2E7D32" : "#FFF",
                      color: report.anchorType === "BULL_LOW" ? "#FFF" : "#2E7D32",
                      border: "1px solid #2E7D32",
                      borderRadius: "4px",
                      fontSize: "9px",
                      fontWeight: "bold",
                      cursor: "pointer",
                    }}
                  >
                    🌱 Lowest (Bull)
                  </button>
                  <button
                    onClick={() => setSelectedAnchor("HIGHEST")}
                    style={{
                      padding: "4px 8px",
                      backgroundColor: report.anchorType === "BEAR_HIGH" ? "#C62828" : "#FFF",
                      color: report.anchorType === "BEAR_HIGH" ? "#FFF" : "#C62828",
                      border: "1px solid #C62828",
                      borderRadius: "4px",
                      fontSize: "9px",
                      fontWeight: "bold",
                      cursor: "pointer",
                    }}
                  >
                    🍁 Highest (Bear)
                  </button>
                </div>
              )}

              {!report.hasAnchor && onOpenSeedModal && (
                <button
                  onClick={() => {
                    onClose();
                    onOpenSeedModal();
                  }}
                  style={{
                    padding: "5px 12px",
                    backgroundColor: "#2E7D32",
                    color: "#FFF",
                    border: "none",
                    borderRadius: "4px",
                    fontSize: "10px",
                    fontWeight: "bold",
                    cursor: "pointer",
                  }}
                >
                  Set Manual Seed
                </button>
              )}
            </div>
          </div>

          {report.hasAnchor && (
            <>
              {/* Tab Navigation */}
              <div style={{ display: "flex", gap: "6px", borderBottom: "1px solid rgba(74, 120, 102, 0.25)", paddingBottom: "4px" }}>
                <button
                  onClick={() => setActiveTab("SWEEP")}
                  style={{
                    padding: "4px 12px",
                    backgroundColor: activeTab === "SWEEP" ? "#2E7D32" : "transparent",
                    color: activeTab === "SWEEP" ? "#FFF" : "#333",
                    border: "none",
                    borderRadius: "4px",
                    fontSize: "10px",
                    fontWeight: "bold",
                    cursor: "pointer",
                  }}
                >
                  Harmonic Scale Sweep ({report.candidates.length} Tested)
                </button>
                <button
                  onClick={() => setActiveTab("OCTAVES")}
                  style={{
                    padding: "4px 12px",
                    backgroundColor: activeTab === "OCTAVES" ? "#2E7D32" : "transparent",
                    color: activeTab === "OCTAVES" ? "#FFF" : "#333",
                    border: "none",
                    borderRadius: "4px",
                    fontSize: "10px",
                    fontWeight: "bold",
                    cursor: "pointer",
                  }}
                >
                  Rule of 8 Subdivisions (1/8..8/8)
                </button>
              </div>

              {/* Tab 1: Harmonic Sweep Table */}
              {activeTab === "SWEEP" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <div style={{ fontSize: "10px", color: "#555" }}>
                    Showing candidate vibration scales evaluated against <strong>{report.evaluatedBarCount} forward bars</strong>.
                    Touches are counted when wicks reach within <strong>±0.5% tolerance</strong> of the 1x1 ray. Fatal breaches flag decisive closes through the ray.
                  </div>

                  <div style={{ maxHeight: "320px", overflowY: "auto", border: "1px solid #CCC", borderRadius: "4px" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px", textAlign: "left" }}>
                      <thead>
                        <tr style={{ backgroundColor: "#ECEFF1", borderBottom: "1.5px solid #CFD8DC", position: "sticky", top: 0 }}>
                          <th style={{ padding: "6px 8px" }}>Scale (₹/sq)</th>
                          <th style={{ padding: "6px 8px" }}>Wick Touches (±0.5%)</th>
                          <th style={{ padding: "6px 8px" }}>Breaches</th>
                          <th style={{ padding: "6px 8px" }}>Touch Density</th>
                          <th style={{ padding: "6px 8px" }}>Geometric R²</th>
                          <th style={{ padding: "6px 8px" }}>Status</th>
                          <th style={{ padding: "6px 8px", textAlign: "center" }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.candidates.slice(0, 15).map((cand, idx) => {
                          const isTop = idx === 0 && !cand.isBreached;
                          let statusColor = "#388E3C";
                          let statusLabel = "PERFECT FIT";
                          if (cand.status === "FATAL_BREACH") {
                            statusColor = "#D32F2F";
                            statusLabel = cand.firstBreachDate ? `BREACH (${cand.firstBreachDate})` : "BREACHED";
                          } else if (cand.status === "STRONG_VIBRATION") {
                            statusColor = "#1976D2";
                            statusLabel = "STRONG";
                          } else if (cand.status === "MODERATE") {
                            statusColor = "#F57C00";
                            statusLabel = "MODERATE";
                          }

                          return (
                            <tr
                              key={cand.scale}
                              style={{
                                borderBottom: "1px solid #EEE",
                                backgroundColor: isTop ? "#E8F5E9" : idx % 2 === 0 ? "#FFF" : "#FBFBF9",
                              }}
                            >
                              <td style={{ padding: "6px 8px", fontWeight: "bold", color: "#1B5E20" }}>
                                ₹{cand.scale.toFixed(2)}
                                {isTop && <span style={{ marginLeft: "4px", fontSize: "9px", color: "#2E7D32" }}>★ BEST</span>}
                              </td>
                              <td style={{ padding: "6px 8px" }}>
                                <strong style={{ color: cand.touchCount > 0 ? "#2E7D32" : "#999" }}>
                                  {cand.touchCount}
                                </strong>{" "}
                                touches
                              </td>
                              <td style={{ padding: "6px 8px", color: cand.breachCount > 0 ? "#C62828" : "#2E7D32" }}>
                                {cand.breachCount === 0 ? "0 (Unbroken)" : `${cand.breachCount} breach(es)`}
                              </td>
                              <td style={{ padding: "6px 8px" }}>{cand.touchDensity}%</td>
                              <td style={{ padding: "6px 8px", fontWeight: "bold" }}>
                                <span style={{ color: cand.geometricRSquared >= 70 ? "#2E7D32" : cand.geometricRSquared >= 40 ? "#E65100" : "#777" }}>
                                  {cand.geometricRSquared}%
                                </span>
                              </td>
                              <td style={{ padding: "6px 8px", color: statusColor, fontWeight: "bold", fontSize: "9px" }}>
                                {statusLabel}
                              </td>
                              <td style={{ padding: "6px 8px", textAlign: "center" }}>
                                <button
                                  onClick={() => handleLockScale(cand)}
                                  style={{
                                    padding: "3px 8px",
                                    backgroundColor: isTop ? "#2E7D32" : "#FFF",
                                    color: isTop ? "#FFF" : "#1B5E20",
                                    border: `1px solid ${isTop ? "#1B5E20" : "#2E7D32"}`,
                                    borderRadius: "3px",
                                    fontSize: "9px",
                                    fontWeight: "bold",
                                    cursor: "pointer",
                                  }}
                                  title={`Lock ₹${cand.scale}/sq into the drafting desk`}
                                >
                                  🔒 Lock Scale
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Tab 2: Rule of 8 Octaves Table */}
              {activeTab === "OCTAVES" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <div style={{ fontSize: "10px", color: "#555" }}>
                    Canonical W.D. Gann 1/8th octave ray subdivisions and multiples based on recommended master scale{" "}
                    <strong>₹{report.recommendedCandidate ? report.recommendedCandidate.scale : 25}/sq</strong>:
                  </div>

                  <div style={{ border: "1px solid #CCC", borderRadius: "4px", overflow: "hidden" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px" }}>
                      <thead>
                        <tr style={{ backgroundColor: "#ECEFF1", borderBottom: "1.5px solid #CFD8DC" }}>
                          <th style={{ padding: "6px 8px", textAlign: "left" }}>Harmonic Tier</th>
                          <th style={{ padding: "6px 8px", textAlign: "left" }}>Octave Fraction</th>
                          <th style={{ padding: "6px 8px", textAlign: "right" }}>Calculated Scale (₹ / square)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.octaveLevels.map((lvl, idx) => (
                          <tr key={lvl.name} style={{ borderBottom: "1px solid #EEE", backgroundColor: idx % 2 === 0 ? "#FFF" : "#FBFBF9" }}>
                            <td style={{ padding: "6px 8px", fontWeight: lvl.factor === 1.0 ? "bold" : "normal" }}>
                              {lvl.name}
                            </td>
                            <td style={{ padding: "6px 8px" }}>{(lvl.factor * 100).toFixed(1)}% of 1x1</td>
                            <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: "bold", color: "#1B5E20" }}>
                              ₹{lvl.priceScale.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "10px 18px",
            backgroundColor: "#F1F8E9",
            borderTop: "1px solid rgba(74, 120, 102, 0.3)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ fontSize: "10px", color: "#2E7D32", fontWeight: "bold" }}>
            {report.recommendedCandidate ? (
              <>★ Recommended: ₹{report.recommendedCandidate.scale}/sq ({report.recommendedCandidate.geometricRSquared}% Geometric R²)</>
            ) : (
              "SutraScale Institutional Engine Active"
            )}
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            {report.recommendedCandidate && (
              <button
                onClick={() => handleLockScale(report.recommendedCandidate!)}
                style={{
                  padding: "5px 14px",
                  backgroundColor: "#2E7D32",
                  color: "#FFF",
                  border: "none",
                  borderRadius: "4px",
                  fontSize: "10px",
                  fontWeight: "bold",
                  cursor: "pointer",
                }}
              >
                🔒 Lock Recommended (₹{report.recommendedCandidate.scale}/sq)
              </button>
            )}
            <button
              onClick={onClose}
              style={{
                padding: "5px 12px",
                backgroundColor: "#FFF",
                border: "1px solid #CCC",
                borderRadius: "4px",
                fontSize: "10px",
                cursor: "pointer",
              }}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
