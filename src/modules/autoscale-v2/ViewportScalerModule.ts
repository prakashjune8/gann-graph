/**
 * W.D. Gann Viewport Coordinator & Scaler Module
 * Auto-Scale V2 — Scaler Fix 2
 *
 * Implements the Viewport Coordinator:
 * 1. Traffic Cop Listener: Monitors canvas viewport boundaries (visibleMaxPrice, visibleMinPrice, visibleRange).
 * 2. 3% Hysteresis Deadband: Prevents micro-jitter during pan/zoom by suppressing scale recalculation
 *    when prices remain within the [lockedLowerBoundary * 0.97, lockedUpperBoundary * 1.03] deadband buffer.
 * 3. Dynamic Harmonic Octave Recalculation & Dispatch: Computes the expanded octave vibration
 *    via OctaveMultiplier and dispatches calibratePriceScale(lockedScale) to the core engine.
 */

import { GannModule } from "../../ModuleRegistry";
import { IGridBridge } from "../../core-bridge/GridBridge";
import { extractGenesisNodes } from "./HistoricSeedEngine";
import { getExpandedVibration } from "./OctaveMultiplier";
import { velocityToPricePerUnit } from "./PixelTranslator";

let isScalerActive = true;
let lockedScale: number | null = null;
let lockedMultiplier: number | null = null;
let lockedUpperBoundary = 0;
let lockedLowerBoundary = 0;
let gapLockActive = false;
let unregisterOverlayFn: (() => void) | null = null;
let unsubscribeBridgeFn: (() => void) | null = null;
let isRecalibrating = false;

/**
 * Evaluates current visible price bounds against hysteresis deadbands
 * and recalculates/dispatches the expanded octave scale when boundaries are breached.
 * Enforces The Gap Lock to suppress recalculation loops when panning across overnight price gaps.
 */
function evaluateViewportScale(bridge: IGridBridge, height: number): void {
  if (!isScalerActive || isRecalibrating) return;

  const candles = bridge.getCandles();
  if (!candles || candles.length === 0) return;

  // =========================================================================
  // CORRUPTED STATE SANITY GUARD:
  // If pricePerUnit has leaked or exploded (> 1000 or <= 0), reset to 25.0 immediately
  // =========================================================================
  if (bridge.getPricePerUnit() > 1000 || bridge.getPricePerUnit() <= 0) {
    bridge.calibratePriceScale(25.0);
    lockedScale = null;
    lockedUpperBoundary = 0;
    lockedLowerBoundary = 0;
    lockedMultiplier = null;
    return;
  }

  // =========================================================================
  // 1. DECOUPLED CANDLE-BASED VIEWPORT PRICE BOUNDARIES
  // Calculate price bounds strictly from visible market candles (leftCol to rightCol),
  // NEVER from worldYToPrice(screen pixels), eliminating positive feedback loops.
  // =========================================================================
  const state = bridge.getState();
  const baseUnit = state.baseUnit || 12;
  const screenWidth = state.screenWidth || (typeof window !== "undefined" ? window.innerWidth : 1440);
  const leftWorld = bridge.screenToWorld(0, 0);
  const rightWorld = bridge.screenToWorld(screenWidth, 0);
  const leftCol = Math.min(leftWorld.x, rightWorld.x) / baseUnit;
  const rightCol = Math.max(leftWorld.x, rightWorld.x) / baseUnit;

  // Fetch the currently visible subset of candles based on visible columns
  const visibleCandles = candles.filter((c) => c.gridCol >= leftCol - 2 && c.gridCol <= rightCol + 2);
  const activeCandles = visibleCandles.length > 0 ? visibleCandles : candles;

  let candleMax = -Infinity;
  let candleMin = Infinity;
  for (let i = 0; i < activeCandles.length; i++) {
    const c = activeCandles[i];
    if (c.high > candleMax) candleMax = c.high;
    if (c.low < candleMin) candleMin = c.low;
  }

  const visibleMaxPrice = Number.isFinite(candleMax) && candleMax > 0 ? candleMax : 22520;
  const visibleMinPrice = Number.isFinite(candleMin) && candleMin > 0 ? candleMin : 21380;
  const visibleRange = Math.max(10, visibleMaxPrice - visibleMinPrice);

  // =========================================================================
  // 2. VIEWPORT GAP SCANNER & HYSTERESIS SUPPRESSION PROTOCOL
  // =========================================================================
  let maxVisibleGapPercent = 0;
  for (let i = 1; i < visibleCandles.length; i++) {
    const prev = visibleCandles[i - 1];
    const curr = visibleCandles[i];
    if (prev.close > 0) {
      const gapPercent = Math.abs(curr.open - prev.close) / prev.close;
      if (gapPercent > maxVisibleGapPercent) {
        maxVisibleGapPercent = gapPercent;
      }
    }
  }

  const HYSTERESIS_THRESHOLD = 0.03; // 3%
  const isGapDetected = maxVisibleGapPercent > HYSTERESIS_THRESHOLD;
  gapLockActive = isGapDetected;

  // =========================================================================
  // 3. BOUNDARY DEADBAND CHECK (3% STANDARD vs. 10% GAP LOCK OVERRIDE)
  // =========================================================================
  if (lockedScale !== null && lockedUpperBoundary > 0 && lockedLowerBoundary > 0) {
    if (gapLockActive) {
      // Macro-Scale Override: Widen temporary lock boundaries to +/- 10% to absorb gap volatility
      if (visibleMaxPrice <= lockedUpperBoundary && visibleMinPrice >= lockedLowerBoundary) {
        return;
      }
    } else {
      // Standard 3% Hysteresis Deadband Logic
      const isUpperBreached = visibleMaxPrice > lockedUpperBoundary * 1.03;
      const isLowerBreached = visibleMinPrice < lockedLowerBoundary * 0.97;

      if (!isUpperBreached && !isLowerBreached) {
        // Strictly inside the 3% buffer zone -> maintain buttery smooth chart
        return;
      }
    }
  }

  // =========================================================================
  // 4. SCALE RECALCULATION & DISPATCH
  // =========================================================================
  try {
    isRecalibrating = true;

    // Fetch Master Genesis Vibration from HistoricSeedEngine (geometric slope points/col)
    const genesis = extractGenesisNodes(candles as any);
    const seedPrice = genesis.atlNode.price > 0 ? genesis.atlNode.price : visibleMinPrice;
    const baseVibration =
      genesis.bullGenesisVelocity > 0 && Number.isFinite(genesis.bullGenesisVelocity)
        ? genesis.bullGenesisVelocity
        : seedPrice * 0.001;

    // Pass through Harmonic Octave Multiplier (Unified Harmonic Sequence with Magnitude Hysteresis)
    const finalVibration = getExpandedVibration(
      baseVibration,
      seedPrice,
      visibleMaxPrice,
      visibleRange,
      lockedMultiplier ?? undefined
    );

    if (Number.isFinite(finalVibration) && finalVibration > 0) {
      lockedMultiplier = Math.round(finalVibration / baseVibration);
      const baseCellWidth = state.baseUnit || 12;
      const baseCellHeight = state.baseUnit || 12;
      const zoomVal = state.zoom;
      const zoomX = typeof (zoomVal as any) === "object" ? (zoomVal as any).x : (zoomVal as number);
      const zoomY = typeof (zoomVal as any) === "object" ? (zoomVal as any).y : (zoomVal as number);
      const colWidth = zoomX * baseCellWidth;
      const rowHeight = zoomY * baseCellHeight;

      // Convert the vibration to pricePerUnit via PixelTranslator to guarantee a 1:1 screen aspect ratio
      const translatedPPU = velocityToPricePerUnit(finalVibration, colWidth, rowHeight);
      const safeScale = Math.min(1000, Math.max(0.1, translatedPPU));

      lockedScale = safeScale;
      if (gapLockActive) {
        // Macro-Scale Override: Widen temporary lock boundaries to +/- 10%
        lockedUpperBoundary = visibleMaxPrice * 1.10;
        lockedLowerBoundary = visibleMinPrice * 0.90;
      } else {
        lockedUpperBoundary = visibleMaxPrice;
        lockedLowerBoundary = visibleMinPrice;
      }

      const currentScale = bridge.getPricePerUnit();
      if (Math.abs(currentScale - lockedScale) > 0.0001) {
        // Calculate screen vertical center to anchor price and prevent vertical displacement
        const screenH = state.screenHeight || height || 600;
        const centerY = screenH / 2;
        const centerWorld = bridge.screenToWorld(0, centerY);
        const centerPrice = bridge.worldToPrice(centerWorld.y);

        bridge.calibratePriceScale(lockedScale, centerPrice);
      }
    }
  } finally {
    isRecalibrating = false;
  }
}

function registerScalerHooks(bridge: IGridBridge): () => void {
  // Hook 1: Transparent render overlay hook to measure exact viewport dimensions on resize
  let lastHeight = 0;
  bridge.registerOverlay("autoscale-v2-viewport-scaler", (_ctx, b, dimensions) => {
    if (!isScalerActive) return;
    if (dimensions.height !== lastHeight) {
      lastHeight = dimensions.height;
      evaluateViewportScale(b, dimensions.height);
    }
  });

  // Hook 2: State change listener to catch pan/zoom adjustments
  const unsub = bridge.subscribe((state, prevState) => {
    if (!isScalerActive) return;
    if (
      state.pan.x !== prevState.pan.x ||
      state.pan.y !== prevState.pan.y ||
      state.zoom !== prevState.zoom
    ) {
      evaluateViewportScale(bridge, state.screenHeight || 600);
    }
  });

  return () => {
    bridge.unregisterOverlay("autoscale-v2-viewport-scaler");
    unsub();
  };
}

export const ViewportScalerModule: GannModule = {
  id: "autoscale-v2-viewport-scaler",
  name: "Gann Viewport Coordinator (Auto-Scale V2)",
  version: "1.0.0",
  description: "Coordinates viewport pan/zoom with expanded Genesis harmonic octaves using a 3% hysteresis deadband.",
  category: "analysis",
  tools: [
    {
      id: "toggle-viewport-autoscale-v2",
      label: "⚖️ Viewport Scaler",
      title: "Toggle Dynamic 3% Hysteresis Viewport Harmonic Scaler (Auto-Scale V2)",
      variant: "toggle",
      isActive: () => isScalerActive,
      onClick: (bridge: IGridBridge) => {
        isScalerActive = !isScalerActive;
        if (!isScalerActive) {
          lockedScale = null;
          lockedMultiplier = null;
          lockedUpperBoundary = 0;
          lockedLowerBoundary = 0;
          gapLockActive = false;
        } else {
          evaluateViewportScale(bridge, 600);
        }
      },
    },
  ],
  initialize: (bridge: IGridBridge) => {
    isScalerActive = true;
    lockedScale = null;
    lockedMultiplier = null;
    lockedUpperBoundary = 0;
    lockedLowerBoundary = 0;
    gapLockActive = false;

    if (unregisterOverlayFn) {
      unregisterOverlayFn();
    }
    unregisterOverlayFn = registerScalerHooks(bridge);

    // Initial evaluation
    evaluateViewportScale(bridge, 600);
  },
  destroy: () => {
    isScalerActive = false;
    lockedScale = null;
    lockedMultiplier = null;
    lockedUpperBoundary = 0;
    lockedLowerBoundary = 0;
    gapLockActive = false;
    if (unregisterOverlayFn) {
      unregisterOverlayFn();
      unregisterOverlayFn = null;
    }
    if (unsubscribeBridgeFn) {
      unsubscribeBridgeFn();
      unsubscribeBridgeFn = null;
    }
  },
};
