import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as api from '../api/client';
import type {
  ClothingItem,
  ForecastDay,
  OutfitRecommendation,
  Trip,
  WeatherContext,
  WeatherLocation,
} from '../api/types';
import { GlassButton, GlassCard, ScreenBackground } from '../components/Glass';
import { itemThumbnailUrl } from '../config';
import type { AppStackParamList } from '../navigation/RootNavigator';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import { CLOTHING_SUBCATEGORIES } from '../constants/classification';
import { forecastSummary, weatherDetail, weatherHeadline } from '../weather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  stackScrollContentPaddingTop,
  PACK_MODE_SCROLL_BOTTOM,
} from '../utils/screenSpacing';
import {
  radii,
  shadow,
  spacing,
  typography,
  type ThemeColors,
  type ThemeSurface,
} from '../theme';

type Props = NativeStackScreenProps<AppStackParamList, 'PackMode'>;
type ViewMode = 'all' | 'packed' | 'unpacked';
type TripActivityKey =
  | 'casual'
  | 'work'
  | 'dinner'
  | 'active'
  | 'night'
  | 'cozy';

type TripActivity = {
  key: TripActivityKey;
  label: string;
  occasion: string;
  vibe?: 'clean_prep' | 'streetwear' | 'cozy';
};

type PackPlanOutfit = {
  outfit: OutfitRecommendation;
  activityLabel: string;
};

type PackPlanSummary = {
  outfits: PackPlanOutfit[];
  uniqueItemIds: number[];
  totalSlots: number;
  overlapCount: number;
  targetOutfits: number;
};

const MODES: { key: ViewMode; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'packed', label: 'Packed' },
  { key: 'unpacked', label: 'Not packed' },
];

const ACTIVITY_OPTIONS: TripActivity[] = [
  { key: 'casual', label: 'Casual days', occasion: 'casual', vibe: 'clean_prep' },
  { key: 'work', label: 'Work', occasion: 'work', vibe: 'clean_prep' },
  { key: 'dinner', label: 'Dinner', occasion: 'dinner', vibe: 'clean_prep' },
  { key: 'active', label: 'Active', occasion: 'active' },
  { key: 'night', label: 'Night out', occasion: 'night out', vibe: 'streetwear' },
  { key: 'cozy', label: 'Cozy', occasion: 'cozy', vibe: 'cozy' },
];

const PACK_COUNT_ORDER = [...CLOTHING_SUBCATEGORIES];

function parseTripDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return null;
  const date = new Date(`${value.trim()}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getTripDayCount(start: string, end: string): number | null {
  const startDate = parseTripDate(start);
  const endDate = parseTripDate(end);
  if (!startDate || !endDate || endDate < startDate) return null;
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.floor((endDate.getTime() - startDate.getTime()) / dayMs) + 1;
}

function defaultOutfitTarget(days: number | null): number {
  if (!days) return 3;
  if (days <= 3) return days;
  return Math.min(10, Math.max(1, Math.ceil(days * 0.75)));
}

function outfitSignature(outfit: OutfitRecommendation): string {
  return outfit.items
    .map((item) => item.id)
    .sort((a, b) => a - b)
    .join(',');
}

function selectCoveragePlan(
  candidates: PackPlanOutfit[],
  targetOutfits: number
): PackPlanSummary | null {
  const unique = new Map<string, PackPlanOutfit>();
  for (const candidate of candidates) {
    const signature = outfitSignature(candidate.outfit);
    if (!signature) continue;
    const existing = unique.get(signature);
    if (!existing || candidate.outfit.score > existing.outfit.score) {
      unique.set(signature, candidate);
    }
  }

  const pool = [...unique.values()];
  const selected: PackPlanOutfit[] = [];
  const usedItemIds = new Set<number>();

  while (pool.length > 0 && selected.length < targetOutfits) {
    let bestIndex = 0;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < pool.length; i += 1) {
      const itemIds = pool[i].outfit.items.map((item) => item.id);
      const shared = itemIds.filter((id) => usedItemIds.has(id)).length;
      const newItems = itemIds.length - shared;
      const score =
        pool[i].outfit.score + shared * 0.6 - Math.max(0, newItems - 1) * 0.12;
      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }

    const [next] = pool.splice(bestIndex, 1);
    selected.push(next);
    next.outfit.items.forEach((item) => usedItemIds.add(item.id));
  }

  if (selected.length === 0) return null;
  const totalSlots = selected.reduce(
    (sum, entry) => sum + entry.outfit.items.length,
    0
  );
  const uniqueItemIds = [...usedItemIds];
  return {
    outfits: selected,
    uniqueItemIds,
    totalSlots,
    overlapCount: Math.max(0, totalSlots - uniqueItemIds.length),
    targetOutfits,
  };
}

export function PackModeScreen({}: Props) {
  const insets = useSafeAreaInsets();
  const scrollTop = stackScrollContentPaddingTop(insets);
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [items, setItems] = useState<ClothingItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [mode, setMode] = useState<ViewMode>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [suggestions, setSuggestions] = useState<OutfitRecommendation[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState<number | null>(
    null
  );
  const [packPlan, setPackPlan] = useState<PackPlanSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [destination, setDestination] = useState('');
  const [tripStart, setTripStart] = useState('');
  const [tripEnd, setTripEnd] = useState('');
  const [desiredOutfits, setDesiredOutfits] = useState('');
  const [plannedActivities, setPlannedActivities] = useState<
    Set<TripActivityKey>
  >(() => new Set(['casual']));
  const [tripLocation, setTripLocation] = useState<WeatherLocation | null>(null);
  const [tripWeather, setTripWeather] = useState<WeatherContext | null>(null);
  const [forecastDays, setForecastDays] = useState<ForecastDay[]>([]);
  const [forecastBusy, setForecastBusy] = useState(false);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [activeTripId, setActiveTripId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api.fetchCloset();
      const tripData = await api.fetchTrips();
      setItems(data.items);
      setTrips(tripData.trips);
      if (!activeTripId && tripData.trips[0]) {
        const trip = tripData.trips[0];
        setActiveTripId(trip.id);
        setDestination(trip.destination ?? '');
        setTripStart(trip.start_date ?? '');
        setTripEnd(trip.end_date ?? '');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load closet');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTripId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load])
  );

  const packedCount = useMemo(
    () => items.filter((item) => item.packed_for_trip).length,
    [items]
  );

  const packedBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) {
      if (!item.packed_for_trip) continue;
      const key = item.subcategory || item.category || 'Other';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => {
      const ai = PACK_COUNT_ORDER.indexOf(a[0] as any);
      const bi = PACK_COUNT_ORDER.indexOf(b[0] as any);
      const ar = ai === -1 ? PACK_COUNT_ORDER.length : ai;
      const br = bi === -1 ? PACK_COUNT_ORDER.length : bi;
      if (ar !== br) return ar - br;
      return a[0].localeCompare(b[0]);
    });
  }, [items]);

  const visibleItems = useMemo(() => {
    if (mode === 'packed') return items.filter((item) => item.packed_for_trip);
    if (mode === 'unpacked') return items.filter((item) => !item.packed_for_trip);
    return items;
  }, [items, mode]);

  const selectedList = useMemo(() => [...selectedIds], [selectedIds]);
  const activeTrip = useMemo(
    () => trips.find((trip) => trip.id === activeTripId) ?? null,
    [activeTripId, trips]
  );
  const tripDayCount = useMemo(
    () => getTripDayCount(tripStart, tripEnd),
    [tripStart, tripEnd]
  );
  const coverageTarget = useMemo(() => {
    const parsed = Number.parseInt(desiredOutfits, 10);
    if (Number.isFinite(parsed) && parsed > 0) return Math.min(14, parsed);
    return defaultOutfitTarget(tripDayCount);
  }, [desiredOutfits, tripDayCount]);

  const selectedActivities = useMemo(() => {
    const chosen = ACTIVITY_OPTIONS.filter((activity) =>
      plannedActivities.has(activity.key)
    );
    return chosen.length > 0 ? chosen : [ACTIVITY_OPTIONS[0]];
  }, [plannedActivities]);

  function toggleSelection(itemId: number) {
    setSelectedSuggestion(null);
    setPackPlan(null);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  async function applyPacked(itemIds: number[] | null, packedForTrip: boolean) {
    setBusy(true);
    try {
      await api.bulkUpdatePacked(itemIds, packedForTrip);
      if (activeTrip && itemIds) {
        for (const itemId of itemIds) {
          await api.setTripPacked(activeTrip.id, itemId, packedForTrip);
        }
        const tripData = await api.fetchTrips();
        setTrips(tripData.trips);
      }
      setItems((prev) =>
        prev.map((item) => {
          const shouldUpdate =
            itemIds === null ? item.packed_for_trip : itemIds.includes(item.id);
          return shouldUpdate
            ? { ...item, packed_for_trip: packedForTrip }
            : item;
        })
      );
      setSelectedIds(new Set());
      setSelectedSuggestion(null);
      setPackPlan(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update packed items');
    } finally {
      setBusy(false);
    }
  }

  async function suggestFits() {
    setError(null);
    setSuggesting(true);
    try {
      const packedIds = items
        .filter((item) => item.packed_for_trip)
        .map((item) => item.id);
      const data = await api.fetchOutfitRecommendations({
        seed: Date.now(),
        excludeItemIds: packedIds,
        lat: tripLocation?.latitude,
        lon: tripLocation?.longitude,
        weatherDate: tripWeather?.date,
        locationName: tripLocation?.label,
      });
      setSuggestions(data.outfits);
      if (data.weather) setTripWeather(data.weather);
      setSelectedSuggestion(null);
      setPackPlan(null);
      if (data.outfits.length === 0) {
        setError('No outfit bundles yet. Try packing manually or add more clean items.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not suggest outfits');
      setSuggestions([]);
      setSelectedSuggestion(null);
    } finally {
      setSuggesting(false);
    }
  }

  async function buildPackList() {
    setError(null);
    setPlanning(true);
    try {
      const packedIds = items
        .filter((item) => item.packed_for_trip)
        .map((item) => item.id);
      const requestCount = Math.min(
        8,
        Math.max(coverageTarget, selectedActivities.length)
      );
      const seedBase = Date.now();
      const responses = await Promise.all(
        Array.from({ length: requestCount }, (_, index) => {
          const activity = selectedActivities[index % selectedActivities.length];
          return api
            .fetchOutfitRecommendations({
              occasion: activity.occasion,
              vibe: activity.vibe,
              seed: seedBase + index,
              excludeItemIds: packedIds,
              lat: tripLocation?.latitude,
              lon: tripLocation?.longitude,
              weatherDate: tripWeather?.date,
              locationName: tripLocation?.label,
              season: tripWeather?.derived_season,
            })
            .then((data) => ({ data, activity }));
        })
      );

      const candidates = responses.flatMap(({ data, activity }) =>
        data.outfits.map((outfit) => ({
          outfit,
          activityLabel: activity.label,
        }))
      );
      const plan = selectCoveragePlan(candidates, coverageTarget);
      const weather = responses.find(({ data }) => data.weather)?.data.weather;
      if (weather) setTripWeather(weather);

      if (!plan) {
        setPackPlan(null);
        setSuggestions([]);
        setSelectedIds(new Set());
        setSelectedSuggestion(null);
        setError('No pack list yet. Try fewer outfits or different activities.');
        return;
      }

      setPackPlan(plan);
      setSuggestions(plan.outfits.map((entry) => entry.outfit));
      setSelectedIds(new Set(plan.uniqueItemIds));
      setSelectedSuggestion(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not build pack list');
      setPackPlan(null);
    } finally {
      setPlanning(false);
    }
  }

  async function saveTripPlan() {
    setBusy(true);
    setError(null);
    try {
      const body = {
        name: destination.trim() || 'Upcoming trip',
        destination: destination.trim() || null,
        start_date: tripStart.trim() || null,
        end_date: tripEnd.trim() || null,
        activities: selectedActivities.map((activity) => activity.label),
        item_ids: selectedList,
      };
      const result = activeTrip
        ? await api.updateTrip(activeTrip.id, body)
        : await api.createTrip(body);
      setActiveTripId(result.trip.id);
      const tripData = await api.fetchTrips();
      setTrips(tripData.trips);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save trip');
    } finally {
      setBusy(false);
    }
  }

  async function loadTripForecast() {
    const q = destination.trim();
    if (q.length < 2) {
      setError('Enter a destination first.');
      return;
    }
    setForecastBusy(true);
    setError(null);
    try {
      const places = await api.geocodeWeatherLocation(q);
      const place = places.results[0];
      if (!place) {
        setError('No matching destination found.');
        return;
      }
      const forecast = await api.fetchWeatherForecast({
        lat: place.latitude,
        lon: place.longitude,
        startDate: tripStart.trim() || undefined,
        endDate: tripEnd.trim() || undefined,
        locationName: place.label,
      });
      setTripLocation(place);
      setTripWeather(forecast.context);
      setForecastDays(forecast.days);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load trip weather');
    } finally {
      setForecastBusy(false);
    }
  }

  function selectSuggestion(index: number, outfit: OutfitRecommendation) {
    setSelectedSuggestion(index);
    setPackPlan(null);
    setSelectedIds(new Set(outfit.items.map((item) => item.id)));
  }

  function toggleActivity(activity: TripActivityKey) {
    setPlannedActivities((prev) => {
      const next = new Set(prev);
      if (next.has(activity) && next.size > 1) next.delete(activity);
      else next.add(activity);
      return next;
    });
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

  const header = (
    <View>
      <Text style={styles.heading}>Pack Mode</Text>
      <Text style={styles.blurb}>
        Select pieces for a trip. Packed items can power Travel bag outfits.
      </Text>

      <GlassCard padded style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.summaryTitle}>Travel bag</Text>
            <Text style={styles.summaryText}>
              {packedCount} of {items.length} items packed
            </Text>
          </View>
          <Ionicons name="airplane-outline" size={24} color={colors.accent} />
        </View>
        <View style={styles.countGrid}>
          {packedBreakdown.length === 0 ? (
            <Text style={styles.noCounts}>Pack items to see counts by type.</Text>
          ) : (
            packedBreakdown.map(([label, count]) => (
              <View key={label} style={styles.countPill}>
                <Text style={styles.countNumber}>{count}</Text>
                <Text style={styles.countLabel}>{label}</Text>
              </View>
            ))
          )}
        </View>
        {activeTrip ? (
          <View style={styles.progressWrap}>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${Math.min(100, Math.round(activeTrip.progress * 100))}%` },
                ]}
              />
            </View>
            <Text style={styles.tripDetail}>
              {activeTrip.name}: {activeTrip.packed_count}/{activeTrip.item_count} checklist items packed
            </Text>
          </View>
        ) : null}
        <View style={styles.summaryActions}>
          <GlassButton
            title="Suggest fits"
            onPress={suggestFits}
            loading={suggesting}
            fullWidth={false}
            style={{ flex: 1 }}
          />
          <GlassButton
            title="Unpack all"
            variant="secondary"
            onPress={() => applyPacked(null, false)}
            disabled={packedCount === 0 || busy}
            fullWidth={false}
            style={{ flex: 1 }}
          />
        </View>
      </GlassCard>

      <GlassCard padded style={styles.tripCard}>
        <View style={styles.summaryRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.summaryTitle}>Trip weather</Text>
            <Text style={styles.summaryText}>
              {tripWeather
                ? weatherHeadline(tripWeather)
                : 'Search a destination to sync forecast-aware pack ideas.'}
            </Text>
          </View>
          <Ionicons name="partly-sunny-outline" size={24} color={colors.accent} />
        </View>
        <TextInput
          value={destination}
          onChangeText={setDestination}
          placeholder="Destination city"
          placeholderTextColor={colors.placeholder}
          autoCapitalize="words"
          style={styles.tripInput}
        />
        <View style={styles.dateRow}>
          <TextInput
            value={tripStart}
            onChangeText={setTripStart}
            placeholder="Start YYYY-MM-DD"
            placeholderTextColor={colors.placeholder}
            autoCapitalize="none"
            style={[styles.tripInput, styles.dateInput]}
          />
          <TextInput
            value={tripEnd}
            onChangeText={setTripEnd}
            placeholder="End YYYY-MM-DD"
            placeholderTextColor={colors.placeholder}
            autoCapitalize="none"
            style={[styles.tripInput, styles.dateInput]}
          />
        </View>
        <View style={styles.coverageRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>Coverage goal</Text>
            <Text style={styles.tripDetail}>
              {tripDayCount
                ? `${tripDayCount} trip days; suggested target is ${defaultOutfitTarget(
                    tripDayCount
                  )} outfits with rewear.`
                : 'Add dates to estimate outfit coverage.'}
            </Text>
          </View>
          <TextInput
            value={desiredOutfits}
            onChangeText={setDesiredOutfits}
            placeholder={String(coverageTarget)}
            placeholderTextColor={colors.placeholder}
            keyboardType="number-pad"
            style={[styles.tripInput, styles.coverageInput]}
          />
        </View>
        <Text style={styles.fieldLabel}>Planned activities</Text>
        <View style={styles.activityGrid}>
          {ACTIVITY_OPTIONS.map((activity) => {
            const active = plannedActivities.has(activity.key);
            return (
              <Pressable
                key={activity.key}
                onPress={() => toggleActivity(activity.key)}
                style={({ pressed }) => [
                  styles.activityChip,
                  active && styles.activityChipActive,
                  { opacity: pressed ? 0.75 : 1 },
                ]}
              >
                <Text
                  style={[
                    styles.activityText,
                    active && styles.activityTextActive,
                  ]}
                >
                  {activity.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.tripDetail}>
          {tripWeather ? weatherDetail(tripWeather) : forecastSummary(forecastDays)}
        </Text>
        {forecastDays.length > 0 ? (
          <Text style={styles.tripDetail}>{forecastSummary(forecastDays)}</Text>
        ) : null}
        <View style={styles.summaryActions}>
          <GlassButton
            title="Sync weather"
            onPress={loadTripForecast}
            loading={forecastBusy}
            fullWidth={false}
            style={{ flex: 1 }}
          />
          <GlassButton
            title="Build list"
            onPress={buildPackList}
            loading={planning}
            disabled={items.length === 0}
            fullWidth={false}
            style={{ flex: 1 }}
          />
          <GlassButton
            title={activeTrip ? 'Save trip' : 'Create trip'}
            variant="secondary"
            onPress={saveTripPlan}
            loading={busy}
            fullWidth={false}
            style={{ flex: 1 }}
          />
        </View>
      </GlassCard>

      {packPlan ? (
        <GlassCard padded style={styles.planCard}>
          <View style={styles.summaryRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.summaryTitle}>Pack list ready</Text>
              <Text style={styles.summaryText}>
                {packPlan.outfits.length} outfits, {packPlan.uniqueItemIds.length}{' '}
                pieces selected
              </Text>
            </View>
            <Ionicons name="checkbox-outline" size={24} color={colors.accent} />
          </View>
          <Text style={styles.planDetail}>
            Reusing {packPlan.overlapCount} pieces across {packPlan.totalSlots}{' '}
            outfit slots keeps the bag lighter. Press Pack below to mark the full
            capsule.
          </Text>
          <View style={styles.activityGrid}>
            {packPlan.outfits.map((entry, index) => (
              <View key={`${entry.activityLabel}-${index}`} style={styles.planPill}>
                <Text style={styles.planPillText}>
                  Fit {index + 1}: {entry.activityLabel}
                </Text>
              </View>
            ))}
          </View>
        </GlassCard>
      ) : null}

      {suggestions.length > 0 ? (
        <View style={styles.suggestions}>
          <View style={styles.suggestionHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.suggestionTitle}>Suggested fit bundles</Text>
              <Text style={styles.suggestionSub}>
                {packPlan
                  ? 'These are the outfits behind the pack list.'
                  : 'Pick one, then press Pack to add the whole fit.'}
              </Text>
            </View>
          </View>
          {suggestions.map((outfit, idx) => {
            const selected = selectedSuggestion === idx;
            return (
              <Pressable
                key={idx}
                onPress={() => selectSuggestion(idx, outfit)}
                style={({ pressed }) => [
                  styles.suggestionCard,
                  selected && styles.suggestionCardSelected,
                  { opacity: pressed ? 0.82 : 1 },
                ]}
              >
                <View style={styles.suggestionCardHeader}>
                  <Text style={styles.suggestionCardTitle}>Fit {idx + 1}</Text>
                  <Text style={styles.suggestionCount}>
                    {outfit.items.length} pieces
                  </Text>
                </View>
                <View style={styles.suggestionItems}>
                  {outfit.items.map((item) => {
                    const uri = itemThumbnailUrl(item);
                    return (
                      <View key={item.id} style={styles.suggestionItem}>
                        {uri ? (
                          <Image
                            source={{ uri }}
                            style={styles.suggestionThumb}
                            resizeMode="contain"
                          />
                        ) : (
                          <View
                            style={[
                              styles.suggestionThumb,
                              styles.thumbPlaceholder,
                            ]}
                          />
                        )}
                        <Text style={styles.suggestionItemLabel} numberOfLines={1}>
                          {item.subcategory}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <View style={styles.modeRow}>
        {MODES.map((opt) => (
          <Pressable
            key={opt.key}
            onPress={() => setMode(opt.key)}
            style={({ pressed }) => [
              styles.modeChip,
              mode === opt.key && styles.modeChipActive,
              { opacity: pressed ? 0.75 : 1 },
            ]}
          >
            <Text
              style={[
                styles.modeText,
                mode === opt.key && styles.modeTextActive,
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <ScreenBackground />
      <FlatList
        data={visibleItems}
        keyExtractor={(item) => String(item.id)}
        numColumns={2}
        ListHeaderComponent={header}
        contentContainerStyle={[styles.list, { paddingTop: scrollTop }]}
        columnWrapperStyle={styles.row}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={colors.accent}
            progressViewOffset={scrollTop}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>No items here</Text>
            <Text style={styles.empty}>
              Try a different filter or add items to your closet.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const selected = selectedIds.has(item.id);
          const uri = itemThumbnailUrl(item);
          return (
            <Pressable
              onPress={() => toggleSelection(item.id)}
              style={({ pressed }) => [
                styles.card,
                selected && styles.cardSelected,
                shadow.card,
                { transform: [{ scale: pressed ? 0.98 : 1 }] },
              ]}
            >
              <View style={styles.thumbWrap}>
                {uri ? (
                  <Image source={{ uri }} style={styles.thumb} resizeMode="contain" />
                ) : (
                  <View style={[styles.thumb, styles.thumbPlaceholder]} />
                )}
                <View
                  style={[
                    styles.checkDot,
                    selected && styles.checkDotActive,
                  ]}
                >
                  {selected ? (
                    <Ionicons name="checkmark" size={14} color="#fff" />
                  ) : null}
                </View>
                {item.packed_for_trip ? (
                  <View style={styles.packedBadge}>
                    <Text style={styles.packedText}>Packed</Text>
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
              </View>
            </Pressable>
          );
        }}
      />

      <View style={styles.actionBar}>
        <View style={{ flex: 1 }}>
          <Text style={styles.actionTitle}>{selectedIds.size} selected</Text>
          <Text style={styles.actionSub}>Tap items to build a pack batch.</Text>
        </View>
        <Pressable
          onPress={() => applyPacked(selectedList, true)}
          disabled={selectedIds.size === 0 || busy}
          style={({ pressed }) => [
            styles.actionBtn,
            (pressed || selectedIds.size === 0 || busy) && { opacity: 0.5 },
          ]}
        >
          <Text style={styles.actionBtnText}>Pack</Text>
        </Pressable>
        <Pressable
          onPress={() => applyPacked(selectedList, false)}
          disabled={selectedIds.size === 0 || busy}
          style={({ pressed }) => [
            styles.actionBtn,
            styles.actionBtnSecondary,
            (pressed || selectedIds.size === 0 || busy) && { opacity: 0.5 },
          ]}
        >
          <Text style={styles.actionBtnText}>Unpack</Text>
        </Pressable>
      </View>
    </View>
  );
}

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
      alignItems: 'center',
      justifyContent: 'center',
    },
    list: {
      paddingHorizontal: spacing.lg,
      paddingBottom: PACK_MODE_SCROLL_BOTTOM,
    },
    heading: {
      ...typography.title,
      color: colors.text,
    },
    blurb: {
      ...typography.callout,
      color: colors.textSecondary,
      marginTop: 4,
      marginBottom: spacing.lg,
      lineHeight: 21,
    },
    summaryCard: {
      marginBottom: spacing.md,
    },
    tripCard: {
      marginBottom: spacing.md,
    },
    planCard: {
      marginBottom: spacing.md,
    },
    summaryRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    summaryTitle: {
      ...typography.headline,
      color: colors.text,
    },
    summaryText: {
      ...typography.callout,
      color: colors.textSecondary,
      marginTop: 2,
    },
    countGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    noCounts: {
      ...typography.caption,
      color: colors.textSecondary,
    },
    progressWrap: {
      marginTop: spacing.md,
    },
    progressTrack: {
      height: 8,
      borderRadius: radii.pill,
      overflow: 'hidden',
      backgroundColor: surface.chipInactive,
    },
    progressFill: {
      height: '100%',
      borderRadius: radii.pill,
      backgroundColor: colors.accent,
    },
    countPill: {
      minWidth: 82,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: radii.pill,
      backgroundColor: surface.chipInactive,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: surface.chipInactiveBorder,
    },
    countNumber: {
      color: colors.accent,
      fontWeight: '800',
      fontSize: 14,
    },
    countLabel: {
      ...typography.caption,
      color: colors.text,
      fontWeight: '700',
    },
    summaryActions: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    tripInput: {
      marginTop: spacing.md,
      borderRadius: radii.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: surface.inputBorder,
      backgroundColor: surface.inputOverlay,
      color: colors.text,
      paddingHorizontal: spacing.md,
      paddingVertical: 11,
      fontSize: 15,
    },
    dateRow: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    dateInput: {
      flex: 1,
    },
    coverageRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.md,
      marginTop: spacing.md,
    },
    coverageInput: {
      width: 88,
      marginTop: 0,
      textAlign: 'center',
      fontWeight: '800',
    },
    fieldLabel: {
      ...typography.caption,
      color: colors.text,
      fontWeight: '800',
      marginTop: spacing.md,
      marginBottom: 2,
    },
    activityGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginTop: spacing.sm,
    },
    activityChip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: radii.pill,
      backgroundColor: surface.chipInactive,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: surface.chipInactiveBorder,
    },
    activityChipActive: {
      backgroundColor: colors.accentSoft,
      borderColor: colors.accent,
    },
    activityText: {
      ...typography.caption,
      color: colors.text,
      fontWeight: '700',
    },
    activityTextActive: {
      color: colors.accent,
    },
    tripDetail: {
      ...typography.caption,
      color: colors.textSecondary,
      marginTop: spacing.sm,
      lineHeight: 18,
    },
    planDetail: {
      ...typography.callout,
      color: colors.textSecondary,
      marginTop: spacing.sm,
      lineHeight: 20,
    },
    planPill: {
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: radii.pill,
      backgroundColor: surface.chipInactive,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: surface.chipInactiveBorder,
    },
    planPillText: {
      ...typography.caption,
      color: colors.text,
      fontWeight: '700',
    },
    suggestions: {
      marginBottom: spacing.md,
    },
    suggestionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: spacing.sm,
      paddingHorizontal: 4,
    },
    suggestionTitle: {
      ...typography.bodyMedium,
      color: colors.text,
    },
    suggestionSub: {
      ...typography.caption,
      color: colors.textSecondary,
      marginTop: 2,
    },
    suggestionCard: {
      padding: spacing.md,
      marginBottom: spacing.sm,
      borderRadius: radii.lg,
      backgroundColor: colors.surfaceSolid,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: surface.cardBorder,
    },
    suggestionCardSelected: {
      borderWidth: 2,
      borderColor: colors.accent,
      backgroundColor: colors.accentSoft,
    },
    suggestionCardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.sm,
    },
    suggestionCardTitle: {
      ...typography.bodyMedium,
      color: colors.text,
    },
    suggestionCount: {
      ...typography.caption,
      color: colors.textSecondary,
    },
    suggestionItems: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    suggestionItem: {
      width: 72,
    },
    suggestionThumb: {
      width: 72,
      height: 72,
      borderRadius: radii.md,
      backgroundColor: surface.thumbBg,
    },
    suggestionItemLabel: {
      ...typography.caption,
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: 4,
    },
    modeRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    modeChip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: radii.pill,
      backgroundColor: surface.chipInactive,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: surface.chipInactiveBorder,
    },
    modeChipActive: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    modeText: {
      ...typography.caption,
      color: colors.text,
      fontWeight: '700',
    },
    modeTextActive: {
      color: '#fff',
    },
    error: {
      color: colors.danger,
      textAlign: 'center',
      marginBottom: spacing.md,
    },
    row: {
      gap: spacing.md,
    },
    card: {
      flex: 1,
      marginBottom: spacing.md,
      borderRadius: radii.lg,
      overflow: 'hidden',
      backgroundColor: colors.surfaceSolid,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: surface.cardBorder,
    },
    cardSelected: {
      borderWidth: 2,
      borderColor: colors.accent,
    },
    thumbWrap: {
      position: 'relative',
    },
    thumb: {
      width: '100%',
      aspectRatio: 1,
      backgroundColor: surface.thumbBg,
    },
    thumbPlaceholder: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkDot: {
      position: 'absolute',
      top: 8,
      right: 8,
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: surface.favBadgeBg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: surface.chipInactiveBorder,
    },
    checkDotActive: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    packedBadge: {
      position: 'absolute',
      left: 8,
      bottom: 8,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: radii.pill,
      backgroundColor: colors.accentSoft,
    },
    packedText: {
      color: colors.accent,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.3,
    },
    cardBody: {
      padding: spacing.md,
    },
    cardTitle: {
      ...typography.bodyMedium,
      color: colors.text,
    },
    cardSub: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 2,
    },
    emptyWrap: {
      alignItems: 'center',
      padding: spacing.xl,
    },
    emptyTitle: {
      ...typography.headline,
      color: colors.text,
      marginBottom: 6,
    },
    empty: {
      color: colors.textSecondary,
      textAlign: 'center',
    },
    actionBar: {
      position: 'absolute',
      left: spacing.lg,
      right: spacing.lg,
      bottom: 96,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: radii.xl,
      backgroundColor: colors.surfaceSolid,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: surface.cardBorder,
      ...shadow.card,
    },
    actionTitle: {
      ...typography.bodyMedium,
      color: colors.text,
    },
    actionSub: {
      ...typography.caption,
      color: colors.textSecondary,
      marginTop: 2,
    },
    actionBtn: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: radii.pill,
      backgroundColor: colors.accent,
    },
    actionBtnSecondary: {
      backgroundColor: colors.textSecondary,
    },
    actionBtnText: {
      color: '#fff',
      fontWeight: '800',
      fontSize: 13,
    },
  });
}
