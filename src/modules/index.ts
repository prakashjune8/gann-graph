/**
 * W.D. Gann Drafting Desk — Modular Sandbox Loader
 *
 * Imports and registers active sandbox modules into the central ModuleRegistry.
 * Future experimental modules are placed in src/modules/<module-name>/ and wired here.
 */

import { ModuleRegistry } from "../ModuleRegistry";
import { EquilibriumModule } from "./equilibrium/EquilibriumModule";
import { OctaveHarmonicsModule } from "./octave-harmonics/OctaveHarmonicsModule";

export function initializeSandboxModules(): void {
  // Register active feature modules
  ModuleRegistry.register(EquilibriumModule, true);
  ModuleRegistry.register(OctaveHarmonicsModule, true);
}

// Automatically initialize default sandbox modules
initializeSandboxModules();
