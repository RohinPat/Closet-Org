import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { CompositeNavigationProp } from '@react-navigation/native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MainTabParamList, AppStackParamList } from '../navigation/RootNavigator';
import * as api from '../api/client';
import type { ClothingItem } from '../api/types';
import { itemImageUrl } from '../config';

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
        style={styles.card}
        onPress={() => navigation.navigate('ItemDetail', { item })}
      >
        {uri ? (
          <Image source={{ uri }} style={styles.thumb} resizeMode="cover" />
        ) : (
          <View style={[styles.thumb, styles.thumbPlaceholder]} />
        )}
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle}>{item.category}</Text>
          <Text style={styles.cardSub}>{item.subcategory}</Text>
          <Text style={styles.cardMeta} numberOfLines={1}>
            {(item.colors || []).join(', ')}
          </Text>
        </View>
      </Pressable>
    );
  }

  if (loading && items.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#4f46e5" />
      </View>
    );
  }

  if (error && items.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable style={styles.retry} onPress={load}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
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
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
      ListEmptyComponent={
        <Text style={styles.empty}>No items yet. Add one from the Add tab.</Text>
      }
    />
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#f9fafb',
  },
  errorText: { color: '#dc2626', textAlign: 'center', marginBottom: 16 },
  retry: {
    backgroundColor: '#4f46e5',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: { color: '#fff', fontWeight: '600' },
  list: { padding: 12, paddingBottom: 32, backgroundColor: '#f9fafb' },
  row: { justifyContent: 'space-between', gap: 12 },
  card: {
    flex: 1,
    maxWidth: '48%',
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  thumb: { width: '100%', aspectRatio: 1, backgroundColor: '#e5e7eb' },
  thumbPlaceholder: { justifyContent: 'center', alignItems: 'center' },
  cardBody: { padding: 10 },
  cardTitle: { fontWeight: '700', fontSize: 15, color: '#111827' },
  cardSub: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  cardMeta: { fontSize: 12, color: '#9ca3af', marginTop: 4 },
  empty: {
    textAlign: 'center',
    color: '#6b7280',
    marginTop: 48,
    paddingHorizontal: 24,
  },
});
