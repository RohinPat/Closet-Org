import sqlite3
from datetime import datetime
from typing import List, Dict, Optional
import json
from pathlib import Path
import hashlib
import secrets


class DatabaseManager:
    """SQLite database manager for clothing inventory and user management"""
    
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
        
        # Users table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                full_name TEXT,
                avatar_url TEXT,
                bio TEXT,
                theme_preference TEXT DEFAULT 'light',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_login TIMESTAMP
            )
        ''')
        
        # Clothing items table (with user_id)
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS clothing_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
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
                last_worn TIMESTAMP,
                purchase_date DATE,
                purchase_price DECIMAL(10,2),
                purchase_location TEXT,
                brand TEXT,
                size TEXT,
                wear_again_count INTEGER DEFAULT 0,
                max_wear_before_wash INTEGER DEFAULT 1,
                freshness_score DECIMAL(3,2) DEFAULT 1.00,
                condition_score DECIMAL(3,2) DEFAULT 1.00,
                is_favorite BOOLEAN DEFAULT 0,
                physical_location TEXT DEFAULT 'closet',
                rotation_category TEXT DEFAULT 'new',
                notes TEXT,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
        ''')
        
        # Wear history table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS wear_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                item_id INTEGER,
                worn_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                occasion TEXT,
                rating INTEGER,
                notes TEXT,
                FOREIGN KEY (item_id) REFERENCES clothing_items (id)
            )
        ''')
        
        # Laundry queue table
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
        
        conn.commit()
        conn.close()
    
    # User Management Methods
    
    def create_user(self, username: str, email: str, password_hash: str, 
                    full_name: Optional[str] = None) -> int:
        """Create a new user account"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        try:
            cursor.execute('''
                INSERT INTO users (username, email, password_hash, full_name)
                VALUES (?, ?, ?, ?)
            ''', (username, email, password_hash, full_name))
            
            user_id = cursor.lastrowid
            conn.commit()
            conn.close()
            return user_id
        except sqlite3.IntegrityError:
            conn.close()
            return None
    
    def get_user_by_username(self, username: str) -> Optional[Dict]:
        """Get user by username"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        cursor.execute("SELECT * FROM users WHERE username = ?", (username,))
        row = cursor.fetchone()
        
        if row:
            user = dict(row)
            conn.close()
            return user
        
        conn.close()
        return None
    
    def get_user_by_email(self, email: str) -> Optional[Dict]:
        """Get user by email"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        cursor.execute("SELECT * FROM users WHERE email = ?", (email,))
        row = cursor.fetchone()
        
        if row:
            user = dict(row)
            conn.close()
            return user
        
        conn.close()
        return None
    
    def get_user_by_id(self, user_id: int) -> Optional[Dict]:
        """Get user by ID"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
        row = cursor.fetchone()
        
        if row:
            user = dict(row)
            conn.close()
            return user
        
        conn.close()
        return None
    
    def update_last_login(self, user_id: int):
        """Update user's last login timestamp"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        cursor.execute(
            "UPDATE users SET last_login = ? WHERE id = ?",
            (datetime.now().isoformat(), user_id)
        )
        
        conn.commit()
        conn.close()
    
    def update_user_profile(self, user_id: int, full_name: Optional[str] = None,
                           bio: Optional[str] = None, avatar_url: Optional[str] = None,
                           theme_preference: Optional[str] = None) -> bool:
        """Update user profile information"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        updates = []
        params = []
        
        if full_name is not None:
            updates.append("full_name = ?")
            params.append(full_name)
        if bio is not None:
            updates.append("bio = ?")
            params.append(bio)
        if avatar_url is not None:
            updates.append("avatar_url = ?")
            params.append(avatar_url)
        if theme_preference is not None:
            updates.append("theme_preference = ?")
            params.append(theme_preference)
        
        if not updates:
            conn.close()
            return True
        
        query = f"UPDATE users SET {', '.join(updates)} WHERE id = ?"
        params.append(user_id)
        
        cursor.execute(query, params)
        success = cursor.rowcount > 0
        
        conn.commit()
        conn.close()
        
        return success
    
    # Clothing Management Methods (Updated for multi-user)
    
    def add_clothing_item(self, user_id: int, image_path: str, category: str, 
                         subcategory: str, colors: List[str], season: str, style: str,
                         purchase_date: Optional[str] = None, purchase_price: Optional[float] = None,
                         purchase_location: Optional[str] = None, brand: Optional[str] = None,
                         size: Optional[str] = None, max_wear_before_wash: int = 1) -> int:
        """Add a new clothing item to the database"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        colors_json = json.dumps(colors)
        
        # Set default max_wear_before_wash based on category
        if max_wear_before_wash == 1:
            category_lower = category.lower()
            if 'bottom' in category_lower or 'jeans' in subcategory.lower():
                max_wear_before_wash = 3
            elif 'jacket' in category_lower or 'blazer' in subcategory.lower() or 'sweater' in subcategory.lower():
                max_wear_before_wash = 5
            elif 'dress' in category_lower or 'shirt' in subcategory.lower():
                max_wear_before_wash = 1
        
        cursor.execute('''
            INSERT INTO clothing_items 
            (user_id, image_path, category, subcategory, colors, season, style,
             purchase_date, purchase_price, purchase_location, brand, size, max_wear_before_wash)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (user_id, image_path, category, subcategory, colors_json, season, style,
              purchase_date, purchase_price, purchase_location, brand, size, max_wear_before_wash))
        
        item_id = cursor.lastrowid
        conn.commit()
        conn.close()
        
        return item_id
    
    def get_all_items(self, user_id: int, category: Optional[str] = None, 
                     status: Optional[str] = None) -> List[Dict]:
        """Get all clothing items with optional filters"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        query = "SELECT * FROM clothing_items WHERE user_id = ?"
        params = [user_id]
        
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
        """Get a specific clothing item with calculated metrics"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        cursor.execute("SELECT * FROM clothing_items WHERE id = ?", (item_id,))
        row = cursor.fetchone()
        
        if row:
            item = dict(row)
            item["colors"] = json.loads(item["colors"])
            item["worn"] = bool(item["worn"])
            item["washed"] = bool(item["washed"])
            item["is_favorite"] = bool(item.get("is_favorite", False))
            
            # Calculate cost per wear
            if item.get("purchase_price") and item["times_worn"] > 0:
                item["cost_per_wear"] = round(float(item["purchase_price"]) / item["times_worn"], 2)
            else:
                item["cost_per_wear"] = item.get("purchase_price")
            
            # Calculate days since last worn
            if item.get("last_worn"):
                last_worn_date = datetime.fromisoformat(item["last_worn"])
                item["days_since_worn"] = (datetime.now() - last_worn_date).days
            else:
                item["days_since_worn"] = None
                
            # Calculate days since added
            if item.get("date_added"):
                added_date = datetime.fromisoformat(item["date_added"])
                item["days_owned"] = (datetime.now() - added_date).days
            else:
                item["days_owned"] = None
            
            # Update rotation category if needed
            item["rotation_category"] = self._calculate_rotation_category(
                item["times_worn"], 
                item["days_owned"] if item["days_owned"] else 0
            )
            
            conn.close()
            return item
        
        conn.close()
        return None
    
    def update_item_status(self, item_id: int, worn: Optional[bool] = None,
                          washed: Optional[bool] = None, wear_again: Optional[bool] = None,
                          occasion: Optional[str] = None, rating: Optional[int] = None) -> bool:
        """Update the worn/washed status of an item with multi-wear tracking"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        # Get current item state
        cursor.execute("""
            SELECT wear_again_count, max_wear_before_wash, times_worn, freshness_score 
            FROM clothing_items WHERE id = ?
        """, (item_id,))
        item = cursor.fetchone()
        
        if not item:
            conn.close()
            return False
        
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
                
                # Increment wear-again count
                updates.append("wear_again_count = wear_again_count + 1")
                
                # Add to wear history
                cursor.execute(
                    "INSERT INTO wear_history (item_id, occasion, rating) VALUES (?, ?, ?)",
                    (item_id, occasion, rating)
                )
                
                # Check if needs washing
                new_wear_count = item["wear_again_count"] + 1
                if new_wear_count >= item["max_wear_before_wash"]:
                    updates.append("washed = 0")
                    updates.append("physical_location = 'needs_wash'")
                
                # Update freshness score (decrease slightly with each wear)
                new_freshness = max(0.0, float(item["freshness_score"]) - 0.05)
                updates.append("freshness_score = ?")
                params.append(new_freshness)
        
        if wear_again is not None:
            # User decided item can be worn again without washing
            if wear_again:
                updates.append("washed = 1")  # Still considered "clean enough"
                updates.append("physical_location = 'closet'")
            else:
                # Send to laundry
                updates.append("washed = 0")
                updates.append("physical_location = 'laundry'")
        
        if washed is not None:
            updates.append("washed = ?")
            params.append(1 if washed else 0)
            
            if washed:
                # Reset wear-again count when washed
                updates.append("wear_again_count = 0")
                updates.append("freshness_score = 1.0")
                updates.append("physical_location = 'closet'")
        
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
    
    def get_statistics(self, user_id: int) -> Dict:
        """Get closet statistics for a specific user"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        # Total items
        cursor.execute("SELECT COUNT(*) as total FROM clothing_items WHERE user_id = ?", (user_id,))
        total = cursor.fetchone()["total"]
        
        # Items by category
        cursor.execute("""
            SELECT subcategory, COUNT(*) as count 
            FROM clothing_items 
            WHERE user_id = ?
            GROUP BY subcategory
        """, (user_id,))
        by_category = {row["subcategory"]: row["count"] for row in cursor.fetchall()}
        
        # Dirty items
        cursor.execute("SELECT COUNT(*) as dirty FROM clothing_items WHERE user_id = ? AND washed = 0", (user_id,))
        dirty = cursor.fetchone()["dirty"]
        
        # Most worn items
        cursor.execute("""
            SELECT id, category, times_worn 
            FROM clothing_items 
            WHERE user_id = ?
            ORDER BY times_worn DESC 
            LIMIT 5
        """, (user_id,))
        most_worn = [dict(row) for row in cursor.fetchall()]
        
        # Recently added
        cursor.execute("""
            SELECT COUNT(*) as recent 
            FROM clothing_items 
            WHERE user_id = ? AND date_added >= datetime('now', '-7 days')
        """, (user_id,))
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
    
    def _calculate_rotation_category(self, times_worn: int, days_owned: int) -> str:
        """Calculate rotation category based on wear frequency"""
        if days_owned == 0:
            return "new"
        
        wear_rate = times_worn / max(days_owned / 30, 1)  # wears per month
        
        if wear_rate >= 4:
            return "high"
        elif wear_rate >= 2:
            return "medium"
        elif wear_rate >= 0.5:
            return "low"
        else:
            return "neglected"
    
    def _calculate_freshness_score(self, times_worn: int, days_since_worn: Optional[int], 
                                   wear_again_count: int) -> float:
        """Calculate psychological freshness score (0.0 to 1.0)"""
        base_score = 1.0
        
        # Penalty for each wear
        wear_penalty = times_worn * 0.02
        
        # Recovery bonus for time not worn (1% per day up to 30 days)
        if days_since_worn:
            time_recovery = min(days_since_worn * 0.01, 0.30)
        else:
            time_recovery = 0
        
        # Penalty for wear-again without washing
        wear_again_penalty = wear_again_count * 0.10
        
        freshness = base_score - wear_penalty + time_recovery - wear_again_penalty
        return max(0.0, min(1.0, freshness))
    
    def update_freshness_scores(self, user_id: int):
        """Batch update freshness scores for all items"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT id, times_worn, last_worn, wear_again_count 
            FROM clothing_items 
            WHERE user_id = ?
        """, (user_id,))
        
        items = cursor.fetchall()
        
        for item in items:
            days_since_worn = None
            if item["last_worn"]:
                last_worn_date = datetime.fromisoformat(item["last_worn"])
                days_since_worn = (datetime.now() - last_worn_date).days
            
            freshness = self._calculate_freshness_score(
                item["times_worn"],
                days_since_worn,
                item["wear_again_count"]
            )
            
            cursor.execute(
                "UPDATE clothing_items SET freshness_score = ? WHERE id = ?",
                (freshness, item["id"])
            )
        
        conn.commit()
        conn.close()
    
    def get_neglected_items(self, user_id: int, days_threshold: int = 30) -> List[Dict]:
        """Get items that haven't been worn recently"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT * FROM clothing_items 
            WHERE user_id = ? 
            AND (
                (last_worn IS NULL AND date_added <= datetime('now', '-' || ? || ' days'))
                OR last_worn <= datetime('now', '-' || ? || ' days')
            )
            AND rotation_category IN ('low', 'neglected')
            ORDER BY last_worn ASC NULLS FIRST
            LIMIT 20
        """, (user_id, days_threshold, days_threshold))
        
        items = []
        for row in cursor.fetchall():
            item = dict(row)
            item["colors"] = json.loads(item["colors"])
            items.append(item)
        
        conn.close()
        return items
    
    def toggle_favorite(self, item_id: int) -> bool:
        """Toggle favorite status of an item"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        cursor.execute("SELECT is_favorite FROM clothing_items WHERE id = ?", (item_id,))
        row = cursor.fetchone()
        
        if not row:
            conn.close()
            return False
        
        new_status = not bool(row["is_favorite"])
        cursor.execute("UPDATE clothing_items SET is_favorite = ? WHERE id = ?", 
                      (1 if new_status else 0, item_id))
        
        conn.commit()
        conn.close()
        return True
    
    def add_to_laundry_queue(self, item_id: int, priority: str = "normal") -> int:
        """Add item to laundry queue"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        # Check if already in queue
        cursor.execute("""
            SELECT id FROM laundry_queue 
            WHERE item_id = ? AND status != 'ready'
        """, (item_id,))
        
        if cursor.fetchone():
            conn.close()
            return -1  # Already in queue
        
        cursor.execute("""
            INSERT INTO laundry_queue (item_id, priority)
            VALUES (?, ?)
        """, (item_id, priority))
        
        queue_id = cursor.lastrowid
        
        # Update item status
        cursor.execute("""
            UPDATE clothing_items 
            SET washed = 0, physical_location = 'laundry' 
            WHERE id = ?
        """, (item_id,))
        
        conn.commit()
        conn.close()
        return queue_id
    
    def get_laundry_queue(self, user_id: int) -> Dict:
        """Get laundry queue status"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT lq.*, ci.* 
            FROM laundry_queue lq
            JOIN clothing_items ci ON lq.item_id = ci.id
            WHERE ci.user_id = ?
            ORDER BY 
                CASE lq.priority 
                    WHEN 'urgent' THEN 1 
                    WHEN 'normal' THEN 2 
                    WHEN 'low' THEN 3 
                END,
                lq.added_date ASC
        """, (user_id,))
        
        items = []
        for row in cursor.fetchall():
            item = dict(row)
            item["colors"] = json.loads(item["colors"])
            items.append(item)
        
        # Group by status
        queued = [i for i in items if i["status"] == "queued"]
        washing = [i for i in items if i["status"] == "washing"]
        drying = [i for i in items if i["status"] == "drying"]
        
        conn.close()
        
        return {
            "queued": queued,
            "washing": washing,
            "drying": drying,
            "total": len(items)
        }
    
    def update_laundry_status(self, queue_id: int, status: str) -> bool:
        """Update laundry queue item status"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            UPDATE laundry_queue 
            SET status = ? 
            WHERE id = ?
        """, (status, queue_id))
        
        # If ready, update clothing item and remove from queue
        if status == "ready":
            cursor.execute("""
                UPDATE clothing_items 
                SET washed = 1, physical_location = 'closet', 
                    wear_again_count = 0, freshness_score = 1.0
                WHERE id = (SELECT item_id FROM laundry_queue WHERE id = ?)
            """, (queue_id,))
            
            cursor.execute("DELETE FROM laundry_queue WHERE id = ?", (queue_id,))
        
        success = cursor.rowcount > 0
        conn.commit()
        conn.close()
        return success


