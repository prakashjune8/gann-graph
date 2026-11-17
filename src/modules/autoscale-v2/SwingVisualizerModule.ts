/**
 * W.D. Gann 3-Day Swing Visualizer Module
 * Auto-Scale V2 — Visual Overlay
 *
 * Implements a canvas overlay module that invokes detectGannSwings
 * and physically renders visual markers for Higher Highs (Red HH) and Lower Lows (Green LL).
 */

import { GannModule } from "../../ModuleRegistry";
import { IGridBridge } from "../../core-bridge/GridBridge";
import { detectGannSwings, SwingNode } from "./SwingDetector";

let isVisualizerActive = true;
let unregisterOverlayFn: (() => void) | null = null;

function registerSwingOverlay(bridge: IGridBridge): () => void {
  return bridge.registerOverlay("autoscale-v2-swings", (ctx, b) => {
    if (!isVisualizerActive) return;

    const candles = b.getCandles();
    if (!candles || candles.length < 7) return;

    // Detect 3-day mechanical Gann swings
    const swings: SwingNode[] = detectGannSwings(candles as any, 3);
    if (swings.length === 0) return;

    ctx.save();

    // 1. Draw connecting dashed swing zigzag line
    if (swings.length > 1) {
      ctx.beginPath();
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = "rgba(180, 80, 60, 0.55)";
      ctx.setLineDash([4, 3]);

      const first = swings[0];
      const firstWorldX = first.col * b.getBaseUnit();
      const firstWorldY = b.priceToWorldY(first.price);
      const firstPos = b.worldToScreen(firstWorldX, firstWorldY);
      ctx.moveTo(firstPos.x, firstPos.y);

      for (let i = 1; i < swings.length; i++) {
        const pt = swings[i];
        const wX = pt.col * b.getBaseUnit();
        const wY = b.priceToWorldY(pt.price);
        const pos = b.worldToScreen(wX, wY);
        ctx.lineTo(pos.x, pos.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 2. Render Swing Nodes: Solid Red circle for HH, Solid Green circle for LL
    for (let i = 0; i < swings.length; i++) {
      const node = swings[i];
      const worldX = node.col * b.getBaseUnit();
      const worldY = b.priceToWorldY(node.price);
      const screenPos = b.worldToScreen(worldX, worldY);

      const x = Math.round(screenPos.x);
      // HH placed slightly above wick (-8px), LL placed slightly below wick (+8px)
      const y = node.type === "HH" ? Math.round(screenPos.y) - 8 : Math.round(screenPos.y) + 8;

      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = node.type === "HH" ? "#E53935" : "#43A047"; // Solid Red / Solid Green
      ctx.fill();

      ctx.lineWidth = 1.2;
      ctx.strokeStyle = "#FFFFFF";
      ctx.stroke();

      // Node label
      ctx.font = "bold 9px 'Courier New', Courier, monospace";
      ctx.fillStyle = node.type === "HH" ? "#B71C1C" : "#1B5E20";
      ctx.textAlign = "center";
      ctx.textBaseline = node.type === "HH" ? "bottom" : "top";
      const labelY = node.type === "HH" ? y - 3 : y + 3;
      ctx.fillText(node.type, x, labelY);
    }

    ctx.restore();
  });
}

export const SwingVisualizerModule: GannModule = {
  id: "autoscale-v2-swing-visualizer",
  name: "Gann 3-Day Swing Visualizer (Auto-Scale V2)",
  version: "1.0.0",
  description: "Renders visual markers (Red HH / Green LL) for detected 3-day mechanical Gann swings.",
  category: "analysis",
  tools: [
    {
      id: "toggle-gann-swings-v2",
      label: "📈 3-Day Swings",
      title: "Toggle Gann 3-Day Mechanical Swing Visualizer (Red HH / Green LL)",
      variant: "toggle",
      isActive: () => isVisualizerActive,
      onClick: (bridge: IGridBridge) => {
        isVisualizerActive = !isVisualizerActive;
        if (unregisterOverlayFn) {
          unregisterOverlayFn();
          unregisterOverlayFn = null;
        }
        if (isVisualizerActive) {
          unregisterOverlayFn = registerSwingOverlay(bridge);
        }
      },
    },
  ],
  initialize: (bridge: IGridBridge) => {
    isVisualizerActive = true;
    if (unregisterOverlayFn) {
      unregisterOverlayFn();
    }
    unregisterOverlayFn = registerSwingOverlay(bridge);
  },
  destroy: () => {
    isVisualizerActive = false;
    if (unregisterOverlayFn) {
      unregisterOverlayFn();
      unregisterOverlayFn = null;
    }
  },
};
