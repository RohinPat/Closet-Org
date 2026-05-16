import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import type { CompositeNavigationProp } from '@react-navigation/native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MainTabParamList, AppStackParamList } from '../navigation/RootNavigator';
import * as api from '../api/client';
import type { ClothingItem, ClosetLocation, VisualSearchMatch } from '../api/types';
import { itemThumbnailUrl } from '../config';
import { imagePickerAssetToUpload } from '../utils/imageUpload';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tabTopPadding } from '../utils/screenSpacing';
import {
  GlassButton,
  GlassInputContainer,
  ScreenBackground,
} from '../components/Glass';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import {
  cycleDensity,
  cycleSort,
  densityColumns,
  densityLabel,
  densityMaxWidth,
  sortLabel,
  useDensityPref,
  useLayoutPref,
  useSortPref,
  type Density,
  type SortKey,
} from '../preferences';
import {
  radii,
  shadow,
  spacing,
  typography,
  type ThemeColors,
  type ThemeSurface,
} from '../theme';

type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'ClosetTab'>,
  NativeStackNavigationProp<AppStackParamList>
>;

type FilterKey = 'clean' | 'wash' | 'favorites' | 'lent' | 'packed';

const FILTER_OPTIONS: { key: FilterKey; label: string }[] = [
  { key: 'clean', label: 'Clean' },
  { key: 'wash', label: 'Needs wash' },
  { key: 'favorites', label: 'Favorites' },
  { key: 'lent', label: 'Lent' },
  { key: 'packed', label: 'Packed' },
];

const DENSITY_ICON: Record<Density, keyof typeof Ionicons.glyphMap> = {
  list: 'square-outline',
  comfy: 'grid-outline',
  compact: 'apps-outline',
  dense: 'apps',
};

const RAIL_SECTION_ORDER = [
  'Top',
  'Bottom',
  'Dress',
  'Footwear',
  'Accessory',
  'Other',
];

const RAIL_CARD_WIDTH = 140;

// Display swatches for the named color buckets used by the classifier.
// Mirrors backend/models/clothing_classifier.py COLOR_MAP minus the alpha tweaks.
const COLOR_SWATCH: Record<string, string> = {
  Black: '#1a1a1a',
  White: '#f3f3f3',
  Gray: '#909090',
  Red: '#c8201e',
  Blue: '#2846c8',
  Green: '#2c8c3c',
  Yellow: '#f0dc3c',
  Orange: '#e68c28',
  Purple: '#783296',
  Pink: '#ebafb4',
  Brown: '#784b28',
  Beige: '#dcc8aa',
  Navy: '#141e50',
  Teal: '#1e8282',
};

function colorSwatch(name: string): string {
  return COLOR_SWATCH[name] || '#888';
}

function itemMatchesQuery(item: ClothingItem, q: string): boolean {
  if (!q) return true;
  const haystack = [
    item.category,
    item.subcategory,
    item.style ?? '',
    item.season ?? '',
    item.brand ?? '',
    item.notes ?? '',
    ...(item.colors || []),
    ...(item.user_tags || []),
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
}

function itemCpw(item: ClothingItem): number | null {
  if (typeof item.cost_per_wear === 'number') return item.cost_per_wear;
  const price = item.purchase_price;
  const worn = item.times_worn ?? 0;
  if (typeof price === 'number' && price > 0 && worn > 0) {
    return price / worn;
  }
  return null;
}

type NeglectTier = 'mild' | 'moderate' | 'severe';

// Days since the item was last worn. Items that have never been worn fall back
// to date_added so the badge can surface "never worn but added a while ago"
// items. Returns null if there's no usable reference date. SQLite emits
// "YYYY-MM-DD HH:MM:SS" which Hermes' Date.parse rejects — normalize to ISO.
function daysSinceWorn(item: ClothingItem): number | null {
  const ref = item.last_worn || item.date_added;
  if (!ref) return null;
  const iso = ref.includes('T') ? ref : ref.replace(' ', 'T');
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  const diff = Date.now() - then;
  if (diff < 0) return 0;
  return Math.floor(diff / 86_400_000);
}

function neglectTier(days: number | null): NeglectTier | null {
  if (days == null) return null;
  if (days >= 90) return 'severe';
  if (days >= 60) return 'moderate';
  if (days >= 30) return 'mild';
  return null;
}

function neglectLabel(item: ClothingItem, days: number): string {
  const everWorn = (item.times_worn ?? 0) > 0 && !!item.last_worn;
  if (!everWorn) return 'Never worn';
  return `${days}d unworn`;
}

function applyFilters(
  items: ClothingItem[],
  filters: Set<FilterKey>,
  categories: Set<string>,
  colors: Set<string>,
  locations: Set<string>,
  query: string
): ClothingItem[] {
  const q = query.trim().toLowerCase();
  return items.filter((item) => {
    if (filters.has('clean') && !item.washed) return false;
    if (filters.has('wash') && item.washed) return false;
    if (filters.has('favorites') && !item.is_favorite) return false;
    if (filters.has('lent') && !item.lent_to) return false;
    if (filters.has('packed') && !item.packed_for_trip) return false;
    if (categories.size > 0 && !categories.has(item.category)) return false;
    if (colors.size > 0) {
      const hasMatch = (item.colors || []).some((c) => colors.has(c));
      if (!hasMatch) return false;
    }
    if (locations.size > 0) {
      const loc = item.storage_location?.trim() ?? '';
      if (!loc || !locations.has(loc)) return false;
    }
    return itemMatchesQuery(item, q);
  });
}

function sortItems(items: ClothingItem[], sort: SortKey): ClothingItem[] {
  const copy = [...items];
  switch (sort) {
    case 'recent':
      // date_added DESC, fall back to id (auto-increment) to keep stable order.
      return copy.sort((a, b) => {
        const da = a.date_added ?? '';
        const db = b.date_added ?? '';
        if (da === db) return b.id - a.id;
        return db.localeCompare(da);
      });
    case 'most_worn':
      return copy.sort((a, b) => (b.times_worn ?? 0) - (a.times_worn ?? 0));
    case 'neglected':
      // Longest unworn first. Items never worn rank just below truly stale
      // items so the user still sees them.
      return copy.sort((a, b) => {
        const aa = a.last_worn ?? '';
        const bb = b.last_worn ?? '';
        if (aa === '' && bb === '') return 0;
        if (aa === '') return -1;
        if (bb === '') return 1;
        return aa.localeCompare(bb);
      });
    case 'cpw':
      // Lower CPW = better value; items with no CPW yet go last.
      return copy.sort((a, b) => {
        const ca = itemCpw(a);
        const cb = itemCpw(b);
        if (ca === null && cb === null) return 0;
        if (ca === null) return 1;
        if (cb === null) return -1;
        return ca - cb;
      });
  }
}

type ChipProps = {
  label: string;
  active: boolean;
  onPress: () => void;
};

function FilterChip({ label, active, onPress }: ChipProps) {
  const { colors, surface } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        chipStyles.chip,
        { transform: [{ scale: pressed ? 0.96 : 1 }] },
      ]}
    >
      <BlurView
        intensity={active ? 0 : 30}
        tint={surface.blurTint}
        style={[StyleSheet.absoluteFill, { borderRadius: radii.pill }]}
      />
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: active ? colors.accent : surface.chipInactive,
            borderRadius: radii.pill,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: active ? colors.accent : surface.chipInactiveBorder,
          },
        ]}
      />
      <Text
        style={[
          chipStyles.chipText,
          { color: active ? '#fff' : colors.text },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

type ColorChipProps = {
  name: string;
  active: boolean;
  onPress: () => void;
};

function ColorChip({ name, active, onPress }: ColorChipProps) {
  const { colors, surface } = useTheme();
  const swatch = colorSwatch(name);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        chipStyles.colorChip,
        { transform: [{ scale: pressed ? 0.96 : 1 }] },
      ]}
    >
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: active ? colors.accent : surface.chipInactive,
            borderRadius: radii.pill,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: active ? colors.accent : surface.chipInactiveBorder,
          },
        ]}
      />
      <View
        style={[
          chipStyles.swatch,
          {
            backgroundColor: swatch,
            borderColor: active ? '#fff' : surface.chipInactiveBorder,
          },
        ]}
      />
      <Text
        style={[
          chipStyles.chipText,
          { color: active ? '#fff' : colors.text },
        ]}
      >
        {name}
      </Text>
    </Pressable>
  );
}

export function ClosetScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const headerPad = tabTopPadding(insets);
  const { colors, surface } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [density, setDensity] = useDensityPref();
  const [sort, setSort] = useSortPref();
  const [layout, setLayout] = useLayoutPref();
  const numColumns = densityColumns(density);
  const cardMaxWidth = densityMaxWidth(density);

  const [items, setItems] = useState<ClothingItem[]>([]);
  const [closetLocations, setClosetLocations] = useState<ClosetLocation[]>([]);
  const [activeClosetLocationId, setActiveClosetLocationId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Set<FilterKey>>(() => new Set());
  const [categoryFilters, setCategoryFilters] = useState<Set<string>>(
    () => new Set()
  );
  const [colorFilters, setColorFilters] = useState<Set<string>>(() => new Set());
  const [locationFilters, setLocationFilters] = useState<Set<string>>(
    () => new Set()
  );
  const [query, setQuery] = useState('');
  const [stickyHeight, setStickyHeight] = useState(108);
  const [visualOpen, setVisualOpen] = useState(false);
  const [visualMatches, setVisualMatches] = useState<VisualSearchMatch[]>([]);
  const [visualHint, setVisualHint] = useState<string | null>(null);
  const [visualBusy, setVisualBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [data, locs, settings] = await Promise.all([
        api.fetchCloset(),
        api.fetchClosetLocations(),
        api.fetchSettings(),
      ]);
      setItems(data.items);
      setClosetLocations(locs.locations);
      setActiveClosetLocationId((prev) =>
        prev === null ? settings.default_closet_location_id ?? null : prev
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load closet');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load])
  );

  function onRefresh() {
    setRefreshing(true);
    load();
  }

  async function pickInspoAndSearch() {
    const lib = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!lib.granted) {
      Alert.alert(
        'Permission needed',
        'Allow photo library access to search your closet by image.'
      );
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      preferredAssetRepresentationMode:
        ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    });
    if (picked.canceled || !picked.assets?.[0]) return;
    setVisualBusy(true);
    setVisualHint(null);
    try {
      const photo = await imagePickerAssetToUpload(picked.assets[0], 'visual');
      const data = await api.postVisualSearch(photo);
      setVisualMatches(data.matches);
      setVisualHint(data.hint ?? null);
      setVisualOpen(true);
    } catch (e) {
      Alert.alert(
        'Visual search',
        e instanceof Error ? e.message : 'Could not search — try another photo.'
      );
    } finally {
      setVisualBusy(false);
    }
  }

  function toggleFilter(key: FilterKey) {
    setFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else {
        if (key === 'clean') next.delete('wash');
        if (key === 'wash') next.delete('clean');
        next.add(key);
      }
      return next;
    });
  }

  function toggleSetValue<T>(
    setter: React.Dispatch<React.SetStateAction<Set<T>>>,
    value: T
  ) {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  // Derive the chip universes from the current closet.
  const availableCategories = useMemo(() => {
    const seen = new Map<string, number>();
    for (const it of items) {
      seen.set(it.category, (seen.get(it.category) ?? 0) + 1);
    }
    return [...seen.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([k]) => k);
  }, [items]);

  const availableColors = useMemo(() => {
    const seen = new Map<string, number>();
    for (const it of items) {
      for (const c of it.colors || []) {
        seen.set(c, (seen.get(c) ?? 0) + 1);
      }
    }
    return [...seen.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([k]) => k);
  }, [items]);

  const availableLocations = useMemo(() => {
    const seen = new Map<string, number>();
    for (const it of items) {
      const loc = it.storage_location?.trim();
      if (!loc) continue;
      seen.set(loc, (seen.get(loc) ?? 0) + 1);
    }
    return [...seen.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([k]) => k);
  }, [items]);

  const visibleItems = useMemo(() => {
    const locationScoped =
      activeClosetLocationId == null
        ? items
        : items.filter((item) => item.closet_location_id === activeClosetLocationId);
    const filtered = applyFilters(
      locationScoped,
      filters,
      categoryFilters,
      colorFilters,
      locationFilters,
      query
    );
    return sortItems(filtered, sort);
  }, [
    items,
    activeClosetLocationId,
    filters,
    categoryFilters,
    colorFilters,
    locationFilters,
    query,
    sort,
  ]);

  const isList = numColumns === 1;
  const isDense = numColumns >= 3;

  const renderItem = useCallback(
    ({ item }: { item: ClothingItem }) => {
      const uri = itemThumbnailUrl(item);
      const days = daysSinceWorn(item);
      const tier = neglectTier(days);
      return (
        <Pressable
          style={({ pressed }) => [
            styles.card,
            { maxWidth: cardMaxWidth as any },
            isList && styles.cardList,
            shadow.card,
            { transform: [{ scale: pressed ? 0.98 : 1 }] },
          ]}
          onPress={() => navigation.navigate('ItemDetail', { item })}
        >
          <View style={styles.thumbWrap}>
            {uri ? (
              <Image
                source={{ uri }}
                style={[styles.thumb, isList && styles.thumbList]}
                resizeMode="contain"
              />
            ) : (
              <View
                style={[
                  styles.thumb,
                  isList && styles.thumbList,
                  styles.thumbPlaceholder,
                ]}
              />
            )}
            {item.is_favorite ? (
              <View style={styles.favBadge}>
                <BlurView
                  intensity={50}
                  tint={surface.blurTint}
                  style={StyleSheet.absoluteFill}
                />
                <View
                  style={[
                    StyleSheet.absoluteFill,
                    {
                      backgroundColor: surface.favBadgeBg,
                      borderRadius: radii.pill,
                    },
                  ]}
                />
                <Text style={styles.favBadgeText}>★</Text>
              </View>
            ) : null}
            {!item.washed ? (
              <View style={styles.dirtyBadge}>
                <Text style={styles.dirtyText}>
                  {isDense ? '!' : 'Needs wash'}
                </Text>
              </View>
            ) : null}
            {item.lent_to ? (
              <View style={styles.lentBadge}>
                <Text style={styles.lentText}>
                  {isDense ? '↗' : `Lent · ${item.lent_to}`}
                </Text>
              </View>
            ) : null}
            {item.packed_for_trip ? (
              <View style={styles.packedBadge}>
                <Text style={styles.packedText}>
                  {isDense ? '✈' : 'Packed'}
                </Text>
              </View>
            ) : null}
            {tier && !isDense ? (
              <View
                style={[
                  styles.neglectBadge,
                  tier === 'severe'
                    ? styles.neglectSevere
                    : tier === 'moderate'
                    ? styles.neglectModerate
                    : styles.neglectMild,
                ]}
              >
                <Text
                  style={[
                    styles.neglectText,
                    tier === 'severe'
                      ? styles.neglectTextSevere
                      : tier === 'moderate'
                      ? styles.neglectTextModerate
                      : styles.neglectTextMild,
                  ]}
                >
                  {neglectLabel(item, days!)}
                </Text>
              </View>
            ) : null}
          </View>
          <View style={styles.cardBody}>
            <Text
              style={[styles.cardTitle, isList && styles.cardTitleList]}
              numberOfLines={1}
            >
              {item.category}
            </Text>
            <Text style={styles.cardSub} numberOfLines={1}>
              {item.subcategory}
            </Text>
            {!isDense ? (
              <Text style={styles.cardMeta} numberOfLines={1}>
                {(item.colors || []).join(' · ')}
              </Text>
            ) : null}
            {item.is_bulk ? (
              <Text style={styles.bulkMeta} numberOfLines={1}>
                ×{item.quantity ?? 1} · {item.clean_count ?? 0} clean
              </Text>
            ) : null}
          </View>
        </Pressable>
      );
    },
    [
      cardMaxWidth,
      isDense,
      isList,
      navigation,
      styles,
      surface,
    ]
  );

  const renderRailCard = useCallback(
    ({ item }: { item: ClothingItem }) => {
      const uri = itemThumbnailUrl(item);
      return (
        <Pressable
          style={({ pressed }) => [
            styles.railCard,
            shadow.card,
            { transform: [{ scale: pressed ? 0.98 : 1 }] },
          ]}
          onPress={() => navigation.navigate('ItemDetail', { item })}
        >
          <View style={styles.thumbWrap}>
            {uri ? (
              <Image source={{ uri }} style={styles.railThumb} resizeMode="contain" />
            ) : (
              <View style={[styles.railThumb, styles.thumbPlaceholder]} />
            )}
            {item.packed_for_trip ? (
              <View style={styles.packedBadge}>
                <Text style={styles.packedText}>Packed</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.railBody}>
            <Text style={styles.railTitle} numberOfLines={1}>
              {item.category}
            </Text>
            <Text style={styles.railSub} numberOfLines={1}>
              {item.subcategory}
            </Text>
            {item.is_bulk ? (
              <Text style={styles.railBulk} numberOfLines={1}>
                ×{item.quantity ?? 1} · {item.clean_count ?? 0} clean
              </Text>
            ) : null}
          </View>
        </Pressable>
      );
    },
    [navigation, styles]
  );

  const railSections = useMemo(() => {
    if (layout !== 'rails') return [];
    const buckets = new Map<string, ClothingItem[]>();
    for (const it of visibleItems) {
      const key = it.subcategory || 'Other';
      const list = buckets.get(key) ?? [];
      list.push(it);
      buckets.set(key, list);
    }
    const present = [...buckets.keys()];
    present.sort((a, b) => {
      const ai = RAIL_SECTION_ORDER.indexOf(a);
      const bi = RAIL_SECTION_ORDER.indexOf(b);
      const aRank = ai === -1 ? RAIL_SECTION_ORDER.length : ai;
      const bRank = bi === -1 ? RAIL_SECTION_ORDER.length : bi;
      if (aRank !== bRank) return aRank - bRank;
      return a.localeCompare(b);
    });
    return present.map((k) => ({ title: k, data: buckets.get(k)! }));
  }, [layout, visibleItems]);

  const filterActive =
    filters.size > 0 ||
    activeClosetLocationId !== null ||
    categoryFilters.size > 0 ||
    colorFilters.size > 0 ||
    locationFilters.size > 0 ||
    query.length > 0;

  function clearAll() {
    setFilters(new Set());
    setCategoryFilters(new Set());
    setColorFilters(new Set());
    setLocationFilters(new Set());
    setActiveClosetLocationId(null);
    setQuery('');
  }

  if (loading && items.length === 0) {
    return (
      <View style={{ flex: 1 }}>
        <ScreenBackground />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </View>
    );
  }

  if (error && items.length === 0) {
    return (
      <View style={{ flex: 1 }}>
        <ScreenBackground />
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <GlassButton title="Retry" onPress={load} fullWidth={false} />
        </View>
      </View>
    );
  }

  const titleHeader = (
    <View style={styles.titleRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.heading}>Your Closet</Text>
        <Text style={styles.count}>
          {visibleItems.length} of {items.length}{' '}
          {items.length === 1 ? 'item' : 'items'}
          {filterActive ? ' · filtered' : ''}
          {' · '}
          {sortLabel(sort)}
        </Text>
      </View>
      <Pressable
        onPress={() => setLayout(layout === 'grid' ? 'rails' : 'grid')}
        accessibilityLabel={`View: ${layout}. Tap to change.`}
        style={({ pressed }) => [
          styles.headerBtn,
          { opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <Ionicons
          name={layout === 'rails' ? 'reorder-three-outline' : 'list-outline'}
          size={20}
          color={colors.text}
        />
      </Pressable>
      <Pressable
        onPress={() => setSort(cycleSort(sort))}
        accessibilityLabel={`Sort: ${sortLabel(sort)}. Tap to change.`}
        style={({ pressed }) => [
          styles.headerBtn,
          { opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <Ionicons name="swap-vertical-outline" size={20} color={colors.text} />
      </Pressable>
      <Pressable
        onPress={() => setDensity(cycleDensity(density))}
        accessibilityLabel={`Layout: ${densityLabel(density)}. Tap to change.`}
        style={({ pressed }) => [
          styles.headerBtn,
          { opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <Ionicons
          name={DENSITY_ICON[density]}
          size={20}
          color={colors.text}
        />
      </Pressable>
    </View>
  );

  const listBody =
    layout === 'rails' ? (
      <ScrollView
        contentContainerStyle={[
          styles.list,
          { paddingTop: headerPad + stickyHeight, paddingHorizontal: 0 },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
            progressViewOffset={headerPad + stickyHeight}
          />
        }
        keyboardShouldPersistTaps="handled"
      >
        {railSections.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>
              {filterActive ? 'No matches' : "Closet's empty"}
            </Text>
            <Text style={styles.empty}>
              {filterActive
                ? 'Try clearing filters or a different search.'
                : 'Tap Add to scan your first item.'}
            </Text>
          </View>
        ) : (
          railSections.map((section) => (
            <View key={section.title} style={styles.railSection}>
              <Text style={styles.railSectionTitle}>
                {section.title}
                <Text style={styles.railSectionCount}>
                  {' · '}
                  {section.data.length}
                </Text>
              </Text>
              <FlatList
                data={section.data}
                keyExtractor={(item) => String(item.id)}
                renderItem={renderRailCard}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.railContent}
              />
            </View>
          ))
        )}
      </ScrollView>
    ) : (
      <FlatList
        key={`cols-${numColumns}`}
        data={visibleItems}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        numColumns={numColumns}
        columnWrapperStyle={numColumns > 1 ? styles.row : undefined}
        contentContainerStyle={[
          styles.list,
          { paddingTop: headerPad + stickyHeight },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
            progressViewOffset={headerPad + stickyHeight}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>
              {filterActive ? 'No matches' : "Closet's empty"}
            </Text>
            <Text style={styles.empty}>
              {filterActive
                ? 'Try clearing filters or a different search.'
                : 'Tap Add to scan your first item.'}
            </Text>
          </View>
        }
        keyboardShouldPersistTaps="handled"
      />
    );

  function onStickyLayout(e: LayoutChangeEvent) {
    const h = e.nativeEvent.layout.height;
    // We measure the inner block (excludes the top header pad applied as
    // paddingTop). Store the inner height so content can sit just below it.
    if (Math.abs(h - stickyHeight) > 2) setStickyHeight(h);
  }

  return (
    <View style={{ flex: 1 }}>
      <ScreenBackground />
      {listBody}

      <View
        style={[styles.stickyBar, { paddingTop: Math.max(0, headerPad - 4) }]}
        pointerEvents="box-none"
      >
        <BlurView
          intensity={Platform.OS === 'ios' ? 70 : 50}
          tint={surface.blurTint}
          style={StyleSheet.absoluteFill}
        />
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: surface.headerOverlay },
          ]}
        />
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: StyleSheet.hairlineWidth,
            backgroundColor: surface.tabBarTopLine,
          }}
        />

        <View style={styles.stickyInner} onLayout={onStickyLayout}>
          {titleHeader}

          <GlassInputContainer style={styles.search}>
            <View style={styles.searchInner}>
              <Ionicons
                name="search-outline"
                size={18}
                color={colors.textMuted}
                style={{ marginLeft: 12, marginRight: 8 }}
              />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search category, color, brand, notes…"
                placeholderTextColor={colors.placeholder}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                style={styles.searchInput}
              />
              <Pressable
                onPress={pickInspoAndSearch}
                disabled={visualBusy}
                hitSlop={8}
                style={{ paddingHorizontal: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Visual search with a photo"
              >
                {visualBusy ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : (
                  <Ionicons
                    name="camera-outline"
                    size={20}
                    color={colors.textMuted}
                  />
                )}
              </Pressable>
              {query ? (
                <Pressable
                  onPress={() => setQuery('')}
                  hitSlop={8}
                  style={{ paddingHorizontal: 12 }}
                >
                  <Ionicons
                    name="close-circle"
                    size={18}
                    color={colors.textMuted}
                  />
                </Pressable>
              ) : null}
            </View>
          </GlassInputContainer>

          {closetLocations.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.scrollChipsRow}
              keyboardShouldPersistTaps="handled"
            >
              <FilterChip
                label="All closets"
                active={activeClosetLocationId === null}
                onPress={() => setActiveClosetLocationId(null)}
              />
              {closetLocations.map((loc) => (
                <FilterChip
                  key={loc.id}
                  label={loc.name}
                  active={activeClosetLocationId === loc.id}
                  onPress={() => setActiveClosetLocationId(loc.id)}
                />
              ))}
            </ScrollView>
          ) : null}

          <View style={styles.chips}>
            {FILTER_OPTIONS.map((opt) => (
              <FilterChip
                key={opt.key}
                label={opt.label}
                active={filters.has(opt.key)}
                onPress={() => toggleFilter(opt.key)}
              />
            ))}
            {filterActive ? (
              <Pressable
                onPress={clearAll}
                style={({ pressed }) => [
                  chipStyles.chip,
                  { opacity: pressed ? 0.6 : 1 },
                ]}
              >
                <Text
                  style={[
                    chipStyles.chipText,
                    { color: colors.textSecondary },
                  ]}
                >
                  Clear
                </Text>
              </Pressable>
            ) : null}
          </View>

          {availableCategories.length > 1 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.scrollChipsRow}
              keyboardShouldPersistTaps="handled"
            >
              {availableCategories.map((cat) => (
                <FilterChip
                  key={cat}
                  label={cat}
                  active={categoryFilters.has(cat)}
                  onPress={() => toggleSetValue(setCategoryFilters, cat)}
                />
              ))}
            </ScrollView>
          ) : null}

          {availableColors.length > 1 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.scrollChipsRow}
              keyboardShouldPersistTaps="handled"
            >
              {availableColors.map((c) => (
                <ColorChip
                  key={c}
                  name={c}
                  active={colorFilters.has(c)}
                  onPress={() => toggleSetValue(setColorFilters, c)}
                />
              ))}
            </ScrollView>
          ) : null}

          {availableLocations.length > 1 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.scrollChipsRow}
              keyboardShouldPersistTaps="handled"
            >
              {availableLocations.map((loc) => (
                <FilterChip
                  key={loc}
                  label={loc}
                  active={locationFilters.has(loc)}
                  onPress={() => toggleSetValue(setLocationFilters, loc)}
                />
              ))}
            </ScrollView>
          ) : null}
        </View>
      </View>

      <Modal
        visible={visualOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setVisualOpen(false)}
      >
        <View style={styles.visualModalRoot}>
          <Pressable
            style={styles.visualBackdrop}
            onPress={() => setVisualOpen(false)}
          />
          <View
            style={[styles.visualSheet, { backgroundColor: colors.surfaceSolid }]}
          >
            <Text style={styles.visualTitle}>Visual matches</Text>
            {visualHint ? (
              <Text style={styles.visualHint}>{visualHint}</Text>
            ) : null}
            <ScrollView
              style={{ maxHeight: 420 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {visualMatches.length === 0 ? (
                <Text style={styles.visualEmpty}>
                  No indexed items yet — add or re-upload pieces so we can embed
                  them, then try again.
                </Text>
              ) : (
                visualMatches.map((m) => {
                  const uri = itemThumbnailUrl(m.item);
                  const sim = Math.round(
                    ((Math.min(1, Math.max(-1, m.score)) + 1) / 2) * 100
                  );
                  return (
                    <Pressable
                      key={m.item.id}
                      style={styles.visualRow}
                      onPress={() => {
                        setVisualOpen(false);
                        navigation.navigate('ItemDetail', { item: m.item });
                      }}
                    >
                      {uri ? (
                        <Image
                          source={{ uri }}
                          style={styles.visualThumb}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={[styles.visualThumb, styles.thumbPlaceholder]} />
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={styles.visualRowTitle} numberOfLines={1}>
                          {m.item.category}
                        </Text>
                        <Text style={styles.visualRowSub} numberOfLines={1}>
                          {m.item.subcategory} · {sim}% match
                        </Text>
                      </View>
                      <Ionicons
                        name="chevron-forward"
                        size={18}
                        color={colors.textMuted}
                      />
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
            <GlassButton title="Close" onPress={() => setVisualOpen(false)} />
          </View>
        </View>
      </Modal>

    </View>
  );
}

const chipStyles = StyleSheet.create({
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radii.pill,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  colorChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 8,
    paddingRight: 14,
    paddingVertical: 6,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  swatch: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginRight: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
});

function makeStyles({
  colors,
  surface,
}: {
  colors: ThemeColors;
  surface: ThemeSurface;
}) {
  return StyleSheet.create({
    centered: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: spacing.xl,
    },
    errorText: {
      color: colors.danger,
      textAlign: 'center',
      marginBottom: spacing.lg,
      fontSize: 15,
    },
    list: {
      paddingHorizontal: spacing.lg,
      paddingBottom: 120,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    heading: {
      ...typography.title,
      color: colors.text,
    },
    count: {
      ...typography.callout,
      color: colors.textSecondary,
      marginTop: 4,
    },
    headerBtn: {
      width: 40,
      height: 40,
      borderRadius: radii.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: surface.chipInactive,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: surface.chipInactiveBorder,
    },
    stickyBar: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      paddingBottom: spacing.sm,
      overflow: 'hidden',
    },
    stickyInner: {
      paddingHorizontal: spacing.lg,
      paddingTop: 8,
    },
    search: {
      marginBottom: spacing.sm,
      minHeight: 40,
    },
    searchInner: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    searchInput: {
      flex: 1,
      paddingVertical: 9,
      paddingRight: 12,
      fontSize: 15,
      color: colors.text,
    },
    visualModalRoot: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    visualBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.45)',
    },
    visualSheet: {
      borderTopLeftRadius: radii.xl,
      borderTopRightRadius: radii.xl,
      padding: spacing.xl,
      paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    },
    visualTitle: {
      ...typography.headline,
      color: colors.text,
      marginBottom: spacing.sm,
    },
    visualHint: {
      fontSize: 13,
      color: colors.textSecondary,
      marginBottom: spacing.md,
    },
    visualEmpty: {
      fontSize: 14,
      color: colors.textSecondary,
      marginVertical: spacing.lg,
    },
    visualRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.hairline,
    },
    visualThumb: {
      width: 52,
      height: 52,
      borderRadius: radii.md,
      backgroundColor: surface.thumbBg,
    },
    visualRowTitle: {
      ...typography.bodyMedium,
      color: colors.text,
    },
    visualRowSub: {
      fontSize: 13,
      color: colors.textMuted,
      marginTop: 2,
    },
    chips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    scrollChipsRow: {
      gap: 8,
      paddingTop: 8,
      paddingRight: spacing.lg,
    },
    row: { justifyContent: 'flex-start', gap: spacing.md },
    card: {
      flex: 1,
      backgroundColor: colors.surfaceSolid,
      borderRadius: radii.lg,
      marginBottom: spacing.md,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: surface.cardBorder,
    },
    cardList: {
      marginBottom: spacing.lg,
    },
    thumbWrap: { position: 'relative' },
    thumb: {
      width: '100%',
      aspectRatio: 1,
      backgroundColor: surface.thumbBg,
    },
    thumbList: {
      aspectRatio: 4 / 3,
    },
    thumbPlaceholder: { justifyContent: 'center', alignItems: 'center' },
    favBadge: {
      position: 'absolute',
      top: 10,
      right: 10,
      width: 28,
      height: 28,
      borderRadius: radii.pill,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    },
    favBadgeText: {
      color: colors.accent,
      fontSize: 14,
      fontWeight: '700',
    },
    dirtyBadge: {
      position: 'absolute',
      bottom: 8,
      left: 8,
      paddingHorizontal: 8,
      paddingVertical: 3,
      backgroundColor: colors.dangerSoft,
      borderRadius: radii.pill,
    },
    dirtyText: {
      color: colors.danger,
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.3,
    },
    lentBadge: {
      position: 'absolute',
      top: 8,
      left: 8,
      paddingHorizontal: 8,
      paddingVertical: 3,
      backgroundColor: colors.accentSoft,
      borderRadius: radii.pill,
      maxWidth: '85%',
    },
    lentText: {
      color: colors.accent,
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.3,
    },
    packedBadge: {
      position: 'absolute',
      top: 36,
      left: 8,
      paddingHorizontal: 8,
      paddingVertical: 3,
      backgroundColor: colors.accentSoft,
      borderRadius: radii.pill,
      maxWidth: '70%',
    },
    packedText: {
      color: colors.accent,
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.3,
    },
    neglectBadge: {
      position: 'absolute',
      bottom: 8,
      right: 8,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: radii.pill,
      maxWidth: '70%',
    },
    neglectMild: {
      backgroundColor: surface.chipInactive,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: surface.chipInactiveBorder,
    },
    neglectModerate: {
      backgroundColor: colors.warning + '33',
    },
    neglectSevere: {
      backgroundColor: colors.dangerSoft,
    },
    neglectText: {
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.3,
    },
    neglectTextMild: { color: colors.textSecondary },
    neglectTextModerate: { color: colors.warning },
    neglectTextSevere: { color: colors.danger },
    cardBody: { padding: spacing.md },
    cardTitle: {
      ...typography.bodyMedium,
      color: colors.text,
    },
    cardTitleList: {
      ...typography.headline,
      color: colors.text,
    },
    cardSub: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 2,
    },
    cardMeta: {
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 6,
    },
    bulkMeta: {
      fontSize: 12,
      color: colors.accent,
      marginTop: 4,
      fontWeight: '600',
    },
    emptyWrap: {
      alignItems: 'center',
      marginTop: 64,
      paddingHorizontal: spacing.xl,
    },
    emptyTitle: {
      ...typography.headline,
      color: colors.text,
      marginBottom: 6,
    },
    empty: {
      textAlign: 'center',
      color: colors.textSecondary,
      fontSize: 15,
    },
    railSection: {
      marginBottom: spacing.lg,
    },
    railSectionTitle: {
      ...typography.headline,
      color: colors.text,
      paddingHorizontal: spacing.lg,
      marginBottom: spacing.sm,
    },
    railSectionCount: {
      ...typography.callout,
      color: colors.textSecondary,
      fontWeight: '400',
    },
    railContent: {
      paddingHorizontal: spacing.lg,
      gap: spacing.md,
    },
    railCard: {
      width: RAIL_CARD_WIDTH,
      backgroundColor: colors.surfaceSolid,
      borderRadius: radii.lg,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: surface.cardBorder,
    },
    railThumb: {
      width: '100%',
      aspectRatio: 1,
      backgroundColor: surface.thumbBg,
    },
    railBody: {
      padding: spacing.sm,
    },
    railTitle: {
      ...typography.bodyMedium,
      color: colors.text,
      fontSize: 14,
    },
    railSub: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
    },
    railBulk: {
      fontSize: 11,
      color: colors.accent,
      marginTop: 2,
      fontWeight: '600',
    },
  });
}
