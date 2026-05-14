import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import * as api from '../api/client';
import type { OutfitRecommendation } from '../api/types';
import { itemImageUrl } from '../config';
import { GlassButton, GlassCard } from '../components/Glass';
import { colors, radii, spacing, typography } from '../theme';

const OCCASIONS = [
  { label: 'Any', value: '' },
  { label: 'Work', value: 'work' },
  { label: 'Casual', value: 'casual' },
  { label: 'Gym', value: 'gym' },
  { label: 'Date', value: 'date' },
  { label: 'Party', value: 'party' },
];

const SEASONS = [
  { label: 'Any', value: '' },
  { label: 'Spring', value: 'Spring' },
  { label: 'Summer', value: 'Summer' },
  { label: 'Fall', value: 'Fall' },
  { label: 'Winter', value: 'Winter' },
];

type ChipProps = {
  label: string;
  active: boolean;
  onPress: () => void;
};

function Chip({ label, active, onPress }: ChipProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        { transform: [{ scale: pressed ? 0.96 : 1 }] },
      ]}
    >
      <BlurView
        intensity={active ? 0 : 40}
        tint="light"
        style={[StyleSheet.absoluteFill, { borderRadius: radii.pill }]}
      />
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: active
              ? colors.accent
              : 'rgba(255,255,255,0.55)',
            borderRadius: radii.pill,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: active ? colors.accent : 'rgba(255,255,255,0.7)',
          },
        ]}
      />
      <Text
        style={[
          styles.chipText,
          { color: active ? '#fff' : colors.text },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function OutfitsScreen() {
  const [occasion, setOccasion] = useState('');
  const [season, setSeason] = useState('');
  const [outfits, setOutfits] = useState<OutfitRecommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const data = await api.fetchOutfitRecommendations({
        occasion: occasion || undefined,
        season: season || undefined,
      });
      setOutfits(data.outfits);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load outfits');
      setOutfits([]);
    } finally {
      setLoading(false);
    }
  }, [occasion, season]);

  useEffect(() => {
    generate();
  }, [generate]);

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.heading}>Outfits</Text>
      <Text style={styles.blurb}>
        Curated combinations from your closet.
      </Text>

      <Text style={styles.sectionLabel}>Occasion</Text>
      <View style={styles.chips}>
        {OCCASIONS.map((o) => (
          <Chip
            key={o.value || 'any-o'}
            label={o.label}
            active={occasion === o.value}
            onPress={() => setOccasion(o.value)}
          />
        ))}
      </View>

      <Text style={styles.sectionLabel}>Season</Text>
      <View style={styles.chips}>
        {SEASONS.map((s) => (
          <Chip
            key={s.value || 'any-s'}
            label={s.label}
            active={season === s.value}
            onPress={() => setSeason(s.value)}
          />
        ))}
      </View>

      <GlassButton
        title="Refresh outfits"
        onPress={generate}
        loading={loading}
        style={styles.refresh}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {outfits.length === 0 && !loading ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyTitle}>No matches</Text>
          <Text style={styles.empty}>
            Try “Any” for the filters or add more clean items.
          </Text>
        </View>
      ) : null}

      {loading && outfits.length === 0 ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 32 }} />
      ) : null}

      {outfits.map((outfit, idx) => (
        <GlassCard key={idx} padded style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Outfit {idx + 1}</Text>
            <View style={styles.scoreBadge}>
              <Text style={styles.scoreText}>{Math.round(outfit.score)}</Text>
            </View>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.outfitRow}
          >
            {outfit.items.map((item) => {
              const uri = itemImageUrl(item.image_path);
              return (
                <View key={item.id} style={styles.mini}>
                  {uri ? (
                    <Image
                      source={{ uri }}
                      style={styles.miniImg}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={styles.miniImg} />
                  )}
                  <Text style={styles.miniLabel} numberOfLines={1}>
                    {item.subcategory}
                  </Text>
                </View>
              );
            })}
          </ScrollView>
        </GlassCard>
      ))}
    </ScrollView>
  );
}

const HEADER_PAD = Platform.OS === 'ios' ? 64 : 32;

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.xl,
    paddingTop: HEADER_PAD,
    paddingBottom: 120,
  },
  heading: {
    ...typography.title,
    color: colors.text,
    marginBottom: 6,
  },
  blurb: {
    ...typography.callout,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
  },
  sectionLabel: {
    ...typography.micro,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: radii.pill,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
  },
  refresh: {
    marginTop: spacing.xl,
  },
  error: {
    color: colors.danger,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  emptyWrap: {
    alignItems: 'center',
    marginTop: 48,
  },
  emptyTitle: {
    ...typography.headline,
    color: colors.text,
    marginBottom: 4,
  },
  empty: {
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
  card: {
    marginTop: spacing.lg,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  cardTitle: {
    ...typography.headline,
    color: colors.text,
  },
  scoreBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radii.pill,
    backgroundColor: colors.accentSoft,
  },
  scoreText: {
    color: colors.accent,
    fontWeight: '700',
    fontSize: 13,
    letterSpacing: 0.3,
  },
  outfitRow: { flexDirection: 'row', gap: spacing.md },
  mini: { width: 96 },
  miniImg: {
    width: 96,
    height: 96,
    borderRadius: radii.md,
    backgroundColor: '#EFEDE8',
  },
  miniLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 6,
    textAlign: 'center',
  },
});
