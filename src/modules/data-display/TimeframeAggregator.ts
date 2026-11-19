/**
 * W.D. Gann Drafting Desk — Timeframe Aggregator
 * Module: src/modules/data-display/TimeframeAggregator.ts
 *
 * Implements hierarchical multi-timeframe aggregation:
 * - Daily (1D)
 * - Weekly (1W): ISO calendar week aggregation (Open of Mon, High/Low extremes, Close of Fri).
 * - Monthly (1M): Calendar month aggregation.
 * - Intraday Multi-Period Grouping (60m, 15m, 5m).
 */

import { RawMarketBar, DisplayTimeframe } from "./DisplayTypes";
import { parseDateToEpochMs } from "./DisplaySeriesFormatter";

/**
 * Returns an ISO week key string (e.g. "2024-W12") for a given Date.
 */
function getIsoWeekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

/**
 * Aggregates a series of daily or intraday raw bars into higher timeframe bars.
 */
export function aggregateMarketBars(
  bars: RawMarketBar[],
  targetTimeframe: DisplayTimeframe
): RawMarketBar[] {
  if (!bars || bars.length === 0) return [];
  if (targetTimeframe === "1D") return bars;

  const groups = new Map<string, RawMarketBar[]>();

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    const epochMs = parseDateToEpochMs(bar.timestamp);
    if (epochMs <= 0) continue;

    const d = new Date(epochMs);
    let groupKey = "";

    if (targetTimeframe === "1W") {
      groupKey = getIsoWeekKey(d);
    } else if (targetTimeframe === "1M") {
      groupKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    } else if (targetTimeframe === "60m") {
      const bucketMs = Math.floor(epochMs / 3600000) * 3600000;
      groupKey = String(bucketMs);
    } else if (targetTimeframe === "15m") {
      const bucketMs = Math.floor(epochMs / 900000) * 900000;
      groupKey = String(bucketMs);
    } else if (targetTimeframe === "5m") {
      const bucketMs = Math.floor(epochMs / 300000) * 300000;
      groupKey = String(bucketMs);
    } else {
      groupKey = String(epochMs);
    }

    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
    }
    groups.get(groupKey)!.push(bar);
  }

  const aggregatedBars: RawMarketBar[] = [];

  for (const [, groupBars] of groups.entries()) {
    if (groupBars.length === 0) continue;

    const first = groupBars[0];
    const last = groupBars[groupBars.length - 1];

    let high = -Infinity;
    let low = Infinity;
    let volumeSum = 0;

    for (let j = 0; j < groupBars.length; j++) {
      const b = groupBars[j];
      if (b.high > high) high = b.high;
      if (b.low < low) low = b.low;
      volumeSum += b.volume || 0;
    }

    aggregatedBars.push({
      timestamp: last.timestamp,
      open: first.open,
      high: Number.isFinite(high) ? high : first.open,
      low: Number.isFinite(low) ? low : first.open,
      close: last.close,
      volume: volumeSum,
      symbol: first.symbol,
      exchange: first.exchange,
    });
  }

  return aggregatedBars;
}
