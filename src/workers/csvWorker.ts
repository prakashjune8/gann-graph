/**
 * Dedicated Web Worker for Heavy Broker CSV Ingestion & Pattern Extraction
 *
 * Offloads CPU-intensive CSV string splitting, column parsing, candlestick pattern
 * detection, and Gann 2-bar swing extraction from the main UI thread to guarantee
 * a locked 60 FPS viewport in PyWebView.
 */

import {
  parseBrokerCsv,
  convertBrokerCandlesToCandleData,
  extractGannSwings,
} from "../utils/brokerCsvParser";
import { CandleData, SwingPoint } from "../types/gann";

export interface CsvWorkerRequest {
  csvContent: string;
  columnSpacing?: number;
  basePrice?: number;
  pricePerGridUnit?: number;
}

export interface CsvWorkerResponse {
  success: boolean;
  candles: CandleData[];
  swings: SwingPoint[];
  totalRows: number;
  parseTimeMs: number;
  error?: string;
}

self.onmessage = (e: MessageEvent<CsvWorkerRequest>) => {
  const startTime = performance.now();
  try {
    const {
      csvContent,
      columnSpacing = 2,
      basePrice = 21500,
      pricePerGridUnit = 25.0,
    } = e.data;

    if (!csvContent || typeof csvContent !== "string") {
      throw new Error("Invalid or empty CSV content provided.");
    }

    // 1. Heavy string splitting & CSV column extraction
    const rawBrokerCandles = parseBrokerCsv(csvContent);

    if (rawBrokerCandles.length === 0) {
      throw new Error("No valid OHLC candle rows found in CSV.");
    }

    // 2. Candlestick creation & pattern recognition
    const candles = convertBrokerCandlesToCandleData(rawBrokerCandles, columnSpacing);

    // 3. Gann 2-bar swing pivots extraction (Guarded pricePerGridUnit divisor)
    const safePricePerGridUnit =
      pricePerGridUnit > 0 ? pricePerGridUnit : basePrice > 0 ? basePrice / 100 : 1.0;
    const swings = extractGannSwings(rawBrokerCandles, basePrice, safePricePerGridUnit, columnSpacing);

    const parseTimeMs = Math.round(performance.now() - startTime);

    const response: CsvWorkerResponse = {
      success: true,
      candles,
      swings,
      totalRows: rawBrokerCandles.length,
      parseTimeMs,
    };

    self.postMessage(response);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const response: CsvWorkerResponse = {
      success: false,
      candles: [],
      swings: [],
      totalRows: 0,
      parseTimeMs: Math.round(performance.now() - startTime),
      error: errorMsg,
    };
    self.postMessage(response);
  }
};
