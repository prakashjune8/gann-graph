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

interface DirtyRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const GannCanvas: React.FC<GannCanvasProps> = ({
  showGannRay45 = true,
}) => {
  // Multi-Canvas 4-Tier Layer Refs (Audits 4.1, 4.2 & 4.3 Architecture)
  const gridCanvasRef = useRef<HTMLCanvasElement | null>(null);       // Layer 1 (z-index: 10): Grid Pattern & Zero Axes
  const chartCanvasRef = useRef<HTMLCanvasElement | null>(null);      // Layer 2 (z-index: 20): Candlesticks, Volume, Swings
  const rulerCanvasRef = useRef<HTMLCanvasElement | null>(null);      // Layer 3 (z-index: 25): Static 4-Sided Axis Tracks & Junctions
  const crosshairCanvasRef = useRef<HTMLCanvasElement | null>(null);  // Layer 4 (z-index: 30): Precision Crosshair (Dirty-Rect)

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
    showTopAxis,
    showBottomAxis,
    showLeftAxis,
    showRightAxis,
    isAxisTransparent,
    showCrosshair,
    isHovered,
    cursorGrid,
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
  } = useGridState();

  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  // Animation Frame Schedulers
  const animFrameGridRef = useRef<number | null>(null);
  const animFrameChartRef = useRef<number | null>(null);
  const animFrameRulerRef = useRef<number | null>(null);
  const animFrameCrosshairRef = useRef<number | null>(null);

  // Master Offscreen Canvas Pattern Tile for K&E 8x8 Grid (Audit 4.1 Optimization)
  const tileCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cachedZoomRef = useRef<number>(-1);

  // Dirty-Rectangle Tracker for Crosshair Layer (Audit 4.2 & 4.3 Optimization)
  const prevDirtyRectsRef = useRef<DirtyRect[] | null>(null);
  const prevPanZoomRef = useRef<{ panX: number; panY: number; zoom: number }>({
    panX: pan.x,
    panY: pan.y,
    zoom,
  });

  /**
   * Generates or reuses an Offscreen Master Tile for the K&E 8x8 Grid.
   * Crucial: Re-renders ONLY when zoom scale changes, NOT on pan.
   */
  const getGridTile = useCallback(
    (currentZoom: number) => {
      let tile = tileCanvasRef.current;
      if (!tile) {
        tile = document.createElement("canvas");
        tileCanvasRef.current = tile;
      }

      if (cachedZoomRef.current === currentZoom && tile.width > 0) {
        return tile;
      }

      cachedZoomRef.current = currentZoom;
      const scaledMajor = majorUnit * currentZoom;
      const scaledMinor = baseUnit * currentZoom;

      const tw = Math.max(8, Math.round(scaledMajor));
      const th = Math.max(8, Math.round(scaledMajor));
      tile.width = tw;
      tile.height = th;

      const tCtx = tile.getContext("2d", { alpha: false });
      if (!tCtx) return tile;

      // 1. Vintage Paper Background
      tCtx.fillStyle = DRAFTING_THEME.paperBackground;
      tCtx.fillRect(0, 0, tw, th);

      // 2. Minor Grid Lines (interior 7 lines at 1/8th inch intervals)
      tCtx.lineWidth = 1;
      tCtx.strokeStyle = DRAFTING_THEME.minorGridLine;
      tCtx.beginPath();
      for (let i = 1; i < subdivisions; i++) {
        const pos = Math.round(i * scaledMinor) + 0.5;
        tCtx.moveTo(pos, 0);
        tCtx.lineTo(pos, th);
        tCtx.moveTo(0, pos);
        tCtx.lineTo(tw, pos);
      }
      tCtx.stroke();

      // 3. Major Grid Lines (1-inch outer grid lines)
      tCtx.lineWidth = 1.25;
      tCtx.strokeStyle = DRAFTING_THEME.majorGridLine;
      tCtx.beginPath();
      tCtx.moveTo(0.5, 0);
      tCtx.lineTo(0.5, th);
      tCtx.moveTo(0, 0.5);
      tCtx.lineTo(tw, 0.5);
      tCtx.stroke();

      return tile;
    },
    [majorUnit, baseUnit, subdivisions]
  );

  /**
   * LAYER 1 (z-index: 10): Background & K&E 8x8 Grid
   * Hardware-Accelerated Pattern Blitting (Audit 4.1 Resolution)
   * Redraws ONLY on pan/zoom.
   */
  const renderGrid = useCallback(() => {
    const canvas = gridCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 1. Hardware Pattern Blit via Offscreen Master Tile
    const tile = getGridTile(zoom);
    const pattern = ctx.createPattern(tile, "repeat");
    if (pattern) {
      if (pattern.setTransform) {
        const matrix = new DOMMatrix().translate(pan.x, pan.y);
        pattern.setTransform(matrix);
        ctx.fillStyle = pattern;
        ctx.fillRect(0, 0, width, height);
      } else {
        ctx.save();
        ctx.translate(pan.x, pan.y);
        ctx.fillStyle = pattern;
        ctx.fillRect(-pan.x, -pan.y, width, height);
        ctx.restore();
      }
    } else {
      ctx.fillStyle = DRAFTING_THEME.paperBackground;
      ctx.fillRect(0, 0, width, height);
    }

    // 2. Cartesian Zero-Axes (X = 0 Time, Y = 0 Price)
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
      ctx.fillText(`0,0 (BASE \u20B9${basePrice})`, axisX + 7, axisY - 6);
    }

    // 3. Gann 1x1 (45-Degree) True Diagonal Ray
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
        ctx.fillText("1x1 (45\u00B0 TRUE HARMONIC)", labelScreen.x + 8, labelScreen.y - 8);
      }
      ctx.restore();
    }
  }, [
    pan,
    zoom,
    basePrice,
    showGannRay45,
    worldToScreen,
    getGridTile,
    baseUnit,
  ]);

  /**
   * LAYER 2 (z-index: 20): Candlesticks, Volume Histogram, and Swing Steps
   * Only redraws on pan/zoom or dataset updates.
   */
  const renderChart = useCallback(() => {
    const canvas = chartCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const scaledBase = baseUnit * zoom;
    const leftRulerWidth = showLeftAxis ? 84 : 0;
    const rightRulerWidth = showRightAxis ? 88 : 0;
    const bottomRulerHeight = showBottomAxis ? 32 : 0;

    const mainLeft = leftRulerWidth;
    const mainRight = width - rightRulerWidth;
    const mainBottom = height - bottomRulerHeight;

    // 1. Volume Histogram Bars
    if (showVolumeBars && candles.length > 0) {
      ctx.save();
      const maxVol = Math.max(...candles.map((c) => c.volume), 1);
      const volumeChartHeight = 60;
      const volumeBaseY = mainBottom - 2;

      candles.forEach((c) => {
        const colWorldX = c.gridCol * baseUnit;
        const colScreenX = worldToScreen(colWorldX, 0).x;
        if (colScreenX < mainLeft || colScreenX > mainRight) return;

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
      ctx.fillText("VOLUME HISTOGRAM", mainLeft + 20, volumeBaseY - volumeChartHeight - 4);
      ctx.restore();
    }

    // 2. Japanese Candlesticks
    if (
      (chartMode === "CANDLESTICK" || chartMode === "HYBRID_CANDLE_SWING") &&
      candles.length > 0
    ) {
      ctx.save();
      const candleBodyWidth = Math.max(4, scaledBase * 0.72);

      candles.forEach((c) => {
        const colWorldX = c.gridCol * baseUnit;
        const screenColX = worldToScreen(colWorldX, 0).x;
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

        // Candle Wick
        ctx.strokeStyle = DRAFTING_THEME.wickColor;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(Math.round(screenColX) + 0.5, Math.round(highScreenY));
        ctx.lineTo(Math.round(screenColX) + 0.5, Math.round(lowScreenY));
        ctx.stroke();

        // Real Body
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

        // Pattern Badges
        if (showPatterns && c.pattern) {
          const isBearishPattern = c.patternType === "BEARISH";
          const tagY = isBearishPattern ? highScreenY - 14 : lowScreenY + 18;

          ctx.save();
          ctx.font = "bold 9px 'Courier New', monospace";
          const textMetrics = ctx.measureText(c.pattern);
          const badgeWidth = textMetrics.width + 10;
          const badgeHeight = 15;
          const badgeX = screenColX - badgeWidth / 2;

          ctx.fillStyle =
            c.patternType === "BULLISH"
              ? "rgba(46, 125, 50, 0.90)"
              : c.patternType === "BEARISH"
              ? "rgba(198, 40, 40, 0.90)"
              : "rgba(55, 71, 79, 0.85)";

          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(badgeX, tagY - 11, badgeWidth, badgeHeight, 3);
          else ctx.rect(badgeX, tagY - 11, badgeWidth, badgeHeight);
          ctx.fill();

          ctx.fillStyle = "#FFFFFF";
          ctx.fillText(c.pattern, badgeX + 5, tagY);

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

    // 3. Western OHLC Bar Graphs
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

        ctx.beginPath();
        ctx.moveTo(screenColX, highScreenY);
        ctx.lineTo(screenColX, lowScreenY);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(screenColX - tickWidth, openScreenY);
        ctx.lineTo(screenColX, openScreenY);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(screenColX, closeScreenY);
        ctx.lineTo(screenColX + tickWidth, closeScreenY);
        ctx.stroke();
      });
      ctx.restore();
    }

    // 4. Gann Right-Angle Swing Steps
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

        const cornerScreen = worldToScreen(nextWorldX, swingPoints[i - 1].gridRow * baseUnit);
        ctx.lineTo(cornerScreen.x, cornerScreen.y);

        const nextScreen = worldToScreen(nextWorldX, nextWorldY);
        ctx.lineTo(nextScreen.x, nextScreen.y);

        currScreen = nextScreen;
      }
      ctx.stroke();

      // Swing Vertex Nodes
      swingPoints.forEach((pt) => {
        const sPos = worldToScreen(pt.gridCol * baseUnit, pt.gridRow * baseUnit);
        if (sPos.x < -50 || sPos.x > width + 50 || sPos.y < -50 || sPos.y > height + 50) return;

        const nodeSize = 6;
        ctx.fillStyle = pt.type === "SWING_HIGH" ? "#2E7D32" : "#C62828";
        ctx.fillRect(sPos.x - nodeSize / 2, sPos.y - nodeSize / 2, nodeSize, nodeSize);
        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = 1;
        ctx.strokeRect(sPos.x - nodeSize / 2, sPos.y - nodeSize / 2, nodeSize, nodeSize);

        if (chartMode === "SWING_STEP") {
          ctx.fillStyle = "#1E2A24";
          ctx.font = "600 10px 'Courier New', monospace";
          const tag = `[${pt.gridCol},${pt.gridRow}] \u20B9${pt.price.toLocaleString("en-IN")}`;
          const offsetY = pt.type === "SWING_HIGH" ? -10 : 16;
          ctx.fillText(tag, sPos.x + 8, sPos.y + offsetY);
        }
      });
      ctx.restore();
    }
  }, [
    pan,
    zoom,
    baseUnit,
    chartMode,
    showPatterns,
    showVolumeBars,
    showLeftAxis,
    showRightAxis,
    showBottomAxis,
    candles,
    swingPoints,
    priceToWorldY,
    worldToScreen,
  ]);

  /**
   * LAYER 3 (z-index: 25): Static 4-Sided Axis Ruler Tracks & Corner Junctions
   * Completely isolated from mousemove events (Audits 4.2 & 4.3).
   * Redraws ONLY on pan/zoom or axis toggle operations.
   */
  const renderRulers = useCallback(() => {
    const canvas = rulerCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const scaledBase = baseUnit * zoom;
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

    const leftRulerWidth = showLeftAxis ? 84 : 0;
    const rightRulerWidth = showRightAxis ? 88 : 0;
    const topRulerHeight = showTopAxis ? 30 : 0;
    const bottomRulerHeight = showBottomAxis ? 32 : 0;

    const mainLeft = leftRulerWidth;
    const mainRight = width - rightRulerWidth;
    const mainTop = topRulerHeight;
    const mainBottom = height - bottomRulerHeight;

    ctx.save();
    const rulerBg = isAxisTransparent
      ? "rgba(247, 246, 240, 0.75)"
      : DRAFTING_THEME.paperBackground;
    const rulerBorder = "rgba(74, 120, 102, 0.50)";
    const charcoal = "#2C2C2C";
    const gannGreen = "rgba(74, 120, 102, 0.85)";

    // 1. LEFT PRICE TRACK (Y-AXIS)
    if (showLeftAxis) {
      ctx.fillStyle = rulerBg;
      ctx.fillRect(0, 0, leftRulerWidth, height);
      ctx.strokeStyle = rulerBorder;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(Math.round(leftRulerWidth) + 0.5, 0);
      ctx.lineTo(Math.round(leftRulerWidth) + 0.5, height);
      ctx.stroke();

      ctx.textBaseline = "middle";
      for (let row = startRow; row <= endRow; row++) {
        const sy = Math.round(pan.y - row * scaledBase) + 0.5;
        if (sy < mainTop || sy > mainBottom) continue;

        const isMajor = row % subdivisions === 0;
        const isIntermediate = row % 2 === 0;
        const tickLength = isMajor ? 8 : isIntermediate ? 5 : 3;

        ctx.strokeStyle = isMajor ? charcoal : "rgba(74, 120, 102, 0.60)";
        ctx.lineWidth = isMajor ? 1.2 : 0.8;
        ctx.beginPath();
        ctx.moveTo(leftRulerWidth, sy);
        ctx.lineTo(leftRulerWidth - tickLength, sy);
        ctx.stroke();

        if (isMajor) {
          const priceVal = basePrice + row * pricePerUnit;
          const priceStr = `\u20B9${priceVal.toLocaleString("en-IN")}`;
          const inchStr = `${row / subdivisions}"`;

          ctx.fillStyle = charcoal;
          ctx.font = "bold 10px 'Courier New', Courier, monospace";
          ctx.textAlign = "left";
          ctx.fillText(priceStr, 6, sy);

          ctx.fillStyle = "rgba(74, 120, 102, 0.70)";
          ctx.font = "8px 'Courier New', Courier, monospace";
          ctx.textAlign = "right";
          ctx.fillText(inchStr, leftRulerWidth - 10, sy);
        }
      }
    }

    // 2. RIGHT PRICE TRACK (Y-AXIS)
    if (showRightAxis) {
      ctx.fillStyle = rulerBg;
      ctx.fillRect(mainRight, 0, rightRulerWidth, height);
      ctx.strokeStyle = rulerBorder;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(Math.round(mainRight) + 0.5, 0);
      ctx.lineTo(Math.round(mainRight) + 0.5, height);
      ctx.stroke();

      ctx.textBaseline = "middle";
      for (let row = startRow; row <= endRow; row++) {
        const sy = Math.round(pan.y - row * scaledBase) + 0.5;
        if (sy < mainTop || sy > mainBottom) continue;

        const isMajor = row % subdivisions === 0;
        const isIntermediate = row % 2 === 0;
        const tickLength = isMajor ? 8 : isIntermediate ? 5 : 3;

        ctx.strokeStyle = isMajor ? charcoal : "rgba(74, 120, 102, 0.60)";
        ctx.lineWidth = isMajor ? 1.2 : 0.8;
        ctx.beginPath();
        ctx.moveTo(mainRight, sy);
        ctx.lineTo(mainRight + tickLength, sy);
        ctx.stroke();

        if (isMajor) {
          const priceVal = basePrice + row * pricePerUnit;
          const priceStr = `\u20B9${priceVal.toLocaleString("en-IN")}`;
          const inchStr = `${row / subdivisions}"`;

          ctx.fillStyle = charcoal;
          ctx.font = "bold 10px 'Courier New', Courier, monospace";
          ctx.textAlign = "left";
          ctx.fillText(priceStr, mainRight + 10, sy);

          ctx.fillStyle = "rgba(74, 120, 102, 0.70)";
          ctx.font = "8px 'Courier New', Courier, monospace";
          ctx.textAlign = "right";
          ctx.fillText(inchStr, width - 8, sy);
        }
      }
    }

    // 3. TOP TIME TRACK (X-AXIS)
    if (showTopAxis) {
      ctx.fillStyle = rulerBg;
      ctx.fillRect(mainLeft, 0, mainRight - mainLeft, topRulerHeight);
      ctx.strokeStyle = rulerBorder;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(mainLeft, Math.round(topRulerHeight) + 0.5);
      ctx.lineTo(mainRight, Math.round(topRulerHeight) + 0.5);
      ctx.stroke();

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (let col = startCol; col <= endCol; col++) {
        const sx = Math.round(pan.x + col * scaledBase) + 0.5;
        if (sx < mainLeft || sx > mainRight) continue;

        const isMajor = col % subdivisions === 0;
        const isIntermediate = col % 2 === 0;
        const tickLength = isMajor ? 8 : isIntermediate ? 5 : 3;

        ctx.strokeStyle = isMajor ? charcoal : "rgba(74, 120, 102, 0.60)";
        ctx.lineWidth = isMajor ? 1.2 : 0.8;
        ctx.beginPath();
        ctx.moveTo(sx, topRulerHeight);
        ctx.lineTo(sx, topRulerHeight - tickLength);
        ctx.stroke();

        if (isMajor) {
          const inchIdx = col / subdivisions;
          const colStr = `${inchIdx}" [T+${col}]`;

          ctx.fillStyle = charcoal;
          ctx.font = "bold 9px 'Courier New', Courier, monospace";
          ctx.fillText(colStr, sx, topRulerHeight / 2);
        }
      }
    }

    // 4. BOTTOM TIME TRACK (X-AXIS)
    if (showBottomAxis) {
      ctx.fillStyle = rulerBg;
      ctx.fillRect(mainLeft, mainBottom, mainRight - mainLeft, bottomRulerHeight);
      ctx.strokeStyle = rulerBorder;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(mainLeft, Math.round(mainBottom) + 0.5);
      ctx.lineTo(mainRight, Math.round(mainBottom) + 0.5);
      ctx.stroke();

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (let col = startCol; col <= endCol; col++) {
        const sx = Math.round(pan.x + col * scaledBase) + 0.5;
        if (sx < mainLeft || sx > mainRight) continue;

        const isMajor = col % subdivisions === 0;
        const isIntermediate = col % 2 === 0;
        const tickLength = isMajor ? 8 : isIntermediate ? 5 : 3;

        ctx.strokeStyle = isMajor ? charcoal : "rgba(74, 120, 102, 0.60)";
        ctx.lineWidth = isMajor ? 1.2 : 0.8;
        ctx.beginPath();
        ctx.moveTo(sx, mainBottom);
        ctx.lineTo(sx, mainBottom + tickLength);
        ctx.stroke();

        if (isMajor) {
          const inchIdx = col / subdivisions;
          const colStr = `${inchIdx}" [T+${col}]`;

          ctx.fillStyle = charcoal;
          ctx.font = "bold 9px 'Courier New', Courier, monospace";
          ctx.fillText(colStr, sx, mainBottom + 19);
        }
      }
    }

    // 5. CORNER JUNCTION BOXES
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    if (showTopAxis && showLeftAxis) {
      ctx.fillStyle = rulerBg;
      ctx.fillRect(0, 0, leftRulerWidth, topRulerHeight);
      ctx.strokeStyle = rulerBorder;
      ctx.strokeRect(0, 0, leftRulerWidth, topRulerHeight);
      ctx.fillStyle = gannGreen;
      ctx.font = "bold 9px 'Courier New', Courier, monospace";
      ctx.fillText("K&E 8x8", leftRulerWidth / 2, topRulerHeight / 2);
    }

    if (showTopAxis && showRightAxis) {
      ctx.fillStyle = rulerBg;
      ctx.fillRect(mainRight, 0, rightRulerWidth, topRulerHeight);
      ctx.strokeStyle = rulerBorder;
      ctx.strokeRect(mainRight, 0, rightRulerWidth, topRulerHeight);
      ctx.fillStyle = gannGreen;
      ctx.font = "bold 9px 'Courier New', Courier, monospace";
      ctx.fillText("K&E 8x8", mainRight + rightRulerWidth / 2, topRulerHeight / 2);
    }

    if (showBottomAxis && showLeftAxis) {
      ctx.fillStyle = rulerBg;
      ctx.fillRect(0, mainBottom, leftRulerWidth, bottomRulerHeight);
      ctx.strokeStyle = rulerBorder;
      ctx.strokeRect(0, mainBottom, leftRulerWidth, bottomRulerHeight);
      ctx.fillStyle = gannGreen;
      ctx.font = "bold 9px 'Courier New', Courier, monospace";
      ctx.fillText("K&E 8x8", leftRulerWidth / 2, mainBottom + bottomRulerHeight / 2);
    }

    if (showBottomAxis && showRightAxis) {
      ctx.fillStyle = rulerBg;
      ctx.fillRect(mainRight, mainBottom, rightRulerWidth, bottomRulerHeight);
      ctx.strokeStyle = rulerBorder;
      ctx.strokeRect(mainRight, mainBottom, rightRulerWidth, bottomRulerHeight);
      ctx.fillStyle = gannGreen;
      ctx.font = "bold 9px 'Courier New', Courier, monospace";
      ctx.fillText("K&E 8x8", mainRight + rightRulerWidth / 2, mainBottom + bottomRulerHeight / 2);
    }

    ctx.restore();
  }, [
    pan,
    zoom,
    baseUnit,
    subdivisions,
    isAxisTransparent,
    showTopAxis,
    showBottomAxis,
    showLeftAxis,
    showRightAxis,
    basePrice,
    pricePerUnit,
    screenToWorld,
  ]);

  /**
   * LAYER 4 (z-index: 30): Precision Crosshair & Dirty-Rect Reticle
   * Audits 4.2 & 4.3 Resolution: ZERO full-frame clearRect on mouse moves.
   * Erases ONLY the exact bounding rectangles of the previous crosshair lines & badges.
   */
  const renderCrosshair = useCallback(() => {
    const canvas = crosshairCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // If pan or zoom changed, reset dirty tracking and clear full frame once
    const panZoomChanged =
      prevPanZoomRef.current.panX !== pan.x ||
      prevPanZoomRef.current.panY !== pan.y ||
      prevPanZoomRef.current.zoom !== zoom;

    if (panZoomChanged) {
      prevPanZoomRef.current = { panX: pan.x, panY: pan.y, zoom };
      ctx.clearRect(0, 0, width, height);
      prevDirtyRectsRef.current = null;
    }

    // 1. Erase previous microscopic dirty rectangles (if any)
    if (prevDirtyRectsRef.current && prevDirtyRectsRef.current.length > 0) {
      for (const r of prevDirtyRectsRef.current) {
        ctx.clearRect(r.x, r.y, r.w, r.h);
      }
      prevDirtyRectsRef.current = null;
    }

    // If crosshair is inactive or cursor is outside, exit cleanly
    if (!isHovered || !showCrosshair) {
      return;
    }

    const snapScreen = worldToScreen(cursorGrid.col * baseUnit, cursorGrid.row * baseUnit);
    const cx = Math.round(snapScreen.x) + 0.5;
    const cy = Math.round(snapScreen.y) + 0.5;

    // Boundary check
    if (cx < -50 || cx > width + 50 || cy < -50 || cy > height + 50) {
      return;
    }

    const snappedPrice = basePrice + cursorGrid.row * pricePerUnit;

    const leftRulerWidth = showLeftAxis ? 84 : 0;
    const rightRulerWidth = showRightAxis ? 88 : 0;
    const topRulerHeight = showTopAxis ? 30 : 0;
    const bottomRulerHeight = showBottomAxis ? 32 : 0;

    const mainLeft = leftRulerWidth;
    const mainRight = width - rightRulerWidth;
    const mainTop = topRulerHeight;
    const mainBottom = height - bottomRulerHeight;

    const newDirtyRects: DirtyRect[] = [];

    ctx.save();

    // 2. Render Full-Screen Snapped Dashed Lines
    ctx.lineWidth = 1.0;
    ctx.strokeStyle = "rgba(55, 71, 79, 0.85)";
    ctx.setLineDash([4, 4]);

    ctx.beginPath();
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, height);
    ctx.stroke();
    newDirtyRects.push({ x: Math.floor(cx) - 2, y: 0, w: 5, h: height });

    ctx.beginPath();
    ctx.moveTo(0, cy);
    ctx.lineTo(width, cy);
    ctx.stroke();
    newDirtyRects.push({ x: 0, y: Math.floor(cy) - 2, w: width, h: 5 });

    // 3. Precision Drafting Reticle Target (Circle + 4 Brackets)
    ctx.setLineDash([]);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = "#1E2A24";
    ctx.fillStyle = "rgba(46, 125, 50, 0.90)";
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    const gap = 5;
    const arm = 10;
    ctx.beginPath();
    ctx.moveTo(cx - arm, cy); ctx.lineTo(cx - gap, cy);
    ctx.moveTo(cx + gap, cy); ctx.lineTo(cx + arm, cy);
    ctx.moveTo(cx, cy - arm); ctx.lineTo(cx, cy - gap);
    ctx.moveTo(cx, cy + gap); ctx.lineTo(cx, cy + arm);
    ctx.stroke();
    newDirtyRects.push({ x: Math.floor(cx) - 16, y: Math.floor(cy) - 16, w: 32, h: 32 });

    // 4. Snapped Coordinate HUD Floating Badge
    const inchX = (cursorGrid.col / subdivisions).toFixed(2);
    const inchY = (cursorGrid.row / subdivisions).toFixed(2);
    const badgeText = `[${cursorGrid.col}, ${cursorGrid.row}] (${inchX}", ${inchY}") \u20B9${snappedPrice.toLocaleString("en-IN")}`;

    ctx.font = "bold 9px 'Courier New', Courier, monospace";
    const txtW = ctx.measureText(badgeText).width;
    const bW = txtW + 10;
    const bH = 15;
    let bX = cx + 8;
    let bY = cy - 20;

    if (bX + bW > width - 90) bX = cx - bW - 8;
    if (bY < 35) bY = cy + 18;

    ctx.fillStyle = "rgba(247, 246, 240, 0.94)";
    ctx.strokeStyle = "rgba(74, 120, 102, 0.55)";
    ctx.lineWidth = 1;
    if (ctx.roundRect) ctx.roundRect(bX, bY - 11, bW, bH, 3);
    else ctx.rect(bX, bY - 11, bW, bH);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#2C2C2C";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(badgeText, bX + 5, bY - 3.5);
    newDirtyRects.push({ x: bX - 3, y: bY - 14, w: bW + 6, h: bH + 6 });

    // 5. Live Snapped Indicators on Axis Tracks
    // Left Price Indicator
    if (showLeftAxis && cy >= mainTop && cy <= mainBottom) {
      const pStr = `\u20B9${snappedPrice.toLocaleString("en-IN")}`;
      ctx.fillStyle = "#1B5E20";
      ctx.fillRect(0, cy - 9, leftRulerWidth, 18);
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 9px 'Courier New', Courier, monospace";
      ctx.textAlign = "center";
      ctx.fillText(pStr, leftRulerWidth / 2, cy);
      newDirtyRects.push({ x: 0, y: Math.floor(cy) - 11, w: leftRulerWidth + 1, h: 22 });
    }

    // Right Price Indicator
    if (showRightAxis && cy >= mainTop && cy <= mainBottom) {
      const pStr = `\u20B9${snappedPrice.toLocaleString("en-IN")}`;
      ctx.fillStyle = "#1B5E20";
      ctx.fillRect(mainRight, cy - 9, rightRulerWidth, 18);
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 9px 'Courier New', Courier, monospace";
      ctx.textAlign = "center";
      ctx.fillText(pStr, mainRight + rightRulerWidth / 2, cy);
      newDirtyRects.push({ x: Math.floor(mainRight) - 1, y: Math.floor(cy) - 11, w: rightRulerWidth + 2, h: 22 });
    }

    // Top Time Indicator
    if (showTopAxis && cx >= mainLeft && cx <= mainRight) {
      const tStr = `T+${cursorGrid.col}`;
      const tagW = 48;
      ctx.fillStyle = "#1B5E20";
      ctx.fillRect(cx - tagW / 2, 0, tagW, topRulerHeight);
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 9px 'Courier New', Courier, monospace";
      ctx.textAlign = "center";
      ctx.fillText(tStr, cx, topRulerHeight / 2);
      newDirtyRects.push({ x: Math.floor(cx - tagW / 2) - 2, y: 0, w: tagW + 4, h: topRulerHeight + 1 });
    }

    // Bottom Time Indicator
    if (showBottomAxis && cx >= mainLeft && cx <= mainRight) {
      const tStr = `T+${cursorGrid.col}`;
      const tagW = 48;
      ctx.fillStyle = "#1B5E20";
      ctx.fillRect(cx - tagW / 2, mainBottom, tagW, bottomRulerHeight);
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 9px 'Courier New', Courier, monospace";
      ctx.textAlign = "center";
      ctx.fillText(tStr, cx, mainBottom + 19);
      newDirtyRects.push({ x: Math.floor(cx - tagW / 2) - 2, y: Math.floor(mainBottom) - 1, w: tagW + 4, h: bottomRulerHeight + 2 });
    }

    ctx.restore();

    // Cache current bounding boxes for microscopic erasure on next tick
    prevDirtyRectsRef.current = newDirtyRects;
  }, [
    cursorGrid,
    isHovered,
    showCrosshair,
    pan,
    zoom,
    baseUnit,
    subdivisions,
    basePrice,
    pricePerUnit,
    showTopAxis,
    showBottomAxis,
    showLeftAxis,
    showRightAxis,
    worldToScreen,
  ]);

  // Request Animation Frame Schedulers for decoupled layers
  useEffect(() => {
    if (animFrameGridRef.current) cancelAnimationFrame(animFrameGridRef.current);
    animFrameGridRef.current = requestAnimationFrame(renderGrid);
    return () => {
      if (animFrameGridRef.current) cancelAnimationFrame(animFrameGridRef.current);
    };
  }, [renderGrid]);

  useEffect(() => {
    if (animFrameChartRef.current) cancelAnimationFrame(animFrameChartRef.current);
    animFrameChartRef.current = requestAnimationFrame(renderChart);
    return () => {
      if (animFrameChartRef.current) cancelAnimationFrame(animFrameChartRef.current);
    };
  }, [renderChart]);

  useEffect(() => {
    if (animFrameRulerRef.current) cancelAnimationFrame(animFrameRulerRef.current);
    animFrameRulerRef.current = requestAnimationFrame(renderRulers);
    return () => {
      if (animFrameRulerRef.current) cancelAnimationFrame(animFrameRulerRef.current);
    };
  }, [renderRulers]);

  useEffect(() => {
    if (animFrameCrosshairRef.current) cancelAnimationFrame(animFrameCrosshairRef.current);
    animFrameCrosshairRef.current = requestAnimationFrame(renderCrosshair);
    return () => {
      if (animFrameCrosshairRef.current) cancelAnimationFrame(animFrameCrosshairRef.current);
    };
  }, [renderCrosshair]);

  // Window resize listener synchronizes all 4 canvas buffers
  useEffect(() => {
    const handleResize = () => {
      const dpr = window.devicePixelRatio || 1;
      const gCanvas = gridCanvasRef.current;
      const cCanvas = chartCanvasRef.current;
      const rCanvas = rulerCanvasRef.current;
      const uCanvas = crosshairCanvasRef.current;
      if (!gCanvas || !cCanvas || !rCanvas || !uCanvas) return;

      const rect = gCanvas.getBoundingClientRect();
      const w = Math.round(rect.width * dpr);
      const h = Math.round(rect.height * dpr);

      gCanvas.width = w; gCanvas.height = h;
      cCanvas.width = w; cCanvas.height = h;
      rCanvas.width = w; rCanvas.height = h;
      uCanvas.width = w; uCanvas.height = h;

      prevDirtyRectsRef.current = null;

      renderGrid();
      renderChart();
      renderRulers();
      renderCrosshair();
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [renderGrid, renderChart, renderRulers, renderCrosshair]);

  /**
   * KEYBOARD ARROW KEY NAVIGATION
   */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        return;
      }

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
   * MOUSE HANDLERS (Interacting on Layer 4 crosshairCanvas)
   */
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 0 || e.button === 1) {
      isDraggingRef.current = true;
      dragStartRef.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = crosshairCanvasRef.current;
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
    const canvas = crosshairCanvasRef.current;
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
      {/* LAYER 1 (z-index: 10): Background & K&E 8x8 Grid (Hardware Tiled) */}
      <canvas
        ref={gridCanvasRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          zIndex: 10,
          pointerEvents: "none",
        }}
      />
      {/* LAYER 2 (z-index: 20): Candlesticks, Volume, and Swings */}
      <canvas
        ref={chartCanvasRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          zIndex: 20,
          pointerEvents: "none",
        }}
      />
      {/* LAYER 3 (z-index: 25): Fixed Four-Sided Axis Rulers & Corner Junctions (Static on mousemove) */}
      <canvas
        ref={rulerCanvasRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          zIndex: 25,
          pointerEvents: "none",
        }}
      />
      {/* LAYER 4 (z-index: 30): Precision Crosshair & Reticle (Microscopic Dirty-Rect Updates) */}
      <canvas
        ref={crosshairCanvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onWheel={handleWheel}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          zIndex: 30,
          display: "block",
        }}
      />
    </div>
  );
};
