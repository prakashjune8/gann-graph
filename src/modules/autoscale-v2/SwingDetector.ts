/**
 * W.D. Gann Mechanical Swing Detector with Fractal Timeframe Scaling
 * Auto-Scale V2 Engine — Step 1 & Scaler Fix 4
 *
 * Implements W.D. Gann's strict mechanical swing chart filtering.
 * Evaluates isolated swing highs (Higher Highs / Peaks) and swing lows (Lower Lows / Troughs)
 * with a symmetrical lookback window dynamically adapted to the active timeframe
 * (1m, 5m, 15m, 60m, 1D, 1W, 1M) using Indian market session cadence (375 mins/session).
 */

import { CandleData } from "../../types/gann";

export interface SwingNode {
  col: number;
  price: number;
  type: "HH" | "LL";
  date: string;
}

/**
 * Returns the fractal swing lookback parameter based on Indian market session cadence
 * (375 minutes per session: 09:15 to 15:30 IST) with safe dynamic clamping.
 *
 * Symmetrical Lookback Rules:
 * - 1D (Daily): 3 bars (Canonical W.D. Gann 3-day swing chart rule; 3 trading days flank)
 * - 1W (Weekly): 2 bars (2 weeks flank)
 * - 1M (Monthly): 2 bars (2 months flank)
 * - 60m (Hourly): 4 bars (~4 hours flank, ~2/3 of an Indian session)
 * - 15m (15-Minute): 5 bars (75 mins flank = 1/5th session = 25 bars/day cadence)
 * - 5m (5-Minute): 10 bars (50 mins flank = 75 bars/day cadence)
 * - 1m (1-Minute): 15 bars (15 mins flank = 375 bars/day cadence)
 *
 * Safe Clamping:
 * If a slice has fewer candles than nominalLookback * 2 + 1, it safely clamps
 * lookback down to Math.floor((N - 1) / 2) so short loaded slices never fail.
 */
export function getFractalSwingLookback(
  timeframeOrLookback: string | number = "1D",
  candleCount?: number
): number {
  let nominal = 3;

  if (typeof timeframeOrLookback === "number") {
    nominal = Math.max(1, Math.round(timeframeOrLookback));
  } else if (typeof timeframeOrLookback === "string") {
    const rawTf = timeframeOrLookback.trim();
    if (rawTf === "1m" || rawTf.toLowerCase() === "1min" || rawTf.toLowerCase() === "1 min" || rawTf.toLowerCase() === "1m_intraday") {
      nominal = 15; // 15 mins flank (375 bars/day)
    } else if (rawTf === "1M" || rawTf.toLowerCase() === "monthly" || rawTf.toLowerCase() === "1 month" || rawTf.toLowerCase() === "1mo") {
      nominal = 2; // 2 months flank
    } else {
      const tf = rawTf.toUpperCase();
      switch (tf) {
        case "1D":
        case "DAILY":
        case "1 DAY":
          nominal = 3; // Baseline 1D anchor
          break;
        case "1W":
        case "WEEKLY":
        case "1 WEEK":
          nominal = 2;
          break;
        case "60M":
        case "1H":
        case "60 MIN":
          nominal = 4;
          break;
        case "15M":
        case "15 MIN":
          nominal = 5; // 75 mins flank (25 bars/day)
          break;
        case "5M":
        case "5 MIN":
          nominal = 10; // 50 mins flank (75 bars/day)
          break;
        default:
          nominal = 3;
          break;
      }
    }
  }

  // Safe Dynamic Clamping Guard: ensure loaded slices never fail if candleCount >= 3
  if (candleCount !== undefined && Number.isFinite(candleCount) && candleCount > 0) {
    const maxSafe = Math.max(1, Math.floor((candleCount - 1) / 2));
    return Math.min(nominal, maxSafe);
  }

  return nominal;
}

/**
 * Detects mechanical Gann swing nodes using a symmetrical lookback scan.
 * Dynamically adapts lookback based on timeframe or raw number with safe clamping.
 *
 * @param candles Full array of chronological OHLC candlestick data
 * @param lookbackOrTimeframe Lookback number or timeframe string (e.g., 3, "1D", "15m", "5m", "1m")
 * @returns Filtered, alternating array of Gann swing nodes (HH / LL)
 */
export function detectGannSwings(
  candles: CandleData[],
  lookbackOrTimeframe: number | string = 3
): SwingNode[] {
  if (!candles || candles.length < 3) {
    return [];
  }

  const lookback = getFractalSwingLookback(lookbackOrTimeframe, candles.length);
  if (candles.length < lookback * 2 + 1) {
    return [];
  }

  const rawSwings: SwingNode[] = [];

  // 1. Symmetrical 3-Day Bar Scan
  for (let i = lookback; i < candles.length - lookback; i++) {
    const current = candles[i];

    // Detect Swing High (HH): Strictly higher high than the 3 preceding AND 3 subsequent candles
    let isHH = true;
    for (let offset = 1; offset <= lookback; offset++) {
      if (candles[i - offset].high >= current.high || candles[i + offset].high >= current.high) {
        isHH = false;
        break;
      }
    }

    // Detect Swing Low (LL): Strictly lower low than the 3 preceding AND 3 subsequent candles
    let isLL = true;
    for (let offset = 1; offset <= lookback; offset++) {
      if (candles[i - offset].low <= current.low || candles[i + offset].low <= current.low) {
        isLL = false;
        break;
      }
    }

    // In the rare event a single bar satisfies both (e.g. extreme outside expansion),
    // prioritize the stronger directional excursion
    if (isHH && !isLL) {
      rawSwings.push({
        col: current.gridCol,
        price: current.high,
        type: "HH",
        date: current.timestamp,
      });
    } else if (isLL && !isHH) {
      rawSwings.push({
        col: current.gridCol,
        price: current.low,
        type: "LL",
        date: current.timestamp,
      });
    } else if (isHH && isLL) {
      // Outside key reversal: pick the node based on close vs open direction
      if (current.close >= current.open) {
        rawSwings.push({
          col: current.gridCol,
          price: current.high,
          type: "HH",
          date: current.timestamp,
        });
      } else {
        rawSwings.push({
          col: current.gridCol,
          price: current.low,
          type: "LL",
          date: current.timestamp,
        });
      }
    }
  }

  if (rawSwings.length <= 1) {
    return rawSwings;
  }

  // 2. Consolidation & Strict Alternation Filter
  // Eliminates consecutive nodes of the same type:
  // - Consecutive 'HH': Keep only the absolute highest high
  // - Consecutive 'LL': Keep only the absolute lowest low
  const consolidated: SwingNode[] = [];

  for (const node of rawSwings) {
    if (consolidated.length === 0) {
      consolidated.push(node);
      continue;
    }

    const last = consolidated[consolidated.length - 1];

    if (node.type === last.type) {
      if (node.type === "HH") {
        if (node.price > last.price) {
          consolidated[consolidated.length - 1] = node;
        }
      } else {
        if (node.price < last.price) {
          consolidated[consolidated.length - 1] = node;
        }
      }
    } else {
      consolidated.push(node);
    }
  }

  return consolidated;
}
