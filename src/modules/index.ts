/**
 * W.D. Gann Drafting Desk — Modular Sandbox Loader
 *
 * Imports and registers active sandbox modules into the central ModuleRegistry.
 * Future experimental modules are placed in src/modules/<module-name>/ and wired here.
 */

import { ModuleRegistry } from "../ModuleRegistry";
import { OctaveHarmonicsModule } from "./octave-harmonics/OctaveHarmonicsModule";
import { SwingVisualizerModule } from "./autoscale-v2/SwingVisualizerModule";
import { GenesisVisualizerModule } from "./autoscale-v2/GenesisVisualizerModule";
import { ViewportScalerModule } from "./autoscale-v2/ViewportScalerModule";
import { DataDisplayModule } from "./data-display/DataDisplayModule";
export * as AutoScaleV2 from "./autoscale-v2";
export * as DataDisplay from "./data-display";

export function initializeSandboxModules(): void {
  // Register active feature modules
  ModuleRegistry.register(OctaveHarmonicsModule, true);
  ModuleRegistry.register(SwingVisualizerModule, true);
  ModuleRegistry.register(GenesisVisualizerModule, true);
  ModuleRegistry.register(ViewportScalerModule, true);
  ModuleRegistry.register(DataDisplayModule, true);
}

// Automatically initialize default sandbox modules
initializeSandboxModules();
