import React, { useEffect, useRef, useCallback } from "react";
import { useGridState } from "../store/useGridState";
import { GridTheme } from "../types/gann";

// Classic drafting room color palette for Keuffel & Esser 8x8 engineering vellum
const DRAFTING_THEME: GridTheme = {
  paperBackground: "#F7F6F0",           // Vintage warm off-white parchment
  majorGridLine: "rgba(74, 120, 102, 0.60)", // Heavy faded drafting green (1 inch = 96px)
  minorGridLine: "rgba(74, 120, 102, 0.20)", // Light faded drafting green (1/8 inch = 12px)
  axisLine: "rgba(42, 75, 62, 0.85)",        // Bold Cartesian axis line
  swingStepStroke: "#8B1E1E",                 // Traditional crimson drafting ink for swings
  swingStepFill: "rgba(139, 30, 30, 0.12)",
  cursorHighlight: "rgba(33, 115, 70, 0.35)",
  bullishCandle: "#2E7D32",                   // Emerald Bull
  bullishCandleFill: "#E8F5E9",
  bearishCandle: "#C62828",                   // Crimson Bear
  bearishCandleFill: "#C62828",
  wickColor: "#1E2A24",
  volumeBull: "rgba(46, 125, 50, 0.30)",
  volumeBear: "rgba(198, 40, 40, 0.30)",
};

interface GannCanvasProps {
  showGannRay45?: boolean;
}

export const GannCanvas: React.FC<GannCanvasProps> = ({
  showGannRay45 = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Subscribe to Zustand state
  const {
    pan,
    zoom,
    baseUnit,
    majorUnit,
    subdivisions,
    chartMode,
    showPatterns,
    showVolumeBars,
    candles,
    swingPoints,
    basePrice,
    pricePerUnit,
    panBy,
    zoomAt,
    updateCursor,
    setHovered,
    screenToWorld,
    worldToScreen,
    priceToWorldY,
    worldYToPrice,
  } = useGridState();

  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const animationFrameRef = useRef<number | null>(null);

  /**
   * Primary Render Pipeline:
   * Strictly 1:1 Aspect Ratio Geometric Canvas
   */
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;

    // Reset transform & clear to vintage off-white paper
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = DRAFTING_THEME.paperBackground;
    ctx.fillRect(0, 0, width, height);

    const scaledBase = baseUnit * zoom;

    // Calculate visible Cartesian bounds in world units
    const topLeftWorld = screenToWorld(0, 0);
    const bottomRightWorld = screenToWorld(width, height);

    const minWorldX = Math.min(topLeftWorld.x, bottomRightWorld.x);
    const maxWorldX = Math.max(topLeftWorld.x, bottomRightWorld.x);
    const minWorldY = Math.min(topLeftWorld.y, bottomRightWorld.y);
    const maxWorldY = Math.max(topLeftWorld.y, bottomRightWorld.y);

    const startCol = Math.floor(minWorldX / baseUnit) - 1;
    const endCol = Math.ceil(maxWorldX / baseUnit) + 1;
    const startRow = Math.floor(minWorldY / baseUnit) - 1;
    const endRow = Math.ceil(maxWorldY / baseUnit) + 1;

    // -------------------------------------------------------------
    // 1. MINOR GRID LINES (1/8th inch, baseUnit = 12px)
    // -------------------------------------------------------------
    ctx.lineWidth = 1;
    ctx.strokeStyle = DRAFTING_THEME.minorGridLine;
    ctx.beginPath();

    for (let col = startCol; col <= endCol; col++) {
      if (col % subdivisions !== 0) {
        const screenX = Math.round(pan.x + col * scaledBase) + 0.5;
        ctx.moveTo(screenX, 0);
        ctx.lineTo(screenX, height);
      }
    }

    for (let row = startRow; row <= endRow; row++) {
      if (row % subdivisions !== 0) {
        const screenY = Math.round(pan.y - row * scaledBase) + 0.5;
        ctx.moveTo(0, screenY);
        ctx.lineTo(width, screenY);
      }
    }
    ctx.stroke();

    // -------------------------------------------------------------
    // 2. MAJOR GRID LINES (1 inch, majorUnit = 96px, 8x8 blocks)
    // -------------------------------------------------------------
    ctx.lineWidth = 1.25;
    ctx.strokeStyle = DRAFTING_THEME.majorGridLine;
    ctx.beginPath();

    for (let col = startCol; col <= endCol; col++) {
      if (col % subdivisions === 0 && col !== 0) {
        const screenX = Math.round(pan.x + col * scaledBase) + 0.5;
        ctx.moveTo(screenX, 0);
        ctx.lineTo(screenX, height);
      }
    }

    for (let row = startRow; row <= endRow; row++) {
      if (row % subdivisions === 0 && row !== 0) {
        const screenY = Math.round(pan.y - row * scaledBase) + 0.5;
        ctx.moveTo(0, screenY);
        ctx.lineTo(width, screenY);
      }
    }
    ctx.stroke();

    // -------------------------------------------------------------
    // 3. CARTESIAN ZERO-AXES (X = 0 Time, Y = 0 Price)
    // -------------------------------------------------------------
    ctx.lineWidth = 2.0;
    ctx.strokeStyle = DRAFTING_THEME.axisLine;
    ctx.beginPath();

    const axisY = Math.round(pan.y) + 0.5;
    if (axisY >= 0 && axisY <= height) {
      ctx.moveTo(0, axisY);
      ctx.lineTo(width, axisY);
    }

    const axisX = Math.round(pan.x) + 0.5;
    if (axisX >= 0 && axisX <= width) {
      ctx.moveTo(axisX, 0);
      ctx.lineTo(axisX, height);
    }
    ctx.stroke();

    // Origin Circle Indicator
    if (axisX >= -20 && axisX <= width + 20 && axisY >= -20 && axisY <= height + 20) {
      ctx.fillStyle = DRAFTING_THEME.axisLine;
      ctx.beginPath();
      ctx.arc(axisX, axisY, 3.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(42, 75, 62, 0.75)";
      ctx.font = "bold 10px 'Courier New', monospace";
      ctx.fillText(`0,0 (BASE ₹${basePrice})`, axisX + 7, axisY - 6);
    }

    // -------------------------------------------------------------
    // 4. GANN 1x1 (45-DEGREE) TRUE DIAGONAL RAY
    // -------------------------------------------------------------
    if (showGannRay45) {
      ctx.save();
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 3]);
      ctx.strokeStyle = "rgba(180, 80, 50, 0.70)";

      const rayStartScreen = worldToScreen(0, 0);
      const maxExtent = 5000;
      const rayEndScreen = worldToScreen(maxExtent, maxExtent);

      ctx.beginPath();
      ctx.moveTo(rayStartScreen.x, rayStartScreen.y);
      ctx.lineTo(rayEndScreen.x, rayEndScreen.y);
      ctx.stroke();

      const labelWorldCoord = 24 * baseUnit;
      const labelScreen = worldToScreen(labelWorldCoord, labelWorldCoord);
      if (
        labelScreen.x >= 0 &&
        labelScreen.x <= width &&
        labelScreen.y >= 0 &&
        labelScreen.y <= height
      ) {
        ctx.fillStyle = "rgba(180, 80, 50, 0.90)";
        ctx.font = "bold 11px 'Courier New', monospace";
        ctx.fillText("1x1 (45° TRUE HARMONIC)", labelScreen.x + 8, labelScreen.y - 8);
      }
      ctx.restore();
    }

    // -------------------------------------------------------------
    // 5. VOLUME HISTOGRAM BARS (DRAFTING BASELINE)
    // -------------------------------------------------------------
    if (showVolumeBars && candles.length > 0) {
      ctx.save();
      const maxVol = Math.max(...candles.map((c) => c.volume), 1);
      const volumeChartHeight = 65;
      const volumeBaseY = height - 18;

      candles.forEach((c) => {
        const colWorldX = c.gridCol * baseUnit;
        const colScreenX = worldToScreen(colWorldX, 0).x;
        const barWidth = Math.max(3, scaledBase * 0.7);
        const barHeight = (c.volume / maxVol) * volumeChartHeight;
        const isBull = c.close >= c.open;

        ctx.fillStyle = isBull ? DRAFTING_THEME.volumeBull : DRAFTING_THEME.volumeBear;
        ctx.fillRect(
          colScreenX - barWidth / 2,
          volumeBaseY - barHeight,
          barWidth,
          barHeight
        );
        ctx.strokeStyle = isBull ? "rgba(46, 125, 50, 0.6)" : "rgba(198, 40, 40, 0.6)";
        ctx.lineWidth = 0.8;
        ctx.strokeRect(
          colScreenX - barWidth / 2,
          volumeBaseY - barHeight,
          barWidth,
          barHeight
        );
      });

      ctx.fillStyle = "rgba(74, 120, 102, 0.70)";
      ctx.font = "9px 'Courier New', monospace";
      ctx.fillText("VOLUME HISTOGRAM", 20, volumeBaseY - volumeChartHeight - 4);
      ctx.restore();
    }

    // -------------------------------------------------------------
    // 6. JAPANESE CANDLESTICK RENDERING
    // -------------------------------------------------------------
    if (
      (chartMode === "CANDLESTICK" || chartMode === "HYBRID_CANDLE_SWING") &&
      candles.length > 0
    ) {
      ctx.save();
      const candleBodyWidth = Math.max(4, scaledBase * 0.72);

      candles.forEach((c) => {
        const colWorldX = c.gridCol * baseUnit;
        const screenColX = worldToScreen(colWorldX, 0).x;

        // Skip off-screen candles
        if (screenColX < -60 || screenColX > width + 60) return;

        const openWorldY = priceToWorldY(c.open);
        const highWorldY = priceToWorldY(c.high);
        const lowWorldY = priceToWorldY(c.low);
        const closeWorldY = priceToWorldY(c.close);

        const openScreenY = worldToScreen(0, openWorldY).y;
        const highScreenY = worldToScreen(0, highWorldY).y;
        const lowScreenY = worldToScreen(0, lowWorldY).y;
        const closeScreenY = worldToScreen(0, closeWorldY).y;

        const isBull = c.close >= c.open;
        const topBodyY = Math.min(openScreenY, closeScreenY);
        const bodyHeight = Math.max(2, Math.abs(closeScreenY - openScreenY));

        // Draw Candle Wick (Upper & Lower)
        ctx.strokeStyle = DRAFTING_THEME.wickColor;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(Math.round(screenColX) + 0.5, Math.round(highScreenY));
        ctx.lineTo(Math.round(screenColX) + 0.5, Math.round(lowScreenY));
        ctx.stroke();

        // Draw Real Body Rectangle
        const bodyLeft = Math.round(screenColX - candleBodyWidth / 2);

        if (isBull) {
          ctx.fillStyle = DRAFTING_THEME.bullishCandleFill;
          ctx.strokeStyle = DRAFTING_THEME.bullishCandle;
          ctx.lineWidth = 1.5;
          ctx.fillRect(bodyLeft, topBodyY, candleBodyWidth, bodyHeight);
          ctx.strokeRect(bodyLeft, topBodyY, candleBodyWidth, bodyHeight);
        } else {
          ctx.fillStyle = DRAFTING_THEME.bearishCandleFill;
          ctx.strokeStyle = DRAFTING_THEME.bearishCandle;
          ctx.lineWidth = 1.5;
          ctx.fillRect(bodyLeft, topBodyY, candleBodyWidth, bodyHeight);
          ctx.strokeRect(bodyLeft, topBodyY, candleBodyWidth, bodyHeight);
        }

        // ---------------------------------------------------------
        // CANDLESTICK PATTERN BADGES & ANNOTATIONS
        // ---------------------------------------------------------
        if (showPatterns && c.pattern) {
          const isBearishPattern = c.patternType === "BEARISH";
          const tagY = isBearishPattern ? highScreenY - 14 : lowScreenY + 18;

          ctx.save();
          ctx.font = "bold 9px 'Courier New', monospace";
          const textMetrics = ctx.measureText(c.pattern);
          const badgeWidth = textMetrics.width + 10;
          const badgeHeight = 15;
          const badgeX = screenColX - badgeWidth / 2;

          // Pill Background
          ctx.fillStyle =
            c.patternType === "BULLISH"
              ? "rgba(46, 125, 50, 0.90)"
              : c.patternType === "BEARISH"
              ? "rgba(198, 40, 40, 0.90)"
              : "rgba(55, 71, 79, 0.85)";

          ctx.beginPath();
          ctx.roundRect(badgeX, tagY - 11, badgeWidth, badgeHeight, 3);
          ctx.fill();

          // Pill Text
          ctx.fillStyle = "#FFFFFF";
          ctx.fillText(c.pattern, badgeX + 5, tagY);

          // Indicator pointer line connecting badge to extreme wick
          ctx.strokeStyle = ctx.fillStyle;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(screenColX, isBearishPattern ? highScreenY : lowScreenY);
          ctx.lineTo(screenColX, isBearishPattern ? tagY + 4 : tagY - 11);
          ctx.stroke();

          ctx.restore();
        }
      });
      ctx.restore();
    }

    // -------------------------------------------------------------
    // 7. WESTERN OHLC BAR GRAPH RENDERING
    // -------------------------------------------------------------
    if (chartMode === "OHLC_BAR" && candles.length > 0) {
      ctx.save();
      const tickWidth = Math.max(3, scaledBase * 0.42);

      candles.forEach((c) => {
        const colWorldX = c.gridCol * baseUnit;
        const screenColX = Math.round(worldToScreen(colWorldX, 0).x) + 0.5;

        if (screenColX < -50 || screenColX > width + 50) return;

        const openScreenY = Math.round(worldToScreen(0, priceToWorldY(c.open)).y) + 0.5;
        const highScreenY = Math.round(worldToScreen(0, priceToWorldY(c.high)).y) + 0.5;
        const lowScreenY = Math.round(worldToScreen(0, priceToWorldY(c.low)).y) + 0.5;
        const closeScreenY = Math.round(worldToScreen(0, priceToWorldY(c.close)).y) + 0.5;

        const isBull = c.close >= c.open;
        ctx.strokeStyle = isBull ? DRAFTING_THEME.bullishCandle : DRAFTING_THEME.bearishCandle;
        ctx.lineWidth = 1.8;

        // 1. High-Low Central Spine
        ctx.beginPath();
        ctx.moveTo(screenColX, highScreenY);
        ctx.lineTo(screenColX, lowScreenY);
        ctx.stroke();

        // 2. Open Tick (Extends to Left)
        ctx.beginPath();
        ctx.moveTo(screenColX - tickWidth, openScreenY);
        ctx.lineTo(screenColX, openScreenY);
        ctx.stroke();

        // 3. Close Tick (Extends to Right)
        ctx.beginPath();
        ctx.moveTo(screenColX, closeScreenY);
        ctx.lineTo(screenColX + tickWidth, closeScreenY);
        ctx.stroke();

        // Pattern Tag
        if (showPatterns && c.pattern) {
          ctx.save();
          ctx.font = "bold 9px 'Courier New', monospace";
          ctx.fillStyle = isBull ? "#2E7D32" : "#C62828";
          const tagY = c.patternType === "BEARISH" ? highScreenY - 8 : lowScreenY + 14;
          ctx.fillText(c.pattern, screenColX + 6, tagY);
          ctx.restore();
        }
      });
      ctx.restore();
    }

    // -------------------------------------------------------------
    // 8. GANN RIGHT-ANGLE "SWING STEPS" PLOTTING
    // Rendered in SWING_STEP mode OR superimposed in HYBRID mode
    // -------------------------------------------------------------
    if (
      (chartMode === "SWING_STEP" || chartMode === "HYBRID_CANDLE_SWING") &&
      swingPoints.length > 0
    ) {
      ctx.save();
      ctx.lineWidth = chartMode === "HYBRID_CANDLE_SWING" ? 2.8 : 2.5;
      ctx.strokeStyle =
        chartMode === "HYBRID_CANDLE_SWING"
          ? "rgba(139, 30, 30, 0.88)"
          : DRAFTING_THEME.swingStepStroke;
      ctx.lineJoin = "miter";
      ctx.lineCap = "square";
      ctx.beginPath();

      const firstPoint = swingPoints[0];
      let currScreen = worldToScreen(firstPoint.gridCol * baseUnit, firstPoint.gridRow * baseUnit);
      ctx.moveTo(currScreen.x, currScreen.y);

      for (let i = 1; i < swingPoints.length; i++) {
        const nextPoint = swingPoints[i];
        const nextWorldX = nextPoint.gridCol * baseUnit;
        const nextWorldY = nextPoint.gridRow * baseUnit;

        // Step 1: Advance horizontally to new time node
        const cornerScreen = worldToScreen(nextWorldX, swingPoints[i - 1].gridRow * baseUnit);
        ctx.lineTo(cornerScreen.x, cornerScreen.y);

        // Step 2: Step vertically to new price level
        const nextScreen = worldToScreen(nextWorldX, nextWorldY);
        ctx.lineTo(nextScreen.x, nextScreen.y);

        currScreen = nextScreen;
      }
      ctx.stroke();

      // Swing Vertex Nodes
      swingPoints.forEach((pt) => {
        const sPos = worldToScreen(pt.gridCol * baseUnit, pt.gridRow * baseUnit);

        if (sPos.x < -50 || sPos.x > width + 50 || sPos.y < -50 || sPos.y > height + 50) {
          return;
        }

        const nodeSize = 6;
        ctx.fillStyle = pt.type === "SWING_HIGH" ? "#2E7D32" : "#C62828";
        ctx.fillRect(sPos.x - nodeSize / 2, sPos.y - nodeSize / 2, nodeSize, nodeSize);
        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = 1;
        ctx.strokeRect(sPos.x - nodeSize / 2, sPos.y - nodeSize / 2, nodeSize, nodeSize);

        if (chartMode === "SWING_STEP") {
          ctx.fillStyle = "#1E2A24";
          ctx.font = "600 10px 'Courier New', monospace";
          const tag = `[${pt.gridCol},${pt.gridRow}] ₹${pt.price.toLocaleString("en-IN")}`;
          const offsetY = pt.type === "SWING_HIGH" ? -10 : 16;
          ctx.fillText(tag, sPos.x + 8, sPos.y + offsetY);
        }
      });

      ctx.restore();
    }

    // -------------------------------------------------------------
    // 9. PRICE Y-AXIS & TIME X-AXIS RULER READOUTS
    // -------------------------------------------------------------
    ctx.save();
    ctx.fillStyle = "rgba(74, 120, 102, 0.85)";
    ctx.font = "bold 9px 'Courier New', monospace";

    // Row markers: Price values at every major block (1 inch = 8 subdivisions)
    for (let row = startRow; row <= endRow; row++) {
      if (row % subdivisions === 0) {
        const screenY = Math.round(pan.y - row * scaledBase);
        const priceVal = basePrice + row * pricePerUnit;
        if (screenY >= 20 && screenY <= height - 20) {
          ctx.fillText(`₹${priceVal.toFixed(0)} (${row / subdivisions}")`, 8, screenY - 3);
        }
      }
    }

    // Column markers (Inches & Dates)
    for (let col = startCol; col <= endCol; col++) {
      if (col % subdivisions === 0) {
        const screenX = Math.round(pan.x + col * scaledBase);
        const inchIndex = col / subdivisions;
        if (screenX >= 20 && screenX <= width - 20) {
          ctx.fillText(`${inchIndex}"`, screenX + 3, height - 8);
        }
      }
    }
    ctx.restore();
  }, [
    pan,
    zoom,
    baseUnit,
    majorUnit,
    subdivisions,
    chartMode,
    showPatterns,
    showVolumeBars,
    candles,
    swingPoints,
    basePrice,
    pricePerUnit,
    showGannRay45,
    screenToWorld,
    worldToScreen,
    priceToWorldY,
  ]);

  // Request Animation Frame sync
  useEffect(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    animationFrameRef.current = requestAnimationFrame(render);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [render]);

  // Window resize listener
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleResize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();

      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      render();
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [render]);

  /**
   * KEYBOARD ARROW KEY NAVIGATION:
   * Mathematically aligned to K&E Grid (48px / 96px majorUnit increments)
   */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is focusing an input field
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        return;
      }

      // Step Math: 48px (1/2 inch = 4 minor units), Shift+Arrow = 96px (1 full inch = 8 minor units)
      const stepDistance = e.shiftKey ? majorUnit : majorUnit / 2;

      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          panBy(0, stepDistance);
          break;
        case "ArrowDown":
          e.preventDefault();
          panBy(0, -stepDistance);
          break;
        case "ArrowLeft":
          e.preventDefault();
          panBy(stepDistance, 0);
          break;
        case "ArrowRight":
          e.preventDefault();
          panBy(-stepDistance, 0);
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown, { passive: false });
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [panBy, majorUnit]);

  /**
   * MOUSE HANDLERS: Infinite Panning & Cursor-Centered Zooming
   */
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 0 || e.button === 1) {
      isDraggingRef.current = true;
      dragStartRef.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    updateCursor(screenX, screenY);

    if (isDraggingRef.current) {
      const deltaX = e.clientX - dragStartRef.current.x;
      const deltaY = e.clientY - dragStartRef.current.y;
      dragStartRef.current = { x: e.clientX, y: e.clientY };

      panBy(deltaX, deltaY);
    }
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  const handleMouseEnter = () => {
    setHovered(true);
  };

  const handleMouseLeave = () => {
    isDraggingRef.current = false;
    setHovered(false);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;

    const zoomMultiplier = e.deltaY < 0 ? 1.08 : 0.92;
    zoomAt(cursorX, cursorY, zoomMultiplier);
  };

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        backgroundColor: DRAFTING_THEME.paperBackground,
        cursor: isDraggingRef.current ? "grabbing" : "crosshair",
      }}
    >
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onWheel={handleWheel}
        style={{
          width: "100%",
          height: "100%",
          display: "block",
        }}
      />
    </div>
  );
};
