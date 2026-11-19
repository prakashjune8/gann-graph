/**
 * W.D. Gann Drafting Desk — Display Series Formatter
 * Module: src/modules/data-display/DisplaySeriesFormatter.ts
 *
 * Implements strict data normalization and K&E 8x8 coordinate projection:
 * 1. Zero-OHL Close-Only Normalization (maps O=H=L=C for early historical years).
 * 2. Ascending Chronological Sorting & Deduplication.
 * 3. True Natural Calendar Time Grid Column Projection (preserves weekends & holidays).
 * 4. Candlestick Pattern Recognition & Gann 2-Bar Swing Extraction.
 */

import { CandleData, SwingPoint } from "../../types/gann";
import { RawMarketBar, DisplayTimeframe } from "./DisplayTypes";
import { identifyCandlestickPatterns } from "../../utils/brokerCsvParser";
import { detectGannSwings } from "../autoscale-v2/SwingDetector";

/**
 * Parses diverse date representations (DD-MM-YYYY, DD/MM/YYYY, YYYY-MM-DD, ISO, epoch ms)
 * into a normalized UTC timestamp.
 */
export function parseDateToEpochMs(dateVal: string | number): number {
  if (typeof dateVal === "number") {
    return Number.isFinite(dateVal) ? dateVal : 0;
  }
  if (!dateVal || typeof dateVal !== "string") return 0;
  const trimmed = dateVal.trim();

  // 1. Strict regex for DD-MM-YYYY or DD/MM/YYYY
  const dmyMatch = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10);
    const year = parseInt(dmyMatch[3], 10);
    const hours = dmyMatch[4] ? parseInt(dmyMatch[4], 10) : 0;
    const minutes = dmyMatch[5] ? parseInt(dmyMatch[5], 10) : 0;
    const seconds = dmyMatch[6] ? parseInt(dmyMatch[6], 10) : 0;
    return Date.UTC(year, month - 1, day, hours - 5, minutes - 30, seconds);
  }

  // 2. Strict regex for YYYY-MM-DD or YYYY/MM/DD
  const ymdMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10);
    const day = parseInt(ymdMatch[3], 10);
    const hours = ymdMatch[4] ? parseInt(ymdMatch[4], 10) : 0;
    const minutes = ymdMatch[5] ? parseInt(ymdMatch[5], 10) : 0;
    const seconds = ymdMatch[6] ? parseInt(ymdMatch[6], 10) : 0;
    return Date.UTC(year, month - 1, day, hours - 5, minutes - 30, seconds);
  }

  // 3. Fallback standard Date.parse
  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Normalizes raw market bars into clean, zero-OHL safeguarded,
 * deduplicated, and chronologically ascending bars.
 */
export function normalizeRawMarketBars(rawBars: RawMarketBar[]): RawMarketBar[] {
  if (!rawBars || rawBars.length === 0) return [];

  const parsedBars: (RawMarketBar & { epochMs: number })[] = [];

  for (let i = 0; i < rawBars.length; i++) {
    const b = rawBars[i];
    const epochMs = parseDateToEpochMs(b.timestamp);
    if (epochMs <= 0) continue;

    let open = Number(b.open);
    let high = Number(b.high);
    let low = Number(b.low);
    const close = Number(b.close);
    const volume = Number(b.volume || 0);

    if (!Number.isFinite(close) || close <= 0) continue;

    // Zero-OHL normalization (e.g. 1990-1995 Nifty close-only series)
    if (!Number.isFinite(open) || open <= 0) open = close;
    if (!Number.isFinite(high) || high <= 0) high = Math.max(open, close);
    if (!Number.isFinite(low) || low <= 0) low = Math.min(open, close);

    parsedBars.push({
      ...b,
      open,
      high,
      low,
      close,
      volume: Math.max(0, volume),
      epochMs,
    });
  }

  // Sort strictly ascending by epoch timestamp
  parsedBars.sort((a, b) => a.epochMs - b.epochMs);

  // Deduplicate overlapping timestamps
  const deduplicated: RawMarketBar[] = [];
  const seenEpochs = new Set<number>();

  for (const bar of parsedBars) {
    if (!seenEpochs.has(bar.epochMs)) {
      seenEpochs.add(bar.epochMs);
      deduplicated.push(bar);
    }
  }

  return deduplicated;
}

/**
 * Formats normalized raw market bars into K&E 8x8 CandleData with
 * Natural Calendar Time discrete column coordinates.
 */
export function formatBarsForDisplay(
  bars: RawMarketBar[],
  timeframe: DisplayTimeframe = "1D",
  columnSpacing: number = 2
): CandleData[] {
  if (!bars || bars.length === 0) return [];

  const normalized = normalizeRawMarketBars(bars);
  if (normalized.length === 0) return [];

  const anchorTime = parseDateToEpochMs(normalized[0].timestamp);
  const hasValidAnchor = anchorTime > 0;

  // Natural calendar interval in milliseconds
  let intervalMs = 86400000; // 1 Day
  if (timeframe === "1W") intervalMs = 86400000 * 7;
  else if (timeframe === "1M") intervalMs = 86400000 * 30.4375;
  else if (timeframe === "60m") intervalMs = 3600000;
  else if (timeframe === "15m") intervalMs = 900000;
  else if (timeframe === "5m") intervalMs = 300000;
  else if (timeframe === "1m") intervalMs = 60000;

  const rawCandles: CandleData[] = normalized.map((bar, idx) => {
    let gridCol = idx * columnSpacing;

    if (hasValidAnchor) {
      const barTime = parseDateToEpochMs(bar.timestamp);
      if (barTime > 0) {
        const offset = Math.round((barTime - anchorTime) / intervalMs);
        gridCol = Math.max(0, offset);
      }
    }

    const timeStr = typeof bar.timestamp === "string" ? bar.timestamp : new Date(bar.timestamp).toISOString().slice(0, 10);

    return {
      id: `disp-c-${idx}`,
      timestamp: timeStr,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume || 0,
      gridCol,
    };
  });

  return identifyCandlestickPatterns(rawCandles);
}

/**
 * Extracts Gann Swing Indicator Points adapted to the active timeframe
 * and locks them to discrete K&E grid coordinates.
 * Achieves 100% mathematical parity with autoscale-v2 swing detection.
 */
export function extractDisplaySwings(
  candles: CandleData[],
  basePrice: number,
  pricePerGridUnit: number = 25.0,
  timeframe: DisplayTimeframe = "1D"
): SwingPoint[] {
  if (!candles || candles.length < 2) return [];

  const safePPU = Math.max(0.0001, pricePerGridUnit > 0 ? pricePerGridUnit : 25.0);

  // 1. Try fractal Gann swing detection with exact mathematical parity to autoscale-v2
  const gannNodes = detectGannSwings(candles, timeframe);
  if (gannNodes && gannNodes.length > 0) {
    let lastConfirmedHigh = -Infinity;
    let lastConfirmedLow = Infinity;
    let hCount = 0;
    let lCount = 0;

    return gannNodes.map((node, idx) => {
      let label = "";

      if (node.type === "HH") {
        hCount++;
        if (Number.isFinite(lastConfirmedHigh) && lastConfirmedHigh > 0) {
          const isHigher = node.price >= lastConfirmedHigh;
          label = `${isHigher ? "HH" : "LH"}${hCount}`;
        } else {
          label = `H${hCount}`;
        }
        lastConfirmedHigh = node.price;
      } else {
        lCount++;
        if (Number.isFinite(lastConfirmedLow) && lastConfirmedLow < Infinity) {
          const isHigher = node.price >= lastConfirmedLow;
          label = `${isHigher ? "HL" : "LL"}${lCount}`;
        } else {
          label = `L${lCount}`;
        }
        lastConfirmedLow = node.price;
      }

      return {
        id: `disp-sw-${node.type.toLowerCase()}-${idx + 1}`,
        timeStr: node.date,
        price: node.price,
        gridCol: node.col,
        gridRow: Math.round((node.price - basePrice) / safePPU),
        type: node.type === "HH" ? "SWING_HIGH" : "SWING_LOW",
        label,
      };
    });
  }

  // 2. Fallback to 2-Bar Swing Indicator for very short datasets
  const swings: SwingPoint[] = [];
  let isUpTrend: boolean | null = null;
  let extremeBar = candles[0];
  let fallbackLastHigh = -Infinity;
  let fallbackLastLow = Infinity;
  let fbHighCount = 0;
  let fbLowCount = 0;

  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1];
    const curr = candles[i];

    if (isUpTrend === null) {
      if (curr.high > prev.high) {
        isUpTrend = true;
        extremeBar = curr;
      } else if (curr.low < prev.low) {
        isUpTrend = false;
        extremeBar = curr;
      }
      continue;
    }

    if (isUpTrend) {
      if (curr.high > extremeBar.high) {
        extremeBar = curr;
      }
      // 2-Bar Down Reversal
      if (curr.low < prev.low && i >= 2 && prev.low < candles[i - 2].low) {
        fbHighCount++;
        const row = Math.round((extremeBar.high - basePrice) / safePPU);
        const isHigher = Number.isFinite(fallbackLastHigh) && fallbackLastHigh > 0
          ? extremeBar.high >= fallbackLastHigh
          : true;
        swings.push({
          id: `disp-sw-high-${swings.length + 1}`,
          timeStr: extremeBar.timestamp,
          price: extremeBar.high,
          gridCol: extremeBar.gridCol,
          gridRow: row,
          type: "SWING_HIGH",
          label: `${isHigher ? "HH" : "LH"}${fbHighCount}`,
        });
        fallbackLastHigh = extremeBar.high;
        isUpTrend = false;
        extremeBar = curr;
      }
    } else {
      if (curr.low < extremeBar.low) {
        extremeBar = curr;
      }
      // 2-Bar Up Reversal
      if (curr.high > prev.high && i >= 2 && prev.high > candles[i - 2].high) {
        fbLowCount++;
        const row = Math.round((extremeBar.low - basePrice) / safePPU);
        const isHigher = Number.isFinite(fallbackLastLow) && fallbackLastLow < Infinity
          ? extremeBar.low >= fallbackLastLow
          : false;
        swings.push({
          id: `disp-sw-low-${swings.length + 1}`,
          timeStr: extremeBar.timestamp,
          price: extremeBar.low,
          gridCol: extremeBar.gridCol,
          gridRow: row,
          type: "SWING_LOW",
          label: `${isHigher ? "HL" : "LL"}${fbLowCount}`,
        });
        fallbackLastLow = extremeBar.low;
        isUpTrend = true;
        extremeBar = curr;
      }
    }
  }

  return swings;
}
