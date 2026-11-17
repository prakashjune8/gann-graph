/**
 * W.D. Gann Historic Seed & Dual Genesis Engine
 * Auto-Scale V2 — Phase 1b
 *
 * Implements:
 * 1. Dual Historic Node Extraction: Identifies Absolute All-Time Low (ATL) and High (ATH).
 * 2. Bull Genesis Velocity: Forward 3-day swing scan from ATL to calculate initial cycle expansion velocity.
 * 3. Bear Genesis Velocity: Forward 3-day swing scan from ATH to calculate initial cycle contraction velocity.
 * 4. Dual Master Octave Arrays: Generates Rule of 8 octave arrays for both Bull and Bear regimes:
 *    [1/8, 1/4, 3/8, 1/2, 5/8, 3/4, 7/8, 1, 2, 4] * GenesisVelocity.
 * 5. Dual Harmonic Filter: Snaps any local velocity to the single closest master octave across both regimes.
 */

import { CandleData } from "../../types/gann";
import { detectGannSwings, SwingNode } from "./SwingDetector";

export interface GlobalAnchors {
  historicLow: number;
  historicHigh: number;
  historicRange: number;
  atlCandle?: CandleData;
  athCandle?: CandleData;
}

export interface MasterOctaves {
  historicLow: number;
  baseVibration: number;
  fractions: number[];
  octaves: number[];
}

export interface SnappedOctaveResult {
  trueGlobalVelocity: number;
  multiplier: number;
  deviation: number;
  baseVibration: number;
}

export interface HistoricExtremeNode {
  index: number;
  col: number;
  price: number;
  candle: CandleData;
}

export interface DualGenesisResult {
  atl: HistoricExtremeNode;
  ath: HistoricExtremeNode;
  bullNodes: SwingNode[];
  bearNodes: SwingNode[];
  bullGenesisVelocity: number;
  bearGenesisVelocity: number;
  bullOctaves: number[];
  bearOctaves: number[];
}

export interface MasterOctaveSnapDetail {
  snappedVelocity: number;
  regime: "BULL" | "BEAR";
  octaveRatio: number;
  variance: number;
  bullGenesisVelocity: number;
  bearGenesisVelocity: number;
}

/** Canonical Gann Rule of 8 octave ratios extended through double octaves */
export const DUAL_OCTAVE_RATIOS = [
  0.125, // 1/8
  0.25,  // 1/4
  0.375, // 3/8
  0.5,   // 1/2
  0.625, // 5/8
  0.75,  // 3/4
  0.875, // 7/8
  1.0,   // 1 (Fundamental)
  2.0,   // 2 (First Octave Multiple)
  4.0,   // 4 (Double Octave Multiple)
] as const;

/**
 * Iterates through the entire CSV dataset (ignoring viewport or pagination limits)
 * to locate the Absolute All-Time Low (ATL) and Absolute All-Time High (ATH).
 */
export function extractGlobalAnchors(fullDataset: CandleData[]): GlobalAnchors {
  if (!fullDataset || fullDataset.length === 0) {
    return {
      historicLow: 0,
      historicHigh: 0,
      historicRange: 0,
    };
  }

  let minLow = Infinity;
  let maxHigh = -Infinity;
  let atlCandle: CandleData | undefined;
  let athCandle: CandleData | undefined;

  for (let i = 0; i < fullDataset.length; i++) {
    const c = fullDataset[i];
    if (c.low < minLow) {
      minLow = c.low;
      atlCandle = c;
    }
    if (c.high > maxHigh) {
      maxHigh = c.high;
      athCandle = c;
    }
  }

  const historicLow = Number.isFinite(minLow) ? minLow : 0;
  const historicHigh = Number.isFinite(maxHigh) ? maxHigh : 0;
  const historicRange = Math.max(0, historicHigh - historicLow);

  return {
    historicLow,
    historicHigh,
    historicRange,
    atlCandle,
    athCandle,
  };
}

/**
 * Calculates the fundamental base vibration and master 8th octave tiers from historicLow.
 */
export function calculateMasterOctaves(historicLow: number): MasterOctaves {
  const safeSeed = Math.max(0, historicLow);
  const baseVibration = safeSeed / 8;

  const fractions = [0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1.0];
  const octaves = fractions.map((frac) => Math.round(frac * safeSeed * 100) / 100);

  return {
    historicLow: safeSeed,
    baseVibration,
    fractions,
    octaves,
  };
}

/**
 * Extracts Dual Historic Extreme Nodes (ATL & ATH) with indices, columns, and prices,
 * executes forward Gann 3-day swing detections, and derives the Bull and Bear Genesis velocities.
 *
 * Bull Genesis: Slice from Absolute_ATL forward. Extract first 3 consecutive HH nodes.
 * bullGenesisVelocity = (HH3.price - ATL.price) / (HH3.col - ATL.col)
 *
 * Bear Genesis: Slice from Absolute_ATH forward. Extract first 3 consecutive LL nodes.
 * bearGenesisVelocity = (ATH.price - LL3.price) / (LL3.col - ATH.col)
 *
 * @param fullDataset Full array of historical candlestick data
 * @returns DualGenesisResult containing extreme nodes, swing sequences, velocities, and octave arrays
 */
export function calculateDualGenesisVelocities(fullDataset: CandleData[]): DualGenesisResult {
  if (!fullDataset || fullDataset.length === 0) {
    const defaultExtreme: HistoricExtremeNode = {
      index: 0,
      col: 0,
      price: 0,
      candle: { id: "0", timestamp: "", open: 0, high: 0, low: 0, close: 0, volume: 0, gridCol: 0 },
    };
    return {
      atl: defaultExtreme,
      ath: defaultExtreme,
      bullNodes: [],
      bearNodes: [],
      bullGenesisVelocity: 1.0,
      bearGenesisVelocity: 1.0,
      bullOctaves: DUAL_OCTAVE_RATIOS.map((r) => r * 1.0),
      bearOctaves: DUAL_OCTAVE_RATIOS.map((r) => r * 1.0),
    };
  }

  let minLow = Infinity;
  let maxHigh = -Infinity;
  let atlIdx = 0;
  let athIdx = 0;

  for (let i = 0; i < fullDataset.length; i++) {
    const c = fullDataset[i];
    if (c.low < minLow) {
      minLow = c.low;
      atlIdx = i;
    }
    if (c.high > maxHigh) {
      maxHigh = c.high;
      athIdx = i;
    }
  }

  const atl: HistoricExtremeNode = {
    index: atlIdx,
    col: fullDataset[atlIdx].gridCol,
    price: fullDataset[atlIdx].low,
    candle: fullDataset[atlIdx],
  };

  const ath: HistoricExtremeNode = {
    index: athIdx,
    col: fullDataset[athIdx].gridCol,
    price: fullDataset[athIdx].high,
    candle: fullDataset[athIdx],
  };

  // 1. BULL GENESIS: Slice from Absolute_ATL forward and run detectGannSwings(..., 3)
  const bullSlice = fullDataset.slice(atl.index);
  const bullSwings = detectGannSwings(bullSlice, 3);
  const bullHHNodes = bullSwings.filter((s) => s.type === "HH");
  const first3HH = bullHHNodes.slice(0, 3);

  let bullGenesisVelocity: number;
  if (first3HH.length >= 3) {
    const hh3 = first3HH[2];
    const deltaCol = Math.max(1, hh3.col - atl.col);
    bullGenesisVelocity = Math.max(0.0001, (hh3.price - atl.price) / deltaCol);
  } else if (first3HH.length > 0) {
    const lastHH = first3HH[first3HH.length - 1];
    const deltaCol = Math.max(1, lastHH.col - atl.col);
    bullGenesisVelocity = Math.max(0.0001, (lastHH.price - atl.price) / deltaCol);
  } else if (ath.col > atl.col) {
    bullGenesisVelocity = Math.max(0.0001, (ath.price - atl.price) / Math.max(1, ath.col - atl.col));
  } else {
    bullGenesisVelocity = Math.max(0.0001, atl.price / 8);
  }

  // 2. BEAR GENESIS: Slice from Absolute_ATH forward and run detectGannSwings(..., 3)
  const bearSlice = fullDataset.slice(ath.index);
  const bearSwings = detectGannSwings(bearSlice, 3);
  const bearLLNodes = bearSwings.filter((s) => s.type === "LL");
  const first3LL = bearLLNodes.slice(0, 3);

  let bearGenesisVelocity: number;
  if (first3LL.length >= 3) {
    const ll3 = first3LL[2];
    const deltaCol = Math.max(1, ll3.col - ath.col);
    bearGenesisVelocity = Math.max(0.0001, (ath.price - ll3.price) / deltaCol);
  } else if (first3LL.length > 0) {
    const lastLL = first3LL[first3LL.length - 1];
    const deltaCol = Math.max(1, lastLL.col - ath.col);
    bearGenesisVelocity = Math.max(0.0001, (ath.price - lastLL.price) / deltaCol);
  } else if (atl.col > ath.col) {
    bearGenesisVelocity = Math.max(0.0001, (ath.price - atl.price) / Math.max(1, atl.col - ath.col));
  } else {
    bearGenesisVelocity = Math.max(0.0001, ath.price / 8);
  }

  // 3. DUAL MASTER OCTAVE ARRAYS
  // [1/8, 1/4, 3/8, 1/2, 5/8, 3/4, 7/8, 1, 2, 4] * GenesisVelocity
  const bullOctaves = DUAL_OCTAVE_RATIOS.map((r) => Math.round(r * bullGenesisVelocity * 10000) / 10000);
  const bearOctaves = DUAL_OCTAVE_RATIOS.map((r) => Math.round(r * bearGenesisVelocity * 10000) / 10000);

  return {
    atl,
    ath,
    bullNodes: first3HH,
    bearNodes: first3LL,
    bullGenesisVelocity: Math.round(bullGenesisVelocity * 10000) / 10000,
    bearGenesisVelocity: Math.round(bearGenesisVelocity * 10000) / 10000,
    bullOctaves,
    bearOctaves,
  };
}

/**
 * Dual Harmonic Filter:
 * Compares localVelocity against both bullOctaves and bearOctaves arrays:
 * bullOctaves = [1/8, 1/4, 3/8, 1/2, 5/8, 3/4, 7/8, 1, 2, 4] * bullGenesisVelocity
 * bearOctaves = [1/8, 1/4, 3/8, 1/2, 5/8, 3/4, 7/8, 1, 2, 4] * bearGenesisVelocity
 *
 * @param localVelocity The local swing or chart velocity to align
 * @param bullV Bull Genesis velocity (bullGenesisVelocity)
 * @param bearV Bear Genesis velocity (bearGenesisVelocity)
 * @returns The single master fraction value that has the tightest mathematical proximity (lowest variance)
 */
export function snapToMasterOctave(localVelocity: number, bullV: number, bearV: number): number {
  const detail = snapToMasterOctaveDetail(localVelocity, bullV, bearV);
  return detail.snappedVelocity;
}

/**
 * Detailed variant of snapToMasterOctave providing structural metadata,
 * including which market regime (BULL vs BEAR) and octave ratio was selected.
 */
export function snapToMasterOctaveDetail(
  localVelocity: number,
  bullV: number,
  bearV: number
): MasterOctaveSnapDetail {
  const safeLocalV = Math.max(0.0001, Number.isFinite(localVelocity) ? localVelocity : 1.0);
  const safeBullV = Math.max(0.0001, Number.isFinite(bullV) ? bullV : 1.0);
  const safeBearV = Math.max(0.0001, Number.isFinite(bearV) ? bearV : 1.0);

  let bestValue = safeBullV;
  let bestRegime: "BULL" | "BEAR" = "BULL";
  let bestRatio: number = 1.0;
  let minVariance = Infinity;

  // 1. Check Bull Octaves
  for (let i = 0; i < DUAL_OCTAVE_RATIOS.length; i++) {
    const ratio = DUAL_OCTAVE_RATIOS[i];
    const candidate = ratio * safeBullV;
    const variance = Math.abs(candidate - safeLocalV);
    if (variance < minVariance) {
      minVariance = variance;
      bestValue = candidate;
      bestRegime = "BULL";
      bestRatio = ratio;
    }
  }

  // 2. Check Bear Octaves
  for (let i = 0; i < DUAL_OCTAVE_RATIOS.length; i++) {
    const ratio = DUAL_OCTAVE_RATIOS[i];
    const candidate = ratio * safeBearV;
    const variance = Math.abs(candidate - safeLocalV);
    if (variance < minVariance) {
      minVariance = variance;
      bestValue = candidate;
      bestRegime = "BEAR";
      bestRatio = ratio;
    }
  }

  return {
    snappedVelocity: Math.round(bestValue * 10000) / 10000,
    regime: bestRegime,
    octaveRatio: bestRatio,
    variance: Math.round(minVariance * 10000) / 10000,
    bullGenesisVelocity: safeBullV,
    bearGenesisVelocity: safeBearV,
  };
}

/**
 * Standard harmonic scale multipliers for global-to-local octave filtering.
 */
export const HARMONIC_MULTIPLIERS = [
  0.001953125, // 1/512
  0.00390625,  // 1/256
  0.0078125,   // 1/128
  0.015625,    // 1/64
  0.03125,     // 1/32
  0.0625,      // 1/16
  0.1,
  0.125,       // 1/8
  0.2,
  0.25,        // 1/4
  0.3333,      // 1/3
  0.375,       // 3/8
  0.5,         // 1/2
  0.625,       // 5/8
  0.6666,      // 2/3
  0.75,        // 3/4
  0.875,       // 7/8
  1.0,         // 1x fundamental
  1.25,        // 5/4
  1.3333,
  1.375,
  1.5,         // 3/2
  1.625,
  1.75,        // 7/4
  2.0,         // 2x octave
  2.5,
  3.0,
  3.5,
  4.0,         // 4x double octave
  5.0,
  6.0,
  7.0,
  8.0,         // 8x master cycle
  10.0,
  16.0,
] as const;

/**
 * Global-to-Local Harmonic Filter (Single seed variant).
 */
export function snapToGlobalOctave(localVelocity: number, baseVibration: number): number {
  if (!Number.isFinite(localVelocity) || localVelocity <= 0 || !Number.isFinite(baseVibration) || baseVibration <= 0) {
    return Math.max(0.0001, localVelocity || 1.0);
  }

  let closestValue = baseVibration;
  let minDiff = Infinity;

  for (let i = 0; i < HARMONIC_MULTIPLIERS.length; i++) {
    const candidate = baseVibration * HARMONIC_MULTIPLIERS[i];
    const diff = Math.abs(candidate - localVelocity);
    if (diff < minDiff) {
      minDiff = diff;
      closestValue = candidate;
    }
  }

  const ratio = localVelocity / baseVibration;
  if (ratio > 16.0) {
    const roundedMultiple = Math.round(ratio * 2) / 2;
    const candidate = roundedMultiple * baseVibration;
    const diff = Math.abs(candidate - localVelocity);
    if (diff < minDiff) {
      closestValue = candidate;
    }
  } else if (ratio < 0.001953125 && ratio > 0) {
    const log10Order = Math.floor(Math.log10(ratio));
    const normalized = ratio / Math.pow(10, log10Order);
    const candidates = [1, 1.25, 1.5, 2, 2.5, 3.75, 5, 6.25, 7.5, 8.75];
    let bestNorm = candidates[0];
    let bestNormDiff = Infinity;
    for (const c of candidates) {
      const d = Math.abs(c - normalized);
      if (d < bestNormDiff) {
        bestNormDiff = d;
        bestNorm = c;
      }
    }
    const candidate = bestNorm * Math.pow(10, log10Order) * baseVibration;
    const diff = Math.abs(candidate - localVelocity);
    if (diff < minDiff) {
      closestValue = candidate;
    }
  }

  return Math.round(closestValue * 10000) / 10000;
}

/**
 * Detailed variant of snapToGlobalOctave.
 */
export function snapToGlobalOctaveDetail(
  localVelocity: number,
  baseVibration: number
): SnappedOctaveResult {
  const trueGlobalVelocity = snapToGlobalOctave(localVelocity, baseVibration);
  const safeBase = Math.max(0.0001, baseVibration);
  const multiplier = Math.round((trueGlobalVelocity / safeBase) * 10000) / 10000;
  const deviation = Math.abs(trueGlobalVelocity - localVelocity);

  return {
    trueGlobalVelocity,
    multiplier,
    deviation,
    baseVibration,
  };
}
