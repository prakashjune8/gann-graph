/**
 * W.D. Gann Drafting Desk — Core Grid Bridge
 *
 * Provides a decoupled, strict API boundary between the core K&E 8x8 drafting
 * engine and external or experimental modules.
 *
 * Exposes:
 *  - Read-only access to grid state, camera pan/zoom, and datasets.
 *  - Pure geometric coordinate transformation utilities.
 *  - Safe command dispatchers to manipulate the viewport and data.
 *  - Dynamic overlay registration hooks for modular drawing passes.
 */

import { useGridState, GridState } from "../store/useGridState";
import { Point2D, GridCoord, SwingPoint, CandleData, ChartDisplayMode } from "../types/gann";

export type OverlayRenderer = (
  ctx: CanvasRenderingContext2D,
  bridge: IGridBridge,
  dimensions: { width: number; height: number; dpr: number }
) => void;

export interface IGridBridge {
  // Read-Only Viewport State
  getPan(): Point2D;
  getZoom(): number;
  getBaseUnit(): number;
  getMajorUnit(): number;
  getSubdivisions(): number;

  // Read-Only Market & Metric State
  getBasePrice(): number;
  getPricePerUnit(): number;
  getTimePerUnit(): string;
  getCandles(): readonly CandleData[];
  getSwingPoints(): readonly SwingPoint[];
  getChartMode(): ChartDisplayMode;

  // Read-Only Cursor State
  getCursorScreen(): Point2D;
  getCursorWorld(): Point2D;
  getCursorGrid(): GridCoord;
  isHovered(): boolean;

  // Pure Geometric Calculations
  screenToWorld(screenX: number, screenY: number): Point2D;
  worldToScreen(worldX: number, worldY: number): Point2D;
  priceToWorldY(price: number): number;
  worldYToPrice(worldY: number): number;
  snapWorldToGrid(worldX: number, worldY: number): {
    snappedX: number;
    snappedY: number;
    col: number;
    row: number;
  };
  screenToGrid(screenX: number, screenY: number): {
    col: number;
    row: number;
    snappedScreenX: number;
    snappedScreenY: number;
  };

  // Viewport & Navigation Command Dispatchers
  setPan(pan: Point2D): void;
  panBy(deltaX: number, deltaY: number): void;
  zoomAt(screenX: number, screenY: number, delta: number): void;
  setZoom(zoom: number): void;
  resetView(canvasWidth?: number, canvasHeight?: number): void;
  jumpToLatest(viewportWidth?: number, viewportHeight?: number): void;

  // Chart Mode & Feature Dispatchers
  setChartMode(mode: ChartDisplayMode): void;
  setShowPatterns(show: boolean): void;
  setShowVolumeBars(show: boolean): void;

  // Data Pipeline Dispatchers
  setCandles(candles: CandleData[]): void;
  setSwingPoints(points: SwingPoint[]): void;
  addSwingPoint(point: SwingPoint): void;
  calibratePriceScale(candles: CandleData[]): void;
  clearAllData(): void;
  loadSampleDataset(): void;

  // State Subscriptions
  subscribe(listener: (state: GridState, prevState: GridState) => void): () => void;

  // Modular Overlay Extension Registration
  registerOverlay(id: string, renderer: OverlayRenderer): () => void;
  unregisterOverlay(id: string): void;
  getOverlays(): Map<string, OverlayRenderer>;
}

class CoreGridBridge implements IGridBridge {
  private overlayRenderers: Map<string, OverlayRenderer> = new Map();
  private overlayChangeListeners: Set<() => void> = new Set();

  // Read-Only Viewport State
  getPan(): Point2D {
    return useGridState.getState().pan;
  }

  getZoom(): number {
    return useGridState.getState().zoom;
  }

  getBaseUnit(): number {
    return useGridState.getState().baseUnit;
  }

  getMajorUnit(): number {
    return useGridState.getState().majorUnit;
  }

  getSubdivisions(): number {
    return useGridState.getState().subdivisions;
  }

  // Read-Only Market & Metric State
  getBasePrice(): number {
    return useGridState.getState().basePrice;
  }

  getPricePerUnit(): number {
    return useGridState.getState().pricePerUnit;
  }

  getTimePerUnit(): string {
    return useGridState.getState().timePerUnit;
  }

  getCandles(): readonly CandleData[] {
    return useGridState.getState().candles;
  }

  getSwingPoints(): readonly SwingPoint[] {
    return useGridState.getState().swingPoints;
  }

  getChartMode(): ChartDisplayMode {
    return useGridState.getState().chartMode;
  }

  // Read-Only Cursor State
  getCursorScreen(): Point2D {
    return useGridState.getState().cursorScreen;
  }

  getCursorWorld(): Point2D {
    return useGridState.getState().cursorWorld;
  }

  getCursorGrid(): GridCoord {
    return useGridState.getState().cursorGrid;
  }

  isHovered(): boolean {
    return useGridState.getState().isHovered;
  }

  // Pure Geometric Calculations
  screenToWorld(screenX: number, screenY: number): Point2D {
    return useGridState.getState().screenToWorld(screenX, screenY);
  }

  worldToScreen(worldX: number, worldY: number): Point2D {
    return useGridState.getState().worldToScreen(worldX, worldY);
  }

  priceToWorldY(price: number): number {
    return useGridState.getState().priceToWorldY(price);
  }

  worldYToPrice(worldY: number): number {
    return useGridState.getState().worldYToPrice(worldY);
  }

  snapWorldToGrid(worldX: number, worldY: number) {
    return useGridState.getState().snapWorldToGrid(worldX, worldY);
  }

  screenToGrid(screenX: number, screenY: number) {
    return useGridState.getState().screenToGrid(screenX, screenY);
  }

  // Viewport & Navigation Command Dispatchers
  setPan(pan: Point2D): void {
    useGridState.getState().setPan(pan);
  }

  panBy(deltaX: number, deltaY: number): void {
    useGridState.getState().panBy(deltaX, deltaY);
  }

  zoomAt(screenX: number, screenY: number, delta: number): void {
    useGridState.getState().zoomAt(screenX, screenY, delta);
  }

  setZoom(zoom: number): void {
    useGridState.getState().setZoom(zoom);
  }

  resetView(canvasWidth?: number, canvasHeight?: number): void {
    useGridState.getState().resetView(canvasWidth, canvasHeight);
  }

  jumpToLatest(viewportWidth?: number, viewportHeight?: number): void {
    useGridState.getState().jumpToLatest(viewportWidth, viewportHeight);
  }

  // Chart Mode & Feature Dispatchers
  setChartMode(mode: ChartDisplayMode): void {
    useGridState.getState().setChartMode(mode);
  }

  setShowPatterns(show: boolean): void {
    useGridState.getState().setShowPatterns(show);
  }

  setShowVolumeBars(show: boolean): void {
    useGridState.getState().setShowVolumeBars(show);
  }

  // Data Pipeline Dispatchers
  setCandles(candles: CandleData[]): void {
    useGridState.getState().setCandles(candles);
  }

  setSwingPoints(points: SwingPoint[]): void {
    useGridState.getState().setSwingPoints(points);
  }

  addSwingPoint(point: SwingPoint): void {
    useGridState.getState().addSwingPoint(point);
  }

  calibratePriceScale(candles: CandleData[]): void {
    useGridState.getState().calibratePriceScale(candles);
  }

  clearAllData(): void {
    useGridState.getState().clearAllData();
  }

  loadSampleDataset(): void {
    useGridState.getState().loadSampleDataset();
  }

  // State Subscriptions
  subscribe(listener: (state: GridState, prevState: GridState) => void): () => void {
    return useGridState.subscribe(listener);
  }

  // Modular Overlay Extension Registration
  registerOverlay(id: string, renderer: OverlayRenderer): () => void {
    this.overlayRenderers.set(id, renderer);
    this.notifyOverlayChange();
    return () => {
      this.unregisterOverlay(id);
    };
  }

  unregisterOverlay(id: string): void {
    if (this.overlayRenderers.delete(id)) {
      this.notifyOverlayChange();
    }
  }

  getOverlays(): Map<string, OverlayRenderer> {
    return this.overlayRenderers;
  }

  onOverlayChange(listener: () => void): () => void {
    this.overlayChangeListeners.add(listener);
    return () => {
      this.overlayChangeListeners.delete(listener);
    };
  }

  private notifyOverlayChange(): void {
    this.overlayChangeListeners.forEach((listener) => {
      try {
        listener();
      } catch (err) {
        console.error("[GridBridge] Error in overlay change listener:", err);
      }
    });
  }
}

export const GridBridge: IGridBridge & {
  onOverlayChange(listener: () => void): () => void;
} = new CoreGridBridge();
