/**
 * W.D. Gann Pure Mathematical Derivations & Geometric Coordinate Transformers
 *
 * All formulas maintain strict 1:1 aspect ratio mapping between:
 * 1 Time Unit = 1 Minor Grid Unit (12px on K&E Paper)
 * 1 Price Unit = 1 Minor Grid Unit (12px on K&E Paper)
 */

export interface GannAngleDef {
  label: string;
  timeUnit: number;
  priceUnit: number;
  angleDegrees: number;
  slope: number;
}

/**
 * Standard W.D. Gann Harmonic Angle Matrix
 * Notice: 1x1 is exactly 45.000° because scaleX === scaleY (1:1 isotropic ratio)
 */
export const GANN_HARMONIC_ANGLES: GannAngleDef[] = [
  { label: "1x8", timeUnit: 8, priceUnit: 1, angleDegrees: 7.125, slope: 1 / 8 },
  { label: "1x4", timeUnit: 4, priceUnit: 1, angleDegrees: 14.036, slope: 1 / 4 },
  { label: "1x3", timeUnit: 3, priceUnit: 1, angleDegrees: 18.435, slope: 1 / 3 },
  { label: "1x2", timeUnit: 2, priceUnit: 1, angleDegrees: 26.565, slope: 1 / 2 },
  { label: "1x1", timeUnit: 1, priceUnit: 1, angleDegrees: 45.000, slope: 1 / 1 }, // Master Harmonic Ray
  { label: "2x1", timeUnit: 1, priceUnit: 2, angleDegrees: 63.435, slope: 2 / 1 },
  { label: "3x1", timeUnit: 1, priceUnit: 3, angleDegrees: 71.565, slope: 3 / 1 },
  { label: "4x1", timeUnit: 1, priceUnit: 4, angleDegrees: 75.964, slope: 4 / 1 },
  { label: "8x1", timeUnit: 1, priceUnit: 8, angleDegrees: 82.875, slope: 8 / 1 },
];

/**
 * Square of Nine (Pyramid Root Derivation)
 * @param price Base price level (e.g. 21500 for NIFTY)
 * @param degrees Aspect angle on the 360-degree circle (45, 90, 180, 270, 360)
 */
export function calculateSquareOfNineLevel(price: number, degrees: number): number {
  if (price <= 0) return 0;
  const root = Math.sqrt(price);
  const factor = degrees / 180.0; // 360 deg = +2.0 to square root
  const nextRoot = root + factor;
  return Math.round(nextRoot * nextRoot * 100) / 100;
}

/**
 * Generate Right-Angle "Swing Step" Path Segments
 * Gann Swing Charts advance horizontally to the new time coordinate,
 * then make a vertical step to the new price level.
 */
export function generateRightAngleSwingSteps(
  points: { col: number; row: number }[]
): { x: number; y: number }[] {
  if (points.length === 0) return [];

  const path: { x: number; y: number }[] = [];
  path.push({ x: points[0].col, y: points[0].row });

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];

    // Horizontal step along time at previous price level
    path.push({ x: curr.col, y: prev.row });

    // Vertical step to new price level
    path.push({ x: curr.col, y: curr.row });
  }

  return path;
}
