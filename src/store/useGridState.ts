import { create } from "zustand";
import { Point2D, GridCoord, SwingPoint } from "../types/gann";

export interface GridState {
  // Camera View
  pan: Point2D;
  zoom: number;
  minZoom: number;
  maxZoom: number;

  // W.D. Gann K&E 8x8 Grid Constants (Immutable 1:1 Aspect Ratio)
  readonly baseUnit: number;  // 12px = 1 minor square (1/8th inch)
  readonly majorUnit: number; // 96px = 1 major block (1 inch = 8 * 12px)
  readonly subdivisions: number; // 8 minor squares per major block

  // Active Cursor Coordinate Tracking
  cursorScreen: Point2D;
  cursorWorld: Point2D;
  cursorGrid: GridCoord;
  isHovered: boolean;

  // Gann Swing Steps Data Series
  swingPoints: SwingPoint[];

  // Price & Time scaling factors (Units per Grid Square)
  pricePerUnit: number; // e.g. ₹10.00 per baseUnit minor square
  timePerUnit: string;  // e.g. "1 Day" or "60 Min" per baseUnit minor square

  // Actions
  setPan: (pan: Point2D) => void;
  panBy: (deltaX: number, deltaY: number) => void;
  zoomAt: (screenX: number, screenY: number, zoomFactorDelta: number) => void;
  setZoom: (zoom: number) => void;
  resetView: (canvasWidth?: number, canvasHeight?: number) => void;
  updateCursor: (screenX: number, screenY: number) => void;
  setHovered: (hovered: boolean) => void;

  // Data Actions
  addSwingPoint: (point: SwingPoint) => void;
  setSwingPoints: (points: SwingPoint[]) => void;
  clearSwingPoints: () => void;
  loadSampleNiftySwing: () => void;

  // Pure Geometric Calculations
  screenToWorld: (screenX: number, screenY: number) => Point2D;
  worldToScreen: (worldX: number, worldY: number) => Point2D;
  snapWorldToGrid: (worldX: number, worldY: number) => {
    snappedX: number;
    snappedY: number;
    col: number;
    row: number;
  };
  screenToGrid: (screenX: number, screenY: number) => {
    col: number;
    row: number;
    snappedScreenX: number;
    snappedScreenY: number;
  };
}

export const useGridState = create<GridState>((set, get) => ({
  // Initial camera placement: centered Cartesian plane
  pan: { x: 300, y: 550 },
  zoom: 1.0,
  minZoom: 0.15,
  maxZoom: 6.0,

  // K&E 8x8 Fixed Constants
  baseUnit: 12,
  majorUnit: 96,
  subdivisions: 8,

  cursorScreen: { x: 0, y: 0 },
  cursorWorld: { x: 0, y: 0 },
  cursorGrid: { col: 0, row: 0 },
  isHovered: false,

  pricePerUnit: 10.0,
  timePerUnit: "1 Day",

  // Sample data: NIFTY 50 Right-Angle Swing Step Pattern
  swingPoints: [
    { id: "1", timeStr: "2024-01-02", price: 21500, gridCol: 0,  gridRow: 0,  type: "SWING_LOW",  label: "NIFTY Base 21500" },
    { id: "2", timeStr: "2024-01-15", price: 22120, gridCol: 16, gridRow: 16, type: "SWING_HIGH", label: "Swing High (1x1 45°)" },
    { id: "3", timeStr: "2024-01-24", price: 21140, gridCol: 24, gridRow: 4,  type: "SWING_LOW",  label: "Gann 50% Equilibrium" },
    { id: "4", timeStr: "2024-02-16", price: 22280, gridCol: 40, gridRow: 24, type: "SWING_HIGH", label: "Breakout Step" },
    { id: "5", timeStr: "2024-03-20", price: 21710, gridCol: 56, gridRow: 12, type: "SWING_LOW",  label: "Minor Low" },
    { id: "6", timeStr: "2024-04-10", price: 22750, gridCol: 72, gridRow: 32, type: "SWING_HIGH", label: "Square of 9 Target" },
    { id: "7", timeStr: "2024-05-09", price: 21820, gridCol: 88, gridRow: 16, type: "SWING_LOW",  label: "Support Test" },
    { id: "8", timeStr: "2024-06-03", price: 23330, gridCol: 104, gridRow: 44, type: "SWING_HIGH", label: "Election Peak" },
  ],

  setPan: (pan) => set({ pan }),

  panBy: (deltaX, deltaY) =>
    set((state) => ({
      pan: {
        x: state.pan.x + deltaX,
        y: state.pan.y + deltaY,
      },
    })),

  // Strictly isotropic cursor-centered zoom: X and Y scale by identical factor
  zoomAt: (screenX, screenY, zoomFactorDelta) => {
    const { pan, zoom, minZoom, maxZoom } = get();

    // Calculate new zoom with hard clamping
    const nextZoom = Math.min(Math.max(zoom * zoomFactorDelta, minZoom), maxZoom);
    if (nextZoom === zoom) return;

    // Convert mouse screen position to current world position
    // World coordinates where Y increases upwards (Cartesian standard)
    const worldX = (screenX - pan.x) / zoom;
    const worldY = (pan.y - screenY) / zoom;

    // Reposition pan so the invariant world point remains exactly under cursor
    const nextPanX = screenX - worldX * nextZoom;
    const nextPanY = screenY + worldY * nextZoom;

    set({
      zoom: nextZoom,
      pan: { x: nextPanX, y: nextPanY },
    });
  },

  setZoom: (newZoom) => {
    const { minZoom, maxZoom } = get();
    set({ zoom: Math.min(Math.max(newZoom, minZoom), maxZoom) });
  },

  resetView: (canvasWidth = 1440, canvasHeight = 900) => {
    // Reset to Cartesian origin with ample margin
    set({
      pan: { x: Math.floor(canvasWidth * 0.12), y: Math.floor(canvasHeight * 0.78) },
      zoom: 1.0,
    });
  },

  updateCursor: (screenX, screenY) => {
    const { screenToWorld, snapWorldToGrid, screenToGrid } = get();
    const world = screenToWorld(screenX, screenY);
    const snapped = snapWorldToGrid(world.x, world.y);
    const grid = screenToGrid(screenX, screenY);

    set({
      cursorScreen: { x: screenX, y: screenY },
      cursorWorld: world,
      cursorGrid: { col: grid.col, row: grid.row },
    });
  },

  setHovered: (hovered) => set({ isHovered: hovered }),

  addSwingPoint: (point) =>
    set((state) => ({ swingPoints: [...state.swingPoints, point] })),

  setSwingPoints: (points) => set({ swingPoints: points }),

  clearSwingPoints: () => set({ swingPoints: [] }),

  loadSampleNiftySwing: () =>
    set(() => ({
      swingPoints: [
        { id: "1", timeStr: "2024-01-02", price: 21500, gridCol: 0,  gridRow: 0,  type: "SWING_LOW",  label: "NIFTY Base 21500" },
        { id: "2", timeStr: "2024-01-15", price: 22120, gridCol: 16, gridRow: 16, type: "SWING_HIGH", label: "Swing High (1x1 45°)" },
        { id: "3", timeStr: "2024-01-24", price: 21140, gridCol: 24, gridRow: 4,  type: "SWING_LOW",  label: "Gann 50% Equilibrium" },
        { id: "4", timeStr: "2024-02-16", price: 22280, gridCol: 40, gridRow: 24, type: "SWING_HIGH", label: "Breakout Step" },
        { id: "5", timeStr: "2024-03-20", price: 21710, gridCol: 56, gridRow: 12, type: "SWING_LOW",  label: "Minor Low" },
        { id: "6", timeStr: "2024-04-10", price: 22750, gridCol: 72, gridRow: 32, type: "SWING_HIGH", label: "Square of 9 Target" },
        { id: "7", timeStr: "2024-05-09", price: 21820, gridCol: 88, gridRow: 16, type: "SWING_LOW",  label: "Support Test" },
        { id: "8", timeStr: "2024-06-03", price: 23330, gridCol: 104, gridRow: 44, type: "SWING_HIGH", label: "Election Peak" },
      ],
    })),

  // Conversion: Screen (pixels) -> World (world pixels, 1:1 isotropic)
  screenToWorld: (screenX, screenY) => {
    const { pan, zoom } = get();
    return {
      x: (screenX - pan.x) / zoom,
      y: (pan.y - screenY) / zoom, // Cartesian: Y increases upwards
    };
  },

  // Conversion: World (world pixels) -> Screen (pixels)
  worldToScreen: (worldX, worldY) => {
    const { pan, zoom } = get();
    return {
      x: pan.x + worldX * zoom,
      y: pan.y - worldY * zoom, // Cartesian: inverted for screen raster
    };
  },

  // Snap continuous world coordinates to nearest K&E baseUnit intersection
  snapWorldToGrid: (worldX, worldY) => {
    const { baseUnit } = get();
    const col = Math.round(worldX / baseUnit);
    const row = Math.round(worldY / baseUnit);
    return {
      snappedX: col * baseUnit,
      snappedY: row * baseUnit,
      col,
      row,
    };
  },

  // Screen coordinate directly to snapped grid col/row and snapped screen pixel
  screenToGrid: (screenX, screenY) => {
    const { screenToWorld, snapWorldToGrid, worldToScreen } = get();
    const world = screenToWorld(screenX, screenY);
    const snapped = snapWorldToGrid(world.x, world.y);
    const screenSnapped = worldToScreen(snapped.snappedX, snapped.snappedY);

    return {
      col: snapped.col,
      row: snapped.row,
      snappedScreenX: screenSnapped.x,
      snappedScreenY: screenSnapped.y,
    };
  },
}));
