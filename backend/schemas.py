"""Pydantic request bodies for the API."""

from __future__ import annotations

from typing import (
    Annotated,
    Dict,
    List,
    Optional,
)
from pydantic import BaseModel, EmailStr, Field


# ---- Pydantic models ---------------------------------------------------------



class UserRegister(BaseModel):

    username: str = Field(..., min_length=3, max_length=30)

    email: EmailStr

    password: str = Field(..., min_length=1, max_length=512)

    full_name: Optional[str] = Field(default=None, max_length=120)


class UserLogin(BaseModel):

    username: str = Field(..., min_length=1, max_length=60)

    password: str = Field(..., min_length=1, max_length=512)


class UserProfile(BaseModel):

    full_name: Optional[str] = Field(default=None, max_length=120)

    email: Optional[EmailStr] = None

    bio: Optional[str] = Field(default=None, max_length=500)

    theme_preference: Optional[str] = Field(default=None, max_length=16)


class UserSettingsUpdate(BaseModel):

    social_enabled: Optional[bool] = None

    app_mode: Optional[str] = Field(default=None, max_length=24)

    default_tab: Optional[str] = Field(default=None, max_length=24)

    default_closet_location_id: Optional[int] = Field(default=None, ge=1)

    theme_preference: Optional[str] = Field(default=None, max_length=16)


class ClosetLocationCreate(BaseModel):

    name: str = Field(..., min_length=1, max_length=80)

    kind: Optional[str] = Field(default="home", max_length=32)

    is_default: Optional[bool] = False


class ClosetLocationUpdate(BaseModel):

    name: Optional[str] = Field(default=None, min_length=1, max_length=80)

    kind: Optional[str] = Field(default=None, max_length=32)

    is_default: Optional[bool] = None


class PasswordChange(BaseModel):

    current_password: str = Field(..., min_length=1, max_length=512)

    new_password: str = Field(..., min_length=1, max_length=512)


class AccountDelete(BaseModel):
    password: str = Field(..., min_length=1, max_length=512)


class PasswordForgot(BaseModel):

    email: EmailStr


class PasswordResetConfirm(BaseModel):

    token: str = Field(..., min_length=8, max_length=512)

    new_password: str = Field(..., min_length=1, max_length=512)


class ItemStatusUpdate(BaseModel):

    worn: Optional[bool] = None

    washed: Optional[bool] = None

    wear_again: Optional[bool] = None

    occasion: Optional[str] = Field(default=None, max_length=120)

    rating: Optional[int] = Field(default=None, ge=1, le=5)


class ItemDetailsUpdate(BaseModel):

    brand: Optional[str] = Field(default=None, max_length=80)

    size: Optional[str] = Field(default=None, max_length=20)

    notes: Optional[str] = Field(default=None, max_length=2000)

    care_label_text: Optional[str] = Field(default=None, max_length=4000)

    care_summary: Optional[str] = Field(default=None, max_length=1000)

    purchase_date: Optional[str] = Field(default=None, max_length=20)

    purchase_price: Optional[float] = Field(default=None, ge=0, le=1_000_000)

    purchase_location: Optional[str] = Field(default=None, max_length=120)

    storage_location: Optional[str] = Field(default=None, max_length=120)

    category: Optional[str] = Field(default=None, max_length=40)

    subcategory: Optional[str] = Field(default=None, max_length=40)

    colors: Optional[Annotated[List[str], Field(max_length=8)]] = None
    color_hexes: Optional[Annotated[List[str], Field(max_length=8)]] = None

    season: Optional[str] = Field(default=None, max_length=20)

    style: Optional[str] = Field(default=None, max_length=40)
    pattern: Optional[str] = Field(default=None, max_length=40)
    laundry_state: Optional[str] = Field(default=None, max_length=40)

    user_tags: Optional[Annotated[List[str], Field(max_length=20)]] = None

    packed_for_trip: Optional[bool] = None

    quantity: Optional[int] = Field(default=None, ge=1, le=999)

    clean_count: Optional[int] = Field(default=None, ge=0, le=999)

    closet_location_id: Optional[int] = Field(default=None, ge=1)

    status: Optional[str] = Field(default=None, max_length=20)

    wishlist_name: Optional[str] = Field(default=None, max_length=120)

    wishlist_intent: Optional[str] = Field(default=None, max_length=20)

    wishlist_url: Optional[str] = Field(default=None, max_length=500)


class PackedBulkUpdate(BaseModel):

    packed_for_trip: bool

    item_ids: Optional[List[int]] = None


class TripCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    destination: Optional[str] = Field(default=None, max_length=120)
    start_date: Optional[str] = Field(default=None, max_length=20)
    end_date: Optional[str] = Field(default=None, max_length=20)
    activities: Optional[Annotated[List[str], Field(max_length=20)]] = None
    item_ids: Optional[Annotated[List[int], Field(max_length=100)]] = None


class TripUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    destination: Optional[str] = Field(default=None, max_length=120)
    start_date: Optional[str] = Field(default=None, max_length=20)
    end_date: Optional[str] = Field(default=None, max_length=20)
    activities: Optional[Annotated[List[str], Field(max_length=20)]] = None
    item_ids: Optional[Annotated[List[int], Field(max_length=100)]] = None


class TripPackedUpdate(BaseModel):
    item_id: int = Field(..., ge=1)
    packed: bool


class ClassificationCorrection(BaseModel):
    corrected_data: Dict[str, object]


class PlannedOutfitCreate(BaseModel):

    title: str = Field(..., min_length=1, max_length=120)

    planned_for: str = Field(..., min_length=10, max_length=10)

    occasion: Optional[str] = Field(default=None, max_length=80)

    notes: Optional[str] = Field(default=None, max_length=1000)

    status: Optional[str] = Field(default="draft", max_length=20)

    item_ids: Optional[Annotated[List[int], Field(max_length=50)]] = None


class PlannedOutfitUpdate(BaseModel):

    title: Optional[str] = Field(default=None, min_length=1, max_length=120)

    planned_for: Optional[str] = Field(default=None, min_length=10, max_length=10)

    occasion: Optional[str] = Field(default=None, max_length=80)

    notes: Optional[str] = Field(default=None, max_length=1000)

    status: Optional[str] = Field(default=None, max_length=20)

    item_ids: Optional[Annotated[List[int], Field(max_length=50)]] = None

    prep_clean: Optional[bool] = None

    prep_packed: Optional[bool] = None

    prep_steamed: Optional[bool] = None

    prep_accessories: Optional[bool] = None


class BulkItemCreate(BaseModel):

    name: str = Field(..., min_length=1, max_length=120)

    subcategory: str = Field(..., min_length=1, max_length=40)

    quantity: int = Field(..., ge=1, le=999)

    clean_count: Optional[int] = Field(default=None, ge=0, le=999)

    colors: Optional[Annotated[List[str], Field(max_length=8)]] = None

    style: Optional[str] = Field(default="Casual", max_length=40)

    season: Optional[str] = Field(default="All-Season", max_length=20)


class CsvImportBody(BaseModel):

    csv_text: str = Field(..., min_length=1, max_length=200_000)


class ManualClosetImportBody(BaseModel):

    """Single closet row without CSV / photos — same persistence as spreadsheet import."""

    title: str = Field(..., min_length=1, max_length=120)

    subcategory: str = Field(default="Other", min_length=1, max_length=40)

    colors: Optional[List[str]] = Field(default=None, max_length=24)

    description: Optional[str] = Field(default=None, max_length=2000)

    tags: Optional[List[str]] = Field(default=None, max_length=48)


class PromoteBulkBody(BaseModel):

    count: int = Field(..., ge=1, le=999)


class ItemLendRequest(BaseModel):

    lent_to: str = Field(..., min_length=1, max_length=80)

    # ISO date string, e.g. "2026-06-01".

    lent_until: Optional[str] = Field(default=None, max_length=20)


class WishlistCreate(BaseModel):

    name: str = Field(..., min_length=1, max_length=120)

    category: Optional[str] = Field(default="Other", max_length=40)

    subcategory: Optional[str] = Field(default="Wishlist", max_length=40)

    intent: Optional[str] = Field(default=None, max_length=20)

    price: Optional[float] = Field(default=None, ge=0, le=1_000_000)

    url: Optional[str] = Field(default=None, max_length=500)


class WishlistUpdate(BaseModel):

    wishlist_name: Optional[str] = Field(default=None, max_length=120)

    wishlist_intent: Optional[str] = Field(default=None, max_length=20)

    wishlist_url: Optional[str] = Field(default=None, max_length=500)

    brand: Optional[str] = Field(default=None, max_length=80)

    size: Optional[str] = Field(default=None, max_length=20)

    notes: Optional[str] = Field(default=None, max_length=2000)

    purchase_price: Optional[float] = Field(default=None, ge=0, le=1_000_000)


class AiStylistRequest(BaseModel):

    message: str = Field(..., min_length=1, max_length=500)

    closet_location_id: Optional[int] = Field(default=None, ge=1)

    include_packed: Optional[bool] = False

    exclude_item_ids: Optional[List[int]] = None

    pin_item_ids: Optional[Annotated[List[int], Field(max_length=8)]] = None

    lat: Optional[float] = None

    lon: Optional[float] = None

    weather_date: Optional[str] = Field(default=None, max_length=20)

    location_name: Optional[str] = Field(default=None, max_length=120)


class AiStylistFeedbackRequest(BaseModel):

    item_signature: str = Field(..., min_length=1, max_length=120)

    useful: bool

    message: Optional[str] = Field(default=None, max_length=500)


class FriendRequestCreate(BaseModel):

    user_id: int = Field(..., ge=1)


class ReactionToggle(BaseModel):

    emoji: str = Field(..., min_length=1, max_length=16)


class CommentCreate(BaseModel):

    body: str = Field(..., min_length=1, max_length=1000)
