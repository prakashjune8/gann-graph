import React, { useEffect, useRef, useCallback } from "react";
import { useGridState } from "../store/useGridState";
import { GridTheme } from "../types/gann";

// Classic drafting room color palette for Keuffel & Esser 8x8 engineering vellum
const DRAFTING_THEME: GridTheme = {
  paperBackground: "#F7F6F0",           // Vintage warm off-white parchment
  majorGridLine: "rgba(74, 120, 102, 0.60)", // Heavy faded drafting green (1 inch = 96px)
  minorGridLine: "rgba(74, 120, 102, 0.20)", // Light faded drafting green (1/8 inch = 12px)
  axisLine: "rgba(42, 75, 62, 0.85)",        // Bold Cartesian axis line
  swingStepStroke: "#8B1E1E",                 // Traditional crimson drafting ink for swings
  swingStepFill: "rgba(139, 30, 30, 0.12)",
  cursorHighlight: "rgba(33, 115, 70, 0.35)",
};

interface GannCanvasProps {
  showGannRay45?: boolean;
  showCoordinatesHUD?: boolean;
}

export const GannCanvas: React.FC<GannCanvasProps> = ({
  showGannRay45 = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Subscribe to Zustand state
  const {
    pan,
    zoom,
    baseUnit,
    majorUnit,
    subdivisions,
    swingPoints,
    pricePerUnit,
    panBy,
    zoomAt,
    updateCursor,
    setHovered,
    screenToWorld,
    worldToScreen,
    snapWorldToGrid,
  } = useGridState();

  // Mouse drag tracking refs to avoid React re-render overhead during high-frequency mousemove
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const animationFrameRef = useRef<number | null>(null);

  /**
   * Primary Render Pipeline:
   * Strictly 1:1 Aspect Ratio Geometric Canvas
   */
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;

    // Reset transform & clear to vintage off-white paper
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = DRAFTING_THEME.paperBackground;
    ctx.fillRect(0, 0, width, height);

    // Dynamic grid line spacing under current isotropic zoom
    const scaledBase = baseUnit * zoom;
    const scaledMajor = majorUnit * zoom;

    // Calculate visible Cartesian bounds in world units
    // Screen (0, 0) is top-left; Screen (width, height) is bottom-right
    const topLeftWorld = screenToWorld(0, 0);
    const bottomRightWorld = screenToWorld(width, height);

    const minWorldX = Math.min(topLeftWorld.x, bottomRightWorld.x);
    const maxWorldX = Math.max(topLeftWorld.x, bottomRightWorld.x);
    const minWorldY = Math.min(topLeftWorld.y, bottomRightWorld.y);
    const maxWorldY = Math.max(topLeftWorld.y, bottomRightWorld.y);

    // Determine grid line integer index ranges
    const startCol = Math.floor(minWorldX / baseUnit) - 1;
    const endCol = Math.ceil(maxWorldX / baseUnit) + 1;
    const startRow = Math.floor(minWorldY / baseUnit) - 1;
    const endRow = Math.ceil(maxWorldY / baseUnit) + 1;

    // -------------------------------------------------------------
    // 1. DRAW MINOR GRID LINES (1/8th inch, baseUnit = 12px)
    // -------------------------------------------------------------
    ctx.lineWidth = 1;
    ctx.strokeStyle = DRAFTING_THEME.minorGridLine;
    ctx.beginPath();

    // Vertical minor lines
    for (let col = startCol; col <= endCol; col++) {
      if (col % subdivisions !== 0) {
        const screenX = Math.round(pan.x + col * scaledBase) + 0.5; // Sub-pixel snapping
        ctx.moveTo(screenX, 0);
        ctx.lineTo(screenX, height);
      }
    }

    // Horizontal minor lines (Cartesian: Y inverted for screen raster)
    for (let row = startRow; row <= endRow; row++) {
      if (row % subdivisions !== 0) {
        const screenY = Math.round(pan.y - row * scaledBase) + 0.5;
        ctx.moveTo(0, screenY);
        ctx.lineTo(width, screenY);
      }
    }
    ctx.stroke();

    // -------------------------------------------------------------
    // 2. DRAW MAJOR GRID LINES (1 inch, majorUnit = 96px, 8x8 blocks)
    // -------------------------------------------------------------
    ctx.lineWidth = 1.25;
    ctx.strokeStyle = DRAFTING_THEME.majorGridLine;
    ctx.beginPath();

    // Vertical major lines
    for (let col = startCol; col <= endCol; col++) {
      if (col % subdivisions === 0 && col !== 0) {
        const screenX = Math.round(pan.x + col * scaledBase) + 0.5;
        ctx.moveTo(screenX, 0);
        ctx.lineTo(screenX, height);
      }
    }

    // Horizontal major lines
    for (let row = startRow; row <= endRow; row++) {
      if (row % subdivisions === 0 && row !== 0) {
        const screenY = Math.round(pan.y - row * scaledBase) + 0.5;
        ctx.moveTo(0, screenY);
        ctx.lineTo(width, screenY);
      }
    }
    ctx.stroke();

    // -------------------------------------------------------------
    // 3. CARTESIAN ZERO-AXES (X = 0 Time, Y = 0 Price)
    // -------------------------------------------------------------
    ctx.lineWidth = 2.0;
    ctx.strokeStyle = DRAFTING_THEME.axisLine;
    ctx.beginPath();

    // X Axis (row = 0)
    const axisY = Math.round(pan.y) + 0.5;
    if (axisY >= 0 && axisY <= height) {
      ctx.moveTo(0, axisY);
      ctx.lineTo(width, axisY);
    }

    // Y Axis (col = 0)
    const axisX = Math.round(pan.x) + 0.5;
    if (axisX >= 0 && axisX <= width) {
      ctx.moveTo(axisX, 0);
      ctx.lineTo(axisX, height);
    }
    ctx.stroke();

    // Origin Circle Indicator
    if (axisX >= -20 && axisX <= width + 20 && axisY >= -20 && axisY <= height + 20) {
      ctx.fillStyle = DRAFTING_THEME.axisLine;
      ctx.beginPath();
      ctx.arc(axisX, axisY, 3.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(42, 75, 62, 0.75)";
      ctx.font = "bold 10px 'Courier New', monospace";
      ctx.fillText("0,0 (K&E ORIGIN)", axisX + 7, axisY - 6);
    }

    // -------------------------------------------------------------
    // 4. GANN 1x1 (45-DEGREE) TRUE DIAGONAL RAY
    // In a true 1:1 locked grid, 1x1 angle passes through every corner!
    // -------------------------------------------------------------
    if (showGannRay45) {
      ctx.save();
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 3]);
      ctx.strokeStyle = "rgba(180, 80, 50, 0.70)"; // Faded rust orange

      const rayStartScreen = worldToScreen(0, 0);
      const maxExtent = 5000;
      const rayEndScreen = worldToScreen(maxExtent, maxExtent);

      ctx.beginPath();
      ctx.moveTo(rayStartScreen.x, rayStartScreen.y);
      ctx.lineTo(rayEndScreen.x, rayEndScreen.y);
      ctx.stroke();

      // Label on the 1x1 ray
      const labelWorldCoord = 24 * baseUnit; // 3 inches out
      const labelScreen = worldToScreen(labelWorldCoord, labelWorldCoord);
      if (
        labelScreen.x >= 0 &&
        labelScreen.x <= width &&
        labelScreen.y >= 0 &&
        labelScreen.y <= height
      ) {
        ctx.fillStyle = "rgba(180, 80, 50, 0.90)";
        ctx.font = "bold 11px 'Courier New', monospace";
        ctx.fillText("1x1 (45° TRUE HARMONIC)", labelScreen.x + 8, labelScreen.y - 8);
      }
      ctx.restore();
    }

    // -------------------------------------------------------------
    // 5. GANN RIGHT-ANGLE "SWING STEPS" PLOTTING
    // Strictly snapped to grid intersections. No diagonal candlestick lines.
    // -------------------------------------------------------------
    if (swingPoints.length > 0) {
      ctx.save();

      // Step Path: Horizontal Time Step followed by Vertical Price Step
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = DRAFTING_THEME.swingStepStroke;
      ctx.lineJoin = "miter";
      ctx.lineCap = "square";
      ctx.beginPath();

      const firstPoint = swingPoints[0];
      const firstWorldX = firstPoint.gridCol * baseUnit;
      const firstWorldY = firstPoint.gridRow * baseUnit;
      let currScreen = worldToScreen(firstWorldX, firstWorldY);

      ctx.moveTo(currScreen.x, currScreen.y);

      for (let i = 1; i < swingPoints.length; i++) {
        const nextPoint = swingPoints[i];
        const nextWorldX = nextPoint.gridCol * baseUnit;
        const nextWorldY = nextPoint.gridRow * baseUnit;

        // Step 1: Move horizontally to the new time coordinate at previous price
        const cornerScreen = worldToScreen(nextWorldX, swingPoints[i - 1].gridRow * baseUnit);
        ctx.lineTo(cornerScreen.x, cornerScreen.y);

        // Step 2: Move vertically to the new price coordinate
        const nextScreen = worldToScreen(nextWorldX, nextWorldY);
        ctx.lineTo(nextScreen.x, nextScreen.y);

        currScreen = nextScreen;
      }
      ctx.stroke();

      // Draw Grid Vertex Nodes & Annotation Tags
      swingPoints.forEach((pt) => {
        const worldPos = {
          x: pt.gridCol * baseUnit,
          y: pt.gridRow * baseUnit,
        };
        const sPos = worldToScreen(worldPos.x, worldPos.y);

        // Check if inside screen view before drawing details
        if (sPos.x < -50 || sPos.x > width + 50 || sPos.y < -50 || sPos.y > height + 50) {
          return;
        }

        // Draw solid square vertex on grid intersection
        const nodeSize = 6;
        ctx.fillStyle = pt.type === "SWING_HIGH" ? "#2E7D32" : "#C62828";
        ctx.fillRect(sPos.x - nodeSize / 2, sPos.y - nodeSize / 2, nodeSize, nodeSize);
        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = 1;
        ctx.strokeRect(sPos.x - nodeSize / 2, sPos.y - nodeSize / 2, nodeSize, nodeSize);

        // Label typography
        ctx.fillStyle = "#1E2A24";
        ctx.font = "600 10px 'Courier New', monospace";
        const tag = `[${pt.gridCol},${pt.gridRow}] ₹${pt.price.toLocaleString("en-IN")}`;
        const offsetY = pt.type === "SWING_HIGH" ? -10 : 16;
        ctx.fillText(tag, sPos.x + 8, sPos.y + offsetY);

        if (pt.label) {
          ctx.fillStyle = "rgba(74, 120, 102, 0.95)";
          ctx.font = "italic 9px sans-serif";
          ctx.fillText(pt.label, sPos.x + 8, sPos.y + offsetY + (pt.type === "SWING_HIGH" ? -10 : 12));
        }
      });

      ctx.restore();
    }

    // -------------------------------------------------------------
    // 6. K&E MAJOR UNIT INCH RULER LABELS
    // -------------------------------------------------------------
    ctx.save();
    ctx.fillStyle = "rgba(74, 120, 102, 0.85)";
    ctx.font = "bold 9px 'Courier New', monospace";

    // Column markers (every major block = 8 units = 1 inch)
    for (let col = startCol; col <= endCol; col++) {
      if (col % subdivisions === 0 && col !== 0) {
        const screenX = Math.round(pan.x + col * scaledBase);
        const inchIndex = col / subdivisions;
        if (screenX >= 20 && screenX <= width - 20) {
          ctx.fillText(`${inchIndex}"`, screenX + 3, height - 8);
        }
      }
    }

    // Row markers (every major block = 8 units = 1 inch)
    for (let row = startRow; row <= endRow; row++) {
      if (row % subdivisions === 0 && row !== 0) {
        const screenY = Math.round(pan.y - row * scaledBase);
        const inchIndex = row / subdivisions;
        if (screenY >= 20 && screenY <= height - 20) {
          ctx.fillText(`${inchIndex}"`, 8, screenY - 3);
        }
      }
    }
    ctx.restore();
  }, [
    pan,
    zoom,
    baseUnit,
    majorUnit,
    subdivisions,
    swingPoints,
    showGannRay45,
    screenToWorld,
    worldToScreen,
  ]);

  // Request Animation Frame sync on pan/zoom changes
  useEffect(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    animationFrameRef.current = requestAnimationFrame(render);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [render]);

  // Canvas resize listener maintaining razor-sharp High-DPI buffer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleResize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();

      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      render();
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [render]);

  /**
   * INTERACTION HANDLERS:
   * Infinite Cartesian Panning & Cursor-Centered Fixed 1:1 Zoom
   */
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // Middle click or Left click initiate pan
    if (e.button === 0 || e.button === 1) {
      isDraggingRef.current = true;
      dragStartRef.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    // Track cursor coordinates into Zustand store
    updateCursor(screenX, screenY);

    // Pan canvas if dragging
    if (isDraggingRef.current) {
      const deltaX = e.clientX - dragStartRef.current.x;
      const deltaY = e.clientY - dragStartRef.current.y;
      dragStartRef.current = { x: e.clientX, y: e.clientY };

      panBy(deltaX, deltaY);
    }
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  const handleMouseEnter = () => {
    setHovered(true);
  };

  const handleMouseLeave = () => {
    isDraggingRef.current = false;
    setHovered(false);
  };

  // Fixed 1:1 aspect ratio isotropic zoom centered directly under cursor
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;

    // Zoom multiplier (exponential smooth step)
    const zoomMultiplier = e.deltaY < 0 ? 1.08 : 0.92;
    zoomAt(cursorX, cursorY, zoomMultiplier);
  };

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        backgroundColor: DRAFTING_THEME.paperBackground,
        cursor: isDraggingRef.current ? "grabbing" : "crosshair",
      }}
    >
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onWheel={handleWheel}
        style={{
          width: "100%",
          height: "100%",
          display: "block",
        }}
      />
    </div>
  );
};
