/**
 * Indian Broker CSV Parser & Local SQLite Adapter
 * Parses standard Zerodha Kite & Alice Blue historical exports
 * and maps them directly into discrete K&E grid coordinates.
 */

import { SwingPoint, CandleData } from "../types/gann";
import { identifyCandlestickPatterns } from "./candlestickPatterns";

export interface BrokerCandle {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Parses Zerodha / Alice Blue CSV format:
 * Format A (Zerodha): Date/Time, Open, High, Low, Close, Volume
 * Format B (Alice Blue): Date, Open, High, Low, Close, Volume
 */
export function parseBrokerCsv(csvContent: string): BrokerCandle[] {
  const lines = csvContent.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const candles: BrokerCandle[] = [];
  const header = lines[0].toLowerCase().split(",").map((h) => h.trim());

  const dateIdx = header.findIndex((h) => h.includes("date") || h.includes("time"));
  const openIdx = header.findIndex((h) => h === "open");
  const highIdx = header.findIndex((h) => h === "high");
  const lowIdx = header.findIndex((h) => h === "low");
  const closeIdx = header.findIndex((h) => h === "close");
  const volIdx = header.findIndex((h) => h.includes("volume") || h.includes("vol"));

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim());
    if (cols.length < 5) continue;

    const candle: BrokerCandle = {
      timestamp: cols[dateIdx >= 0 ? dateIdx : 0],
      open: parseFloat(cols[openIdx >= 0 ? openIdx : 1]),
      high: parseFloat(cols[highIdx >= 0 ? highIdx : 2]),
      low: parseFloat(cols[lowIdx >= 0 ? lowIdx : 3]),
      close: parseFloat(cols[closeIdx >= 0 ? closeIdx : 4]),
      volume: volIdx >= 0 ? parseFloat(cols[volIdx]) : 0,
    };

    if (!isNaN(candle.high) && !isNaN(candle.low)) {
      candles.push(candle);
    }
  }

  return candles;
}

/**
 * Converts raw Broker candles into CandleData with automatic pattern detection
 * and assigns them sequentially to K&E grid columns (step = 2 for spacing).
 */
export function convertBrokerCandlesToCandleData(
  brokerCandles: BrokerCandle[],
  columnSpacing: number = 2
): CandleData[] {
  const raw: CandleData[] = brokerCandles.map((c, i) => ({
    id: `bc-${i}`,
    timestamp: c.timestamp,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
    gridCol: i * columnSpacing,
  }));

  return identifyCandlestickPatterns(raw);
}

/**
 * Converts raw price candles into Gann 2-Bar Swing Indicator Points
 * and locks them to discrete K&E 8x8 grid coordinates.
 */
export function extractGannSwings(
  candles: BrokerCandle[],
  basePrice: number,
  pricePerGridUnit: number = 25.0,
  columnSpacing: number = 2
): SwingPoint[] {
  if (candles.length < 3) return [];

  const swings: SwingPoint[] = [];
  let trend: "UP" | "DOWN" = "UP";

  candles.forEach((c, index) => {
    if (trend === "UP" && index >= 2) {
      if (c.low < candles[index - 1].low && candles[index - 1].low < candles[index - 2].low) {
        trend = "DOWN";
        swings.push({
          id: `swing-${index}`,
          timeStr: c.timestamp,
          price: candles[index - 1].high,
          gridCol: (index - 1) * columnSpacing,
          gridRow: Math.round((candles[index - 1].high - basePrice) / pricePerGridUnit),
          type: "SWING_HIGH",
          label: `Peak ₹${candles[index - 1].high}`,
        });
      }
    } else if (trend === "DOWN" && index >= 2) {
      if (c.high > candles[index - 1].high && candles[index - 1].high > candles[index - 2].high) {
        trend = "UP";
        swings.push({
          id: `swing-${index}`,
          timeStr: c.timestamp,
          price: candles[index - 1].low,
          gridCol: (index - 1) * columnSpacing,
          gridRow: Math.round((candles[index - 1].low - basePrice) / pricePerGridUnit),
          type: "SWING_LOW",
          label: `Bottom ₹${candles[index - 1].low}`,
        });
      }
    }
  });

  return swings;
}
