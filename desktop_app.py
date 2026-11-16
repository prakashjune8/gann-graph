import os
import sys
import webview

HTML_CONTENT = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no" />
  <title>W.D. Gann Digital Drafting Desk</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      user-select: none;
      -webkit-user-select: none;
    }
    html, body {
      width: 100%;
      height: 100%;
      overflow: hidden;
      background-color: #F7F6F0;
      font-family: 'Courier New', Courier, monospace, -apple-system, sans-serif;
    }
    #canvas-container {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background-color: #F7F6F0;
    }
    canvas {
      width: 100%;
      height: 100%;
      display: block;
      cursor: crosshair;
    }
    /* Toolbar */
    .toolbar {
      position: absolute;
      top: 40px;
      left: 96px;
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px;
      background: rgba(247, 246, 240, 0.96);
      border: 1px solid rgba(74, 120, 102, 0.50);
      border-radius: 4px;
      padding: 6px 12px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
      z-index: 100;
      transition: top 0.2s ease, left 0.2s ease;
    }
    .toolbar-title {
      font-weight: bold;
      color: #1E332A;
      font-size: 12px;
      letter-spacing: 0.5px;
      padding-right: 8px;
      border-right: 1px solid rgba(74, 120, 102, 0.30);
    }
    .btn {
      background: #FFFFFF;
      border: 1px solid rgba(74, 120, 102, 0.40);
      color: #2C3E35;
      padding: 4px 8px;
      font-size: 11px;
      font-family: inherit;
      cursor: pointer;
      border-radius: 3px;
      outline: none;
      transition: all 0.15s ease;
    }
    .btn:hover {
      background: #E8F5E9;
      border-color: #2E7D32;
    }
    .btn.active {
      background: #2E7D32;
      color: #FFFFFF;
      font-weight: bold;
      border-color: #1B5E20;
    }
    .divider {
      width: 1px;
      height: 20px;
      background: rgba(74, 120, 102, 0.30);
      margin: 0 2px;
    }
    /* HUD */
    .hud {
      position: absolute;
      bottom: 42px;
      left: 96px;
      background: rgba(247, 246, 240, 0.95);
      border: 1px solid rgba(74, 120, 102, 0.45);
      border-radius: 4px;
      padding: 8px 14px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
      font-size: 11px;
      color: #2C3E35;
      pointer-events: none;
      line-height: 1.5;
      z-index: 100;
      min-width: 350px;
      transition: bottom 0.2s ease, left 0.2s ease;
    }
    .hud-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid rgba(74, 120, 102, 0.25);
      padding-bottom: 4px;
      margin-bottom: 6px;
      font-weight: bold;
    }
    .badge-locked {
      background: #2E7D32;
      color: #FFFFFF;
      font-size: 9px;
      padding: 2px 6px;
      border-radius: 3px;
      font-weight: bold;
      letter-spacing: 0.5px;
    }
    .hud-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 2px 14px;
    }
    .hud-footer {
      margin-top: 6px;
      padding-top: 4px;
      border-top: 1px dashed rgba(74, 120, 102, 0.25);
      font-size: 10px;
      color: rgba(74, 120, 102, 0.85);
      display: flex;
      justify-content: space-between;
    }
  </style>
</head>
<body>
  <div id="canvas-container">
    <canvas id="gannCanvas"></canvas>
  </div>

  <!-- Top Floating Drafting Toolbar -->
  <div class="toolbar">
    <span class="toolbar-title">K&amp;E 8x8 DRAFTING DESK</span>

    <!-- Mode Selector -->
    <button class="btn active" id="btnHybrid" onclick="setChartMode('HYBRID')">⚡ Hybrid</button>
    <button class="btn" id="btnCandles" onclick="setChartMode('CANDLES')">🕯️ Candles</button>
    <button class="btn" id="btnOHLC" onclick="setChartMode('OHLC')">📊 OHLC Bars</button>
    <button class="btn" id="btnSwings" onclick="setChartMode('SWINGS')">📐 Swing Steps</button>

    <div class="divider"></div>

    <!-- Toggles -->
    <button class="btn active" id="btnPatterns" onclick="togglePatterns()">✓ Patterns (Hammer, Doji...)</button>
    <button class="btn active" id="btnVolume" onclick="toggleVolume()">✓ Volume Bar</button>
    <button class="btn active" id="btnGannRay" onclick="toggleGannRay()">✓ 1x1 45° Ray</button>

    <div class="divider"></div>

    <!-- Four-Sided Axis Track Toggles (Step 1.5) -->
    <button class="btn active" id="btnAxisTop" onclick="toggleAxis('top')" title="Toggle Top Time Axis Track">🔲 Top</button>
    <button class="btn active" id="btnAxisBtm" onclick="toggleAxis('btm')" title="Toggle Bottom Time Axis Track">🔲 Btm</button>
    <button class="btn active" id="btnAxisLeft" onclick="toggleAxis('left')" title="Toggle Left Price Axis Track">🔲 Left</button>
    <button class="btn active" id="btnAxisRight" onclick="toggleAxis('right')" title="Toggle Right Price Axis Track">🔲 Right</button>

    <div class="divider"></div>

    <!-- Zoom & Origin -->
    <button class="btn" onclick="zoomIn()">+ Zoom</button>
    <button class="btn" onclick="zoomOut()">- Zoom</button>
    <button class="btn" style="font-weight:bold" onclick="resetZoom100()">1:1 (100%)</button>
    <button class="btn" onclick="resetOrigin()">Origin</button>

    <div class="divider"></div>

    <!-- Data Controls -->
    <button class="btn" style="color:#1967D2; font-weight:bold" onclick="loadSampleNifty()">+ Reload NIFTY 50</button>
  </div>

  <!-- Bottom Floating HUD -->
  <div class="hud">
    <div class="hud-header">
      <span>W.D. GANN DRAFTING HUD</span>
      <span class="badge-locked">1:1 ASPECT RATIO LOCKED</span>
    </div>
    <div class="hud-grid">
      <div><span style="color:rgba(74,120,102,0.9)">Active Mode:</span> <strong id="hudMode">HYBRID</strong></div>
      <div><span style="color:rgba(74,120,102,0.9)">Zoom Scale:</span> <strong id="hudZoom">100% (1.00x)</strong></div>
      <div><span style="color:rgba(74,120,102,0.9)">Cursor Price:</span> <strong style="color:#1B5E20" id="hudPrice">₹21500.0</strong></div>
      <div><span style="color:rgba(74,120,102,0.9)">Pan Origin:</span> <span id="hudPan">[220, 560]</span></div>
      <div><span style="color:rgba(74,120,102,0.9)">K&amp;E Col,Row:</span> <strong id="hudGrid">[0, 0]</strong></div>
      <div><span style="color:rgba(74,120,102,0.9)">Inches:</span> <span id="hudInch">0.000" X, 0.000" Y</span></div>
      <div><span style="color:rgba(74,120,102,0.9)">Bars / Candles:</span> <strong id="hudBars">17 bars</strong></div>
      <div><span style="color:rgba(74,120,102,0.9)">Patterns Flagged:</span> <strong style="color:#C62828" id="hudPatterns">7 patterns</strong></div>
    </div>
    <div class="hud-footer">
      <span>Left Drag / Arrow Keys: Pan Grid (Shift: Fast)</span>
      <span>Scroll: 1:1 Isotropic Zoom</span>
    </div>
  </div>

  <script>
    // Theme Constants
    const THEME = {
      paperBackground: "#F7F6F0",
      majorGridLine: "rgba(74, 120, 102, 0.60)",
      minorGridLine: "rgba(74, 120, 102, 0.20)",
      axisLine: "rgba(42, 75, 62, 0.85)",
      swingStepStroke: "#8B1E1E",
      bullishCandle: "#2E7D32",
      bullishCandleFill: "#E8F5E9",
      bearishCandle: "#C62828",
      bearishCandleFill: "#C62828",
      wickColor: "#1E2A24",
      volumeBull: "rgba(46, 125, 50, 0.35)",
      volumeBear: "rgba(198, 40, 40, 0.35)"
    };

    // State
    const state = {
      pan: { x: 220, y: 560 },
      zoom: 1.0,
      minZoom: 0.15,
      maxZoom: 6.0,
      baseUnit: 12,
      majorUnit: 96,
      subdivisions: 8,
      chartMode: "HYBRID", // 'HYBRID', 'CANDLES', 'OHLC', 'SWINGS'
      showPatterns: true,
      showVolumeBars: true,
      showGannRay: true,
      showTopAxis: true,
      showBottomAxis: true,
      showLeftAxis: true,
      showRightAxis: true,
      basePrice: 21500,
      pricePerUnit: 25.0,
      cursor: { x: 0, y: 0, worldX: 0, worldY: 0, col: 0, row: 0 },
      isDragging: false,
      dragStart: { x: 0, y: 0 },
      candles: [],
      swings: []
    };

    // Candlestick Pattern Detection
    function identifyPatterns(candles) {
      return candles.map((curr, idx, arr) => {
        const { open, high, low, close } = curr;
        const bodySize = Math.abs(close - open);
        const totalRange = high - low;
        const upperWick = high - Math.max(open, close);
        const lowerWick = Math.min(open, close) - low;
        const isBull = close >= open;

        if (totalRange <= 0) return curr;

        const bodyRatio = bodySize / totalRange;
        const upperWickRatio = upperWick / totalRange;
        const lowerWickRatio = lowerWick / totalRange;

        let pattern = null;
        let type = null;

        // 1. Doji
        if (bodyRatio <= 0.08) {
          if (lowerWickRatio >= 0.65) { pattern = "Dragonfly Doji"; type = "BULLISH"; }
          else if (upperWickRatio >= 0.65) { pattern = "Gravestone Doji"; type = "BEARISH"; }
          else { pattern = "Doji"; type = "NEUTRAL"; }
        }
        // 2. Hammer
        else if (lowerWickRatio >= 0.55 && upperWickRatio <= 0.12 && bodyRatio >= 0.15 && bodyRatio <= 0.38) {
          pattern = "Hammer";
          type = "BULLISH";
        }
        // 3. Shooting Star
        else if (upperWickRatio >= 0.55 && lowerWickRatio <= 0.12 && bodyRatio >= 0.15 && bodyRatio <= 0.38) {
          pattern = "Shooting Star";
          type = "BEARISH";
        }
        // 4. Marubozu
        else if (bodyRatio >= 0.88) {
          pattern = isBull ? "Bullish Marubozu" : "Bearish Marubozu";
          type = isBull ? "BULLISH" : "BEARISH";
        }

        // Two-bar patterns
        if (idx > 0) {
          const prev = arr[idx - 1];
          const prevIsBull = prev.close >= prev.open;
          const prevBody = Math.abs(prev.close - prev.open);

          if (!prevIsBull && isBull && open <= prev.close && close >= prev.open && bodySize > prevBody * 1.05) {
            pattern = "Bullish Engulfing";
            type = "BULLISH";
          } else if (prevIsBull && !isBull && open >= prev.close && close <= prev.open && bodySize > prevBody * 1.05) {
            pattern = "Bearish Engulfing";
            type = "BEARISH";
          }
        }

        // Three-bar: Morning Star
        if (idx >= 2) {
          const first = arr[idx - 2];
          const second = arr[idx - 1];
          const third = curr;
          if (first.close < first.open && Math.abs(second.close - second.open)/(second.high-second.low||1) < 0.35 && third.close > third.open) {
            pattern = "Morning Star";
            type = "BULLISH";
          }
        }

        return { ...curr, pattern, type };
      });
    }

    // Load Sample Dataset
    function loadSampleNifty() {
      const raw = [
        { id: "c-0", timestamp: "Day 01", open: 21620, high: 21680, low: 21580, close: 21600, volume: 145000, gridCol: 0 },
        { id: "c-1", timestamp: "Day 02", open: 21590, high: 21610, low: 21490, close: 21510, volume: 182000, gridCol: 2 },
        { id: "c-2", timestamp: "Day 03", open: 21500, high: 21560, low: 21380, close: 21540, volume: 245000, gridCol: 4 }, // Hammer
        { id: "c-3", timestamp: "Day 04", open: 21550, high: 21740, low: 21530, close: 21720, volume: 290000, gridCol: 6 }, // Bullish Engulfing
        { id: "c-4", timestamp: "Day 05", open: 21720, high: 21850, low: 21710, close: 21840, volume: 210000, gridCol: 8 },
        { id: "c-5", timestamp: "Day 06", open: 21840, high: 21990, low: 21820, close: 21980, volume: 260000, gridCol: 10 },
        { id: "c-6", timestamp: "Day 07", open: 21990, high: 22150, low: 21970, close: 22140, volume: 320000, gridCol: 12 }, // Marubozu
        { id: "c-7", timestamp: "Day 08", open: 22150, high: 22280, low: 22120, close: 22160, volume: 380000, gridCol: 14 }, // Shooting Star
        { id: "c-8", timestamp: "Day 09", open: 22140, high: 22160, low: 21960, close: 21980, volume: 275000, gridCol: 16 }, // Bearish Engulfing
        { id: "c-9", timestamp: "Day 10", open: 21980, high: 22020, low: 21840, close: 21860, volume: 195000, gridCol: 18 },
        { id: "c-10", timestamp: "Day 11", open: 21850, high: 21880, low: 21780, close: 21820, volume: 160000, gridCol: 20 }, // Doji
        { id: "c-11", timestamp: "Day 12", open: 21820, high: 21950, low: 21750, close: 21930, volume: 230000, gridCol: 22 }, // Morning Star
        { id: "c-12", timestamp: "Day 13", open: 21940, high: 22120, low: 21920, close: 22100, volume: 280000, gridCol: 24 },
        { id: "c-13", timestamp: "Day 14", open: 22110, high: 22290, low: 22080, close: 22270, volume: 310000, gridCol: 26 },
        { id: "c-14", timestamp: "Day 15", open: 22280, high: 22480, low: 22250, close: 22460, volume: 410000, gridCol: 28 }, // Trend Bull
        { id: "c-15", timestamp: "Day 16", open: 22470, high: 22520, low: 22400, close: 22420, volume: 330000, gridCol: 30 }, // Gravestone Doji
        { id: "c-16", timestamp: "Day 17", open: 22410, high: 22440, low: 22240, close: 22260, volume: 290000, gridCol: 32 }
      ];

      state.candles = identifyPatterns(raw);
      state.swings = [
        { id: "sw-1", timeStr: "Day 03", price: 21380, gridCol: 4, gridRow: Math.round((21380 - state.basePrice) / state.pricePerUnit), type: "SWING_LOW", label: "Support Low (Hammer)" },
        { id: "sw-2", timeStr: "Day 08", price: 22280, gridCol: 14, gridRow: Math.round((22280 - state.basePrice) / state.pricePerUnit), type: "SWING_HIGH", label: "Peak (Shooting Star)" },
        { id: "sw-3", timeStr: "Day 11", price: 21750, gridCol: 22, gridRow: Math.round((21750 - state.basePrice) / state.pricePerUnit), type: "SWING_LOW", label: "Gann 50% Equilibrium" },
        { id: "sw-4", timeStr: "Day 16", price: 22520, gridCol: 30, gridRow: Math.round((22520 - state.basePrice) / state.pricePerUnit), type: "SWING_HIGH", label: "Square of 9 Target" }
      ];

      updateHUD();
      requestRender();
    }

    // Geometry transforms
    function screenToWorld(sx, sy) {
      return {
        x: (sx - state.pan.x) / state.zoom,
        y: (state.pan.y - sy) / state.zoom
      };
    }

    function worldToScreen(wx, wy) {
      return {
        x: state.pan.x + wx * state.zoom,
        y: state.pan.y - wy * state.zoom
      };
    }

    function priceToWorldY(price) {
      return ((price - state.basePrice) / state.pricePerUnit) * state.baseUnit;
    }

    function worldYToPrice(wy) {
      return state.basePrice + (wy / state.baseUnit) * state.pricePerUnit;
    }

    // Canvas Rendering Engine
    const canvas = document.getElementById("gannCanvas");
    const ctx = canvas.getContext("2d", { alpha: false });
    let animId = null;

    function resizeCanvas() {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      requestRender();
    }
    window.addEventListener("resize", resizeCanvas);

    function requestRender() {
      if (animId) cancelAnimationFrame(animId);
      animId = requestAnimationFrame(render);
    }

    function render() {
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.width / dpr;
      const height = canvas.height / dpr;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = THEME.paperBackground;
      ctx.fillRect(0, 0, width, height);

      const scaledBase = state.baseUnit * state.zoom;
      const scaledMajor = state.majorUnit * state.zoom;

      const topLeftWorld = screenToWorld(0, 0);
      const bottomRightWorld = screenToWorld(width, height);

      const minWorldX = Math.min(topLeftWorld.x, bottomRightWorld.x);
      const maxWorldX = Math.max(topLeftWorld.x, bottomRightWorld.x);
      const minWorldY = Math.min(topLeftWorld.y, bottomRightWorld.y);
      const maxWorldY = Math.max(topLeftWorld.y, bottomRightWorld.y);

      const startCol = Math.floor(minWorldX / state.baseUnit) - 1;
      const endCol = Math.ceil(maxWorldX / state.baseUnit) + 1;
      const startRow = Math.floor(minWorldY / state.baseUnit) - 1;
      const endRow = Math.ceil(maxWorldY / state.baseUnit) + 1;

      // 1. Minor Grid Lines (1/8th inch = 12px)
      ctx.lineWidth = 1;
      ctx.strokeStyle = THEME.minorGridLine;
      ctx.beginPath();
      for (let col = startCol; col <= endCol; col++) {
        if (col % state.subdivisions !== 0) {
          const sx = Math.round(state.pan.x + col * scaledBase) + 0.5;
          ctx.moveTo(sx, 0); ctx.lineTo(sx, height);
        }
      }
      for (let row = startRow; row <= endRow; row++) {
        if (row % state.subdivisions !== 0) {
          const sy = Math.round(state.pan.y - row * scaledBase) + 0.5;
          ctx.moveTo(0, sy); ctx.lineTo(width, sy);
        }
      }
      ctx.stroke();

      // 2. Major Grid Lines (1 inch = 96px)
      ctx.lineWidth = 1.25;
      ctx.strokeStyle = THEME.majorGridLine;
      ctx.beginPath();
      for (let col = startCol; col <= endCol; col++) {
        if (col % state.subdivisions === 0 && col !== 0) {
          const sx = Math.round(state.pan.x + col * scaledBase) + 0.5;
          ctx.moveTo(sx, 0); ctx.lineTo(sx, height);
        }
      }
      for (let row = startRow; row <= endRow; row++) {
        if (row % state.subdivisions === 0 && row !== 0) {
          const sy = Math.round(state.pan.y - row * scaledBase) + 0.5;
          ctx.moveTo(0, sy); ctx.lineTo(width, sy);
        }
      }
      ctx.stroke();

      // 3. Cartesian Zero Axes
      ctx.lineWidth = 2.0;
      ctx.strokeStyle = THEME.axisLine;
      ctx.beginPath();
      const axisY = Math.round(state.pan.y) + 0.5;
      if (axisY >= 0 && axisY <= height) { ctx.moveTo(0, axisY); ctx.lineTo(width, axisY); }
      const axisX = Math.round(state.pan.x) + 0.5;
      if (axisX >= 0 && axisX <= width) { ctx.moveTo(axisX, 0); ctx.lineTo(axisX, height); }
      ctx.stroke();

      // Origin Tag
      if (axisX >= -20 && axisX <= width + 20 && axisY >= -20 && axisY <= height + 20) {
        ctx.fillStyle = THEME.axisLine;
        ctx.beginPath(); ctx.arc(axisX, axisY, 3.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "rgba(42, 75, 62, 0.75)";
        ctx.font = "bold 10px 'Courier New', monospace";
        ctx.fillText(`0,0 (BASE ₹${state.basePrice})`, axisX + 7, axisY - 6);
      }

      // 4. Gann 1x1 45° Ray
      if (state.showGannRay) {
        ctx.save();
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 3]);
        ctx.strokeStyle = "rgba(180, 80, 50, 0.70)";
        const r0 = worldToScreen(0, 0);
        const rEnd = worldToScreen(5000, 5000);
        ctx.beginPath(); ctx.moveTo(r0.x, r0.y); ctx.lineTo(rEnd.x, rEnd.y); ctx.stroke();

        const lblScreen = worldToScreen(24 * state.baseUnit, 24 * state.baseUnit);
        if (lblScreen.x >= 0 && lblScreen.x <= width && lblScreen.y >= 0 && lblScreen.y <= height) {
          ctx.fillStyle = "rgba(180, 80, 50, 0.90)";
          ctx.font = "bold 11px 'Courier New', monospace";
          ctx.fillText("1x1 (45° TRUE HARMONIC)", lblScreen.x + 8, lblScreen.y - 8);
        }
        ctx.restore();
      }

      // 5. Volume Histogram
      const leftRulerWidth = state.showLeftAxis ? 84 : 0;
      const rightRulerWidth = state.showRightAxis ? 88 : 0;
      const topRulerHeight = state.showTopAxis ? 30 : 0;
      const bottomRulerHeight = state.showBottomAxis ? 32 : 0;

      const mainLeft = leftRulerWidth;
      const mainRight = width - rightRulerWidth;
      const mainTop = topRulerHeight;
      const mainBottom = height - bottomRulerHeight;

      if (state.showVolumeBars && state.candles.length > 0) {
        ctx.save();
        const maxVol = Math.max(...state.candles.map(c => c.volume), 1);
        const vHeight = 60;
        const vBaseY = mainBottom - 2;

        state.candles.forEach(c => {
          const colX = worldToScreen(c.gridCol * state.baseUnit, 0).x;
          if (colX < mainLeft || colX > mainRight) return;
          const barW = Math.max(3, scaledBase * 0.7);
          const barH = (c.volume / maxVol) * vHeight;
          const isBull = c.close >= c.open;
          ctx.fillStyle = isBull ? THEME.volumeBull : THEME.volumeBear;
          ctx.fillRect(colX - barW/2, vBaseY - barH, barW, barH);
          ctx.strokeStyle = isBull ? "rgba(46,125,50,0.6)" : "rgba(198,40,40,0.6)";
          ctx.lineWidth = 0.8;
          ctx.strokeRect(colX - barW/2, vBaseY - barH, barW, barH);
        });
        ctx.fillStyle = "rgba(74, 120, 102, 0.70)";
        ctx.font = "9px 'Courier New', monospace";
        ctx.fillText("VOLUME HISTOGRAM", mainLeft + 20, vBaseY - vHeight - 4);
        ctx.restore();
      }

      // 6. Japanese Candlesticks
      if ((state.chartMode === "CANDLES" || state.chartMode === "HYBRID") && state.candles.length > 0) {
        ctx.save();
        const candleW = Math.max(4, scaledBase * 0.72);

        state.candles.forEach(c => {
          const colScreenX = worldToScreen(c.gridCol * state.baseUnit, 0).x;
          if (colScreenX < -60 || colScreenX > width + 60) return;

          const openScreenY = worldToScreen(0, priceToWorldY(c.open)).y;
          const highScreenY = worldToScreen(0, priceToWorldY(c.high)).y;
          const lowScreenY = worldToScreen(0, priceToWorldY(c.low)).y;
          const closeScreenY = worldToScreen(0, priceToWorldY(c.close)).y;

          const isBull = c.close >= c.open;
          const topBodyY = Math.min(openScreenY, closeScreenY);
          const bodyH = Math.max(2, Math.abs(closeScreenY - openScreenY));

          // Wick
          ctx.strokeStyle = THEME.wickColor;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(Math.round(colScreenX) + 0.5, Math.round(highScreenY));
          ctx.lineTo(Math.round(colScreenX) + 0.5, Math.round(lowScreenY));
          ctx.stroke();

          // Body
          const bodyLeft = Math.round(colScreenX - candleW / 2);
          ctx.fillStyle = isBull ? THEME.bullishCandleFill : THEME.bearishCandleFill;
          ctx.strokeStyle = isBull ? THEME.bullishCandle : THEME.bearishCandle;
          ctx.lineWidth = 1.5;
          ctx.fillRect(bodyLeft, topBodyY, candleW, bodyH);
          ctx.strokeRect(bodyLeft, topBodyY, candleW, bodyH);

          // Pattern Badges
          if (state.showPatterns && c.pattern) {
            const isBear = c.type === "BEARISH";
            const tagY = isBear ? highScreenY - 14 : lowScreenY + 18;
            ctx.save();
            ctx.font = "bold 9px 'Courier New', monospace";
            const txtW = ctx.measureText(c.pattern).width;
            const badgeW = txtW + 10;
            const badgeH = 15;
            const badgeX = colScreenX - badgeW / 2;

            ctx.fillStyle = c.type === "BULLISH" ? "rgba(46,125,50,0.92)" : c.type === "BEARISH" ? "rgba(198,40,40,0.92)" : "rgba(55,71,79,0.85)";
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(badgeX, tagY - 11, badgeW, badgeH, 3);
            else ctx.rect(badgeX, tagY - 11, badgeW, badgeH);
            ctx.fill();

            ctx.fillStyle = "#FFFFFF";
            ctx.fillText(c.pattern, badgeX + 5, tagY);

            ctx.strokeStyle = ctx.fillStyle;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(colScreenX, isBear ? highScreenY : lowScreenY);
            ctx.lineTo(colScreenX, isBear ? tagY + 4 : tagY - 11);
            ctx.stroke();
            ctx.restore();
          }
        });
        ctx.restore();
      }

      // 7. Western OHLC Bars
      if (state.chartMode === "OHLC" && state.candles.length > 0) {
        ctx.save();
        const tickW = Math.max(3, scaledBase * 0.42);

        state.candles.forEach(c => {
          const colScreenX = Math.round(worldToScreen(c.gridCol * state.baseUnit, 0).x) + 0.5;
          if (colScreenX < -50 || colScreenX > width + 50) return;

          const openScreenY = Math.round(worldToScreen(0, priceToWorldY(c.open)).y) + 0.5;
          const highScreenY = Math.round(worldToScreen(0, priceToWorldY(c.high)).y) + 0.5;
          const lowScreenY = Math.round(worldToScreen(0, priceToWorldY(c.low)).y) + 0.5;
          const closeScreenY = Math.round(worldToScreen(0, priceToWorldY(c.close)).y) + 0.5;

          const isBull = c.close >= c.open;
          ctx.strokeStyle = isBull ? THEME.bullishCandle : THEME.bearishCandle;
          ctx.lineWidth = 1.8;

          // Spine
          ctx.beginPath(); ctx.moveTo(colScreenX, highScreenY); ctx.lineTo(colScreenX, lowScreenY); ctx.stroke();
          // Open Tick Left
          ctx.beginPath(); ctx.moveTo(colScreenX - tickW, openScreenY); ctx.lineTo(colScreenX, openScreenY); ctx.stroke();
          // Close Tick Right
          ctx.beginPath(); ctx.moveTo(colScreenX, closeScreenY); ctx.lineTo(colScreenX + tickW, closeScreenY); ctx.stroke();
        });
        ctx.restore();
      }

      // 8. Gann Right-Angle Swing Steps
      if ((state.chartMode === "SWINGS" || state.chartMode === "HYBRID") && state.swings.length > 0) {
        ctx.save();
        ctx.lineWidth = state.chartMode === "HYBRID" ? 2.8 : 2.5;
        ctx.strokeStyle = state.chartMode === "HYBRID" ? "rgba(139, 30, 30, 0.88)" : THEME.swingStepStroke;
        ctx.lineJoin = "miter";
        ctx.lineCap = "square";
        ctx.beginPath();

        const firstPt = state.swings[0];
        let currScreen = worldToScreen(firstPt.gridCol * state.baseUnit, firstPt.gridRow * state.baseUnit);
        ctx.moveTo(currScreen.x, currScreen.y);

        for (let i = 1; i < state.swings.length; i++) {
          const nextPt = state.swings[i];
          const nextWorldX = nextPt.gridCol * state.baseUnit;
          const nextWorldY = nextPt.gridRow * state.baseUnit;

          // Horizontal step
          const cornerScreen = worldToScreen(nextWorldX, state.swings[i - 1].gridRow * state.baseUnit);
          ctx.lineTo(cornerScreen.x, cornerScreen.y);
          // Vertical step
          const nextScreen = worldToScreen(nextWorldX, nextWorldY);
          ctx.lineTo(nextScreen.x, nextScreen.y);
          currScreen = nextScreen;
        }
        ctx.stroke();

        // Nodes
        state.swings.forEach(pt => {
          const sPos = worldToScreen(pt.gridCol * state.baseUnit, pt.gridRow * state.baseUnit);
          if (sPos.x < -50 || sPos.x > width + 50 || sPos.y < -50 || sPos.y > height + 50) return;

          const nSize = 6;
          ctx.fillStyle = pt.type === "SWING_HIGH" ? "#2E7D32" : "#C62828";
          ctx.fillRect(sPos.x - nSize/2, sPos.y - nSize/2, nSize, nSize);
          ctx.strokeStyle = "#FFFFFF"; ctx.lineWidth = 1;
          ctx.strokeRect(sPos.x - nSize/2, sPos.y - nSize/2, nSize, nSize);

          if (state.chartMode === "SWINGS") {
            ctx.fillStyle = "#1E2A24";
            ctx.font = "600 10px 'Courier New', monospace";
            const tag = `[${pt.gridCol},${pt.gridRow}] ₹${pt.price.toLocaleString("en-IN")}`;
            const offsetY = pt.type === "SWING_HIGH" ? -10 : 16;
            ctx.fillText(tag, sPos.x + 8, sPos.y + offsetY);
          }
        });
        ctx.restore();
      }

      // -------------------------------------------------------------
      // 9. FOUR-SIDED FIXED AXIS RULER TRACKS & CORNER JUNCTION BOXES
      // Rendered on top so panning grid slides underneath seamlessly.
      // -------------------------------------------------------------
      ctx.save();
      const rulerBg = THEME.paperBackground; // Solid #F7F6F0
      const rulerBorder = "rgba(74, 120, 102, 0.50)";
      const charcoal = "#2C2C2C";
      const gannGreen = "rgba(74, 120, 102, 0.85)";

      // 1. LEFT PRICE TRACK (Y-AXIS)
      if (state.showLeftAxis) {
        ctx.fillStyle = rulerBg;
        ctx.fillRect(0, 0, leftRulerWidth, height);
        ctx.strokeStyle = rulerBorder;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(Math.round(leftRulerWidth) + 0.5, 0);
        ctx.lineTo(Math.round(leftRulerWidth) + 0.5, height);
        ctx.stroke();

        ctx.textBaseline = "middle";
        for (let row = startRow; row <= endRow; row++) {
          const sy = Math.round(state.pan.y - row * scaledBase) + 0.5;
          if (sy < mainTop || sy > mainBottom) continue;

          const isMajor = row % state.subdivisions === 0;
          const isIntermediate = row % 2 === 0;
          const tickLength = isMajor ? 8 : isIntermediate ? 5 : 3;

          ctx.strokeStyle = isMajor ? charcoal : "rgba(74, 120, 102, 0.60)";
          ctx.lineWidth = isMajor ? 1.2 : 0.8;
          ctx.beginPath();
          ctx.moveTo(leftRulerWidth, sy);
          ctx.lineTo(leftRulerWidth - tickLength, sy);
          ctx.stroke();

          if (isMajor) {
            const priceVal = state.basePrice + row * state.pricePerUnit;
            const priceStr = `₹${priceVal.toLocaleString("en-IN")}`;
            const inchStr = `${row / state.subdivisions}"`;

            ctx.fillStyle = charcoal;
            ctx.font = "bold 10px 'Courier New', Courier, monospace";
            ctx.textAlign = "left";
            ctx.fillText(priceStr, 6, sy);

            ctx.fillStyle = "rgba(74, 120, 102, 0.70)";
            ctx.font = "8px 'Courier New', Courier, monospace";
            ctx.textAlign = "right";
            ctx.fillText(inchStr, leftRulerWidth - 10, sy);
          }
        }
      }

      // 2. RIGHT PRICE TRACK (Y-AXIS)
      if (state.showRightAxis) {
        ctx.fillStyle = rulerBg;
        ctx.fillRect(mainRight, 0, rightRulerWidth, height);
        ctx.strokeStyle = rulerBorder;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(Math.round(mainRight) + 0.5, 0);
        ctx.lineTo(Math.round(mainRight) + 0.5, height);
        ctx.stroke();

        ctx.textBaseline = "middle";
        for (let row = startRow; row <= endRow; row++) {
          const sy = Math.round(state.pan.y - row * scaledBase) + 0.5;
          if (sy < mainTop || sy > mainBottom) continue;

          const isMajor = row % state.subdivisions === 0;
          const isIntermediate = row % 2 === 0;
          const tickLength = isMajor ? 8 : isIntermediate ? 5 : 3;

          ctx.strokeStyle = isMajor ? charcoal : "rgba(74, 120, 102, 0.60)";
          ctx.lineWidth = isMajor ? 1.2 : 0.8;
          ctx.beginPath();
          ctx.moveTo(mainRight, sy);
          ctx.lineTo(mainRight + tickLength, sy);
          ctx.stroke();

          if (isMajor) {
            const priceVal = state.basePrice + row * state.pricePerUnit;
            const priceStr = `₹${priceVal.toLocaleString("en-IN")}`;
            const inchStr = `${row / state.subdivisions}"`;

            ctx.fillStyle = charcoal;
            ctx.font = "bold 10px 'Courier New', Courier, monospace";
            ctx.textAlign = "left";
            ctx.fillText(priceStr, mainRight + 10, sy);

            ctx.fillStyle = "rgba(74, 120, 102, 0.70)";
            ctx.font = "8px 'Courier New', Courier, monospace";
            ctx.textAlign = "right";
            ctx.fillText(inchStr, width - 8, sy);
          }
        }
      }

      // 3. TOP TIME TRACK (X-AXIS)
      if (state.showTopAxis) {
        ctx.fillStyle = rulerBg;
        ctx.fillRect(mainLeft, 0, mainRight - mainLeft, topRulerHeight);
        ctx.strokeStyle = rulerBorder;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(mainLeft, Math.round(topRulerHeight) + 0.5);
        ctx.lineTo(mainRight, Math.round(topRulerHeight) + 0.5);
        ctx.stroke();

        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        for (let col = startCol; col <= endCol; col++) {
          const sx = Math.round(state.pan.x + col * scaledBase) + 0.5;
          if (sx < mainLeft || sx > mainRight) continue;

          const isMajor = col % state.subdivisions === 0;
          const isIntermediate = col % 2 === 0;
          const tickLength = isMajor ? 8 : isIntermediate ? 5 : 3;

          ctx.strokeStyle = isMajor ? charcoal : "rgba(74, 120, 102, 0.60)";
          ctx.lineWidth = isMajor ? 1.2 : 0.8;
          ctx.beginPath();
          ctx.moveTo(sx, topRulerHeight);
          ctx.lineTo(sx, topRulerHeight - tickLength);
          ctx.stroke();

          if (isMajor) {
            const inchIdx = col / state.subdivisions;
            const colStr = `${inchIdx}" [T+${col}]`;

            ctx.fillStyle = charcoal;
            ctx.font = "bold 9px 'Courier New', Courier, monospace";
            ctx.fillText(colStr, sx, topRulerHeight / 2);
          }
        }
      }

      // 4. BOTTOM TIME TRACK (X-AXIS)
      if (state.showBottomAxis) {
        ctx.fillStyle = rulerBg; // ALWAYS explicitly set background!
        ctx.fillRect(mainLeft, mainBottom, mainRight - mainLeft, bottomRulerHeight);
        ctx.strokeStyle = rulerBorder;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(mainLeft, Math.round(mainBottom) + 0.5);
        ctx.lineTo(mainRight, Math.round(mainBottom) + 0.5);
        ctx.stroke();

        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        for (let col = startCol; col <= endCol; col++) {
          const sx = Math.round(state.pan.x + col * scaledBase) + 0.5;
          if (sx < mainLeft || sx > mainRight) continue;

          const isMajor = col % state.subdivisions === 0;
          const isIntermediate = col % 2 === 0;
          const tickLength = isMajor ? 8 : isIntermediate ? 5 : 3;

          ctx.strokeStyle = isMajor ? charcoal : "rgba(74, 120, 102, 0.60)";
          ctx.lineWidth = isMajor ? 1.2 : 0.8;
          ctx.beginPath();
          ctx.moveTo(sx, mainBottom);
          ctx.lineTo(sx, mainBottom + tickLength);
          ctx.stroke();

          if (isMajor) {
            const inchIdx = col / state.subdivisions;
            const colStr = `${inchIdx}" [T+${col}]`;

            ctx.fillStyle = charcoal;
            ctx.font = "bold 9px 'Courier New', Courier, monospace";
            ctx.fillText(colStr, sx, mainBottom + 19);
          }
        }
      }

      // 5. CORNER JUNCTION BOXES (Rendered if both adjacent intersecting axes are visible)
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      // Top-Left Junction
      if (state.showTopAxis && state.showLeftAxis) {
        ctx.fillStyle = rulerBg;
        ctx.fillRect(0, 0, leftRulerWidth, topRulerHeight);
        ctx.strokeStyle = rulerBorder;
        ctx.strokeRect(0, 0, leftRulerWidth, topRulerHeight);
        ctx.fillStyle = gannGreen;
        ctx.font = "bold 9px 'Courier New', Courier, monospace";
        ctx.fillText("K&E 8x8", leftRulerWidth / 2, topRulerHeight / 2);
      }

      // Top-Right Junction
      if (state.showTopAxis && state.showRightAxis) {
        ctx.fillStyle = rulerBg;
        ctx.fillRect(mainRight, 0, rightRulerWidth, topRulerHeight);
        ctx.strokeStyle = rulerBorder;
        ctx.strokeRect(mainRight, 0, rightRulerWidth, topRulerHeight);
        ctx.fillStyle = gannGreen;
        ctx.font = "bold 9px 'Courier New', Courier, monospace";
        ctx.fillText("K&E 8x8", mainRight + rightRulerWidth / 2, topRulerHeight / 2);
      }

      // Bottom-Left Junction
      if (state.showBottomAxis && state.showLeftAxis) {
        ctx.fillStyle = rulerBg;
        ctx.fillRect(0, mainBottom, leftRulerWidth, bottomRulerHeight);
        ctx.strokeStyle = rulerBorder;
        ctx.strokeRect(0, mainBottom, leftRulerWidth, bottomRulerHeight);
        ctx.fillStyle = gannGreen;
        ctx.font = "bold 9px 'Courier New', Courier, monospace";
        ctx.fillText("K&E 8x8", leftRulerWidth / 2, mainBottom + bottomRulerHeight / 2);
      }

      // Bottom-Right Junction
      if (state.showBottomAxis && state.showRightAxis) {
        ctx.fillStyle = rulerBg;
        ctx.fillRect(mainRight, mainBottom, rightRulerWidth, bottomRulerHeight);
        ctx.strokeStyle = rulerBorder;
        ctx.strokeRect(mainRight, mainBottom, rightRulerWidth, bottomRulerHeight);
        ctx.fillStyle = gannGreen;
        ctx.font = "bold 9px 'Courier New', Courier, monospace";
        ctx.fillText("K&E 8x8", mainRight + rightRulerWidth / 2, mainBottom + bottomRulerHeight / 2);
      }

      ctx.restore();
    }

    // User Interactions
    canvas.addEventListener("mousedown", (e) => {
      if (e.button === 0 || e.button === 1) {
        state.isDragging = true;
        state.dragStart = { x: e.clientX, y: e.clientY };
      }
    });

    window.addEventListener("mouseup", () => {
      state.isDragging = false;
    });

    canvas.addEventListener("mousemove", (e) => {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      state.cursor.x = sx;
      state.cursor.y = sy;
      const w = screenToWorld(sx, sy);
      state.cursor.worldX = w.x;
      state.cursor.worldY = w.y;
      state.cursor.col = Math.round(w.x / state.baseUnit);
      state.cursor.row = Math.round(w.y / state.baseUnit);

      if (state.isDragging) {
        const dx = e.clientX - state.dragStart.x;
        const dy = e.clientY - state.dragStart.y;
        state.dragStart = { x: e.clientX, y: e.clientY };
        state.pan.x += dx;
        state.pan.y += dy;
        requestRender();
      }

      updateHUD();
    });

    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const cursorX = e.clientX - rect.left;
      const cursorY = e.clientY - rect.top;

      const factor = e.deltaY < 0 ? 1.08 : 0.92;
      const nextZoom = Math.min(Math.max(state.zoom * factor, state.minZoom), state.maxZoom);
      if (nextZoom === state.zoom) return;

      const world = screenToWorld(cursorX, cursorY);
      state.zoom = nextZoom;
      state.pan.x = cursorX - world.x * nextZoom;
      state.pan.y = cursorY + world.y * nextZoom;

      updateHUD();
      requestRender();
    }, { passive: false });

    // Keyboard Arrow Key Navigation (Mathematically Aligned to K&E Grid)
    window.addEventListener("keydown", (e) => {
      if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;

      // Step Math: 48px (1/2 inch = 4 minor units), Shift+Arrow = 96px (1 full inch = 8 minor units)
      const stepDistance = e.shiftKey ? state.majorUnit : state.majorUnit / 2;

      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          state.pan.y += stepDistance;
          updateHUD();
          requestRender();
          break;
        case "ArrowDown":
          e.preventDefault();
          state.pan.y -= stepDistance;
          updateHUD();
          requestRender();
          break;
        case "ArrowLeft":
          e.preventDefault();
          state.pan.x += stepDistance;
          updateHUD();
          requestRender();
          break;
        case "ArrowRight":
          e.preventDefault();
          state.pan.x -= stepDistance;
          updateHUD();
          requestRender();
          break;
        default:
          break;
      }
    }, { passive: false });

    // Toolbar Handlers
    function setChartMode(mode) {
      state.chartMode = mode;
      document.getElementById("btnHybrid").className = mode === "HYBRID" ? "btn active" : "btn";
      document.getElementById("btnCandles").className = mode === "CANDLES" ? "btn active" : "btn";
      document.getElementById("btnOHLC").className = mode === "OHLC" ? "btn active" : "btn";
      document.getElementById("btnSwings").className = mode === "SWINGS" ? "btn active" : "btn";
      updateHUD();
      requestRender();
    }

    function togglePatterns() {
      state.showPatterns = !state.showPatterns;
      const btn = document.getElementById("btnPatterns");
      btn.className = state.showPatterns ? "btn active" : "btn";
      btn.textContent = state.showPatterns ? "✓ Patterns (Hammer, Doji...)" : "Patterns";
      updateHUD();
      requestRender();
    }

    function toggleVolume() {
      state.showVolumeBars = !state.showVolumeBars;
      const btn = document.getElementById("btnVolume");
      btn.className = state.showVolumeBars ? "btn active" : "btn";
      btn.textContent = state.showVolumeBars ? "✓ Volume Bar" : "Volume Bar";
      requestRender();
    }

    function toggleGannRay() {
      state.showGannRay = !state.showGannRay;
      const btn = document.getElementById("btnGannRay");
      btn.className = state.showGannRay ? "btn active" : "btn";
      btn.textContent = state.showGannRay ? "✓ 1x1 45° Ray" : "1x1 45° Ray";
      requestRender();
    }

    function toggleAxis(side) {
      if (side === 'top') state.showTopAxis = !state.showTopAxis;
      if (side === 'btm') state.showBottomAxis = !state.showBottomAxis;
      if (side === 'left') state.showLeftAxis = !state.showLeftAxis;
      if (side === 'right') state.showRightAxis = !state.showRightAxis;

      const btnTop = document.getElementById("btnAxisTop");
      if (btnTop) {
        btnTop.className = state.showTopAxis ? "btn active" : "btn";
        btnTop.textContent = state.showTopAxis ? "🔲 Top" : "◻ Top";
      }
      const btnBtm = document.getElementById("btnAxisBtm");
      if (btnBtm) {
        btnBtm.className = state.showBottomAxis ? "btn active" : "btn";
        btnBtm.textContent = state.showBottomAxis ? "🔲 Btm" : "◻ Btm";
      }
      const btnLeft = document.getElementById("btnAxisLeft");
      if (btnLeft) {
        btnLeft.className = state.showLeftAxis ? "btn active" : "btn";
        btnLeft.textContent = state.showLeftAxis ? "🔲 Left" : "◻ Left";
      }
      const btnRight = document.getElementById("btnAxisRight");
      if (btnRight) {
        btnRight.className = state.showRightAxis ? "btn active" : "btn";
        btnRight.textContent = state.showRightAxis ? "🔲 Right" : "◻ Right";
      }

      updateLayoutPositions();
      requestRender();
    }

    function updateLayoutPositions() {
      const tb = document.querySelector(".toolbar");
      if (tb) {
        tb.style.top = state.showTopAxis ? "40px" : "14px";
        tb.style.left = state.showLeftAxis ? "96px" : "14px";
      }
      const hud = document.querySelector(".hud");
      if (hud) {
        hud.style.bottom = state.showBottomAxis ? "42px" : "14px";
        hud.style.left = state.showLeftAxis ? "96px" : "14px";
      }
    }

    function zoomIn() {
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      const world = screenToWorld(cx, cy);
      state.zoom = Math.min(state.zoom * 1.25, state.maxZoom);
      state.pan.x = cx - world.x * state.zoom;
      state.pan.y = cy + world.y * state.zoom;
      updateHUD();
      requestRender();
    }

    function zoomOut() {
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      const world = screenToWorld(cx, cy);
      state.zoom = Math.max(state.zoom * 0.8, state.minZoom);
      state.pan.x = cx - world.x * state.zoom;
      state.pan.y = cy + world.y * state.zoom;
      updateHUD();
      requestRender();
    }

    function resetZoom100() {
      state.zoom = 1.0;
      updateHUD();
      requestRender();
    }

    function resetOrigin() {
      state.pan = { x: Math.floor(window.innerWidth * 0.12), y: Math.floor(window.innerHeight * 0.75) };
      state.zoom = 1.0;
      updateHUD();
      requestRender();
    }

    function updateHUD() {
      document.getElementById("hudMode").textContent = state.chartMode;
      document.getElementById("hudZoom").textContent = `${Math.round(state.zoom * 100)}% (${state.zoom.toFixed(2)}x)`;
      document.getElementById("hudPrice").textContent = `₹${worldYToPrice(state.cursor.worldY).toFixed(1)}`;
      document.getElementById("hudPan").textContent = `[${Math.round(state.pan.x)}, ${Math.round(state.pan.y)}]`;
      document.getElementById("hudGrid").textContent = `[${state.cursor.col}, ${state.cursor.row}]`;
      document.getElementById("hudInch").textContent = `${(state.cursor.col / 8).toFixed(3)}" X, ${(state.cursor.row / 8).toFixed(3)}" Y`;
      document.getElementById("hudBars").textContent = `${state.candles.length} bars`;
      const patCount = state.candles.filter(c => c.pattern).length;
      document.getElementById("hudPatterns").textContent = state.showPatterns ? `${patCount} patterns` : "Hidden";
    }

    // Startup
    updateLayoutPositions();
    resizeCanvas();
    loadSampleNifty();
  </script>
</body>
</html>
"""

def main():
    window = webview.create_window(
        title="W.D. Gann Digital Drafting Desk — K&E 8x8 Fixed Coordinate Studio",
        html=HTML_CONTENT,
        width=1440,
        height=900,
        min_size=(1024, 700),
        resizable=True,
        fullscreen=False
    )
    webview.start()

if __name__ == "__main__":
    main()
