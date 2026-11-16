# W.D. Gann Digital Drafting Desk (Phase 1)
### Standalone High-Performance K&E 8x8 Geometric Trading Analysis System

Built with **Tauri (Rust)**, **React 18 (TypeScript)**, **Vite**, **HTML5 Canvas API**, and **Zustand**.

---

## 1. Architectural Philosophy: The Digital Drafting Desk
Unlike standard web charting libraries (TradingView, Highcharts) that continuously stretch and squash the X and Y axes depending on browser window dimensions, **this application functions strictly as a digital drafting table**.

- **Permanent 1:1 Aspect Ratio Guarantee**:
  - In W.D. Gann analysis, time and price are married through geometric vibration.
  - A 45° angle ($1\times1$) must remain an exact $45.000^\circ$ physical diagonal across square grid intersections.
  - Responsive stretching of either axis is strictly prohibited at the engine level.
- **Keuffel & Esser (K&E) 8x8 Grid Math**:
  - `baseUnit = 12px` (represents 1 minor square / $\frac{1}{8}\text{th}$ inch).
  - `majorUnit = 96px` (represents 1 major square / $1\text{ inch} = 8 \times 12\text{px}$).
  - `paperBackground = #F7F6F0` (vintage warm drafting parchment).
  - `majorGridLine = rgba(74, 120, 102, 0.60)` (heavy faded drafting green ink).
  - `minorGridLine = rgba(74, 120, 102, 0.20)` (crisp sub-pixel minor drafting rule).
- **Infinite Cartesian Panning & Isotropic Zoom**:
  - Zooming scales both X and Y simultaneously by the exact same multiplier ($S_x = S_y = \text{zoom}$).
  - Smooth cursor-centered magnification invariant.
- **Data Plotting via Strict Right-Angle Swing Steps**:
  - Zero diagonal OHLC candlestick compromises.
  - Price progresses along horizontal time nodes and makes clean right-angle vertical steps to new swing highs and swing lows.

---

## 2. Directory Structure

```
d:\ANTIGRAVITY PROJECT FOLDER\GANN GRAPH/
├── package.json              # NPM configuration with React, Zustand, Vite, and Tauri CLI
├── tsconfig.json             # TypeScript strict compiler config
├── tsconfig.node.json        # Vite bundler TS config
├── vite.config.ts            # Vite tailored for Tauri (port 1420, strictPort, rust watcher bypass)
├── index.html                # App shell
├── src/
│   ├── main.tsx              # React mounting root
│   ├── App.tsx               # Drafting desk studio layout
│   ├── index.css             # Base styles
│   ├── components/
│   │   ├── GannCanvas.tsx    # High-DPI 1:1 K&E 8x8 canvas rendering engine
│   │   ├── DraftingToolbar.tsx # Fixed 1:1 zoom controls, 1x1 45° ray, origin reset
│   │   └── CoordinateOverlay.tsx # Real-time Cartesian coordinate & inch HUD
│   ├── store/
│   │   └── useGridState.ts   # Zustand high-frequency camera & grid state store
│   ├── types/
│   │   └── gann.ts           # Type definitions for grid coordinates and swings
│   └── utils/
│       ├── gannMath.ts       # Square of 9 derivations and right-angle swing steps
│       └── brokerCsvParser.ts # Zerodha Kite & Alice Blue CSV importers
└── src-tauri/
    ├── Cargo.toml            # Rust dependencies (tauri v2, tauri-plugin-sql with SQLite)
    ├── tauri.conf.json       # Tauri window configuration & desktop bundle settings
    └── src/
        └── main.rs           # Native Rust process entry point with SQLite plugin
```

---

## 3. Tauri Setup & Running Instructions

### Step 1: Install System Prerequisites
1. **Node.js** (v18+ recommended): [https://nodejs.org](https://nodejs.org)
2. **Rust & Cargo**:
   - On Windows, install `rustup-init.exe` from [https://rustup.rs](https://rustup.rs).
   - Ensure the `C++ build tools` are installed via Visual Studio Installer (Desktop development with C++).
3. **Tauri CLI**:
   - Bundled locally in `package.json` (`@tauri-apps/cli`).

### Step 2: Install Node Dependencies
Open PowerShell or your terminal in this workspace (`d:\ANTIGRAVITY PROJECT FOLDER\GANN GRAPH`) and run:
```powershell
npm install
```

### Step 3: Run the Application in Development Mode
To launch the native desktop application with hot-reloading:
```powershell
npm run tauri dev
```
*(Alternatively, to run the Vite web preview in a standard browser while testing canvas algorithms: `npm run dev` and navigate to `http://localhost:1420`)*

### Step 4: Build Native Standalone Executable
To compile an optimized, standalone Windows `.msi` or `.exe`:
```powershell
npm run tauri build
```
The compiled binary will be located in `src-tauri/target/release/GannDigitalDraftingDesk.exe`.

---

## 4. SQLite Broker Data Integration (Zerodha & Alice Blue)
In Phase 2, `tauri-plugin-sql` will directly ingest local CSV exports into an embedded SQLite database (`gann_market_data.db`), bypassing cloud APIs and rendering swing steps with zero latency.
