export type User = {

  id: number;

  username: string;

  email: string;

  full_name?: string | null;

  avatar_url?: string | null;

  bio?: string | null;

  theme_preference?: string;

  social_enabled?: boolean;

  app_mode?: 'normal' | 'closet_only' | string;

  default_tab?: string;

  default_closet_location_id?: number | null;

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

  trip_name?: string | null;

  trip_destination?: string | null;

  trip_start?: string | null;

  trip_end?: string | null;

};



export type TripLog = {

  name: string;

  destination?: string | null;

  start_date?: string | null;

  end_date?: string | null;

  post_count: number;

  cover_image_path?: string | null;

  latest_post_at?: string | null;

  posts: FitPost[];

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
  color_hexes?: string[];
  pattern?: string | null;
  laundry_state?: 'clean' | 'worn' | 'in_hamper' | 'washing' | 'drying' | string | null;

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

  care_label_text?: string | null;

  care_summary?: string | null;

  purchase_date?: string | null;

  purchase_price?: number | null;

  purchase_location?: string | null;

  storage_location?: string | null;

  closet_location_id?: number | null;

  lent_to?: string | null;

  lent_at?: string | null;

  lent_until?: string | null;

  cost_per_wear?: number | null;

  status?: 'owned' | 'wishlist' | null;

  wishlist_name?: string | null;

  wishlist_intent?: WishlistIntent | null;

  wishlist_url?: string | null;

  user_tags?: string[];

  packed_for_trip?: boolean;

  /** Socks, underwear, basics: one row with quantity + clean inventory */

  is_bulk?: boolean;

  quantity?: number;

  clean_count?: number;

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

  care_label_text?: string | null;

  care_summary?: string | null;

  purchase_date?: string | null;

  purchase_price?: number | null;

  purchase_location?: string | null;

  storage_location?: string | null;

  closet_location_id?: number | null;

  category?: string;

  subcategory?: string;

  colors?: string[];
  color_hexes?: string[];

  season?: string | null;

  style?: string | null;
  pattern?: string | null;
  laundry_state?: string | null;

  user_tags?: string[];

  packed_for_trip?: boolean;

  quantity?: number;

  clean_count?: number;

  status?: 'owned' | 'wishlist';

  wishlist_name?: string | null;

  wishlist_intent?: WishlistIntent | null;

  wishlist_url?: string | null;

};



export type ClosetLocation = {

  id: number;

  user_id: number;

  name: string;

  kind?: string | null;

  is_default: boolean;

  created_at?: string | null;

  updated_at?: string | null;

};



export type AppSettings = {

  social_enabled: boolean;

  app_mode: 'normal' | 'closet_only' | string;

  default_tab: string;

  default_closet_location_id?: number | null;

  theme_preference?: string | null;

};



export type AppSettingsPatch = Partial<AppSettings>;



export type BulkItemPayload = {

  name: string;

  subcategory: string;

  quantity: number;

  clean_count?: number;

  colors?: string[];

  style?: string;

  season?: string;

};



export type CsvImportResult = {

  success: boolean;

  created: number;

  item_ids: number[];

  skipped: { row: number; reason: string }[];

};



export type ManualClosetImportPayload = {

  title: string;

  subcategory?: string;

  colors?: string[];

  description?: string | null;

  tags?: string[];

};



export type ManualClosetImportResult = {

  success: boolean;

  created: number;

  item_id: number;

};



export type VisualSearchMatch = {

  score: number;

  item: ClothingItem;
  explanation?: string;

};

export type TripPackedItem = {
  item_id: number;
  packed: boolean;
  packed_at?: string | null;
  category?: string | null;
  subcategory?: string | null;
  thumbnail_path?: string | null;
  image_path?: string | null;
  colors?: string[];
};

export type Trip = {
  id: number;
  user_id: number;
  name: string;
  destination?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  activities: string[];
  auto_unpacked_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  items: TripPackedItem[];
  packed_count: number;
  item_count: number;
  progress: number;
};

export type TripPayload = {
  name: string;
  destination?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  activities?: string[];
  item_ids?: number[];
};

export type WearHistoryEntry = {
  id: number;
  item_id: number;
  worn_date: string;
  occasion?: string | null;
  rating?: number | null;
  notes?: string | null;
};

export type ReminderCard = {
  id: string | number;
  kind: 'lending' | 'prep' | string;
  title: string;
  detail?: string | null;
  due_date?: string | null;
  item_id?: number | null;
  plan_id?: number | null;
  thumbnail_path?: string | null;
};

export type DuplicateCandidate = {
  score: number;
  items: ClothingItem[];
};



export type PromoteBulkResult = {

  success: boolean;

  created_ids: number[];

  bulk_item: ClothingItem | null;

  bulk_removed: boolean;

};



export type OutfitRecommendation = {

  items: ClothingItem[];

  score: number;

  occasion?: string;

};



export type AiStylistRequest = {

  message: string;

  closet_location_id?: number | null;

  include_packed?: boolean;

  exclude_item_ids?: number[];

  pin_item_ids?: number[];

  lat?: number;

  lon?: number;

  weather_date?: string;

  location_name?: string;

};



export type AiStylistSuggestion = {

  title: string;

  outfit: OutfitRecommendation;

  rationale: string;

  signature: string;

};



export type AiStylistResponse = {

  message: string;

  source: 'local' | 'claude' | string;

  interpreted: {

    occasion?: string | null;

    season?: string | null;

    vibe?: string | null;

    novelty?: boolean;

    pin_item_ids?: number[];

    planning?: Record<string, unknown>;

  };

  suggestions: AiStylistSuggestion[];

  weather?: WeatherContext | null;

};



export type PlannedOutfitStatus = 'draft' | 'confirmed' | 'worn' | 'skipped';



export type PlannedOutfitItemRef = {

  id: number;

  category: string;

  subcategory: string;

  thumbnail_path?: string | null;

  image_path?: string | null;

  washed?: boolean;

  physical_location?: string | null;

  packed_for_trip?: boolean;

  lent_to?: string | null;

  is_bulk?: boolean;

  quantity?: number;

  clean_count?: number;

};



export type PlannedOutfitConflict = {

  item_id: number;

  kind: 'laundry' | 'lent' | 'packed' | 'double_booked' | string;

  message: string;

  plan_id?: number;

};



export type PlannedOutfit = {

  id: number;

  user_id: number;

  title: string;

  planned_for: string;

  occasion?: string | null;

  notes?: string | null;

  status: PlannedOutfitStatus;

  prep_clean: boolean;

  prep_packed: boolean;

  prep_steamed: boolean;

  prep_accessories: boolean;

  created_at?: string | null;

  updated_at?: string | null;

  item_ids: number[];

  items: PlannedOutfitItemRef[];

  conflicts: PlannedOutfitConflict[];

};



export type PlannedOutfitPayload = {

  title: string;

  planned_for: string;

  occasion?: string | null;

  notes?: string | null;

  status?: PlannedOutfitStatus;

  item_ids?: number[];

};



export type PlannedOutfitPatch = Partial<PlannedOutfitPayload> & {

  prep_clean?: boolean;

  prep_packed?: boolean;

  prep_steamed?: boolean;

  prep_accessories?: boolean;

};



export type WeatherContext = {

  location_name?: string | null;

  latitude: number;

  longitude: number;

  date: string;

  temperature_c?: number | null;

  apparent_temperature_c?: number | null;

  min_temp_c?: number | null;

  max_temp_c?: number | null;

  precipitation_probability?: number | null;

  wind_speed_kmh?: number | null;

  weather_code?: number | null;

  condition: string;

  derived_season: string;

  cold: boolean;

  hot: boolean;

  rainy: boolean;

  snowy: boolean;

  windy: boolean;

};



export type ForecastDay = {

  date: string;

  min_temp_c?: number | null;

  max_temp_c?: number | null;

  precipitation_probability?: number | null;

  condition: string;

};



export type WeatherLocation = {

  name: string;

  label: string;

  latitude: number;

  longitude: number;

  country?: string | null;

  admin1?: string | null;

};



export type ClosetComposition = {

  by_subcategory: Record<string, number>;

  by_style: Record<string, number>;
  by_season?: Record<string, number>;
  by_pattern?: Record<string, number>;

  color_buckets: Record<string, number>;

  item_count: number;

};



export type ClosetGap = {

  id: string;

  title: string;

  detail: string;

  priority: 'high' | 'medium' | 'low';

};



export type RetirementHint = {

  item_id: number;

  category?: string | null;

  subcategory?: string | null;

  thumbnail_path?: string | null;

  times_worn?: number;

  reasons: string[];

};



export type ClosetInsights = {

  gaps: ClosetGap[];

  retirement_candidates?: RetirementHint[];
  duplicate_candidates?: DuplicateCandidate[];

  composition: ClosetComposition;

};



export type FitCheckPairing = {

  score: number;

  hints: string[];

  item: ClothingItem;

};



export type ClosetStats = {

  total_items: number;

  clean_items: number;

  dirty_items: number;

  recently_added: number;

  by_category: Record<string, number>;

  best_cpw?: {

    id: number;

    category: string;

    subcategory: string;

    times_worn: number;

    purchase_price?: number | null;

    thumbnail_path?: string | null;

    image_path?: string | null;

    cost_per_wear?: number | null;

  }[];

};

