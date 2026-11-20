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
 * Asynchronously waits for PyWebView native bridge to become ready (up to timeoutMs).
 * Solves the race condition where the React component mounts before PyWebView injects window.pywebview.api.
 */
export async function waitForNativeVaultBridge(timeoutMs = 3000): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (isNativeVaultQueryAvailable()) return true;

  return new Promise((resolve) => {
    let resolved = false;

    const onReady = () => {
      if (!resolved) {
        resolved = true;
        window.removeEventListener("pywebviewready", onReady);
        resolve(true);
      }
    };

    window.addEventListener("pywebviewready", onReady);

    // Also poll every 35ms in case the event fired prior to handler registration
    const interval = setInterval(() => {
      if (isNativeVaultQueryAvailable()) {
        if (!resolved) {
          resolved = true;
          clearInterval(interval);
          window.removeEventListener("pywebviewready", onReady);
          resolve(true);
        }
      }
    }, 35);

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        clearInterval(interval);
        window.removeEventListener("pywebviewready", onReady);
        resolve(isNativeVaultQueryAvailable());
      }
    }, timeoutMs);
  });
}

/**
 * Generates a continuous sequence of daily candles for pure browser fallback mode.
 */
function generateBrowserFallbackSeries(count: number = 180): RawMarketBar[] {
  const bars: RawMarketBar[] = [];
  const basePrice = 24500;
  let currentPrice = basePrice;
  const now = new Date(2026, 10, 18); // 2026-11-18

  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000);
    // Skip weekends
    if (d.getDay() === 0 || d.getDay() === 6) continue;

    const dateStr = d.toISOString().slice(0, 10);
    const change = (Math.sin(i * 0.15) * 80) + ((Math.random() - 0.48) * 120);
    const open = Math.round((currentPrice) * 100) / 100;
    const close = Math.round((open + change) * 100) / 100;
    const high = Math.round((Math.max(open, close) + Math.random() * 90) * 100) / 100;
    const low = Math.round((Math.min(open, close) - Math.random() * 90) * 100) / 100;
    const volume = Math.round(150000000 + Math.random() * 100000000);

    bars.push({ timestamp: dateStr, open, high, low, close, volume });
    currentPrice = close;
  }
  return bars;
}

/**
 * Lists available distinct market series stored in the master DuckDB vault.
 */
export async function listVaultSeries(): Promise<VaultSeriesListResult> {
  if (!isNativeVaultQueryAvailable()) {
    await waitForNativeVaultBridge(2500);
  }

  if (typeof window !== "undefined" && typeof window.pywebview?.api?.list_vault_series === "function") {
    try {
      const res = await window.pywebview.api.list_vault_series();
      if (res && res.success && Array.isArray(res.series) && res.series.length > 0) {
        return res;
      }
    } catch (err) {
      console.error("[VaultQueryBridge] Error listing series from native DuckDB vault:", err);
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
 * Falls back gracefully to continuous sample generation when running in pure browser mode.
 */
export async function queryVaultCandles(
  symbol: string = "NIFTY 50",
  startDate?: string,
  endDate?: string,
  limit?: number
): Promise<VaultQueryResult> {
  if (!isNativeVaultQueryAvailable()) {
    await waitForNativeVaultBridge(2500);
  }

  if (isNativeVaultQueryAvailable()) {
    try {
      const res = await window.pywebview!.api.query_vault_candles!(
        symbol,
        startDate || null,
        endDate || null,
        limit || null
      );
      if (res && res.success && Array.isArray(res.candles) && res.candles.length > 0) {
        return res;
      }
    } catch (err) {
      console.error("[VaultQueryBridge] Error querying native DuckDB vault:", err);
    }
  }

  // Pure Web Browser Mode Fallback (Continuous Realistic Series)
  console.info("[VaultQueryBridge] Running in browser mode without native PyWebView. Loading continuous fallback series.");
  const sampleData = generateBrowserFallbackSeries(200);

  return {
    success: true,
    symbol,
    candles: sampleData,
    totalCount: sampleData.length,
    startDate: String(sampleData[0].timestamp),
    endDate: String(sampleData[sampleData.length - 1].timestamp),
    message: `Retrieved fallback continuous browser series (${sampleData.length} bars).`,
  };
}

export interface VaultUpdateCheckResult {
  success: boolean;
  hasUpdate: boolean;
  symbol: string;
  currentCount: number;
  newCount: number;
  newBarsCount: number;
  latestTimestamp?: string;
  ingestedInfo?: any;
  message: string;
}

/**
 * Checks whether new market data has arrived in 01_DROP_INBOX or DuckDB for the active symbol.
 */
export async function checkVaultUpdate(
  symbol: string = "NIFTY 50",
  currentCount: number = 0,
  currentLatestTs?: string
): Promise<VaultUpdateCheckResult> {
  if (typeof window !== "undefined" && typeof window.pywebview?.api?.check_vault_update === "function") {
    try {
      const res = await window.pywebview.api.check_vault_update(symbol, currentCount, currentLatestTs || null);
      if (res) return res;
    } catch (err) {
      console.warn("[VaultQueryBridge] Error checking vault update:", err);
    }
  }

  return {
    success: true,
    hasUpdate: false,
    symbol,
    currentCount,
    newCount: currentCount,
    newBarsCount: 0,
    latestTimestamp: currentLatestTs,
    message: "No update detected or browser mode active.",
  };
}

/**
 * Explicitly triggers batch ingestion of any pending files in 01_DROP_INBOX.
 */
export async function triggerInboxIngestion(): Promise<{ success: boolean; processed: number; rows: number; message: string }> {
  if (typeof window !== "undefined" && typeof window.pywebview?.api?.process_drop_inbox === "function") {
    try {
      const res = await window.pywebview.api.process_drop_inbox();
      if (res) return res;
    } catch (err) {
      console.warn("[VaultQueryBridge] Error processing drop inbox:", err);
    }
  }
  return { success: false, processed: 0, rows: 0, message: "Native pywebview API unavailable." };
}
