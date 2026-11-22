/**
 * W.D. Gann SutraScale Vibration Module
 * Module: src/modules/sutrascale-vibration/SutraScaleVibrationModule.ts
 *
 * Integrates SutraScale Vibration Verification into the central decoupled ModuleRegistry.
 */

import { GannModule } from "../../ModuleRegistry";
import { IGridBridge } from "../../core-bridge/GridBridge";

let isModuleActive = false;

export function isSutraScaleActive(): boolean {
  return isModuleActive;
}
let openModalCallback: (() => void) | null = null;

export function registerSutraScaleModalTrigger(cb: () => void): () => void {
  openModalCallback = cb;
  return () => {
    openModalCallback = null;
  };
}

export function triggerSutraScaleModal(): void {
  if (openModalCallback) {
    openModalCallback();
  }
}

export const SutraScaleVibrationModule: GannModule = {
  id: "sutrascale-vibration",
  name: "SutraScale Vibration Verifier",
  version: "1.0.0",
  description: "Institutional 1x1 ray wick-collision & Geometric R² vibration verification for Indian markets.",
  category: "geometry",
  tools: [
    {
      id: "trigger-sutrascale-verifier",
      label: "⚡ SutraScale",
      title: "Open SutraScale Vibration Verifier (0.5% Wick Collision & Geometric R² Harmonic Sweep)",
      variant: "primary",
      onClick: (_bridge: IGridBridge) => {
        triggerSutraScaleModal();
      },
    },
  ],
  initialize: () => {
    isModuleActive = true;
  },
  destroy: () => {
    isModuleActive = false;
  },
};
