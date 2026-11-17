/**
 * W.D. Gann 50% Equilibrium Module
 * Sandbox Module: Calculates the 50% price equilibrium between the absolute
 * high and low of the active dataset and dispatches a central equilibrium pivot.
 */

import { GannModule } from "../../ModuleRegistry";
import { IGridBridge } from "../../core-bridge/GridBridge";

let isEquilibriumActive = false;

export const EquilibriumModule: GannModule = {
  id: "gann-50-equilibrium",
  name: "Gann 50% Equilibrium Engine",
  version: "1.0.0",
  description: "Calculates the exact 50% price equilibrium between the highest peak and lowest bottom.",
  category: "analysis",
  tools: [
    {
      id: "calc-equilibrium-pivot",
      label: "⚖️ 50% Equilibrium",
      title: "Calculate Gann 50% Equilibrium Level from Current Dataset",
      variant: "toggle",
      isActive: () => isEquilibriumActive,
      onClick: (bridge: IGridBridge) => {
        const candles = bridge.getCandles();
        if (candles.length === 0) {
          alert("Please load or ingest price data first.");
          return;
        }

        let maxPrice = -Infinity;
        let minPrice = Infinity;
        let maxCol = 0;
        let minCol = 0;

        for (const c of candles) {
          if (c.high > maxPrice) {
            maxPrice = c.high;
            maxCol = c.gridCol;
          }
          if (c.low < minPrice) {
            minPrice = c.low;
            minCol = c.gridCol;
          }
        }

        const equilibriumPrice = Math.round(((maxPrice + minPrice) / 2) * 100) / 100;
        const midCol = Math.round((maxCol + minCol) / 2);
        const basePrice = bridge.getBasePrice();
        const pricePerUnit = bridge.getPricePerUnit();
        const safeDivisor = Math.max(0.0001, pricePerUnit);

        isEquilibriumActive = !isEquilibriumActive;

        if (isEquilibriumActive) {
          bridge.addSwingPoint({
            id: `eq-${Date.now()}`,
            timeStr: "Equilibrium",
            price: equilibriumPrice,
            gridCol: midCol,
            gridRow: Math.round((equilibriumPrice - basePrice) / safeDivisor),
            type: "INTERMEDIATE",
            label: `50% Equilibrium ₹${equilibriumPrice.toLocaleString("en-IN")}`,
          });
        }
      },
    },
  ],
  initialize: () => {
    isEquilibriumActive = false;
  },
  destroy: () => {
    isEquilibriumActive = false;
  },
};
