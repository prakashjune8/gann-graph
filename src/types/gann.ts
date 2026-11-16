export interface Point2D {
  x: number;
  y: number;
}

export interface GridCoord {
  col: number; // Discrete X grid column (minor square index)
  row: number; // Discrete Y grid row (minor square index)
}

export interface SwingPoint {
  id: string;
  timeStr: string;
  price: number;
  gridCol: number;
  gridRow: number;
  type: "SWING_HIGH" | "SWING_LOW" | "INTERMEDIATE" | "STEP";
  label?: string;
}

export interface GannAngleLine {
  id: string;
  originCol: number;
  originRow: number;
  angleRatio: [number, number]; // e.g. [1, 1] for 1x1 45deg, [2, 1] for 2x1 63.75deg, [1, 2] for 1x2 26.25deg
  direction: "UP" | "DOWN";
  color: string;
  label: string;
}

export interface GridTheme {
  paperBackground: string;      // Classic K&E parchment #F7F6F0
  majorGridLine: string;        // rgba(74, 120, 102, 0.60)
  minorGridLine: string;        // rgba(74, 120, 102, 0.20)
  axisLine: string;             // rgba(50, 85, 72, 0.85)
  swingStepStroke: string;      // #9A2A2A (classic crimson drafting ink)
  swingStepFill: string;        // rgba(154, 42, 42, 0.15)
  cursorHighlight: string;      // rgba(41, 128, 185, 0.35)
}
