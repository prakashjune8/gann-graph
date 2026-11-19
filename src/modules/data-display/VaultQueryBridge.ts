/**
 * W.D. Gann Drafting Desk — Vault Query Bridge
 * Module: src/modules/data-display/VaultQueryBridge.ts
 *
 * Interfaces with the local DuckDB vault via PyWebView (`window.pywebview.api.query_vault_candles`)
 * to retrieve historical daily/intraday candlestick records for display.
 */

import { RawMarketBar, AvailableSeriesInfo } from "./DisplayTypes";

export interface VaultQueryResult {
  success: boolean;
  symbol: string;
  candles: RawMarketBar[];
  totalCount: number;
  startDate?: string;
  endDate?: string;
  message: string;
}

export interface VaultSeriesListResult {
  success: boolean;
  series: AvailableSeriesInfo[];
  totalCount: number;
  message: string;
}

/**
 * Checks whether native PyWebView vault querying is active.
 */
export function isNativeVaultQueryAvailable(): boolean {
  return typeof window !== "undefined" && typeof window.pywebview?.api?.query_vault_candles === "function";
}

/**
 * Lists available distinct market series stored in the master DuckDB vault.
 */
export async function listVaultSeries(): Promise<VaultSeriesListResult> {
  if (typeof window !== "undefined" && typeof window.pywebview?.api?.list_vault_series === "function") {
    try {
      const res = await window.pywebview.api.list_vault_series();
      return res;
    } catch (err) {
      console.error("[VaultQueryBridge] Error listing series from native DuckDB vault:", err);
      return {
        success: false,
        series: [],
        totalCount: 0,
        message: `Native DuckDB series listing error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  // Pure Web Browser Mode Fallback (Simulated available vault series)
  const fallbackSeries: AvailableSeriesInfo[] = [
    {
      seriesId: "NSE:NIFTY 50",
      symbol: "NIFTY 50",
      exchange: "NSE",
      instrumentToken: 256265,
      assetClass: "INDEX",
      segment: "INDICES",
      rowCount: 8844,
      earliestDate: "1990-07-03",
      latestDate: "2026-11-18",
    },
  ];

  return {
    success: true,
    series: fallbackSeries,
    totalCount: fallbackSeries.length,
    message: "Retrieved fallback browser series descriptor.",
  };
}

/**
 * Queries historical candlestick data from the local DuckDB vault.
 * Falls back gracefully to sample generation when running in pure browser mode.
 */
export async function queryVaultCandles(
  symbol: string = "NIFTY 50",
  startDate?: string,
  endDate?: string,
  limit?: number
): Promise<VaultQueryResult> {
  if (isNativeVaultQueryAvailable()) {
    try {
      const res = await window.pywebview!.api.query_vault_candles!(
        symbol,
        startDate || null,
        endDate || null,
        limit || null
      );
      return res;
    } catch (err) {
      console.error("[VaultQueryBridge] Error querying native DuckDB vault:", err);
      return {
        success: false,
        symbol,
        candles: [],
        totalCount: 0,
        message: `Native DuckDB query error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  // Pure Web Browser Mode Fallback (Sample NIFTY 50 Dataset)
  console.info("[VaultQueryBridge] Running in browser mode without native PyWebView. Loading fallback series.");
  const sampleData: RawMarketBar[] = [
    { timestamp: "1990-07-03", open: 279.02, high: 279.02, low: 279.02, close: 279.02, volume: 0 },
    { timestamp: "1990-07-05", open: 284.04, high: 284.04, low: 284.04, close: 284.04, volume: 0 },
    { timestamp: "1990-07-06", open: 289.04, high: 289.04, low: 289.04, close: 289.04, volume: 0 },
    { timestamp: "1990-07-09", open: 289.69, high: 289.69, low: 289.69, close: 289.69, volume: 0 },
    { timestamp: "1990-07-10", open: 288.69, high: 288.69, low: 288.69, close: 288.69, volume: 0 },
    { timestamp: "2024-01-01", open: 21727.75, high: 21755.6, low: 21678.0, close: 21741.9, volume: 154820000 },
    { timestamp: "2024-01-02", open: 21751.35, high: 21755.6, low: 21555.65, close: 21665.8, volume: 263720000 },
    { timestamp: "2024-01-03", open: 21661.1, high: 21677.0, low: 21500.3, close: 21517.35, volume: 255280000 },
    { timestamp: "2024-01-04", open: 21605.8, high: 21720.3, low: 21595.6, close: 21658.6, volume: 270920000 },
    { timestamp: "2024-01-05", open: 21705.7, high: 21749.6, low: 21629.2, close: 21710.8, volume: 392500000 },
    { timestamp: "2026-11-16", open: 25206.15, high: 25337.6, low: 25172.1, close: 25291.1, volume: 352859164 },
    { timestamp: "2026-11-17", open: 25277.3, high: 25501.35, low: 25267.3, close: 25387.4, volume: 342549112 },
    { timestamp: "2026-11-18", open: 25323.15, high: 25390.8, low: 25141.8, close: 25227.95, volume: 299995485 },
  ];

  return {
    success: true,
    symbol,
    candles: sampleData,
    totalCount: sampleData.length,
    startDate: "1990-07-03",
    endDate: "2026-11-18",
    message: "Retrieved fallback browser demo series.",
  };
}
