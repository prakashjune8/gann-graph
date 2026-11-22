/**
 * W.D. Gann SutraScale Vibration Engine
 * Module: src/modules/sutrascale-vibration/SutraScaleEngine.ts
 *
 * Implements rigorous algorithmic vibration verification for Indian market instruments:
 * 1. Strict Manual Seed Anchoring: Starts strictly from user manual (time, price) seeds (zero auto-seed overrides).
 * 2. 1x1 Ray Math: Projects forward diagonal ray from (Col_seed, Price_seed).
 * 3. 1/8 Subdivisions & Multiples: Evaluates 1/8..8/8 octaves and multiples (0.125 * k).
 * 4. 0.5% Wick Collision Test: Tests if high/low wicks land within +/- 0.5% tolerance of the ray.
 * 5. Fatal Breach Check: Flags decisive closes violating support/resistance against the expected trend.
 * 6. Harmonic Sweep & Geometric R-Squared: Sweeps candidate scales (20, 25, 33.33, 37.5, 50, 100...) and ranks by touch density.
 */

import { CandleData, ManualSeedPoint } from "../../types/gann";

export const INDIAN_MARKET_HARMONICS = [
  5, 10, 12.5, 15, 20, 25, 30, 33.33, 37.5, 40,
  50, 62.5, 75, 87.5, 100, 125, 150, 200, 250,
  333.33, 375, 500, 1000
] as const;

export const OCTAVE_EIGHTHS = [
  { factor: 0.125, name: "1/8 Octave (12.5%)" },
  { factor: 0.250, name: "2/8 Octave (25.0%)" },
  { factor: 0.375, name: "3/8 Octave (37.5%)" },
  { factor: 0.500, name: "4/8 Octave (50.0% Half)" },
  { factor: 0.625, name: "5/8 Octave (62.5%)" },
  { factor: 0.750, name: "6/8 Octave (75.0%)" },
  { factor: 0.875, name: "7/8 Octave (87.5%)" },
  { factor: 1.000, name: "8/8 Master Ray (100% 1x1)" },
  { factor: 1.250, name: "10/8 Multiple (125%)" },
  { factor: 1.500, name: "12/8 Multiple (150%)" },
  { factor: 2.000, name: "16/8 Double Ray (2x1)" },
  { factor: 4.000, name: "32/8 Quad Ray (4x1)" },
];

export interface TouchDetail {
  col: number;
  date: string;
  price: number;
  rayPrice: number;
  diffPercent: number;
  type: "WICK_LOW" | "WICK_HIGH" | "BODY";
}

export interface BreachDetail {
  col: number;
  date: string;
  close: number;
  rayPrice: number;
  breachDistance: number;
}

export interface CandidateSweepResult {
  scale: number;
  slope: number;
  evaluatedBars: number;
  barsBeforeBreach: number;
  touchCount: number;
  breachCount: number;
  firstBreachBarIndex: number | null;
  firstBreachDate: string | null;
  touchDensity: number;       // % of bars before breach that touched the ray
  geometricRSquared: number;  // normalized score 0 - 100%
  isBreached: boolean;
  status: "PERFECT_HARMONIC" | "STRONG_VIBRATION" | "MODERATE" | "FATAL_BREACH";
  touches: TouchDetail[];
  breaches: BreachDetail[];
}

export interface SutraScaleAnalysisReport {
  hasAnchor: boolean;
  anchorType: "BULL_LOW" | "BEAR_HIGH" | "NONE";
  anchorSeed: { date: string; gridCol: number; price: number } | null;
  initialSpeed: number;
  initialSpeedSummary: string;
  recommendedCandidate: CandidateSweepResult | null;
  candidates: CandidateSweepResult[];
  octaveLevels: { factor: number; name: string; priceScale: number }[];
  evaluatedBarCount: number;
  message: string;
}

/**
 * Runs the complete SutraScale Algorithmic Vibration Verification over historical market bars.
 */
export function runSutraScaleVerification(
  candles: CandleData[],
  lowestSeed: ManualSeedPoint | null,
  highestSeed: ManualSeedPoint | null,
  maxForwardBars: number = 60
): SutraScaleAnalysisReport {
  // 1. Strict Manual Seed Check (Zero Auto-Seed Override)
  if (!lowestSeed && !highestSeed) {
    return {
      hasAnchor: false,
      anchorType: "NONE",
      anchorSeed: null,
      initialSpeed: 0,
      initialSpeedSummary: "No manual seed set.",
      recommendedCandidate: null,
      candidates: [],
      octaveLevels: [],
      evaluatedBarCount: 0,
      message: "Please set a manual seed (Lowest or Highest) via the '🌱 Seeds' tool to run SutraScale Vibration Verification.",
    };
  }

  // Determine active seed: Prefer Lowest Seed (Bull), otherwise Highest Seed (Bear)
  const isBull = !!lowestSeed;
  const activeSeed = isBull ? lowestSeed! : highestSeed!;
  const anchorType = isBull ? "BULL_LOW" : "BEAR_HIGH";

  if (!Number.isFinite(activeSeed.price) || activeSeed.price <= 0) {
    return {
      hasAnchor: false,
      anchorType: "NONE",
      anchorSeed: null,
      initialSpeed: 0,
      initialSpeedSummary: "Invalid seed price.",
      recommendedCandidate: null,
      candidates: [],
      octaveLevels: [],
      evaluatedBarCount: 0,
      message: "Manual seed price must be a valid positive number.",
    };
  }

  // 2. Locate seed index in dataset
  let seedIndex = 0;
  let minColDiff = Infinity;
  for (let i = 0; i < candles.length; i++) {
    const diff = Math.abs(candles[i].gridCol - activeSeed.gridCol);
    if (diff < minColDiff) {
      minColDiff = diff;
      seedIndex = i;
    }
  }

  // Slice forward candles after the seed
  const forwardCandles = candles.slice(seedIndex + 1, seedIndex + 1 + maxForwardBars);
  if (forwardCandles.length < 3) {
    return {
      hasAnchor: true,
      anchorType,
      anchorSeed: activeSeed,
      initialSpeed: 0,
      initialSpeedSummary: "Insufficient forward candles.",
      recommendedCandidate: null,
      candidates: [],
      octaveLevels: [],
      evaluatedBarCount: forwardCandles.length,
      message: "Need at least 3 forward candles after manual seed to test ray vibration.",
    };
  }

  // 3. Initial Speed Estimation (delta P / delta T) across first 5-10 bars
  const sampleHorizon = Math.min(10, forwardCandles.length);
  const anchorCol = activeSeed.gridCol;
  const anchorPrice = activeSeed.price;
  const sampleCandle = forwardCandles[sampleHorizon - 1];
  const deltaT = Math.max(1, sampleCandle.gridCol - anchorCol);
  const deltaP = Math.abs(sampleCandle.close - anchorPrice);
  const initialSpeed = Math.round((deltaP / deltaT) * 100) / 100;
  const initialSpeedSummary = `₹${initialSpeed} / bar (across first ${sampleHorizon} bars)`;

  // 4. Sweep Candidate Harmonics
  // Combine Indian market standard harmonics with dynamic harmonics nearby initialSpeed
  const candidateSet = new Set<number>(INDIAN_MARKET_HARMONICS);
  if (initialSpeed > 0) {
    candidateSet.add(Math.round(initialSpeed * 100) / 100);
    candidateSet.add(Math.round((initialSpeed * 0.5) * 100) / 100);
    candidateSet.add(Math.round((initialSpeed * 1.5) * 100) / 100);
    candidateSet.add(Math.round((initialSpeed * 2.0) * 100) / 100);
  }
  const candidateScales = Array.from(candidateSet)
    .filter((s) => s >= 1 && s <= 2000)
    .sort((a, b) => a - b);

  const results: CandidateSweepResult[] = [];
  const TOLERANCE_PCT = 0.005; // +/- 0.5% wick test tolerance

  for (const scale of candidateScales) {
    const touches: TouchDetail[] = [];
    const breaches: BreachDetail[] = [];
    let firstBreachBarIndex: number | null = null;
    let firstBreachDate: string | null = null;

    for (let i = 0; i < forwardCandles.length; i++) {
      const c = forwardCandles[i];
      const colStep = c.gridCol - anchorCol;
      if (colStep <= 0) continue;

      // Calculate expected 1x1 ray price at this column
      const rayPrice = isBull
        ? anchorPrice + colStep * scale
        : Math.max(0, anchorPrice - colStep * scale);

      const tol = rayPrice * TOLERANCE_PCT;
      const upperBand = rayPrice + tol;
      const lowerBand = rayPrice - tol;

      // 0.5% Wick Collision Test
      if (isBull) {
        // In Bull trend, the ray is support: low wick tests support
        if (c.low >= lowerBand && c.low <= upperBand) {
          touches.push({
            col: c.gridCol,
            date: c.timestamp,
            price: c.low,
            rayPrice,
            diffPercent: Math.round((Math.abs(c.low - rayPrice) / rayPrice) * 10000) / 100,
            type: "WICK_LOW",
          });
        } else if (c.open <= upperBand && c.close >= lowerBand) {
          touches.push({
            col: c.gridCol,
            date: c.timestamp,
            price: c.close,
            rayPrice,
            diffPercent: Math.round((Math.abs(c.close - rayPrice) / rayPrice) * 10000) / 100,
            type: "BODY",
          });
        }
      } else {
        // In Bear trend, the ray is resistance: high wick tests resistance
        if (c.high >= lowerBand && c.high <= upperBand) {
          touches.push({
            col: c.gridCol,
            date: c.timestamp,
            price: c.high,
            rayPrice,
            diffPercent: Math.round((Math.abs(c.high - rayPrice) / rayPrice) * 10000) / 100,
            type: "WICK_HIGH",
          });
        } else if (c.close <= upperBand && c.open >= lowerBand) {
          touches.push({
            col: c.gridCol,
            date: c.timestamp,
            price: c.close,
            rayPrice,
            diffPercent: Math.round((Math.abs(c.close - rayPrice) / rayPrice) * 10000) / 100,
            type: "BODY",
          });
        }
      }

      // Fatal Breach Check (decisive close breaking through the ray)
      const isBreach = isBull
        ? c.close < lowerBand
        : c.close > upperBand;

      if (isBreach) {
        breaches.push({
          col: c.gridCol,
          date: c.timestamp,
          close: c.close,
          rayPrice,
          breachDistance: Math.round(Math.abs(c.close - rayPrice) * 100) / 100,
        });

        if (firstBreachBarIndex === null) {
          firstBreachBarIndex = i;
          firstBreachDate = c.timestamp;
        }
      }
    }

    const totalBars = forwardCandles.length;
    const barsBeforeBreach = firstBreachBarIndex !== null ? firstBreachBarIndex + 1 : totalBars;
    const isEarlyBreach = firstBreachBarIndex !== null && firstBreachBarIndex < 10;
    const touchDensity = Math.round((touches.length / Math.max(1, barsBeforeBreach)) * 1000) / 10;

    // Geometric R-Squared Score:
    // Rewards clean touches (+20 pts each), penalizes breaches (-30 pts each)
    let rawScore = (touches.length * 20 - breaches.length * 30) / totalBars;
    if (isEarlyBreach) rawScore *= 0.3; // Severe early breach penalty
    if (breaches.length === 0 && touches.length >= 2) rawScore += 2.0; // Bonus for clean unbroken vibration

    const geometricRSquared = Math.max(0, Math.min(100, Math.round(rawScore * 50 * 10) / 10));

    let status: CandidateSweepResult["status"] = "MODERATE";
    if (breaches.length === 0 && touches.length >= 3) {
      status = "PERFECT_HARMONIC";
    } else if (breaches.length <= 1 && touches.length >= 2) {
      status = "STRONG_VIBRATION";
    } else if (isEarlyBreach || breaches.length >= 3) {
      status = "FATAL_BREACH";
    }

    results.push({
      scale,
      slope: scale,
      evaluatedBars: totalBars,
      barsBeforeBreach,
      touchCount: touches.length,
      breachCount: breaches.length,
      firstBreachBarIndex,
      firstBreachDate,
      touchDensity,
      geometricRSquared,
      isBreached: breaches.length > 0,
      status,
      touches,
      breaches,
    });
  }

  // 5. Rank Candidates: Non-breached candidates first, sorted by Geometric R-Squared & touches
  results.sort((a, b) => {
    // Priority 1: Unbroken first
    if (!a.isBreached && b.isBreached) return -1;
    if (a.isBreached && !b.isBreached) return 1;
    // Priority 2: Higher score
    if (b.geometricRSquared !== a.geometricRSquared) {
      return b.geometricRSquared - a.geometricRSquared;
    }
    // Priority 3: More touches
    return b.touchCount - a.touchCount;
  });

  const recommended = results[0] || null;

  // 6. Generate Rule of 8 Multiples for the recommended scale
  const baseScale = recommended ? recommended.scale : 25.0;
  const octaveLevels = OCTAVE_EIGHTHS.map((oct) => ({
    factor: oct.factor,
    name: oct.name,
    priceScale: Math.round(baseScale * oct.factor * 100) / 100,
  }));

  return {
    hasAnchor: true,
    anchorType,
    anchorSeed: activeSeed,
    initialSpeed,
    initialSpeedSummary,
    recommendedCandidate: recommended,
    candidates: results,
    octaveLevels,
    evaluatedBarCount: forwardCandles.length,
    message: recommended
      ? `SutraScale verification complete: Top harmonic scale is ₹${recommended.scale}/sq (${recommended.touchCount} touches within 0.5%, score ${recommended.geometricRSquared}%).`
      : "Completed sweep across candidate harmonics.",
  };
}
