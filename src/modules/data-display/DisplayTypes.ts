/**
 * W.D. Gann Drafting Desk — Data Display Execution Types
 * Module: src/modules/data-display/DisplayTypes.ts
 *
 * Defines contracts, options, and metadata structures for the
 * dedicated data display execution pipeline.
 */

import { CandleData, SwingPoint } from "../../types/gann";

export type DisplayTimeframe = "1D" | "1W" | "1M" | "60m" | "15m" | "5m";

export interface RawMarketBar {
  timestamp: string | number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  oi?: number;
  symbol?: string;
  exchange?: string;
}

export interface DisplayDatasetRequest {
  symbol?: string;
  timeframe?: DisplayTimeframe;
  startDate?: string;
  endDate?: string;
  limit?: number;
  columnSpacing?: number;
  source?: "vault" | "csv" | "sample";
  autoJumpToLatest?: boolean;
}

export interface DisplaySeriesMetadata {
  symbol: string;
  timeframe: DisplayTimeframe;
  totalBars: number;
  startDate: string;
  endDate: string;
  basePrice: number;
  pricePerUnit: number;
  minPrice: number;
  maxPrice: number;
  source: "vault" | "csv" | "sample";
  lastUpdated: string;
}

export interface DisplayDispatchResult {
  success: boolean;
  symbol: string;
  timeframe: DisplayTimeframe;
  candleCount: number;
  swingCount: number;
  startDate: string;
  endDate: string;
  source: "vault" | "csv" | "sample";
  message: string;
  error?: string;
}

export interface AvailableSeriesInfo {
  seriesId: string;
  symbol: string;
  exchange: string;
  instrumentToken: number;
  assetClass: string;
  segment: string;
  rowCount: number;
  earliestDate: string;
  latestDate: string;
  expiry?: string | null;
  strike?: number | null;
}

export interface DisplayCoordinatorState {
  activeSymbol: string;
  activeTimeframe: DisplayTimeframe;
  availableSeries: AvailableSeriesInfo[];
  rawBars: RawMarketBar[];
  displayCandles: CandleData[];
  displaySwings: SwingPoint[];
  metadata: DisplaySeriesMetadata | null;
  isLoading: boolean;
  statusNotice: string | null;
  isVaultActive: boolean;
}
