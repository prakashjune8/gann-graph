import React from "react";
import { useGridState } from "../store/useGridState";

interface DraftingToolbarProps {
  showGannRay: boolean;
  setShowGannRay: (val: boolean) => void;
}

export const DraftingToolbar: React.FC<DraftingToolbarProps> = ({
  showGannRay,
  setShowGannRay,
}) => {
  const {
    zoom,
    zoomAt,
    setZoom,
    resetView,
    loadSampleNiftySwing,
    clearSwingPoints,
    swingPoints,
  } = useGridState();

  const handleZoomIn = () => {
    const center = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    zoomAt(center.x, center.y, 1.25);
  };

  const handleZoomOut = () => {
    const center = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    zoomAt(center.x, center.y, 0.8);
  };

  const handleResetZoom100 = () => {
    setZoom(1.0);
  };

  return (
    <div
      style={{
        position: "absolute",
        top: 16,
        left: 16,
        display: "flex",
        alignItems: "center",
        gap: "8px",
        backgroundColor: "rgba(247, 246, 240, 0.95)",
        border: "1px solid rgba(74, 120, 102, 0.50)",
        borderRadius: 4,
        padding: "6px 12px",
        boxShadow: "0 4px 16px rgba(0, 0, 0, 0.10)",
        fontFamily: "'Courier New', Courier, monospace",
        zIndex: 50,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "4px",
          paddingRight: "8px",
          borderRight: "1px solid rgba(74, 120, 102, 0.30)",
        }}
      >
        <span
          style={{
            fontWeight: "bold",
            color: "#1E332A",
            fontSize: "12px",
            letterSpacing: "0.5px",
          }}
        >
          K&E 8x8 DRAFTING DESK
        </span>
      </div>

      {/* Zoom Controls */}
      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
        <button
          onClick={handleZoomIn}
          title="Zoom In (Fixed 1:1)"
          style={buttonStyle}
        >
          + Zoom
        </button>
        <button
          onClick={handleZoomOut}
          title="Zoom Out (Fixed 1:1)"
          style={buttonStyle}
        >
          - Zoom
        </button>
        <button
          onClick={handleResetZoom100}
          title="100% Scale (1 Minor = 12px, 1 Major = 96px)"
          style={{ ...buttonStyle, fontWeight: "bold" }}
        >
          1:1 (100%)
        </button>
        <button
          onClick={() => resetView(window.innerWidth, window.innerHeight)}
          title="Center Origin"
          style={buttonStyle}
        >
          Reset Origin
        </button>
      </div>

      <div
        style={{
          width: 1,
          height: 18,
          backgroundColor: "rgba(74, 120, 102, 0.30)",
          margin: "0 4px",
        }}
      />

      {/* Geometric Overlay Toggles */}
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <button
          onClick={() => setShowGannRay(!showGannRay)}
          style={{
            ...buttonStyle,
            backgroundColor: showGannRay ? "#D9E8DF" : "transparent",
            borderColor: showGannRay ? "#2E7D32" : "rgba(74, 120, 102, 0.40)",
            color: showGannRay ? "#1B5E20" : "#2C3E35",
          }}
          title="Toggle 1x1 45-degree true diagonal ray"
        >
          {showGannRay ? "✓ 1x1 45° Ray" : "1x1 45° Ray"}
        </button>

        {swingPoints.length === 0 ? (
          <button
            onClick={loadSampleNiftySwing}
            style={{
              ...buttonStyle,
              backgroundColor: "#E8F0FE",
              borderColor: "#1967D2",
              color: "#1967D2",
            }}
            title="Load Sample NIFTY 50 Right-Angle Swings"
          >
            + Load NIFTY Swings
          </button>
        ) : (
          <button
            onClick={clearSwingPoints}
            style={{
              ...buttonStyle,
              color: "#C62828",
            }}
            title="Clear all swings"
          >
            Clear Swings
          </button>
        )}
      </div>
    </div>
  );
};

const buttonStyle: React.CSSProperties = {
  backgroundColor: "#FFFFFF",
  border: "1px solid rgba(74, 120, 102, 0.40)",
  color: "#2C3E35",
  padding: "4px 8px",
  fontSize: "11px",
  fontFamily: "'Courier New', Courier, monospace",
  cursor: "pointer",
  borderRadius: 3,
  outline: "none",
  transition: "all 0.15s ease",
};
