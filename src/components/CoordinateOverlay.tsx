import React from "react";
import { useGridState } from "../store/useGridState";

export const CoordinateOverlay: React.FC = () => {
  const {
    pan,
    zoom,
    cursorWorld,
    cursorGrid,
    chartMode,
    candles,
    patternCount,
    worldYToPrice,
    showPatterns,
    showBottomAxis,
    showLeftAxis,
  } = useGridState();

  const zoomPercent = Math.round(zoom * 100);
  const inchCol = (cursorGrid.col / 8).toFixed(3);
  const inchRow = (cursorGrid.row / 8).toFixed(3);
  const cursorPrice = worldYToPrice(cursorWorld.y).toFixed(1);

  return (
    <div
      style={{
        position: "absolute",
        bottom: showBottomAxis ? 42 : 14,
        left: showLeftAxis ? 96 : 14,
        transition: "bottom 0.2s ease, left 0.2s ease",
        backgroundColor: "rgba(247, 246, 240, 0.95)",
        border: "1px solid rgba(74, 120, 102, 0.45)",
        borderRadius: 4,
        padding: "8px 14px",
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.08)",
        fontFamily: "'Courier New', Courier, monospace",
        fontSize: "11px",
        color: "#2C3E35",
        pointerEvents: "none",
        lineHeight: 1.5,
        zIndex: 50,
        minWidth: 350,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: "1px solid rgba(74, 120, 102, 0.25)",
          paddingBottom: 4,
          marginBottom: 6,
          fontWeight: "bold",
        }}
      >
        <span>W.D. GANN DRAFTING HUD</span>
        <span
          style={{
            backgroundColor: "#2E7D32",
            color: "#FFFFFF",
            fontSize: "9px",
            padding: "2px 6px",
            borderRadius: 3,
            fontWeight: "bold",
            letterSpacing: "0.5px",
          }}
        >
          1:1 ASPECT RATIO LOCKED
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 14px" }}>
        <div>
          <span style={{ color: "rgba(74, 120, 102, 0.9)" }}>Active Mode:</span>{" "}
          <strong>{chartMode.replace(/_/g, " ")}</strong>
        </div>
        <div>
          <span style={{ color: "rgba(74, 120, 102, 0.9)" }}>Zoom Scale:</span>{" "}
          <strong>{zoomPercent}%</strong> ({zoom.toFixed(2)}x)
        </div>

        <div>
          <span style={{ color: "rgba(74, 120, 102, 0.9)" }}>Cursor Price:</span>{" "}
          <strong style={{ color: "#1B5E20" }}>₹{cursorPrice}</strong>
        </div>
        <div>
          <span style={{ color: "rgba(74, 120, 102, 0.9)" }}>Pan Origin:</span>{" "}
          [{Math.round(pan.x)}, {Math.round(pan.y)}]
        </div>

        <div>
          <span style={{ color: "rgba(74, 120, 102, 0.9)" }}>K&E Col,Row:</span>{" "}
          <strong>
            [{cursorGrid.col}, {cursorGrid.row}]
          </strong>
        </div>
        <div>
          <span style={{ color: "rgba(74, 120, 102, 0.9)" }}>Inches:</span>{" "}
          {inchCol}" X, {inchRow}" Y
        </div>

        <div>
          <span style={{ color: "rgba(74, 120, 102, 0.9)" }}>Bars / Candles:</span>{" "}
          <strong>{candles.length} bars</strong>
        </div>
        <div>
          <span style={{ color: "rgba(74, 120, 102, 0.9)" }}>Patterns Flagged:</span>{" "}
          <strong style={{ color: "#C62828" }}>
            {showPatterns ? `${patternCount} patterns` : "Hidden"}
          </strong>
        </div>
      </div>

      <div
        style={{
          marginTop: 6,
          paddingTop: 4,
          borderTop: "1px dashed rgba(74, 120, 102, 0.25)",
          fontSize: "10px",
          color: "rgba(74, 120, 102, 0.85)",
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span>Left Drag / Arrow Keys: Pan (Shift: Fast)</span>
        <span>Scroll: 1:1 Isotropic Zoom</span>
      </div>
    </div>
  );
};
