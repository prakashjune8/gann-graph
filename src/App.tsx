import React, { useState, useEffect } from "react";
import { GannCanvas } from "./components/GannCanvas";
import { DraftingToolbar } from "./components/DraftingToolbar";
import { CoordinateOverlay } from "./components/CoordinateOverlay";
import { WaterFlowViewport } from "./components/WaterFlowViewport";
import { VaultBackupModal } from "./components/VaultBackupModal";
import { MissingVaultModal } from "./components/MissingVaultModal";
import { getVaultStatus, VaultStatus } from "./utils/vaultBridge";
import { DataDisplayCoordinator } from "./modules/data-display";

export const App: React.FC = () => {
  const [showGannRay, setShowGannRay] = useState(true);
  const [isVaultModalOpen, setIsVaultModalOpen] = useState(false);
  const [missingVaultStatus, setMissingVaultStatus] = useState<VaultStatus | null>(null);

  // Startup Check & Initial Vault Market Series Ingestion
  useEffect(() => {
    let isMounted = true;
    const checkStartupVaultHealth = async () => {
      try {
        const status = await getVaultStatus();
        if (!isMounted) return;
        if (status.status === "MISSING_VAULT" || status.status === "MISSING_DB") {
          setMissingVaultStatus(status);
        } else {
          // Master Vault is healthy: Wire real vault data into graph immediately
          await DataDisplayCoordinator.initializeStartupData();
        }
      } catch (err) {
        console.warn("[App] Initial vault status probe:", err);
        // Fallback startup attempt
        await DataDisplayCoordinator.initializeStartupData();
      }
    };

    const handlePyWebViewReady = () => {
      if (isMounted) {
        console.info("[App] pywebviewready fired! Re-synchronizing native master vault series.");
        checkStartupVaultHealth();
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("pywebviewready", handlePyWebViewReady);
    }

    checkStartupVaultHealth();
    return () => {
      isMounted = false;
      if (typeof window !== "undefined") {
        window.removeEventListener("pywebviewready", handlePyWebViewReady);
      }
    };
  }, []);

  const handleVaultRestored = () => {
    // When a vault is restored, automatically coordinate display of the active vault series
    DataDisplayCoordinator.initializeStartupData();
  };

  return (
    <div
      style={{
        position: "relative",
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        backgroundColor: "#F7F6F0",
      }}
    >
      {/* Top Floating Drafting Toolbar */}
      <DraftingToolbar
        showGannRay={showGannRay}
        setShowGannRay={setShowGannRay}
        onOpenVaultBackup={() => setIsVaultModalOpen(true)}
      />

      {/* Primary High-Performance 1:1 Canvas Engine */}
      <GannCanvas
        showGannRay45={showGannRay}
      />

      {/* Water-Flow Viewport Stream Indicator */}
      <WaterFlowViewport />

      {/* Bottom Floating Live Coordinate HUD */}
      <CoordinateOverlay />

      {/* Vault Backup, Export & Recovery Modal */}
      <VaultBackupModal
        isOpen={isVaultModalOpen}
        onClose={() => setIsVaultModalOpen(false)}
        onVaultRestored={handleVaultRestored}
      />

      {/* Missing / Formatted Vault Startup Recovery Dialog */}
      {missingVaultStatus && (
        <MissingVaultModal
          status={missingVaultStatus}
          onResolved={() => {
            setMissingVaultStatus(null);
            handleVaultRestored();
          }}
          onDismiss={() => setMissingVaultStatus(null)}
        />
      )}
    </div>
  );
};

export default App;
