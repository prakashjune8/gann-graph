/**
 * W.D. Gann Viewport Scaler Module
 * Auto-Scale V2 — Active Candle Viewport Scaler
 *
 * Implements the Viewport Scaler action:
 * 1. Scope Vertical Fit to Active/Visible Candles:
 *    - Uses active/visible candles' low-to-high range (with fallback to nearest valid bars if over a gap).
 *    - Avoids forcing a distant low baseline (such as near zero or a base level) when active candles sit in a higher local price band.
 * 2. Preserve Ceiling, Floor & Scale Guardrails:
 *    - Maintains +10% upper ceiling headroom above relevant high (localMaxHigh * 1.10).
 *    - Non-negative (>= 0) lower price floor and institutional Gann harmonic scale ladders clamped to [0.01, 10000].
 *    - Keeps vertical pan, ruler ticks, ceiling marker, and swing markers perfectly aligned.
 */

import { GannModule } from "../../ModuleRegistry";
import { IGridBridge } from "../../core-bridge/GridBridge";

let unregisterOverlayFn: (() => void) | null = null;
let isRecalibrating = false;

/**
 * Fits the vertical price scale and centering directly around the active/visible candles.
 * Avoids stretching across a wide base-to-ceiling span that flattens candles into a thin band.
 */
export function fitViewportToActiveCandles(bridge: IGridBridge): void {
  if (isRecalibrating) return;
  try {
    isRecalibrating = true;
    bridge.fitViewportToActiveCandles();
  } finally {
    isRecalibrating = false;
  }
}

function registerScalerHooks(bridge: IGridBridge): () => void {
  // Transparent render overlay hook to measure exact viewport dimensions on window/canvas resize
  let lastHeight = 0;
  bridge.registerOverlay("autoscale-v2-viewport-scaler", (_ctx, b, dimensions) => {
    if (!bridge.autoFitY) return;
    if (dimensions.height !== lastHeight) {
      lastHeight = dimensions.height;
      fitViewportToActiveCandles(b);
    }
  });

  return () => {
    bridge.unregisterOverlay("autoscale-v2-viewport-scaler");
  };
}

export const ViewportScalerModule: GannModule = {
  id: "autoscale-v2-viewport-scaler",
  name: "Gann Viewport Coordinator (Auto-Scale V2)",
  version: "1.2.0",
  description: "Fits vertical price scale tightly around active/visible candles with +10% upper ceiling headroom.",
  category: "analysis",
  tools: [
    {
      id: "toggle-viewport-autoscale-v2",
      label: "⚖️ Auto-Fit Slice",
      title: "Recalculate vertical price scale and centering over visible candles now",
      variant: "primary",
      isActive: (bridge: IGridBridge) => bridge.autoFitY,
      onClick: (bridge: IGridBridge) => {
        fitViewportToActiveCandles(bridge);
      },
    },
  ],
  initialize: (bridge: IGridBridge) => {
    if (unregisterOverlayFn) {
      unregisterOverlayFn();
    }
    unregisterOverlayFn = registerScalerHooks(bridge);
  },
  destroy: () => {
    if (unregisterOverlayFn) {
      unregisterOverlayFn();
      unregisterOverlayFn = null;
    }
  },
};
