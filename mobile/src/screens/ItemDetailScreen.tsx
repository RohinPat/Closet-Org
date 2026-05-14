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
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AppStackParamList } from '../navigation/RootNavigator';
import * as api from '../api/client';
import { itemImageUrl } from '../config';
import { GlassButton, GlassCard } from '../components/Glass';
import { colors, radii, shadow, spacing, typography } from '../theme';

type Props = NativeStackScreenProps<AppStackParamList, 'ItemDetail'>;

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
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.imageWrap}>
        {uri ? (
          <Image source={{ uri }} style={styles.image} resizeMode="cover" />
        ) : (
          <View style={[styles.image, styles.imagePlaceholder]} />
        )}
        <Pressable onPress={onToggleFavorite} style={styles.favBtn}>
          <View style={styles.favBg} />
          <Ionicons
            name={item.is_favorite ? 'heart' : 'heart-outline'}
            size={20}
            color={item.is_favorite ? colors.danger : colors.text}
          />
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loader} color={colors.accent} />
      ) : null}

      <View style={styles.body}>
        <Text style={styles.title}>{item.category}</Text>
        <Text style={styles.sub}>{item.subcategory}</Text>

        <View style={styles.tagRow}>
          {item.style ? (
            <View style={styles.tag}>
              <Text style={styles.tagText}>{item.style}</Text>
            </View>
          ) : null}
          {item.season ? (
            <View style={styles.tag}>
              <Text style={styles.tagText}>{item.season}</Text>
            </View>
          ) : null}
          {(item.colors || []).map((c) => (
            <View key={c} style={[styles.tag, styles.colorTag]}>
              <Text style={styles.tagText}>{c}</Text>
            </View>
          ))}
        </View>

        <GlassCard padded style={styles.statsCard}>
          <View style={styles.statRow}>
            <View style={styles.statCol}>
              <Text style={styles.statValue}>{item.times_worn ?? 0}</Text>
              <Text style={styles.statLabel}>times worn</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statCol}>
              <Text
                style={[
                  styles.statValue,
                  { color: item.washed ? colors.success : '#FF9F0A' },
                ]}
              >
                {item.washed ? 'Clean' : 'Wash'}
              </Text>
              <Text style={styles.statLabel}>status</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statCol}>
              <Text style={styles.statValue}>
                {item.is_favorite ? '★' : '—'}
              </Text>
              <Text style={styles.statLabel}>favorite</Text>
            </View>
          </View>
        </GlassCard>

        <View style={styles.actions}>
          <GlassButton
            title={item.washed ? 'Mark needs wash' : 'Mark clean'}
            onPress={() => setWashed(!item.washed)}
            variant="ghost"
          />
          <GlassButton
            title={item.is_favorite ? 'Remove favorite' : 'Mark favorite'}
            onPress={onToggleFavorite}
            variant="ghost"
          />
          <GlassButton title="Delete item" onPress={onDelete} variant="danger" />
        </View>
      </View>
    </ScrollView>
  );
}

const HEADER_PAD = Platform.OS === 'ios' ? 96 : 80;

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing.xxl,
  },
  imageWrap: {
    paddingTop: HEADER_PAD,
    paddingHorizontal: spacing.xl,
  },
  image: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radii.xl,
    backgroundColor: '#EFEDE8',
    ...shadow.card,
  },
  imagePlaceholder: { justifyContent: 'center', alignItems: 'center' },
  favBtn: {
    position: 'absolute',
    top: HEADER_PAD + 12,
    right: spacing.xl + 12,
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  favBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: radii.pill,
  },
  loader: { marginVertical: spacing.md },
  body: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
  title: {
    ...typography.title,
    color: colors.text,
  },
  sub: {
    fontSize: 16,
    color: colors.textSecondary,
    marginTop: 4,
    marginBottom: spacing.md,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: spacing.lg,
  },
  tag: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.accentSoft,
  },
  colorTag: {
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
  },
  tagText: {
    fontSize: 13,
    color: colors.text,
    fontWeight: '600',
  },
  statsCard: {
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statCol: { flex: 1, alignItems: 'center' },
  statValue: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.3,
  },
  statLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    height: 36,
    backgroundColor: colors.hairline,
  },
  actions: {
    gap: spacing.md,
  },
});
