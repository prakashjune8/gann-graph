/**
 * Cross-Browser Wheel & Trackpad Input Normalizer
 *
 * Normalizes discrepancies between:
 * - High-precision laptop trackpads (Windows Precision Touchpad, Apple Trackpad)
 * - Physical notched mouse wheels (Logitech, Microsoft, generic)
 * - Free-spinning / inertia mouse wheels
 * - Cross-browser deltaModes (DOM_DELTA_PIXEL = 0, DOM_DELTA_LINE = 1, DOM_DELTA_PAGE = 2)
 */

export interface WheelNormalizationResult {
  deltaY: number;          // Standardized pixel delta
  zoomMultiplier: number;  // Safe exponential zoom multiplier [0.85, 1.15]
}

export function normalizeWheelEvent(
  e: WheelEvent | React.WheelEvent
): WheelNormalizationResult {
  let delta = e.deltaY;

  // 1. Standardize deltaMode to pixel equivalent
  if (e.deltaMode === 1) {
    // DOM_DELTA_LINE: typically ~20px line height in browsers
    delta *= 20;
  } else if (e.deltaMode === 2) {
    // DOM_DELTA_PAGE: typically ~100px page jump
    delta *= 100;
  }

  // 2. Velocity Clamp: prevent high-velocity trackpad flicks or free-spinning
  // wheels from injecting thousands of delta units in a single animation frame.
  const MAX_STEP_DELTA = 120;
  const clampedDelta = Math.max(-MAX_STEP_DELTA, Math.min(MAX_STEP_DELTA, delta));

  // 3. Smooth Exponential Zoom Multiplier
  // Base divisor of 650 provides ~1.12x (12%) zoom per standard 100px mouse notch,
  // while scaling smoothly down to <1% increments for micro trackpad movements.
  const zoomMultiplier = Math.pow(2, -clampedDelta / 650);

  // 4. Bounded Range Sentinel: strictly clamp between 0.85 and 1.15 per frame
  const safeMultiplier = Math.max(0.85, Math.min(1.15, zoomMultiplier));

  return {
    deltaY: clampedDelta,
    zoomMultiplier: safeMultiplier,
  };
}
