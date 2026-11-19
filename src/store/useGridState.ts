import { create } from "zustand";
import { Point2D, GridCoord, SwingPoint, CandleData, ChartDisplayMode } from "../types/gann";
import { identifyCandlestickPatterns } from "../utils/candlestickPatterns";
import { verifyKeEAspectRatio, SentinelAuditResult } from "../utils/ratioSentinel";

// Hysteresis Cache Reset: Purge any persisted grid-state-storage from localStorage on reload
if (typeof window !== "undefined") {
  try {
    localStorage.removeItem("grid-state-storage");
    localStorage.removeItem("gann-grid-state");
  } catch {
    // Ignore storage access errors
  }
}

// Generates rich sample multi-session data with classic Japanese candlestick patterns & swing pivots
function generateSampleCandleDataset(basePrice = 21500, pricePerUnit = 25.0): {
  candles: CandleData[];
  swings: SwingPoint[];
} {
  const rawCandles: Omit<CandleData, "pattern" | "patternType" | "patternDescription">[] = [
    // Session 1-4: Accumulation / Double Bottom with Hammer
    { id: "c-0", timestamp: "Day 01", open: 21620, high: 21680, low: 21580, close: 21600, volume: 145000, gridCol: 0 },
    { id: "c-1", timestamp: "Day 02", open: 21590, high: 21610, low: 21490, close: 21510, volume: 182000, gridCol: 2 },
    { id: "c-2", timestamp: "Day 03", open: 21500, high: 21560, low: 21380, close: 21540, volume: 245000, gridCol: 4 }, // Hammer
    { id: "c-3", timestamp: "Day 04", open: 21550, high: 21740, low: 21530, close: 21720, volume: 290000, gridCol: 6 }, // Bullish Engulfing

    // Session 5-8: Trend Advance along Gann 1x1 angle
    { id: "c-4", timestamp: "Day 05", open: 21720, high: 21850, low: 21710, close: 21840, volume: 210000, gridCol: 8 },
    { id: "c-5", timestamp: "Day 06", open: 21840, high: 21990, low: 21820, close: 21980, volume: 260000, gridCol: 10 },
    { id: "c-6", timestamp: "Day 07", open: 21990, high: 22150, low: 21970, close: 22140, volume: 320000, gridCol: 12 }, // Marubozu
    { id: "c-7", timestamp: "Day 08", open: 22150, high: 22280, low: 22120, close: 22160, volume: 380000, gridCol: 14 }, // Shooting Star Peak

    // Session 9-12: Corrective Retracement to 50% equilibrium
    { id: "c-8", timestamp: "Day 09", open: 22140, high: 22160, low: 21960, close: 21980, volume: 275000, gridCol: 16 }, // Bearish Engulfing
    { id: "c-9", timestamp: "Day 10", open: 21980, high: 22020, low: 21840, close: 21860, volume: 195000, gridCol: 18 },
    { id: "c-10", timestamp: "Day 11", open: 21850, high: 21880, low: 21780, close: 21820, volume: 160000, gridCol: 20 }, // Doji
    { id: "c-11", timestamp: "Day 12", open: 21820, high: 21950, low: 21750, close: 21930, volume: 230000, gridCol: 22 }, // Morning Star Complete

    // Session 13-16: Second Wave Breakout to Square of 9 target
    { id: "c-12", timestamp: "Day 13", open: 21940, high: 22120, low: 21920, close: 22100, volume: 280000, gridCol: 24 },
    { id: "c-13", timestamp: "Day 14", open: 22110, high: 22290, low: 22080, close: 22270, volume: 310000, gridCol: 26 },
    { id: "c-14", timestamp: "Day 15", open: 22280, high: 22480, low: 22250, close: 22460, volume: 410000, gridCol: 28 }, // Strong Bull
    { id: "c-15", timestamp: "Day 16", open: 22470, high: 22520, low: 22400, close: 22420, volume: 330000, gridCol: 30 }, // Gravestone Doji
    { id: "c-16", timestamp: "Day 17", open: 22410, high: 22440, low: 22240, close: 22260, volume: 290000, gridCol: 32 },
  ];

  const analyzedCandles = identifyCandlestickPatterns(rawCandles as CandleData[]);

  // Corresponding Gann Swing points (aligned to highs and lows)
  const swings: SwingPoint[] = [
    {
      id: "sw-1",
      timeStr: "Day 03",
      price: 21380,
      gridCol: 4,
      gridRow: Math.round((21380 - basePrice) / pricePerUnit),
      type: "SWING_LOW",
      label: "Support Low (Hammer)",
    },
    {
      id: "sw-2",
      timeStr: "Day 08",
      price: 22280,
      gridCol: 14,
      gridRow: Math.round((22280 - basePrice) / pricePerUnit),
      type: "SWING_HIGH",
      label: "Swing High (Shooting Star)",
    },
    {
      id: "sw-3",
      timeStr: "Day 11",
      price: 21750,
      gridCol: 22,
      gridRow: Math.round((21750 - basePrice) / pricePerUnit),
      type: "SWING_LOW",
      label: "Gann 50% Retracement",
    },
    {
      id: "sw-4",
      timeStr: "Day 16",
      price: 22520,
      gridCol: 30,
      gridRow: Math.round((22520 - basePrice) / pricePerUnit),
      type: "SWING_HIGH",
      label: "Square of 9 Target",
    },
  ];

  return { candles: analyzedCandles, swings };
}

export interface GridState {
  // Camera View
  pan: Point2D;
  zoom: number;
  minZoom: number;
  maxZoom: number;

  // W.D. Gann K&E 8x8 Grid Constants (Immutable 1:1 Aspect Ratio)
  readonly baseUnit: number;  // 12px = 1 minor square (1/8th inch)
  readonly majorUnit: number; // 96px = 1 major block (1 inch = 8 * 12px)
  readonly subdivisions: number; // 8 minor squares per major block
  aspectRatioAudit: SentinelAuditResult;
  validateAspectRatio: () => SentinelAuditResult;

  // Chart Rendering Mode: Candlestick, OHLC Bar, Swing Step, or Hybrid
  chartMode: ChartDisplayMode;
  showPatterns: boolean;
  showVolumeBars: boolean;

  // Four-Sided Axis Visibility Toggles (Step 1.5)
  showTopAxis: boolean;
  showBottomAxis: boolean;
  showLeftAxis: boolean;
  showRightAxis: boolean;
  isAxisTransparent: boolean;
  showCrosshair: boolean;

  // Active Cursor Coordinate Tracking
  cursorScreen: Point2D;
  cursorWorld: Point2D;
  cursorGrid: GridCoord;
  isHovered: boolean;

  // Viewport Screen Dimensions
  screenWidth: number;
  screenHeight: number;

  // Market Datasets
  basePrice: number;    // Base price anchor for row = 0
  pricePerUnit: number; // Price points per baseUnit minor square (e.g. ₹25.00/square)
  timePerUnit: string;  // e.g. "1 Day" or "60 Min" per baseUnit minor square
  candles: CandleData[];
  swingPoints: SwingPoint[];
  patternCount: number; // Memoized count of flagged candlestick patterns (Audit 3.3)

  // Actions
  setPan: (pan: Point2D) => void;
  panBy: (deltaX: number, deltaY: number) => void;
  zoomAt: (screenX: number, screenY: number, zoomFactorDelta: number) => void;
  setZoom: (zoom: number) => void;
  resetView: (canvasWidth?: number, canvasHeight?: number) => void;
  jumpToLatest: (viewportWidth?: number, viewportHeight?: number) => void;
  updateCursor: (screenX: number, screenY: number) => void;
  setHovered: (hovered: boolean) => void;

  // Display Mode & Toggle Actions
  setChartMode: (mode: ChartDisplayMode) => void;
  setShowPatterns: (show: boolean) => void;
  setShowVolumeBars: (show: boolean) => void;
  toggleTopAxis: () => void;
  toggleBottomAxis: () => void;
  toggleLeftAxis: () => void;
  toggleRightAxis: () => void;
  toggleAxisTransparency: () => void;
  toggleCrosshair: () => void;

  // Data Actions
  calibratePriceScale: (input: CandleData[] | number, maintainCenterPrice?: number) => void;
  setCandles: (candles: CandleData[]) => void;
  setDataset: (candles: CandleData[]) => void;
  addSwingPoint: (point: SwingPoint) => void;
  setSwingPoints: (points: SwingPoint[]) => void;
  clearAllData: () => void;
  loadSampleDataset: () => void;
  resetScale: () => void;

  // Pure Geometric Calculations
  screenToWorld: (screenX: number, screenY: number) => Point2D;
  worldToScreen: (worldX: number, worldY: number) => Point2D;
  priceToWorldY: (price: number) => number;
  worldYToPrice: (worldY: number) => number;
  worldToPrice: (worldY: number) => number;
  snapWorldToGrid: (worldX: number, worldY: number) => {
    snappedX: number;
    snappedY: number;
    col: number;
    row: number;
  };
  screenToGrid: (screenX: number, screenY: number) => {
    col: number;
    row: number;
    snappedScreenX: number;
    snappedScreenY: number;
  };
}

const initialData = generateSampleCandleDataset(21500, 25.0);

export const useGridState = create<GridState>((set, get) => ({
  pan: { x: 220, y: 560 },
  zoom: 1.0,
  minZoom: 0.15,
  maxZoom: 6.0,

  baseUnit: 12,
  majorUnit: 96,
  subdivisions: 8,
  aspectRatioAudit: verifyKeEAspectRatio(12, 96),
  validateAspectRatio: () => {
    const audit = verifyKeEAspectRatio(get().baseUnit, get().majorUnit);
    if (audit.correctionApplied) {
      set({
        baseUnit: audit.baseUnit,
        majorUnit: audit.majorUnit,
        subdivisions: audit.subdivisions,
        aspectRatioAudit: audit,
      });
    }
    return audit;
  },

  // Default to HYBRID_CANDLE_SWING for multi-perspective geometric analysis
  chartMode: "HYBRID_CANDLE_SWING",
  showPatterns: true,
  showVolumeBars: true,

  // Four-Sided Axis Defaults
  showTopAxis: true,
  showBottomAxis: true,
  showLeftAxis: true,
  showRightAxis: true,
  isAxisTransparent: false,
  showCrosshair: true,

  cursorScreen: { x: 0, y: 0 },
  cursorWorld: { x: 0, y: 0 },
  cursorGrid: { col: 0, row: 0 },
  isHovered: false,

  screenWidth: typeof window !== "undefined" ? window.innerWidth : 1440,
  screenHeight: typeof window !== "undefined" ? window.innerHeight : 900,

  basePrice: 21500,
  pricePerUnit: 25.0,
  timePerUnit: "1 Day",

  candles: initialData.candles,
  swingPoints: initialData.swings,
  patternCount: initialData.candles.filter((c) => c.pattern).length,

  setPan: (pan) =>
    set({
      pan: {
        x: Math.round(pan.x),
        y: Math.round(pan.y),
      },
    }),

  panBy: (deltaX, deltaY) =>
    set((state) => ({
      pan: {
        x: Math.round(state.pan.x + deltaX),
        y: Math.round(state.pan.y + deltaY),
      },
    })),

  // Strictly isotropic cursor-centered zoom: X and Y scale by identical factor with safety bounds
  zoomAt: (screenX, screenY, zoomFactorDelta) => {
    const { pan, zoom, minZoom, maxZoom } = get();
    // Safety clamp: Prevent negative factors, inversion, or wild leaps (>1.25 or <0.80) in a single frame
    const safeFactor = Math.max(0.80, Math.min(1.25, zoomFactorDelta));
    const nextZoom = Math.min(Math.max(zoom * safeFactor, minZoom), maxZoom);
    if (Math.abs(nextZoom - zoom) < 0.00001) return;

    // Cartesian World coordinates where Y increases upwards
    const worldX = (screenX - pan.x) / zoom;
    const worldY = (pan.y - screenY) / zoom;

    const nextPanX = Math.round(screenX - worldX * nextZoom);
    const nextPanY = Math.round(screenY + worldY * nextZoom);

    set({
      zoom: nextZoom,
      pan: { x: nextPanX, y: nextPanY },
    });
  },

  setZoom: (newZoom) => {
    const { minZoom, maxZoom } = get();
    set({ zoom: Math.min(Math.max(newZoom, minZoom), maxZoom) });
  },

  resetView: (canvasWidth = 1440, canvasHeight = 900) => {
    set({
      pan: { x: Math.round(canvasWidth * 0.12), y: Math.round(canvasHeight * 0.75) },
      zoom: 1.0,
    });
  },

  jumpToLatest: (viewportWidth = 1440, viewportHeight = 900) => {
    const {
      candles,
      swingPoints,
      baseUnit,
      majorUnit,
      zoom,
      priceToWorldY,
      showRightAxis,
      showTopAxis,
      showBottomAxis,
    } = get();
    if (candles.length === 0 && swingPoints.length === 0) return;

    // O(1) Instant Array Traversal (Audit Finding 2.4 Remediation)
    const latestCandle = candles.length > 0 ? candles[candles.length - 1] : null;
    const maxCol = latestCandle
      ? latestCandle.gridCol
      : swingPoints.length > 0
      ? swingPoints[swingPoints.length - 1].gridCol
      : 0;

    // Buffer of 3.5 major units (approx. 336px) on right edge
    const rightRulerOffset = showRightAxis ? 88 : 0;
    const futureBuffer = 3.5 * majorUnit * zoom + rightRulerOffset;

    const latestWorldX = maxCol * baseUnit;
    const targetPanX = viewportWidth - futureBuffer - latestWorldX * zoom;

    let targetPanY = get().pan.y;
    if (latestCandle) {
      const latestWorldY = priceToWorldY(latestCandle.close);
      const topOffset = showTopAxis ? 30 : 0;
      const bottomOffset = showBottomAxis ? 32 : 0;
      const centerY = (viewportHeight + topOffset - bottomOffset) / 2;
      targetPanY = centerY + latestWorldY * zoom;
    }

    set({
      pan: {
        x: Math.round(targetPanX),
        y: Math.round(targetPanY),
      },
    });
  },

  updateCursor: (screenX, screenY) => {
    const rx = Math.round(screenX);
    const ry = Math.round(screenY);
    const { screenToWorld, screenToGrid } = get();
    const world = screenToWorld(rx, ry);
    const grid = screenToGrid(rx, ry);

    set({
      cursorScreen: { x: rx, y: ry },
      cursorWorld: { x: Math.round(world.x), y: Math.round(world.y) },
      cursorGrid: { col: grid.col, row: grid.row },
    });
  },

  setHovered: (hovered) => set({ isHovered: hovered }),

  setChartMode: (mode) => set({ chartMode: mode }),
  setShowPatterns: (show) => set({ showPatterns: show }),
  setShowVolumeBars: (show) => set({ showVolumeBars: show }),
  toggleTopAxis: () => set((s) => ({ showTopAxis: !s.showTopAxis })),
  toggleBottomAxis: () => set((s) => ({ showBottomAxis: !s.showBottomAxis })),
  toggleLeftAxis: () => set((s) => ({ showLeftAxis: !s.showLeftAxis })),
  toggleRightAxis: () => set((s) => ({ showRightAxis: !s.showRightAxis })),
  toggleAxisTransparency: () => set((s) => ({ isAxisTransparent: !s.isAxisTransparent })),
  toggleCrosshair: () => set((s) => ({ showCrosshair: !s.showCrosshair })),

  // Gann Harmonic Auto-Scale Calibrator (Sprint 1 & Auto-Scale V2 Anchor Patch)
  calibratePriceScale: (input: CandleData[] | number, maintainCenterPrice?: number) => {
    if (typeof input === "number") {
      if (Number.isFinite(input) && input > 0) {
        // Hard clamping guard: Prevent any scale explosion (standard equity/index scale is 0.1 to 1000)
        const newScale = Math.min(10000, Math.max(0.01, input));
        const { pan, zoom, baseUnit, basePrice, screenHeight } = get();
        const updates: Partial<GridState> = { pricePerUnit: newScale };

        if (maintainCenterPrice !== undefined && Number.isFinite(maintainCenterPrice)) {
          const zoomVal = typeof zoom === "number" ? zoom : ((zoom as any).y ?? 1.0);
          const safeDivisor = Math.max(0.0001, newScale);
          const newWorldY = ((maintainCenterPrice - basePrice) / safeDivisor) * baseUnit;
          const canvasH = screenHeight || (typeof window !== "undefined" ? window.innerHeight : 900);
          const centerY = canvasH / 2;
          const newPanY = Math.round(centerY + newWorldY * zoomVal);
          updates.pan = { x: pan.x, y: newPanY };
        }

        set(updates);
      }
      return;
    }

    const candles = input;
    if (!candles || candles.length === 0) return;

    let maxPrice = -Infinity;
    let minPrice = Infinity;

    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      if (c.high > maxPrice) maxPrice = c.high;
      if (c.low < minPrice) minPrice = c.low;
    }

    if (!Number.isFinite(maxPrice) || !Number.isFinite(minPrice) || maxPrice <= 0) {
      return;
    }

    // 0.1% Harmonic Snapper: rawScale = maxPrice * 0.001
    const rawScale = maxPrice * 0.001;
    // Gann's Rule of Eighths & Rule of Thirds expanded across base-10 tiers
    const harmonics = [
      0.1, 0.125, 0.2, 0.25, 0.333, 0.375, 0.5, 0.666, 0.75, 0.875,
      1, 1.25, 2, 2.5, 3.333, 3.75, 5, 6.666, 7.5, 8.75,
      10, 12.5, 20, 25, 33.33, 37.5, 50, 66.66, 75, 87.5,
      100, 125, 200, 250, 333.3, 375, 500, 666.6, 750, 875, 1000,
    ];

    // Find closest value in harmonics array to rawScale
    let closestHarmonic = harmonics[0];
    let minDiff = Math.abs(rawScale - harmonics[0]);
    for (let i = 1; i < harmonics.length; i++) {
      const diff = Math.abs(rawScale - harmonics[i]);
      if (diff < minDiff) {
        minDiff = diff;
        closestHarmonic = harmonics[i];
      }
    }

    // Cleanly anchor basePrice to the nearest major 1-inch block (8 minor squares) below minPrice
    const harmonicBlock = closestHarmonic * 8;
    const calculatedBasePrice = Math.max(0, Math.floor(minPrice / harmonicBlock) * harmonicBlock);

    const updates: Partial<GridState> = {
      pricePerUnit: closestHarmonic,
      basePrice: calculatedBasePrice,
    };

    if (maintainCenterPrice !== undefined && Number.isFinite(maintainCenterPrice)) {
      const { pan, zoom, baseUnit, screenHeight } = get();
      const zoomVal = typeof zoom === "number" ? zoom : ((zoom as any).y ?? 1.0);
      const safeDivisor = Math.max(0.0001, closestHarmonic);
      const newWorldY = ((maintainCenterPrice - calculatedBasePrice) / safeDivisor) * baseUnit;
      const canvasH = screenHeight || (typeof window !== "undefined" ? window.innerHeight : 900);
      const centerY = canvasH / 2;
      const newPanY = Math.round(centerY + newWorldY * zoomVal);
      updates.pan = { x: pan.x, y: newPanY };
    }

    set(updates);
  },

  setCandles: (candles) => {
    if (candles.length > 0) {
      get().calibratePriceScale(candles);
    }
    const count = candles.filter((c) => c.pattern).length;
    set({ candles, patternCount: count });
  },
  setDataset: (candles) => {
    if (candles.length > 0) {
      get().calibratePriceScale(candles);
    }
    const count = candles.filter((c) => c.pattern).length;
    set({ candles, patternCount: count });
  },
  addSwingPoint: (point) => set((s) => ({ swingPoints: [...s.swingPoints, point] })),
  setSwingPoints: (points) => set({ swingPoints: points }),

  clearAllData: () => set({ candles: [], swingPoints: [], patternCount: 0 }),

  loadSampleDataset: () => {
    const fresh = generateSampleCandleDataset(get().basePrice, get().pricePerUnit);
    const count = fresh.candles.filter((c) => c.pattern).length;
    set({ candles: fresh.candles, swingPoints: fresh.swings, patternCount: count });
  },

  resetScale: () => {
    const candles = get().candles;
    if (candles && candles.length > 0) {
      get().calibratePriceScale(candles);
    } else {
      set({ pricePerUnit: 25.0, basePrice: 21500 });
    }
  },

  // Conversion: Screen -> World
  screenToWorld: (screenX, screenY) => {
    const { pan, zoom } = get();
    return {
      x: (screenX - pan.x) / zoom,
      y: (pan.y - screenY) / zoom, // Cartesian: Y increases upwards
    };
  },

  // Conversion: World -> Screen
  worldToScreen: (worldX, worldY) => {
    const { pan, zoom } = get();
    return {
      x: Math.round(pan.x + worldX * zoom),
      y: Math.round(pan.y - worldY * zoom), // Cartesian: inverted for screen raster
    };
  },

  // Price (in Rupees) -> World Y (in pixels)
  priceToWorldY: (price: number) => {
    const { basePrice, pricePerUnit, baseUnit } = get();
    const safeDivisor = Math.min(10000, Math.max(0.0001, pricePerUnit));
    return ((price - basePrice) / safeDivisor) * baseUnit;
  },

  // World Y (in pixels) -> Price (in Rupees)
  worldYToPrice: (worldY: number) => {
    const { basePrice, pricePerUnit, baseUnit } = get();
    const safeDivisor = Math.min(10000, Math.max(0.0001, pricePerUnit));
    return basePrice + (worldY / baseUnit) * safeDivisor;
  },

  // Alias for worldYToPrice
  worldToPrice: (worldY: number) => {
    return get().worldYToPrice(worldY);
  },

  // Snap continuous world coordinates to nearest K&E baseUnit intersection using strict integer multiplier
  snapWorldToGrid: (worldX, worldY) => {
    const { baseUnit } = get();
    const snappedX = Math.round(worldX / baseUnit) * baseUnit;
    const snappedY = Math.round(worldY / baseUnit) * baseUnit;
    const col = Math.round(snappedX / baseUnit);
    const row = Math.round(snappedY / baseUnit);
    return {
      snappedX,
      snappedY,
      col,
      row,
    };
  },

  // Screen coordinate to snapped grid col/row
  screenToGrid: (screenX, screenY) => {
    const { screenToWorld, snapWorldToGrid, worldToScreen } = get();
    const world = screenToWorld(screenX, screenY);
    const snapped = snapWorldToGrid(world.x, world.y);
    const screenSnapped = worldToScreen(snapped.snappedX, snapped.snappedY);

    return {
      col: snapped.col,
      row: snapped.row,
      snappedScreenX: Math.round(screenSnapped.x),
      snappedScreenY: Math.round(screenSnapped.y),
    };
  },
}));
