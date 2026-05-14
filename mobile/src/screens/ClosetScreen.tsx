import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import type { CompositeNavigationProp } from '@react-navigation/native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MainTabParamList, AppStackParamList } from '../navigation/RootNavigator';
import * as api from '../api/client';
import type { ClothingItem } from '../api/types';
import { itemImageUrl } from '../config';
import { GlassButton } from '../components/Glass';
import { colors, radii, shadow, spacing, typography } from '../theme';

type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'ClosetTab'>,
  NativeStackNavigationProp<AppStackParamList>
>;

export function ClosetScreen() {
  const navigation = useNavigation<Nav>();
  const [items, setItems] = useState<ClothingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  function renderItem({ item }: { item: ClothingItem }) {
    const uri = itemImageUrl(item.image_path);
    return (
      <Pressable
        style={({ pressed }) => [
          styles.card,
          shadow.card,
          { transform: [{ scale: pressed ? 0.98 : 1 }] },
        ]}
        onPress={() => navigation.navigate('ItemDetail', { item })}
      >
        <View style={styles.thumbWrap}>
          {uri ? (
            <Image source={{ uri }} style={styles.thumb} resizeMode="cover" />
          ) : (
            <View style={[styles.thumb, styles.thumbPlaceholder]} />
          )}
          {item.is_favorite ? (
            <View style={styles.favBadge}>
              <BlurView
                intensity={50}
                tint="light"
                style={StyleSheet.absoluteFill}
              />
              <View
                style={[
                  StyleSheet.absoluteFill,
                  {
                    backgroundColor: 'rgba(255,255,255,0.6)',
                    borderRadius: radii.pill,
                  },
                ]}
              />
              <Text style={styles.favBadgeText}>★</Text>
            </View>
          ) : null}
          {!item.washed ? (
            <View style={styles.dirtyBadge}>
              <Text style={styles.dirtyText}>Needs wash</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {item.category}
          </Text>
          <Text style={styles.cardSub} numberOfLines={1}>
            {item.subcategory}
          </Text>
          <Text style={styles.cardMeta} numberOfLines={1}>
            {(item.colors || []).join(' · ')}
          </Text>
        </View>
      </Pressable>
    );
  }

  if (loading && items.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (error && items.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
        <GlassButton title="Retry" onPress={load} fullWidth={false} />
      </View>
    );
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => String(item.id)}
      renderItem={renderItem}
      numColumns={2}
      columnWrapperStyle={styles.row}
      contentContainerStyle={styles.list}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.accent}
        />
      }
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.heading}>Your Closet</Text>
          <Text style={styles.count}>
            {items.length} {items.length === 1 ? 'item' : 'items'}
          </Text>
        </View>
      }
      ListEmptyComponent={
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyTitle}>Closet's empty</Text>
          <Text style={styles.empty}>
            Tap Add to scan your first item.
          </Text>
        </View>
      }
    />
  );
}

const HEADER_PAD = Platform.OS === 'ios' ? 64 : 32;

const styles = StyleSheet.create({
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
    paddingTop: HEADER_PAD,
    paddingBottom: 120,
  },
  header: {
    marginBottom: spacing.lg,
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
  row: { justifyContent: 'space-between', gap: spacing.md },
  card: {
    flex: 1,
    maxWidth: '48.5%',
    backgroundColor: colors.surfaceSolid,
    borderRadius: radii.lg,
    marginBottom: spacing.md,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.7)',
  },
  thumbWrap: { position: 'relative' },
  thumb: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#EFEDE8',
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
