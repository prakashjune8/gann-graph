import React, { useState, useRef, useEffect } from "react";
import { useGridState } from "../store/useGridState";
import { ChartDisplayMode } from "../types/gann";
import CsvWorker from "../workers/csvWorker?worker&inline";
import { CsvWorkerResponse } from "../workers/csvWorker";
import { useActiveModuleTools } from "../ModuleRegistry";
import { GridBridge } from "../core-bridge/GridBridge";

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
  const loadSampleDataset = useGridState((s) => s.loadSampleDataset);
  const clearAllData = useGridState((s) => s.clearAllData);
  const hasCandles = useGridState((s) => s.candles.length > 0);
  const setCandles = useGridState((s) => s.setCandles);
  const setSwingPoints = useGridState((s) => s.setSwingPoints);
  const basePrice = useGridState((s) => s.basePrice);
  const pricePerUnit = useGridState((s) => s.pricePerUnit);

  // Dynamic Modular Plugin Tools (Feature-Sliced Architecture)
  const moduleTools = useActiveModuleTools();

  const [isParsing, setIsParsing] = useState(false);
  const [parseNotice, setParseNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const activeReaderRef = useRef<FileReader | null>(null);
  const activeWorkerRef = useRef<Worker | null>(null);
  const currentIngestionIdRef = useRef<number>(0);
  const parseNoticeTimerRef = useRef<number | null>(null);

  // Strict lifecycle cleanup to eradicate zombie processes & memory leaks on unmount
  useEffect(() => {
    return () => {
      if (activeReaderRef.current) {
        activeReaderRef.current.abort();
        activeReaderRef.current = null;
      }
      if (activeWorkerRef.current) {
        activeWorkerRef.current.terminate();
        activeWorkerRef.current = null;
      }
      if (parseNoticeTimerRef.current) {
        window.clearTimeout(parseNoticeTimerRef.current);
        parseNoticeTimerRef.current = null;
      }
    };
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Abort any ongoing FileReader read
    if (activeReaderRef.current) {
      activeReaderRef.current.abort();
      activeReaderRef.current = null;
    }

    // Terminate any previous dangling worker instance
    if (activeWorkerRef.current) {
      activeWorkerRef.current.terminate();
      activeWorkerRef.current = null;
    }

    // Increment atomic generation token to discard stale in-flight responses (BETA-P0-01)
    currentIngestionIdRef.current += 1;
    const ingestionId = currentIngestionIdRef.current;

    setIsParsing(true);
    setParseNotice(null);

    const reader = new FileReader();
    activeReaderRef.current = reader;

    reader.onload = (event) => {
      // If a newer ingestion was initiated while reading file, discard immediately
      if (currentIngestionIdRef.current !== ingestionId) {
        return;
      }
      activeReaderRef.current = null;

      const csvContent = event.target?.result;
      if (typeof csvContent !== "string") {
        setIsParsing(false);
        return;
      }

      // Terminate any previous dangling worker instance
      if (activeWorkerRef.current) {
        activeWorkerRef.current.terminate();
      }

      // Instantiate dedicated Web Worker (off-main-thread processing)
      const worker = new CsvWorker();
      activeWorkerRef.current = worker;

      worker.onmessage = (msgEvt: MessageEvent<CsvWorkerResponse>) => {
        const data = msgEvt.data;
        // Verify returned generation token strictly matches currentIngestionIdRef.current
        if (currentIngestionIdRef.current !== ingestionId || data.ingestionId !== currentIngestionIdRef.current) {
          worker.terminate();
          if (activeWorkerRef.current === worker) {
            activeWorkerRef.current = null;
          }
          return;
        }

        if (data.success && data.candles.length > 0) {
          setCandles(data.candles);
          setSwingPoints(data.swings);
          jumpToLatest(window.innerWidth, window.innerHeight);
          setParseNotice(`✓ ${data.totalRows} bars (${data.parseTimeMs}ms)`);
          if (parseNoticeTimerRef.current) window.clearTimeout(parseNoticeTimerRef.current);
          parseNoticeTimerRef.current = window.setTimeout(() => setParseNotice(null), 4000);
        } else {
          alert(`CSV Parse Error: ${data.error || "Failed to parse data."}`);
        }
        setIsParsing(false);
        worker.terminate();
        activeWorkerRef.current = null;
      };

      worker.onerror = (err) => {
        if (currentIngestionIdRef.current === ingestionId) {
          console.error("CSV Worker error:", err);
          alert("Worker encountered an error while parsing CSV.");
          setIsParsing(false);
        }
        worker.terminate();
        if (activeWorkerRef.current === worker) {
          activeWorkerRef.current = null;
        }
      };

      worker.postMessage({
        csvContent,
        columnSpacing: 2,
        basePrice,
        pricePerGridUnit: pricePerUnit,
        ingestionId,
      });

      // Reset file input value so user can re-upload same file if needed
      if (fileInputRef.current) fileInputRef.current.value = "";
    };

    reader.onerror = () => {
      if (currentIngestionIdRef.current === ingestionId) {
        alert("Failed to read the selected file.");
        setIsParsing(false);
      }
      activeReaderRef.current = null;
    };

    reader.readAsText(file);
  };

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
      </div>

      <div style={dividerStyle} />

      {/* Data Ingest & Reset (Web Worker Powered) */}
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <input
          type="file"
          ref={fileInputRef}
          accept=".csv,.txt"
          style={{ display: "none" }}
          onChange={handleFileSelect}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isParsing}
          style={{
            ...buttonStyle,
            backgroundColor: isParsing ? "#F5F5F5" : "#E8F5E9",
            borderColor: isParsing ? "#CCC" : "#2E7D32",
            color: isParsing ? "#888" : "#1B5E20",
            fontWeight: "bold",
          }}
          title="Upload Zerodha Kite, Alice Blue, or generic OHLCV CSV file via Web Worker"
        >
          {isParsing ? "⏳ Loading Data..." : "📁 Ingest CSV"}
        </button>

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

        {parseNotice && (
          <span
            style={{
              fontSize: "10px",
              color: "#2E7D32",
              fontWeight: "bold",
              marginLeft: "4px",
            }}
          >
            {parseNotice}
          </span>
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
