/**
 * W.D. Gann Vector Ratio Engine
 * Auto-Scale V2 — Step 2
 *
 * Implements Vector Interdependence Math:
 * Calculates the price/time velocity ($V = \Delta Price / \Delta Col$) of consecutive
 * swing legs originating from the primary cycle anchor and validates cross-ratios
 * against core Gann harmonics.
 */

import { SwingNode } from "./SwingDetector";

export const GANN_RATIOS = [0.382, 0.5, 0.618, 1.0, 1.382, 1.5, 1.618] as const;

export interface VectorRatioResult {
  anchor: SwingNode | null;
  nodes: SwingNode[];
  velocities: number[];
  r1: number | null;
  r2: number | null;
  isR1Harmonic: boolean;
  isR2Harmonic: boolean;
  isHarmonicStructure: boolean;
  dominantVelocity: number | null;
  closestRatio1?: number;
  closestRatio2?: number;
  reason?: string;
}

/**
 * Checks if a given ratio falls within +/- 2% tolerance of any canonical Gann harmonic ratio.
 */
export function isHarmonic(
  ratio: number,
  tolerance: number = 0.02
): { harmonic: boolean; matchedTarget?: number } {
  if (!Number.isFinite(ratio) || ratio <= 0) {
    return { harmonic: false };
  }

  for (const target of GANN_RATIOS) {
    const relativeDiff = Math.abs(ratio - target) / target;
    const absoluteDiff = Math.abs(ratio - target);
    if (relativeDiff <= tolerance || absoluteDiff <= tolerance) {
      return { harmonic: true, matchedTarget: target };
    }
  }

  return { harmonic: false };
}

/**
 * Calculates price/time velocities across 3 consecutive swing legs after the primary anchor,
 * validates vector interdependence via cross-ratios against Gann harmonics, and derives
 * the dominant harmonic velocity for Auto-Scale V2.
 *
 * @param swings Full array of detected mechanical Gann swing nodes
 * @returns VectorRatioResult containing velocities, cross-ratios, and dominantVelocity (or null if fractured)
 */
export function calculateSwingVelocities(swings: SwingNode[]): VectorRatioResult {
  if (!swings || swings.length === 0) {
    return {
      anchor: null,
      nodes: [],
      velocities: [],
      r1: null,
      r2: null,
      isR1Harmonic: false,
      isR2Harmonic: false,
      isHarmonicStructure: false,
      dominantVelocity: null,
      reason: "No swing nodes provided.",
    };
  }

  // 1. Filter swings to find all Swing Lows (LL)
  const lowNodes = swings.filter((s) => s.type === "LL");
  if (lowNodes.length < 4) {
    return {
      anchor: null,
      nodes: lowNodes,
      velocities: [],
      r1: null,
      r2: null,
      isR1Harmonic: false,
      isR2Harmonic: false,
      isHarmonicStructure: false,
      dominantVelocity: null,
      reason: `Insufficient Swing Low (LL) nodes. Found ${lowNodes.length}, required at least 4.`,
    };
  }

  // 2. Locate the absolute minimum LL (The Anchor)
  let anchorIdx = 0;
  let minPrice = lowNodes[0].price;

  for (let i = 1; i < lowNodes.length; i++) {
    if (lowNodes[i].price < minPrice) {
      minPrice = lowNodes[i].price;
      anchorIdx = i;
    }
  }

  // 3. Slice array to get the Anchor + next three LL nodes occurring chronologically after the Anchor
  if (anchorIdx + 3 >= lowNodes.length) {
    return {
      anchor: lowNodes[anchorIdx],
      nodes: [lowNodes[anchorIdx]],
      velocities: [],
      r1: null,
      r2: null,
      isR1Harmonic: false,
      isR2Harmonic: false,
      isHarmonicStructure: false,
      dominantVelocity: null,
      reason: `Anchor found at index ${anchorIdx}, but only ${lowNodes.length - 1 - anchorIdx} subsequent LL nodes exist (need 3).`,
    };
  }

  const fourNodes: SwingNode[] = [
    lowNodes[anchorIdx],
    lowNodes[anchorIdx + 1],
    lowNodes[anchorIdx + 2],
    lowNodes[anchorIdx + 3],
  ];

  // 4. Verify they form an ascending sequence of Higher Lows (HL)
  const isAscendingHL =
    fourNodes[1].price > fourNodes[0].price &&
    fourNodes[2].price > fourNodes[1].price &&
    fourNodes[3].price > fourNodes[2].price;

  if (!isAscendingHL) {
    return {
      anchor: fourNodes[0],
      nodes: fourNodes,
      velocities: [],
      r1: null,
      r2: null,
      isR1Harmonic: false,
      isR2Harmonic: false,
      isHarmonicStructure: false,
      dominantVelocity: null,
      reason: "Subsequent LL nodes do not form an ascending sequence of Higher Lows (HL).",
    };
  }

  // 5. Calculate daily velocity (V = deltaPrice / deltaCol) for the 3 connecting vectors
  // V1 = (P1 - P0) / (Col1 - Col0)
  // V2 = (P2 - P1) / (Col2 - Col1)
  // V3 = (P3 - P2) / (Col3 - Col2)
  const v1DeltaCol = Math.max(1, fourNodes[1].col - fourNodes[0].col);
  const v2DeltaCol = Math.max(1, fourNodes[2].col - fourNodes[1].col);
  const v3DeltaCol = Math.max(1, fourNodes[3].col - fourNodes[2].col);

  const v1 = (fourNodes[1].price - fourNodes[0].price) / v1DeltaCol;
  const v2 = (fourNodes[2].price - fourNodes[1].price) / v2DeltaCol;
  const v3 = (fourNodes[3].price - fourNodes[2].price) / v3DeltaCol;

  const velocities = [v1, v2, v3];

  if (v1 <= 0 || v2 <= 0 || v3 <= 0) {
    return {
      anchor: fourNodes[0],
      nodes: fourNodes,
      velocities,
      r1: null,
      r2: null,
      isR1Harmonic: false,
      isR2Harmonic: false,
      isHarmonicStructure: false,
      dominantVelocity: null,
      reason: "One or more vectors produced zero or negative velocity.",
    };
  }

  // 6. Calculate Cross-Ratios: R1 = V2 / V1, R2 = V3 / V2
  const r1 = v2 / v1;
  const r2 = v3 / v2;

  const r1Check = isHarmonic(r1, 0.02);
  const r2Check = isHarmonic(r2, 0.02);

  const isHarmonicStructure = r1Check.harmonic && r2Check.harmonic;

  // 7. Dominant Velocity Output:
  // If both R1 and R2 are harmonic, return average of V1, V2, V3. If fractured, return null.
  const dominantVelocity = isHarmonicStructure
    ? (v1 + v2 + v3) / 3
    : null;

  return {
    anchor: fourNodes[0],
    nodes: fourNodes,
    velocities,
    r1,
    r2,
    isR1Harmonic: r1Check.harmonic,
    isR2Harmonic: r2Check.harmonic,
    isHarmonicStructure,
    dominantVelocity,
    closestRatio1: r1Check.matchedTarget,
    closestRatio2: r2Check.matchedTarget,
    reason: isHarmonicStructure
      ? "Harmonic vector convergence confirmed."
      : "Fractured vector structure: cross-ratios deviate from Gann harmonics.",
  };
}
