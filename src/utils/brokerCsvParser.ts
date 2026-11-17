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
 * Parses Indian date strings into UTC epoch timestamps aligned to Indian Standard Time (IST, UTC+05:30).
 * Specifically supports DD-MM-YYYY and DD/MM/YYYY formats (with optional HH:mm[:ss]),
 * as well as standard ISO YYYY-MM-DD.
 * Forces date creation using explicit UTC inputs offset by IST:
 * Date.UTC(year, month - 1, day, -5, -30, 0)
 */
export function parseIndianDateToTimestamp(dateStr: string): number {
  if (!dateStr || typeof dateStr !== "string") return 0;
  const trimmed = dateStr.trim();

  // Strict regex for DD-MM-YYYY or DD/MM/YYYY with optional time
  const ddmmyyyyRegex = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/;
  const matchDmy = trimmed.match(ddmmyyyyRegex);
  if (matchDmy) {
    const day = parseInt(matchDmy[1], 10);
    const month = parseInt(matchDmy[2], 10);
    const year = parseInt(matchDmy[3], 10);
    const hours = matchDmy[4] ? parseInt(matchDmy[4], 10) : 0;
    const minutes = matchDmy[5] ? parseInt(matchDmy[5], 10) : 0;
    const seconds = matchDmy[6] ? parseInt(matchDmy[6], 10) : 0;

    // Force date creation using explicit UTC inputs offset by IST (UTC+05:30)
    // Daily bars with hours=0, minutes=0 map directly to Date.UTC(year, month - 1, day, -5, -30, 0)
    return Date.UTC(year, month - 1, day, hours - 5, minutes - 30, seconds);
  }

  // Fallback regex for ISO YYYY-MM-DD or YYYY/MM/DD with optional time
  const yyyymmddRegex = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/;
  const matchYmd = trimmed.match(yyyymmddRegex);
  if (matchYmd) {
    const year = parseInt(matchYmd[1], 10);
    const month = parseInt(matchYmd[2], 10);
    const day = parseInt(matchYmd[3], 10);
    const hours = matchYmd[4] ? parseInt(matchYmd[4], 10) : 0;
    const minutes = matchYmd[5] ? parseInt(matchYmd[5], 10) : 0;
    const seconds = matchYmd[6] ? parseInt(matchYmd[6], 10) : 0;

    return Date.UTC(year, month - 1, day, hours - 5, minutes - 30, seconds);
  }

  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Converts raw Broker candles into CandleData with automatic pattern detection
 * and assigns them to discrete K&E grid columns using True Natural Calendar Time.
 * In Natural Calendar mode, gridCol = Math.round((candleTime - anchorTime) / 86400000),
 * physically preserving weekends and market holidays as empty columns.
 */
export function convertBrokerCandlesToCandleData(
  brokerCandles: BrokerCandle[],
  columnSpacing: number = 2
): CandleData[] {
  if (brokerCandles.length === 0) return [];

  const anchorTime = parseIndianDateToTimestamp(brokerCandles[0].timestamp);
  const hasValidAnchor = anchorTime > 0;

  const raw: CandleData[] = brokerCandles.map((c, i) => {
    let gridCol = i * columnSpacing;

    if (hasValidAnchor) {
      const candleTime = parseIndianDateToTimestamp(c.timestamp);
      if (candleTime > 0) {
        const dayOffset = Math.round((candleTime - anchorTime) / 86400000);
        gridCol = Math.max(0, dayOffset);
      }
    }

    return {
      id: `bc-${i}`,
      timestamp: c.timestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
      gridCol,
    };
  });

  return identifyCandlestickPatterns(raw);
}

/**
 * Converts raw price candles into Gann 2-Bar Swing Indicator Points
 * and locks them to discrete K&E 8x8 grid coordinates aligned with Natural Calendar Time.
 */
export function extractGannSwings(
  candles: BrokerCandle[],
  basePrice: number,
  pricePerGridUnit: number = 25.0,
  columnSpacing: number = 2
): SwingPoint[] {
  if (candles.length < 3) return [];

  // Guard against division by zero (Audit Finding 1.5 Remediation)
  const safeDivisor = Math.max(
    0.0001,
    pricePerGridUnit > 0 ? pricePerGridUnit : basePrice > 0 ? basePrice / 100 : 1.0
  );

  const anchorTime = parseIndianDateToTimestamp(candles[0].timestamp);
  const hasValidAnchor = anchorTime > 0;

  const getColForIndex = (idx: number) => {
    if (hasValidAnchor) {
      const cTime = parseIndianDateToTimestamp(candles[idx].timestamp);
      if (cTime > 0) {
        return Math.max(0, Math.round((cTime - anchorTime) / 86400000));
      }
    }
    return idx * columnSpacing;
  };

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
          gridCol: getColForIndex(index - 1),
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
          gridCol: getColForIndex(index - 1),
          gridRow: Math.round((candles[index - 1].low - basePrice) / safeDivisor),
          type: "SWING_LOW",
          label: `Bottom ₹${candles[index - 1].low}`,
        });
      }
    }
  });

  return swings;
}
