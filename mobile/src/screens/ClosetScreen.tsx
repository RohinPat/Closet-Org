import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import type { CompositeNavigationProp } from '@react-navigation/native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MainTabParamList, AppStackParamList } from '../navigation/RootNavigator';
import * as api from '../api/client';
import type { ClothingItem } from '../api/types';
import { itemThumbnailUrl } from '../config';
import {
  GlassButton,
  GlassInputContainer,
  ScreenBackground,
} from '../components/Glass';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import {
  cycleDensity,
  densityColumns,
  densityLabel,
  densityMaxWidth,
  useDensityPref,
  type Density,
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

type FilterKey = 'clean' | 'wash' | 'favorites';

const FILTER_OPTIONS: { key: FilterKey; label: string }[] = [
  { key: 'clean', label: 'Clean' },
  { key: 'wash', label: 'Needs wash' },
  { key: 'favorites', label: 'Favorites' },
];

const DENSITY_ICON: Record<Density, keyof typeof Ionicons.glyphMap> = {
  list: 'square-outline',
  comfy: 'grid-outline',
  compact: 'apps-outline',
  dense: 'apps',
};

const STICKY_BAR_HEIGHT = 108; // search row + chip row + paddings
const HEADER_PAD = Platform.OS === 'ios' ? 64 : 32;

function itemMatchesQuery(item: ClothingItem, q: string): boolean {
  if (!q) return true;
  const haystack = [
    item.category,
    item.subcategory,
    item.style ?? '',
    item.season ?? '',
    ...(item.colors || []),
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
}

function applyFilters(
  items: ClothingItem[],
  filters: Set<FilterKey>,
  query: string
): ClothingItem[] {
  const q = query.trim().toLowerCase();
  return items.filter((item) => {
    if (filters.has('clean') && !item.washed) return false;
    if (filters.has('wash') && item.washed) return false;
    if (filters.has('favorites') && !item.is_favorite) return false;
    return itemMatchesQuery(item, q);
  });
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

export function ClosetScreen() {
  const navigation = useNavigation<Nav>();
  const { colors, surface } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [density, setDensity] = useDensityPref();
  const numColumns = densityColumns(density);
  const cardMaxWidth = densityMaxWidth(density);

  const [items, setItems] = useState<ClothingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Set<FilterKey>>(() => new Set());
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api.fetchCloset();
      setItems(data.items);
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

  const visibleItems = useMemo(
    () => applyFilters(items, filters, query),
    [items, filters, query]
  );

  const isList = numColumns === 1;
  const isDense = numColumns >= 3;

  function renderItem({ item }: { item: ClothingItem }) {
    const uri = itemThumbnailUrl(item);
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
        </View>
      </Pressable>
    );
  }

  const filterActive = filters.size > 0 || query.length > 0;

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

  const scrollHeader = (
    <View style={styles.scrollHeader}>
      <View style={styles.titleRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.heading}>Your Closet</Text>
          <Text style={styles.count}>
            {visibleItems.length} of {items.length}{' '}
            {items.length === 1 ? 'item' : 'items'}
            {filterActive ? ' · filtered' : ''}
          </Text>
        </View>
        <Pressable
          onPress={() => setDensity(cycleDensity(density))}
          accessibilityLabel={`Layout: ${densityLabel(density)}. Tap to change.`}
          style={({ pressed }) => [
            styles.densityBtn,
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
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <ScreenBackground />
      <FlatList
        key={`cols-${numColumns}`}
        data={visibleItems}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        numColumns={numColumns}
        columnWrapperStyle={numColumns > 1 ? styles.row : undefined}
        contentContainerStyle={[
          styles.list,
          { paddingTop: HEADER_PAD + STICKY_BAR_HEIGHT },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
            progressViewOffset={HEADER_PAD + STICKY_BAR_HEIGHT}
          />
        }
        ListHeaderComponent={scrollHeader}
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

      <View
        style={[
          styles.stickyBar,
          { paddingTop: HEADER_PAD - 4 },
        ]}
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

        <View style={styles.stickyInner}>
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
                placeholder="Search category, color, style…"
                placeholderTextColor={colors.placeholder}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                style={styles.searchInput}
              />
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
                onPress={() => {
                  setFilters(new Set());
                  setQuery('');
                }}
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
        </View>
      </View>
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
    scrollHeader: {
      marginBottom: spacing.md,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
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
    densityBtn: {
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
    chips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
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
      // 1-col hero card: tall image on top, text below
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
  });
}
