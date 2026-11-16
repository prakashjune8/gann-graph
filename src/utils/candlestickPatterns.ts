import { CandleData } from "../types/gann";

/**
 * Technical Candlestick Pattern Recognition Engine
 * Evaluates real body size, upper wick, lower wick, and multi-bar context.
 */
export function identifyCandlestickPatterns(candles: CandleData[]): CandleData[] {
  if (candles.length === 0) return [];

  return candles.map((curr, idx, arr) => {
    const open = curr.open;
    const high = curr.high;
    const low = curr.low;
    const close = curr.close;

    const bodySize = Math.abs(close - open);
    const totalRange = high - low;
    const upperWick = high - Math.max(open, close);
    const lowerWick = Math.min(open, close) - low;
    const isBull = close >= open;

    if (totalRange <= 0) {
      return curr;
    }

    const bodyRatio = bodySize / totalRange;
    const upperWickRatio = upperWick / totalRange;
    const lowerWickRatio = lowerWick / totalRange;

    let pattern: string | undefined;
    let patternType: "BULLISH" | "BEARISH" | "NEUTRAL" | undefined;
    let patternDescription: string | undefined;

    // 1. DOJI (Body <= 8% of total range)
    if (bodyRatio <= 0.08) {
      if (lowerWickRatio >= 0.65 && upperWickRatio <= 0.15) {
        pattern = "Dragonfly Doji";
        patternType = "BULLISH";
        patternDescription = "Strong buyer rejection of lower levels";
      } else if (upperWickRatio >= 0.65 && lowerWickRatio <= 0.15) {
        pattern = "Gravestone Doji";
        patternType = "BEARISH";
        patternDescription = "Seller rejection of highs; bearish reversal";
      } else {
        pattern = "Doji";
        patternType = "NEUTRAL";
        patternDescription = "Equilibrium / Market indecision node";
      }
    }
    // 2. HAMMER & HANGING MAN (Small upper body, lower wick >= 2x body, tiny upper wick)
    else if (lowerWickRatio >= 0.55 && upperWickRatio <= 0.12 && bodyRatio >= 0.15 && bodyRatio <= 0.38) {
      const prev = idx > 0 ? arr[idx - 1] : null;
      if (prev && prev.close < prev.open) {
        pattern = isBull ? "Hammer" : "Bullish Hammer";
        patternType = "BULLISH";
        patternDescription = "Bullish swing reversal off key support";
      } else {
        pattern = "Hanging Man";
        patternType = "BEARISH";
        patternDescription = "Warning of exhaustion at peak";
      }
    }
    // 3. SHOOTING STAR & INVERTED HAMMER (Upper wick >= 2x body, tiny lower wick)
    else if (upperWickRatio >= 0.55 && lowerWickRatio <= 0.12 && bodyRatio >= 0.15 && bodyRatio <= 0.38) {
      const prev = idx > 0 ? arr[idx - 1] : null;
      if (prev && prev.close > prev.open) {
        pattern = "Shooting Star";
        patternType = "BEARISH";
        patternDescription = "Bearish rejection pin bar from resistance";
      } else {
        pattern = "Inverted Hammer";
        patternType = "BULLISH";
        patternDescription = "Potential bullish reversal attempt";
      }
    }
    // 4. MARUBOZU (Very large body >= 88% of range, almost no wicks)
    else if (bodyRatio >= 0.88) {
      pattern = isBull ? "Bullish Marubozu" : "Bearish Marubozu";
      patternType = isBull ? "BULLISH" : "BEARISH";
      patternDescription = isBull ? "Extreme buyer conviction" : "Extreme seller liquidation";
    }

    // 5. TWO-BAR PATTERNS: ENGULFING & HARAMI
    if (idx > 0) {
      const prev = arr[idx - 1];
      const prevBody = Math.abs(prev.close - prev.open);
      const prevIsBull = prev.close >= prev.open;

      // Bullish Engulfing: previous bar was red, current bar is green and engulfs previous body
      if (!prevIsBull && isBull && open <= prev.close && close >= prev.open && bodySize > prevBody * 1.05) {
        pattern = "Bullish Engulfing";
        patternType = "BULLISH";
        patternDescription = "Strong buyer takeover engulfing previous bear candle";
      }
      // Bearish Engulfing: previous bar was green, current bar is red and engulfs previous body
      else if (prevIsBull && !isBull && open >= prev.close && close <= prev.open && bodySize > prevBody * 1.05) {
        pattern = "Bearish Engulfing";
        patternType = "BEARISH";
        patternDescription = "Strong seller dump engulfing previous bull candle";
      }
      // Harami / Inside Bar
      else if (high < prev.high && low > prev.low) {
        pattern = isBull ? "Bullish Harami" : "Bearish Harami";
        patternType = isBull ? "BULLISH" : "BEARISH";
        patternDescription = "Inside compression bar inside mother candle";
      }
    }

    // 6. THREE-BAR PATTERNS: MORNING STAR / EVENING STAR
    if (idx >= 2) {
      const first = arr[idx - 2];
      const second = arr[idx - 1];
      const third = curr;

      const firstIsBear = first.close < first.open;
      const firstIsBull = first.close > first.open;
      const secondIsSmall = Math.abs(second.close - second.open) / (second.high - second.low || 1) < 0.35;
      const thirdIsBull = third.close > third.open;
      const thirdIsBear = third.close < third.open;

      if (firstIsBear && secondIsSmall && thirdIsBull && third.close > (first.open + first.close) / 2) {
        pattern = "Morning Star";
        patternType = "BULLISH";
        patternDescription = "Classic 3-bar bottom reversal confluence";
      } else if (firstIsBull && secondIsSmall && thirdIsBear && third.close < (first.open + first.close) / 2) {
        pattern = "Evening Star";
        patternType = "BEARISH";
        patternDescription = "Classic 3-bar top exhaustion reversal";
      }
    }

    return {
      ...curr,
      pattern: pattern || curr.pattern,
      patternType: patternType || curr.patternType,
      patternDescription: patternDescription || curr.patternDescription,
    };
  });
}
