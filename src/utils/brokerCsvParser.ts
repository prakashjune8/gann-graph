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

    // Sanitize numeric strings: strip commas, currency symbols (₹, $), quotes, and whitespace
    const rawOpen = (cols[openIdx >= 0 ? openIdx : 1] || "").replace(/[^0-9.-]+/g, "");
    const rawHigh = (cols[highIdx >= 0 ? highIdx : 2] || "").replace(/[^0-9.-]+/g, "");
    const rawLow = (cols[lowIdx >= 0 ? lowIdx : 3] || "").replace(/[^0-9.-]+/g, "");
    const rawClose = (cols[closeIdx >= 0 ? closeIdx : 4] || "").replace(/[^0-9.-]+/g, "");
    const rawVol = volIdx >= 0 ? (cols[volIdx] || "").replace(/[^0-9.-]+/g, "") : "0";

    const candle: BrokerCandle = {
      timestamp: cols[dateIdx >= 0 ? dateIdx : 0],
      open: parseFloat(rawOpen),
      high: parseFloat(rawHigh),
      low: parseFloat(rawLow),
      close: parseFloat(rawClose),
      volume: rawVol !== "" ? parseFloat(rawVol) : 0,
    };

    // Enforce strict finite validation across all data points (Audit Finding 1.1 & 1.2 Remediation)
    if (
      Number.isFinite(candle.open) &&
      Number.isFinite(candle.high) &&
      Number.isFinite(candle.low) &&
      Number.isFinite(candle.close) &&
      Number.isFinite(candle.volume)
    ) {
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

  // Guard against division by zero (Audit Finding 1.5 Remediation)
  const safeDivisor =
    pricePerGridUnit > 0 ? pricePerGridUnit : basePrice > 0 ? basePrice / 100 : 1.0;

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
          gridRow: Math.round((candles[index - 1].high - basePrice) / safeDivisor),
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
          gridRow: Math.round((candles[index - 1].low - basePrice) / safeDivisor),
          type: "SWING_LOW",
          label: `Bottom ₹${candles[index - 1].low}`,
        });
      }
    }
  });

  return swings;
}
