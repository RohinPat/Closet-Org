import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as api from '../api/client';
import type {
  ClothingItem,
  OutfitRecommendation,
  PlannedOutfit,
  WeatherContext,
  WornOutfit,
} from '../api/types';
import { itemThumbnailUrl } from '../config';
import { useAuth } from '../context/AuthContext';
import { useTheme, useThemedStyles, type ThemeContextValue } from '../context/ThemeContext';
import { GlassButton, GlassCard, ScreenBackground } from '../components/Glass';
import type { AppStackParamList, MainTabParamList } from '../navigation/RootNavigator';
import { radii, spacing, typography } from '../theme';
import { TAB_SCREEN_SCROLL_BOTTOM, tabScrollContentPaddingTop } from '../utils/screenSpacing';
import { dateLabel, greetingFor, orderForDisplay, outfitReasons } from '../utils/today';
import {
  getWeatherSyncEnabled,
  requestCurrentCoordinates,
  setWeatherSyncEnabled,
  weatherHeadline,
} from '../weather';

type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'TodayTab'>,
  NativeStackNavigationProp<AppStackParamList>
>;

/** Reload suggestions when coming back to the tab after this long. */
const STALE_MS = 30 * 60 * 1000;

function localISODate(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function weatherIcon(w: WeatherContext): keyof typeof Ionicons.glyphMap {
  if (w.snowy) return 'snow-outline';
  if (w.rainy) return 'rainy-outline';
  if (w.hot) return 'sunny-outline';
  if (w.cold) return 'thermometer-outline';
  return /cloud|overcast|fog/i.test(w.condition) ? 'cloudy-outline' : 'partly-sunny-outline';
}

export function TodayScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const cardWidth = width - spacing.lg * 2;

  const [outfits, setOutfits] = useState<OutfitRecommendation[]>([]);
  const [weather, setWeather] = useState<WeatherContext | null>(null);
  const [weatherSync, setWeatherSyncState] = useState(false);
  const [worn, setWorn] = useState<WornOutfit | null>(null);
  const [plan, setPlan] = useState<PlannedOutfit | null>(null);
  const [showIdeas, setShowIdeas] = useState(false);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [wearing, setWearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Pieces owned but not clean (worn / in the wash) when there are no outfits. */
  const [inWash, setInWash] = useState(0);
  const lastLoaded = useRef(0);
  const listRef = useRef<FlatList<OutfitRecommendation>>(null);

  const load = useCallback(async (seed?: number) => {
    setError(null);
    try {
      const sync = await getWeatherSyncEnabled();
      setWeatherSyncState(sync);
      let coords: { lat: number; lon: number; locationName: string } | undefined;
      if (sync) {
        try {
          const c = await requestCurrentCoordinates();
          coords = { lat: c.latitude, lon: c.longitude, locationName: 'Current location' };
        } catch {
          coords = undefined; // weather is a bonus; suggestions still work without it
        }
      }
      const [rec, today, plans] = await Promise.all([
        api.fetchOutfitRecommendations({ seed, ...coords }),
        api.fetchTodaysOutfit(),
        api.fetchPlannedOutfits(false),
      ]);
      const todayISO = localISODate(new Date());
      setOutfits(rec.outfits);
      if (!rec.outfits.length) {
        // Tell "closet is empty" apart from "everything's in the wash".
        const closet = await api.fetchCloset();
        setInWash(closet.items.filter((i) => i.laundry_state && i.laundry_state !== 'clean').length);
      } else {
        setInWash(0);
      }
      setWeather(rec.weather ?? null);
      setWorn(today.outfit);
      setPlan(plans.plans.find((p) => p.planned_for === todayISO) ?? null);
      setIndex(0);
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
      lastLoaded.current = Date.now();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load today’s outfits');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (Date.now() - lastLoaded.current > STALE_MS) void load();
    }, [load])
  );

  const enableWeather = async () => {
    await setWeatherSyncEnabled(true);
    setLoading(true);
    await load();
  };

  const wearCurrent = async () => {
    const outfit = outfits[index];
    if (!outfit) return;
    setWearing(true);
    try {
      const res = await api.wearOutfit(outfit.items.map((i) => i.id), outfit.occasion);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setWorn(res.outfit);
      setShowIdeas(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not log this outfit');
    } finally {
      setWearing(false);
    }
  };

  const onPage = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / (cardWidth + spacing.md));
    setIndex(Math.max(0, Math.min(i, outfits.length - 1)));
  };

  const openItem = (item: ClothingItem) => navigation.navigate('ItemDetail', { item });

  const header = (
    <View style={styles.header}>
      <Text style={styles.date}>{dateLabel(new Date())}</Text>
      <Text style={styles.greeting}>{greetingFor(new Date(), user?.full_name || user?.username)}</Text>
      {weather ? (
        <View style={styles.pill}>
          <Ionicons name={weatherIcon(weather)} size={16} color={colors.text} />
          <Text style={styles.pillText}>{weatherHeadline(weather)}</Text>
        </View>
      ) : !weatherSync ? (
        <Pressable
          onPress={enableWeather}
          style={({ pressed }) => [styles.pill, styles.pillAction, { opacity: pressed ? 0.7 : 1 }]}
          accessibilityRole="button"
        >
          <Ionicons name="location-outline" size={16} color={colors.accent} />
          <Text style={[styles.pillText, { color: colors.accent }]}>Dress for today’s weather</Text>
        </Pressable>
      ) : null}
    </View>
  );

  const planBanner = plan ? (
    <Pressable onPress={() => navigation.navigate('PlanningAhead')} accessibilityRole="button">
      <GlassCard padded style={styles.planCard}>
        <Ionicons name="calendar-outline" size={18} color={colors.accent} />
        <View style={{ flex: 1 }}>
          <Text style={styles.planLabel}>Planned for today</Text>
          <Text style={styles.planTitle} numberOfLines={1}>{plan.title}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </GlassCard>
    </Pressable>
  ) : null;

  const tile = (item: ClothingItem, style: object) => {
    const uri = itemThumbnailUrl(item);
    return (
      <Pressable
        key={item.id}
        onPress={() => openItem(item)}
        style={[styles.tile, style]}
        accessibilityLabel={`${item.colors?.[0] ?? ''} ${item.category}`.trim()}
      >
        {uri ? (
          <Image source={{ uri }} style={styles.tileImage} resizeMode="contain" />
        ) : (
          <Ionicons name="shirt-outline" size={28} color={colors.textMuted} />
        )}
      </Pressable>
    );
  };

  // Flat lay: clothes as tall tiles; shoes/accessories share one full-width row
  // underneath, so a single pair of shoes gets a wide tile instead of a lone square.
  const collage = (items: ClothingItem[]) => {
    const ordered = orderForDisplay(items);
    const isSmall = (i: ClothingItem) => i.subcategory === 'Footwear' || i.subcategory === 'Accessory';
    const large = ordered.filter((i) => !isSmall(i));
    const small = ordered.filter(isSmall);
    return (
      <View style={styles.collage}>
        <View style={styles.row}>
          {large.map((i) => tile(i, large.length === 1 ? styles.tileSolo : styles.tileLarge))}
        </View>
        {small.length ? (
          <View style={styles.row}>
            {small.map((i) => tile(i, small.length === 1 ? styles.tileWide : styles.tileSmall))}
          </View>
        ) : null}
      </View>
    );
  };

  const renderOutfit = ({ item: outfit }: { item: OutfitRecommendation }) => {
    const reasons = outfitReasons(outfit.items, weather);
    return (
      <GlassCard padded style={[styles.outfitCard, { width: cardWidth }]}>
        {collage(outfit.items)}
        {reasons.length ? (
          <View style={styles.reasons}>
            {reasons.map((r) => (
              <View key={r} style={styles.reason}>
                <Text style={styles.reasonText}>{r}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </GlassCard>
    );
  };

  let body: React.ReactNode;
  if (loading) {
    body = <ActivityIndicator style={{ marginTop: spacing.xxl }} color={colors.accent} />;
  } else if (error && !outfits.length && !worn) {
    body = (
      <GlassCard padded style={styles.message}>
        <Text style={styles.messageTitle}>Couldn’t load today</Text>
        <Text style={styles.messageBody}>{error}</Text>
        <GlassButton title="Try again" onPress={() => { setLoading(true); void load(); }} />
      </GlassCard>
    );
  } else if (worn && !showIdeas) {
    const at = new Date(`${worn.worn_at.replace(' ', 'T')}Z`);
    body = (
      <>
        <GlassCard padded style={styles.outfitCard}>
          <View style={styles.wornBadge}>
            <Ionicons name="checkmark-circle" size={18} color={colors.success} />
            <Text style={styles.wornText}>
              Wearing today
              {Number.isNaN(at.getTime())
                ? ''
                : ` · logged ${at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`}
            </Text>
          </View>
          {collage(worn.items)}
        </GlassCard>
        {outfits.length ? (
          <GlassButton title="See other ideas" variant="ghost" onPress={() => setShowIdeas(true)} />
        ) : null}
      </>
    );
  } else if (!outfits.length && inWash > 0) {
    body = (
      <GlassCard padded style={styles.message}>
        <Text style={styles.messageTitle}>Everything’s in the wash</Text>
        <Text style={styles.messageBody}>
          {inWash === 1 ? '1 piece is' : `${inWash} pieces are`} waiting on laundry. Mark them clean in
          your closet and Today will have outfits again.
        </Text>
        <GlassButton title="Open closet" onPress={() => navigation.navigate('ClosetTab')} />
      </GlassCard>
    );
  } else if (!outfits.length) {
    body = (
      <GlassCard padded style={styles.message}>
        <Text style={styles.messageTitle}>Nothing to suggest yet</Text>
        <Text style={styles.messageBody}>
          Add a few tops and bottoms (and a pair of shoes) and Today will put outfits together for you.
        </Text>
        <GlassButton title="Add clothes" onPress={() => navigation.navigate('QuickAdd')} />
      </GlassCard>
    );
  } else {
    body = (
      <>
        <FlatList
          ref={listRef}
          data={outfits}
          horizontal
          keyExtractor={(o) => o.items.map((i) => i.id).join('-')}
          renderItem={renderOutfit}
          showsHorizontalScrollIndicator={false}
          snapToInterval={cardWidth + spacing.md}
          decelerationRate="fast"
          ItemSeparatorComponent={() => <View style={{ width: spacing.md }} />}
          onMomentumScrollEnd={onPage}
          style={styles.carousel}
        />
        <View style={styles.dots}>
          {outfits.map((o, i) => (
            <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>
        {error ? <Text style={styles.inlineError}>{error}</Text> : null}
        <GlassButton
          title={worn ? 'Wear this instead' : 'Wear this'}
          onPress={wearCurrent}
          loading={wearing}
          disabled={wearing}
          fullWidth
          testID="today-wear"
        />
        <GlassButton
          title="Shuffle ideas"
          variant="ghost"
          onPress={() => { setRefreshing(true); void load(Date.now()); }}
          style={{ marginTop: spacing.sm }}
        />
      </>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <ScreenBackground />
      <ScrollView
        contentContainerStyle={[styles.container, { paddingTop: tabScrollContentPaddingTop(insets) }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); void load(); }}
            tintColor={colors.accent}
          />
        }
      >
        {header}
        {planBanner}
        {body}
      </ScrollView>
    </View>
  );
}

function makeStyles({ colors, surface }: ThemeContextValue) {
  return StyleSheet.create({
    container: { paddingHorizontal: spacing.lg, paddingBottom: TAB_SCREEN_SCROLL_BOTTOM },
    header: { marginBottom: spacing.lg },
    date: { ...typography.caption, color: colors.textMuted, letterSpacing: 1 },
    greeting: { ...typography.title, color: colors.text, marginTop: 2 },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      alignSelf: 'flex-start',
      marginTop: spacing.sm,
      paddingVertical: 6,
      paddingHorizontal: spacing.md,
      borderRadius: radii.pill,
      backgroundColor: surface.chipInactive,
    },
    pillAction: { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.accent },
    pillText: { ...typography.callout, color: colors.text },
    planCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
    planLabel: { ...typography.caption, color: colors.textMuted },
    planTitle: { ...typography.bodyMedium, color: colors.text },
    carousel: { marginHorizontal: -spacing.lg, paddingHorizontal: spacing.lg, flexGrow: 0 },
    outfitCard: { marginBottom: spacing.md },
    collage: { gap: spacing.sm },
    row: { flexDirection: 'row', gap: spacing.sm },
    tile: {
      borderRadius: radii.md,
      backgroundColor: surface.thumbBg,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    tileLarge: { flex: 1, aspectRatio: 0.82 },
    tileSolo: { flex: 1, aspectRatio: 1.25 },
    tileSmall: { flex: 1, aspectRatio: 1.3 },
    tileWide: { flex: 1, aspectRatio: 2.6 },
    tileImage: { width: '88%', height: '88%' },
    reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.md },
    reason: {
      paddingVertical: 4,
      paddingHorizontal: 10,
      borderRadius: radii.pill,
      backgroundColor: colors.accentSoft,
    },
    reasonText: { ...typography.caption, color: colors.accent },
    dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: spacing.lg },
    dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: surface.chipInactiveBorder },
    dotActive: { width: 18, backgroundColor: colors.accent },
    wornBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.md },
    wornText: { ...typography.bodyMedium, color: colors.text },
    message: { gap: spacing.md },
    messageTitle: { ...typography.headline, color: colors.text },
    messageBody: { ...typography.body, color: colors.textSecondary },
    inlineError: { ...typography.callout, color: colors.danger, textAlign: 'center', marginBottom: spacing.sm },
  });
}
