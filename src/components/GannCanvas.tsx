import React, { useState, useEffect, useRef, useCallback } from "react";
import { useGridState } from "../store/useGridState";
import { GridTheme, CandleData } from "../types/gann";
import { verifyKeEAspectRatio, auditCanvasBackingStore } from "../utils/ratioSentinel";
import { normalizeWheelEvent } from "../utils/wheelNormalizer";
import { GridBridge } from "../core-bridge/GridBridge";

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
  const containerRef = useRef<HTMLDivElement | null>(null);           // Parent Container (ResizeObserver Root)
  const gridCanvasRef = useRef<HTMLCanvasElement | null>(null);       // Layer 1 (z-index: 10): Grid Pattern & Zero Axes
  const chartCanvasRef = useRef<HTMLCanvasElement | null>(null);      // Layer 2 (z-index: 20): Candlesticks, Volume, Swings
  const rulerCanvasRef = useRef<HTMLCanvasElement | null>(null);      // Layer 3 (z-index: 25): Static 4-Sided Axis Tracks & Junctions
  const crosshairCanvasRef = useRef<HTMLCanvasElement | null>(null);  // Layer 4 (z-index: 30): Precision Crosshair (Dirty-Rect)

  // Hardware Device Pixel Ratio (DPR) & Logical Viewport State
  const [viewportSize, setViewportSize] = useState<{ width: number; height: number; dpr: number }>({
    width: typeof window !== "undefined" ? window.innerWidth : 1440,
    height: typeof window !== "undefined" ? window.innerHeight : 900,
    dpr: typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
  });

  // Granular Isolated Zustand Selectors (DELTA-P0-02 Remediation)
  // Crucial: GannCanvas does NOT subscribe to cursorGrid, cursorScreen, or cursorWorld to eliminate 60Hz re-render cascades.
  const pan = useGridState((s) => s.pan);
  const zoom = useGridState((s) => s.zoom);
  const baseUnit = useGridState((s) => s.baseUnit);
  const majorUnit = useGridState((s) => s.majorUnit);
  const subdivisions = useGridState((s) => s.subdivisions);
  const chartMode = useGridState((s) => s.chartMode);
  const showPatterns = useGridState((s) => s.showPatterns);
  const showVolumeBars = useGridState((s) => s.showVolumeBars);
  const showTopAxis = useGridState((s) => s.showTopAxis);
  const showBottomAxis = useGridState((s) => s.showBottomAxis);
  const showLeftAxis = useGridState((s) => s.showLeftAxis);
  const showRightAxis = useGridState((s) => s.showRightAxis);
  const isAxisTransparent = useGridState((s) => s.isAxisTransparent);
  const showCrosshair = useGridState((s) => s.showCrosshair);
  const isHovered = useGridState((s) => s.isHovered);
  const candles = useGridState((s) => s.candles);
  const swingPoints = useGridState((s) => s.swingPoints);
  const basePrice = useGridState((s) => s.basePrice);
  const pricePerUnit = useGridState((s) => s.pricePerUnit);
  const priceCeiling = useGridState((s) => s.priceCeiling);
  const highestPrice = useGridState((s) => s.highestPrice);
  // Strict canvas rendering guard: clamp pricePerUnit to physically valid range [0.01, 10000]
  const safePricePerUnit = Number.isFinite(pricePerUnit) && pricePerUnit > 0 && pricePerUnit <= 10000 ? pricePerUnit : 25.0;
  const panBy = useGridState((s) => s.panBy);
  const zoomAt = useGridState((s) => s.zoomAt);
  const updateCursor = useGridState((s) => s.updateCursor);
  const setHovered = useGridState((s) => s.setHovered);
  const screenToWorld = useGridState((s) => s.screenToWorld);
  const worldToScreen = useGridState((s) => s.worldToScreen);
  const priceToWorldY = useGridState((s) => s.priceToWorldY);
  const worldToPrice = useGridState((s) => s.worldToPrice);
  const activeSeedTool = useGridState((s) => s.activeSeedTool);
  const setLowestSeed = useGridState((s) => s.setLowestSeed);
  const setHighestSeed = useGridState((s) => s.setHighestSeed);
  const setActiveSeedTool = useGridState((s) => s.setActiveSeedTool);

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
  const cachedDprRef = useRef<number>(-1);

  // Dirty-Rectangle Tracker for Crosshair Layer (Audit 4.2 & 4.3 Optimization)
  const prevDirtyRectsRef = useRef<DirtyRect[] | null>(null);
  const prevPanZoomRef = useRef<{ panX: number; panY: number; zoom: number }>({
    panX: pan.x,
    panY: pan.y,
    zoom,
  });

  /**
   * Generates or reuses an Offscreen Master Tile for the K&E 8x8 Grid.
   * DPR-Aware Hardware Tiling: Re-renders ONLY when zoom scale or DPR changes, NOT on pan.
   */
  const getGridTile = useCallback(
    (currentZoom: number, currentDpr: number) => {
      let tile = tileCanvasRef.current;
      if (!tile) {
        tile = document.createElement("canvas");
        tileCanvasRef.current = tile;
      }

      if (
        cachedZoomRef.current === currentZoom &&
        cachedDprRef.current === currentDpr &&
        tile.width > 0
      ) {
        return tile;
      }

      cachedZoomRef.current = currentZoom;
      cachedDprRef.current = currentDpr;
      const scaledMajor = majorUnit * currentZoom;
      const scaledMinor = baseUnit * currentZoom;

      const exactTileW = majorUnit * currentZoom * currentDpr;
      const physicalTileW = Math.max(8, Math.round(exactTileW));
      const physicalTileH = physicalTileW;
      tile.width = physicalTileW;
      tile.height = physicalTileH;

      const tCtx = tile.getContext("2d", { alpha: false });
      if (!tCtx) return tile;

      tCtx.setTransform(currentDpr, 0, 0, currentDpr, 0, 0);

      // 1. Vintage Paper Background
      tCtx.fillStyle = DRAFTING_THEME.paperBackground;
      tCtx.fillRect(0, 0, scaledMajor, scaledMajor);

      // 2. Minor Grid Lines (interior 7 lines at 1/8th inch intervals)
      tCtx.lineWidth = 1;
      tCtx.strokeStyle = DRAFTING_THEME.minorGridLine;
      tCtx.beginPath();
      for (let i = 1; i < subdivisions; i++) {
        const pos = Math.round(i * scaledMinor) + 0.5;
        tCtx.moveTo(pos, 0);
        tCtx.lineTo(pos, scaledMajor);
        tCtx.moveTo(0, pos);
        tCtx.lineTo(scaledMajor, pos);
      }
      tCtx.stroke();

      // 3. Major Grid Lines (1-inch outer grid lines)
      tCtx.lineWidth = 1.25;
      tCtx.strokeStyle = DRAFTING_THEME.majorGridLine;
      tCtx.beginPath();
      tCtx.moveTo(0.5, 0);
      tCtx.lineTo(0.5, scaledMajor);
      tCtx.moveTo(0, 0.5);
      tCtx.lineTo(scaledMajor, 0.5);
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

    const roundPanX = Math.round(pan.x);
    const roundPanY = Math.round(pan.y);

    // 1. Hardware Pattern Blit via Offscreen Master Tile with Fractional Drift Compensation (GAMMA-P0-01)
    const exactTileW = majorUnit * zoom * dpr;
    const tile = getGridTile(zoom, dpr);
    const physicalTileW = tile.width || Math.max(8, Math.round(exactTileW));
    const scaleComp = exactTileW / physicalTileW;

    ctx.save();
    ctx.scale(scaleComp, scaleComp);

    const pattern = ctx.createPattern(tile, "repeat");
    if (pattern) {
      if (pattern.setTransform) {
        const matrix = new DOMMatrix()
          .translate(roundPanX / scaleComp, roundPanY / scaleComp)
          .scale(1 / dpr, 1 / dpr);
        pattern.setTransform(matrix);
        ctx.fillStyle = pattern;
        ctx.fillRect(0, 0, width / scaleComp, height / scaleComp);
      } else {
        ctx.save();
        ctx.translate(roundPanX / scaleComp, roundPanY / scaleComp);
        ctx.scale(1 / dpr, 1 / dpr);
        ctx.fillStyle = pattern;
        ctx.fillRect(
          -roundPanX / scaleComp,
          -roundPanY / scaleComp,
          (width * dpr) / scaleComp,
          (height * dpr) / scaleComp
        );
        ctx.restore();
      }
    } else {
      ctx.fillStyle = DRAFTING_THEME.paperBackground;
      ctx.fillRect(0, 0, width / scaleComp, height / scaleComp);
    }
    ctx.restore();

    // 2. Cartesian Zero-Axes (X = 0 Time, Y = 0 Price) - Integer Clamped (2.0px stroke)
    ctx.lineWidth = 2.0;
    ctx.strokeStyle = DRAFTING_THEME.axisLine;
    ctx.beginPath();
    const axisY = roundPanY;
    if (axisY >= 0 && axisY <= height) {
      ctx.moveTo(0, axisY);
      ctx.lineTo(width, axisY);
    }
    const axisX = roundPanX;
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

    const mainLeft = Math.round(leftRulerWidth);
    const mainRight = Math.round(width - rightRulerWidth);
    const mainBottom = Math.round(height - bottomRulerHeight);

    // Viewport Frustum Culling & Data Virtualization (Pre-Flight Patch 1)
    // 1. Calculate physical world coordinates of visible viewport edges
    const visibleWorldLeft = (0 - pan.x) / zoom;
    const visibleWorldRight = (width - pan.x) / zoom;
    const minVisibleCol = visibleWorldLeft / baseUnit;
    const maxVisibleCol = visibleWorldRight / baseUnit;

    // 2. Binary search to slice only candles falling within the visible bounding box (+ 5-candle buffer)
    const BUFFER_CANDLES = 5;
    let visibleCandles: CandleData[] = [];

    if (candles.length > 0) {
      let low = 0;
      let high = candles.length - 1;
      let firstIdx = candles.length;

      while (low <= high) {
        const mid = (low + high) >> 1;
        if (candles[mid].gridCol >= minVisibleCol) {
          firstIdx = mid;
          high = mid - 1;
        } else {
          low = mid + 1;
        }
      }

      low = 0;
      high = candles.length - 1;
      let lastIdx = -1;

      while (low <= high) {
        const mid = (low + high) >> 1;
        if (candles[mid].gridCol <= maxVisibleCol) {
          lastIdx = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }

      if (firstIdx <= lastIdx) {
        const startIdx = Math.max(0, firstIdx - BUFFER_CANDLES);
        const endIdx = Math.min(candles.length, lastIdx + 1 + BUFFER_CANDLES);
        visibleCandles = candles.slice(startIdx, endIdx);
      } else {
        if (lastIdx < 0) {
          visibleCandles = candles.slice(0, Math.min(candles.length, BUFFER_CANDLES));
        } else if (firstIdx >= candles.length) {
          visibleCandles = candles.slice(Math.max(0, candles.length - BUFFER_CANDLES));
        } else {
          visibleCandles = [];
        }
      }
    }

    // 1. Volume Histogram Bars
    if (showVolumeBars && visibleCandles.length > 0) {
      ctx.save();
      let maxVol = 1;
      for (let i = 0; i < visibleCandles.length; i++) {
        if (visibleCandles[i].volume > maxVol) maxVol = visibleCandles[i].volume;
      }
      const volumeChartHeight = 60;
      const volumeBaseY = mainBottom - 2;

      visibleCandles.forEach((c) => {
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

    // 2. Gann Right-Angle Swing Steps (Rendered behind candlesticks in HYBRID mode so wicks/bodies are never obscured)
    if (
      (chartMode === "SWING_STEP" || chartMode === "HYBRID_CANDLE_SWING") &&
      swingPoints.length > 0
    ) {
      ctx.save();
      const isHybrid = chartMode === "HYBRID_CANDLE_SWING";
      ctx.lineWidth = isHybrid ? 1.6 : 2.5;
      ctx.strokeStyle = isHybrid ? "rgba(139, 30, 30, 0.45)" : DRAFTING_THEME.swingStepStroke;
      ctx.setLineDash(isHybrid ? [6, 3] : []);
      ctx.lineJoin = "miter";
      ctx.lineCap = "square";
      ctx.beginPath();

      const firstPoint = swingPoints[0];
      let currScreen = worldToScreen(
        firstPoint.gridCol * baseUnit,
        priceToWorldY(firstPoint.price)
      );
      ctx.moveTo(currScreen.x, currScreen.y);

      for (let i = 1; i < swingPoints.length; i++) {
        const prevPoint = swingPoints[i - 1];
        const nextPoint = swingPoints[i];

        const nextWorldX = nextPoint.gridCol * baseUnit;
        const prevWorldY = priceToWorldY(prevPoint.price);
        const nextWorldY = priceToWorldY(nextPoint.price);

        const cornerScreen = worldToScreen(nextWorldX, prevWorldY);
        ctx.lineTo(cornerScreen.x, cornerScreen.y);

        const nextScreen = worldToScreen(nextWorldX, nextWorldY);
        ctx.lineTo(nextScreen.x, nextScreen.y);

        currScreen = nextScreen;
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // Swing Vertex Nodes (Dynamic continuous price projection)
      swingPoints.forEach((pt) => {
        const sPos = worldToScreen(pt.gridCol * baseUnit, priceToWorldY(pt.price));
        if (sPos.x < -50 || sPos.x > width + 50 || sPos.y < -50 || sPos.y > height + 50) return;

        const nodeSize = isHybrid ? 5 : 6;
        ctx.fillStyle = pt.type === "SWING_HIGH" ? (isHybrid ? "rgba(46, 125, 50, 0.70)" : "#2E7D32") : (isHybrid ? "rgba(198, 40, 40, 0.70)" : "#C62828");
        ctx.fillRect(sPos.x - nodeSize / 2, sPos.y - nodeSize / 2, nodeSize, nodeSize);
        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = 1;
        ctx.strokeRect(sPos.x - nodeSize / 2, sPos.y - nodeSize / 2, nodeSize, nodeSize);

        if (chartMode === "SWING_STEP") {
          ctx.fillStyle = "#1E2A24";
          ctx.font = "600 10px 'Courier New', monospace";
          const dynamicRow = Math.round((pt.price - basePrice) / safePricePerUnit);
          const tag = `[${pt.gridCol},${dynamicRow}] \u20B9${pt.price.toLocaleString("en-IN")}`;
          const offsetY = pt.type === "SWING_HIGH" ? -10 : 16;
          ctx.fillText(tag, sPos.x + 8, sPos.y + offsetY);
        }
      });
      ctx.restore();
    }

    // 3. Japanese Candlesticks
    if (
      (chartMode === "CANDLESTICK" || chartMode === "HYBRID_CANDLE_SWING") &&
      visibleCandles.length > 0
    ) {
      ctx.save();
      const candleBodyWidth = Math.max(4, scaledBase * 0.72);

      visibleCandles.forEach((c) => {
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

        // Level-of-Detail (LOD) Sentinel (ALPHA-P0-01)
        // If scaledBase < 3.0px, bypass strokeRect, fillRect, and text badges; render 1px high-density range line
        if (scaledBase < 3.0) {
          ctx.strokeStyle = isBull ? DRAFTING_THEME.bullishCandle : DRAFTING_THEME.bearishCandle;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(screenColX, highScreenY);
          ctx.lineTo(screenColX, lowScreenY);
          ctx.stroke();
          return;
        }

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
    if (chartMode === "OHLC_BAR" && visibleCandles.length > 0) {
      ctx.save();
      const tickWidth = Math.max(3, scaledBase * 0.42);

      visibleCandles.forEach((c) => {
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



    // 4.5. Dynamic +10% Upper Ceiling & Headroom Guideline
    // Sets the upper price scale bound to maxHigh * 1.10 and dynamically elongates whenever a new high is made.
    if (candles.length > 0 && priceCeiling > 0) {
      const ceilingWorldY = priceToWorldY(priceCeiling);
      const ceilingScreenPos = worldToScreen(0, ceilingWorldY);
      const ceilingScreenY = Math.round(ceilingScreenPos.y) + 0.5;

      if (ceilingScreenY >= -40 && ceilingScreenY <= height + 40) {
        ctx.save();
        ctx.strokeStyle = "rgba(180, 50, 40, 0.70)";
        ctx.lineWidth = 1.2;
        ctx.setLineDash([8, 4]);

        const drawLeft = showLeftAxis ? 84 : 0;
        const drawRight = width - (showRightAxis ? 88 : 0);

        ctx.beginPath();
        ctx.moveTo(drawLeft, ceilingScreenY);
        ctx.lineTo(drawRight, ceilingScreenY);
        ctx.stroke();

        // Architectural Ceiling Badge Pill
        ctx.setLineDash([]);
        const ceilingText = `▲ +10% DYNAMIC CEILING: \u20B9${priceCeiling.toLocaleString("en-IN")} (HIGH: \u20B9${(highestPrice || 0).toLocaleString("en-IN")})`;
        ctx.font = "bold 9px 'Courier New', monospace";
        const textWidth = ctx.measureText(ceilingText).width;
        const badgeWidth = textWidth + 14;
        const badgeX = drawRight - badgeWidth - 12;
        const badgeY = ceilingScreenY - 15;

        ctx.fillStyle = "rgba(255, 245, 245, 0.92)";
        ctx.fillRect(badgeX, badgeY, badgeWidth, 13);
        ctx.strokeStyle = "rgba(180, 50, 40, 0.55)";
        ctx.lineWidth = 1;
        ctx.strokeRect(badgeX, badgeY, badgeWidth, 13);

        ctx.fillStyle = "#B71C1C";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(ceilingText, badgeX + 6, badgeY + 6.5);
        ctx.restore();
      }
    }

    // 5. Lightweight Empty State Prompt (Active when vault is empty and no CSV is loaded)
    if (candles.length === 0) {
      ctx.save();
      ctx.fillStyle = "rgba(74, 120, 102, 0.45)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "italic bold 14px 'Courier New', monospace";
      ctx.fillText("K&E 8x8 Drafting Desk — No Market Series Loaded", width / 2, height / 2 - 10);
      ctx.font = "11px 'Courier New', monospace";
      ctx.fillStyle = "rgba(74, 120, 102, 0.65)";
      ctx.fillText("Select a series from the toolbar or drop CSV files into D:\\GannMarketVault\\01_DROP_INBOX", width / 2, height / 2 + 14);
      ctx.restore();
    }

    // 6. Modular Overlay Extensions (Decoupled Plugin Architecture)
    const overlays = GridBridge.getOverlays();
    if (overlays.size > 0) {
      overlays.forEach((renderer) => {
        try {
          ctx.save();
          renderer(ctx, GridBridge, { width, height, dpr });
          ctx.restore();
        } catch (err) {
          console.error("[GannCanvas] Error in modular overlay renderer:", err);
          ctx.restore();
        }
      });
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
    basePrice,
    pricePerUnit,
    priceCeiling,
    highestPrice,
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

    const mainLeft = Math.round(leftRulerWidth);
    const mainRight = Math.round(width - rightRulerWidth);
    const mainTop = Math.round(topRulerHeight);
    const mainBottom = Math.round(height - bottomRulerHeight);

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
          const priceVal = basePrice + row * safePricePerUnit;
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
          const priceVal = basePrice + row * safePricePerUnit;
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

    const newDirtyRects: DirtyRect[] = [];

    // If crosshair is inactive or cursor is outside, exit cleanly
    if (!isHovered || !showCrosshair) {
      return;
    }

    const { cursorGrid } = useGridState.getState();
    const snapScreen = worldToScreen(cursorGrid.col * baseUnit, cursorGrid.row * baseUnit);
    const cx = Math.round(snapScreen.x);
    const cy = Math.round(snapScreen.y);

    // Boundary check
    if (cx < -50 || cx > width + 50 || cy < -50 || cy > height + 50) {
      return;
    }

    const snappedPrice = basePrice + cursorGrid.row * safePricePerUnit;

    const leftRulerWidth = showLeftAxis ? 84 : 0;
    const rightRulerWidth = showRightAxis ? 88 : 0;
    const topRulerHeight = showTopAxis ? 30 : 0;
    const bottomRulerHeight = showBottomAxis ? 32 : 0;

    const mainLeft = Math.round(leftRulerWidth);
    const mainRight = Math.round(width - rightRulerWidth);
    const mainTop = Math.round(topRulerHeight);
    const mainBottom = Math.round(height - bottomRulerHeight);

    ctx.save();

    // 2. Render Full-Screen Snapped Dashed Lines (Strict integer pixel center with 0.5 offset)
    ctx.lineWidth = 1.0;
    ctx.strokeStyle = "rgba(55, 71, 79, 0.85)";
    ctx.setLineDash([4, 4]);

    ctx.beginPath();
    ctx.moveTo(cx + 0.5, 0);
    ctx.lineTo(cx + 0.5, height);
    ctx.stroke();
    newDirtyRects.push({ x: cx - 2, y: 0, w: 5, h: height });

    ctx.beginPath();
    ctx.moveTo(0, cy + 0.5);
    ctx.lineTo(width, cy + 0.5);
    ctx.stroke();
    newDirtyRects.push({ x: 0, y: cy - 2, w: width, h: 5 });

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
    newDirtyRects.push({ x: cx - 16, y: cy - 16, w: 32, h: 32 });

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
    ctx.beginPath();
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
      newDirtyRects.push({ x: 0, y: cy - 11, w: leftRulerWidth + 1, h: 22 });
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
      newDirtyRects.push({ x: mainRight - 1, y: cy - 11, w: rightRulerWidth + 2, h: 22 });
    }

    // Top Time Indicator
    if (showTopAxis && cx >= mainLeft && cx <= mainRight) {
      const tStr = `T+${cursorGrid.col}`;
      const tagW = 48;
      ctx.fillStyle = "#1B5E20";
      ctx.fillRect(Math.round(cx - tagW / 2), 0, tagW, topRulerHeight);
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 9px 'Courier New', Courier, monospace";
      ctx.textAlign = "center";
      ctx.fillText(tStr, cx, topRulerHeight / 2);
      newDirtyRects.push({ x: Math.round(cx - tagW / 2) - 2, y: 0, w: tagW + 4, h: topRulerHeight + 1 });
    }

    // Bottom Time Indicator
    if (showBottomAxis && cx >= mainLeft && cx <= mainRight) {
      const tStr = `T+${cursorGrid.col}`;
      const tagW = 48;
      ctx.fillStyle = "#1B5E20";
      ctx.fillRect(Math.round(cx - tagW / 2), mainBottom, tagW, bottomRulerHeight);
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 9px 'Courier New', Courier, monospace";
      ctx.textAlign = "center";
      ctx.fillText(tStr, cx, mainBottom + 19);
      newDirtyRects.push({ x: Math.round(cx - tagW / 2) - 2, y: mainBottom - 1, w: tagW + 4, h: bottomRulerHeight + 2 });
    }

    ctx.restore();

    // Cache current bounding boxes for microscopic erasure on next tick
    prevDirtyRectsRef.current = newDirtyRects;
  }, [
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

  // Listen to modular overlay registration/update events from GridBridge
  useEffect(() => {
    return GridBridge.onOverlayChange(() => {
      if (animFrameChartRef.current) cancelAnimationFrame(animFrameChartRef.current);
      animFrameChartRef.current = requestAnimationFrame(renderChart);
    });
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

  // Stable ref delegation for render callbacks and dimension constants to decouple ResizeObserver
  const renderFnsRef = useRef({
    renderGrid,
    renderChart,
    renderRulers,
    renderCrosshair,
    baseUnit,
    majorUnit,
  });
  renderFnsRef.current = {
    renderGrid,
    renderChart,
    renderRulers,
    renderCrosshair,
    baseUnit,
    majorUnit,
  };

  // Resize & DPI Watchdog (ResizeObserver & DPI Media Query Listener)
  // Enforces hardware-level Device Pixel Ratio (DPR) calibration across all 4 canvas layers
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleDpiOrResize = () => {
      const currentDpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      const logicalWidth = Math.round(rect.width) || window.innerWidth;
      const logicalHeight = Math.round(rect.height) || window.innerHeight;

      // Update Zustand screen dimensions for anchor calibrations
      useGridState.setState({ screenWidth: logicalWidth, screenHeight: logicalHeight });

      // 1. Update React state for inline styles and JSX attributes
      setViewportSize((prev) => {
        if (
          prev.width === logicalWidth &&
          prev.height === logicalHeight &&
          prev.dpr === currentDpr
        ) {
          return prev;
        }
        return { width: logicalWidth, height: logicalHeight, dpr: currentDpr };
      });

      // 2. Synchronize physical backing stores & CSS dimensions on all 4 canvas layers immediately
      const gCanvas = gridCanvasRef.current;
      const cCanvas = chartCanvasRef.current;
      const rCanvas = rulerCanvasRef.current;
      const uCanvas = crosshairCanvasRef.current;

      const physicalW = Math.round(logicalWidth * currentDpr);
      const physicalH = Math.round(logicalHeight * currentDpr);

      const canvases = [gCanvas, cCanvas, rCanvas, uCanvas];
      canvases.forEach((c) => {
        if (c) {
          c.width = physicalW;
          c.height = physicalH;
          c.style.width = `${logicalWidth}px`;
          c.style.height = `${logicalHeight}px`;
        }
      });

      // 3. Force OffscreenCanvas grid tile regeneration for the new DPR/zoom
      cachedZoomRef.current = -1;
      cachedDprRef.current = -1;

      // 4. Ratio Sentinel & Backing Store Integrity Audit
      if (gCanvas) {
        const backingAudit = auditCanvasBackingStore(gCanvas, currentDpr);
        const ratioAudit = verifyKeEAspectRatio(
          renderFnsRef.current.baseUnit,
          renderFnsRef.current.majorUnit
        );
        if (backingAudit.isDistorted || !ratioAudit.isValid) {
          console.warn("[RatioSentinel] Physical ratio deviation detected, maintaining K&E 8x8 lock.");
        }
      }

      prevDirtyRectsRef.current = null;

      renderFnsRef.current.renderGrid();
      renderFnsRef.current.renderChart();
      renderFnsRef.current.renderRulers();
      renderFnsRef.current.renderCrosshair();
    };

    // 1. ResizeObserver on the main canvas container
    const resizeObserver = new ResizeObserver(() => {
      handleDpiOrResize();
    });
    resizeObserver.observe(container);

    // 2. DPI Watchdog media query for monitor scale switches
    let dpiMediaQueryList: MediaQueryList | null = null;
    const handleDpiChange = () => {
      handleDpiOrResize();
      setupDpiListener();
    };

    const setupDpiListener = () => {
      if (typeof window === "undefined" || !window.matchMedia) return;
      if (dpiMediaQueryList) {
        if (dpiMediaQueryList.removeEventListener) {
          dpiMediaQueryList.removeEventListener("change", handleDpiChange);
        } else if ((dpiMediaQueryList as any).removeListener) {
          (dpiMediaQueryList as any).removeListener(handleDpiChange);
        }
      }
      dpiMediaQueryList = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      if (dpiMediaQueryList.addEventListener) {
        dpiMediaQueryList.addEventListener("change", handleDpiChange);
      } else if ((dpiMediaQueryList as any).addListener) {
        (dpiMediaQueryList as any).addListener(handleDpiChange);
      }
    };

    setupDpiListener();

    // 3. Window resize fallback
    window.addEventListener("resize", handleDpiOrResize);

    // Initial calibration
    handleDpiOrResize();

    return () => {
      // 1. Disconnect ResizeObserver
      resizeObserver.disconnect();

      // 2. Destroy DPI Watchdog matchMedia listener
      if (dpiMediaQueryList) {
        if (dpiMediaQueryList.removeEventListener) {
          dpiMediaQueryList.removeEventListener("change", handleDpiChange);
        } else if ((dpiMediaQueryList as any).removeListener) {
          (dpiMediaQueryList as any).removeListener(handleDpiChange);
        }
        dpiMediaQueryList = null;
      }

      // 3. Remove window resize fallback listener
      window.removeEventListener("resize", handleDpiOrResize);
    };
  }, [containerRef]);

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
   * WHEEL & TRACKPAD INPUT NORMALIZER
   * Native non-passive event listener prevents unwanted browser zooming and normalizes
   * high-precision trackpads vs. physical mouse wheels.
   */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleNativeWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      const cursorX = e.clientX - rect.left;
      const cursorY = e.clientY - rect.top;

      const { zoomMultiplier } = normalizeWheelEvent(e);
      zoomAt(cursorX, cursorY, zoomMultiplier);
    };

    container.addEventListener("wheel", handleNativeWheel, { passive: false });
    return () => {
      container.removeEventListener("wheel", handleNativeWheel);
    };
  }, [zoomAt]);

  /**
   * MOUSE HANDLERS (Master Container Interaction Capture - Pre-Flight Patch 2)
   * Captures interactions strictly on the outer master container to bypass canvas Z-index depth.
   */
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // 1. Manual Seed Click-to-Pick Capture
    if (activeSeedTool !== "NONE") {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;

      const worldX = (screenX - pan.x) / zoom;
      const worldY = (pan.y - screenY) / zoom;
      const clickedPrice = worldToPrice(worldY);
      const clickedCol = Math.round(worldX / baseUnit);

      // Find nearest candle horizontally
      let nearestCandle = candles[0];
      let minColDiff = Infinity;
      for (const c of candles) {
        const diff = Math.abs(c.gridCol - clickedCol);
        if (diff < minColDiff) {
          minColDiff = diff;
          nearestCandle = c;
        }
      }

      const isNearCandle = nearestCandle && minColDiff <= 4;
      const date = isNearCandle ? nearestCandle.timestamp : "";
      const gridCol = isNearCandle ? nearestCandle.gridCol : clickedCol;

      if (activeSeedTool === "PICK_LOWEST") {
        const price = isNearCandle ? nearestCandle.low : Math.round(clickedPrice * 100) / 100;
        setLowestSeed({ date, gridCol, price: Math.max(0, price) });
      } else if (activeSeedTool === "PICK_HIGHEST") {
        const price = isNearCandle ? nearestCandle.high : Math.round(clickedPrice * 100) / 100;
        setHighestSeed({ date, gridCol, price: Math.max(0, price) });
      }
      setActiveSeedTool("NONE");
      return;
    }

    if (e.button === 0 || e.button === 1) {
      isDraggingRef.current = true;
      dragStartRef.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    updateCursor(screenX, screenY);

    // Schedule Layer 4 crosshair dirty-rect redraw directly via RAF without React re-render
    if (animFrameCrosshairRef.current) cancelAnimationFrame(animFrameCrosshairRef.current);
    animFrameCrosshairRef.current = requestAnimationFrame(renderCrosshair);

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
    if (animFrameCrosshairRef.current) cancelAnimationFrame(animFrameCrosshairRef.current);
    animFrameCrosshairRef.current = requestAnimationFrame(renderCrosshair);
  };

  const handleMouseLeave = () => {
    isDraggingRef.current = false;
    setHovered(false);
    if (animFrameCrosshairRef.current) cancelAnimationFrame(animFrameCrosshairRef.current);
    animFrameCrosshairRef.current = requestAnimationFrame(renderCrosshair);
  };

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        backgroundColor: DRAFTING_THEME.paperBackground,
        cursor: isDraggingRef.current ? "grabbing" : "crosshair",
        pointerEvents: "auto",
      }}
    >
      {/* LAYER 1 (z-index: 10): Background & K&E 8x8 Grid (Ghost Canvas) */}
      <canvas
        ref={gridCanvasRef}
        width={Math.round(viewportSize.width * viewportSize.dpr)}
        height={Math.round(viewportSize.height * viewportSize.dpr)}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: `${viewportSize.width}px`,
          height: `${viewportSize.height}px`,
          zIndex: 10,
          pointerEvents: "none",
        }}
      />
      {/* LAYER 2 (z-index: 20): Candlesticks, Volume, and Swings (Ghost Canvas) */}
      <canvas
        ref={chartCanvasRef}
        width={Math.round(viewportSize.width * viewportSize.dpr)}
        height={Math.round(viewportSize.height * viewportSize.dpr)}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: `${viewportSize.width}px`,
          height: `${viewportSize.height}px`,
          zIndex: 20,
          pointerEvents: "none",
        }}
      />
      {/* LAYER 3 (z-index: 25): Fixed Four-Sided Axis Rulers & Corner Junctions (Ghost Canvas) */}
      <canvas
        ref={rulerCanvasRef}
        width={Math.round(viewportSize.width * viewportSize.dpr)}
        height={Math.round(viewportSize.height * viewportSize.dpr)}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: `${viewportSize.width}px`,
          height: `${viewportSize.height}px`,
          zIndex: 25,
          pointerEvents: "none",
        }}
      />
      {/* LAYER 4 (z-index: 30): Precision Crosshair & Reticle (Ghost Canvas) */}
      <canvas
        ref={crosshairCanvasRef}
        width={Math.round(viewportSize.width * viewportSize.dpr)}
        height={Math.round(viewportSize.height * viewportSize.dpr)}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: `${viewportSize.width}px`,
          height: `${viewportSize.height}px`,
          zIndex: 30,
          pointerEvents: "none",
          display: "block",
        }}
      />

      {/* Interactive Manual Seed HUD Banner */}
      {activeSeedTool !== "NONE" && (
        <div
          style={{
            position: "absolute",
            top: "40px",
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: activeSeedTool === "PICK_LOWEST" ? "#FFF8E1" : "#E0F7FA",
            border:
              activeSeedTool === "PICK_LOWEST" ? "2px solid #FF8F00" : "2px solid #00ACC1",
            borderRadius: "6px",
            padding: "8px 18px",
            boxShadow: "0 4px 16px rgba(0,0,0,0.22)",
            display: "flex",
            alignItems: "center",
            gap: "14px",
            zIndex: 100,
            fontFamily: "'Courier New', Courier, monospace",
            fontWeight: "bold",
            fontSize: "12px",
            color: "#1E2A24",
            pointerEvents: "auto",
          }}
        >
          <span>
            {activeSeedTool === "PICK_LOWEST"
              ? "🎯 CLICK CHART OR CANDLE TO SET LOWEST SEED (TIME + PRICE)"
              : "🎯 CLICK CHART OR CANDLE TO SET HIGHEST SEED (TIME + PRICE)"}
          </span>
          <button
            onClick={(ev) => {
              ev.stopPropagation();
              setActiveSeedTool("NONE");
            }}
            style={{
              backgroundColor: "#C62828",
              color: "#FFF",
              border: "none",
              borderRadius: "4px",
              padding: "4px 10px",
              cursor: "pointer",
              fontSize: "11px",
              fontFamily: "'Courier New', Courier, monospace",
              fontWeight: "bold",
            }}
          >
            ✕ Cancel
          </button>
        </div>
      )}
    </div>
  );
};
