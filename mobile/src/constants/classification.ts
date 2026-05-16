/** Mirrors backend/models/clothing_classifier.py — keep in sync when the model changes. */

export const CLOTHING_CATEGORIES = [
  'T-Shirt',
  'Shirt',
  'Sweater',
  'Jacket',
  'Coat',
  'Pants',
  'Jeans',
  'Shorts',
  'Skirt',
  'Dress',
  'Shoes',
  'Sneakers',
  'Boots',
  'Sandals',
  'Accessories',
  'Hat',
  'Scarf',
  'Belt',
] as const;

export const CLOTHING_SUBCATEGORIES = [
  'Top',
  'Bottom',
  'Dress',
  'Footwear',
  'Accessory',
  'Other',
] as const;

export const CLOTHING_STYLES = [
  'Casual',
  'Formal',
  'Athletic',
  'Streetwear',
  'Business',
] as const;

export const CLOTHING_SEASONS = ['Winter', 'Summer', 'All-Season'] as const;

export const CLOTHING_COLORS = [
  'Black',
  'White',
  'Gray',
  'Red',
  'Blue',
  'Green',
  'Yellow',
  'Orange',
  'Purple',
  'Pink',
  'Brown',
  'Beige',
  'Navy',
  'Teal',
] as const;
