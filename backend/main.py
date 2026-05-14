from fastapi import FastAPI, File, UploadFile, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel, EmailStr
import uvicorn
from pathlib import Path
import json
from datetime import datetime
from typing import List, Optional
import shutil

from models.outfit_recommender import OutfitRecommender
from database.db_manager import DatabaseManager
from auth import (
    hash_password, 
    verify_password, 
    create_access_token, 
    get_current_user,
    get_optional_user
)

app = FastAPI(title="Closet-Org API", version="1.0.0")

# Pydantic Models for Request/Response
class UserRegister(BaseModel):
    username: str
    email: EmailStr
    password: str
    full_name: Optional[str] = None

class UserLogin(BaseModel):
    username: str
    password: str

class UserProfile(BaseModel):
    full_name: Optional[str] = None
    bio: Optional[str] = None
    theme_preference: Optional[str] = None

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize components
db = DatabaseManager()
outfit_recommender = OutfitRecommender()

_classifier = None

def get_classifier():
    global _classifier
    if _classifier is None:
        from models.clothing_classifier import ClothingClassifier
        _classifier = ClothingClassifier()
    return _classifier

# Create necessary directories (relative to project root)
BASE_DIR = Path(__file__).resolve().parent.parent
UPLOAD_DIR = BASE_DIR / "uploads"
FRONTEND_DIR = BASE_DIR / "frontend"
UPLOAD_DIR.mkdir(exist_ok=True)

# Mount static files
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")
app.mount("/frontend", StaticFiles(directory=str(FRONTEND_DIR)), name="frontend")


@app.get("/")
async def root():
    return FileResponse(str(FRONTEND_DIR / "landing.html"))


@app.get("/app")
async def app_page():
    return FileResponse(str(FRONTEND_DIR / "index.html"))


@app.get("/login")
async def login_page():
    return FileResponse(str(FRONTEND_DIR / "login.html"))


@app.get("/register")
async def register_page():
    return FileResponse(str(FRONTEND_DIR / "register.html"))


# Authentication Endpoints

@app.post("/api/auth/register")
async def register(user_data: UserRegister):
    """Register a new user"""
    # Check if username or email already exists
    if db.get_user_by_username(user_data.username):
        raise HTTPException(status_code=400, detail="Username already exists")
    
    if db.get_user_by_email(user_data.email):
        raise HTTPException(status_code=400, detail="Email already exists")
    
    # Hash password and create user
    password_hash = hash_password(user_data.password)
    user_id = db.create_user(
        username=user_data.username,
        email=user_data.email,
        password_hash=password_hash,
        full_name=user_data.full_name
    )
    
    if user_id is None:
        raise HTTPException(status_code=500, detail="Failed to create user")
    
    # Create access token
    access_token = create_access_token(data={
        "user_id": user_id,
        "username": user_data.username
    })
    
    return {
        "success": True,
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user_id,
            "username": user_data.username,
            "email": user_data.email,
            "full_name": user_data.full_name
        }
    }


@app.post("/api/auth/login")
async def login(credentials: UserLogin):
    """Login user"""
    user = db.get_user_by_username(credentials.username)
    
    if not user or not verify_password(credentials.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    
    # Update last login
    db.update_last_login(user["id"])
    
    # Create access token
    access_token = create_access_token(data={
        "user_id": user["id"],
        "username": user["username"]
    })
    
    return {
        "success": True,
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user["id"],
            "username": user["username"],
            "email": user["email"],
            "full_name": user.get("full_name"),
            "avatar_url": user.get("avatar_url"),
            "bio": user.get("bio"),
            "theme_preference": user.get("theme_preference", "light")
        }
    }


@app.get("/api/auth/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    """Get current user profile"""
    user = db.get_user_by_id(current_user["user_id"])
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Don't return password hash
    user_data = {
        "id": user["id"],
        "username": user["username"],
        "email": user["email"],
        "full_name": user.get("full_name"),
        "avatar_url": user.get("avatar_url"),
        "bio": user.get("bio"),
        "theme_preference": user.get("theme_preference", "light"),
        "created_at": user.get("created_at"),
        "last_login": user.get("last_login")
    }
    
    return user_data


@app.put("/api/auth/profile")
async def update_profile(profile_data: UserProfile, current_user: dict = Depends(get_current_user)):
    """Update user profile"""
    success = db.update_user_profile(
        user_id=current_user["user_id"],
        full_name=profile_data.full_name,
        bio=profile_data.bio,
        theme_preference=profile_data.theme_preference
    )
    
    if not success:
        raise HTTPException(status_code=500, detail="Failed to update profile")
    
    return {"success": True}


# Clothing Management Endpoints

@app.post("/api/upload-clothing")
async def upload_clothing(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Upload and classify a clothing item"""
    try:
        # Save uploaded file
        file_path = UPLOAD_DIR / f"{datetime.now().timestamp()}_{file.filename}"
        with file_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # Classify the clothing (torch loaded lazily on first upload)
        classification = get_classifier().classify(str(file_path))

        # Background-removed thumbnail. Best-effort — falls back to original
        # on the frontend if rembg can't produce one.
        from models.clothing_classifier import generate_cutout_thumbnail
        thumb_path = file_path.with_name(file_path.stem + ".thumb.png")
        thumb_ok = generate_cutout_thumbnail(str(file_path), str(thumb_path))
        thumbnail_path_str = str(thumb_path) if thumb_ok else None

        # Save to database with user_id
        item_id = db.add_clothing_item(
            user_id=current_user["user_id"],
            image_path=str(file_path),
            thumbnail_path=thumbnail_path_str,
            category=classification["category"],
            subcategory=classification["subcategory"],
            colors=classification["colors"],
            season=classification["season"],
            style=classification["style"]
        )

        return {
            "success": True,
            "item_id": item_id,
            "classification": classification,
            "image_url": f"/uploads/{file_path.name}",
            "thumbnail_url": f"/uploads/{thumb_path.name}" if thumb_ok else None,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/closet")
async def get_closet(
    category: Optional[str] = None, 
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get all clothing items from virtual closet"""
    items = db.get_all_items(
        user_id=current_user["user_id"],
        category=category, 
        status=status
    )
    return {"items": items}


@app.get("/api/item/{item_id}")
async def get_item(item_id: int):
    """Get specific clothing item details"""
    item = db.get_item(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return item


class ItemStatusUpdate(BaseModel):
    worn: Optional[bool] = None
    washed: Optional[bool] = None
    wear_again: Optional[bool] = None
    occasion: Optional[str] = None
    rating: Optional[int] = None


class ItemDetailsUpdate(BaseModel):
    brand: Optional[str] = None
    size: Optional[str] = None
    notes: Optional[str] = None
    purchase_date: Optional[str] = None
    purchase_price: Optional[float] = None
    purchase_location: Optional[str] = None

@app.put("/api/item/{item_id}/status")
async def update_item_status(item_id: int, status_update: ItemStatusUpdate):
    """Update wear and wash status of an item with multi-wear tracking"""
    success = db.update_item_status(
        item_id, 
        worn=status_update.worn, 
        washed=status_update.washed,
        wear_again=status_update.wear_again,
        occasion=status_update.occasion,
        rating=status_update.rating
    )
    if not success:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"success": True, "item_id": item_id}


@app.put("/api/item/{item_id}")
async def update_item_details(
    item_id: int,
    details: ItemDetailsUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Patch user-editable metadata (brand, size, notes, purchase fields)."""
    # exclude_unset so missing keys mean "leave alone" rather than "set to NULL".
    patch = details.dict(exclude_unset=True)
    if not patch:
        raise HTTPException(status_code=400, detail="No fields to update")

    success = db.update_item_details(
        item_id=item_id,
        user_id=current_user["user_id"],
        **patch,
    )
    if not success:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"success": True, "item_id": item_id}


@app.delete("/api/item/{item_id}")
async def delete_item(item_id: int):
    """Delete a clothing item"""
    success = db.delete_item(item_id)
    if not success:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"success": True}


@app.get("/api/outfits/recommend")
async def recommend_outfit(
    occasion: Optional[str] = None, 
    season: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get AI-recommended outfit combinations"""
    try:
        items = db.get_all_items(
            user_id=current_user["user_id"],
            status="clean"
        )
        outfits = outfit_recommender.generate_outfits(items, occasion=occasion, season=season)
        return {"outfits": outfits}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/stats")
async def get_stats(current_user: dict = Depends(get_current_user)):
    """Get closet statistics"""
    stats = db.get_statistics(user_id=current_user["user_id"])
    return stats


@app.get("/api/neglected-items")
async def get_neglected_items(
    days: int = 30,
    current_user: dict = Depends(get_current_user)
):
    """Get items that haven't been worn recently"""
    items = db.get_neglected_items(user_id=current_user["user_id"], days_threshold=days)
    return {"items": items}


@app.put("/api/item/{item_id}/favorite")
async def toggle_favorite(item_id: int, current_user: dict = Depends(get_current_user)):
    """Toggle favorite status of an item"""
    success = db.toggle_favorite(item_id)
    if not success:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"success": True}


@app.get("/api/laundry")
async def get_laundry_queue(current_user: dict = Depends(get_current_user)):
    """Get laundry queue status"""
    queue = db.get_laundry_queue(user_id=current_user["user_id"])
    return queue


@app.post("/api/laundry/add/{item_id}")
async def add_to_laundry(
    item_id: int, 
    priority: str = "normal",
    current_user: dict = Depends(get_current_user)
):
    """Add item to laundry queue"""
    queue_id = db.add_to_laundry_queue(item_id, priority)
    if queue_id == -1:
        raise HTTPException(status_code=400, detail="Item already in laundry queue")
    return {"success": True, "queue_id": queue_id}


@app.put("/api/laundry/{queue_id}/status")
async def update_laundry_status(
    queue_id: int,
    status: str,
    current_user: dict = Depends(get_current_user)
):
    """Update laundry queue item status"""
    if status not in ["queued", "washing", "drying", "ready"]:
        raise HTTPException(status_code=400, detail="Invalid status")
    
    success = db.update_laundry_status(queue_id, status)
    if not success:
        raise HTTPException(status_code=404, detail="Queue item not found")
    return {"success": True}


@app.post("/api/refresh-scores")
async def refresh_freshness_scores(current_user: dict = Depends(get_current_user)):
    """Refresh freshness scores for all user items"""
    db.update_freshness_scores(user_id=current_user["user_id"])
    return {"success": True}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

