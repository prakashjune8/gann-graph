/**
 * W.D. Gann Drafting Desk — Modular Sandbox Loader
 *
 * Imports and registers active sandbox modules into the central ModuleRegistry.
 * Future experimental modules are placed in src/modules/<module-name>/ and wired here.
 */

import { ModuleRegistry } from "../ModuleRegistry";
import { EquilibriumModule } from "./equilibrium/EquilibriumModule";
import { OctaveHarmonicsModule } from "./octave-harmonics/OctaveHarmonicsModule";
import { SwingVisualizerModule } from "./autoscale-v2/SwingVisualizerModule";
import { GenesisVisualizerModule } from "./autoscale-v2/GenesisVisualizerModule";
export * as AutoScaleV2 from "./autoscale-v2";

export function initializeSandboxModules(): void {
  // Register active feature modules
  ModuleRegistry.register(EquilibriumModule, true);
  ModuleRegistry.register(OctaveHarmonicsModule, true);
  ModuleRegistry.register(SwingVisualizerModule, true);
  ModuleRegistry.register(GenesisVisualizerModule, true);
}

// Automatically initialize default sandbox modules
initializeSandboxModules();
