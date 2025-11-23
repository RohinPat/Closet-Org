from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, FileResponse
import uvicorn
from pathlib import Path
import json
from datetime import datetime
from typing import List, Optional
import shutil

from models.clothing_classifier import ClothingClassifier
from models.outfit_recommender import OutfitRecommender
from database.db_manager import DatabaseManager

app = FastAPI(title="Closet-Org API", version="1.0.0")

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
classifier = ClothingClassifier()
outfit_recommender = OutfitRecommender()

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
    return FileResponse(str(FRONTEND_DIR / "index.html"))


@app.post("/api/upload-clothing")
async def upload_clothing(file: UploadFile = File(...)):
    """Upload and classify a clothing item"""
    try:
        # Save uploaded file
        file_path = UPLOAD_DIR / f"{datetime.now().timestamp()}_{file.filename}"
        with file_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Classify the clothing
        classification = classifier.classify(str(file_path))
        
        # Save to database
        item_id = db.add_clothing_item(
            image_path=str(file_path),
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
            "image_url": f"/uploads/{file_path.name}"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/closet")
async def get_closet(category: Optional[str] = None, status: Optional[str] = None):
    """Get all clothing items from virtual closet"""
    items = db.get_all_items(category=category, status=status)
    return {"items": items}


@app.get("/api/item/{item_id}")
async def get_item(item_id: int):
    """Get specific clothing item details"""
    item = db.get_item(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return item


@app.put("/api/item/{item_id}/status")
async def update_item_status(item_id: int, worn: Optional[bool] = None, washed: Optional[bool] = None):
    """Update wear and wash status of an item"""
    success = db.update_item_status(item_id, worn=worn, washed=washed)
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
async def recommend_outfit(occasion: Optional[str] = None, season: Optional[str] = None):
    """Get AI-recommended outfit combinations"""
    try:
        items = db.get_all_items(status="clean")
        outfits = outfit_recommender.generate_outfits(items, occasion=occasion, season=season)
        return {"outfits": outfits}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/stats")
async def get_stats():
    """Get closet statistics"""
    stats = db.get_statistics()
    return stats


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

