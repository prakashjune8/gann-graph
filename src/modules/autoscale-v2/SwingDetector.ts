/**
 * W.D. Gann 3-Day Mechanical Swing Detector
 * Auto-Scale V2 Engine — Step 1
 *
 * Implements W.D. Gann's strict mechanical swing chart filtering.
 * Evaluates isolated swing highs (Higher Highs / Peaks) and swing lows (Lower Lows / Troughs)
 * with a multi-day symmetrical lookback window, followed by consecutive alternating consolidation.
 */

import { CandleData } from "../../types/gann";

export interface SwingNode {
  col: number;
  price: number;
  type: "HH" | "LL";
  date: string;
}

/**
 * Detects mechanical Gann swing nodes using a symmetrical lookback scan.
 *
 * @param candles Full array of chronological OHLC candlestick data
 * @param lookback Number of bars required before and after to validate a pivot (default: 3)
 * @returns Filtered, alternating array of Gann swing nodes (HH / LL)
 */
export function detectGannSwings(candles: CandleData[], lookback: number = 3): SwingNode[] {
  if (!candles || candles.length < lookback * 2 + 1) {
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
