/**
 * W.D. Gann Drafting Desk — Data Display Execution Module
 * Module: src/modules/data-display/DataDisplayModule.ts
 *
 * Implements the GannModule interface for the ModuleRegistry, exposing
 * interactive toolbar controls for loading vault data, changing timeframes,
 * and coordinating chart displays.
 */

import { GannModule } from "../../ModuleRegistry";
import { DataDisplayCoordinator } from "./DataDisplayCoordinator";
import { DisplayTimeframe } from "./DisplayTypes";

let currentTimeframeIdx = 0;
const TIMEFRAMES: DisplayTimeframe[] = ["1D", "1W", "1M", "60m", "15m", "5m", "1m"];

export const DataDisplayModule: GannModule = {
  id: "data-display-execution-module",
  name: "Gann Data Display Coordinator",
  version: "1.0.0",
  description: "Coordinates querying, timeframe aggregation, and K&E 8x8 grid projection for market data.",
  category: "analysis",
  tools: [
    {
      id: "tool-load-vault-nifty",
      label: "🏛️ Load Vault NIFTY",
      title: "Query and display 36.5-year historical NIFTY 50 dataset (1990-2026) directly from local DuckDB vault",
      variant: "primary",
      onClick: async () => {
        await DataDisplayCoordinator.displayVaultSeries({
          symbol: "NIFTY 50",
          timeframe: TIMEFRAMES[currentTimeframeIdx],
        });
      },
    },
    {
      id: "tool-toggle-timeframe",
      label: `⏱️ TF: ${TIMEFRAMES[currentTimeframeIdx]}`,
      title: "Cycle active chart timeframe between Daily (1D), Weekly (1W), and Monthly (1M)",
      variant: "secondary",
      onClick: () => {
        currentTimeframeIdx = (currentTimeframeIdx + 1) % TIMEFRAMES.length;
        const nextTf = TIMEFRAMES[currentTimeframeIdx];
        DataDisplayCoordinator.setTimeframe(nextTf);
      },
    },
  ],
  initialize: () => {
    // Optional initial sync or readiness check
  },
  destroy: () => {
    // Clean up
  },
};
