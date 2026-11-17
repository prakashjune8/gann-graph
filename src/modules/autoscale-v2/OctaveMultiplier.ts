/**
 * W.D. Gann Harmonic Octave Multiplier
 * Auto-Scale V2 — Scaler Fix 1
 *
 * Implements dynamic octave scaling to scale up the baseline Genesis vibration
 * when current viewport prices are vastly higher than the Historic Seed,
 * preventing dense grid compression while maintaining pure geometric harmony.
 */

export interface MagnitudeShiftResult {
  magnitude: number;
  decimalMultiplier: number;
}

export interface ExpandedVibrationDetail {
  finalVibration: number;
  baseVibration: number;
  decimalMultiplier: number;
  octaveMultiplier: number;
  visibleRange: number;
  estimatedGridLines: number;
}

/**
 * The Base-10 Magnitude Shift (The Gann Decimal Rule):
 * Calculates the logarithmic difference between the current visible price and the historic seed.
 * If the price has grown by 10x, 100x, or 1000x, calculates:
 * decimalMultiplier = Math.pow(10, Math.max(0, magnitude))
 *
 * @param seedPrice The historic cycle seed price (e.g., ATL)
 * @param currentVisiblePrice The current trading price or viewport center price
 * @returns The decimal multiplier (1, 10, 100, 1000, ...)
 */
export function calculateMagnitudeShift(seedPrice: number, currentVisiblePrice: number): number {
  const safeSeed = Math.max(0.0001, Number.isFinite(seedPrice) ? seedPrice : 1.0);
  const safePrice = Math.max(0.0001, Number.isFinite(currentVisiblePrice) ? currentVisiblePrice : 1.0);

  const magnitude = Math.floor(Math.log10(safePrice / safeSeed));
  return Math.pow(10, Math.max(0, magnitude));
}

/**
 * Detailed variant of calculateMagnitudeShift returning both the raw magnitude order
 * and the resulting power-of-10 decimal multiplier.
 */
export function calculateMagnitudeShiftDetail(
  seedPrice: number,
  currentVisiblePrice: number
): MagnitudeShiftResult {
  const safeSeed = Math.max(0.0001, Number.isFinite(seedPrice) ? seedPrice : 1.0);
  const safePrice = Math.max(0.0001, Number.isFinite(currentVisiblePrice) ? currentVisiblePrice : 1.0);

  const rawMagnitude = Math.floor(Math.log10(safePrice / safeSeed));
  const magnitude = Math.max(0, rawMagnitude);
  const decimalMultiplier = Math.pow(10, magnitude);

  return {
    magnitude,
    decimalMultiplier,
  };
}

/**
 * The Base-2 Expansion (The Rule of Octaves):
 * If the baseVibration would result in more than 24 horizontal grid lines within the
 * currentVisibleRange, doubles it recursively (multiply by 2, 4, 8, 16, 32...) until
 * the visible grid lines fall between 8 and 24 optimal levels.
 *
 * @param baseVibration The baseline price vibration (e.g. seed / 8 or decimal-adjusted vibration)
 * @param currentVisibleRange The physical price range visible within the current viewport (maxPrice - minPrice)
 * @returns The octave multiplier (1, 2, 4, 8, 16, ...)
 */
export function calculateOctaveExpansion(baseVibration: number, currentVisibleRange: number): number {
  const safeVibration = Math.max(0.0001, Number.isFinite(baseVibration) ? baseVibration : 1.0);
  const safeRange = Math.max(0, Number.isFinite(currentVisibleRange) ? currentVisibleRange : 0);

  if (safeRange === 0) return 1;

  let octaveMultiplier = 1;
  const maxIterations = 32; // Safety sentinel against infinite loops
  let iterations = 0;

  // If baseVibration results in more than 24 horizontal grid lines, double recursively
  while (safeRange / (safeVibration * octaveMultiplier) > 24 && iterations < maxIterations) {
    octaveMultiplier *= 2;
    iterations++;
  }

  return octaveMultiplier;
}

/**
 * The Final Scaler Output:
 * Harmonizes the baseline Genesis vibration by applying both the decimal magnitude shift
 * and the base-2 octave expansion:
 * finalVibration = baseVibration * decimalMultiplier * octaveMultiplier
 *
 * @param baseVibration Baseline vibration derived from the seed ($V_{\text{base}} = \text{seed} / 8$)
 * @param seedPrice The historic anchor price (ATL)
 * @param currentVisiblePrice The current market price or viewport center price
 * @param visibleRange The price span of the active viewport (maxPrice - minPrice)
 * @returns The expanded true harmonic vibration
 */
export function getExpandedVibration(
  baseVibration: number,
  seedPrice: number,
  currentVisiblePrice: number,
  visibleRange: number
): number {
  const safeBase = Math.max(0.0001, Number.isFinite(baseVibration) ? baseVibration : 1.0);
  const decimalMultiplier = calculateMagnitudeShift(seedPrice, currentVisiblePrice);

  // Apply decimal scaling to base vibration first
  const decimalAdjustedVibration = safeBase * decimalMultiplier;

  // Derive octave doubling multiplier based on visible price span
  const octaveMultiplier = calculateOctaveExpansion(decimalAdjustedVibration, visibleRange);

  const finalVibration = safeBase * decimalMultiplier * octaveMultiplier;
  return Math.round(finalVibration * 10000) / 10000;
}

/**
 * Detailed variant of getExpandedVibration returning full scaling telemetry.
 */
export function getExpandedVibrationDetail(
  baseVibration: number,
  seedPrice: number,
  currentVisiblePrice: number,
  visibleRange: number
): ExpandedVibrationDetail {
  const safeBase = Math.max(0.0001, Number.isFinite(baseVibration) ? baseVibration : 1.0);
  const decimalMultiplier = calculateMagnitudeShift(seedPrice, currentVisiblePrice);
  const decimalAdjustedVibration = safeBase * decimalMultiplier;
  const octaveMultiplier = calculateOctaveExpansion(decimalAdjustedVibration, visibleRange);

  const finalVibration = Math.round(safeBase * decimalMultiplier * octaveMultiplier * 10000) / 10000;
  const safeRange = Math.max(0, Number.isFinite(visibleRange) ? visibleRange : 0);
  const estimatedGridLines = finalVibration > 0 ? Math.round((safeRange / finalVibration) * 100) / 100 : 0;

  return {
    finalVibration,
    baseVibration: safeBase,
    decimalMultiplier,
    octaveMultiplier,
    visibleRange: safeRange,
    estimatedGridLines,
  };
}
