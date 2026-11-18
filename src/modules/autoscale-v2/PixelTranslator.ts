/**
 * W.D. Gann Pixel Translator
 * Auto-Scale V2 — Scaler Fix 3
 *
 * Implements pure mathematical translation between Gann geometric velocity
 * (points per time column) and React Canvas pricePerUnit to guarantee an
 * exact 1:1 physical screen aspect ratio (true 45-degree angle invariant).
 */

export interface VelocityTranslationDetail {
  translatedPricePerUnit: number;
  gannVelocity: number;
  columnWidthPixels: number;
  rowHeightPixels: number;
  aspectRatio: number;
  isPerfectSquare: boolean;
}

/**
 * Converts Gann geometric velocity (points per column) into React Canvas pricePerUnit.
 *
 * The 1:1 Aspect Ratio Math:
 * If 1 time unit (1 column) equals W pixels wide on the screen, then to draw a
 * perfect 45-degree angle (1x1 Gann Ray), 1 price unit must also equal exactly
 * H pixels high on the screen.
 *
 * Formula:
 * basePricePerUnit = gannVelocity / (columnWidthPixels / rowHeightPixels)
 *
 * @param gannVelocity Gann geometric slope in price units per column ($V = \Delta P / \Delta \text{Col}$)
 * @param columnWidthPixels Effective physical screen width of 1 minor grid column (zoom * baseCellWidth)
 * @param rowHeightPixels Effective physical screen height of 1 minor grid row (zoom * baseCellHeight)
 * @returns The calibrated pricePerUnit in Rupees/dollar per minor square
 */
export function velocityToPricePerUnit(
  gannVelocity: number,
  columnWidthPixels: number,
  rowHeightPixels: number
): number {
  if (!Number.isFinite(Number(gannVelocity)) || Number(gannVelocity) <= 0) {
    return 1.0;
  }

  // Ensure columnWidthPixels and rowHeightPixels can never evaluate to 0 or NaN
  const safeColWidth = Math.max(
    0.1,
    Number.isFinite(Number(columnWidthPixels)) && Number(columnWidthPixels) > 0
      ? Number(columnWidthPixels)
      : 12
  );
  const safeRowHeight = Math.max(
    0.1,
    Number.isFinite(Number(rowHeightPixels)) && Number(rowHeightPixels) > 0
      ? Number(rowHeightPixels)
      : 12
  );

  // Enforce explicit Number casting & division guard
  const basePricePerUnit =
    Number(gannVelocity) / Math.max(0.1, Number(safeColWidth / safeRowHeight));

  if (!Number.isFinite(basePricePerUnit) || basePricePerUnit <= 0) {
    return 1.0;
  }

  return Math.round(basePricePerUnit * 10000) / 10000;
}

/**
 * Detailed variant of velocityToPricePerUnit providing full diagnostic and aspect ratio telemetry.
 */
export function velocityToPricePerUnitDetail(
  gannVelocity: number,
  columnWidthPixels: number,
  rowHeightPixels: number
): VelocityTranslationDetail {
  const safeColWidth = Math.max(
    0.1,
    Number.isFinite(Number(columnWidthPixels)) && Number(columnWidthPixels) > 0
      ? Number(columnWidthPixels)
      : 12
  );
  const safeRowHeight = Math.max(
    0.1,
    Number.isFinite(Number(rowHeightPixels)) && Number(rowHeightPixels) > 0
      ? Number(rowHeightPixels)
      : 12
  );
  const aspectRatio = Number(safeColWidth / safeRowHeight);

  const translatedPricePerUnit = velocityToPricePerUnit(gannVelocity, safeColWidth, safeRowHeight);
  const isPerfectSquare = Math.abs(aspectRatio - 1.0) < 0.001;

  return {
    translatedPricePerUnit,
    gannVelocity: Number(gannVelocity),
    columnWidthPixels: safeColWidth,
    rowHeightPixels: safeRowHeight,
    aspectRatio: Math.round(aspectRatio * 10000) / 10000,
    isPerfectSquare,
  };
}
