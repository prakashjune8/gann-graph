/**
 * W.D. Gann Harmonic Octave Multiplier
 * Auto-Scale V2 — Multiplier Boundary Smoothing
 *
 * Implements a unified harmonic sequence fusing Base-10 and Base-2 multipliers:
 * [1, 2, 4, 8, 10, 20, 40, 80, 100, 200, 400, 800, 1000...]
 * Eliminates the 25% grid jump at decimal magnitude thresholds by targeting
 * the optimal 16-line grid density and enforcing +/- 5% magnitude hysteresis locking.
 */

export interface MagnitudeShiftResult {
  magnitude: number;
  decimalMultiplier: number;
}

export interface ExpandedVibrationDetail {
  finalVibration: number;
  baseVibration: number;
  unifiedMultiplier: number;
  decimalMultiplier: number;
  octaveMultiplier: number;
  visibleRange: number;
  estimatedGridLines: number;
}

/**
 * Generates an ascending dynamic array of valid Gann harmonic multipliers
 * fusing Base-10 and Base-2:
 * [1, 2, 4, 8, 10, 20, 40, 80, 100, 200, 400, 800, 1000, 2000, 4000, 8000, 10000...]
 */
export function generateUnifiedHarmonicMultipliers(maxDecade: number = 5): number[] {
  const multipliers: number[] = [];
  const base2Factors = [1, 2, 4, 8];
  const clampedDecade = Math.min(5, Math.max(0, maxDecade));
  for (let decade = 0; decade <= clampedDecade; decade++) {
    const pow10 = Math.pow(10, decade);
    for (const factor of base2Factors) {
      multipliers.push(factor * pow10);
    }
  }
  return multipliers;
}

/**
 * The Unified Harmonic Sequence & Grid Density Target Matching:
 * Evaluates the unified multiplier array and selects the multiplier that places
 * theoretical grid lines closest to the Gann Optimal Target of 16 lines
 * (the exact midpoint of the 8-24 optimal band).
 *
 * lines = visibleRange / (baseVibration * multiplier)
 *
 * @param baseVibration Baseline vibration derived from the seed (e.g., seed / 8)
 * @param visibleRange The price span of the active viewport (maxPrice - minPrice)
 * @returns The optimal unified harmonic multiplier
 */
export function getUnifiedMultiplier(baseVibration: number, visibleRange: number): number {
  const safeBase = Math.max(0.0001, Number.isFinite(baseVibration) ? baseVibration : 1.0);
  const safeRange = Math.max(0, Number.isFinite(visibleRange) ? visibleRange : 0);

  if (safeRange <= 0) return 1;

  const multipliers = generateUnifiedHarmonicMultipliers(5);
  const TARGET_LINES = 16; // Midpoint of 8-24 optimal band

  let bestMultiplier = multipliers[0];
  let minDiff = Infinity;

  for (const m of multipliers) {
    const lines = safeRange / (safeBase * m);
    const diff = Math.abs(lines - TARGET_LINES);
    if (diff < minDiff) {
      minDiff = diff;
      bestMultiplier = m;
    }
  }

  return Math.min(1000, bestMultiplier);
}

/**
 * The Base-10 Magnitude Shift (The Gann Decimal Rule):
 * Calculates the logarithmic difference between the current visible price and the historic seed.
 * Injects a strict mathematical clamper to cap the magnitude at 5 (100,000x), physically
 * preventing the scale from ever reaching trillions.
 */
export function calculateMagnitudeShift(seedPrice: number, currentVisiblePrice: number): number {
  const safeSeed = Math.max(1, Number.isFinite(seedPrice) ? seedPrice : 1.0);
  const safePrice = Math.max(0.0001, Number.isFinite(currentVisiblePrice) ? currentVisiblePrice : 1.0);

  const magnitude = Math.min(5, Math.floor(Math.log10(safePrice / safeSeed)));
  return Math.pow(10, Math.max(0, magnitude));
}

/**
 * Detailed variant of calculateMagnitudeShift returning both raw magnitude order
 * and resulting power-of-10 decimal multiplier.
 */
export function calculateMagnitudeShiftDetail(
  seedPrice: number,
  currentVisiblePrice: number
): MagnitudeShiftResult {
  const safeSeed = Math.max(1, Number.isFinite(seedPrice) ? seedPrice : 1.0);
  const safePrice = Math.max(0.0001, Number.isFinite(currentVisiblePrice) ? currentVisiblePrice : 1.0);

  const rawMagnitude = Math.floor(Math.log10(safePrice / safeSeed));
  const magnitude = Math.min(5, Math.max(0, rawMagnitude));
  const decimalMultiplier = Math.pow(10, magnitude);

  return {
    magnitude,
    decimalMultiplier,
  };
}

/**
 * The Base-2 Expansion (The Rule of Octaves):
 * Maintained for backward compatibility and analytical inspection.
 */
export function calculateOctaveExpansion(baseVibration: number, currentVisibleRange: number): number {
  const safeVibration = Math.max(0.0001, Number.isFinite(baseVibration) ? baseVibration : 1.0);
  const safeRange = Math.max(0, Number.isFinite(currentVisibleRange) ? currentVisibleRange : 0);

  if (safeRange === 0) return 1;

  let octaveMultiplier = 1;
  const maxIterations = 32;
  let iterations = 0;

  while (safeRange / (safeVibration * octaveMultiplier) > 24 && iterations < maxIterations) {
    octaveMultiplier *= 2;
    iterations++;
  }

  return octaveMultiplier;
}

/**
 * The Final Scaler Output:
 * Harmonizes the baseline Genesis vibration by applying the unified harmonic sequence
 * with magnitude hysteresis locking:
 * finalVibration = baseVibration * unifiedMultiplier
 *
 * @param baseVibration Baseline vibration derived from the seed (V_base = seed / 8)
 * @param seedPrice The historic anchor price (ATL)
 * @param currentVisiblePrice The current market price or viewport center price
 * @param visibleRange The price span of the active viewport (maxPrice - minPrice)
 * @param previousMultiplier Optional previous multiplier for magnitude hysteresis locking
 * @returns The expanded true harmonic vibration
 */
export function getExpandedVibration(
  baseVibration: number,
  seedPrice: number,
  currentVisiblePrice: number,
  visibleRange: number,
  previousMultiplier?: number
): number {
  const safeSeed = Math.max(1, Number.isFinite(seedPrice) ? seedPrice : 1.0);
  const safeBase = Math.max(0.0001, Number.isFinite(baseVibration) ? baseVibration : 1.0);
  const safePrice = Math.max(0.0001, Number.isFinite(currentVisiblePrice) ? currentVisiblePrice : 1.0);
  const safeRange = Math.max(0, Number.isFinite(visibleRange) ? visibleRange : 0);

  if (safeRange <= 0) return safeBase;

  let multiplier = getUnifiedMultiplier(safeBase, safeRange);

  // =========================================================================
  // MAGNITUDE HYSTERESIS INJECTION WITH STRICT CLAMPER:
  // Cap magnitude at 5 (100,000x), physically preventing scale from reaching trillions.
  // =========================================================================
  if (previousMultiplier && previousMultiplier > 0 && multiplier !== previousMultiplier) {
    const magnitude = Math.min(5, Math.max(0, Math.floor(Math.log10(safePrice / safeSeed))));
    const nearestPower10 = Math.pow(10, magnitude);
    const priceDeviation = Math.abs(safePrice - nearestPower10) / nearestPower10;

    // The Lock: If the price is within a +/- 5% boundary of the magnitude threshold,
    // force the engine to return the previousMultiplier. It must definitively clear the 5%
    // threshold to snap to the new multiplier tier.
    if (priceDeviation <= 0.05) {
      multiplier = previousMultiplier;
    }
  }

  // Strict clamp on multiplier to max 1,000x (decade 3)
  const clampedMultiplier = Math.min(1000, Math.max(1, multiplier));
  const finalVibration = safeBase * clampedMultiplier;
  return Math.round(finalVibration * 10000) / 10000;
}

/**
 * Detailed variant of getExpandedVibration returning full scaling telemetry.
 */
export function getExpandedVibrationDetail(
  baseVibration: number,
  seedPrice: number,
  currentVisiblePrice: number,
  visibleRange: number,
  previousMultiplier?: number
): ExpandedVibrationDetail {
  const safeBase = Math.max(0.0001, Number.isFinite(baseVibration) ? baseVibration : 1.0);
  const safePrice = Math.max(0.0001, Number.isFinite(currentVisiblePrice) ? currentVisiblePrice : 1.0);
  const safeRange = Math.max(0, Number.isFinite(visibleRange) ? visibleRange : 0);

  const finalVibration = getExpandedVibration(
    safeBase,
    seedPrice,
    safePrice,
    safeRange,
    previousMultiplier
  );
  const unifiedMultiplier = safeBase > 0 ? Math.round((finalVibration / safeBase) * 1000) / 1000 : 1;
  const estimatedGridLines = finalVibration > 0 ? Math.round((safeRange / finalVibration) * 100) / 100 : 0;

  // Maintain legacy decomposed decimal and octave components for backward compatibility
  const magnitude = Math.max(0, Math.floor(Math.log10(safePrice / Math.max(0.0001, seedPrice))));
  const decimalMultiplier = Math.pow(10, magnitude);
  const octaveMultiplier = decimalMultiplier > 0 ? unifiedMultiplier / decimalMultiplier : unifiedMultiplier;

  return {
    finalVibration,
    baseVibration: safeBase,
    unifiedMultiplier,
    decimalMultiplier,
    octaveMultiplier,
    visibleRange: safeRange,
    estimatedGridLines,
  };
}
