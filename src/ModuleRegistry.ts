/**
 * W.D. Gann Drafting Desk — Module Registry
 *
 * Decoupled Plugin Architecture: Manages registration, lifecycle (init/destroy),
 * and dynamic tool integration of experimental or specialized modules.
 */

import { useState, useEffect } from "react";
import { IGridBridge, GridBridge } from "./core-bridge/GridBridge";

export interface ModuleToolButton {
  id: string;
  moduleId: string;
  label: string;
  icon?: string;
  title?: string;
  variant?: "primary" | "secondary" | "toggle" | "danger" | "neutral";
  isActive?: (bridge: IGridBridge) => boolean;
  onClick: (bridge: IGridBridge) => void;
}

export interface GannModule {
  id: string;
  name: string;
  version: string;
  description: string;
  category?: "analysis" | "geometry" | "cycles" | "experimental";
  tools?: Omit<ModuleToolButton, "moduleId">[];
  initialize?: (bridge: IGridBridge) => void;
  destroy?: (bridge: IGridBridge) => void;
}

class RegistryEngine {
  private modules: Map<string, GannModule> = new Map();
  private activeModuleIds: Set<string> = new Set();
  private listeners: Set<() => void> = new Set();

  /**
   * Registers a module. By default, auto-enables it.
   */
  register(module: GannModule, autoEnable = true): void {
    if (this.modules.has(module.id)) {
      console.warn(`[ModuleRegistry] Module "${module.id}" already registered. Updating.`);
    }
    this.modules.set(module.id, module);
    if (autoEnable) {
      this.enable(module.id);
    } else {
      this.notify();
    }
  }

  /**
   * Unregisters a module and cleans up its resources.
   */
  unregister(moduleId: string): void {
    if (this.activeModuleIds.has(moduleId)) {
      this.disable(moduleId);
    }
    this.modules.delete(moduleId);
    this.notify();
  }

  /**
   * Activates a registered module and triggers its initialization lifecycle.
   */
  enable(moduleId: string): void {
    const mod = this.modules.get(moduleId);
    if (!mod) {
      console.error(`[ModuleRegistry] Cannot enable unregistered module: "${moduleId}"`);
      return;
    }
    if (this.activeModuleIds.has(moduleId)) return;

    this.activeModuleIds.add(moduleId);
    try {
      mod.initialize?.(GridBridge);
    } catch (err) {
      console.error(`[ModuleRegistry] Error initializing module "${moduleId}":`, err);
    }
    this.notify();
  }

  /**
   * Deactivates a module and triggers its destruction lifecycle.
   */
  disable(moduleId: string): void {
    const mod = this.modules.get(moduleId);
    if (!mod || !this.activeModuleIds.has(moduleId)) return;

    this.activeModuleIds.delete(moduleId);
    try {
      mod.destroy?.(GridBridge);
    } catch (err) {
      console.error(`[ModuleRegistry] Error destroying module "${moduleId}":`, err);
    }
    this.notify();
  }

  /**
   * Checks whether a module is currently active.
   */
  isModuleActive(moduleId: string): boolean {
    return this.activeModuleIds.has(moduleId);
  }

  /**
   * Returns all currently active modules.
   */
  getActiveModules(): GannModule[] {
    return Array.from(this.activeModuleIds)
      .map((id) => this.modules.get(id)!)
      .filter(Boolean);
  }

  /**
   * Returns all registered modules (active and inactive).
   */
  getAllModules(): GannModule[] {
    return Array.from(this.modules.values());
  }

  /**
   * Collects all active tool buttons exposed by currently active modules.
   */
  getActiveTools(): ModuleToolButton[] {
    const activeTools: ModuleToolButton[] = [];
    for (const mod of this.getActiveModules()) {
      if (mod.tools && mod.tools.length > 0) {
        for (const t of mod.tools) {
          activeTools.push({
            ...t,
            moduleId: mod.id,
          });
        }
      }
    }
    return activeTools;
  }

  /**
   * Subscribes to registry changes (module additions, state toggles).
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    this.listeners.forEach((listener) => {
      try {
        listener();
      } catch (err) {
        console.error("[ModuleRegistry] Error in registry listener:", err);
      }
    });
  }
}

export const ModuleRegistry = new RegistryEngine();

/**
 * React Hook: Subscribes to active module tools and re-renders when modules are loaded or toggled.
 */
export function useActiveModuleTools(): ModuleToolButton[] {
  const [tools, setTools] = useState<ModuleToolButton[]>(() =>
    ModuleRegistry.getActiveTools()
  );

  useEffect(() => {
    const update = () => setTools(ModuleRegistry.getActiveTools());
    return ModuleRegistry.subscribe(update);
  }, []);

  return tools;
}

/**
 * React Hook: Subscribes to active module list.
 */
export function useActiveModules(): GannModule[] {
  const [modules, setModules] = useState<GannModule[]>(() =>
    ModuleRegistry.getActiveModules()
  );

  useEffect(() => {
    const update = () => setModules(ModuleRegistry.getActiveModules());
    return ModuleRegistry.subscribe(update);
  }, []);

  return modules;
}
