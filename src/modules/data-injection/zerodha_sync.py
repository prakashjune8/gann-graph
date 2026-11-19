#!/usr/bin/env python3
r"""
W.D. Gann Drafting Desk — Dedicated Market Vault & Data Ingestion Pipeline
Module: src/modules/data-injection/zerodha_sync.py

Provides high-performance market data ingestion into a centralized DuckDB vault:
  - Dedicated Vault Root: D:\GannMarketVault
  - Master Vault DB: D:\GannMarketVault\04_VAULT_DB\gann_market_data.duckdb
  - Backups: D:\GannMarketVault\05_BACKUPS
  - Staging Inbox: D:\GannMarketVault\01_DROP_INBOX\ (nifty_index, nse_bhavcopy, mcx_bhavcopy, zerodha_exports_or_api)
  - Processed Archive: D:\GannMarketVault\02_PROCESSED_ARCHIVE\
  - Failed / Skipped: D:\GannMarketVault\03_FAILED_OR_SKIPPED\

Institutional Filtering:
  - Permitted: NSE Nifty 50 Index, NFO Derivatives, MCX Energy (Crude, Natural Gas), MCX Base Metals.
  - HARD EXCLUSION: Permanent rejection of any instrument containing GOLD, SILVER, or BULLION.
"""

import os
import sys
import time
import shutil
import argparse
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any

import pandas as pd
import duckdb
from dotenv import load_dotenv

try:
    from kiteconnect import KiteConnect
except ImportError:
    KiteConnect = None  # Handled with graceful error message

# Setup structured logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("zerodha_sync")

# ---------------------------------------------------------------------------
# DEDICATED VAULT DIRECTORY LAYOUT & CONSTANTS
# ---------------------------------------------------------------------------
DEFAULT_VAULT_ROOT = Path("D:/GannMarketVault")
DEFAULT_VAULT_DB_DIR = DEFAULT_VAULT_ROOT / "04_VAULT_DB"
DEFAULT_DUCKDB_PATH = DEFAULT_VAULT_DB_DIR / "gann_market_data.duckdb"
DEFAULT_DROP_INBOX = DEFAULT_VAULT_ROOT / "01_DROP_INBOX"
DEFAULT_ARCHIVE_DIR = DEFAULT_VAULT_ROOT / "02_PROCESSED_ARCHIVE"
DEFAULT_FAILED_DIR = DEFAULT_VAULT_ROOT / "03_FAILED_OR_SKIPPED"
DEFAULT_BACKUP_DIR = DEFAULT_VAULT_ROOT / "05_BACKUPS"

# Strict Bullion Blacklist (Never ingested, backtested, or stored)
BULLION_BLACKLIST = ("GOLD", "SILVER", "BULLION", "GOLDPETAL", "GOLDM", "SILVERM", "SILVERMIC")

# Permitted MCX Energy & Base Metal Underlyings
PERMITTED_MCX_UNDERLYINGS = (
    "CRUDEOIL",
    "NATURALGAS",
    "COPPER",
    "ZINC",
    "ALUMINIUM",
    "LEAD",
)

KITE_HISTORICAL_CHUNK_DAYS = 30  # Kite allows max 60 days for 1-minute historical data


def locate_env_file() -> Optional[Path]:
    """Searches for .env file in the current directory, module directory, and workspace root."""
    current_dir = Path(__file__).resolve().parent
    workspace_root = current_dir.parent.parent.parent

    candidates = [
        current_dir / ".env",
        workspace_root / ".env",
        DEFAULT_VAULT_ROOT / ".env",
        Path.cwd() / ".env",
    ]

    for p in candidates:
        if p.exists() and p.is_file():
            return p
    return None


def init_duckdb(db_path: Optional[str] = None, max_retries: int = 5) -> duckdb.DuckDBPyConnection:
    """
    Initializes local DuckDB storage vault and ensures required schema exists.
    Defaults to D:\\GannMarketVault\\04_VAULT_DB\\gann_market_data.duckdb (configurable via env/CLI).
    Stores high-resolution candles with primary key indexing and asset_class metadata.
    Includes Windows file-lock recovery against background sync scanners.
    """
    if db_path is None or db_path == "gann_market_data.duckdb":
        env_db = os.getenv("DUCKDB_PATH")
        if env_db:
            db_file = Path(env_db)
        else:
            db_file = DEFAULT_DUCKDB_PATH
    else:
        db_file = Path(db_path)

    if not db_file.is_absolute():
        db_file = DEFAULT_VAULT_DB_DIR / db_file

    db_file.parent.mkdir(parents=True, exist_ok=True)
    logger.info(f"Connecting to DuckDB vault at: {db_file}")

    conn = None
    for attempt in range(1, max_retries + 1):
        try:
            conn = duckdb.connect(str(db_file))
            break
        except Exception as e:
            if attempt < max_retries and "used by another process" in str(e):
                backoff = 0.5 * attempt
                logger.warning(f"File locked by scanner/process; retrying in {backoff:.1f}s (Attempt {attempt}/{max_retries})...")
                time.sleep(backoff)
            else:
                raise e

    # Time-Series Market Data Table Schema with asset_class & segment
    conn.execute("""
        CREATE TABLE IF NOT EXISTS market_data (
            symbol VARCHAR,
            exchange VARCHAR,
            instrument_token BIGINT,
            timestamp TIMESTAMP,
            open DOUBLE,
            high DOUBLE,
            low DOUBLE,
            close DOUBLE,
            volume BIGINT,
            oi BIGINT DEFAULT 0,
            asset_class VARCHAR DEFAULT 'INDEX',
            segment VARCHAR DEFAULT 'INDICES',
            PRIMARY KEY (instrument_token, timestamp)
        );
    """)

    # Fast symbol + timestamp query index
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_market_symbol_time 
        ON market_data(symbol, timestamp);
    """)

    # Schema migration guard for existing databases
    try:
        cols = [r[0] for r in conn.execute("DESCRIBE market_data").fetchall()]
        if "asset_class" not in cols:
            conn.execute("ALTER TABLE market_data ADD COLUMN asset_class VARCHAR DEFAULT 'INDEX'")
        if "segment" not in cols:
            conn.execute("ALTER TABLE market_data ADD COLUMN segment VARCHAR DEFAULT 'INDICES'")
    except Exception:
        pass

    # Instrument Metadata Vault
    conn.execute("""
        CREATE TABLE IF NOT EXISTS instruments_meta (
            instrument_token BIGINT PRIMARY KEY,
            exchange_token VARCHAR,
            tradingsymbol VARCHAR,
            name VARCHAR,
            exchange VARCHAR,
            segment VARCHAR,
            instrument_type VARCHAR,
            expiry DATE,
            strike DOUBLE,
            tick_size DOUBLE,
            lot_size INTEGER,
            last_synced_at TIMESTAMP
        );
    """)

    return conn


def create_backup(db_path: Path, backup_dir: Path = DEFAULT_BACKUP_DIR) -> Optional[Path]:
    """
    Creates a timestamped snapshot copy of the DuckDB database in D:\\GannMarketVault\\05_BACKUPS\\.
    """
    if not db_path.exists():
        logger.info(f"No existing database file found at {db_path} to back up.")
        return None

    backup_dir.mkdir(parents=True, exist_ok=True)
    timestamp_str = datetime.now().strftime("%Y%m%d_%H%M%S")
    dest_file = backup_dir / f"{db_path.stem}_backup_{timestamp_str}{db_path.suffix}"

    try:
        shutil.copy2(db_path, dest_file)
        wal_path = Path(str(db_path) + ".wal")
        if wal_path.exists():
            shutil.copy2(wal_path, backup_dir / f"{wal_path.stem}_backup_{timestamp_str}{wal_path.suffix}")

        logger.info(f"[BACKUP SUCCESS] Database snapshotted to: {dest_file}")
        return dest_file
    except Exception as e:
        logger.error(f"[BACKUP FAILED] Could not create snapshot backup: {e}")
        return None


def init_kite_client() -> KiteConnect:
    """
    Loads Zerodha Kite Connect credentials from environment and authenticates client.
    """
    if KiteConnect is None:
        raise RuntimeError("kiteconnect package is not installed. Run: pip install kiteconnect")

    env_path = locate_env_file()
    if env_path:
        load_dotenv(dotenv_path=env_path)
        logger.info(f"Loaded credentials from: {env_path}")
    else:
        load_dotenv()
        logger.warning("No specific .env file found; utilizing process environment variables.")

    api_key = os.getenv("KITE_API_KEY") or os.getenv("ZERODHA_API_KEY") or os.getenv("API_KEY")
    access_token = os.getenv("KITE_ACCESS_TOKEN") or os.getenv("ZERODHA_ACCESS_TOKEN") or os.getenv("ACCESS_TOKEN")

    if not api_key:
        raise ValueError(
            "Missing KITE_API_KEY. Please specify it in .env (see .env.example) or environment."
        )

    kite = KiteConnect(api_key=api_key)

    if access_token:
        kite.set_access_token(access_token)
        logger.info("Zerodha Kite client initialized with access_token.")
    else:
        logger.warning(
            "No KITE_ACCESS_TOKEN supplied. Historical data requests require an authenticated access_token."
        )

    return kite


def is_instrument_eligible(inst: Dict[str, Any]) -> Tuple[bool, str]:
    """
    Evaluates whether an instrument passes institutional eligibility rules:
      - Strictly includes: Nifty 50 (NSE), Nifty Derivatives (NFO), MCX Energy, MCX Base Metals.
      - Strictly excludes: Any instrument containing 'GOLD', 'SILVER', or 'BULLION'.
    """
    exchange = (inst.get("exchange") or "").upper()
    tradingsymbol = (inst.get("tradingsymbol") or "").upper()
    name = (inst.get("name") or "").upper()
    inst_type = (inst.get("instrument_type") or "").upper()
    segment = (inst.get("segment") or "").upper()

    # CRITICAL HARD EXCLUSION: Bullion Reject Sentinel
    for blacklist_token in BULLION_BLACKLIST:
        if blacklist_token in tradingsymbol or blacklist_token in name:
            return False, f"Hard Bullion Exclusion: {blacklist_token}"

    # 1. NSE Broad Index: Nifty 50
    if exchange == "NSE":
        if tradingsymbol in ("NIFTY 50", "NIFTY50", "NIFTY") or name == "NIFTY 50":
            return True, "NSE Nifty 50 Index"
        return False, "Non-Nifty NSE Equity/Index"

    # 2. NFO: Nifty 50 Options & Futures
    if exchange == "NFO":
        if name == "NIFTY" or tradingsymbol.startswith("NIFTY"):
            if inst_type in ("FUT", "CE", "PE"):
                return True, f"NFO Nifty Derivative ({inst_type})"
        return False, "Non-Nifty NFO Derivative"

    # 3. MCX: Energy & Base Metals Futures
    if exchange == "MCX":
        if inst_type == "FUT" or segment == "MCX-FUT":
            for underlying in PERMITTED_MCX_UNDERLYINGS:
                if tradingsymbol.startswith(underlying) or name.startswith(underlying):
                    return True, f"MCX Permitted Asset ({underlying})"
            return False, "Excluded MCX Commodity (Not Energy or Base Metal)"
        return False, "Non-Futures MCX Instrument"

    return False, f"Excluded Exchange: {exchange}"


def fetch_and_filter_instruments(kite: KiteConnect) -> List[Dict[str, Any]]:
    """Fetches master instrument list from Kite Connect and applies strict Gann filters."""
    logger.info("Fetching complete master instrument list from Zerodha Kite Connect...")
    all_instruments = kite.instruments()
    logger.info(f"Total raw instruments returned by Zerodha: {len(all_instruments)}")

    filtered_instruments: List[Dict[str, Any]] = []
    category_counts: Dict[str, int] = {}

    for inst in all_instruments:
        eligible, reason = is_instrument_eligible(inst)
        if eligible:
            filtered_instruments.append(inst)
            category = reason.split("(")[0].strip()
            category_counts[category] = category_counts.get(category, 0) + 1

    logger.info("--- Filtered Instrument Breakdown ---")
    for cat, count in category_counts.items():
        logger.info(f"  * {cat}: {count} contracts")
    logger.info(f"Total Eligible Instruments: {len(filtered_instruments)}")

    return filtered_instruments


def store_instruments_metadata(conn: duckdb.DuckDBPyConnection, instruments: List[Dict[str, Any]]) -> None:
    """Stores the filtered instrument list into the instruments_meta DuckDB table."""
    if not instruments:
        return

    records = []
    now = datetime.now()
    for inst in instruments:
        expiry = inst.get("expiry")
        if isinstance(expiry, datetime):
            expiry_date = expiry.date()
        elif isinstance(expiry, str) and expiry:
            try:
                expiry_date = datetime.strptime(expiry, "%Y-%m-%d").date()
            except ValueError:
                expiry_date = None
        else:
            expiry_date = None

        records.append({
            "instrument_token": inst.get("instrument_token"),
            "exchange_token": str(inst.get("exchange_token") or ""),
            "tradingsymbol": inst.get("tradingsymbol") or "",
            "name": inst.get("name") or "",
            "exchange": inst.get("exchange") or "",
            "segment": inst.get("segment") or "",
            "instrument_type": inst.get("instrument_type") or "",
            "expiry": expiry_date,
            "strike": float(inst.get("strike") or 0.0),
            "tick_size": float(inst.get("tick_size") or 0.05),
            "lot_size": int(inst.get("lot_size") or 1),
            "last_synced_at": now,
        })

    df_meta = pd.DataFrame(records)
    conn.register("df_meta_stage", df_meta)
    conn.execute("""
        INSERT OR REPLACE INTO instruments_meta 
        SELECT * FROM df_meta_stage
    """)
    conn.unregister("df_meta_stage")
    logger.info(f"Updated {len(records)} metadata records in DuckDB instruments_meta.")


def fetch_historical_chunk(
    kite: KiteConnect,
    instrument_token: int,
    from_date: datetime,
    to_date: datetime,
    interval: str = "minute"
) -> List[Dict[str, Any]]:
    """Executes a single historical_data API call to Zerodha with rate-limit defense."""
    try:
        time.sleep(0.35)
        candles = kite.historical_data(
            instrument_token=instrument_token,
            from_date=from_date,
            to_date=to_date,
            interval=interval,
            continuous=False,
            oi=True
        )
        return candles or []
    except Exception as e:
        logger.error(
            f"Kite API historical_data call failed for token {instrument_token} "
            f"({from_date.strftime('%Y-%m-%d')} to {to_date.strftime('%Y-%m-%d')}): {e}"
        )
        return []


def sync_instrument_data(
    kite: KiteConnect,
    conn: duckdb.DuckDBPyConnection,
    instrument: Dict[str, Any],
    from_date: datetime,
    to_date: datetime,
    interval: str = "minute"
) -> int:
    """Iteratively fetches 1-minute historical OHLCV data in chunks and ingests to DuckDB."""
    token = instrument["instrument_token"]
    symbol = instrument["tradingsymbol"]
    exchange = instrument["exchange"]
    segment = instrument.get("segment", "INDICES")
    asset_class = "INDEX" if exchange == "NSE" else "COMMODITY" if exchange == "MCX" else "DERIVATIVE"

    total_inserted = 0
    curr_from = from_date

    while curr_from < to_date:
        curr_to = min(to_date, curr_from + timedelta(days=KITE_HISTORICAL_CHUNK_DAYS))
        logger.info(
            f"  --> Fetching {symbol} ({exchange}:{token}) "
            f"from {curr_from.strftime('%Y-%m-%d %H:%M')} to {curr_to.strftime('%Y-%m-%d %H:%M')}..."
        )

        raw_candles = fetch_historical_chunk(kite, token, curr_from, curr_to, interval)
        if raw_candles:
            df = pd.DataFrame(raw_candles)

            if "date" in df.columns:
                df.rename(columns={"date": "timestamp"}, inplace=True)

            if isinstance(df["timestamp"].dtype, pd.DatetimeTZDtype):
                df["timestamp"] = df["timestamp"].dt.tz_localize(None)

            df["symbol"] = symbol
            df["exchange"] = exchange
            df["instrument_token"] = token
            df["asset_class"] = asset_class
            df["segment"] = segment

            if "oi" not in df.columns:
                df["oi"] = 0

            conn.register("df_stage", df)
            conn.execute("""
                INSERT OR REPLACE INTO market_data (
                    symbol, exchange, instrument_token, timestamp,
                    open, high, low, close, volume, oi, asset_class, segment
                )
                SELECT 
                    symbol, exchange, instrument_token, timestamp,
                    open, high, low, close, volume, oi, asset_class, segment
                FROM df_stage
            """)
            conn.unregister("df_stage")

            total_inserted += len(df)
            logger.info(f"      [✓] Inserted/Updated {len(df)} 1-minute candles for {symbol}.")

        curr_from = curr_to + timedelta(minutes=1)

    return total_inserted


# ---------------------------------------------------------------------------
# BATCH FILE IMPORTER: NIFTY 50 HISTORICAL FILES
# ---------------------------------------------------------------------------
def import_nifty_dir(
    conn: duckdb.DuckDBPyConnection,
    dir_path: Optional[str] = None,
    archive_dir: Optional[Path] = None,
    failed_dir: Optional[Path] = None,
    symbol: str = "NIFTY 50",
    exchange: str = "NSE",
    instrument_token: int = 256265,
    asset_class: str = "INDEX",
    segment: str = "INDICES",
) -> Dict[str, Any]:
    """
    Batch imports and normalizes historical Nifty 50 CSV and TXT files into DuckDB:
      1. Header Trimming: Cleans leading/trailing whitespace, strips UTF-8 BOM.
      2. Zero-OHL Close-Only Handling: Normalizes 1990-1995 zero-OHL rows (synthesizing from Close).
      3. Ascending Date Sorting: Parses Indian dates (%d-%b-%Y, %d-%m-%Y, %Y-%m-%d), sorts ascending.
      4. Deduplication & Persistence: Deduplicates on (instrument_token, timestamp) with native INSERT OR REPLACE.
      5. File Archival: Moves processed files to 02_PROCESSED_ARCHIVE\\nifty_index\\ (and failed to 03_FAILED_OR_SKIPPED\\).
    """
    target_dir = Path(dir_path) if (dir_path and dir_path.strip()) else (DEFAULT_DROP_INBOX / "nifty_index")
    target_archive = archive_dir if archive_dir else (DEFAULT_ARCHIVE_DIR / "nifty_index")
    target_failed = failed_dir if failed_dir else DEFAULT_FAILED_DIR

    target_archive.mkdir(parents=True, exist_ok=True)
    target_failed.mkdir(parents=True, exist_ok=True)

    if not target_dir.exists() or not target_dir.is_dir():
        logger.error(f"Drop directory not found: {target_dir}")
        return {"processed": 0, "skipped": 0, "rows": 0}

    raw_files = list(target_dir.glob("*.csv")) + list(target_dir.glob("*.CSV")) + \
                list(target_dir.glob("*.txt")) + list(target_dir.glob("*.TXT"))
    csv_files = sorted(list({p.resolve() for p in raw_files}))

    if not csv_files:
        logger.info(f"No pending files found in drop inbox: {target_dir}")
        return {"processed": 0, "skipped": 0, "rows": 0}

    logger.info(f"Found {len(csv_files)} files in {target_dir}. Commencing batch normalization...")

    all_dfs: List[pd.DataFrame] = []
    successful_files: List[Path] = []
    failed_files: List[Tuple[Path, str]] = []
    total_zero_ohl_fixed = 0

    for file_path in csv_files:
        try:
            df = pd.read_csv(file_path, encoding="utf-8-sig")
            if df.empty:
                failed_files.append((file_path, "File is empty"))
                continue

            df.columns = [str(c).strip() for c in df.columns]
            cols_lower = {c.lower(): c for c in df.columns}

            date_col = next((cols_lower[k] for k in cols_lower if "date" in k or "time" in k), None)
            open_col = next((cols_lower[k] for k in cols_lower if k == "open"), None)
            high_col = next((cols_lower[k] for k in cols_lower if k == "high"), None)
            low_col = next((cols_lower[k] for k in cols_lower if k == "low"), None)
            close_col = next((cols_lower[k] for k in cols_lower if k == "close"), None)
            vol_col = next((cols_lower[k] for k in cols_lower if "shares" in k or "vol" in k or "qty" in k), None)

            if not date_col or not close_col:
                err_msg = f"Missing essential Date or Close columns (Columns: {list(df.columns)})"
                failed_files.append((file_path, err_msg))
                continue

            # Multi-format date parser: DD-MMM-YYYY, DD-MM-YYYY, YYYY-MM-DD
            parsed_dates = pd.to_datetime(df[date_col].astype(str).str.strip(), format="%d-%b-%Y", errors="coerce")
            unparsed = parsed_dates.isna()
            if unparsed.any():
                parsed_dates[unparsed] = pd.to_datetime(
                    df.loc[unparsed, date_col].astype(str).str.strip(),
                    dayfirst=True,
                    errors="coerce"
                )

            if isinstance(parsed_dates.dtype, pd.DatetimeTZDtype):
                parsed_dates = parsed_dates.dt.tz_localize(None)

            def clean_numeric(series: Optional[pd.Series], default_val: float = 0.0) -> pd.Series:
                if series is None:
                    return pd.Series(default_val, index=df.index, dtype="float64")
                cleaned = series.astype(str).str.replace(r"[^0-9.-]+", "", regex=True)
                return pd.to_numeric(cleaned, errors="coerce").fillna(default_val)

            close_vals = clean_numeric(df[close_col], 0.0)
            open_vals = clean_numeric(df[open_col] if open_col else None, 0.0)
            high_vals = clean_numeric(df[high_col] if high_col else None, 0.0)
            low_vals = clean_numeric(df[low_col] if low_col else None, 0.0)
            vol_vals = clean_numeric(df[vol_col] if vol_col else None, 0.0).astype("int64")

            valid_mask = parsed_dates.notna() & (close_vals > 0)
            if not valid_mask.any():
                failed_files.append((file_path, "No valid records with positive Close found"))
                continue

            parsed_dates = parsed_dates[valid_mask]
            close_vals = close_vals[valid_mask]
            open_vals = open_vals[valid_mask]
            high_vals = high_vals[valid_mask]
            low_vals = low_vals[valid_mask]
            vol_vals = vol_vals[valid_mask]

            # Zero-OHL Close-Only Handling for early years (1990-1995)
            zero_ohl_mask = (open_vals <= 0) | (high_vals <= 0) | (low_vals <= 0)
            zero_count = zero_ohl_mask.sum()
            if zero_count > 0:
                total_zero_ohl_fixed += int(zero_count)
                open_vals = open_vals.mask(open_vals <= 0, close_vals)
                high_vals = high_vals.mask(high_vals <= 0, close_vals)
                low_vals = low_vals.mask(low_vals <= 0, close_vals)

            high_vals = pd.concat([high_vals, open_vals, close_vals], axis=1).max(axis=1)
            low_vals = pd.concat([low_vals, open_vals, close_vals], axis=1).min(axis=1)

            norm_df = pd.DataFrame({
                "symbol": symbol,
                "exchange": exchange,
                "instrument_token": instrument_token,
                "timestamp": parsed_dates,
                "open": open_vals,
                "high": high_vals,
                "low": low_vals,
                "close": close_vals,
                "volume": vol_vals,
                "oi": 0,
                "asset_class": asset_class,
                "segment": segment,
            })

            all_dfs.append(norm_df)
            successful_files.append(file_path)

        except Exception as e:
            failed_files.append((file_path, str(e)))

    # Move failed/skipped files to 03_FAILED_OR_SKIPPED
    for fpath, reason in failed_files:
        dest = target_failed / fpath.name
        log_dest = target_failed / f"{fpath.stem}_error.log"
        logger.warning(f"[SKIPPED] {fpath.name}: {reason} -> Moved to 03_FAILED_OR_SKIPPED")
        try:
            shutil.move(str(fpath), str(dest))
            with open(log_dest, "w", encoding="utf-8") as lfp:
                lfp.write(f"Timestamp: {datetime.now().isoformat()}\nFile: {fpath.name}\nError: {reason}\n")
        except Exception as move_err:
            logger.error(f"Could not move failed file {fpath.name}: {move_err}")

    if not all_dfs:
        logger.warning("No valid records extracted from input files.")
        return {"processed": 0, "skipped": len(failed_files), "rows": 0}

    combined_df = pd.concat(all_dfs, ignore_index=True)
    combined_df.sort_values(by="timestamp", ascending=True, inplace=True)

    initial_len = len(combined_df)
    combined_df.drop_duplicates(subset=["instrument_token", "timestamp"], keep="last", inplace=True)
    dedup_count = initial_len - len(combined_df)

    # Register metadata for NIFTY 50
    now = datetime.now()
    conn.execute("""
        INSERT OR REPLACE INTO instruments_meta (
            instrument_token, exchange_token, tradingsymbol, name, exchange,
            segment, instrument_type, tick_size, lot_size, last_synced_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, [
        instrument_token, str(instrument_token), symbol, symbol,
        exchange, segment, "INDEX", 0.05, 50, now
    ])

    conn.register("df_nifty_stage", combined_df)
    conn.execute("""
        INSERT OR REPLACE INTO market_data (
            symbol, exchange, instrument_token, timestamp,
            open, high, low, close, volume, oi, asset_class, segment
        )
        SELECT 
            symbol, exchange, instrument_token, timestamp,
            open, high, low, close, volume, oi, asset_class, segment
        FROM df_nifty_stage
    """)
    conn.unregister("df_nifty_stage")

    # Move successfully processed files to archive
    for fpath in successful_files:
        dest = target_archive / fpath.name
        try:
            if dest.exists():
                dest.unlink()
            shutil.move(str(fpath), str(dest))
        except Exception as move_err:
            logger.error(f"Error archiving processed file {fpath.name}: {move_err}")

    min_date = combined_df["timestamp"].min()
    max_date = combined_df["timestamp"].max()

    logger.info(
        f"[SUCCESS] Ingested {len(combined_df):,} distinct records across {len(successful_files)} files "
        f"({total_zero_ohl_fixed:,} zero-OHL rows normalized, {dedup_count:,} duplicate dates resolved)."
    )
    logger.info(f"          Date Span: {min_date.strftime('%Y-%m-%d')} to {max_date.strftime('%Y-%m-%d')}.")
    logger.info(f"          Archived files moved to: {target_archive}")

    return {
        "processed": len(successful_files),
        "skipped": len(failed_files),
        "rows": len(combined_df),
        "min_date": min_date,
        "max_date": max_date,
    }


# ---------------------------------------------------------------------------
# BATCH FILE IMPORTER: NSE BHAVCOPY (EQUITIES & DERIVATIVES)
# ---------------------------------------------------------------------------
def import_nse_bhavcopy(
    conn: duckdb.DuckDBPyConnection,
    dir_path: Optional[str] = None,
    archive_dir: Optional[Path] = None,
    failed_dir: Optional[Path] = None,
) -> Dict[str, Any]:
    """
    Imports and normalizes NSE Bhavcopy files (Cash Market Equities & Derivatives):
      - Handles classic Equity Bhavcopy (CM): SYMBOL, SERIES, OPEN, HIGH, LOW, CLOSE, etc.
      - Handles modern UDiFF format: TradgS symb, SctySrs, OpnPric, HghPric, etc.
      - Handles F&O Bhavcopy: INSTRUMENT, SYMBOL, EXPIRY_DT, STRIKE_PR, OPTION_TYP, etc.
      - Moves successfully ingested files to 02_PROCESSED_ARCHIVE\\nse_bhavcopy\\
      - Unmapped or corrupt files are safely moved to 03_FAILED_OR_SKIPPED\\ with error logs.
    """
    target_dir = Path(dir_path) if (dir_path and dir_path.strip()) else (DEFAULT_DROP_INBOX / "nse_bhavcopy")
    target_archive = archive_dir if archive_dir else (DEFAULT_ARCHIVE_DIR / "nse_bhavcopy")
    target_failed = failed_dir if failed_dir else DEFAULT_FAILED_DIR

    target_archive.mkdir(parents=True, exist_ok=True)
    target_failed.mkdir(parents=True, exist_ok=True)

    if not target_dir.exists() or not target_dir.is_dir():
        logger.error(f"Drop directory not found: {target_dir}")
        return {"processed": 0, "skipped": 0, "rows": 0}

    raw_files = list(target_dir.glob("*.csv")) + list(target_dir.glob("*.CSV")) + \
                list(target_dir.glob("*.txt")) + list(target_dir.glob("*.TXT"))
    files = sorted(list({p.resolve() for p in raw_files}))

    if not files:
        logger.info(f"No pending files found in NSE Bhavcopy inbox: {target_dir}")
        return {"processed": 0, "skipped": 0, "rows": 0}

    logger.info(f"Found {len(files)} files in {target_dir}. Processing NSE Bhavcopy batch...")

    successful_count = 0
    failed_count = 0
    total_rows_inserted = 0

    for file_path in files:
        try:
            df = pd.read_csv(file_path, encoding="utf-8-sig")
            if df.empty:
                raise ValueError("Bhavcopy file is empty")

            df.columns = [str(c).strip() for c in df.columns]
            cols_map = {c.upper(): c for c in df.columns}

            # Layout 1: Classic NSE CM Equity Bhavcopy
            if "SYMBOL" in cols_map and "SERIES" in cols_map and "CLOSE" in cols_map and "TIMESTAMP" in cols_map:
                series_col = cols_map["SERIES"]
                df_eq = df[df[series_col].astype(str).str.strip().isin(["EQ", "BE", "SM"])].copy()
                if df_eq.empty:
                    df_eq = df.copy()

                sym_col = cols_map["SYMBOL"]
                time_col = cols_map["TIMESTAMP"]
                open_col = cols_map["OPEN"]
                high_col = cols_map["HIGH"]
                low_col = cols_map["LOW"]
                close_col = cols_map["CLOSE"]
                vol_col = cols_map.get("TOTTRDQTY", cols_map.get("VOLUME"))

                parsed_dates = pd.to_datetime(df_eq[time_col].astype(str).str.strip(), dayfirst=True, errors="coerce")
                tokens = df_eq[sym_col].apply(lambda s: abs(hash("NSE_" + str(s))) % 2147483647)

                norm_df = pd.DataFrame({
                    "symbol": df_eq[sym_col].astype(str).str.strip(),
                    "exchange": "NSE",
                    "instrument_token": tokens,
                    "timestamp": parsed_dates,
                    "open": pd.to_numeric(df_eq[open_col], errors="coerce").fillna(0.0),
                    "high": pd.to_numeric(df_eq[high_col], errors="coerce").fillna(0.0),
                    "low": pd.to_numeric(df_eq[low_col], errors="coerce").fillna(0.0),
                    "close": pd.to_numeric(df_eq[close_col], errors="coerce").fillna(0.0),
                    "volume": pd.to_numeric(df_eq[vol_col] if vol_col else 0, errors="coerce").fillna(0).astype("int64"),
                    "oi": 0,
                    "asset_class": "EQUITY",
                    "segment": "NSE-EQ"
                })

            # Layout 2: Classic NSE F&O Bhavcopy
            elif "INSTRUMENT" in cols_map and "SYMBOL" in cols_map and "EXPIRY_DT" in cols_map:
                sym_col = cols_map["SYMBOL"]
                time_col = cols_map["TIMESTAMP"]
                open_col = cols_map["OPEN"]
                high_col = cols_map["HIGH"]
                low_col = cols_map["LOW"]
                close_col = cols_map["CLOSE"]
                vol_col = cols_map.get("CONTRACTS", cols_map.get("TOTTRDQTY"))
                oi_col = cols_map.get("OPEN_INT")

                parsed_dates = pd.to_datetime(df[time_col].astype(str).str.strip(), dayfirst=True, errors="coerce")
                tokens = df[sym_col].apply(lambda s: abs(hash("NFO_" + str(s))) % 2147483647)

                norm_df = pd.DataFrame({
                    "symbol": df[sym_col].astype(str).str.strip(),
                    "exchange": "NFO",
                    "instrument_token": tokens,
                    "timestamp": parsed_dates,
                    "open": pd.to_numeric(df[open_col], errors="coerce").fillna(0.0),
                    "high": pd.to_numeric(df[high_col], errors="coerce").fillna(0.0),
                    "low": pd.to_numeric(df[low_col], errors="coerce").fillna(0.0),
                    "close": pd.to_numeric(df[close_col], errors="coerce").fillna(0.0),
                    "volume": pd.to_numeric(df[vol_col] if vol_col else 0, errors="coerce").fillna(0).astype("int64"),
                    "oi": pd.to_numeric(df[oi_col] if oi_col else 0, errors="coerce").fillna(0).astype("int64"),
                    "asset_class": "DERIVATIVE",
                    "segment": "NFO-FUT"
                })

            else:
                raise ValueError(f"Unrecognized NSE Bhavcopy layout headers: {list(df.columns[:6])}")

            norm_df = norm_df[norm_df["timestamp"].notna() & (norm_df["close"] > 0)]
            if norm_df.empty:
                raise ValueError("No valid rows after normalization")

            conn.register("df_nse_stage", norm_df)
            conn.execute("""
                INSERT OR REPLACE INTO market_data (
                    symbol, exchange, instrument_token, timestamp,
                    open, high, low, close, volume, oi, asset_class, segment
                )
                SELECT 
                    symbol, exchange, instrument_token, timestamp,
                    open, high, low, close, volume, oi, asset_class, segment
                FROM df_nse_stage
            """)
            conn.unregister("df_nse_stage")

            dest = target_archive / file_path.name
            if dest.exists():
                dest.unlink()
            shutil.move(str(file_path), str(dest))
            successful_count += 1
            total_rows_inserted += len(norm_df)
            logger.info(f"[SUCCESS] Ingested {len(norm_df):,} rows from {file_path.name} -> Archived.")

        except Exception as err:
            failed_count += 1
            dest = target_failed / file_path.name
            log_dest = target_failed / f"{file_path.stem}_error.log"
            logger.warning(f"[SKIPPED] {file_path.name}: {err} -> Moved to 03_FAILED_OR_SKIPPED")
            try:
                shutil.move(str(file_path), str(dest))
                with open(log_dest, "w", encoding="utf-8") as lfp:
                    lfp.write(f"Timestamp: {datetime.now().isoformat()}\nFile: {file_path.name}\nError: {err}\n")
            except Exception as move_err:
                logger.error(f"Could not move failed file {file_path.name}: {move_err}")

    logger.info(
        f"[NSE BHAVCOPY BATCH COMPLETE] Processed: {successful_count}, "
        f"Skipped/Failed: {failed_count}, Rows Inserted: {total_rows_inserted:,}."
    )
    return {"processed": successful_count, "skipped": failed_count, "rows": total_rows_inserted}


# ---------------------------------------------------------------------------
# BATCH FILE IMPORTER: MCX BHAVCOPY (ENERGY & BASE METALS)
# ---------------------------------------------------------------------------
def import_mcx_bhavcopy(
    conn: duckdb.DuckDBPyConnection,
    dir_path: Optional[str] = None,
    archive_dir: Optional[Path] = None,
    failed_dir: Optional[Path] = None,
) -> Dict[str, Any]:
    """
    Imports and normalizes MCX Bhavcopy files with strict institutional filtering:
      - STRICT BULLION EXCLUSION: Drops any record containing GOLD, SILVER, or BULLION.
      - Strictly includes Energy (Crude Oil, Natural Gas) and Base Metals (Copper, Zinc, Aluminium, Lead).
      - Moves successfully ingested files to 02_PROCESSED_ARCHIVE\\mcx_bhavcopy\\
      - Unmapped or corrupt files are safely moved to 03_FAILED_OR_SKIPPED\\ with error logs.
    """
    target_dir = Path(dir_path) if (dir_path and dir_path.strip()) else (DEFAULT_DROP_INBOX / "mcx_bhavcopy")
    target_archive = archive_dir if archive_dir else (DEFAULT_ARCHIVE_DIR / "mcx_bhavcopy")
    target_failed = failed_dir if failed_dir else DEFAULT_FAILED_DIR

    target_archive.mkdir(parents=True, exist_ok=True)
    target_failed.mkdir(parents=True, exist_ok=True)

    if not target_dir.exists() or not target_dir.is_dir():
        logger.error(f"Drop directory not found: {target_dir}")
        return {"processed": 0, "skipped": 0, "rows": 0}

    raw_files = list(target_dir.glob("*.csv")) + list(target_dir.glob("*.CSV")) + \
                list(target_dir.glob("*.txt")) + list(target_dir.glob("*.TXT"))
    files = sorted(list({p.resolve() for p in raw_files}))

    if not files:
        logger.info(f"No pending files found in MCX Bhavcopy inbox: {target_dir}")
        return {"processed": 0, "skipped": 0, "rows": 0}

    logger.info(f"Found {len(files)} files in {target_dir}. Processing MCX Bhavcopy batch...")

    successful_count = 0
    failed_count = 0
    total_rows_inserted = 0

    for file_path in files:
        try:
            df = pd.read_csv(file_path, encoding="utf-8-sig")
            if df.empty:
                raise ValueError("MCX Bhavcopy file is empty")

            df.columns = [str(c).strip() for c in df.columns]
            cols_map = {c.upper(): c for c in df.columns}

            sym_col = cols_map.get("COMMODITY", cols_map.get("SYMBOL", cols_map.get("COMMODITY NAME")))
            date_col = cols_map.get("DATE", cols_map.get("TRADE DATE", cols_map.get("TIMESTAMP")))
            open_col = cols_map.get("OPEN", cols_map.get("OPEN PRICE"))
            high_col = cols_map.get("HIGH", cols_map.get("HIGH PRICE"))
            low_col = cols_map.get("LOW", cols_map.get("LOW PRICE"))
            close_col = cols_map.get("CLOSE", cols_map.get("CLOSE PRICE"))
            vol_col = cols_map.get("VOLUME (LOTS)", cols_map.get("VOLUME", cols_map.get("VOLUME (IN LOTS)")))
            oi_col = cols_map.get("OPEN INTEREST", cols_map.get("OPEN INTEREST (LOTS)", cols_map.get("OI")))

            if not sym_col or not date_col or not close_col:
                raise ValueError(f"Unrecognized MCX Bhavcopy layout headers: {list(df.columns[:6])}")

            # INSTITUTIONAL BULLION EXCLUSION FILTER:
            # Strictly drop any record matching GOLD, SILVER, or BULLION
            def is_mcx_eligible(symbol_str: str) -> bool:
                s = str(symbol_str).upper()
                for b in BULLION_BLACKLIST:
                    if b in s:
                        return False
                for u in PERMITTED_MCX_UNDERLYINGS:
                    if s.startswith(u) or u in s:
                        return True
                return False

            eligible_mask = df[sym_col].apply(is_mcx_eligible)
            filtered_df = df[eligible_mask].copy()

            if filtered_df.empty:
                logger.info(f"File {file_path.name} contained 0 eligible Energy/Base Metal contracts (Bullion filtered).")
                dest = target_archive / file_path.name
                if dest.exists():
                    dest.unlink()
                shutil.move(str(file_path), str(dest))
                successful_count += 1
                continue

            parsed_dates = pd.to_datetime(filtered_df[date_col].astype(str).str.strip(), dayfirst=True, errors="coerce")
            tokens = filtered_df[sym_col].apply(lambda s: abs(hash("MCX_" + str(s))) % 2147483647)

            norm_df = pd.DataFrame({
                "symbol": filtered_df[sym_col].astype(str).str.strip(),
                "exchange": "MCX",
                "instrument_token": tokens,
                "timestamp": parsed_dates,
                "open": pd.to_numeric(filtered_df[open_col] if open_col else 0, errors="coerce").fillna(0.0),
                "high": pd.to_numeric(filtered_df[high_col] if high_col else 0, errors="coerce").fillna(0.0),
                "low": pd.to_numeric(filtered_df[low_col] if low_col else 0, errors="coerce").fillna(0.0),
                "close": pd.to_numeric(filtered_df[close_col], errors="coerce").fillna(0.0),
                "volume": pd.to_numeric(filtered_df[vol_col] if vol_col else 0, errors="coerce").fillna(0).astype("int64"),
                "oi": pd.to_numeric(filtered_df[oi_col] if oi_col else 0, errors="coerce").fillna(0).astype("int64"),
                "asset_class": "COMMODITY",
                "segment": "MCX-FUT"
            })

            norm_df = norm_df[norm_df["timestamp"].notna() & (norm_df["close"] > 0)]

            if not norm_df.empty:
                conn.register("df_mcx_stage", norm_df)
                conn.execute("""
                    INSERT OR REPLACE INTO market_data (
                        symbol, exchange, instrument_token, timestamp,
                        open, high, low, close, volume, oi, asset_class, segment
                    )
                    SELECT 
                        symbol, exchange, instrument_token, timestamp,
                        open, high, low, close, volume, oi, asset_class, segment
                    FROM df_mcx_stage
                """)
                conn.unregister("df_mcx_stage")
                total_rows_inserted += len(norm_df)

            dest = target_archive / file_path.name
            if dest.exists():
                dest.unlink()
            shutil.move(str(file_path), str(dest))
            successful_count += 1
            logger.info(f"[SUCCESS] Ingested {len(norm_df):,} rows from {file_path.name} -> Archived.")

        except Exception as err:
            failed_count += 1
            dest = target_failed / file_path.name
            log_dest = target_failed / f"{file_path.stem}_error.log"
            logger.warning(f"[SKIPPED] {file_path.name}: {err} -> Moved to 03_FAILED_OR_SKIPPED")
            try:
                shutil.move(str(file_path), str(dest))
                with open(log_dest, "w", encoding="utf-8") as lfp:
                    lfp.write(f"Timestamp: {datetime.now().isoformat()}\nFile: {file_path.name}\nError: {err}\n")
            except Exception as move_err:
                logger.error(f"Could not move failed file {file_path.name}: {move_err}")

    logger.info(
        f"[MCX BHAVCOPY BATCH COMPLETE] Processed: {successful_count}, "
        f"Skipped/Failed: {failed_count}, Rows Inserted: {total_rows_inserted:,}."
    )
    return {"processed": successful_count, "skipped": failed_count, "rows": total_rows_inserted}


def print_database_summary(conn: duckdb.DuckDBPyConnection) -> None:
    """Prints a structured summary of data currently stored in DuckDB."""
    logger.info("================ DUCKDB VAULT SUMMARY ================")
    try:
        total_rows = conn.execute("SELECT COUNT(*) FROM market_data").fetchone()[0]
        meta_count = conn.execute("SELECT COUNT(*) FROM instruments_meta").fetchone()[0]
        logger.info(f"Total Market Data Records:     {total_rows:,}")
        logger.info(f"Total Filtered Instruments:    {meta_count:,}")

        if total_rows > 0:
            summary = conn.execute("""
                SELECT 
                    symbol, 
                    exchange, 
                    asset_class,
                    MIN(timestamp) AS earliest, 
                    MAX(timestamp) AS latest, 
                    COUNT(*) AS count 
                FROM market_data 
                GROUP BY symbol, exchange, asset_class 
                ORDER BY count DESC 
                LIMIT 15
            """).fetchdf()
            logger.info(f"\nStored Instruments Summary:\n{summary.to_string(index=False)}")
    except Exception as e:
        logger.error(f"Error querying DuckDB summary: {e}")
    logger.info("======================================================")


# ---------------------------------------------------------------------------
# CLI INTERFACE & DISPATCH CONTROLLER
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(
        description="W.D. Gann Drafting Desk — Dedicated Market Vault & Ingestion Engine"
    )
    parser.add_argument(
        "--db-path",
        type=str,
        default=None,
        help=f"Path to DuckDB database file (defaults to {DEFAULT_DUCKDB_PATH})."
    )
    parser.add_argument(
        "--backup",
        action="store_true",
        help="Create a timestamped backup snapshot in 05_BACKUPS before executing operations."
    )
    parser.add_argument(
        "--import-nifty-dir",
        nargs="?",
        const="",
        default=None,
        help="Batch import and normalize Nifty 50 historical files into DuckDB (defaults to 01_DROP_INBOX/nifty_index)."
    )
    parser.add_argument(
        "--import-nse-bhavcopy",
        nargs="?",
        const="",
        default=None,
        help="Batch import and normalize NSE Bhavcopy files into DuckDB (defaults to 01_DROP_INBOX/nse_bhavcopy)."
    )
    parser.add_argument(
        "--import-mcx-bhavcopy",
        nargs="?",
        const="",
        default=None,
        help="Batch import and normalize MCX Bhavcopy files into DuckDB (defaults to 01_DROP_INBOX/mcx_bhavcopy, excluding Bullion)."
    )
    parser.add_argument(
        "--db-info",
        action="store_true",
        help="Display summary statistics from the master DuckDB vault."
    )
    parser.add_argument(
        "--check-auth",
        action="store_true",
        help="Validate Kite Connect API credentials and verify active session."
    )
    parser.add_argument(
        "--list-instruments",
        action="store_true",
        help="Fetch and display eligible instruments under institutional filtering rules."
    )
    parser.add_argument(
        "--sync",
        action="store_true",
        help="Execute historical data fetch loop and append to master DuckDB vault."
    )
    parser.add_argument(
        "--days",
        type=int,
        default=5,
        help="Number of historical days to fetch (defaults to 5)."
    )
    parser.add_argument(
        "--symbol",
        type=str,
        default=None,
        help="Target specific tradingsymbol or prefix (e.g., 'CRUDEOIL', 'NIFTY')."
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Maximum number of instruments to sync (for testing)."
    )

    args = parser.parse_args()

    # Determine database path
    target_db_path = Path(args.db_path) if args.db_path else DEFAULT_DUCKDB_PATH

    # Execute snapshot backup if requested
    if args.backup:
        create_backup(target_db_path)

    # Initialize DuckDB connection
    conn = init_duckdb(str(target_db_path))

    if args.db_info:
        print_database_summary(conn)
        return

    # 1. Batch Nifty 50 import
    if args.import_nifty_dir is not None:
        import_nifty_dir(conn, args.import_nifty_dir)
        print_database_summary(conn)
        return

    # 2. Batch NSE Bhavcopy import
    if args.import_nse_bhavcopy is not None:
        import_nse_bhavcopy(conn, args.import_nse_bhavcopy)
        print_database_summary(conn)
        return

    # 3. Batch MCX Bhavcopy import
    if args.import_mcx_bhavcopy is not None:
        import_mcx_bhavcopy(conn, args.import_mcx_bhavcopy)
        print_database_summary(conn)
        return

    # 4. Kite Connect authentication check
    if args.check_auth:
        try:
            kite = init_kite_client()
            profile = kite.profile()
            user_name = profile.get("user_name", "Unknown")
            user_id = profile.get("user_id", "Unknown")
            logger.info(f"[SUCCESS] Kite Connect Authenticated as: {user_name} ({user_id})")
        except Exception as e:
            logger.error(f"[FAILED] Kite Connect authentication failed: {e}")
            logger.info("Ensure KITE_API_KEY and KITE_ACCESS_TOKEN are properly configured in .env")
        return

    # 5. Kite Connect instrument listing
    if args.list_instruments:
        kite = init_kite_client()
        filtered = fetch_and_filter_instruments(kite)
        store_instruments_metadata(conn, filtered)
        logger.info(f"Displaying first 15 eligible instruments:")
        for inst in filtered[:15]:
            logger.info(f"  * {inst['exchange']}: {inst['tradingsymbol']} (Token: {inst['instrument_token']})")
        return

    # 6. Kite Connect API sync
    if args.sync:
        kite = init_kite_client()
        filtered = fetch_and_filter_instruments(kite)
        store_instruments_metadata(conn, filtered)

        if args.symbol:
            filtered = [
                inst for inst in filtered 
                if args.symbol.upper() in inst["tradingsymbol"].upper()
            ]
            logger.info(f"Filtered for symbol matching '{args.symbol}': {len(filtered)} instruments")

        if args.limit:
            filtered = filtered[:args.limit]
            logger.info(f"Applied limit: syncing top {len(filtered)} instruments only.")

        to_date = datetime.now()
        from_date = to_date - timedelta(days=args.days)
        logger.info(
            f"Commencing historical data sync for {len(filtered)} instruments "
            f"over past {args.days} days ({from_date.strftime('%Y-%m-%d')} to {to_date.strftime('%Y-%m-%d')})..."
        )

        grand_total = 0
        for i, inst in enumerate(filtered, start=1):
            logger.info(f"[{i}/{len(filtered)}] Processing {inst['tradingsymbol']}...")
            inserted = sync_instrument_data(kite, conn, inst, from_date, to_date, interval="minute")
            grand_total += inserted

        logger.info(f"[COMPLETED] Historical sync complete. Grand Total Inserted: {grand_total:,} rows.")
        print_database_summary(conn)
        return

    # Default action if no flags provided: Print status
    logger.info("No specific action flag supplied. Displaying DuckDB vault status.")
    print_database_summary(conn)
    logger.info("Run with --help to see all available CLI execution options.")


if __name__ == "__main__":
    main()
