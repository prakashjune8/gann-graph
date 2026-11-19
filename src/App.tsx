import React, { useState, useEffect } from "react";
import { GannCanvas } from "./components/GannCanvas";
import { DraftingToolbar } from "./components/DraftingToolbar";
import { CoordinateOverlay } from "./components/CoordinateOverlay";
import { VaultBackupModal } from "./components/VaultBackupModal";
import { MissingVaultModal } from "./components/MissingVaultModal";
import { getVaultStatus, VaultStatus } from "./utils/vaultBridge";
import { useGridState } from "./store/useGridState";

export const App: React.FC = () => {
  const [showGannRay, setShowGannRay] = useState(true);
  const [isVaultModalOpen, setIsVaultModalOpen] = useState(false);
  const [missingVaultStatus, setMissingVaultStatus] = useState<VaultStatus | null>(null);

  // Startup Check: Missing or Formatted Vault Detection & Guided Recovery
  useEffect(() => {
    let isMounted = true;
    const checkStartupVaultHealth = async () => {
      try {
        const status = await getVaultStatus();
        if (!isMounted) return;
        if (status.status === "MISSING_VAULT" || status.status === "MISSING_DB") {
          setMissingVaultStatus(status);
        }
      } catch (err) {
        console.warn("[App] Initial vault status probe:", err);
      }
    };

    checkStartupVaultHealth();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleVaultRestored = () => {
    // If a restored vault is detected, we can reload or recalibrate state
    const candles = useGridState.getState().candles;
    if (!candles || candles.length === 0) {
      useGridState.getState().loadSampleDataset();
    }
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
