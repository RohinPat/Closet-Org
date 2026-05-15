export type User = {
  id: number;
  username: string;
  email: string;
  full_name?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
  theme_preference?: string;
};

export type PublicUser = {
  id: number;
  username: string;
  full_name?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
};

export type Relationship =
  | 'self'
  | 'friends'
  | 'request_sent'
  | 'request_received'
  | 'none';

export type PublicProfile = PublicUser & {
  created_at?: string | null;
  item_count: number;
  post_count: number;
  friend_count: number;
  relationship: Relationship;
  friendship_id?: number | null;
};

export type Friend = PublicUser & {
  since?: string | null;
};

export type FriendRequest = {
  friendship_id: number;
  created_at: string;
  user: PublicUser;
};

export type PostReaction = {
  emoji: string;
  count: number;
  mine: boolean;
};

export type PostItemRef = {
  id: number;
  category: string;
  subcategory: string;
  thumbnail_path?: string | null;
  image_path?: string | null;
};

export type FitPost = {
  id: number;
  user_id: number;
  image_path: string;
  caption?: string | null;
  created_at: string;
  item_ids: number[];
  items: PostItemRef[];
  author: PublicUser | null;
  reactions: PostReaction[];
  comment_count: number;
};

export type FitComment = {
  id: number;
  body: string;
  created_at: string;
  author: PublicUser;
};

export type ClothingItem = {
  id: number;
  user_id: number;
  image_path: string;
  thumbnail_path?: string | null;
  image_paths?: string[];
  thumbnail_paths?: (string | null)[];
  category: string;
  subcategory: string;
  colors: string[];
  season?: string | null;
  style?: string | null;
  worn?: boolean;
  washed?: boolean;
  times_worn?: number;
  last_worn?: string | null;
  date_added?: string | null;
  is_favorite?: boolean;
  rotation_category?: string | null;
  brand?: string | null;
  size?: string | null;
  notes?: string | null;
  purchase_date?: string | null;
  purchase_price?: number | null;
  purchase_location?: string | null;
  storage_location?: string | null;
  lent_to?: string | null;
  lent_at?: string | null;
  lent_until?: string | null;
  cost_per_wear?: number | null;
  status?: 'owned' | 'wishlist' | null;
  wishlist_name?: string | null;
  wishlist_intent?: WishlistIntent | null;
  wishlist_url?: string | null;
};

export type WishlistIntent = 'want' | 'gift' | 'saving' | 'sale_watch';

export type WishlistCreate = {
  name: string;
  category?: string;
  subcategory?: string;
  intent?: WishlistIntent | null;
  price?: number | null;
  url?: string | null;
};

export type WishlistPatch = {
  wishlist_name?: string | null;
  wishlist_intent?: WishlistIntent | null;
  wishlist_url?: string | null;
  brand?: string | null;
  size?: string | null;
  notes?: string | null;
  purchase_price?: number | null;
};

export type ItemDetailsPatch = {
  brand?: string | null;
  size?: string | null;
  notes?: string | null;
  purchase_date?: string | null;
  purchase_price?: number | null;
  purchase_location?: string | null;
  storage_location?: string | null;
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
