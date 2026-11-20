/**
 * W.D. Gann Drafting Desk — Vault Bridge & Recovery Client
 * Module: src/utils/vaultBridge.ts
 *
 * Interfaces with the native Windows PyWebView backend (`window.pywebview.api`)
 * to provide non-technical, guided vault backup, mail bundle, and recovery workflows.
 * In browser-only environments, provides graceful simulated fallbacks.
 */

export interface VaultStatus {
  status: "HEALTHY" | "MISSING_VAULT" | "MISSING_DB" | "CORRUPTED_OR_LOCKED" | "EMPTY_DB" | "ERROR";
  isHealthy: boolean;
  vaultExists: boolean;
  dbExists: boolean;
  vaultPath: string;
  dbPath: string;
  recordCount: number;
  dateSpan: string;
  fileSizeFormatted: string;
  fileSizeBytes?: number;
  vaultSizeFormatted?: string;
  totalFiles?: number;
  lastBackupTime?: string;
  message: string;
}

export interface VaultActionResult {
  success: boolean;
  cancelled?: boolean;
  targetPath?: string;
  zipPath?: string;
  vaultPath?: string;
  filesCopied?: number;
  totalBytes?: number;
  formattedSize?: string;
  exceedsEmailLimit?: boolean;
  recordCount?: number;
  dateSpan?: string;
  message: string;
}

// Window interface extension for PyWebView API
declare global {
  interface Window {
    pywebview?: {
      api: {
        check_vault_status: () => Promise<VaultStatus>;
        select_folder: (prompt?: string) => Promise<string | null>;
        select_file: (prompt?: string) => Promise<string | null>;
        export_full_vault: (targetDir?: string | null) => Promise<VaultActionResult>;
        export_mail_bundle: (targetDir?: string | null) => Promise<VaultActionResult>;
        restore_vault: (sourcePath?: string | null) => Promise<VaultActionResult>;
        restore_vault_from_folder: (folderPath?: string | null) => Promise<VaultActionResult>;
        initialize_fresh_vault: () => Promise<VaultActionResult>;
        query_vault_candles?: (
          symbol?: string,
          start_date?: string | null,
          end_date?: string | null,
          limit?: number | null
        ) => Promise<any>;
        list_vault_series?: () => Promise<any>;
        check_vault_update?: (
          symbol?: string,
          current_count?: number,
          current_latest_ts?: string | null
        ) => Promise<any>;
        process_drop_inbox?: () => Promise<any>;
        get_series_version?: (symbol?: string) => Promise<any>;
      };
    };
  }
}

function hasNativeApi(): boolean {
  return typeof window !== "undefined" && !!window.pywebview?.api?.check_vault_status;
}

/**
 * Asynchronously waits for PyWebView native bridge to become ready (up to timeoutMs).
 */
export async function waitForNativeVaultBridge(timeoutMs = 2500): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (hasNativeApi()) return true;

  return new Promise((resolve) => {
    let resolved = false;

    const onReady = () => {
      if (!resolved) {
        resolved = true;
        window.removeEventListener("pywebviewready", onReady);
        resolve(true);
      }
    };

    window.addEventListener("pywebviewready", onReady);

    const interval = setInterval(() => {
      if (hasNativeApi()) {
        if (!resolved) {
          resolved = true;
          clearInterval(interval);
          window.removeEventListener("pywebviewready", onReady);
          resolve(true);
        }
      }
    }, 35);

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        clearInterval(interval);
        window.removeEventListener("pywebviewready", onReady);
        resolve(hasNativeApi());
      }
    }, timeoutMs);
  });
}

/**
 * Checks the health, location, and record count of the local Market Data Vault.
 */
export async function getVaultStatus(): Promise<VaultStatus> {
  if (!hasNativeApi()) {
    await waitForNativeVaultBridge(2500);
  }

  if (hasNativeApi()) {
    try {
      return await window.pywebview!.api.check_vault_status();
    } catch (err) {
      console.error("[VaultBridge] Error checking status from native backend:", err);
      return {
        status: "ERROR",
        isHealthy: false,
        vaultExists: false,
        dbExists: false,
        vaultPath: "D:\\GannMarketVault",
        dbPath: "D:\\GannMarketVault\\04_VAULT_DB\\gann_market_data.duckdb",
        recordCount: 0,
        dateSpan: "N/A",
        fileSizeFormatted: "0 B",
        message: `Failed to query native vault engine: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  // Fallback for web browser / Vite dev server mode
  const localHealthy = localStorage.getItem("gann_vault_status") !== "missing";
  return {
    status: localHealthy ? "HEALTHY" : "MISSING_VAULT",
    isHealthy: localHealthy,
    vaultExists: localHealthy,
    dbExists: localHealthy,
    vaultPath: "D:\\GannMarketVault",
    dbPath: "D:\\GannMarketVault\\04_VAULT_DB\\gann_market_data.duckdb",
    recordCount: localHealthy ? 8844 : 0,
    dateSpan: localHealthy ? "1990-07-03 to 2026-11-18" : "N/A",
    fileSizeFormatted: localHealthy ? "2.26 MB" : "0 B",
    vaultSizeFormatted: localHealthy ? "5.00 MB" : "0 B",
    totalFiles: localHealthy ? 40 : 0,
    lastBackupTime: "Recent",
    message: localHealthy
      ? "Vault active in Web Browser Mode."
      : "Vault folder missing or unmounted.",
  };
}

/**
 * Clones the full vault layout to an external USB pendrive or HDD.
 */
export async function exportFullVault(targetDir?: string): Promise<VaultActionResult> {
  if (hasNativeApi()) {
    try {
      return await window.pywebview!.api.export_full_vault(targetDir || null);
    } catch (err) {
      return {
        success: false,
        message: `Native export failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  return {
    success: true,
    targetPath: "E:\\GannMarketVault_Backup_Demo",
    filesCopied: 40,
    formattedSize: "5.00 MB",
    message: "[Web Fallback] Vault export simulated successfully (40 files copied).",
  };
}

/**
 * Exports a compressed mail bundle (.zip) with 25 MB email limit warning.
 */
export async function exportMailBundle(targetDir?: string): Promise<VaultActionResult> {
  if (hasNativeApi()) {
    try {
      return await window.pywebview!.api.export_mail_bundle(targetDir || null);
    } catch (err) {
      return {
        success: false,
        message: `Native mail bundle export failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  return {
    success: true,
    zipPath: "C:\\Users\\User\\Desktop\\GannVault_MailBundle_Demo.zip",
    formattedSize: "345.6 KB",
    exceedsEmailLimit: false,
    recordCount: 8844,
    dateSpan: "1990-07-03 to 2026-11-18",
    message: "[Web Fallback] Mail bundle created successfully (345.6 KB). Ready for email attachment.",
  };
}

/**
 * Restores vault from a selected file (.zip bundle or .duckdb database).
 */
export async function restoreVaultFromFile(sourcePath?: string): Promise<VaultActionResult> {
  if (hasNativeApi()) {
    try {
      return await window.pywebview!.api.restore_vault(sourcePath || null);
    } catch (err) {
      return {
        success: false,
        message: `Native restore failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  localStorage.setItem("gann_vault_status", "healthy");
  return {
    success: true,
    vaultPath: "D:\\GannMarketVault",
    recordCount: 8844,
    dateSpan: "1990-07-03 to 2026-11-18",
    message: "[Web Fallback] Vault restored and verified successfully with 8,844 records.",
  };
}

/**
 * Restores vault from a selected folder (e.g., on a pendrive or external HDD).
 */
export async function restoreVaultFromFolder(folderPath?: string): Promise<VaultActionResult> {
  if (hasNativeApi()) {
    try {
      return await window.pywebview!.api.restore_vault_from_folder(folderPath || null);
    } catch (err) {
      return {
        success: false,
        message: `Native restore from folder failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  localStorage.setItem("gann_vault_status", "healthy");
  return {
    success: true,
    vaultPath: "D:\\GannMarketVault",
    recordCount: 8844,
    dateSpan: "1990-07-03 to 2026-11-18",
    message: "[Web Fallback] Vault restored from external folder and verified with 8,844 records.",
  };
}

/**
 * Bootstraps a fresh empty vault directory and database schema.
 */
export async function initializeFreshVault(): Promise<VaultActionResult> {
  if (hasNativeApi()) {
    try {
      return await window.pywebview!.api.initialize_fresh_vault();
    } catch (err) {
      return {
        success: false,
        message: `Native initialization failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  localStorage.setItem("gann_vault_status", "healthy");
  return {
    success: true,
    vaultPath: "D:\\GannMarketVault",
    message: "[Web Fallback] Fresh Market Data Vault initialized successfully at D:\\GannMarketVault.",
  };
}
