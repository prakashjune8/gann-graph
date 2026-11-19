/**
 * W.D. Gann Genesis Engine & Rule of 8 Visualizer
 * Auto-Scale V2 — Phase 1b
 *
 * Implements a canvas overlay module that physically renders:
 * 1. Bull Genesis Nodes: Gold (#FFD700, radius 8px) circles for ATL, L1, L2, L3 with faint horizontal price projections.
 * 2. Bear Genesis Nodes: Cyan (#00E5FF, radius 8px) circles for ATH, H1, H2, H3 with faint horizontal price projections.
 * 3. Rule of 8 Grid: Dashed horizontal lines for 1/8th, 1/4, and 3/8 price levels of the ATL to reveal geometric convergence.
 * 4. Proof of the Seed HUD: Visual confirmation badge displaying mathematical octave validation.
 */

import { GannModule } from "../../ModuleRegistry";
import { IGridBridge } from "../../core-bridge/GridBridge";
import { extractGenesisNodes, GenesisExtractionResult } from "./HistoricSeedEngine";

let isGenesisActive = true;
let unregisterOverlayFn: (() => void) | null = null;

function registerGenesisOverlay(bridge: IGridBridge): () => void {
  return bridge.registerOverlay("autoscale-v2-genesis", (ctx, b) => {
    if (!isGenesisActive) return;

    const candles = b.getCandles();
    if (!candles || candles.length === 0) return;

    // 1. Run manual-seed Genesis Math & Proof of Seed
    const lowestSeed = b.getLowestSeed();
    const highestSeed = b.getHighestSeed();
    const genesis: GenesisExtractionResult = extractGenesisNodes(
      candles as any,
      b.getTimePerUnit(),
      lowestSeed,
      highestSeed
    );
    if (!genesis.atlNode && !genesis.athNode) return;

    ctx.save();

    const canvasWidth = ctx.canvas.width; // Raw canvas width
    // Determine screen bounds for full horizontal lines
    const screenLeft = 0;
    const screenRight = canvasWidth;

    // =========================================================================
    // 1. RULE OF 8 GRID (ATL + 1/8th, 1/4, 3/8 Price Projections)
    // =========================================================================
    ctx.save();
    ctx.lineWidth = 1.2;
    ctx.setLineDash([6, 4]);

    for (const gridLine of genesis.ruleOf8BullGrid) {
      const worldY = b.priceToWorldY(gridLine.price);
      const screenY = b.worldToScreen(0, worldY).y;

      // Draw dashed horizontal line across the entire viewport
      ctx.strokeStyle = "rgba(218, 165, 32, 0.70)"; // Goldenrod
      ctx.beginPath();
      ctx.moveTo(screenLeft, screenY);
      ctx.lineTo(screenRight, screenY);
      ctx.stroke();

      // Right-hand rule annotation badge
      ctx.font = "bold 9px 'Courier New', Courier, monospace";
      ctx.fillStyle = "rgba(180, 130, 20, 0.90)";
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      ctx.fillText(`${gridLine.fraction} (₹${gridLine.price.toLocaleString("en-IN")})`, screenRight - 65, screenY - 2);
    }
    ctx.restore();

    // =========================================================================
    // 2. BULL GENESIS NODES (Gold #FFD700: ATL, L1, L2, L3)
    // =========================================================================
    ctx.save();
    for (const node of genesis.allBullNodes) {
      const worldX = node.col * b.getBaseUnit();
      const worldY = b.priceToWorldY(node.price);
      const pos = b.worldToScreen(worldX, worldY);

      // Faint Gold horizontal price projection line
      ctx.strokeStyle = "rgba(255, 215, 0, 0.45)";
      ctx.lineWidth = 1.0;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(screenLeft, pos.y);
      ctx.lineTo(screenRight, pos.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Prominent Gold Circle (#FFD700, radius 8px, black outline)
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 8, 0, Math.PI * 2);
      ctx.fillStyle = "#FFD700";
      ctx.fill();
      ctx.lineWidth = 2.0;
      ctx.strokeStyle = "#000000";
      ctx.stroke();

      // Center core point
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = "#8D6E63";
      ctx.fill();

      // Bold Typography Label
      ctx.font = "bold 10px 'Courier New', Courier, monospace";
      ctx.fillStyle = "#B78103";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      const displayLabel = node.label === "ATL" ? "★ ATL (Bull Seed)" : node.label;
      ctx.fillText(displayLabel, pos.x, pos.y + 11);

      // Price Tag
      ctx.font = "9px 'Courier New', Courier, monospace";
      ctx.fillStyle = "#5D4037";
      ctx.fillText(`₹${node.price.toLocaleString("en-IN")}`, pos.x, pos.y + 23);
    }
    ctx.restore();

    // =========================================================================
    // 3. BEAR GENESIS NODES (Cyan #00E5FF: ATH, H1, H2, H3)
    // =========================================================================
    ctx.save();
    for (const node of genesis.allBearNodes) {
      const worldX = node.col * b.getBaseUnit();
      const worldY = b.priceToWorldY(node.price);
      const pos = b.worldToScreen(worldX, worldY);

      // Faint Cyan horizontal price projection line
      ctx.strokeStyle = "rgba(0, 229, 255, 0.45)";
      ctx.lineWidth = 1.0;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(screenLeft, pos.y);
      ctx.lineTo(screenRight, pos.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Prominent Cyan Circle (#00E5FF, radius 8px, black outline)
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 8, 0, Math.PI * 2);
      ctx.fillStyle = "#00E5FF";
      ctx.fill();
      ctx.lineWidth = 2.0;
      ctx.strokeStyle = "#000000";
      ctx.stroke();

      // Center core point
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = "#006064";
      ctx.fill();

      // Bold Typography Label
      ctx.font = "bold 10px 'Courier New', Courier, monospace";
      ctx.fillStyle = "#00838F";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      const displayLabel = node.label === "ATH" ? "★ ATH (Bear Seed)" : node.label;
      ctx.fillText(displayLabel, pos.x, pos.y - 11);

      // Price Tag
      ctx.font = "9px 'Courier New', Courier, monospace";
      ctx.fillStyle = "#004D40";
      ctx.fillText(`₹${node.price.toLocaleString("en-IN")}`, pos.x, pos.y - 23);
    }
    ctx.restore();

    // =========================================================================
    // 4. PROOF OF THE SEED HUD BADGE (Floating telemetry)
    // =========================================================================
    ctx.save();
    const hudX = screenRight - 280;
    const hudY = 40;
    const hudW = 220;
    const hudH = 50;

    ctx.fillStyle = "rgba(247, 246, 240, 0.92)";
    ctx.strokeStyle = "rgba(74, 120, 102, 0.60)";
    ctx.lineWidth = 1.2;
    if (ctx.roundRect) ctx.roundRect(hudX, hudY, hudW, hudH, 4);
    else ctx.rect(hudX, hudY, hudW, hudH);
    ctx.fill();
    ctx.stroke();

    ctx.font = "bold 9px 'Courier New', Courier, monospace";
    ctx.fillStyle = "#2E7D32";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("GENESIS ENGINE: PROOF OF SEED", hudX + 8, hudY + 6);

    ctx.font = "9px 'Courier New', Courier, monospace";
    ctx.fillStyle = "#37474F";
    const bullStatus = genesis.bullProof
      ? genesis.bullProof.isValid
        ? "✓ PASS (1% 8th)"
        : "△ FRACT"
      : "Not Set";
    const bearStatus = genesis.bearProof
      ? genesis.bearProof.isValid
        ? "✓ PASS (1% 8th)"
        : "△ FRACT"
      : "Not Set";
    const bullText = genesis.atlNode
      ? `Bull Seed (₹${genesis.atlNode.price.toLocaleString("en-IN")}): ${bullStatus} [T${genesis.bullTier}]`
      : "Bull Seed: Not Set (Manual)";
    const bearText = genesis.athNode
      ? `Bear Seed (₹${genesis.athNode.price.toLocaleString("en-IN")}): ${bearStatus} [T${genesis.bearTier}]`
      : "Bear Seed: Not Set (Manual)";
    ctx.fillText(bullText, hudX + 8, hudY + 20);
    ctx.fillText(bearText, hudX + 8, hudY + 34);

    ctx.restore();

    ctx.restore();
  });
}

export const GenesisVisualizerModule: GannModule = {
  id: "autoscale-v2-genesis-visualizer",
  name: "Gann Genesis Nodes Visualizer (Auto-Scale V2)",
  version: "1.0.0",
  description: "Renders global Genesis extreme nodes (Gold ATL & Cyan ATH), Higher Lows (L1-L3), Lower Highs (H1-H3), and the Rule of 8 Grid overlay.",
  category: "analysis",
  tools: [
    {
      id: "toggle-genesis-nodes",
      label: "👁️ View Genesis Nodes",
      title: "Toggle Historic Genesis Nodes & Rule of 8 Grid Overlay",
      variant: "toggle",
      isActive: () => isGenesisActive,
      onClick: (bridge: IGridBridge) => {
        isGenesisActive = !isGenesisActive;
        if (unregisterOverlayFn) {
          unregisterOverlayFn();
          unregisterOverlayFn = null;
        }
        if (isGenesisActive) {
          unregisterOverlayFn = registerGenesisOverlay(bridge);
        }
      },
    },
  ],
  initialize: (bridge: IGridBridge) => {
    isGenesisActive = true;
    if (unregisterOverlayFn) {
      unregisterOverlayFn();
    }
    unregisterOverlayFn = registerGenesisOverlay(bridge);
  },
  destroy: () => {
    isGenesisActive = false;
    if (unregisterOverlayFn) {
      unregisterOverlayFn();
      unregisterOverlayFn = null;
    }
  },
};
