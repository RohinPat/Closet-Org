#!/usr/bin/env python3
"""
Database Migration Script
Upgrades existing closet.db to new schema with enhanced tracking features
"""

import sqlite3
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parent
_DEFAULT_DB_PATH = _REPO_ROOT / "backend" / "closet.db"


def _ensure_backend_on_path():
    backend_dir = str(_REPO_ROOT / "backend")
    if backend_dir not in sys.path:
        sys.path.insert(0, backend_dir)


def migrate_database(db_path=None):
    """Create database with full schema if missing, or upgrade an older closet.db."""
    
    if db_path is None:
        db_path = _DEFAULT_DB_PATH
    else:
        db_path = Path(db_path)
    
    db_path = Path(db_path)
    print("[*] Starting database migration...")
    
    if not db_path.exists():
        print(f"[i] No database at {db_path} -- creating full schema...")
        _ensure_backend_on_path()
        from database.db_manager import DatabaseManager
        DatabaseManager(str(db_path))
        print(f"[OK] Created new database: {db_path}")
        return
    
    conn = sqlite3.connect(str(db_path))
    cursor = conn.cursor()
    
    # Check if migration is needed
    cursor.execute("PRAGMA table_info(clothing_items)")
    columns = [col[1] for col in cursor.fetchall()]
    
    if 'purchase_price' in columns:
        print("[OK] Database already migrated (full schema).")
        conn.close()
        return
    
    print("[*] Adding new columns to clothing_items table...")
    
    # Add new columns one by one (SQLite doesn't support multiple ADD COLUMN)
    new_columns = [
        ("purchase_date", "DATE"),
        ("purchase_price", "DECIMAL(10,2)"),
        ("purchase_location", "TEXT"),
        ("brand", "TEXT"),
        ("size", "TEXT"),
        ("wear_again_count", "INTEGER DEFAULT 0"),
        ("max_wear_before_wash", "INTEGER DEFAULT 1"),
        ("freshness_score", "DECIMAL(3,2) DEFAULT 1.00"),
        ("condition_score", "DECIMAL(3,2) DEFAULT 1.00"),
        ("is_favorite", "BOOLEAN DEFAULT 0"),
        ("physical_location", "TEXT DEFAULT 'closet'"),
        ("rotation_category", "TEXT DEFAULT 'new'"),
        ("notes", "TEXT"),
    ]
    
    for col_name, col_type in new_columns:
        try:
            cursor.execute(f"ALTER TABLE clothing_items ADD COLUMN {col_name} {col_type}")
            print(f"  + Added {col_name}")
        except sqlite3.OperationalError as e:
            if "duplicate column" in str(e).lower():
                print(f"  = {col_name} already exists")
            else:
                print(f"  ! Error adding {col_name}: {e}")
    
    print("\n[*] Adding new columns to wear_history table...")
    
    wear_history_columns = [
        ("occasion", "TEXT"),
        ("rating", "INTEGER"),
        ("notes", "TEXT"),
    ]
    
    for col_name, col_type in wear_history_columns:
        try:
            cursor.execute(f"ALTER TABLE wear_history ADD COLUMN {col_name} {col_type}")
            print(f"  + Added {col_name}")
        except sqlite3.OperationalError as e:
            if "duplicate column" in str(e).lower():
                print(f"  = {col_name} already exists")
            else:
                print(f"  ! Error adding {col_name}: {e}")
    
    print("\n[*] Creating laundry_queue table...")
    
    try:
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS laundry_queue (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                item_id INTEGER,
                added_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                priority TEXT DEFAULT 'normal',
                status TEXT DEFAULT 'queued',
                estimated_ready DATE,
                FOREIGN KEY (item_id) REFERENCES clothing_items (id) ON DELETE CASCADE
            )
        ''')
        print("  + Created laundry_queue table")
    except sqlite3.OperationalError as e:
        print(f"  = laundry_queue table already exists")
    
    print("\n[*] Calculating initial values for existing items...")
    
    # Set smart defaults for max_wear_before_wash based on category
    cursor.execute("""
        UPDATE clothing_items 
        SET max_wear_before_wash = 3 
        WHERE category = 'Bottom' OR subcategory LIKE '%jean%' OR subcategory LIKE '%pant%'
    """)
    
    cursor.execute("""
        UPDATE clothing_items 
        SET max_wear_before_wash = 5 
        WHERE category LIKE '%jacket%' OR subcategory LIKE '%sweater%' OR subcategory LIKE '%blazer%'
    """)
    
    # Set rotation categories based on existing data
    cursor.execute("""
        UPDATE clothing_items
        SET rotation_category = 
            CASE 
                WHEN times_worn >= 20 THEN 'high'
                WHEN times_worn >= 10 THEN 'medium'
                WHEN times_worn >= 3 THEN 'low'
                ELSE 'new'
            END
    """)
    
    print("  + Set smart defaults for max_wear_before_wash")
    print("  + Calculated rotation categories")
    
    conn.commit()
    conn.close()
    
    print("\n[OK] Migration complete!")
    print("\nNew features available:")
    print("   - Multi-wear tracking (jeans, jackets, etc.)")
    print("   - Cost-per-wear analysis")
    print("   - Freshness scores")
    print("   - Laundry queue management")
    print("   - Wardrobe insights & neglected items")
    print("   - Rotation status tracking")
    print("   - Favorite items")
    print("\nRestart your app to use the new features.")

if __name__ == "__main__":
    cli_path = sys.argv[1] if len(sys.argv) > 1 else None
    if cli_path:
        migrate_database(cli_path)
    elif Path("closet.db").exists() and not _DEFAULT_DB_PATH.exists():
        migrate_database(_REPO_ROOT / "closet.db")
    else:
        migrate_database(_DEFAULT_DB_PATH)

