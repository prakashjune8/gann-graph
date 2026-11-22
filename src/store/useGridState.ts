import { create } from "zustand";
import { Point2D, GridCoord, SwingPoint, CandleData, ChartDisplayMode, ManualSeedPoint } from "../types/gann";
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

/**
 * Clamps camera pan strictly to Quadrant I (+x >= 0, +y >= 0) anchored at origin (0, 0).
 * Prevents camera pan from exposing negative time columns (x < 0) or negative price rows (y < 0).
 */
export function clampPanToQuadrant1(
  pan: Point2D,
  _screenWidth: number,
  screenHeight: number,
  showLeftAxis: boolean = true,
  showBottomAxis: boolean = true
): Point2D {
  const leftOffset = showLeftAxis ? 84 : 0;
  const bottomOffset = showBottomAxis ? 32 : 0;
  const topOffset = 30;
  // In screen space:
  // screenX = pan.x + worldX * zoom. For worldX >= 0, screenX >= pan.x.
  // To prevent worldX < 0 from appearing right of left ruler, pan.x cannot exceed leftOffset:
  const clampedX = Math.min(leftOffset, Math.round(pan.x));
  // 20% vertical viewport cushion below the 0 baseline:
  // Allows the 0 baseline (worldY = 0, screenY = pan.y) to sit up to 20% of the active
  // canvas height above the bottom ruler, giving breathing space so low candles & downward rays
  // are never jammed at the bottom edge, while keeping origin fixed at (0, 0) and prices >= 0:
  const availableH = Math.max(100, screenHeight - topOffset - bottomOffset);
  const bottomCushion = Math.round(availableH * 0.20);
  const minPanY = Math.round(screenHeight - bottomOffset - bottomCushion);
  const clampedY = Math.max(minPanY, Math.round(pan.y));
  return { x: clampedX, y: clampedY };
}

// Generates rich sample multi-session data with classic Japanese candlestick patterns & swing pivots
function generateSampleCandleDataset(basePrice = 0, pricePerUnit = 25.0): {
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

  // Dynamic Price Ceiling & Headroom (+10% above dataset highest price)
  highestPrice: number;       // Dataset-wide origin high
  lowestPrice: number;        // Dataset-wide origin low (>= 0)
  priceCeiling: number;       // Dynamic +10% Upper Ceiling (datasetMax * 1.10)
  visibleHighestPrice: number;// Active-window visible high
  visibleLowestPrice: number; // Active-window visible low (>= 0)

  // Manual Lowest & Highest Seed State (Time + Price)
  lowestSeed: ManualSeedPoint | null;
  highestSeed: ManualSeedPoint | null;
  activeSeedTool: "NONE" | "PICK_LOWEST" | "PICK_HIGHEST";

  // Auto-Fit Y Mode: automatically scales and centers visible candles vertically during horizontal navigation
  autoFitY: boolean;

  // Custom Scale & Vibration Lock State
  customScaleLocked: boolean;
  scaleLockMode: "AUTO_FIT" | "CUSTOM" | "VIBRATION_LOCKED";
  vibrationRay: {
    originCol: number;
    originPrice: number;
    originDate?: string;
    scale: number;
    type: "BULL" | "BEAR";
    active: boolean;
    touchCount?: number;
    breachCount?: number;
    score?: number;
    touches?: { col: number; price: number; date: string }[];
    breaches?: { col: number; price: number; date: string }[];
  } | null;

  // Vault Live Sync Status Badge
  vaultSyncBadge: {
    visible: boolean;
    text: string;
    timestamp: number;
  };

  // Actions
  setVaultSyncBadge: (badge: { visible: boolean; text: string; timestamp: number }) => void;
  setCustomScale: (scale: number) => void;
  setVibrationRay: (ray: GridState["vibrationRay"]) => void;
  clearVibrationRay: () => void;
  toggleAutoFitY: () => void;
  setAutoFitY: (enabled: boolean) => void;
  panHorizontal: (deltaX: number) => void;
  setPanX: (targetPanX: number) => void;
  setLowestSeed: (seed: ManualSeedPoint | null) => void;
  setHighestSeed: (seed: ManualSeedPoint | null) => void;
  setActiveSeedTool: (tool: "NONE" | "PICK_LOWEST" | "PICK_HIGHEST") => void;
  clearManualSeeds: () => void;
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
  setTimePerUnit: (timePerUnit: string) => void;
  setPriceCeiling: (ceiling: number) => void;
  setVisiblePriceExtremes: (high: number, low: number) => void;
  calibratePriceScale: (input: CandleData[] | number, maintainCenterPrice?: number) => void;
  fitViewportToActiveCandles: (overridePanX?: number) => void;
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

export const useGridState = create<GridState>((set, get) => ({
  pan: { x: 84, y: 868 },
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

  // Default to clean CANDLESTICK mode for initial view; user can toggle Hybrid, OHLC, or Swing Steps
  chartMode: "CANDLESTICK",
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

  basePrice: 0,
  pricePerUnit: 25.0,
  timePerUnit: "1 Day",

  candles: [],
  swingPoints: [],
  patternCount: 0,

  highestPrice: 22520,
  lowestPrice: 21380,
  priceCeiling: 24772, // 22520 * 1.10 (+10% Headroom)
  visibleHighestPrice: 22520,
  visibleLowestPrice: 21380,

  lowestSeed: null,
  highestSeed: null,
  activeSeedTool: "NONE",

  autoFitY: true,
  customScaleLocked: false,
  scaleLockMode: "AUTO_FIT",
  vibrationRay: null,

  vaultSyncBadge: { visible: false, text: "", timestamp: 0 },
  setVaultSyncBadge: (badge) => set({ vaultSyncBadge: badge }),

  setCustomScale: (scale: number) => {
    if (!Number.isFinite(scale) || scale <= 0) return;
    const clampedScale = Math.min(10000, Math.max(0.01, Math.round(scale * 100) / 100));
    const { visibleHighestPrice, visibleLowestPrice } = get();
    const centerPrice = Number.isFinite(visibleHighestPrice) && visibleHighestPrice > 0
      ? (visibleHighestPrice + (visibleLowestPrice || 0)) / 2
      : 22000;
    get().calibratePriceScale(clampedScale, centerPrice);
    set({
      autoFitY: false,
      customScaleLocked: true,
      scaleLockMode: "CUSTOM",
    });
  },

  setVibrationRay: (ray) => {
    set({
      vibrationRay: ray,
      customScaleLocked: true,
      scaleLockMode: "VIBRATION_LOCKED",
    });
  },

  clearVibrationRay: () => {
    set({ vibrationRay: null });
  },

  toggleAutoFitY: () => {
    const nextVal = !get().autoFitY;
    set({
      autoFitY: nextVal,
      customScaleLocked: nextVal ? false : get().customScaleLocked,
      scaleLockMode: nextVal ? "AUTO_FIT" : (get().scaleLockMode === "AUTO_FIT" ? "CUSTOM" : get().scaleLockMode),
    });
    if (nextVal) {
      get().fitViewportToActiveCandles();
    }
  },

  setAutoFitY: (enabled: boolean) => {
    set({
      autoFitY: enabled,
      customScaleLocked: enabled ? false : get().customScaleLocked,
      scaleLockMode: enabled ? "AUTO_FIT" : (get().scaleLockMode === "AUTO_FIT" ? "CUSTOM" : get().scaleLockMode),
    });
    if (enabled) {
      get().fitViewportToActiveCandles();
    }
  },

  panHorizontal: (deltaX: number) => {
    const { pan, autoFitY, fitViewportToActiveCandles, setPan, showLeftAxis } = get();
    const leftOffset = showLeftAxis ? 84 : 0;
    const nextPanX = Math.min(leftOffset, Math.round(pan.x + deltaX));
    if (autoFitY) {
      fitViewportToActiveCandles(nextPanX);
    } else {
      setPan({ x: nextPanX, y: pan.y });
    }
  },

  setPanX: (targetPanX: number) => {
    const { pan, autoFitY, fitViewportToActiveCandles, setPan, showLeftAxis } = get();
    const leftOffset = showLeftAxis ? 84 : 0;
    const nextPanX = Math.min(leftOffset, Math.round(targetPanX));
    if (autoFitY) {
      fitViewportToActiveCandles(nextPanX);
    } else {
      setPan({ x: nextPanX, y: pan.y });
    }
  },

  setLowestSeed: (seed) => set({ lowestSeed: seed }),
  setHighestSeed: (seed) => set({ highestSeed: seed }),
  setActiveSeedTool: (tool) => set({ activeSeedTool: tool }),
  clearManualSeeds: () => set({ lowestSeed: null, highestSeed: null, activeSeedTool: "NONE" }),

  setPan: (pan) => {
    const { screenWidth, screenHeight, showLeftAxis, showBottomAxis } = get();
    const clamped = clampPanToQuadrant1(pan, screenWidth, screenHeight, showLeftAxis, showBottomAxis);
    set({ pan: clamped });
  },

  panBy: (deltaX, deltaY) => {
    const { pan, screenWidth, screenHeight, showLeftAxis, showBottomAxis } = get();
    const clamped = clampPanToQuadrant1(
      { x: pan.x + deltaX, y: pan.y + deltaY },
      screenWidth,
      screenHeight,
      showLeftAxis,
      showBottomAxis
    );
    set({ pan: clamped });
  },

  // Strictly isotropic cursor-centered zoom: X and Y scale by identical factor with safety bounds
  zoomAt: (screenX, screenY, zoomFactorDelta) => {
    const { pan, zoom, minZoom, maxZoom, screenWidth, screenHeight, showLeftAxis, showBottomAxis } = get();
    // Safety clamp: Prevent negative factors, inversion, or wild leaps (>1.25 or <0.80) in a single frame
    const safeFactor = Math.max(0.80, Math.min(1.25, zoomFactorDelta));
    const nextZoom = Math.min(Math.max(zoom * safeFactor, minZoom), maxZoom);
    if (Math.abs(nextZoom - zoom) < 0.00001) return;

    // Cartesian World coordinates where Y increases upwards
    const worldX = (screenX - pan.x) / zoom;
    const worldY = (pan.y - screenY) / zoom;

    const nextPanX = Math.round(screenX - worldX * nextZoom);
    const nextPanY = Math.round(screenY + worldY * nextZoom);

    const clamped = clampPanToQuadrant1(
      { x: nextPanX, y: nextPanY },
      screenWidth,
      screenHeight,
      showLeftAxis,
      showBottomAxis
    );

    set({
      zoom: nextZoom,
      pan: clamped,
    });
  },

  setZoom: (newZoom) => {
    const { minZoom, maxZoom } = get();
    set({ zoom: Math.min(Math.max(newZoom, minZoom), maxZoom) });
  },

  resetView: (_canvasWidth = 1440, canvasHeight = 900) => {
    const { showLeftAxis, showBottomAxis, showTopAxis } = get();
    const leftOffset = showLeftAxis ? 84 : 0;
    const bottomOffset = showBottomAxis ? 32 : 0;
    const topOffset = showTopAxis ? 30 : 0;
    const availableH = Math.max(100, canvasHeight - topOffset - bottomOffset);
    const bottomCushion = Math.round(availableH * 0.20);
    set({
      pan: { x: leftOffset, y: Math.round(canvasHeight - bottomOffset - bottomCushion) },
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
      showLeftAxis,
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
    const leftOffset = showLeftAxis ? 84 : 0;
    const futureBuffer = 3.5 * majorUnit * zoom + rightRulerOffset;

    const latestWorldX = maxCol * baseUnit;
    const targetPanX = Math.min(leftOffset, Math.round(viewportWidth - futureBuffer - latestWorldX * zoom));

    if (get().autoFitY) {
      get().fitViewportToActiveCandles(targetPanX);
      return;
    }

    let targetPanY = get().pan.y;
    if (latestCandle) {
      const latestWorldY = priceToWorldY(latestCandle.close);
      const topOffset = showTopAxis ? 30 : 0;
      const bottomOffset = showBottomAxis ? 32 : 0;
      const centerY = (viewportHeight + topOffset - bottomOffset) / 2;
      targetPanY = centerY + latestWorldY * zoom;
    }

    const clamped = clampPanToQuadrant1(
      { x: targetPanX, y: targetPanY },
      viewportWidth,
      viewportHeight,
      showLeftAxis,
      showBottomAxis
    );

    set({
      pan: clamped,
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
      cursorWorld: { x: Math.max(0, Math.round(world.x)), y: Math.max(0, Math.round(world.y)) },
      cursorGrid: { col: Math.max(0, grid.col), row: Math.max(0, grid.row) },
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

  setTimePerUnit: (timePerUnit) => set({ timePerUnit }),
  setPriceCeiling: (ceiling) => set({ priceCeiling: Math.max(0, ceiling) }),
  setVisiblePriceExtremes: (high, low) =>
    set({
      visibleHighestPrice: Math.max(0, high),
      visibleLowestPrice: Math.max(0, low),
    }),

  // Gann Harmonic Auto-Scale Calibrator (Sprint 1 & Auto-Scale V2 Anchor Patch)
  calibratePriceScale: (input: CandleData[] | number, maintainCenterPrice?: number) => {
    if (typeof input === "number") {
      if (Number.isFinite(input) && input > 0) {
        // Hard clamping guard: Prevent any scale explosion (standard equity/index scale is 0.1 to 1000)
        const newScale = Math.min(10000, Math.max(0.01, input));
        const { pan, zoom, baseUnit, screenHeight } = get();
        const updates: Partial<GridState> = { pricePerUnit: newScale };

        if (maintainCenterPrice !== undefined && Number.isFinite(maintainCenterPrice)) {
          const zoomVal = typeof zoom === "number" ? zoom : ((zoom as any).y ?? 1.0);
          const safeDivisor = Math.max(0.0001, newScale);
          const newWorldY = (maintainCenterPrice / safeDivisor) * baseUnit;
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
      if (Number.isFinite(c.high) && c.high > 0 && c.high > maxPrice) maxPrice = c.high;
      if (Number.isFinite(c.low) && c.low > 0 && c.low < minPrice) minPrice = c.low;
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

    const safeLowest = Math.max(0, Number.isFinite(minPrice) ? minPrice : 0);
    const safeHighest = maxPrice;
    // Dynamic +10% Upper Ceiling
    const dynamicPriceCeiling = Math.round(safeHighest * 1.10 * 100) / 100;

    const updates: Partial<GridState> = {
      pricePerUnit: closestHarmonic,
      basePrice: 0,
      highestPrice: safeHighest,
      lowestPrice: safeLowest,
      priceCeiling: dynamicPriceCeiling,
    };

    if (maintainCenterPrice !== undefined && Number.isFinite(maintainCenterPrice)) {
      const { pan, zoom, baseUnit, screenHeight } = get();
      const zoomVal = typeof zoom === "number" ? zoom : ((zoom as any).y ?? 1.0);
      const safeDivisor = Math.max(0.0001, closestHarmonic);
      const newWorldY = (maintainCenterPrice / safeDivisor) * baseUnit;
      const canvasH = screenHeight || (typeof window !== "undefined" ? window.innerHeight : 900);
      const centerY = canvasH / 2;
      const newPanY = Math.round(centerY + newWorldY * zoomVal);
      updates.pan = { x: pan.x, y: newPanY };
    }

    set(updates);
  },

  fitViewportToActiveCandles: (overridePanX?: number) => {
    const {
      candles,
      pan,
      zoom,
      baseUnit,
      screenWidth,
      screenHeight,
      showTopAxis,
      showBottomAxis,
    } = get();

    if (!candles || candles.length === 0) return;

    const currentPanX = overridePanX !== undefined ? overridePanX : pan.x;
    const screenW = screenWidth || (typeof window !== "undefined" ? window.innerWidth : 1440);
    const screenH = screenHeight || (typeof window !== "undefined" ? window.innerHeight : 900);
    const zoomVal = typeof zoom === "number" ? zoom : ((zoom as any).y ?? 1.0);

    // 1. Calculate active horizontal column bounds from target pan.x & zoom
    const leftWorldX = (0 - currentPanX) / zoomVal;
    const rightWorldX = (screenW - currentPanX) / zoomVal;
    const minVisCol = Math.min(leftWorldX, rightWorldX) / baseUnit;
    const maxVisCol = Math.max(leftWorldX, rightWorldX) / baseUnit;

    // 2. Fetch active visible candles (with a 2-column margin)
    let activeCandles = candles.filter(
      (c) => c.gridCol >= minVisCol - 2 && c.gridCol <= maxVisCol + 2
    );

    // Fallback: If panning over a gap or no candles are directly in view, find nearest bars
    if (activeCandles.length === 0) {
      const midCol = (minVisCol + maxVisCol) / 2;
      let closestCandle = candles[0];
      let minDiff = Math.abs(candles[0].gridCol - midCol);
      for (let i = 1; i < candles.length; i++) {
        const diff = Math.abs(candles[i].gridCol - midCol);
        if (diff < minDiff) {
          minDiff = diff;
          closestCandle = candles[i];
        }
      }
      const closestIdx = candles.indexOf(closestCandle);
      const startIdx = Math.max(0, closestIdx - 5);
      const endIdx = Math.min(candles.length, closestIdx + 6);
      activeCandles = candles.slice(startIdx, endIdx);
    }

    // 3. Compute localMinLow and localMaxHigh strictly from active candles
    let localMinLow = Infinity;
    let localMaxHigh = -Infinity;
    for (let i = 0; i < activeCandles.length; i++) {
      const c = activeCandles[i];
      if (Number.isFinite(c.low) && c.low > 0 && c.low < localMinLow) localMinLow = c.low;
      if (Number.isFinite(c.high) && c.high > 0 && c.high > localMaxHigh) localMaxHigh = c.high;
    }

    if (!Number.isFinite(localMinLow) || !Number.isFinite(localMaxHigh) || localMaxHigh <= 0) {
      if (overridePanX !== undefined) {
        set({ pan: { x: currentPanX, y: pan.y } });
      }
      return;
    }

    // 4. Dynamic +10% Upper Ceiling Headroom & Non-negative Lower Floor
    const localCeiling = Math.round(localMaxHigh * 1.10 * 100) / 100;
    const priceSpan = Math.max(1, localCeiling - localMinLow);

    // Available vertical canvas height (excluding rulers and padding)
    const topOffset = showTopAxis ? 30 : 0;
    const bottomOffset = showBottomAxis ? 32 : 0;
    const availableH = Math.max(150, screenH - topOffset - bottomOffset - 40);

    // Number of base minor squares in available unzoomed pixel height
    const numGridSquares = availableH / baseUnit;
    const rawIdealScale = priceSpan / numGridSquares;

    // Institutional Gann Harmonic Scale Ladders
    const harmonics = [
      0.01, 0.02, 0.025, 0.05,
      0.1, 0.125, 0.2, 0.25, 0.333, 0.375, 0.5, 0.666, 0.75, 0.875,
      1, 1.25, 1.5, 2, 2.5, 3.333, 3.75, 5, 6.666, 7.5, 8.75,
      10, 12.5, 15, 20, 25, 33.33, 37.5, 50, 66.66, 75, 87.5,
      100, 125, 150, 200, 250, 333.3, 375, 500, 666.6, 750, 875, 1000,
      1250, 1500, 2000, 2500, 3333, 3750, 5000, 10000,
    ];

    let safeScale = harmonics[0];
    let minDiff = Math.abs(rawIdealScale - harmonics[0]);
    for (let i = 1; i < harmonics.length; i++) {
      const diff = Math.abs(rawIdealScale - harmonics[i]);
      if (diff < minDiff) {
        minDiff = diff;
        safeScale = harmonics[i];
      }
    }
    safeScale = Math.min(10000, Math.max(0.01, safeScale));

    // Respect Custom Scale or Vibration Lock: Do not overwrite scale if user explicitly locked it
    const isScaleLocked = get().customScaleLocked || get().scaleLockMode !== "AUTO_FIT";
    const effectiveScale = isScaleLocked ? get().pricePerUnit : safeScale;

    // 5. Origin is locked permanently at (0, 0) with basePrice = 0
    // Vertical centering: midpoint of [localCeiling, localMinLow] aligns with canvas vertical center
    const centerPrice = (localCeiling + localMinLow) / 2;
    const centerY = (screenH + topOffset - bottomOffset) / 2;
    const centerWorldY = (centerPrice / effectiveScale) * baseUnit;
    const rawTargetPanY = Math.round(centerY + centerWorldY * zoomVal);
    // 20% vertical viewport cushion below 0 baseline:
    const bottomCushion = Math.round(availableH * 0.20);
    const minPanY = Math.round(screenH - bottomOffset - bottomCushion);
    const targetPanY = Math.max(minPanY, rawTargetPanY);

    const { showLeftAxis } = get();
    const leftOffset = showLeftAxis ? 84 : 0;
    const safePanX = Math.min(leftOffset, currentPanX);

    set({
      pricePerUnit: effectiveScale,
      basePrice: 0,
      priceCeiling: localCeiling,
      visibleHighestPrice: localMaxHigh,
      visibleLowestPrice: localMinLow,
      pan: {
        x: safePanX,
        y: targetPanY,
      },
    });
  },

  setCandles: (candles) => {
    let maxPrice = -Infinity;
    let minPrice = Infinity;
    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      if (Number.isFinite(c.high) && c.high > 0 && c.high > maxPrice) maxPrice = c.high;
      if (Number.isFinite(c.low) && c.low > 0 && c.low < minPrice) minPrice = c.low;
    }
    if (candles.length > 0) {
      get().calibratePriceScale(candles);
    }
    const count = candles.filter((c) => c.pattern).length;
    const updates: Partial<GridState> = { candles, patternCount: count };
    if (Number.isFinite(maxPrice) && maxPrice > 0) {
      const safeLowest = Math.max(0, Number.isFinite(minPrice) ? minPrice : 0);
      updates.highestPrice = maxPrice;
      updates.lowestPrice = safeLowest;
      updates.priceCeiling = Math.round(maxPrice * 1.10 * 100) / 100;
      updates.visibleHighestPrice = maxPrice;
      updates.visibleLowestPrice = safeLowest;
    }
    set(updates);
  },
  setDataset: (candles) => {
    let maxPrice = -Infinity;
    let minPrice = Infinity;
    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      if (Number.isFinite(c.high) && c.high > 0 && c.high > maxPrice) maxPrice = c.high;
      if (Number.isFinite(c.low) && c.low > 0 && c.low < minPrice) minPrice = c.low;
    }
    if (candles.length > 0) {
      get().calibratePriceScale(candles);
    }
    const count = candles.filter((c) => c.pattern).length;
    const updates: Partial<GridState> = { candles, patternCount: count };
    if (Number.isFinite(maxPrice) && maxPrice > 0) {
      const safeLowest = Math.max(0, Number.isFinite(minPrice) ? minPrice : 0);
      updates.highestPrice = maxPrice;
      updates.lowestPrice = safeLowest;
      updates.priceCeiling = Math.round(maxPrice * 1.10 * 100) / 100;
      updates.visibleHighestPrice = maxPrice;
      updates.visibleLowestPrice = safeLowest;
    }
    set(updates);
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
      set({ pricePerUnit: 25.0, basePrice: 0 });
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
    return ((price - (basePrice || 0)) / safeDivisor) * baseUnit;
  },

  // World Y (in pixels) -> Price (in Rupees) - Strictly non-negative (>= 0)
  worldYToPrice: (worldY: number) => {
    const { basePrice, pricePerUnit, baseUnit } = get();
    const safeDivisor = Math.min(10000, Math.max(0.0001, pricePerUnit));
    const safeWorldY = Math.max(0, worldY);
    return Math.max(0, (basePrice || 0) + (safeWorldY / baseUnit) * safeDivisor);
  },

  // Alias for worldYToPrice
  worldToPrice: (worldY: number) => {
    return get().worldYToPrice(worldY);
  },

  // Snap continuous world coordinates strictly within Quadrant I (+x >= 0, +y >= 0)
  snapWorldToGrid: (worldX, worldY) => {
    const { baseUnit } = get();
    const safeWorldX = Math.max(0, worldX);
    const safeWorldY = Math.max(0, worldY);
    const snappedX = Math.round(safeWorldX / baseUnit) * baseUnit;
    const snappedY = Math.round(safeWorldY / baseUnit) * baseUnit;
    const col = Math.max(0, Math.round(snappedX / baseUnit));
    const row = Math.max(0, Math.round(snappedY / baseUnit));
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
