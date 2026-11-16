# W.D. Gann Digital Drafting Desk
### High-Performance Standalone K&E 8x8 Geometric Trading Analysis Engine

Built with **Tauri (Rust)**, **React 18 (TypeScript)**, **Vite**, **HTML5 Canvas API**, and **Zustand**.

---

## 1. Architectural Philosophy: The Digital Drafting Desk
Unlike standard web charting libraries (TradingView, Highcharts) that continuously stretch and squash the X and Y axes depending on browser window dimensions, **this application functions strictly as a digital drafting table**.

- **Permanent 1:1 Aspect Ratio Guarantee**:
  - Time and price are locked to an invariant geometric vibration.
  - A 45° angle ($1\times1$) must remain an exact $45.000^\circ$ physical diagonal across square grid intersections.
  - Responsive stretching of either axis is strictly prohibited at the engine level ($\text{scale}_x \equiv \text{scale}_y \equiv \text{zoom}$).
- **Keuffel & Esser (K&E) 8x8 Grid Math**:
  - `baseUnit = 12px` (represents 1 minor square / $\frac{1}{8}\text{th}$ inch).
  - `majorUnit = 96px` (represents 1 major square / $1\text{ inch} = 8 \times 12\text{px}$).
  - `paperBackground = #F7F6F0` (vintage warm drafting parchment).
  - `majorGridLine = rgba(74, 120, 102, 0.60)` (heavy faded drafting green ink).
  - `minorGridLine = rgba(74, 120, 102, 0.20)` (crisp sub-pixel minor drafting rule).
- **Multi-Mode Geometric Chart Rendering**:
  1. **Japanese Candlesticks (`🕯️ Candlesticks`)**: Full body and wick rendering aligned to discrete K&E grid columns with emerald bull bodies and crimson bear bodies.
  2. **Western OHLC Bars (`📊 OHLC Bars`)**: Vertical high-low central spine with open tick extending left and close tick extending right.
  3. **Volume Bar Graph Histogram (`✓ Volume Bar`)**: Proportional volume bars aligned to column coordinates on the drafting baseline.
  4. **Candlestick Pattern Recognition (`✓ Patterns`)**: Automated real-time detection and pill annotation of:
     - **Hammer / Hanging Man**
     - **Inverted Hammer / Shooting Star**
     - **Bullish & Bearish Engulfing**
     - **Dragonfly & Gravestone Doji / Neutral Doji**
     - **Bullish & Bearish Marubozu**
     - **Morning Star & Evening Star**
  5. **Gann Right-Angle Swing Steps (`📐 Swing Steps`)**: Pure mechanical price advances along time nodes and steps vertically at right angles to swing pivots.
  6. **Hybrid Mode (`⚡ Hybrid`)**: Superimposes right-angle swing steps directly over candlesticks and OHLC bars for harmonic confluence analysis.

---

## 2. Directory Structure

```
d:\ANTIGRAVITY PROJECT FOLDER\GANN GRAPH/
├── package.json              # NPM configuration with React, Zustand, Vite, and Tauri CLI
├── tsconfig.json             # TypeScript strict compiler config
├── vite.config.ts            # Vite tailored for Tauri (port 1420, strictPort, rust watcher bypass)
├── index.html                # App shell
├── src/
│   ├── main.tsx              # React mounting root
│   ├── App.tsx               # Drafting desk studio layout
│   ├── components/
│   │   ├── GannCanvas.tsx    # High-DPI 1:1 Canvas rendering engine (Candles, OHLC, Swings, Volume)
│   │   ├── DraftingToolbar.tsx # Mode selector, pattern toggles, 1:1 zoom, origin reset
│   │   └── CoordinateOverlay.tsx # Real-time Cartesian coordinate, price, and inch HUD
│   ├── store/
│   │   └── useGridState.ts   # Zustand high-frequency camera, candle, & grid state store
│   ├── types/
│   │   └── gann.ts           # Type definitions for candles, patterns, and swings
│   └── utils/
│       ├── candlestickPatterns.ts # Pattern recognition algorithm (Hammer, Doji, Engulfing...)
│       ├── gannMath.ts       # Square of 9 derivations, harmonic angles (1x8 through 8x1)
│       └── brokerCsvParser.ts # Zerodha Kite & Alice Blue CSV importers & SQLite adapters
└── src-tauri/
    ├── Cargo.toml            # Rust dependencies (tauri v2, tauri-plugin-sql with SQLite)
    ├── tauri.conf.json       # Tauri window configuration & desktop bundle settings
    └── src/
        └── main.rs           # Native Rust process entry point with SQLite plugin
```

---

## 3. Desktop Setup & Running Instructions

### Step 1: Install System Prerequisites
1. **Node.js** (v18+ recommended): [https://nodejs.org](https://nodejs.org)
2. **Rust & Cargo**:
   - Install `rustup-init.exe` from [https://rustup.rs](https://rustup.rs).
   - Ensure the `C++ build tools` are installed via Visual Studio Installer (Desktop development with C++).

### Step 2: Install Node Dependencies
In `d:\ANTIGRAVITY PROJECT FOLDER\GANN GRAPH`:
```powershell
npm install
```

### Step 3: Launch in Development Mode
```powershell
npm run tauri dev
```
*(Or test in web browser preview: `npm run dev` and navigate to `http://localhost:1420`)*

### Step 4: Build Standalone Windows Executable
```powershell
npm run tauri build
```
The compiled binary will be located in:
`src-tauri/target/release/GannDigitalDraftingDesk.exe`
