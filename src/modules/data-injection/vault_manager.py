#!/usr/bin/env python3
"""
W.D. Gann Drafting Desk — Vault Backup, Mail Bundle & Guided Recovery Engine
Module: src/modules/data-injection/vault_manager.py

Provides institutional vault management routines:
1. Status Check: Detects missing, formatted, or corrupted vault storage.
2. Full Vault Export: Copies entire directory layout to USB pendrives or external HDDs.
3. Compressed Mail Bundle: Compresses database & manifest with 25MB attachment limit telemetry.
4. Guided Recovery: Restores from folder, .zip bundle, or .duckdb file with integrity verification.
5. Fresh Initialization: Bootstraps clean vault layout and empty DuckDB schema.
"""

import os
import sys
import shutil
import zipfile
import json
import time
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, Optional, List, Tuple

try:
    import duckdb
except ImportError:
    duckdb = None

logger = logging.getLogger("vault_manager")
if not logger.handlers:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)

# Default Local Vault Directory Paths
DEFAULT_VAULT_ROOT = Path("D:/GannMarketVault")
DEFAULT_VAULT_DB_DIR = DEFAULT_VAULT_ROOT / "04_VAULT_DB"
DEFAULT_DUCKDB_PATH = DEFAULT_VAULT_DB_DIR / "gann_market_data.duckdb"
DEFAULT_DROP_INBOX = DEFAULT_VAULT_ROOT / "01_DROP_INBOX"
DEFAULT_ARCHIVE_DIR = DEFAULT_VAULT_ROOT / "02_PROCESSED_ARCHIVE"
DEFAULT_FAILED_DIR = DEFAULT_VAULT_ROOT / "03_FAILED_OR_SKIPPED"
DEFAULT_BACKUP_DIR = DEFAULT_VAULT_ROOT / "05_BACKUPS"

REQUIRED_SUBFOLDERS = [
    "01_DROP_INBOX/nifty_index",
    "01_DROP_INBOX/nse_bhavcopy",
    "01_DROP_INBOX/mcx_bhavcopy",
    "01_DROP_INBOX/zerodha_exports_or_api",
    "02_PROCESSED_ARCHIVE/nifty_index",
    "02_PROCESSED_ARCHIVE/nse_bhavcopy",
    "02_PROCESSED_ARCHIVE/mcx_bhavcopy",
    "03_FAILED_OR_SKIPPED",
    "04_VAULT_DB",
    "05_BACKUPS",
]

EMAIL_ATTACHMENT_LIMIT_BYTES = 25 * 1024 * 1024  # 25 Megabytes standard limit


def format_bytes(num_bytes: int) -> str:
    """Formats raw byte count into human-readable string (KB, MB, GB)."""
    if num_bytes < 1024:
        return f"{num_bytes} B"
    elif num_bytes < 1024 * 1024:
        return f"{num_bytes / 1024:.1f} KB"
    elif num_bytes < 1024 * 1024 * 1024:
        return f"{num_bytes / (1024 * 1024):.2f} MB"
    else:
        return f"{num_bytes / (1024 * 1024 * 1024):.2f} GB"


def get_dir_size_and_count(dir_path: Path) -> Tuple[int, int]:
    """Calculates total bytes and file count within a directory tree."""
    total_bytes = 0
    file_count = 0
    if not dir_path.exists():
        return 0, 0
    for root, _, files in os.walk(dir_path):
        for f in files:
            fp = Path(root) / f
            try:
                total_bytes += fp.stat().st_size
                file_count += 1
            except (OSError, PermissionError):
                pass
    return total_bytes, file_count


def check_vault_status(vault_root: Path = DEFAULT_VAULT_ROOT) -> Dict[str, Any]:
    """
    Evaluates whether the primary market vault exists, whether the DuckDB
    database is healthy and readable, and collects telemetry.
    """
    root = Path(vault_root)
    db_file = root / "04_VAULT_DB" / "gann_market_data.duckdb"

    if not root.exists():
        return {
            "status": "MISSING_VAULT",
            "isHealthy": False,
            "vaultExists": False,
            "dbExists": False,
            "vaultPath": str(root),
            "dbPath": str(db_file),
            "recordCount": 0,
            "dateSpan": "N/A",
            "fileSizeFormatted": "0 B",
            "vaultSizeFormatted": "0 B",
            "lastBackupTime": "Never",
            "message": f"Market Data Vault folder not found at {root}. Drive may be unmounted or formatted.",
        }

    if not db_file.exists():
        return {
            "status": "MISSING_DB",
            "isHealthy": False,
            "vaultExists": True,
            "dbExists": False,
            "vaultPath": str(root),
            "dbPath": str(db_file),
            "recordCount": 0,
            "dateSpan": "N/A",
            "fileSizeFormatted": "0 B",
            "vaultSizeFormatted": format_bytes(get_dir_size_and_count(root)[0]),
            "lastBackupTime": "Never",
            "message": f"Vault directory exists, but master DuckDB database not found at {db_file}.",
        }

    # Inspect database integrity and record count
    record_count = 0
    date_span = "N/A"
    db_size = db_file.stat().st_size
    vault_size, file_count = get_dir_size_and_count(root)

    # Check latest backup
    backup_dir = root / "05_BACKUPS"
    last_backup_time = "Never"
    if backup_dir.exists():
        backups = sorted(backup_dir.glob("*.duckdb"), key=lambda p: p.stat().st_mtime, reverse=True)
        if backups:
            mtime = datetime.fromtimestamp(backups[0].stat().st_mtime, tz=timezone.utc)
            last_backup_time = mtime.strftime("%Y-%m-%d %H:%M:%S UTC")

    if duckdb is None:
        return {
            "status": "HEALTHY",
            "isHealthy": True,
            "vaultExists": True,
            "dbExists": True,
            "vaultPath": str(root),
            "dbPath": str(db_file),
            "recordCount": -1,
            "dateSpan": "DuckDB driver not loaded",
            "fileSizeFormatted": format_bytes(db_size),
            "vaultSizeFormatted": format_bytes(vault_size),
            "lastBackupTime": last_backup_time,
            "message": "Vault and database detected. DuckDB package not available for query.",
        }

    try:
        conn = duckdb.connect(str(db_file), read_only=True)
        # Check table
        tables = conn.execute("SHOW TABLES").fetchall()
        table_names = [t[0].lower() for t in tables]
        if "market_data" in table_names:
            row = conn.execute(
                "SELECT count(*), min(timestamp), max(timestamp) FROM market_data"
            ).fetchone()
            if row and row[0] is not None:
                record_count = row[0]
                earliest = str(row[1])[:10] if row[1] else "?"
                latest = str(row[2])[:10] if row[2] else "?"
                date_span = f"{earliest} to {latest}"
        conn.close()
    except Exception as e:
        logger.warning(f"Error querying DuckDB at {db_file}: {e}")
        return {
            "status": "CORRUPTED_OR_LOCKED",
            "isHealthy": False,
            "vaultExists": True,
            "dbExists": True,
            "vaultPath": str(root),
            "dbPath": str(db_file),
            "recordCount": 0,
            "dateSpan": "Error",
            "fileSizeFormatted": format_bytes(db_size),
            "vaultSizeFormatted": format_bytes(vault_size),
            "lastBackupTime": last_backup_time,
            "message": f"Database file exists but could not be read: {e}",
        }

    status_str = "HEALTHY" if record_count > 0 else "EMPTY_DB"
    return {
        "status": status_str,
        "isHealthy": True,
        "vaultExists": True,
        "dbExists": True,
        "vaultPath": str(root),
        "dbPath": str(db_file),
        "recordCount": record_count,
        "dateSpan": date_span,
        "fileSizeFormatted": format_bytes(db_size),
        "fileSizeBytes": db_size,
        "vaultSizeFormatted": format_bytes(vault_size),
        "totalFiles": file_count,
        "lastBackupTime": last_backup_time,
        "message": f"Vault verified with {record_count:,} market records ({date_span}).",
    }


def create_vault_structure(vault_root: Path = DEFAULT_VAULT_ROOT) -> None:
    """Ensures all standard subdirectories and README.txt exist in the vault."""
    root = Path(vault_root)
    root.mkdir(parents=True, exist_ok=True)
    for sub in REQUIRED_SUBFOLDERS:
        (root / sub).mkdir(parents=True, exist_ok=True)

    readme_path = root / "README.txt"
    if not readme_path.exists():
        readme_content = (
            "===============================================================================\n"
            "                 W.D. GANN DRAFTING DESK — DEDICATED MARKET VAULT\n"
            "===============================================================================\n\n"
            "DIRECTORY STRUCTURE:\n"
            "  - 01_DROP_INBOX/           Drop new files here for automated batch ingestion:\n"
            "      ├── nifty_index/       Place Nifty 50 historical CSV or TXT files here.\n"
            "      ├── nse_bhavcopy/      Place full NSE Bhavcopy CSV files here.\n"
            "      ├── mcx_bhavcopy/      Place MCX Bhavcopy CSV files here (Bullion filtered).\n"
            "      └── zerodha_exports/   Place manual Kite CSV exports here.\n"
            "  - 02_PROCESSED_ARCHIVE/    Files moved here automatically after clean ingestion.\n"
            "  - 03_FAILED_OR_SKIPPED/    Corrupted or non-conforming files isolated here.\n"
            "  - 04_VAULT_DB/             Master DuckDB database (gann_market_data.duckdb).\n"
            "  - 05_BACKUPS/              Automated timestamped snapshots.\n\n"
            "BACKUP & RECOVERY:\n"
            "  Use the 'Vault Backup & Recovery' menu in the Graph App to export to USB\n"
            "  or create an email zip bundle at any time.\n"
            "===============================================================================\n"
        )
        readme_path.write_text(readme_content, encoding="utf-8")


def export_full_vault(
    target_parent_dir: str,
    vault_root: Path = DEFAULT_VAULT_ROOT
) -> Dict[str, Any]:
    """
    Copies the complete vault directory structure to an external drive (pendrive/HDD)
    under a timestamped backup directory: GannMarketVault_Backup_YYYYMMDD_HHMMSS.
    """
    root = Path(vault_root)
    if not root.exists():
        return {
            "success": False,
            "message": f"Cannot export vault: Source vault root {root} does not exist."
        }

    dest_parent = Path(target_parent_dir)
    if not dest_parent.exists():
        try:
            dest_parent.mkdir(parents=True, exist_ok=True)
        except Exception as e:
            return {
                "success": False,
                "message": f"Target drive/directory {target_parent_dir} is not accessible: {e}"
            }

    timestamp_str = datetime.now().strftime("%Y%m%d_%H%M%S")
    dest_vault = dest_parent / f"GannMarketVault_Backup_{timestamp_str}"

    try:
        dest_vault.mkdir(parents=True, exist_ok=True)
    except Exception as e:
        return {
            "success": False,
            "message": f"Failed to create target folder {dest_vault}: {e}"
        }

    logger.info(f"Exporting complete vault from {root} to {dest_vault}...")

    files_copied = 0
    total_bytes = 0

    # Folders to copy
    for item in root.iterdir():
        dest_item = dest_vault / item.name
        try:
            if item.is_dir():
                shutil.copytree(item, dest_item, dirs_exist_ok=True)
                bytes_sub, count_sub = get_dir_size_and_count(dest_item)
                files_copied += count_sub
                total_bytes += bytes_sub
            elif item.is_file():
                shutil.copy2(item, dest_item)
                files_copied += 1
                total_bytes += item.stat().st_size
        except Exception as e:
            logger.error(f"Error copying {item} to {dest_item}: {e}")

    # Write export manifest
    manifest = {
        "exportType": "FULL_VAULT_EXTERNAL_BACKUP",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "sourceVault": str(root),
        "destinationPath": str(dest_vault),
        "filesCopied": files_copied,
        "totalBytes": total_bytes,
        "formattedSize": format_bytes(total_bytes),
    }
    try:
        manifest_path = dest_vault / "BACKUP_MANIFEST.json"
        manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    except Exception:
        pass

    return {
        "success": True,
        "targetPath": str(dest_vault),
        "filesCopied": files_copied,
        "totalBytes": total_bytes,
        "formattedSize": format_bytes(total_bytes),
        "message": (
            f"Successfully exported entire vault ({files_copied} files, "
            f"{format_bytes(total_bytes)}) to: {dest_vault}"
        ),
    }


def export_mail_bundle(
    target_dir: str,
    vault_root: Path = DEFAULT_VAULT_ROOT
) -> Dict[str, Any]:
    """
    Creates a compressed ZIP archive containing the DuckDB database,
    README.txt, and a telemetry manifest suitable for emailing.
    Includes a file-size warning if it exceeds typical 25 MB email limits.
    """
    root = Path(vault_root)
    db_file = root / "04_VAULT_DB" / "gann_market_data.duckdb"

    if not db_file.exists():
        return {
            "success": False,
            "message": f"Database file not found at {db_file}. Cannot create mail bundle."
        }

    dest_folder = Path(target_dir)
    if not dest_folder.exists():
        try:
            dest_folder.mkdir(parents=True, exist_ok=True)
        except Exception as e:
            return {
                "success": False,
                "message": f"Target folder {dest_folder} cannot be accessed: {e}"
            }

    timestamp_str = datetime.now().strftime("%Y%m%d_%H%M%S")
    zip_path = dest_folder / f"GannVault_MailBundle_{timestamp_str}.zip"

    # Query record count for manifest
    status = check_vault_status(vault_root)
    manifest = {
        "bundleType": "GANN_VAULT_EMAIL_BUNDLE",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "recordCount": status.get("recordCount", 0),
        "dateSpan": status.get("dateSpan", "N/A"),
        "rawDbSizeBytes": status.get("fileSizeBytes", db_file.stat().st_size),
        "instructions": (
            "To restore this bundle, launch the W.D. Gann Digital Drafting Desk, "
            "open 'Vault Backup & Recovery', and choose 'Restore from External Backup', "
            "selecting this .zip file."
        )
    }

    try:
        with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
            # Add DuckDB database
            zf.write(db_file, arcname="04_VAULT_DB/gann_market_data.duckdb")

            # Check if WAL file exists and add it
            wal_file = root / "04_VAULT_DB" / "gann_market_data.duckdb.wal"
            if wal_file.exists() and wal_file.stat().st_size > 0:
                zf.write(wal_file, arcname="04_VAULT_DB/gann_market_data.duckdb.wal")

            # Add README if present
            readme_file = root / "README.txt"
            if readme_file.exists():
                zf.write(readme_file, arcname="README.txt")

            # Add manifest
            zf.writestr("VAULT_MANIFEST.json", json.dumps(manifest, indent=2))
    except Exception as e:
        return {
            "success": False,
            "message": f"Failed while writing compressed zip archive: {e}"
        }

    zip_size = zip_path.stat().st_size
    formatted_size = format_bytes(zip_size)
    exceeds_email_limit = zip_size > EMAIL_ATTACHMENT_LIMIT_BYTES

    if exceeds_email_limit:
        size_mb = zip_size / (1024 * 1024)
        warning_msg = (
            f"Created bundle ({formatted_size}), but it exceeds standard 25 MB email "
            f"attachment limits ({size_mb:.1f} MB). We recommend uploading to Google Drive/Dropbox "
            f"or using 'Export Full Vault' directly to a USB drive."
        )
    else:
        warning_msg = (
            f"Mail bundle created successfully ({formatted_size})! "
            f"It is well within the 25 MB email attachment limit and ready to attach."
        )

    return {
        "success": True,
        "zipPath": str(zip_path),
        "sizeBytes": zip_size,
        "formattedSize": formatted_size,
        "exceedsEmailLimit": exceeds_email_limit,
        "recordCount": status.get("recordCount", 0),
        "dateSpan": status.get("dateSpan", "N/A"),
        "message": warning_msg,
    }


def restore_vault(
    source_path: str,
    vault_root: Path = DEFAULT_VAULT_ROOT
) -> Dict[str, Any]:
    """
    Restores the vault from an external backup.
    Supports:
      1. A directory (mirrored vault or backup folder containing 04_VAULT_DB or .duckdb).
      2. A .zip archive (such as a mail bundle or zipped vault).
      3. A single .duckdb file directly.
    Verifies database integrity after extraction.
    """
    src = Path(source_path)
    root = Path(vault_root)

    if not src.exists():
        return {
            "success": False,
            "message": f"Selected backup source does not exist: {src}"
        }

    create_vault_structure(root)
    db_dest = root / "04_VAULT_DB" / "gann_market_data.duckdb"

    # Temporary backup of existing DB if present
    existing_db = db_dest if db_dest.exists() else None
    temp_safety_backup = None
    if existing_db:
        temp_safety_backup = root / "05_BACKUPS" / f"safety_pre_restore_{int(time.time())}.duckdb"
        try:
            shutil.copy2(existing_db, temp_safety_backup)
        except Exception:
            pass

    restored_db_found = False

    try:
        # Case A: Source is a .zip file (Mail Bundle or compressed archive)
        if src.is_file() and src.suffix.lower() == ".zip":
            logger.info(f"Restoring vault from zip bundle: {src}")
            with zipfile.ZipFile(src, "r") as zf:
                for member in zf.namelist():
                    # Look for database file
                    if member.endswith("gann_market_data.duckdb"):
                        zf.extract(member, root)
                        extracted = root / member
                        if extracted != db_dest:
                            shutil.move(extracted, db_dest)
                        restored_db_found = True
                    elif member.startswith("01_DROP_INBOX") or member.startswith("02_PROCESSED_ARCHIVE"):
                        zf.extract(member, root)
                    elif member == "README.txt":
                        zf.extract(member, root)

        # Case B: Source is a single .duckdb file
        elif src.is_file() and (src.suffix.lower() == ".duckdb" or src.name.endswith(".db")):
            logger.info(f"Restoring master vault directly from database file: {src}")
            shutil.copy2(src, db_dest)
            restored_db_found = True

        # Case C: Source is a directory (Folder backup from Pendrive/HDD)
        elif src.is_dir():
            logger.info(f"Restoring vault from directory tree: {src}")
            # Look for 04_VAULT_DB or gann_market_data.duckdb within src
            nested_db = src / "04_VAULT_DB" / "gann_market_data.duckdb"
            direct_db = src / "gann_market_data.duckdb"
            any_duckdbs = list(src.rglob("*.duckdb"))

            target_db_source = None
            if nested_db.exists():
                target_db_source = nested_db
            elif direct_db.exists():
                target_db_source = direct_db
            elif any_duckdbs:
                target_db_source = any_duckdbs[0]

            if target_db_source and target_db_source.exists():
                shutil.copy2(target_db_source, db_dest)
                restored_db_found = True

            # Also copy archives and inboxes if present
            for sub in ["01_DROP_INBOX", "02_PROCESSED_ARCHIVE", "03_FAILED_OR_SKIPPED"]:
                sub_src = src / sub
                if sub_src.exists():
                    shutil.copytree(sub_src, root / sub, dirs_exist_ok=True)

        if not restored_db_found or not db_dest.exists():
            # Revert to safety backup if restore failed
            if temp_safety_backup and temp_safety_backup.exists():
                shutil.copy2(temp_safety_backup, db_dest)
            return {
                "success": False,
                "message": (
                    f"Could not locate a valid 'gann_market_data.duckdb' file inside "
                    f"the selected source ({src.name})."
                )
            }

        # Verify restored database
        verification = check_vault_status(vault_root)
        if not verification.get("isHealthy", False):
            if temp_safety_backup and temp_safety_backup.exists():
                shutil.copy2(temp_safety_backup, db_dest)
            return {
                "success": False,
                "message": f"Restored database could not be verified: {verification.get('message')}"
            }

        return {
            "success": True,
            "vaultPath": str(root),
            "recordCount": verification.get("recordCount", 0),
            "dateSpan": verification.get("dateSpan", "N/A"),
            "fileSizeFormatted": verification.get("fileSizeFormatted", "0 B"),
            "message": (
                f"Vault restored and verified successfully! Loaded {verification.get('recordCount', 0):,} "
                f"market records spanning {verification.get('dateSpan', 'N/A')}."
            )
        }

    except Exception as e:
        logger.error(f"Failed to restore vault from {src}: {e}")
        if temp_safety_backup and temp_safety_backup.exists():
            try:
                shutil.copy2(temp_safety_backup, db_dest)
            except Exception:
                pass
        return {
            "success": False,
            "message": f"Unexpected error while restoring vault: {e}"
        }


def initialize_fresh_vault(vault_root: Path = DEFAULT_VAULT_ROOT) -> Dict[str, Any]:
    """
    Initializes a clean, standard vault directory layout and bootstraps
    an empty DuckDB database with the market_data schema.
    """
    root = Path(vault_root)
    try:
        create_vault_structure(root)
        db_file = root / "04_VAULT_DB" / "gann_market_data.duckdb"

        if duckdb:
            conn = duckdb.connect(str(db_file))
            conn.execute("""
                CREATE TABLE IF NOT EXISTS market_data (
                    symbol VARCHAR NOT NULL,
                    exchange VARCHAR NOT NULL,
                    instrument_token BIGINT NOT NULL,
                    timestamp TIMESTAMP NOT NULL,
                    open DOUBLE NOT NULL,
                    high DOUBLE NOT NULL,
                    low DOUBLE NOT NULL,
                    close DOUBLE NOT NULL,
                    volume BIGINT DEFAULT 0,
                    oi BIGINT DEFAULT 0,
                    asset_class VARCHAR DEFAULT 'INDEX',
                    segment VARCHAR DEFAULT 'INDICES',
                    PRIMARY KEY (instrument_token, timestamp)
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS instruments_metadata (
                    instrument_token BIGINT PRIMARY KEY,
                    exchange_token VARCHAR,
                    tradingsymbol VARCHAR NOT NULL,
                    name VARCHAR,
                    exchange VARCHAR NOT NULL,
                    segment VARCHAR,
                    instrument_type VARCHAR,
                    lot_size INTEGER DEFAULT 1,
                    tick_size DOUBLE DEFAULT 0.05,
                    last_synced_at TIMESTAMP,
                    is_active BOOLEAN DEFAULT TRUE
                )
            """)
            conn.close()

        status = check_vault_status(root)
        return {
            "success": True,
            "vaultPath": str(root),
            "dbPath": str(db_file),
            "message": f"Fresh Market Data Vault initialized successfully at {root}."
        }
    except Exception as e:
        return {
            "success": False,
            "message": f"Failed to initialize fresh vault: {e}"
        }


def query_vault_candles(
    symbol: str = "NIFTY 50",
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    limit: Optional[int] = None,
    vault_root: Path = DEFAULT_VAULT_ROOT
) -> Dict[str, Any]:
    """
    Queries historical candlestick rows from the DuckDB master vault
    sorted ascending by timestamp. Handles zero-OHL normalization and
    returns standard JSON-serializable list of candle dictionaries.
    """
    root = Path(vault_root)
    db_file = root / "04_VAULT_DB" / "gann_market_data.duckdb"

    if not db_file.exists():
        return {
            "success": False,
            "candles": [],
            "totalCount": 0,
            "message": f"Vault database not found at {db_file}"
        }

    if duckdb is None:
        return {
            "success": False,
            "candles": [],
            "totalCount": 0,
            "message": "DuckDB driver not loaded in Python environment"
        }

    try:
        conn = duckdb.connect(str(db_file), read_only=True)
        query = ["SELECT timestamp, open, high, low, close, volume FROM market_data WHERE symbol = ?"]
        params = [symbol]

        if start_date:
            query.append("AND timestamp >= ?")
            params.append(start_date)
        if end_date:
            query.append("AND timestamp <= ?")
            params.append(end_date)

        query.append("ORDER BY timestamp ASC")

        if limit and limit > 0:
            query.append("LIMIT ?")
            params.append(limit)

        sql = " ".join(query)
        rows = conn.execute(sql, params).fetchall()
        conn.close()

        candles = []
        for r in rows:
            ts_dt = r[0]
            ts_str = ts_dt.strftime("%Y-%m-%d") if hasattr(ts_dt, "strftime") else str(ts_dt)[:10]
            o, h, l, c, v = float(r[1]), float(r[2]), float(r[3]), float(r[4]), int(r[5] or 0)

            # Zero-OHL normalization
            if h <= 0 or l <= 0:
                o, h, l = c, c, c

            candles.append({
                "timestamp": ts_str,
                "open": o,
                "high": h,
                "low": l,
                "close": c,
                "volume": v
            })

        return {
            "success": True,
            "symbol": symbol,
            "candles": candles,
            "totalCount": len(candles),
            "startDate": candles[0]["timestamp"] if candles else "N/A",
            "endDate": candles[-1]["timestamp"] if candles else "N/A",
            "message": f"Retrieved {len(candles)} bars for {symbol}."
        }
    except Exception as e:
        logger.error(f"Error querying vault candles: {e}")
        return {
            "success": False,
            "candles": [],
            "totalCount": 0,
            "message": f"Query failed: {e}"
        }


if __name__ == "__main__":
    status = check_vault_status()
    print(json.dumps(status, indent=2))
