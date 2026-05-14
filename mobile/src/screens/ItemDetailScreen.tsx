import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

function confirmDelete(message: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(
      typeof window !== 'undefined' ? window.confirm(message) : false
    );
  }
  return new Promise((resolve) => {
    Alert.alert('Delete item', message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AppStackParamList } from '../navigation/RootNavigator';
import * as api from '../api/client';
import { itemImageUrl } from '../config';

type Props = NativeStackScreenProps<AppStackParamList, 'ItemDetail'>;

export function ItemDetailScreen({ route, navigation }: Props) {
  const { item: initial } = route.params;
  const [item, setItem] = useState(initial);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const full = await api.fetchItem(initial.id);
      setItem(full);
    } catch {
      /* keep existing */
    } finally {
      setLoading(false);
    }
  }, [initial.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const uri = itemImageUrl(item.image_path);

  async function onToggleFavorite() {
    try {
      await api.toggleFavorite(item.id);
      await refresh();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed');
    }
  }

  async function onDelete() {
    const ok = await confirmDelete('Remove this from your closet?');
    if (!ok) return;
    try {
      await api.deleteItem(item.id);
      navigation.goBack();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed');
    }
  }

  async function setWashed(clean: boolean) {
    try {
      await api.updateItemStatus(item.id, { washed: clean });
      await refresh();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed');
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {loading ? (
        <ActivityIndicator style={styles.loader} color="#4f46e5" />
      ) : null}
      {uri ? (
        <Image source={{ uri }} style={styles.image} resizeMode="contain" />
      ) : null}
      <Text style={styles.title}>{item.category}</Text>
      <Text style={styles.sub}>{item.subcategory}</Text>
      <Text style={styles.meta}>
        {item.style ?? ''} · {item.season ?? ''}
      </Text>
      <Text style={styles.meta}>
        Colors: {(item.colors || []).join(', ')}
      </Text>
      <Text style={styles.meta}>
        Worn {item.times_worn ?? 0}x ·{' '}
        {item.washed ? 'Clean' : 'Needs wash'}
        {item.is_favorite ? ' · Favorite' : ''}
      </Text>

      <View style={styles.actions}>
        <Pressable style={styles.btn} onPress={onToggleFavorite}>
          <Text style={styles.btnText}>
            {item.is_favorite ? 'Remove favorite' : 'Mark favorite'}
          </Text>
        </Pressable>
        <Pressable style={styles.btnSecondary} onPress={() => setWashed(true)}>
          <Text style={styles.btnSecondaryText}>Mark clean</Text>
        </Pressable>
        <Pressable style={styles.btnSecondary} onPress={() => setWashed(false)}>
          <Text style={styles.btnSecondaryText}>Mark needs wash</Text>
        </Pressable>
        <Pressable style={styles.btnDanger} onPress={onDelete}>
          <Text style={styles.btnDangerText}>Delete</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { paddingBottom: 32 },
  loader: { marginVertical: 8 },
  image: {
    width: '100%',
    height: 320,
    backgroundColor: '#f3f4f6',
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    paddingHorizontal: 20,
  },
  sub: {
    fontSize: 16,
    color: '#6b7280',
    paddingHorizontal: 20,
    marginTop: 4,
  },
  meta: {
    fontSize: 14,
    color: '#374151',
    paddingHorizontal: 20,
    marginTop: 8,
  },
  actions: { padding: 20, gap: 10, marginTop: 16 },
  btn: {
    backgroundColor: '#4f46e5',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  btnSecondary: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#fafafa',
  },
  btnSecondaryText: { color: '#374151', fontWeight: '600', fontSize: 16 },
  btnDanger: {
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  btnDangerText: { color: '#dc2626', fontWeight: '600', fontSize: 16 },
});
