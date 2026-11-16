import React from "react";
import { useGridState } from "../store/useGridState";
import { ChartDisplayMode } from "../types/gann";

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
    chartMode,
    setChartMode,
    showPatterns,
    setShowPatterns,
    showVolumeBars,
    setShowVolumeBars,
    showTopAxis,
    showBottomAxis,
    showLeftAxis,
    showRightAxis,
    toggleTopAxis,
    toggleBottomAxis,
    toggleLeftAxis,
    toggleRightAxis,
    loadSampleDataset,
    clearAllData,
    candles,
  } = useGridState();

  const handleZoomIn = () => {
    const center = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    zoomAt(center.x, center.y, 1.25);
  };

  const handleZoomOut = () => {
    const center = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    zoomAt(center.x, center.y, 0.8);
  };

  const modes: { id: ChartDisplayMode; label: string; icon: string }[] = [
    { id: "HYBRID_CANDLE_SWING", label: "Hybrid (Candle + Swing)", icon: "⚡" },
    { id: "CANDLESTICK", label: "Candlesticks", icon: "🕯️" },
    { id: "OHLC_BAR", label: "OHLC Bars", icon: "📊" },
    { id: "SWING_STEP", label: "Swing Steps", icon: "📐" },
  ];

  return (
    <div
      style={{
        position: "absolute",
        top: showTopAxis ? 40 : 14,
        left: showLeftAxis ? 96 : 14,
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "8px",
        backgroundColor: "rgba(247, 246, 240, 0.96)",
        border: "1px solid rgba(74, 120, 102, 0.50)",
        borderRadius: 4,
        padding: "6px 12px",
        boxShadow: "0 4px 16px rgba(0, 0, 0, 0.12)",
        fontFamily: "'Courier New', Courier, monospace",
        zIndex: 50,
        transition: "top 0.2s ease, left 0.2s ease",
      }}
    >
      {/* Brand Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
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

      {/* Mode Selector Buttons */}
      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
        {modes.map((m) => {
          const isActive = chartMode === m.id;
          return (
            <button
              key={m.id}
              onClick={() => setChartMode(m.id)}
              style={{
                ...buttonStyle,
                backgroundColor: isActive ? "#2E7D32" : "#FFFFFF",
                color: isActive ? "#FFFFFF" : "#2C3E35",
                fontWeight: isActive ? "bold" : "normal",
                borderColor: isActive ? "#1B5E20" : "rgba(74, 120, 102, 0.40)",
              }}
              title={`Switch display to ${m.label}`}
            >
              <span style={{ marginRight: 4 }}>{m.icon}</span>
              {m.label}
            </button>
          );
        })}
      </div>

      <div style={dividerStyle} />

      {/* Pattern & Volume Feature Toggles */}
      <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
        <button
          onClick={() => setShowPatterns(!showPatterns)}
          style={{
            ...buttonStyle,
            backgroundColor: showPatterns ? "#E8F5E9" : "transparent",
            borderColor: showPatterns ? "#2E7D32" : "rgba(74, 120, 102, 0.40)",
            color: showPatterns ? "#1B5E20" : "#555",
            fontWeight: showPatterns ? "bold" : "normal",
          }}
          title="Detect and highlight Candlestick Patterns (Hammer, Engulfing, Doji, Marubozu, etc.)"
        >
          {showPatterns ? "✓ Patterns (Hammer, Doji...)" : "Patterns"}
        </button>

        <button
          onClick={() => setShowVolumeBars(!showVolumeBars)}
          style={{
            ...buttonStyle,
            backgroundColor: showVolumeBars ? "#E8F5E9" : "transparent",
            borderColor: showVolumeBars ? "#2E7D32" : "rgba(74, 120, 102, 0.40)",
            color: showVolumeBars ? "#1B5E20" : "#555",
          }}
          title="Toggle Volume Bar Histogram"
        >
          {showVolumeBars ? "✓ Volume Bar" : "Volume Bar"}
        </button>

        <button
          onClick={() => setShowGannRay(!showGannRay)}
          style={{
            ...buttonStyle,
            backgroundColor: showGannRay ? "#FBE9E7" : "transparent",
            borderColor: showGannRay ? "#D84315" : "rgba(74, 120, 102, 0.40)",
            color: showGannRay ? "#BF360C" : "#555",
          }}
          title="Toggle 1x1 45° True Diagonal Gann Ray"
        >
          {showGannRay ? "✓ 1x1 45° Ray" : "1x1 45° Ray"}
        </button>
      </div>

      <div style={dividerStyle} />

      {/* Four-Sided Axis Track Toggles (Step 1.5) */}
      <div style={{ display: "flex", alignItems: "center", gap: "3px" }}>
        <button
          onClick={toggleTopAxis}
          style={{
            ...buttonStyle,
            padding: "4px 6px",
            backgroundColor: showTopAxis ? "#E8F5E9" : "transparent",
            borderColor: showTopAxis ? "#2E7D32" : "rgba(74, 120, 102, 0.40)",
            color: showTopAxis ? "#1B5E20" : "#777",
            fontWeight: showTopAxis ? "bold" : "normal",
          }}
          title="Toggle Top Time Axis Track"
        >
          {showTopAxis ? "🔲 Top" : "◻ Top"}
        </button>

        <button
          onClick={toggleBottomAxis}
          style={{
            ...buttonStyle,
            padding: "4px 6px",
            backgroundColor: showBottomAxis ? "#E8F5E9" : "transparent",
            borderColor: showBottomAxis ? "#2E7D32" : "rgba(74, 120, 102, 0.40)",
            color: showBottomAxis ? "#1B5E20" : "#777",
            fontWeight: showBottomAxis ? "bold" : "normal",
          }}
          title="Toggle Bottom Time Axis Track"
        >
          {showBottomAxis ? "🔲 Btm" : "◻ Btm"}
        </button>

        <button
          onClick={toggleLeftAxis}
          style={{
            ...buttonStyle,
            padding: "4px 6px",
            backgroundColor: showLeftAxis ? "#E8F5E9" : "transparent",
            borderColor: showLeftAxis ? "#2E7D32" : "rgba(74, 120, 102, 0.40)",
            color: showLeftAxis ? "#1B5E20" : "#777",
            fontWeight: showLeftAxis ? "bold" : "normal",
          }}
          title="Toggle Left Price Axis Track"
        >
          {showLeftAxis ? "🔲 Left" : "◻ Left"}
        </button>

        <button
          onClick={toggleRightAxis}
          style={{
            ...buttonStyle,
            padding: "4px 6px",
            backgroundColor: showRightAxis ? "#E8F5E9" : "transparent",
            borderColor: showRightAxis ? "#2E7D32" : "rgba(74, 120, 102, 0.40)",
            color: showRightAxis ? "#1B5E20" : "#777",
            fontWeight: showRightAxis ? "bold" : "normal",
          }}
          title="Toggle Right Price Axis Track"
        >
          {showRightAxis ? "🔲 Right" : "◻ Right"}
        </button>
      </div>

      <div style={dividerStyle} />

      {/* Navigation & Zoom */}
      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
        <button onClick={handleZoomIn} style={buttonStyle} title="Zoom In (1:1 Locked)">
          +
        </button>
        <button onClick={handleZoomOut} style={buttonStyle} title="Zoom Out (1:1 Locked)">
          -
        </button>
        <button onClick={() => setZoom(1.0)} style={{ ...buttonStyle, fontWeight: "bold" }} title="100% 1:1 Scale">
          1:1
        </button>
        <button
          onClick={() => resetView(window.innerWidth, window.innerHeight)}
          style={buttonStyle}
          title="Reset to Origin"
        >
          Origin
        </button>
      </div>

      <div style={dividerStyle} />

      {/* Data Ingest & Reset */}
      <div>
        {candles.length === 0 ? (
          <button
            onClick={loadSampleDataset}
            style={{
              ...buttonStyle,
              backgroundColor: "#E8F0FE",
              borderColor: "#1967D2",
              color: "#1967D2",
              fontWeight: "bold",
            }}
          >
            + Load NIFTY 50
          </button>
        ) : (
          <button
            onClick={clearAllData}
            style={{
              ...buttonStyle,
              color: "#C62828",
            }}
          >
            Clear Data
          </button>
        )}
      </div>
    </div>
  );
};

const dividerStyle: React.CSSProperties = {
  width: 1,
  height: 20,
  backgroundColor: "rgba(74, 120, 102, 0.30)",
  margin: "0 2px",
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
