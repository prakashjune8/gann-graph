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
let unregisterOverlayFn: (() => void) | null = null;
let unsubscribeBridgeFn: (() => void) | null = null;
let isRecalibrating = false;

/**
 * Evaluates current visible price bounds against the 3% hysteresis deadband
 * and recalculates/dispatches the expanded octave scale if the deadband is breached.
 */
function evaluateViewportScale(bridge: IGridBridge, height: number): void {
  if (!isScalerActive || isRecalibrating) return;

  const candles = bridge.getCandles();
  if (!candles || candles.length === 0) return;

  const topWorld = bridge.screenToWorld(0, 0);
  const bottomWorld = bridge.screenToWorld(0, height > 0 ? height : 600);

  const priceAtTop = bridge.worldYToPrice(topWorld.y);
  const priceAtBottom = bridge.worldYToPrice(bottomWorld.y);

  const visibleMaxPrice = Math.max(priceAtTop, priceAtBottom);
  const visibleMinPrice = Math.min(priceAtTop, priceAtBottom);
  const visibleRange = Math.max(1, visibleMaxPrice - visibleMinPrice);

  if (!Number.isFinite(visibleMaxPrice) || !Number.isFinite(visibleMinPrice) || visibleMaxPrice <= 0) {
    return;
  }

  // =========================================================================
  // 1. 3% HYSTERESIS DEADBAND LOGIC
  // =========================================================================
  if (lockedScale !== null && lockedUpperBoundary > 0 && lockedLowerBoundary > 0) {
    const isUpperBreached = visibleMaxPrice > lockedUpperBoundary * 1.03;
    const isLowerBreached = visibleMinPrice < lockedLowerBoundary * 0.97;

    if (!isUpperBreached && !isLowerBreached) {
      // Strictly inside the 3% buffer zone -> maintain buttery smooth chart
      return;
    }
  }

  // =========================================================================
  // 2. SCALE RECALCULATION & DISPATCH
  // =========================================================================
  try {
    isRecalibrating = true;

    // Fetch Master Genesis Vibration from HistoricSeedEngine
    const genesis = extractGenesisNodes(candles as any);
    const seedPrice = genesis.atlNode.price > 0 ? genesis.atlNode.price : visibleMinPrice;
    const baseVibration = seedPrice / 8;

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
      // Fetch the current grid sizes: colWidth = bridge.getState().zoom.x * BASE_CELL_WIDTH and rowHeight = bridge.getState().zoom.y * BASE_CELL_HEIGHT
      const state = bridge.getState();
      const baseCellWidth = state.baseUnit || 12;
      const baseCellHeight = state.baseUnit || 12;
      const zoomVal = state.zoom;
      const zoomX = typeof (zoomVal as any) === "object" ? (zoomVal as any).x : (zoomVal as number);
      const zoomY = typeof (zoomVal as any) === "object" ? (zoomVal as any).y : (zoomVal as number);
      const colWidth = zoomX * baseCellWidth;
      const rowHeight = zoomY * baseCellHeight;

      // Convert the vibration to pricePerUnit via PixelTranslator to guarantee a 1:1 screen aspect ratio
      const translatedPPU = velocityToPricePerUnit(finalVibration, colWidth, rowHeight);

      lockedScale = translatedPPU;
      lockedUpperBoundary = visibleMaxPrice;
      lockedLowerBoundary = visibleMinPrice;

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
  // Hook 1: Transparent render overlay hook to measure exact viewport dimensions
  bridge.registerOverlay("autoscale-v2-viewport-scaler", (_ctx, b, dimensions) => {
    if (!isScalerActive) return;
    evaluateViewportScale(b, dimensions.height);
  });

  // Hook 2: State change listener to catch pan/zoom adjustments
  const unsub = bridge.subscribe((state, prevState) => {
    if (!isScalerActive) return;
    if (state.pan !== prevState.pan || state.zoom !== prevState.zoom) {
      evaluateViewportScale(bridge, 600);
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
