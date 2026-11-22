import React from "react";
import { useGridState } from "../store/useGridState";

/**
 * W.D. Gann Digital Drafting Desk — Live 1/8-Inch Square Base-Unit (x, y) Corner Readout
 * Module: src/components/BaseUnitCornerReadout.tsx
 *
 * Renders a clean, compact engineering legend card in the top-right corner of the canvas:
 * 1. Shows a miniature 1/8-inch base grid square diagram.
 * 2. Displays live active horizontal time value per 1/8-inch square (x = 1 bar / active timeframe).
 * 3. Displays live active vertical price value per 1/8-inch square (y = exact pricePerUnit in ₹ / points).
 * 4. Displays real-time scale lock mode (Auto-Fit, Custom Locked, or SutraScale Vibration Locked).
 * Updates instantaneously without obstructing market candles, Gann rays, or manual seeds.
 */
export const BaseUnitCornerReadout: React.FC = () => {
  const pricePerUnit = useGridState((s) => s.pricePerUnit);
  const timePerUnit = useGridState((s) => s.timePerUnit);
  const showTopAxis = useGridState((s) => s.showTopAxis);
  const showRightAxis = useGridState((s) => s.showRightAxis);
  const scaleLockMode = useGridState((s) => s.scaleLockMode);
  const autoFitY = useGridState((s) => s.autoFitY);

  const formattedPrice = Number.isFinite(pricePerUnit) ? pricePerUnit.toFixed(2) : "25.00";
  const cleanTime = timePerUnit || "1D";

  // Mode badge styling
  let badgeText = "✓ Dynamic Auto-Fit";
  let badgeBg = "#E8F5E9";
  let badgeColor = "#1B5E20";
  let badgeBorder = "#2E7D32";

  if (scaleLockMode === "VIBRATION_LOCKED") {
    badgeText = "⚡ SutraScale Locked";
    badgeBg = "#E0F2F1";
    badgeColor = "#004D40";
    badgeBorder = "#00796B";
  } else if (scaleLockMode === "CUSTOM" || !autoFitY) {
    badgeText = "🔒 Custom Locked";
    badgeBg = "#FFF8E1";
    badgeColor = "#B78103";
    badgeBorder = "#FFA000";
  }

  return (
    <div
      style={{
        position: "absolute",
        top: showTopAxis ? 50 : 20,
        right: showRightAxis ? 96 : 18,
        transition: "top 0.2s ease, right 0.2s ease",
        backgroundColor: "rgba(247, 246, 240, 0.94)",
        backdropFilter: "blur(4px)",
        border: "1.5px solid rgba(74, 120, 102, 0.50)",
        borderRadius: "6px",
        padding: "8px 12px",
        boxShadow: "0 3px 10px rgba(0, 0, 0, 0.09)",
        fontFamily: "'Courier New', Courier, monospace",
        color: "#1E2A24",
        zIndex: 35,
        display: "flex",
        alignItems: "center",
        gap: "10px",
        userSelect: "none",
        pointerEvents: "auto",
      }}
      title="Live K&E 1/8-Inch Base-Unit Readout: 1 Minor Square = [x: 1 Bar, y: ₹/sq]"
    >
      {/* Miniature 1/8-Inch Drafting Square Representation */}
      <div
        style={{
          width: "28px",
          height: "28px",
          backgroundColor: "#FAF9F5",
          border: "1.5px solid #2E7D32",
          boxShadow: "inset 0 0 0 1px rgba(74, 120, 102, 0.2)",
          position: "relative",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          flexShrink: 0,
        }}
        title="1/8-Inch Physical Square on K&E Paper (12px = 1 Minor Grid Square)"
      >
        {/* Subtle internal crosshair lines simulating K&E paper */}
        <div
          style={{
            position: "absolute",
            width: "100%",
            height: "1px",
            backgroundColor: "rgba(46, 125, 50, 0.25)",
            top: "50%",
            left: 0,
          }}
        />
        <div
          style={{
            position: "absolute",
            height: "100%",
            width: "1px",
            backgroundColor: "rgba(46, 125, 50, 0.25)",
            left: "50%",
            top: 0,
          }}
        />
        <span
          style={{
            fontSize: "8px",
            fontWeight: "bold",
            color: "#1B5E20",
            zIndex: 1,
            backgroundColor: "rgba(250, 249, 245, 0.8)",
            padding: "0 1px",
          }}
        >
          1/8"
        </span>
      </div>

      {/* Numerical Coordinate Data */}
      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
          <span style={{ fontSize: "10px", fontWeight: "bold", color: "#1B5E20", letterSpacing: "0.4px" }}>
            BASE-UNIT (1/8" SQ)
          </span>
          <span
            style={{
              fontSize: "9px",
              padding: "1px 5px",
              borderRadius: "3px",
              backgroundColor: badgeBg,
              color: badgeColor,
              border: `1px solid ${badgeBorder}`,
              fontWeight: "bold",
              whiteSpace: "nowrap",
            }}
          >
            {badgeText}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "11px", marginTop: "1px" }}>
          <div>
            <span style={{ color: "rgba(74, 120, 102, 0.9)", fontWeight: "bold" }}>x:</span>{" "}
            <span style={{ color: "#2C3E35", fontWeight: "bold" }}>1 bar ({cleanTime})</span>
          </div>
          <div style={{ width: "1px", height: "12px", backgroundColor: "rgba(74, 120, 102, 0.3)" }} />
          <div>
            <span style={{ color: "rgba(74, 120, 102, 0.9)", fontWeight: "bold" }}>y:</span>{" "}
            <strong style={{ color: "#1B5E20" }}>₹{formattedPrice}</strong>
            <span style={{ fontSize: "9px", color: "#666" }}>/sq</span>
          </div>
        </div>
      </div>
    </div>
  );
};
