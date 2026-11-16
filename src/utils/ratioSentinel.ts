/**
 * W.D. Gann K&E 8x8 Isotropic Ratio Sentinel & Real-Time Watchdog
 *
 * Enforces Keuffel & Esser (K&E) 8x8 vellum physical geometry:
 * - 96 DPI Standard: 1 Inch = 96 pixels
 * - 1/8th Inch Minor Square: 12 pixels (96 / 8 = 12.0)
 * - Isotropic Scaling: scaleX === scaleY (Ratio: 0.125)
 * - Zero non-uniform distortion tolerance (Epsilon: 0.001px)
 */

export const KE_PHYSICAL_CONSTANTS = {
  STANDARD_DPI: 96,
  BASE_UNIT: 12,        // 1/8th inch at 96 DPI
  MAJOR_UNIT: 96,       // 1 full inch at 96 DPI
  SUBDIVISIONS: 8,      // 8x8 squares per inch
  INCH_RATIO: 0.125,     // 1/8 = 0.125
  EPSILON: 0.001,       // Maximum permissible deviation
} as const;

export interface SentinelAuditResult {
  isValid: boolean;
  baseUnit: number;
  majorUnit: number;
  subdivisions: number;
  inchRatio: number;
  deviation: number;
  correctionApplied: boolean;
  badgeMessage: string;
}

/**
 * Validates the fundamental K&E 8x8 physical aspect ratio.
 * Asserts majorUnit === baseUnit * 8 and baseUnit === 12.
 * If deviation > 0.001px, triggers structural correction.
 */
export function verifyKeEAspectRatio(
  baseUnit: number,
  majorUnit: number
): SentinelAuditResult {
  const expectedMajor = baseUnit * KE_PHYSICAL_CONSTANTS.SUBDIVISIONS;
  const majorDeviation = Math.abs(majorUnit - expectedMajor);
  const baseDeviation = Math.abs(baseUnit - KE_PHYSICAL_CONSTANTS.BASE_UNIT);
  const totalDeviation = Math.max(majorDeviation, baseDeviation);

  const isValid = totalDeviation < KE_PHYSICAL_CONSTANTS.EPSILON;

  return {
    isValid,
    baseUnit: isValid ? baseUnit : KE_PHYSICAL_CONSTANTS.BASE_UNIT,
    majorUnit: isValid ? majorUnit : KE_PHYSICAL_CONSTANTS.MAJOR_UNIT,
    subdivisions: KE_PHYSICAL_CONSTANTS.SUBDIVISIONS,
    inchRatio: KE_PHYSICAL_CONSTANTS.INCH_RATIO,
    deviation: totalDeviation,
    correctionApplied: !isValid,
    badgeMessage: !isValid
      ? "\u26A0\uFE0F K&E 8x8 ISOTROPIC RATIO LOCKED (0.125\" / 96 DPI)"
      : "K&E 8x8 ISOTROPIC RATIO LOCKED (0.125\" / 96 DPI)",
  };
}

export interface CanvasBackingStoreAudit {
  isDistorted: boolean;
  expectedWidth: number;
  expectedHeight: number;
  actualWidth: number;
  actualHeight: number;
  dpr: number;
  correctionNeeded: boolean;
}

/**
 * Audits a canvas backing store against physical viewport dimensions
 * to detect high-DPI scaling shifts or non-uniform stretching.
 */
export function auditCanvasBackingStore(
  canvas: HTMLCanvasElement,
  dpr: number = window.devicePixelRatio || 1
): CanvasBackingStoreAudit {
  const rect = canvas.getBoundingClientRect();
  const expectedWidth = Math.round(rect.width * dpr);
  const expectedHeight = Math.round(rect.height * dpr);

  const isDistorted =
    Math.abs(canvas.width - expectedWidth) > 1 ||
    Math.abs(canvas.height - expectedHeight) > 1;

  return {
    isDistorted,
    expectedWidth,
    expectedHeight,
    actualWidth: canvas.width,
    actualHeight: canvas.height,
    dpr,
    correctionNeeded: isDistorted,
  };
}
