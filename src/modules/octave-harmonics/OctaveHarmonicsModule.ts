/**
 * W.D. Gann Octave Harmonics Module
 * Sandbox Module: Calculates Gann's Rule of Eighths price levels (0/8 to 8/8)
 * across the active dataset's extreme price amplitude.
 */

import { GannModule } from "../../ModuleRegistry";
import { IGridBridge } from "../../core-bridge/GridBridge";

let isOctavesActive = false;

export const OctaveHarmonicsModule: GannModule = {
  id: "gann-octave-harmonics",
  name: "Gann Octave Harmonics (Rule of Eighths)",
  version: "1.0.0",
  description: "Computes 1/8, 2/8 (1/4), 3/8, 4/8 (50%), 5/8, 6/8 (3/4), 7/8, and 8/8 harmonic divisions.",
  category: "geometry",
  tools: [
    {
      id: "toggle-gann-octaves",
      label: "☸ Octave Levels",
      title: "Calculate Octave Harmonics (Rule of Eighths) across Extreme Range",
      variant: "toggle",
      isActive: () => isOctavesActive,
      onClick: (bridge: IGridBridge) => {
        const candles = bridge.getCandles();
        if (candles.length === 0) {
          alert("Please load or ingest price data first.");
          return;
        }

        let maxPrice = -Infinity;
        let minPrice = Infinity;
        for (const c of candles) {
          if (c.high > maxPrice) maxPrice = c.high;
          if (c.low < minPrice) minPrice = c.low;
        }

        const range = maxPrice - minPrice;
        if (range <= 0) return;

        isOctavesActive = !isOctavesActive;

        if (isOctavesActive) {
          const eighth = range / 8;
          const levels = [
            { fraction: "1/8", price: Math.round(minPrice + eighth * 1) },
            { fraction: "2/8 (25%)", price: Math.round(minPrice + eighth * 2) },
            { fraction: "3/8", price: Math.round(minPrice + eighth * 3) },
            { fraction: "4/8 (50%)", price: Math.round(minPrice + eighth * 4) },
            { fraction: "5/8", price: Math.round(minPrice + eighth * 5) },
            { fraction: "6/8 (75%)", price: Math.round(minPrice + eighth * 6) },
            { fraction: "7/8", price: Math.round(minPrice + eighth * 7) },
          ];

          console.info("[Octave Harmonics] Calculated Gann Eighths:", levels);
          alert(
            `Gann Octave Eighths (Range ₹${minPrice} - ₹${maxPrice}):\n` +
            levels.map((l) => ` • ${l.fraction}: ₹${l.price.toLocaleString("en-IN")}`).join("\n")
          );
        }
      },
    },
  ],
  initialize: () => {
    isOctavesActive = false;
  },
  destroy: () => {
    isOctavesActive = false;
  },
};
