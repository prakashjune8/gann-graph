/**
 * W.D. Gann Drafting Desk — Water-Flow Viewport Indicator
 * Component: src/components/WaterFlowViewport.tsx
 *
 * Implements a slim, non-intrusive stream/flow indicator showing where the current
 * viewing frame sits inside the full historical dataset.
 *
 * Features:
 *  1. Slim 24px horizontal stream track docked cleanly between ruler boundaries.
 *  2. Continuous mini river price trajectory silhouette across the full timeline.
 *  3. Interactive, draggable viewport highlight window showing active viewing frame.
 *  4. Instant click-to-jump navigation across the entire historical river.
 *  5. "Return to Latest Edge" (Flow Mouth) quick-action when navigating deep history.
 *  6. Real-time dynamic ceiling readout (+10% Headroom indicator).
 */

import React, { useRef, useState, useCallback, useMemo } from "react";
import { useGridState } from "../store/useGridState";

export const WaterFlowViewport: React.FC = () => {
  const candles = useGridState((s) => s.candles);
  const pan = useGridState((s) => s.pan);
  const zoom = useGridState((s) => s.zoom);
  const baseUnit = useGridState((s) => s.baseUnit);
  const screenWidth = useGridState((s) => s.screenWidth);
  const screenHeight = useGridState((s) => s.screenHeight);
  const showLeftAxis = useGridState((s) => s.showLeftAxis);
  const showRightAxis = useGridState((s) => s.showRightAxis);
  const showBottomAxis = useGridState((s) => s.showBottomAxis);
  const priceCeiling = useGridState((s) => s.priceCeiling);
  const highestPrice = useGridState((s) => s.highestPrice);
  const setPan = useGridState((s) => s.setPan);
  const jumpToLatest = useGridState((s) => s.jumpToLatest);

  const streamRef = useRef<HTMLDivElement | null>(null);
  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const initialPanXRef = useRef(0);

  const [hoverInfo, setHoverInfo] = useState<{ x: number; text: string } | null>(null);

  const totalCandles = candles.length;
  const hasData = totalCandles > 1;

  // Geometry calculations
  const leftOffset = showLeftAxis ? 84 : 0;
  const rightOffset = showRightAxis ? 88 : 0;
  const actualWidth = (screenWidth || (typeof window !== "undefined" ? window.innerWidth : 1440)) - leftOffset - rightOffset;

  const firstCandle = hasData ? candles[0] : null;
  const lastCandle = hasData ? candles[candles.length - 1] : null;

  const minCol = firstCandle ? firstCandle.gridCol : 0;
  const maxCol = lastCandle ? lastCandle.gridCol : 1;
  const totalColSpan = Math.max(1, maxCol - minCol);

  // Calculate visible column bounds on screen
  const visibleLeftWorldX = -pan.x + leftOffset;
  const visibleRightWorldX = -pan.x + (screenWidth || (typeof window !== "undefined" ? window.innerWidth : 1440)) - rightOffset;

  const visibleLeftCol = visibleLeftWorldX / (baseUnit * zoom);
  const visibleRightCol = visibleRightWorldX / (baseUnit * zoom);

  // Normalized fractions [0, 1] along the river stream
  const rawLeftFrac = (visibleLeftCol - minCol) / totalColSpan;
  const rawRightFrac = (visibleRightCol - minCol) / totalColSpan;

  const leftFrac = Math.max(0, Math.min(0.99, rawLeftFrac));
  const rightFrac = Math.max(0.01, Math.min(1.0, rawRightFrac));
  const widthFrac = Math.max(0.015, Math.min(1.0 - leftFrac, rightFrac - leftFrac));

  // Is viewing window at the latest right edge?
  const isAtLatestEdge = rightFrac >= 0.96;

  // Downsample candles for the lightweight river sparkline silhouette (max ~180 points)
  const riverPoints = useMemo(() => {
    if (!hasData) return "";
    const sampleTarget = 180;
    const step = Math.max(1, Math.floor(candles.length / sampleTarget));
    let minP = Infinity;
    let maxP = -Infinity;

    for (let i = 0; i < candles.length; i += step) {
      const c = candles[i];
      if (c.low < minP) minP = c.low;
      if (c.high > maxP) maxP = c.high;
    }
    const effMax = priceCeiling > 0 ? priceCeiling : maxP * 1.10;
    const pRange = Math.max(1, effMax - minP);

    const pts: string[] = [];
    for (let i = 0; i < candles.length; i += step) {
      const c = candles[i];
      const xFrac = (c.gridCol - minCol) / totalColSpan;
      // y from bottom (1.0) to top (0.0), with headroom up to effMax
      const yFrac = 1.0 - Math.max(0, Math.min(1, (c.close - minP) / pRange));
      pts.push(`${(xFrac * 100).toFixed(2)},${(yFrac * 20 + 2).toFixed(1)}`);
    }

    return pts.join(" ");
  }, [candles, hasData, minCol, totalColSpan, priceCeiling]);

  // Jump viewport so target fraction is centered
  const jumpToFraction = useCallback(
    (frac: number) => {
      if (!hasData) return;
      const targetCol = minCol + frac * totalColSpan;
      const targetPanX = Math.round(leftOffset + actualWidth / 2 - targetCol * baseUnit * zoom);
      setPan({ x: targetPanX, y: pan.y });
    },
    [hasData, minCol, totalColSpan, screenWidth, leftOffset, actualWidth, baseUnit, zoom, setPan, pan.y]
  );

  // Handle click on the river stream to jump
  const handleStreamClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isDraggingRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickFrac = Math.max(0, Math.min(1, clickX / rect.width));
    jumpToFraction(clickFrac);
  };

  // Dragging the inspection viewport window
  const handleDragStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    isDraggingRef.current = true;
    dragStartXRef.current = e.clientX;
    initialPanXRef.current = pan.x;

    const handleMouseMove = (ev: MouseEvent) => {
      if (!isDraggingRef.current || !streamRef.current) return;
      const streamWidth = streamRef.current.clientWidth || 1000;
      const deltaScreenX = ev.clientX - dragStartXRef.current;
      const deltaFrac = deltaScreenX / streamWidth;
      const deltaCol = deltaFrac * totalColSpan;
      const deltaWorldX = deltaCol * baseUnit * zoom;
      const newPanX = Math.round(initialPanXRef.current - deltaWorldX);
      setPan({ x: newPanX, y: pan.y });
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const handleStreamMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!hasData) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const hoverX = e.clientX - rect.left;
    const frac = Math.max(0, Math.min(1, hoverX / rect.width));
    const candleIdx = Math.min(totalCandles - 1, Math.max(0, Math.floor(frac * totalCandles)));
    const candle = candles[candleIdx];
    if (candle) {
      setHoverInfo({
        x: hoverX,
        text: `${candle.timestamp} | \u20B9${candle.close.toLocaleString("en-IN")}`,
      });
    }
  };

  const handleStreamMouseLeave = () => {
    setHoverInfo(null);
  };

  if (!hasData) {
    return (
      <div
        style={{
          position: "absolute",
          bottom: showBottomAxis ? 32 : 0,
          left: leftOffset,
          right: rightOffset,
          height: 24,
          backgroundColor: "rgba(240, 245, 242, 0.90)",
          borderTop: "1px solid rgba(74, 120, 102, 0.35)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "'Courier New', Courier, monospace",
          fontSize: "10px",
          color: "rgba(74, 120, 102, 0.65)",
          zIndex: 42,
          pointerEvents: "none",
        }}
      >
        <span>🌊 Water-Flow Stream — Awaiting market series data...</span>
      </div>
    );
  }

  return (
    <div
      ref={streamRef}
      onClick={handleStreamClick}
      onMouseMove={handleStreamMouseMove}
      onMouseLeave={handleStreamMouseLeave}
      style={{
        position: "absolute",
        bottom: showBottomAxis ? 32 : 0,
        left: leftOffset,
        right: rightOffset,
        height: 24,
        backgroundColor: "rgba(238, 246, 242, 0.95)",
        borderTop: "1px solid rgba(74, 120, 102, 0.45)",
        borderBottom: "1px solid rgba(74, 120, 102, 0.30)",
        display: "flex",
        alignItems: "center",
        zIndex: 42,
        cursor: "pointer",
        userSelect: "none",
        overflow: "hidden",
      }}
      title="Water-Flow Viewport Stream: Click anywhere to jump across time, or drag the highlighted viewing window"
    >
      {/* Background Water-Flow SVG River Silhouette */}
      <svg
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
        }}
        preserveAspectRatio="none"
        viewBox="0 0 100 24"
      >
        <defs>
          <linearGradient id="waterFlowGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#81C784" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#2E7D32" stopOpacity="0.10" />
          </linearGradient>
        </defs>

        {riverPoints && (
          <>
            {/* Shaded water channel body */}
            <polygon
              points={`0,24 ${riverPoints} 100,24`}
              fill="url(#waterFlowGrad)"
            />
            {/* Upper water surface profile */}
            <polyline
              points={riverPoints}
              fill="none"
              stroke="#2E7D32"
              strokeWidth="0.8"
              strokeOpacity="0.65"
            />
          </>
        )}
      </svg>

      {/* Historical Stream Origin Marker (Left) */}
      <div
        style={{
          position: "absolute",
          left: 8,
          fontSize: "9px",
          fontFamily: "'Courier New', Courier, monospace",
          color: "#2C3E35",
          fontWeight: "bold",
          backgroundColor: "rgba(247, 246, 240, 0.85)",
          padding: "1px 5px",
          borderRadius: 3,
          border: "1px solid rgba(74, 120, 102, 0.35)",
          pointerEvents: "none",
          zIndex: 2,
          display: "flex",
          alignItems: "center",
          gap: "4px",
        }}
      >
        <span>🌊 HEADWATERS:</span>
        <span style={{ color: "#1B5E20" }}>{firstCandle?.timestamp}</span>
      </div>

      {/* Dynamic Upper Ceiling Readout Tag (Center-Left) */}
      {priceCeiling > 0 && (
        <div
          style={{
            position: "absolute",
            left: 210,
            fontSize: "9px",
            fontFamily: "'Courier New', Courier, monospace",
            color: "#B71C1C",
            fontWeight: "bold",
            backgroundColor: "rgba(255, 245, 245, 0.90)",
            padding: "1px 6px",
            borderRadius: 3,
            border: "1px solid rgba(180, 50, 40, 0.35)",
            pointerEvents: "none",
            zIndex: 2,
            display: "flex",
            alignItems: "center",
            gap: "3px",
          }}
          title={`Dynamic Upper Ceiling is set at +10% headroom above highest price (\u20B9${(highestPrice || 0).toLocaleString("en-IN")})`}
        >
          <span>▲ CEILING (+10%):</span>
          <span>\u20B9{priceCeiling.toLocaleString("en-IN")}</span>
        </div>
      )}

      {/* Interactive Active Viewing Window (Inspection Raft) */}
      <div
        onMouseDown={handleDragStart}
        style={{
          position: "absolute",
          top: 1,
          bottom: 1,
          left: `${leftFrac * 100}%`,
          width: `${widthFrac * 100}%`,
          minWidth: 16,
          backgroundColor: "rgba(46, 125, 50, 0.22)",
          border: "1.5px solid #1B5E20",
          borderRadius: 3,
          boxShadow: "0 0 4px rgba(27, 94, 32, 0.35)",
          cursor: "grab",
          zIndex: 5,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 2px",
        }}
        title="Active Viewport Window — Drag to pan smoothly through time"
      >
        {/* Left Grip Handle */}
        <div
          style={{
            width: 3,
            height: 12,
            backgroundColor: "#1B5E20",
            borderRadius: 1,
            opacity: 0.75,
          }}
        />
        {/* Center Tag (visible if window is wide enough) */}
        {widthFrac > 0.08 && (
          <span
            style={{
              fontSize: "8px",
              fontFamily: "'Courier New', Courier, monospace",
              color: "#1B5E20",
              fontWeight: "bold",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              pointerEvents: "none",
            }}
          >
            VIEWPORT
          </span>
        )}
        {/* Right Grip Handle */}
        <div
          style={{
            width: 3,
            height: 12,
            backgroundColor: "#1B5E20",
            borderRadius: 1,
            opacity: 0.75,
          }}
        />
      </div>

      {/* Stream Mouth / Live Edge Status or Jump Button (Right) */}
      <div
        style={{
          position: "absolute",
          right: 8,
          zIndex: 6,
          display: "flex",
          alignItems: "center",
          gap: "6px",
        }}
      >
        {isAtLatestEdge ? (
          <div
            style={{
              fontSize: "9px",
              fontFamily: "'Courier New', Courier, monospace",
              color: "#1B5E20",
              backgroundColor: "rgba(232, 245, 233, 0.95)",
              padding: "2px 7px",
              borderRadius: 3,
              border: "1px solid rgba(46, 125, 50, 0.40)",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              fontWeight: "bold",
              pointerEvents: "none",
            }}
          >
            <span
              style={{
                display: "inline-block",
                width: 6,
                height: 6,
                borderRadius: "50%",
                backgroundColor: "#2E7D32",
                boxShadow: "0 0 4px #2E7D32",
              }}
            />
            <span>● LIVE EDGE ({lastCandle?.timestamp})</span>
          </div>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              jumpToLatest(screenWidth, screenHeight);
            }}
            style={{
              fontSize: "9px",
              fontFamily: "'Courier New', Courier, monospace",
              color: "#FFFFFF",
              backgroundColor: "#1B5E20",
              border: "1px solid #0D3311",
              padding: "2px 8px",
              borderRadius: 3,
              cursor: "pointer",
              fontWeight: "bold",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
            }}
            title="Jump viewport to the latest trading bar at the edge of the river stream"
          >
            <span>⏩ RETURN TO LATEST EDGE</span>
            <span style={{ opacity: 0.85 }}>({lastCandle?.timestamp})</span>
          </button>
        )}
      </div>

      {/* Hover Tooltip Indicator */}
      {hoverInfo && (
        <div
          style={{
            position: "absolute",
            bottom: 26,
            left: Math.max(10, Math.min(actualWidth - 160, hoverInfo.x - 70)),
            backgroundColor: "rgba(33, 33, 33, 0.92)",
            color: "#FFFFFF",
            fontFamily: "'Courier New', Courier, monospace",
            fontSize: "9px",
            padding: "2px 6px",
            borderRadius: 3,
            pointerEvents: "none",
            whiteSpace: "nowrap",
            zIndex: 10,
            boxShadow: "0 2px 6px rgba(0,0,0,0.20)",
          }}
        >
          {hoverInfo.text}
        </div>
      )}
    </div>
  );
};
