import React, { useState, useEffect } from "react";
import { useGridState } from "../store/useGridState";
import { ChartDisplayMode } from "../types/gann";
import { useActiveModuleTools } from "../ModuleRegistry";
import { GridBridge } from "../core-bridge/GridBridge";
import { DataDisplayCoordinator } from "../modules/data-display/DataDisplayCoordinator";
import { DisplayTimeframe } from "../modules/data-display/DisplayTypes";

interface DraftingToolbarProps {
  showGannRay: boolean;
  setShowGannRay: (val: boolean) => void;
  onOpenVaultBackup?: () => void;
}

export const DraftingToolbar: React.FC<DraftingToolbarProps> = ({
  showGannRay,
  setShowGannRay,
  onOpenVaultBackup,
}) => {
  // Granular Isolated Zustand Selectors (DELTA-P0-02 Remediation)
  const zoomAt = useGridState((s) => s.zoomAt);
  const setZoom = useGridState((s) => s.setZoom);
  const resetView = useGridState((s) => s.resetView);
  const jumpToLatest = useGridState((s) => s.jumpToLatest);
  const chartMode = useGridState((s) => s.chartMode);
  const setChartMode = useGridState((s) => s.setChartMode);
  const showPatterns = useGridState((s) => s.showPatterns);
  const setShowPatterns = useGridState((s) => s.setShowPatterns);
  const showVolumeBars = useGridState((s) => s.showVolumeBars);
  const setShowVolumeBars = useGridState((s) => s.setShowVolumeBars);
  const showTopAxis = useGridState((s) => s.showTopAxis);
  const showBottomAxis = useGridState((s) => s.showBottomAxis);
  const showLeftAxis = useGridState((s) => s.showLeftAxis);
  const showRightAxis = useGridState((s) => s.showRightAxis);
  const isAxisTransparent = useGridState((s) => s.isAxisTransparent);
  const showCrosshair = useGridState((s) => s.showCrosshair);
  const toggleTopAxis = useGridState((s) => s.toggleTopAxis);
  const toggleBottomAxis = useGridState((s) => s.toggleBottomAxis);
  const toggleLeftAxis = useGridState((s) => s.toggleLeftAxis);
  const toggleRightAxis = useGridState((s) => s.toggleRightAxis);
  const toggleAxisTransparency = useGridState((s) => s.toggleAxisTransparency);
  const toggleCrosshair = useGridState((s) => s.toggleCrosshair);
  const clearAllData = useGridState((s) => s.clearAllData);
  const lowestSeed = useGridState((s) => s.lowestSeed);
  const highestSeed = useGridState((s) => s.highestSeed);
  const activeSeedTool = useGridState((s) => s.activeSeedTool);
  const setLowestSeed = useGridState((s) => s.setLowestSeed);
  const setHighestSeed = useGridState((s) => s.setHighestSeed);
  const setActiveSeedTool = useGridState((s) => s.setActiveSeedTool);
  const clearManualSeeds = useGridState((s) => s.clearManualSeeds);
  const hasCandles = useGridState((s) => s.candles.length > 0);
  const autoFitY = useGridState((s) => s.autoFitY);
  const toggleAutoFitY = useGridState((s) => s.toggleAutoFitY);

  const [isSeedModalOpen, setIsSeedModalOpen] = useState(false);
  const [lowestDateInput, setLowestDateInput] = useState("");
  const [lowestPriceInput, setLowestPriceInput] = useState("");
  const [highestDateInput, setHighestDateInput] = useState("");
  const [highestPriceInput, setHighestPriceInput] = useState("");

  // Dynamic Modular Plugin Tools (Feature-Sliced Architecture)
  const moduleTools = useActiveModuleTools();

  const [coordinatorState, setCoordinatorState] = useState(DataDisplayCoordinator.getState());

  useEffect(() => {
    return DataDisplayCoordinator.subscribe((s) => setCoordinatorState({ ...s }));
  }, []);

  const [isVaultLoading, setIsVaultLoading] = useState(false);

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

      {/* Vault Instrument & Timeframe Multi-Series Selector */}
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <select
          value={coordinatorState.activeSymbol}
          onChange={async (e) => {
            const sym = e.target.value;
            if (sym) {
              setIsVaultLoading(true);
              try {
                await DataDisplayCoordinator.setSeries(sym);
              } finally {
                setIsVaultLoading(false);
              }
            }
          }}
          style={{
            padding: "4px 8px",
            fontSize: "11px",
            fontFamily: "'Courier New', Courier, monospace",
            fontWeight: "bold",
            backgroundColor: "#FFFFFF",
            color: "#1B5E20",
            border: "1px solid rgba(74, 120, 102, 0.60)",
            borderRadius: 3,
            cursor: "pointer",
            outline: "none",
          }}
          title="Select active financial series from master DuckDB vault (NSE Index, MCX Energy, MCX Base Metals; Bullion excluded)"
        >
          {coordinatorState.availableSeries.length > 0 ? (
            coordinatorState.availableSeries.map((s) => (
              <option key={s.seriesId || s.symbol} value={s.symbol}>
                📈 {s.symbol} [{s.exchange} • {s.assetClass}] ({s.rowCount.toLocaleString()} bars)
              </option>
            ))
          ) : (
            <option value="NIFTY 50">📈 NIFTY 50 [NSE • INDEX]</option>
          )}
        </select>

        {/* Timeframe Buttons (1D, 1W, 1M, 15m, 5m, 1m) */}
        <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
          {(["1D", "1W", "1M", "15m", "5m", "1m"] as DisplayTimeframe[]).map((tf) => {
            const isActive = coordinatorState.activeTimeframe === tf;
            return (
              <button
                key={tf}
                onClick={() => DataDisplayCoordinator.setTimeframe(tf)}
                style={{
                  ...buttonStyle,
                  padding: "3px 6px",
                  fontSize: "10px",
                  backgroundColor: isActive ? "#1B5E20" : "#FFFFFF",
                  color: isActive ? "#FFFFFF" : "#2C3E35",
                  borderColor: isActive ? "#0D3311" : "rgba(74, 120, 102, 0.40)",
                  fontWeight: isActive ? "bold" : "normal",
                }}
                title={`Aggregate active series to ${tf} timeframe`}
              >
                {tf}
              </button>
            );
          })}
        </div>

        {/* Live Active Series Metadata Badge */}
        {coordinatorState.metadata && (
          <div
            style={{
              fontSize: "10px",
              color: "#1B5E20",
              backgroundColor: "#E8F5E9",
              padding: "3px 7px",
              borderRadius: 3,
              border: "1px solid rgba(46, 125, 50, 0.30)",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              whiteSpace: "nowrap",
            }}
            title={`${coordinatorState.metadata.symbol} on ${coordinatorState.metadata.timeframe} timeframe (${coordinatorState.metadata.startDate} to ${coordinatorState.metadata.endDate})`}
          >
            <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", backgroundColor: "#2E7D32" }} />
            <span>
              <strong>{coordinatorState.metadata.symbol}</strong> ({coordinatorState.metadata.totalBars.toLocaleString()} bars)
            </span>
          </div>
        )}
      </div>

      <div style={dividerStyle} />

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

        <button
          onClick={toggleCrosshair}
          style={{
            ...buttonStyle,
            backgroundColor: showCrosshair ? "#E0F2F1" : "transparent",
            borderColor: showCrosshair ? "#00796B" : "rgba(74, 120, 102, 0.40)",
            color: showCrosshair ? "#004D40" : "#555",
            fontWeight: showCrosshair ? "bold" : "normal",
          }}
          title="Toggle Full-Screen Rigid Snapping Precision Crosshair (Step 2)"
        >
          {showCrosshair ? "🎯 Crosshair" : "🎯 Off"}
        </button>
      </div>

      {/* Dynamic Modular Plugins Tools (Feature-Sliced Plugin Architecture) */}
      {moduleTools.length > 0 && (
        <>
          <div style={dividerStyle} />
          <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
            {moduleTools.map((tool) => {
              const isActive = tool.isActive ? tool.isActive(GridBridge) : false;
              return (
                <button
                  key={`${tool.moduleId}-${tool.id}`}
                  onClick={() => tool.onClick(GridBridge)}
                  style={{
                    ...buttonStyle,
                    backgroundColor: isActive ? "#E8F5E9" : "transparent",
                    borderColor: isActive ? "#2E7D32" : "rgba(74, 120, 102, 0.40)",
                    color: isActive ? "#1B5E20" : "#2C3E35",
                    fontWeight: isActive ? "bold" : "normal",
                  }}
                  title={tool.title || tool.label}
                >
                  {tool.icon && <span style={{ marginRight: 4 }}>{tool.icon}</span>}
                  {tool.label}
                </button>
              );
            })}
          </div>
        </>
      )}

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

        <button
          onClick={toggleAxisTransparency}
          style={{
            ...buttonStyle,
            padding: "4px 8px",
            backgroundColor: isAxisTransparent ? "#E8F5E9" : "transparent",
            borderColor: isAxisTransparent ? "#2E7D32" : "rgba(74, 120, 102, 0.40)",
            color: isAxisTransparent ? "#1B5E20" : "#555",
            fontWeight: isAxisTransparent ? "bold" : "normal",
          }}
          title="Toggle Axis Background Transparency (Solid #F7F6F0 vs Semi-Transparent rgba(247, 246, 240, 0.75))"
        >
          {isAxisTransparent ? "🌓 Transparent Axes" : "🌔 Solid Axes"}
        </button>
      </div>

      <div style={dividerStyle} />

      {/* Manual Seed Controls (Time + Price) */}
      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
        <button
          onClick={() => setIsSeedModalOpen((prev) => !prev)}
          style={{
            ...buttonStyle,
            backgroundColor: activeSeedTool !== "NONE" ? "#FFF8E1" : (lowestSeed || highestSeed) ? "#E8F5E9" : "transparent",
            borderColor: activeSeedTool !== "NONE" ? "#FFA000" : (lowestSeed || highestSeed) ? "#2E7D32" : "rgba(74, 120, 102, 0.40)",
            color: activeSeedTool !== "NONE" ? "#B78103" : (lowestSeed || highestSeed) ? "#1B5E20" : "#333",
            fontWeight: (lowestSeed || highestSeed || activeSeedTool !== "NONE") ? "bold" : "normal",
          }}
          title="Manual Lowest & Highest Seed Configuration (Time + Price)"
        >
          {activeSeedTool !== "NONE"
            ? "🎯 Picking..."
            : `🌱 Seeds ${lowestSeed || highestSeed ? `(${[lowestSeed ? "L" : "", highestSeed ? "H" : ""].filter(Boolean).join("+")})` : ""}`}
        </button>

        {isSeedModalOpen && (
          <div
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              marginTop: "6px",
              width: "370px",
              backgroundColor: "#FAF9F5",
              border: "1.5px solid #2E7D32",
              borderRadius: "8px",
              padding: "14px",
              boxShadow: "0 8px 24px rgba(0,0,0,0.22)",
              zIndex: 1000,
              fontFamily: "'Courier New', Courier, monospace",
              color: "#1E2A24",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "10px",
                borderBottom: "1px solid rgba(74, 120, 102, 0.3)",
                paddingBottom: "6px",
              }}
            >
              <strong style={{ fontSize: "12px", color: "#1B5E20" }}>
                🌱 MANUAL SEEDS (TIME + PRICE)
              </strong>
              <button
                onClick={() => setIsSeedModalOpen(false)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "14px",
                  fontWeight: "bold",
                  color: "#666",
                }}
              >
                ✕
              </button>
            </div>

            {/* 1. LOWEST SEED */}
            <div
              style={{
                marginBottom: "12px",
                padding: "8px 10px",
                backgroundColor: "#FFF8E1",
                borderRadius: "6px",
                border: "1px solid #FFE082",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "4px",
                }}
              >
                <span style={{ fontWeight: "bold", fontSize: "11px", color: "#B78103" }}>
                  ★ LOWEST SEED (BULL ANCHOR)
                </span>
                {lowestSeed && (
                  <button
                    onClick={() => setLowestSeed(null)}
                    style={{
                      fontSize: "10px",
                      color: "#C62828",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      textDecoration: "underline",
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>
              <div style={{ fontSize: "10px", marginBottom: "6px", color: "#555" }}>
                Current:{" "}
                <strong>
                  {lowestSeed
                    ? `₹${lowestSeed.price.toLocaleString("en-IN")} | ${
                        lowestSeed.date || `Col ${lowestSeed.gridCol}`
                      }`
                    : "(Not Set)"}
                </strong>
              </div>
              <div style={{ display: "flex", gap: "6px", marginBottom: "6px" }}>
                <input
                  type="text"
                  placeholder="Date / Col (e.g. 2020-03-24)"
                  value={lowestDateInput}
                  onChange={(e) => setLowestDateInput(e.target.value)}
                  style={{
                    flex: 1,
                    padding: "4px 6px",
                    fontSize: "10px",
                    border: "1px solid #CCC",
                    borderRadius: "3px",
                  }}
                />
                <input
                  type="number"
                  placeholder="Price (₹)"
                  value={lowestPriceInput}
                  onChange={(e) => setLowestPriceInput(e.target.value)}
                  style={{
                    width: "95px",
                    padding: "4px 6px",
                    fontSize: "10px",
                    border: "1px solid #CCC",
                    borderRadius: "3px",
                  }}
                />
              </div>
              <div style={{ display: "flex", gap: "6px" }}>
                <button
                  onClick={() => {
                    const price = parseFloat(lowestPriceInput);
                    if (Number.isFinite(price) && price > 0) {
                      const colMatch = lowestDateInput.match(/col\s*(\d+)/i);
                      const gridCol = colMatch ? parseInt(colMatch[1], 10) : 0;
                      setLowestSeed({ date: lowestDateInput, gridCol, price });
                      setLowestPriceInput("");
                      setLowestDateInput("");
                    }
                  }}
                  style={{
                    flex: 1,
                    padding: "4px 8px",
                    backgroundColor: "#FFD54F",
                    border: "1px solid #FFA000",
                    borderRadius: "3px",
                    fontSize: "10px",
                    fontWeight: "bold",
                    cursor: "pointer",
                  }}
                >
                  Set Lowest
                </button>
                <button
                  onClick={() => {
                    setActiveSeedTool("PICK_LOWEST");
                    setIsSeedModalOpen(false);
                  }}
                  style={{
                    flex: 1,
                    padding: "4px 8px",
                    backgroundColor: "#FFF",
                    border: "1px solid #FFA000",
                    borderRadius: "3px",
                    fontSize: "10px",
                    fontWeight: "bold",
                    cursor: "pointer",
                    color: "#B78103",
                  }}
                >
                  🎯 Pick on Chart
                </button>
              </div>
            </div>

            {/* 2. HIGHEST SEED */}
            <div
              style={{
                marginBottom: "12px",
                padding: "8px 10px",
                backgroundColor: "#E0F7FA",
                borderRadius: "6px",
                border: "1px solid #80DEEA",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "4px",
                }}
              >
                <span style={{ fontWeight: "bold", fontSize: "11px", color: "#00838F" }}>
                  ★ HIGHEST SEED (BEAR ANCHOR)
                </span>
                {highestSeed && (
                  <button
                    onClick={() => setHighestSeed(null)}
                    style={{
                      fontSize: "10px",
                      color: "#C62828",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      textDecoration: "underline",
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>
              <div style={{ fontSize: "10px", marginBottom: "6px", color: "#555" }}>
                Current:{" "}
                <strong>
                  {highestSeed
                    ? `₹${highestSeed.price.toLocaleString("en-IN")} | ${
                        highestSeed.date || `Col ${highestSeed.gridCol}`
                      }`
                    : "(Not Set)"}
                </strong>
              </div>
              <div style={{ display: "flex", gap: "6px", marginBottom: "6px" }}>
                <input
                  type="text"
                  placeholder="Date / Col (e.g. 2024-09-27)"
                  value={highestDateInput}
                  onChange={(e) => setHighestDateInput(e.target.value)}
                  style={{
                    flex: 1,
                    padding: "4px 6px",
                    fontSize: "10px",
                    border: "1px solid #CCC",
                    borderRadius: "3px",
                  }}
                />
                <input
                  type="number"
                  placeholder="Price (₹)"
                  value={highestPriceInput}
                  onChange={(e) => setHighestPriceInput(e.target.value)}
                  style={{
                    width: "95px",
                    padding: "4px 6px",
                    fontSize: "10px",
                    border: "1px solid #CCC",
                    borderRadius: "3px",
                  }}
                />
              </div>
              <div style={{ display: "flex", gap: "6px" }}>
                <button
                  onClick={() => {
                    const price = parseFloat(highestPriceInput);
                    if (Number.isFinite(price) && price > 0) {
                      const colMatch = highestDateInput.match(/col\s*(\d+)/i);
                      const gridCol = colMatch ? parseInt(colMatch[1], 10) : 0;
                      setHighestSeed({ date: highestDateInput, gridCol, price });
                      setHighestPriceInput("");
                      setHighestDateInput("");
                    }
                  }}
                  style={{
                    flex: 1,
                    padding: "4px 8px",
                    backgroundColor: "#80DEEA",
                    border: "1px solid #00ACC1",
                    borderRadius: "3px",
                    fontSize: "10px",
                    fontWeight: "bold",
                    cursor: "pointer",
                  }}
                >
                  Set Highest
                </button>
                <button
                  onClick={() => {
                    setActiveSeedTool("PICK_HIGHEST");
                    setIsSeedModalOpen(false);
                  }}
                  style={{
                    flex: 1,
                    padding: "4px 8px",
                    backgroundColor: "#FFF",
                    border: "1px solid #00ACC1",
                    borderRadius: "3px",
                    fontSize: "10px",
                    fontWeight: "bold",
                    cursor: "pointer",
                    color: "#00838F",
                  }}
                >
                  🎯 Pick on Chart
                </button>
              </div>
            </div>

            {/* Actions */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                borderTop: "1px solid rgba(74, 120, 102, 0.2)",
                paddingTop: "8px",
              }}
            >
              <button
                onClick={() => {
                  clearManualSeeds();
                  setLowestDateInput("");
                  setLowestPriceInput("");
                  setHighestDateInput("");
                  setHighestPriceInput("");
                }}
                style={{
                  fontSize: "10px",
                  color: "#C62828",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontWeight: "bold",
                }}
              >
                Clear All Seeds
              </button>
              <button
                onClick={() => setIsSeedModalOpen(false)}
                style={{
                  padding: "4px 14px",
                  backgroundColor: "#2E7D32",
                  color: "#FFF",
                  border: "none",
                  borderRadius: "4px",
                  fontSize: "10px",
                  fontWeight: "bold",
                  cursor: "pointer",
                }}
              >
                Done
              </button>
            </div>
          </div>
        )}
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
        <button
          onClick={() => jumpToLatest(window.innerWidth, window.innerHeight)}
          style={{
            ...buttonStyle,
            backgroundColor: "#E8F5E9",
            borderColor: "#2E7D32",
            color: "#1B5E20",
            fontWeight: "bold",
          }}
          title="Jump to Latest (Auto-Center with Future Space Buffer)"
        >
          ▶ Latest
        </button>
        <button
          onClick={toggleAutoFitY}
          style={{
            ...buttonStyle,
            backgroundColor: autoFitY ? "#E8F5E9" : "transparent",
            borderColor: autoFitY ? "#2E7D32" : "rgba(74, 120, 102, 0.40)",
            color: autoFitY ? "#1B5E20" : "#555",
            fontWeight: autoFitY ? "bold" : "normal",
          }}
          title={
            autoFitY
              ? "Auto-Fit Y is ON: Visible candles automatically scaled and centered vertically during horizontal slide/pan. Click to disable for free manual vertical panning."
              : "Auto-Fit Y is OFF: Free manual vertical panning enabled. Click to enable visible-candle auto-fit."
          }
        >
          {autoFitY ? "✓ Auto-Fit Y" : "Auto-Fit Y"}
        </button>
      </div>

      <div style={dividerStyle} />

      {/* Dedicated Vault Controls */}
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        {onOpenVaultBackup && (
          <button
            onClick={onOpenVaultBackup}
            style={{
              ...buttonStyle,
              backgroundColor: "#E8F5E9",
              borderColor: "#2E7D32",
              color: "#1B5E20",
              fontWeight: "bold",
            }}
            title="Open Market Data Vault Backup, Mail Bundler & Disaster Recovery Menu"
          >
            🛡️ Vault Backup
          </button>
        )}

        {!hasCandles ? (
          <button
            onClick={async () => {
              setIsVaultLoading(true);
              try {
                await DataDisplayCoordinator.initializeStartupData();
              } finally {
                setIsVaultLoading(false);
              }
            }}
            disabled={isVaultLoading}
            style={{
              ...buttonStyle,
              backgroundColor: isVaultLoading ? "#EEE" : "#E8F0FE",
              borderColor: "#1967D2",
              color: "#1967D2",
              fontWeight: "bold",
            }}
            title="Load active series from Master DuckDB Vault"
          >
            {isVaultLoading ? "Loading..." : "🏛️ Reload Vault"}
          </button>
        ) : (
          <button
            onClick={() => {
              clearAllData();
              useGridState.getState().setCandles([]);
              useGridState.getState().setSwingPoints([]);
            }}
            style={{
              ...buttonStyle,
              color: "#C62828",
            }}
            title="Clear active chart bars"
          >
            Clear Data
          </button>
        )}

        <button
          onClick={() => {
            try {
              localStorage.removeItem("grid-state-storage");
              localStorage.removeItem("gann-grid-state");
            } catch {
              // ignore
            }
            useGridState.getState().resetScale();
          }}
          style={{
            ...buttonStyle,
            backgroundColor: "#FFEBEE",
            borderColor: "#E57373",
            color: "#C62828",
            fontWeight: "bold",
          }}
          title="Purge scale cache and reset Viewport scale"
        >
          🧹 Reset Scale
        </button>
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
