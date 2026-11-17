/**
 * W.D. Gann Historic Seed & Dual Genesis Engine
 * Auto-Scale V2 — Phase 1b
 *
 * Implements:
 * 1. Dual Historic Node Extraction: Identifies Absolute All-Time Low (ATL) and High (ATH).
 * 2. Bull & Bear Genesis Sequences: Forward 3-day swing scans from ATL/ATH with strict column math.
 * 3. Proof of the Seed: Validates whether genesis nodes align within 1% tolerance of 1/8th octave levels.
 * 4. Master Octave Filtering & Projection: Canonical Rule of 8 arrays for geometric calibration.
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

export interface GenesisNode extends SwingNode {
  label: string; // "ATL", "L1", "L2", "L3", "ATH", "H1", "H2", "H3"
  indexInDataset: number;
  deltaTFromAnchor: number; // Strict col math: node.col - anchor.col (Vulnerability A)
  priceDeltaFromAnchor: number;
  velocityFromAnchor: number;
  isSynthesizedFallback?: boolean; // Set true if generated via IPO fallback (Vulnerability B)
}

export interface SeedValidationMatch {
  nodeLabel: string;
  nodePrice: number;
  closestOctavePrice: number;
  octaveFractionName: string;
  deviationPercent: number;
  isVerifiedWithinTolerance: boolean;
}

export interface SeedValidationResult {
  seedPrice: number;
  tolerance: number;
  isValid: boolean;
  matchRatio: number;
  matches: SeedValidationMatch[];
}

export interface GenesisExtractionResult {
  atlNode: GenesisNode;
  athNode: GenesisNode;
  bullNodes: GenesisNode[]; // [L1, L2, L3]
  bearNodes: GenesisNode[]; // [H1, H2, H3]
  allBullNodes: GenesisNode[]; // [ATL, L1, L2, L3]
  allBearNodes: GenesisNode[]; // [ATH, H1, H2, H3]
  bullProof: SeedValidationResult;
  bearProof: SeedValidationResult;
  ruleOf8BullGrid: { fraction: string; price: number }[];
  bullGenesisVelocity: number;
  bearGenesisVelocity: number;
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
 * Proof Validation: Proof of the Seed
 * Calculates the 1/8th fractions of the seedPrice (both relative expansions: seed + k*(seed/8)
 * and direct harmonic fractions: k*(seed/8)).
 * Checks if each node's price falls within the specified tolerance (default 1% = 0.01)
 * of any canonical 1/8th grid line.
 *
 * @param seedPrice The historic anchor price (ATL or ATH)
 * @param nodes The sequence of subsequent genesis swing nodes
 * @param tolerance Relative error threshold (default 0.01 = 1%)
 * @returns SeedValidationResult detailing accuracy and matching octave fractions
 */
export function validateSeed(
  seedPrice: number,
  nodes: (SwingNode | GenesisNode)[],
  tolerance: number = 0.01
): SeedValidationResult {
  const safeSeed = Math.max(0.0001, seedPrice);
  const baseVibration = safeSeed / 8;

  // Build target 1/8th octave levels
  // 1. Direct fractional levels: k * (seed / 8) for k = 1..16
  // 2. Expansion levels: seed + k * (seed / 8) for k = 1..8
  const octaveLevels: Array<{ name: string; price: number }> = [];

  for (let k = 1; k <= 16; k++) {
    const fractionName = `${k}/8 Seed (${(k / 8).toFixed(3)})`;
    octaveLevels.push({ name: fractionName, price: k * baseVibration });
  }

  for (let k = 1; k <= 8; k++) {
    const fractionName = `Seed + ${k}/8 (${(1 + k / 8).toFixed(3)})`;
    octaveLevels.push({ name: fractionName, price: safeSeed + k * baseVibration });
  }

  const matches: SeedValidationMatch[] = [];
  let verifiedCount = 0;

  for (const node of nodes) {
    let closestLevel = octaveLevels[0];
    let minDiff = Infinity;

    for (const lvl of octaveLevels) {
      const diff = Math.abs(node.price - lvl.price);
      if (diff < minDiff) {
        minDiff = diff;
        closestLevel = lvl;
      }
    }

    const deviationPercent = (minDiff / closestLevel.price) * 100;
    const isVerified = minDiff / closestLevel.price <= tolerance;
    if (isVerified) verifiedCount++;

    matches.push({
      nodeLabel: (node as GenesisNode).label || `${node.type}@Col${node.col}`,
      nodePrice: node.price,
      closestOctavePrice: Math.round(closestLevel.price * 100) / 100,
      octaveFractionName: closestLevel.name,
      deviationPercent: Math.round(deviationPercent * 100) / 100,
      isVerifiedWithinTolerance: isVerified,
    });
  }

  const total = Math.max(1, nodes.length);
  const matchRatio = verifiedCount / total;

  return {
    seedPrice: safeSeed,
    tolerance,
    isValid: matchRatio >= 0.5, // Seed is considered mathematically proven if >= 50% match
    matchRatio: Math.round(matchRatio * 100) / 100,
    matches,
  };
}

/**
 * Extracts Genesis Nodes (Bull: ATL + L1, L2, L3; Bear: ATH + H1, H2, H3),
 * enforces strict column difference math (deltaT = node.col - anchor.col),
 * handles short datasets / IPO fallbacks (Vulnerability B),
 * and validates the mathematical "Proof of the Seed".
 *
 * @param fullDataset Full array of historical candlestick data
 * @returns GenesisExtractionResult containing all Genesis nodes, proof reports, and Rule of 8 grids
 */
export function extractGenesisNodes(fullDataset: CandleData[]): GenesisExtractionResult {
  if (!fullDataset || fullDataset.length === 0) {
    const dummyNode: GenesisNode = {
      col: 0,
      price: 100,
      type: "LL",
      label: "ATL",
      date: "",
      indexInDataset: 0,
      deltaTFromAnchor: 0,
      priceDeltaFromAnchor: 0,
      velocityFromAnchor: 1.0,
    };
    return {
      atlNode: dummyNode,
      athNode: { ...dummyNode, label: "ATH", type: "HH" },
      bullNodes: [],
      bearNodes: [],
      allBullNodes: [dummyNode],
      allBearNodes: [{ ...dummyNode, label: "ATH", type: "HH" }],
      bullProof: { seedPrice: 100, tolerance: 0.01, isValid: false, matchRatio: 0, matches: [] },
      bearProof: { seedPrice: 100, tolerance: 0.01, isValid: false, matchRatio: 0, matches: [] },
      ruleOf8BullGrid: [],
      bullGenesisVelocity: 1.0,
      bearGenesisVelocity: 1.0,
    };
  }

  // 1. Locate absolute ATL and ATH
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

  const atlCandle = fullDataset[atlIdx];
  const athCandle = fullDataset[athIdx];

  const atlNode: GenesisNode = {
    col: atlCandle.gridCol,
    price: atlCandle.low,
    type: "LL",
    label: "ATL",
    date: atlCandle.timestamp,
    indexInDataset: atlIdx,
    deltaTFromAnchor: 0,
    priceDeltaFromAnchor: 0,
    velocityFromAnchor: 0,
  };

  const athNode: GenesisNode = {
    col: athCandle.gridCol,
    price: athCandle.high,
    type: "HH",
    label: "ATH",
    date: athCandle.timestamp,
    indexInDataset: athIdx,
    deltaTFromAnchor: 0,
    priceDeltaFromAnchor: 0,
    velocityFromAnchor: 0,
  };

  // 2. BULL SEED: Slice from ATL forward. Run detectGannSwings(..., 3).
  // Extract first 3 subsequent Higher Lows (LL nodes with prices > ATL).
  const bullSlice = fullDataset.slice(atlIdx);
  const bullSwings = detectGannSwings(bullSlice, 3);
  // Filter for valid Higher Lows (LL nodes with price > ATL.price)
  const candidateLows = bullSwings.filter((s) => s.type === "LL" && s.price > atlNode.price);

  const bullNodes: GenesisNode[] = [];
  const bullLabels = ["L1", "L2", "L3"];

  for (let i = 0; i < Math.min(3, candidateLows.length); i++) {
    const swing = candidateLows[i];
    // Strict column math: deltaT = node.col - anchor.col (Vulnerability A)
    const deltaT = Math.max(1, swing.col - atlNode.col);
    const priceDelta = Math.abs(swing.price - atlNode.price);
    bullNodes.push({
      ...swing,
      label: bullLabels[i],
      indexInDataset: atlIdx + bullSlice.findIndex((c) => c.gridCol === swing.col),
      deltaTFromAnchor: deltaT,
      priceDeltaFromAnchor: priceDelta,
      velocityFromAnchor: priceDelta / deltaT,
    });
  }

  // Vulnerability B Remediation: IPO / Short Dataset Fallback for Bull Nodes
  if (bullNodes.length < 3) {
    const remainingCount = 3 - bullNodes.length;
    const baseCol = bullNodes.length > 0 ? bullNodes[bullNodes.length - 1].col : atlNode.col;
    const basePrice = bullNodes.length > 0 ? bullNodes[bullNodes.length - 1].price : atlNode.price;
    const colStep = 4; // Standard minor octave column step
    const priceStep = Math.max(1, (athNode.price - atlNode.price) / 16);

    for (let k = 0; k < remainingCount; k++) {
      const idx = bullNodes.length;
      const synthCol = baseCol + (k + 1) * colStep;
      const synthPrice = basePrice + (k + 1) * priceStep;
      const deltaT = Math.max(1, synthCol - atlNode.col);
      const priceDelta = Math.abs(synthPrice - atlNode.price);

      bullNodes.push({
        col: synthCol,
        price: Math.round(synthPrice * 100) / 100,
        type: "LL",
        label: bullLabels[idx],
        date: `Synthetic-${bullLabels[idx]}`,
        indexInDataset: fullDataset.length - 1,
        deltaTFromAnchor: deltaT,
        priceDeltaFromAnchor: priceDelta,
        velocityFromAnchor: priceDelta / deltaT,
        isSynthesizedFallback: true,
      });
    }
  }

  // 3. BEAR SEED: Slice from ATH forward. Run detectGannSwings(..., 3).
  // Extract first 3 subsequent Lower Highs (HH nodes with prices < ATH).
  const bearSlice = fullDataset.slice(athIdx);
  const bearSwings = detectGannSwings(bearSlice, 3);
  const candidateHighs = bearSwings.filter((s) => s.type === "HH" && s.price < athNode.price);

  const bearNodes: GenesisNode[] = [];
  const bearLabels = ["H1", "H2", "H3"];

  for (let i = 0; i < Math.min(3, candidateHighs.length); i++) {
    const swing = candidateHighs[i];
    // Strict column math: deltaT = node.col - anchor.col (Vulnerability A)
    const deltaT = Math.max(1, swing.col - athNode.col);
    const priceDelta = Math.abs(athNode.price - swing.price);
    bearNodes.push({
      ...swing,
      label: bearLabels[i],
      indexInDataset: athIdx + bearSlice.findIndex((c) => c.gridCol === swing.col),
      deltaTFromAnchor: deltaT,
      priceDeltaFromAnchor: priceDelta,
      velocityFromAnchor: priceDelta / deltaT,
    });
  }

  // Vulnerability B Remediation: IPO / Short Dataset Fallback for Bear Nodes
  if (bearNodes.length < 3) {
    const remainingCount = 3 - bearNodes.length;
    const baseCol = bearNodes.length > 0 ? bearNodes[bearNodes.length - 1].col : athNode.col;
    const basePrice = bearNodes.length > 0 ? bearNodes[bearNodes.length - 1].price : athNode.price;
    const colStep = 4;
    const priceStep = Math.max(1, (athNode.price - atlNode.price) / 16);

    for (let k = 0; k < remainingCount; k++) {
      const idx = bearNodes.length;
      const synthCol = baseCol + (k + 1) * colStep;
      const synthPrice = Math.max(1, basePrice - (k + 1) * priceStep);
      const deltaT = Math.max(1, synthCol - athNode.col);
      const priceDelta = Math.abs(athNode.price - synthPrice);

      bearNodes.push({
        col: synthCol,
        price: Math.round(synthPrice * 100) / 100,
        type: "HH",
        label: bearLabels[idx],
        date: `Synthetic-${bearLabels[idx]}`,
        indexInDataset: fullDataset.length - 1,
        deltaTFromAnchor: deltaT,
        priceDeltaFromAnchor: priceDelta,
        velocityFromAnchor: priceDelta / deltaT,
        isSynthesizedFallback: true,
      });
    }
  }

  // 4. Calculate Genesis Velocities
  const l3 = bullNodes[2];
  const h3 = bearNodes[2];
  const bullGenesisVelocity = Math.max(0.0001, (l3.price - atlNode.price) / Math.max(1, l3.col - atlNode.col));
  const bearGenesisVelocity = Math.max(0.0001, (athNode.price - h3.price) / Math.max(1, h3.col - athNode.col));

  // 5. Proof of the Seed validation
  const bullProof = validateSeed(atlNode.price, bullNodes, 0.01);
  const bearProof = validateSeed(athNode.price, bearNodes, 0.01);

  // 6. Rule of 8 Grid Levels for ATL: 1/8th, 1/4 (2/8), 3/8 price levels
  const atlEighth = atlNode.price / 8;
  const ruleOf8BullGrid = [
    { fraction: "ATL + 1/8", price: Math.round((atlNode.price + 1 * atlEighth) * 100) / 100 },
    { fraction: "ATL + 2/8 (1/4)", price: Math.round((atlNode.price + 2 * atlEighth) * 100) / 100 },
    { fraction: "ATL + 3/8", price: Math.round((atlNode.price + 3 * atlEighth) * 100) / 100 },
    { fraction: "ATL + 4/8 (1/2)", price: Math.round((atlNode.price + 4 * atlEighth) * 100) / 100 },
  ];

  return {
    atlNode,
    athNode,
    bullNodes,
    bearNodes,
    allBullNodes: [atlNode, ...bullNodes],
    allBearNodes: [athNode, ...bearNodes],
    bullProof,
    bearProof,
    ruleOf8BullGrid,
    bullGenesisVelocity: Math.round(bullGenesisVelocity * 10000) / 10000,
    bearGenesisVelocity: Math.round(bearGenesisVelocity * 10000) / 10000,
  };
}

/**
 * Extracts Dual Historic Extreme Nodes (ATL & ATH) with indices, columns, and prices,
 * executes forward Gann 3-day swing detections, and derives the Bull and Bear Genesis velocities.
 */
export function calculateDualGenesisVelocities(fullDataset: CandleData[]): DualGenesisResult {
  const genesis = extractGenesisNodes(fullDataset);

  const atl: HistoricExtremeNode = {
    index: genesis.atlNode.indexInDataset,
    col: genesis.atlNode.col,
    price: genesis.atlNode.price,
    candle: genesis.atlNode as any,
  };

  const ath: HistoricExtremeNode = {
    index: genesis.athNode.indexInDataset,
    col: genesis.athNode.col,
    price: genesis.athNode.price,
    candle: genesis.athNode as any,
  };

  const bullOctaves = DUAL_OCTAVE_RATIOS.map((r) => Math.round(r * genesis.bullGenesisVelocity * 10000) / 10000);
  const bearOctaves = DUAL_OCTAVE_RATIOS.map((r) => Math.round(r * genesis.bearGenesisVelocity * 10000) / 10000);

  return {
    atl,
    ath,
    bullNodes: genesis.bullNodes,
    bearNodes: genesis.bearNodes,
    bullGenesisVelocity: genesis.bullGenesisVelocity,
    bearGenesisVelocity: genesis.bearGenesisVelocity,
    bullOctaves,
    bearOctaves,
  };
}

/**
 * Dual Harmonic Filter:
 * Compares localVelocity against both bullOctaves and bearOctaves arrays.
 */
export function snapToMasterOctave(localVelocity: number, bullV: number, bearV: number): number {
  const detail = snapToMasterOctaveDetail(localVelocity, bullV, bearV);
  return detail.snappedVelocity;
}

/**
 * Detailed variant of snapToMasterOctave providing structural metadata.
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
