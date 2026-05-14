export type User = {
  id: number;
  username: string;
  email: string;
  full_name?: string | null;
  theme_preference?: string;
};

export type ClothingItem = {
  id: number;
  user_id: number;
  image_path: string;
  thumbnail_path?: string | null;
  category: string;
  subcategory: string;
  colors: string[];
  season?: string | null;
  style?: string | null;
  worn?: boolean;
  washed?: boolean;
  times_worn?: number;
  is_favorite?: boolean;
  rotation_category?: string | null;
  brand?: string | null;
  size?: string | null;
  notes?: string | null;
  purchase_date?: string | null;
  purchase_price?: number | null;
  purchase_location?: string | null;
  cost_per_wear?: number | null;
};

export type ItemDetailsPatch = {
  brand?: string | null;
  size?: string | null;
  notes?: string | null;
  purchase_date?: string | null;
  purchase_price?: number | null;
  purchase_location?: string | null;
};

export type OutfitRecommendation = {
  items: ClothingItem[];
  score: number;
  occasion?: string;
};

export type ClosetStats = {
  total_items: number;
  clean_items: number;
  dirty_items: number;
  recently_added: number;
  by_category: Record<string, number>;
};
