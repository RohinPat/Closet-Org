import sqlite3
from datetime import datetime
from typing import List, Dict, Optional
import json
from pathlib import Path


class DatabaseManager:
    """SQLite database manager for clothing inventory"""
    
    def __init__(self, db_path: str = "closet.db"):
        self.db_path = db_path
        self.init_database()
    
    def get_connection(self):
        """Get database connection"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn
    
    def init_database(self):
        """Initialize database tables"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        # Clothing items table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS clothing_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                image_path TEXT NOT NULL,
                category TEXT NOT NULL,
                subcategory TEXT NOT NULL,
                colors TEXT NOT NULL,
                season TEXT,
                style TEXT,
                worn BOOLEAN DEFAULT 0,
                washed BOOLEAN DEFAULT 1,
                times_worn INTEGER DEFAULT 0,
                date_added TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_worn TIMESTAMP
            )
        ''')
        
        # Wear history table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS wear_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                item_id INTEGER,
                worn_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (item_id) REFERENCES clothing_items (id)
            )
        ''')
        
        conn.commit()
        conn.close()
    
    def add_clothing_item(self, image_path: str, category: str, subcategory: str,
                         colors: List[str], season: str, style: str) -> int:
        """Add a new clothing item to the database"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        colors_json = json.dumps(colors)
        
        cursor.execute('''
            INSERT INTO clothing_items 
            (image_path, category, subcategory, colors, season, style)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (image_path, category, subcategory, colors_json, season, style))
        
        item_id = cursor.lastrowid
        conn.commit()
        conn.close()
        
        return item_id
    
    def get_all_items(self, category: Optional[str] = None, 
                     status: Optional[str] = None) -> List[Dict]:
        """Get all clothing items with optional filters"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        query = "SELECT * FROM clothing_items WHERE 1=1"
        params = []
        
        if category:
            query += " AND category = ?"
            params.append(category)
        
        if status == "clean":
            query += " AND washed = 1"
        elif status == "dirty":
            query += " AND washed = 0"
        
        query += " ORDER BY date_added DESC"
        
        cursor.execute(query, params)
        rows = cursor.fetchall()
        
        items = []
        for row in rows:
            item = dict(row)
            item["colors"] = json.loads(item["colors"])
            item["worn"] = bool(item["worn"])
            item["washed"] = bool(item["washed"])
            items.append(item)
        
        conn.close()
        return items
    
    def get_item(self, item_id: int) -> Optional[Dict]:
        """Get a specific clothing item"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        cursor.execute("SELECT * FROM clothing_items WHERE id = ?", (item_id,))
        row = cursor.fetchone()
        
        if row:
            item = dict(row)
            item["colors"] = json.loads(item["colors"])
            item["worn"] = bool(item["worn"])
            item["washed"] = bool(item["washed"])
            conn.close()
            return item
        
        conn.close()
        return None
    
    def update_item_status(self, item_id: int, worn: Optional[bool] = None,
                          washed: Optional[bool] = None) -> bool:
        """Update the worn/washed status of an item"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        updates = []
        params = []
        
        if worn is not None:
            updates.append("worn = ?")
            params.append(1 if worn else 0)
            
            if worn:
                # Increment times worn
                updates.append("times_worn = times_worn + 1")
                updates.append("last_worn = ?")
                params.append(datetime.now().isoformat())
                
                # Add to wear history
                cursor.execute(
                    "INSERT INTO wear_history (item_id) VALUES (?)",
                    (item_id,)
                )
                
                # Mark as unwashed when worn
                updates.append("washed = 0")
        
        if washed is not None:
            updates.append("washed = ?")
            params.append(1 if washed else 0)
        
        if not updates:
            conn.close()
            return True
        
        query = f"UPDATE clothing_items SET {', '.join(updates)} WHERE id = ?"
        params.append(item_id)
        
        cursor.execute(query, params)
        success = cursor.rowcount > 0
        
        conn.commit()
        conn.close()
        
        return success
    
    def delete_item(self, item_id: int) -> bool:
        """Delete a clothing item"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        # Delete wear history first
        cursor.execute("DELETE FROM wear_history WHERE item_id = ?", (item_id,))
        
        # Delete the item
        cursor.execute("DELETE FROM clothing_items WHERE id = ?", (item_id,))
        success = cursor.rowcount > 0
        
        conn.commit()
        conn.close()
        
        return success
    
    def get_statistics(self) -> Dict:
        """Get closet statistics"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        # Total items
        cursor.execute("SELECT COUNT(*) as total FROM clothing_items")
        total = cursor.fetchone()["total"]
        
        # Items by category
        cursor.execute("""
            SELECT subcategory, COUNT(*) as count 
            FROM clothing_items 
            GROUP BY subcategory
        """)
        by_category = {row["subcategory"]: row["count"] for row in cursor.fetchall()}
        
        # Dirty items
        cursor.execute("SELECT COUNT(*) as dirty FROM clothing_items WHERE washed = 0")
        dirty = cursor.fetchone()["dirty"]
        
        # Most worn items
        cursor.execute("""
            SELECT id, category, times_worn 
            FROM clothing_items 
            ORDER BY times_worn DESC 
            LIMIT 5
        """)
        most_worn = [dict(row) for row in cursor.fetchall()]
        
        # Recently added
        cursor.execute("""
            SELECT COUNT(*) as recent 
            FROM clothing_items 
            WHERE date_added >= datetime('now', '-7 days')
        """)
        recent = cursor.fetchone()["recent"]
        
        conn.close()
        
        return {
            "total_items": total,
            "by_category": by_category,
            "dirty_items": dirty,
            "clean_items": total - dirty,
            "most_worn": most_worn,
            "recently_added": recent
        }

