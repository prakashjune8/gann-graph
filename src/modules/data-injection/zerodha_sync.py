#!/usr/bin/env python3
"""
W.D. Gann Drafting Desk — Zerodha Kite Connect to DuckDB Local Pipeline
Module: src/modules/data-injection/zerodha_sync.py

Provides high-performance 1-minute OHLCV data ingestion from Zerodha Kite Connect
into a local DuckDB time-series vault with institutional instrument filtering:
  - Allowed: NSE Nifty 50, NFO (Nifty 50 Options & Futures), MCX Energy (Crude, Natural Gas),
             MCX Base Metals (Copper, Zinc, Aluminium, Lead).
  - HARD EXCLUSION: Absolute drop of any instrument containing GOLD, SILVER, or BULLION.
"""

import os
import sys
import time
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
# CONSTANTS & FILTERING DIRECTIVES (Strict Institutional Alignment)
# ---------------------------------------------------------------------------
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

DEFAULT_DUCKDB_FILENAME = "gann_market_data.duckdb"
KITE_HISTORICAL_CHUNK_DAYS = 30  # Kite allows max 60 days for 1-minute historical data


def locate_env_file() -> Optional[Path]:
    """Searches for .env file in the current directory, module directory, and workspace root."""
    current_dir = Path(__file__).resolve().parent
    workspace_root = current_dir.parent.parent.parent

    candidates = [
        current_dir / ".env",
        workspace_root / ".env",
        Path.cwd() / ".env",
    ]

    for p in candidates:
        if p.exists() and p.is_file():
            return p
    return None


def init_duckdb(db_path: str = DEFAULT_DUCKDB_FILENAME, max_retries: int = 5) -> duckdb.DuckDBPyConnection:
    """
    Initializes local DuckDB storage vault and ensures required schema exists.
    Stores high-resolution 1-minute candles with primary key indexing.
    Includes Windows file-lock recovery against background sync scanners (GoogleDriveFS, OneDrive).
    """
    db_file = Path(db_path)
    if not db_file.is_absolute():
        module_dir = Path(__file__).resolve().parent
        db_file = module_dir / db_path

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

    # Time-Series Market Data Table Schema
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
            PRIMARY KEY (instrument_token, timestamp)
        );
    """)

    # Fast symbol + timestamp query index
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_market_symbol_time 
        ON market_data(symbol, timestamp);
    """)

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
        # Only analyze futures contracts
        if inst_type == "FUT" or segment == "MCX-FUT":
            for underlying in PERMITTED_MCX_UNDERLYINGS:
                # Match exact or mini variant prefixes (e.g., CRUDEOIL, CRUDEOILM, NATURALGAS)
                if tradingsymbol.startswith(underlying) or name.startswith(underlying):
                    return True, f"MCX Permitted Asset ({underlying})"
            return False, "Excluded MCX Commodity (Not Energy or Base Metal)"
        return False, "Non-Futures MCX Instrument"

    return False, f"Excluded Exchange: {exchange}"


def fetch_and_filter_instruments(kite: KiteConnect) -> List[Dict[str, Any]]:
    """
    Fetches the master instrument list from Kite Connect and applies the
    strict Gann asset routing filters.
    """
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
    """
    Executes a single historical_data API call to Zerodha with rate-limit defense.
    """
    try:
        # Kite Connect API rate limit is ~3 requests/second
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
    """
    Iteratively fetches 1-minute historical OHLCV data in safe 30-day chunks,
    pipes directly into a Pandas DataFrame, and executes DuckDB native ingestion.
    """
    token = instrument["instrument_token"]
    symbol = instrument["tradingsymbol"]
    exchange = instrument["exchange"]

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

            # Standardize columns
            if "date" in df.columns:
                df.rename(columns={"date": "timestamp"}, inplace=True)

            # Strip timezones for clean DuckDB TIMESTAMP indexing
            if pd.api.types.is_datetime64tz_dtype(df["timestamp"]):
                df["timestamp"] = df["timestamp"].dt.tz_localize(None)

            df["symbol"] = symbol
            df["exchange"] = exchange
            df["instrument_token"] = token

            if "oi" not in df.columns:
                df["oi"] = 0

            # Direct native Pandas insertion into DuckDB
            conn.register("df_stage", df)
            conn.execute("""
                INSERT OR REPLACE INTO market_data (
                    symbol, exchange, instrument_token, timestamp,
                    open, high, low, close, volume, oi
                )
                SELECT 
                    symbol, exchange, instrument_token, timestamp,
                    open, high, low, close, volume, oi
                FROM df_stage
            """)
            conn.unregister("df_stage")

            total_inserted += len(df)
            logger.info(f"      [✓] Inserted/Updated {len(df)} 1-minute candles for {symbol}.")

        curr_from = curr_to + timedelta(minutes=1)

    return total_inserted


def print_database_summary(conn: duckdb.DuckDBPyConnection) -> None:
    """Prints a structured summary of data currently stored in DuckDB."""
    logger.info("================ DUCKDB VAULT SUMMARY ================")
    try:
        total_rows = conn.execute("SELECT COUNT(*) FROM market_data").fetchone()[0]
        meta_count = conn.execute("SELECT COUNT(*) FROM instruments_meta").fetchone()[0]
        logger.info(f"Total 1-Minute Candle Records: {total_rows:,}")
        logger.info(f"Total Filtered Instruments:    {meta_count:,}")

        if total_rows > 0:
            summary = conn.execute("""
                SELECT 
                    symbol, 
                    exchange, 
                    MIN(timestamp) AS earliest, 
                    MAX(timestamp) AS latest, 
                    COUNT(*) AS count 
                FROM market_data 
                GROUP BY symbol, exchange 
                ORDER BY count DESC 
                LIMIT 10
            """).fetchdf()
            logger.info(f"\nTop 10 Instruments by Stored Candle Count:\n{summary.to_string(index=False)}")
    except Exception as e:
        logger.error(f"Error querying DuckDB summary: {e}")
    logger.info("======================================================")


# ---------------------------------------------------------------------------
# CLI INTERFACE & DISPATCH CONTROLLER
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(
        description="W.D. Gann Drafting Desk — Zerodha Kite to DuckDB Ingestion Engine"
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
        help="Execute historical data fetch loop and append to local DuckDB vault."
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
    parser.add_argument(
        "--db-info",
        action="store_true",
        help="Display summary statistics from the local DuckDB vault."
    )
    parser.add_argument(
        "--db-path",
        type=str,
        default=DEFAULT_DUCKDB_FILENAME,
        help=f"Path to DuckDB database file (default: {DEFAULT_DUCKDB_FILENAME})."
    )

    args = parser.parse_args()

    # Always initialize or check DuckDB connection
    conn = init_duckdb(args.db_path)

    if args.db_info:
        print_database_summary(conn)
        return

    # Check authentication flow
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

    # Instrument inspection flow
    if args.list_instruments:
        kite = init_kite_client()
        filtered = fetch_and_filter_instruments(kite)
        store_instruments_metadata(conn, filtered)
        logger.info(f"Displaying first 15 eligible instruments:")
        for inst in filtered[:15]:
            logger.info(f"  * {inst['exchange']}: {inst['tradingsymbol']} (Token: {inst['instrument_token']})")
        return

    # Full or partial historical sync flow
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
            f"Commencing 1-minute historical data sync for {len(filtered)} instruments "
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

    # Default action if no flags provided: Print help and show local database info
    logger.info("No specific action flag supplied. Displaying DuckDB vault status.")
    print_database_summary(conn)
    logger.info("Run with --help to see all available CLI execution options.")


if __name__ == "__main__":
    main()
