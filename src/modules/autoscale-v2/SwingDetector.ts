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
 * Standard Indian equity trading session duration in minutes (NSE / BSE / MCX equity indices):
 * 09:15 IST to 15:30 IST = 6 hours 15 minutes = 375 minutes.
 */
export const STANDARD_SESSION_MINUTES = 375;

export interface ParsedTimeframeDetails {
  barMinutes: number;
  category: "INTRADAY" | "DAILY" | "WEEKLY" | "MONTHLY";
  sessionDensity: number; // Bars per 375-min session
}

/**
 * Robustly parses diverse timeframe specifications (e.g., "1m", "5m", "15m", "60m", "1D", "1W", "1M")
 * into bar duration in minutes, timeframe category, and session bar density.
 */
export function parseTimeframeToMinutes(
  timeframeOrLookback: string | number,
  sessionMinutes: number = STANDARD_SESSION_MINUTES
): ParsedTimeframeDetails {
  if (typeof timeframeOrLookback === "number") {
    const mins = Math.max(0.1, timeframeOrLookback);
    const isIntra = mins < sessionMinutes;
    return {
      barMinutes: mins,
      category: isIntra ? "INTRADAY" : "DAILY",
      sessionDensity: sessionMinutes / mins,
    };
  }

  const raw = String(timeframeOrLookback || "1D").trim();

  // 1. Strict Monthly Check (case-sensitive for '1M' vs '1m')
  if (raw === "1M" || raw.toLowerCase() === "1mo" || raw.toLowerCase().startsWith("month")) {
    const mins = sessionMinutes * 21;
    return { barMinutes: mins, category: "MONTHLY", sessionDensity: 1 / 21 };
  }

  const lower = raw.toLowerCase();

  // 2. Strict Weekly Check
  if (lower === "1w" || lower.startsWith("week")) {
    const mins = sessionMinutes * 5;
    return { barMinutes: mins, category: "WEEKLY", sessionDensity: 1 / 5 };
  }

  // 3. Strict Daily Check (Canonical 1D anchor)
  if (lower === "1d" || lower.startsWith("day") || lower.startsWith("daily")) {
    return { barMinutes: sessionMinutes, category: "DAILY", sessionDensity: 1.0 };
  }

  // 4. Intraday Hourly (e.g. "1h", "2h", "4h", "60 min", "1 hour")
  const hourMatch = lower.match(/^(\d+)\s*(h|hr|hrs|hour|hours)$/);
  if (hourMatch) {
    const mins = parseInt(hourMatch[1], 10) * 60;
    return {
      barMinutes: mins,
      category: "INTRADAY",
      sessionDensity: sessionMinutes / Math.max(1, mins),
    };
  }

  // 5. Intraday Minutes (e.g. "1m", "3m", "5m", "10m", "15m", "30m", "60m")
  const minMatch = lower.match(/^(\d+)\s*(m|min|mins|minute|minutes)?$/);
  if (minMatch) {
    const mins = Math.max(1, parseInt(minMatch[1], 10));
    const isIntra = mins < sessionMinutes;
    return {
      barMinutes: mins,
      category: isIntra ? "INTRADAY" : "DAILY",
      sessionDensity: sessionMinutes / mins,
    };
  }

  // Default fallback: 1D
  return { barMinutes: sessionMinutes, category: "DAILY", sessionDensity: 1.0 };
}

/**
 * Computes lookback bar count dynamically from the active timeframe and session bar density
 * rather than relying on a single static constant.
 *
 * Mathematical Derivation:
 * - Daily (1D): 3 bars (Canonical W.D. Gann 3-day swing chart rule; 3 full trading sessions flank).
 * - Weekly (1W): 2 bars (2-week flank ~ 10 trading sessions).
 * - Monthly (1M): 2 bars (2-month flank ~ 42 trading sessions).
 * - Intraday: Dynamically adapts across bar density D = sessionMinutes / barMinutes:
 *     * 1m (D = 375 bars/session)  -> 15 bars (15-min micro-swing = 1/25th session)
 *     * 5m (D = 75 bars/session)   -> 10 bars (50-min swing = 2/15th session)
 *     * 15m (D = 25 bars/session)  -> 5 bars (75-min swing = 1/5th session)
 *     * 60m (D = 6.25 bars/session)-> 4 bars (4-hour swing = ~2/3 session)
 *
 * For arbitrary custom intraday intervals (e.g. 2m, 3m, 10m, 30m, 45m), lookback is
 * smoothly interpolated along the harmonic session density curve.
 */
export function computeDynamicSwingLookback(
  timeframeOrLookback: string | number = "1D",
  candleCount?: number,
  sessionMinutes: number = STANDARD_SESSION_MINUTES
): number {
  if (typeof timeframeOrLookback === "number" && timeframeOrLookback >= 1 && timeframeOrLookback <= 50) {
    // If a direct integer lookback was explicitly requested, respect it with safe clamping
    const nominal = Math.round(timeframeOrLookback);
    if (candleCount !== undefined && Number.isFinite(candleCount) && candleCount > 0) {
      const maxSafe = Math.max(1, Math.floor((candleCount - 1) / 2));
      return Math.min(nominal, maxSafe);
    }
    return nominal;
  }

  const parsed = parseTimeframeToMinutes(timeframeOrLookback, sessionMinutes);
  let nominal = 3;

  if (parsed.category === "MONTHLY") {
    nominal = 2;
  } else if (parsed.category === "WEEKLY") {
    nominal = 2;
  } else if (parsed.category === "DAILY") {
    nominal = 3; // Canonical W.D. Gann 3-day swing chart rule
  } else {
    // INTRADAY: Dynamically computed from session bar density
    const d = parsed.sessionDensity;
    if (d >= 75) {
      // High density range: 5m (75 bars/session) to 1m (375 bars/session)
      // Scales smoothly from 10 to 15 bars
      nominal = Math.round(10 + ((d - 75) / (375 - 75)) * 5);
    } else if (d >= 25) {
      // Intermediate density range: 15m (25 bars/session) to 5m (75 bars/session)
      // Scales smoothly from 5 to 10 bars
      nominal = Math.round(5 + ((d - 25) / (75 - 25)) * 5);
    } else if (d >= 6.25) {
      // Hourly density range: 60m (6.25 bars/session) to 15m (25 bars/session)
      // Scales smoothly from 4 to 5 bars
      nominal = Math.round(4 + ((d - 6.25) / (25 - 6.25)) * 1);
    } else {
      // Low intraday density (> 60m): minimum 3 bars
      nominal = Math.max(3, Math.round(d));
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
 * Returns the fractal swing lookback parameter dynamically computed from timeframe bar density.
 * Direct alias and backward-compatible entry point for computeDynamicSwingLookback.
 */
export function getFractalSwingLookback(
  timeframeOrLookback: string | number = "1D",
  candleCount?: number
): number {
  return computeDynamicSwingLookback(timeframeOrLookback, candleCount);
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
