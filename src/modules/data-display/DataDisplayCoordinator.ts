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
  RawMarketBar,
  DisplayDatasetRequest,
  DisplaySeriesMetadata,
  DisplayDispatchResult,
  DisplayCoordinatorState,
} from "./DisplayTypes";
import {
  formatBarsForDisplay,
  extractDisplaySwings,
} from "./DisplaySeriesFormatter";
import { aggregateMarketBars } from "./TimeframeAggregator";
import { queryVaultCandles } from "./VaultQueryBridge";
import { parseBrokerCsv } from "../../utils/brokerCsvParser";

class DataDisplayCoordinatorEngine {
  private state: DisplayCoordinatorState = {
    activeSymbol: "NIFTY 50",
    activeTimeframe: "1D",
    rawBars: [],
    displayCandles: [],
    displaySwings: [],
    metadata: null,
    isLoading: false,
    statusNotice: null,
  };

  private listeners: Set<(state: DisplayCoordinatorState) => void> = new Set();

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
    source: "vault" | "csv" | "sample",
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

    // 1. Calculate min/max extremes
    let minPrice = Infinity;
    let maxPrice = -Infinity;
    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      if (c.low < minPrice) minPrice = c.low;
      if (c.high > maxPrice) maxPrice = c.high;
    }

    // 2. Dispatch to central Zustand store
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

      // 3. Gann 2-bar swing pivots
      const gridStore = useGridState.getState();
      const swings = extractDisplaySwings(displayCandles, gridStore.basePrice, gridStore.pricePerUnit);

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
   * Prepares and displays an uploaded CSV string on the chart.
   */
  public displayCsvSeries(
    csvContent: string,
    request: DisplayDatasetRequest = {}
  ): DisplayDispatchResult {
    const symbol = request.symbol || "CSV Upload";
    const timeframe = request.timeframe || "1D";

    this.state.isLoading = true;
    this.state.statusNotice = "Parsing CSV series...";
    this.notify();

    try {
      const brokerCandles = parseBrokerCsv(csvContent);
      if (brokerCandles.length === 0) {
        throw new Error("No valid OHLCV candle rows parsed from CSV.");
      }

      const rawBars: RawMarketBar[] = brokerCandles.map((bc) => ({
        timestamp: bc.timestamp,
        open: bc.open,
        high: bc.high,
        low: bc.low,
        close: bc.close,
        volume: bc.volume || 0,
      }));

      this.state.rawBars = rawBars;

      // 1. Timeframe aggregation
      const aggregatedBars = aggregateMarketBars(rawBars, timeframe);

      // 2. Format for display
      const displayCandles = formatBarsForDisplay(aggregatedBars, timeframe, request.columnSpacing || 2);

      // 3. Extract swings
      const gridStore = useGridState.getState();
      const swings = extractDisplaySwings(displayCandles, gridStore.basePrice, gridStore.pricePerUnit);

      // 4. Dispatch
      return this.dispatchToChart(
        symbol,
        timeframe,
        displayCandles,
        swings,
        "csv",
        request.autoJumpToLatest ?? true
      );
    } catch (err) {
      this.state.isLoading = false;
      this.state.statusNotice = `CSV Error: ${String(err)}`;
      this.notify();
      return {
        success: false,
        symbol,
        timeframe,
        candleCount: 0,
        swingCount: 0,
        startDate: "N/A",
        endDate: "N/A",
        source: "csv",
        message: `Failed to display CSV series: ${err instanceof Error ? err.message : String(err)}`,
        error: String(err),
      };
    }
  }

  /**
   * Changes active display timeframe (1D, 1W, 1M, intraday) on the
   * currently loaded raw bars without re-fetching from disk.
   */
  public setTimeframe(newTimeframe: DisplayTimeframe): DisplayDispatchResult {
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
    const swings = extractDisplaySwings(displayCandles, gridStore.basePrice, gridStore.pricePerUnit);

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
}

export const DataDisplayCoordinator = new DataDisplayCoordinatorEngine();
