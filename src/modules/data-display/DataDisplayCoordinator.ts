/**
 * W.D. Gann Drafting Desk — Data Display Coordinator
 * Module: src/modules/data-display/DataDisplayCoordinator.ts
 *
 * Central execution controller for preparing and coordinating how market data
 * (from the DuckDB vault, CSV uploads, or active trading sessions) is formatted
 * and displayed on the Gann chart.
 *
 * Responsibilities:
 * 1. Data Ingestion & Retrieval Routing (Vault, CSV, Fallback).
 * 2. Multi-Timeframe Aggregation (1D, 1W, 1M, Intraday).
 * 3. K&E 8x8 Grid Formatting & Swing Extraction.
 * 4. Atomic Chart State Dispatch & Viewport Auto-Centering.
 */

import { useGridState } from "../../store/useGridState";
import { CandleData, SwingPoint } from "../../types/gann";
import {
  DisplayTimeframe,
  DisplayDatasetRequest,
  DisplaySeriesMetadata,
  DisplayDispatchResult,
  DisplayCoordinatorState,
  AvailableSeriesInfo,
} from "./DisplayTypes";
import {
  formatBarsForDisplay,
  extractDisplaySwings,
} from "./DisplaySeriesFormatter";
import { aggregateMarketBars } from "./TimeframeAggregator";
import {
  queryVaultCandles,
  listVaultSeries,
  checkVaultUpdate,
  VaultUpdateCheckResult,
} from "./VaultQueryBridge";

class DataDisplayCoordinatorEngine {
  private state: DisplayCoordinatorState = {
    activeSymbol: "NIFTY 50",
    activeTimeframe: "1D",
    availableSeries: [],
    rawBars: [],
    displayCandles: [],
    displaySwings: [],
    metadata: null,
    isLoading: false,
    statusNotice: null,
    isVaultActive: false,
  };

  private listeners: Set<(state: DisplayCoordinatorState) => void> = new Set();
  private autoSyncTimer: any = null;
  private badgeDismissTimer: any = null;
  private isSyncing: boolean = false;

  public subscribe(listener: (state: DisplayCoordinatorState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.state);
      } catch (e) {
        console.error("[DataDisplayCoordinator] Listener notification error:", e);
      }
    }
  }

  public getState(): DisplayCoordinatorState {
    return { ...this.state };
  }

  public getActiveMetadata(): DisplaySeriesMetadata | null {
    return this.state.metadata;
  }

  /**
   * Dispatches prepared candles and swings to the core Zustand grid state,
   * triggers scale calibration, and jumps viewport to the latest trading bar.
   */
  private dispatchToChart(
    symbol: string,
    timeframe: DisplayTimeframe,
    candles: CandleData[],
    swings: SwingPoint[],
    source: "vault" | "sample",
    autoJumpToLatest = true
  ): DisplayDispatchResult {
    const gridStore = useGridState.getState();

    if (candles.length === 0) {
      return {
        success: false,
        symbol,
        timeframe,
        candleCount: 0,
        swingCount: 0,
        startDate: "N/A",
        endDate: "N/A",
        source,
        message: "No valid candlestick bars generated for display.",
      };
    }

    // 1. Calculate clean min/max extremes (strictly ignoring NaN, null, or non-positive values)
    let minPrice = Infinity;
    let maxPrice = -Infinity;
    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      if (Number.isFinite(c.low) && c.low > 0 && c.low < minPrice) minPrice = c.low;
      if (Number.isFinite(c.high) && c.high > 0 && c.high > maxPrice) maxPrice = c.high;
    }

    // 2. Dispatch to central Zustand store
    gridStore.setTimePerUnit(timeframe);
    gridStore.setCandles(candles);
    gridStore.setSwingPoints(swings);

    // 3. Auto-center viewport with future projection buffer
    if (autoJumpToLatest) {
      const screenW = typeof window !== "undefined" ? window.innerWidth : 1440;
      const screenH = typeof window !== "undefined" ? window.innerHeight : 900;
      gridStore.jumpToLatest(screenW, screenH);
    }

    const startDate = candles[0].timestamp;
    const endDate = candles[candles.length - 1].timestamp;

    const metadata: DisplaySeriesMetadata = {
      symbol,
      timeframe,
      totalBars: candles.length,
      startDate,
      endDate,
      basePrice: gridStore.basePrice,
      pricePerUnit: gridStore.pricePerUnit,
      minPrice: Number.isFinite(minPrice) ? minPrice : 0,
      maxPrice: Number.isFinite(maxPrice) ? maxPrice : 0,
      source,
      lastUpdated: new Date().toISOString(),
    };

    this.state = {
      ...this.state,
      activeSymbol: symbol,
      activeTimeframe: timeframe,
      displayCandles: candles,
      displaySwings: swings,
      metadata,
      isLoading: false,
      statusNotice: `Displaying ${candles.length.toLocaleString()} bars (${startDate} to ${endDate})`,
      isVaultActive: source === "vault",
    };

    this.notify();

    return {
      success: true,
      symbol,
      timeframe,
      candleCount: candles.length,
      swingCount: swings.length,
      startDate,
      endDate,
      source,
      message: `Successfully loaded ${candles.length.toLocaleString()} display candles on ${timeframe} timeframe.`,
    };
  }

  /**
   * Queries market data directly from the master DuckDB vault and
   * formats it onto the Gann Chart.
   */
  public async displayVaultSeries(
    request: DisplayDatasetRequest = {}
  ): Promise<DisplayDispatchResult> {
    const symbol = request.symbol || "NIFTY 50";
    const timeframe = request.timeframe || "1D";

    this.state.isLoading = true;
    this.state.statusNotice = `Querying vault for ${symbol}...`;
    this.notify();

    try {
      const queryRes = await queryVaultCandles(symbol, request.startDate, request.endDate, request.limit);

      if (!queryRes.success || queryRes.candles.length === 0) {
        this.state.isLoading = false;
        this.state.statusNotice = `Vault query returned 0 rows for ${symbol}.`;
        this.notify();
        return {
          success: false,
          symbol,
          timeframe,
          candleCount: 0,
          swingCount: 0,
          startDate: "N/A",
          endDate: "N/A",
          source: "vault",
          message: queryRes.message || "No records found in vault.",
        };
      }

      this.state.rawBars = queryRes.candles;

      // 1. Multi-timeframe aggregation
      const aggregatedBars = aggregateMarketBars(queryRes.candles, timeframe);

      // 2. K&E 8x8 Grid Formatting with True Natural Calendar Time
      const displayCandles = formatBarsForDisplay(aggregatedBars, timeframe, request.columnSpacing || 2);

      // 3. Gann swing pivots (fractal lookback parity with autoscale-v2)
      const gridStore = useGridState.getState();
      const swings = extractDisplaySwings(displayCandles, gridStore.basePrice, gridStore.pricePerUnit, timeframe);

      // 4. Dispatch to chart
      return this.dispatchToChart(
        symbol,
        timeframe,
        displayCandles,
        swings,
        "vault",
        request.autoJumpToLatest ?? true
      );
    } catch (err) {
      this.state.isLoading = false;
      this.state.statusNotice = `Failed to load vault data: ${String(err)}`;
      this.notify();
      return {
        success: false,
        symbol,
        timeframe,
        candleCount: 0,
        swingCount: 0,
        startDate: "N/A",
        endDate: "N/A",
        source: "vault",
        message: `Error loading vault series: ${err instanceof Error ? err.message : String(err)}`,
        error: String(err),
      };
    }
  }

  /**
   * Scans the master DuckDB vault and updates available series descriptors.
   */
  public async refreshAvailableSeries(): Promise<AvailableSeriesInfo[]> {
    try {
      const res = await listVaultSeries();
      if (res.success && res.series) {
        this.state.availableSeries = res.series;
        this.notify();
        return res.series;
      }
    } catch (e) {
      console.warn("[DataDisplayCoordinator] Error refreshing available series:", e);
    }
    return this.state.availableSeries;
  }

  /**
   * Startup initializer: fetches available vault series and loads the persisted
   * active series (defaulting to NIFTY 50 1D). If the vault has 0 records, leaves
   * the chart clean in empty state without loading dummy sample candles.
   */
  public async initializeStartupData(): Promise<DisplayDispatchResult> {
    await this.refreshAvailableSeries();

    let symbol = "NIFTY 50";
    let timeframe: DisplayTimeframe = "1D";

    if (typeof localStorage !== "undefined") {
      const savedSym = localStorage.getItem("gann_active_symbol");
      if (savedSym && (this.state.availableSeries.some((s) => s.symbol === savedSym) || savedSym === "NIFTY 50")) {
        symbol = savedSym;
      }
      const savedTf = localStorage.getItem("gann_active_timeframe") as DisplayTimeframe;
      if (savedTf && ["1D", "1W", "1M", "60m", "15m", "5m", "1m"].includes(savedTf)) {
        timeframe = savedTf;
      }
    }

    this.state.activeSymbol = symbol;
    this.state.activeTimeframe = timeframe;

    const res = await this.displayVaultSeries({ symbol, timeframe });
    if (!res.success) {
      // Clear any stale state to preserve a clean empty prompt
      const gridStore = useGridState.getState();
      gridStore.setCandles([]);
      gridStore.setSwingPoints([]);
      this.state.displayCandles = [];
      this.state.displaySwings = [];
      this.state.rawBars = [];
      this.state.isLoading = false;
      this.state.statusNotice = "Vault has 0 records. Load series from Master DuckDB Vault.";
      this.notify();
    }

    // Schedule: 1/3 Startup check is complete. Now schedule 2/3: Every 3 hours.
    this.startScheduledSync();
    return res;
  }

  /**
   * Switches the active series symbol, queries vault candles, and updates chart.
   */
  public async setSeries(symbol: string): Promise<DisplayDispatchResult> {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("gann_active_symbol", symbol);
    }
    this.state.activeSymbol = symbol;
    return this.displayVaultSeries({ symbol, timeframe: this.state.activeTimeframe });
  }

  /**
   * Changes active display timeframe (1D, 1W, 1M, intraday) on the
   * currently loaded raw bars without re-fetching from disk.
   */
  public setTimeframe(newTimeframe: DisplayTimeframe): DisplayDispatchResult {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("gann_active_timeframe", newTimeframe);
    }
    this.state.activeTimeframe = newTimeframe;

    if (this.state.rawBars.length === 0) {
      // If no raw bars, trigger vault fetch
      this.displayVaultSeries({ symbol: this.state.activeSymbol, timeframe: newTimeframe });
      return {
        success: true,
        symbol: this.state.activeSymbol,
        timeframe: newTimeframe,
        candleCount: 0,
        swingCount: 0,
        startDate: "N/A",
        endDate: "N/A",
        source: "vault",
        message: `Triggered vault fetch on ${newTimeframe}.`,
      };
    }

    const aggregatedBars = aggregateMarketBars(this.state.rawBars, newTimeframe);
    const displayCandles = formatBarsForDisplay(aggregatedBars, newTimeframe);
    const gridStore = useGridState.getState();
    const swings = extractDisplaySwings(displayCandles, gridStore.basePrice, gridStore.pricePerUnit, newTimeframe);

    return this.dispatchToChart(
      this.state.activeSymbol,
      newTimeframe,
      displayCandles,
      swings,
      this.state.metadata?.source || "vault",
      true
    );
  }

  /**
   * Resets chart to the built-in rich Japanese candlestick sample dataset.
   */
  public displaySampleSeries(): DisplayDispatchResult {
    const gridStore = useGridState.getState();
    gridStore.loadSampleDataset();
    gridStore.jumpToLatest(
      typeof window !== "undefined" ? window.innerWidth : 1440,
      typeof window !== "undefined" ? window.innerHeight : 900
    );

    const candles = gridStore.candles;
    const swings = gridStore.swingPoints;

    return this.dispatchToChart(
      "NIFTY 50 (Sample)",
      "1D",
      candles,
      swings,
      "sample",
      true
    );
  }

  public readonly THREE_HOURS_MS = 3 * 60 * 60 * 1000; // 10,800,000 ms (3 hours)

  /**
   * Schedules a low-resource sync check once every 3 hours after app opening.
   * Completely eradicates continuous short-interval polling to preserve RAM and CPU.
   */
  public startScheduledSync(intervalMs: number = 3 * 60 * 60 * 1000): void {
    if (this.autoSyncTimer) return;
    this.autoSyncTimer = setInterval(() => {
      console.info("[DataDisplayCoordinator] Triggering scheduled 3-hour vault sync...");
      this.pollVaultUpdates().catch((err) => {
        console.warn("[DataDisplayCoordinator] Error in scheduled 3-hour vault sync:", err);
      });
    }, intervalMs);
  }

  /**
   * Alias for backward compatibility.
   */
  public startAutoSyncPolling(intervalMs?: number): void {
    this.startScheduledSync(intervalMs || this.THREE_HOURS_MS);
  }

  /**
   * Stops the 3-hour scheduled sync timer.
   */
  public stopScheduledSync(): void {
    if (this.autoSyncTimer) {
      clearInterval(this.autoSyncTimer);
      this.autoSyncTimer = null;
    }
  }

  public stopAutoSyncPolling(): void {
    this.stopScheduledSync();
  }

  /**
   * Executes a lightweight check against the vault backend. If new data is detected
   * for the active series, smoothly updates the chart.
   */
  public async pollVaultUpdates(): Promise<void> {
    if (this.isSyncing || this.state.isLoading) return;
    if (!this.state.isVaultActive && this.state.metadata?.source !== "vault") return;

    const symbol = this.state.activeSymbol;
    const currentCount = this.state.rawBars.length;
    const currentLatestTs = this.state.metadata?.endDate;

    try {
      this.isSyncing = true;
      const checkRes = await checkVaultUpdate(symbol, currentCount, currentLatestTs);
      if (checkRes.hasUpdate) {
        console.info(`[AutoSync] New vault data detected for ${symbol}: +${checkRes.newBarsCount} new bars (latest: ${checkRes.latestTimestamp}).`);
        await this.applyLiveVaultUpdate(checkRes);
      }
    } catch (err) {
      console.warn("[AutoSync] Error during background vault poll:", err);
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Smoothly applies newly detected vault rows to the active chart without resetting the user's
   * horizontal pan, zoom level, origin (0, 0), or manual lowest/highest seeds.
   */
  public async applyLiveVaultUpdate(updateInfo: VaultUpdateCheckResult): Promise<void> {
    const symbol = this.state.activeSymbol;
    const timeframe = this.state.activeTimeframe;

    const queryRes = await queryVaultCandles(symbol);
    if (!queryRes.success || queryRes.candles.length === 0) return;

    this.state.rawBars = queryRes.candles;

    // 1. Multi-timeframe aggregation
    const aggregatedBars = aggregateMarketBars(queryRes.candles, timeframe);

    // 2. K&E 8x8 Grid Formatting
    const displayCandles = formatBarsForDisplay(aggregatedBars, timeframe, 2);

    // 3. Gann swing pivots
    const gridStore = useGridState.getState();
    const swings = extractDisplaySwings(displayCandles, gridStore.basePrice, gridStore.pricePerUnit, timeframe);

    // 4. Update central Zustand store while preserving user pan, zoom & manual seeds
    gridStore.setTimePerUnit(timeframe);
    gridStore.setCandles(displayCandles);
    gridStore.setSwingPoints(swings);

    // 5. If Auto-Fit Y is enabled, adapt the vertical ceiling and centering smoothly
    if (gridStore.autoFitY) {
      gridStore.fitViewportToActiveCandles();
    }

    const startDate = displayCandles[0]?.timestamp || "N/A";
    const endDate = displayCandles[displayCandles.length - 1]?.timestamp || "N/A";

    this.state = {
      ...this.state,
      displayCandles,
      displaySwings: swings,
      metadata: {
        symbol,
        timeframe,
        totalBars: displayCandles.length,
        startDate,
        endDate,
        basePrice: gridStore.basePrice,
        pricePerUnit: gridStore.pricePerUnit,
        minPrice: gridStore.lowestPrice,
        maxPrice: gridStore.highestPrice,
        source: "vault",
        lastUpdated: new Date().toISOString(),
      },
      statusNotice: `Vault auto-updated: ${displayCandles.length.toLocaleString()} bars (latest: ${endDate})`,
    };
    this.notify();

    // 6. Show subtle status badge
    const newBarsText = updateInfo.newBarsCount > 0 ? `+${updateInfo.newBarsCount} new bars` : "New Data Loaded";
    gridStore.setVaultSyncBadge({
      visible: true,
      text: `⚡ Vault Synced: ${newBarsText} (${updateInfo.latestTimestamp || endDate})`,
      timestamp: Date.now(),
    });

    if (this.badgeDismissTimer) clearTimeout(this.badgeDismissTimer);
    this.badgeDismissTimer = setTimeout(() => {
      gridStore.setVaultSyncBadge({ visible: false, text: "", timestamp: 0 });
    }, 4500);

    // 7. Refresh series list in background in case new symbols were dropped
    this.refreshAvailableSeries().catch(() => {});
  }
}

export const DataDisplayCoordinator = new DataDisplayCoordinatorEngine();

if (typeof window !== "undefined") {
  (window as any).DataDisplayCoordinator = DataDisplayCoordinator;
}
