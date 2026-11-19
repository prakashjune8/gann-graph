import React, { useState } from "react";
import {
  VaultStatus,
  restoreVaultFromFile,
  restoreVaultFromFolder,
  initializeFreshVault,
} from "../utils/vaultBridge";

interface MissingVaultModalProps {
  status: VaultStatus;
  onResolved: () => void;
  onDismiss: () => void;
}

export const MissingVaultModal: React.FC<MissingVaultModalProps> = ({
  status,
  onResolved,
  onDismiss,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "info" | "success" | "error" | "warning";
    message: string;
  } | null>(null);

  const handleRestoreFile = async () => {
    setIsProcessing(true);
    setFeedback({ type: "info", message: "Opening file browser to select backup bundle (.zip or .duckdb)..." });
    try {
      const res = await restoreVaultFromFile();
      if (res.cancelled) {
        setFeedback({ type: "warning", message: "Restore cancelled: No file selected." });
      } else if (res.success) {
        setFeedback({
          type: "success",
          message: `✓ Success! Restored ${res.recordCount?.toLocaleString() || "market"} records (${res.dateSpan || ""}). Retrying data load...`,
        });
        setTimeout(() => {
          onResolved();
        }, 1500);
      } else {
        setFeedback({ type: "error", message: `Restore Failed: ${res.message}` });
      }
    } catch (e) {
      setFeedback({ type: "error", message: `Unexpected Error: ${String(e)}` });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRestoreFolder = async () => {
    setIsProcessing(true);
    setFeedback({ type: "info", message: "Opening folder browser to select external backup directory..." });
    try {
      const res = await restoreVaultFromFolder();
      if (res.cancelled) {
        setFeedback({ type: "warning", message: "Restore cancelled: No folder selected." });
      } else if (res.success) {
        setFeedback({
          type: "success",
          message: `✓ Success! Vault restored from folder with ${res.recordCount?.toLocaleString() || "market"} records. Retrying data load...`,
        });
        setTimeout(() => {
          onResolved();
        }, 1500);
      } else {
        setFeedback({ type: "error", message: `Restore Failed: ${res.message}` });
      }
    } catch (e) {
      setFeedback({ type: "error", message: `Unexpected Error: ${String(e)}` });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleInitializeFresh = async () => {
    setIsProcessing(true);
    setFeedback({ type: "info", message: "Bootstrapping fresh directory layout and clean database..." });
    try {
      const res = await initializeFreshVault();
      if (res.success) {
        setFeedback({
          type: "success",
          message: "✓ Clean Market Data Vault initialized at D:\\GannMarketVault. Launching studio...",
        });
        setTimeout(() => {
          onResolved();
        }, 1200);
      } else {
        setFeedback({ type: "error", message: `Initialization Failed: ${res.message}` });
      }
    } catch (e) {
      setFeedback({ type: "error", message: `Unexpected Error: ${String(e)}` });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        backgroundColor: "rgba(30, 42, 36, 0.75)",
        backdropFilter: "blur(5px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2000,
        fontFamily: "'Courier New', Courier, monospace",
      }}
    >
      <div
        style={{
          width: "92%",
          maxWidth: 640,
          backgroundColor: "#FDFCF7",
          border: "2px solid #E65100",
          borderRadius: 6,
          boxShadow: "0 16px 40px rgba(0, 0, 0, 0.35)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "14px 20px",
            backgroundColor: "#E65100",
            color: "#FFFFFF",
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <span style={{ fontSize: "20px" }}>⚠️</span>
          <div>
            <div style={{ fontWeight: "bold", fontSize: "14px", letterSpacing: "0.5px" }}>
              MARKET DATA VAULT NOT DETECTED
            </div>
            <div style={{ fontSize: "10px", opacity: 0.9 }}>
              Guided Disaster Recovery & Startup Safeguard
            </div>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: "18px 22px" }}>
          <div
            style={{
              backgroundColor: "#FFF8E1",
              border: "1px solid #FFE082",
              borderRadius: 4,
              padding: "12px 14px",
              marginBottom: 16,
              fontSize: "11px",
              color: "#5D4037",
              lineHeight: 1.5,
            }}
          >
            <strong>What happened?</strong>
            <div style={{ marginTop: 4 }}>
              The local market vault was not found at <code>{status.vaultPath || "D:\\GannMarketVault"}</code>.
              This typically occurs after formatting a hard drive, drive letter reassignment, or accidental folder removal.
            </div>
          </div>

          {feedback && (
            <div
              style={{
                backgroundColor:
                  feedback.type === "success"
                    ? "#E8F5E9"
                    : feedback.type === "warning"
                    ? "#FFF8E1"
                    : feedback.type === "error"
                    ? "#FFEBEE"
                    : "#E3F2FD",
                border: `1px solid ${
                  feedback.type === "success"
                    ? "#4CAF50"
                    : feedback.type === "warning"
                    ? "#FFB300"
                    : feedback.type === "error"
                    ? "#E53935"
                    : "#1E88E5"
                }`,
                borderRadius: 4,
                padding: "10px 12px",
                marginBottom: 16,
                fontSize: "11px",
                fontWeight: "bold",
                color: "#222",
              }}
            >
              {feedback.message}
            </div>
          )}

          <div style={{ fontSize: "12px", fontWeight: "bold", color: "#1E2A24", marginBottom: 10 }}>
            Choose an option to restore or start fresh:
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {/* Action 1: Restore from Folder */}
            <button
              onClick={handleRestoreFolder}
              disabled={isProcessing}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                padding: "12px 14px",
                backgroundColor: "#E8F5E9",
                border: "1.5px solid #2E7D32",
                borderRadius: 4,
                cursor: isProcessing ? "not-allowed" : "pointer",
                textAlign: "left",
                fontFamily: "inherit",
              }}
            >
              <div style={{ fontWeight: "bold", fontSize: "12px", color: "#1B5E20", display: "flex", alignItems: "center", gap: "6px" }}>
                <span>📂</span> Option A: Locate External Backup Folder (Pendrive / HDD)
              </div>
              <div style={{ fontSize: "10px", color: "#4E6E58", marginTop: 4 }}>
                Browse to an external drive (USB / External HDD) containing a previously exported vault directory tree.
              </div>
            </button>

            {/* Action 2: Restore from File */}
            <button
              onClick={handleRestoreFile}
              disabled={isProcessing}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                padding: "12px 14px",
                backgroundColor: "#E8F0FE",
                border: "1.5px solid #1967D2",
                borderRadius: 4,
                cursor: isProcessing ? "not-allowed" : "pointer",
                textAlign: "left",
                fontFamily: "inherit",
              }}
            >
              <div style={{ fontWeight: "bold", fontSize: "12px", color: "#0D47A1", display: "flex", alignItems: "center", gap: "6px" }}>
                <span>📦</span> Option B: Locate Backup .ZIP Bundle or .DuckDB File
              </div>
              <div style={{ fontSize: "10px", color: "#4A6E9E", marginTop: 4 }}>
                Select a compressed mail bundle (.zip) or raw database file (.duckdb) to unpack and verify.
              </div>
            </button>

            {/* Action 3: Fresh Init */}
            <button
              onClick={handleInitializeFresh}
              disabled={isProcessing}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                padding: "12px 14px",
                backgroundColor: "#FFFFFF",
                border: "1px solid #757575",
                borderRadius: 4,
                cursor: isProcessing ? "not-allowed" : "pointer",
                textAlign: "left",
                fontFamily: "inherit",
              }}
            >
              <div style={{ fontWeight: "bold", fontSize: "12px", color: "#424242", display: "flex", alignItems: "center", gap: "6px" }}>
                <span>🌱</span> Option C: Initialize Fresh Vault Structure
              </div>
              <div style={{ fontSize: "10px", color: "#757575", marginTop: 4 }}>
                Recreate standard drop folders and an empty master database at D:\GannMarketVault.
              </div>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "10px 20px",
            backgroundColor: "#F7F6F0",
            borderTop: "1px solid rgba(74, 120, 102, 0.25)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: "10px", color: "#888" }}>
            Drafting Studio will verify data automatically after restore.
          </span>
          <button
            onClick={onDismiss}
            disabled={isProcessing}
            style={{
              backgroundColor: "transparent",
              border: "none",
              color: "#666",
              fontSize: "11px",
              cursor: isProcessing ? "not-allowed" : "pointer",
              textDecoration: "underline",
            }}
          >
            Continue in Offline Sandbox Mode
          </button>
        </div>
      </div>
    </div>
  );
};
