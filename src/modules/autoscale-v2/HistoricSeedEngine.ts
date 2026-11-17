/**
 * W.D. Gann Historic Seed Engine
 * Auto-Scale V2 — Phase 1b
 *
 * Implements Historic Seed Extraction and the Rule of 8 Formulation:
 * 1. Global Dataset Scans: Extracts the Absolute All-Time Low (ATL) and High (ATH) across the full dataset.
 * 2. Rule of 8 Master Octaves: Derives the fundamental base vibration (seed / 8) and master 8th octave tiers.
 * 3. Global-to-Local Harmonic Filter: Snaps local swing velocities to the nearest global octave harmonic multiple or fraction.
 */

import { CandleData } from "../../types/gann";

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

/**
 * Iterates through the entire CSV dataset (ignoring viewport or pagination limits)
 * to locate the Absolute All-Time Low (ATL) and Absolute All-Time High (ATH).
 *
 * @param fullDataset Full array of historical candlestick data
 * @returns Object containing historicLow (ATL), historicHigh (ATH), and historicRange (ATH - ATL)
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
 * Gann's Rule of 8 Square Formulation:
 * Derives the fundamental base vibration (1/8th of the seed / historicLow)
 * and generates the canonical master array of 8ths:
 * [1/8, 1/4, 3/8, 1/2, 5/8, 3/4, 7/8, 1] * historicLow.
 *
 * @param historicLow Absolute All-Time Low price (The Cycle Seed)
 * @returns MasterOctaves structure containing baseVibration and the 8th levels
 */
export function calculateMasterOctaves(historicLow: number): MasterOctaves {
  const safeSeed = Math.max(0, historicLow);
  const baseVibration = safeSeed / 8;

  // Canonical 8th fractions [1/8, 1/4, 3/8, 1/2, 5/8, 3/4, 7/8, 1]
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
 * Standard harmonic scale multipliers for global-to-local octave filtering.
 * Encompasses canonical eighth divisions (1/8, 1/4, 3/8, 1/2, 3/4, etc.),
 * whole harmonic multipliers (1x, 1.5x, 2x, 2.5x, 3x, 4x, 8x),
 * and decade-scaled sub-harmonics for micro/daily timeframe alignment.
 */
export const HARMONIC_MULTIPLIERS = [
  // Sub-harmonic decade fractions (for scaling large seeds down to daily velocities)
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
 * Global-to-Local Harmonic Filter:
 * Snaps a local swing velocity to the closest harmonic multiple or fraction
 * of the global baseVibration ($V_{\text{base}} = \text{historicLow} / 8$).
 *
 * @param localVelocity The raw local velocity ($V = \Delta Price / \Delta Col$)
 * @param baseVibration The global base vibration (historicLow / 8)
 * @returns The snapped trueGlobalVelocity
 */
export function snapToGlobalOctave(localVelocity: number, baseVibration: number): number {
  if (!Number.isFinite(localVelocity) || localVelocity <= 0 || !Number.isFinite(baseVibration) || baseVibration <= 0) {
    return Math.max(0.0001, localVelocity || 1.0);
  }

  let closestValue = baseVibration;
  let minDiff = Infinity;

  // Search across canonical harmonic multipliers
  for (let i = 0; i < HARMONIC_MULTIPLIERS.length; i++) {
    const candidate = baseVibration * HARMONIC_MULTIPLIERS[i];
    const diff = Math.abs(candidate - localVelocity);
    if (diff < minDiff) {
      minDiff = diff;
      closestValue = candidate;
    }
  }

  // Also evaluate direct harmonic multiples (e.g. k * baseVibration or baseVibration / k)
  // if localVelocity falls outside standard bounded table
  const ratio = localVelocity / baseVibration;
  if (ratio > 16.0) {
    const roundedMultiple = Math.round(ratio * 2) / 2; // snap to nearest 0.5x
    const candidate = roundedMultiple * baseVibration;
    const diff = Math.abs(candidate - localVelocity);
    if (diff < minDiff) {
      closestValue = candidate;
    }
  } else if (ratio < 0.001953125 && ratio > 0) {
    // Highly compressed intraday scales: snap to base-10 scaled eighth
    const log10Order = Math.floor(Math.log10(ratio));
    const normalized = ratio / Math.pow(10, log10Order);
    // Find closest eighth in normalized range [1, 10]
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
 * Detailed variant of snapToGlobalOctave providing structural metadata,
 * including the matched multiplier and absolute deviation.
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
