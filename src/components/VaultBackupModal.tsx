import React, { useState, useEffect } from "react";
import {
  VaultStatus,
  getVaultStatus,
  exportFullVault,
  exportMailBundle,
  restoreVaultFromFile,
  restoreVaultFromFolder,
  initializeFreshVault,
} from "../utils/vaultBridge";

interface VaultBackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVaultRestored?: () => void;
}

export const VaultBackupModal: React.FC<VaultBackupModalProps> = ({
  isOpen,
  onClose,
  onVaultRestored,
}) => {
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [actionNotice, setActionNotice] = useState<{
    type: "success" | "warning" | "error" | "info";
    text: string;
    details?: string;
  } | null>(null);

  const loadStatus = async () => {
    setIsLoading(true);
    try {
      const res = await getVaultStatus();
      setStatus(res);
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadStatus();
      setActionNotice(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleExportFull = async () => {
    setIsProcessing(true);
    setActionNotice({ type: "info", text: "Selecting destination drive/folder and exporting complete vault structure..." });
    try {
      const res = await exportFullVault();
      if (res.cancelled) {
        setActionNotice({ type: "warning", text: "Export cancelled by user." });
      } else if (res.success) {
        setActionNotice({
          type: "success",
          text: `Full Vault Export Complete (${res.formattedSize})`,
          details: `Copied ${res.filesCopied} files to: ${res.targetPath}`,
        });
        loadStatus();
      } else {
        setActionNotice({ type: "error", text: "Export Failed", details: res.message });
      }
    } catch (e) {
      setActionNotice({ type: "error", text: "Unexpected Error", details: String(e) });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExportMailBundle = async () => {
    setIsProcessing(true);
    setActionNotice({ type: "info", text: "Compressing database and building email package (.zip)..." });
    try {
      const res = await exportMailBundle();
      if (res.cancelled) {
        setActionNotice({ type: "warning", text: "Export cancelled by user." });
      } else if (res.success) {
        setActionNotice({
          type: res.exceedsEmailLimit ? "warning" : "success",
          text: res.exceedsEmailLimit ? "Mail Bundle Created (Exceeds 25 MB Limit)" : "Mail Bundle Ready (.zip)",
          details: `${res.message} -> Saved to: ${res.zipPath}`,
        });
        loadStatus();
      } else {
        setActionNotice({ type: "error", text: "Mail Bundle Creation Failed", details: res.message });
      }
    } catch (e) {
      setActionNotice({ type: "error", text: "Unexpected Error", details: String(e) });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRestoreFile = async () => {
    const confirm = window.confirm(
      "Restore Market Data Vault?\n\nThis will safely update your master database with the data inside your chosen backup file. Existing files will be safeguarded. Proceed?"
    );
    if (!confirm) return;

    setIsProcessing(true);
    setActionNotice({ type: "info", text: "Restoring vault from backup file..." });
    try {
      const res = await restoreVaultFromFile();
      if (res.cancelled) {
        setActionNotice({ type: "warning", text: "Restore cancelled by user." });
      } else if (res.success) {
        setActionNotice({
          type: "success",
          text: "Vault Restored & Verified Successfully!",
          details: res.message,
        });
        await loadStatus();
        if (onVaultRestored) onVaultRestored();
      } else {
        setActionNotice({ type: "error", text: "Restore Failed", details: res.message });
      }
    } catch (e) {
      setActionNotice({ type: "error", text: "Unexpected Error", details: String(e) });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRestoreFolder = async () => {
    const confirm = window.confirm(
      "Restore Market Data Vault from Folder?\n\nThis will copy the entire vault directory tree from your pendrive/HDD backup into D:\\GannMarketVault. Proceed?"
    );
    if (!confirm) return;

    setIsProcessing(true);
    setActionNotice({ type: "info", text: "Scanning backup folder and restoring vault tree..." });
    try {
      const res = await restoreVaultFromFolder();
      if (res.cancelled) {
        setActionNotice({ type: "warning", text: "Restore cancelled by user." });
      } else if (res.success) {
        setActionNotice({
          type: "success",
          text: "Vault Folder Restored Successfully!",
          details: res.message,
        });
        await loadStatus();
        if (onVaultRestored) onVaultRestored();
      } else {
        setActionNotice({ type: "error", text: "Restore Failed", details: res.message });
      }
    } catch (e) {
      setActionNotice({ type: "error", text: "Unexpected Error", details: String(e) });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFreshInit = async () => {
    const confirm = window.confirm(
      "Initialize Fresh Vault?\n\nThis will recreate all standard drop inboxes and an empty database at D:\\GannMarketVault. Proceed?"
    );
    if (!confirm) return;

    setIsProcessing(true);
    setActionNotice({ type: "info", text: "Initializing clean vault directory structure..." });
    try {
      const res = await initializeFreshVault();
      if (res.success) {
        setActionNotice({
          type: "success",
          text: "Fresh Vault Bootstrapped",
          details: res.message,
        });
        await loadStatus();
      } else {
        setActionNotice({ type: "error", text: "Initialization Failed", details: res.message });
      }
    } catch (e) {
      setActionNotice({ type: "error", text: "Unexpected Error", details: String(e) });
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
        backgroundColor: "rgba(30, 42, 36, 0.65)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        fontFamily: "'Courier New', Courier, monospace",
      }}
    >
      <div
        style={{
          width: "92%",
          maxWidth: 720,
          maxHeight: "92vh",
          backgroundColor: "#FDFCF7",
          border: "2px solid #2E7D32",
          borderRadius: 6,
          boxShadow: "0 12px 32px rgba(0, 0, 0, 0.25)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "12px 18px",
            backgroundColor: "#2E7D32",
            color: "#FFFFFF",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "16px" }}>🛡️</span>
            <div>
              <div style={{ fontWeight: "bold", fontSize: "13px", letterSpacing: "0.5px" }}>
                MARKET DATA VAULT — BACKUP & RECOVERY
              </div>
              <div style={{ fontSize: "10px", opacity: 0.9 }}>
                Institutional Storage Cloner, Mail Bundler & Disaster Recovery
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isProcessing}
            style={{
              backgroundColor: "transparent",
              border: "1px solid rgba(255, 255, 255, 0.4)",
              color: "#FFFFFF",
              fontSize: "12px",
              cursor: isProcessing ? "not-allowed" : "pointer",
              borderRadius: 3,
              padding: "2px 8px",
              fontWeight: "bold",
            }}
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: "16px 20px", overflowY: "auto", flex: 1 }}>
          {/* Status Card */}
          <div
            style={{
              backgroundColor: status?.isHealthy ? "#F1F8E9" : "#FFEBEE",
              border: `1px solid ${status?.isHealthy ? "#81C784" : "#E57373"}`,
              borderRadius: 4,
              padding: "12px 14px",
              marginBottom: 16,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span
                  style={{
                    display: "inline-block",
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    backgroundColor: status?.isHealthy ? "#2E7D32" : "#C62828",
                  }}
                />
                <span style={{ fontWeight: "bold", fontSize: "12px", color: status?.isHealthy ? "#1B5E20" : "#B71C1C" }}>
                  STATUS: {status?.status || "CHECKING..."}
                </span>
              </div>
              <button
                onClick={loadStatus}
                disabled={isLoading || isProcessing}
                style={{
                  backgroundColor: "transparent",
                  border: "none",
                  color: "#2E7D32",
                  fontSize: "11px",
                  cursor: "pointer",
                  textDecoration: "underline",
                }}
              >
                {isLoading ? "Checking..." : "🔄 Refresh Status"}
              </button>
            </div>

            <div style={{ fontSize: "11px", color: "#333", lineHeight: 1.6 }}>
              <div><strong>Primary Vault:</strong> {status?.vaultPath || "D:\\GannMarketVault"}</div>
              <div><strong>Master DB:</strong> {status?.dbPath || "gann_market_data.duckdb"} ({status?.fileSizeFormatted || "0 B"})</div>
              <div><strong>Market Records:</strong> {status ? `${status.recordCount.toLocaleString()} candles (${status.dateSpan})` : "Scanning..."}</div>
              {status?.lastBackupTime && <div><strong>Latest Snapshot:</strong> {status.lastBackupTime}</div>}
              {status?.vaultSizeFormatted && <div><strong>Total Vault Size:</strong> {status.vaultSizeFormatted} ({status.totalFiles || 0} files)</div>}
            </div>
          </div>

          {/* Action Notice Box */}
          {actionNotice && (
            <div
              style={{
                backgroundColor:
                  actionNotice.type === "success"
                    ? "#E8F5E9"
                    : actionNotice.type === "warning"
                    ? "#FFF8E1"
                    : actionNotice.type === "error"
                    ? "#FFEBEE"
                    : "#E3F2FD",
                border: `1px solid ${
                  actionNotice.type === "success"
                    ? "#4CAF50"
                    : actionNotice.type === "warning"
                    ? "#FFB300"
                    : actionNotice.type === "error"
                    ? "#E53935"
                    : "#1E88E5"
                }`,
                borderRadius: 4,
                padding: "10px 12px",
                marginBottom: 16,
                fontSize: "11px",
              }}
            >
              <div style={{ fontWeight: "bold", color: "#222" }}>
                {actionNotice.type === "info" && "⏳ "}
                {actionNotice.type === "success" && "✓ "}
                {actionNotice.type === "warning" && "⚠️ "}
                {actionNotice.type === "error" && "✕ "}
                {actionNotice.text}
              </div>
              {actionNotice.details && (
                <div style={{ marginTop: 4, color: "#444", wordBreak: "break-all" }}>
                  {actionNotice.details}
                </div>
              )}
            </div>
          )}

          {/* Action Cards Grid */}
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {/* Card 1: Full Vault Export */}
            <div
              style={{
                border: "1px solid rgba(74, 120, 102, 0.35)",
                borderRadius: 4,
                padding: "12px 14px",
                backgroundColor: "#FFFFFF",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontWeight: "bold", fontSize: "12px", color: "#1E2A24", display: "flex", alignItems: "center", gap: "6px" }}>
                    <span>💾</span> Export Full Vault (Pendrive / External Drive)
                  </div>
                  <div style={{ fontSize: "10px", color: "#666", marginTop: 4, lineHeight: 1.4, maxWidth: 440 }}>
                    Clones the complete vault folder structure (Inboxes, Processed Archive, Master DB & Backups) into a timestamped directory on your USB pendrive or external HDD.
                  </div>
                </div>
                <button
                  onClick={handleExportFull}
                  disabled={isProcessing}
                  style={{
                    backgroundColor: isProcessing ? "#EEE" : "#E8F5E9",
                    border: "1px solid #2E7D32",
                    color: isProcessing ? "#999" : "#1B5E20",
                    fontWeight: "bold",
                    padding: "6px 12px",
                    borderRadius: 3,
                    fontSize: "11px",
                    cursor: isProcessing ? "not-allowed" : "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {isProcessing ? "Working..." : "Export to Drive"}
                </button>
              </div>
            </div>

            {/* Card 2: Email Compressed Bundle */}
            <div
              style={{
                border: "1px solid rgba(74, 120, 102, 0.35)",
                borderRadius: 4,
                padding: "12px 14px",
                backgroundColor: "#FFFFFF",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontWeight: "bold", fontSize: "12px", color: "#1E2A24", display: "flex", alignItems: "center", gap: "6px" }}>
                    <span>📧</span> Export Compressed Mail Bundle (.zip)
                  </div>
                  <div style={{ fontSize: "10px", color: "#666", marginTop: 4, lineHeight: 1.4, maxWidth: 440 }}>
                    Compresses the Master DuckDB database and verification manifest into an ultra-compact .zip archive. Alerts you if file size exceeds the standard 25 MB email limit.
                  </div>
                </div>
                <button
                  onClick={handleExportMailBundle}
                  disabled={isProcessing}
                  style={{
                    backgroundColor: isProcessing ? "#EEE" : "#E8F0FE",
                    border: "1px solid #1967D2",
                    color: isProcessing ? "#999" : "#155724",
                    fontWeight: "bold",
                    padding: "6px 12px",
                    borderRadius: 3,
                    fontSize: "11px",
                    cursor: isProcessing ? "not-allowed" : "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {isProcessing ? "Working..." : "Create .ZIP Bundle"}
                </button>
              </div>
            </div>

            {/* Card 3: Restore Vault */}
            <div
              style={{
                border: "1px solid rgba(74, 120, 102, 0.35)",
                borderRadius: 4,
                padding: "12px 14px",
                backgroundColor: "#FFFFFF",
              }}
            >
              <div style={{ fontWeight: "bold", fontSize: "12px", color: "#1E2A24", display: "flex", alignItems: "center", gap: "6px", marginBottom: 4 }}>
                <span>🔄</span> Restore from External Backup
              </div>
              <div style={{ fontSize: "10px", color: "#666", marginBottom: 10, lineHeight: 1.4 }}>
                Restore your master vault from an external pendrive folder, a mail bundle (.zip), or a raw .duckdb file. Active connections are safely closed and existing files safeguarded.
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button
                  onClick={handleRestoreFile}
                  disabled={isProcessing}
                  style={{
                    backgroundColor: isProcessing ? "#EEE" : "#FFF3E0",
                    border: "1px solid #F57C00",
                    color: isProcessing ? "#999" : "#E65100",
                    fontWeight: "bold",
                    padding: "6px 10px",
                    borderRadius: 3,
                    fontSize: "10px",
                    cursor: isProcessing ? "not-allowed" : "pointer",
                  }}
                >
                  📦 Select .ZIP Bundle or .DuckDB File
                </button>
                <button
                  onClick={handleRestoreFolder}
                  disabled={isProcessing}
                  style={{
                    backgroundColor: isProcessing ? "#EEE" : "#FFF3E0",
                    border: "1px solid #F57C00",
                    color: isProcessing ? "#999" : "#E65100",
                    fontWeight: "bold",
                    padding: "6px 10px",
                    borderRadius: 3,
                    fontSize: "10px",
                    cursor: isProcessing ? "not-allowed" : "pointer",
                  }}
                >
                  📂 Select Backup Folder (Pendrive / HDD)
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "10px 18px",
            backgroundColor: "#F7F6F0",
            borderTop: "1px solid rgba(74, 120, 102, 0.25)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <button
            onClick={handleFreshInit}
            disabled={isProcessing}
            style={{
              backgroundColor: "transparent",
              border: "none",
              color: "#C62828",
              fontSize: "10px",
              cursor: isProcessing ? "not-allowed" : "pointer",
              textDecoration: "underline",
            }}
            title="Bootstrap clean folder layout and blank database"
          >
            ⚠️ Initialize Fresh Vault Structure
          </button>

          <button
            onClick={onClose}
            disabled={isProcessing}
            style={{
              backgroundColor: "#2E7D32",
              color: "#FFFFFF",
              border: "none",
              padding: "6px 16px",
              borderRadius: 3,
              fontSize: "11px",
              fontWeight: "bold",
              cursor: isProcessing ? "not-allowed" : "pointer",
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
