import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as api from '../api/client';
import type { OutfitRecommendation } from '../api/types';
import { itemImageUrl } from '../config';

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
    <ScrollView style={styles.root} contentContainerStyle={styles.container}>
      <Text style={styles.sectionLabel}>Occasion</Text>
      <View style={styles.chips}>
        {OCCASIONS.map((o) => (
          <Pressable
            key={o.value || 'any-o'}
            style={[styles.chip, occasion === o.value && styles.chipActive]}
            onPress={() => setOccasion(o.value)}
          >
            <Text
              style={[
                styles.chipText,
                occasion === o.value && styles.chipTextActive,
              ]}
            >
              {o.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.sectionLabel}>Season</Text>
      <View style={styles.chips}>
        {SEASONS.map((s) => (
          <Pressable
            key={s.value || 'any-s'}
            style={[styles.chip, season === s.value && styles.chipActive]}
            onPress={() => setSeason(s.value)}
          >
            <Text
              style={[styles.chipText, season === s.value && styles.chipTextActive]}
            >
              {s.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        style={[styles.generateBtn, loading && styles.generateDisabled]}
        onPress={generate}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.generateText}>Refresh outfits</Text>
        )}
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {outfits.length === 0 && !loading ? (
        <Text style={styles.empty}>
          No outfits match these filters. Try “Any” or add more clean items.
        </Text>
      ) : null}

      {outfits.map((outfit, idx) => (
        <View key={idx} style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Outfit {idx + 1}</Text>
            <Text style={styles.score}>Score {Math.round(outfit.score)}</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.outfitRow}>
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
            </View>
          </ScrollView>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f9fafb' },
  container: { padding: 16, paddingBottom: 40 },
  sectionLabel: {
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
    marginTop: 8,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  chipActive: { backgroundColor: '#eef2ff', borderColor: '#4f46e5' },
  chipText: { color: '#4b5563', fontSize: 14 },
  chipTextActive: { color: '#4f46e5', fontWeight: '600' },
  generateBtn: {
    backgroundColor: '#4f46e5',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
  generateDisabled: { opacity: 0.7 },
  generateText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  error: { color: '#dc2626', marginTop: 8 },
  empty: { color: '#6b7280', marginTop: 16, textAlign: 'center' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  cardTitle: { fontWeight: '700', fontSize: 16, color: '#111827' },
  score: { color: '#4f46e5', fontWeight: '600' },
  outfitRow: { flexDirection: 'row', gap: 10 },
  mini: { width: 88 },
  miniImg: {
    width: 88,
    height: 88,
    borderRadius: 8,
    backgroundColor: '#e5e7eb',
  },
  miniLabel: { fontSize: 11, color: '#6b7280', marginTop: 4 },
});
