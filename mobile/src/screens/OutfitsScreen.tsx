import React, { useCallback, useEffect, useMemo, useState } from 'react';

import {

  Dimensions,

  Image,

  Modal,

  Platform,

  Pressable,

  RefreshControl,

  ScrollView,

  StyleSheet,

  Switch,

  Text,

  TextInput,

  View,

} from 'react-native';

import { BlurView } from 'expo-blur';

import * as api from '../api/client';

import type {

  AiStylistResponse,

  ClothingItem,

  ClosetLocation,

  OutfitRecommendation,

  WeatherContext,

} from '../api/types';

import { itemImageUrl } from '../config';

import { GlassButton, GlassCard, GlassInputContainer, ScreenBackground } from '../components/Glass';

import {

  getWeatherSyncEnabled,

  requestCurrentCoordinates,

  setWeatherSyncEnabled,

  weatherDetail,

} from '../weather';

import { useTheme, useThemedStyles } from '../context/ThemeContext';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { tabScrollContentPaddingTop, TAB_SCREEN_SCROLL_BOTTOM } from '../utils/screenSpacing';

import {

  blur,

  radii,

  spacing,

  typography,

  type ThemeColors,

  type ThemeSurface,

} from '../theme';

import { useOutfitsAiStylistEnabled } from '../preferences';

import { Ionicons } from '@expo/vector-icons';



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



const VIBES = [

  { label: 'Any vibe', value: '' },

  { label: 'Clean prep', value: 'clean_prep' },

  { label: 'Streetwear', value: 'streetwear' },

  { label: 'Cozy', value: 'cozy' },
  { label: 'Minimal', value: 'minimal' },
  { label: 'Bold', value: 'bold' },
  { label: 'Athleisure', value: 'athleisure' },

];



function itemChipLabel(item: ClothingItem) {

  const color = item.colors?.[0];

  const label = item.category || item.subcategory || 'Item';

  return [color, label].filter(Boolean).join(' ');

}



type ChipProps = {

  label: string;

  active: boolean;

  onPress: () => void;

};



type OutfitSource = 'home' | 'packed';



const OUTFIT_SOURCES: { label: string; value: OutfitSource }[] = [

  { label: 'Home closet', value: 'home' },

  { label: 'Travel bag', value: 'packed' },

];

/** Mirrors backend/models/outfit_recommender.py occasion_styles */
const OCCASION_STYLES: Record<string, readonly string[]> = {
  work: ['Formal', 'Business'],
  casual: ['Casual', 'Streetwear'],
  gym: ['Athletic'],
  date: ['Formal', 'Casual'],
  party: ['Formal', 'Streetwear'],
};

/** Mirrors backend/models/outfit_recommender.py vibe_styles */
const VIBE_STYLES: Record<string, readonly string[]> = {
  clean_prep: ['Formal', 'Business'],
  streetwear: ['Streetwear', 'Athletic'],
  cozy: ['Casual'],
  minimal: ['Casual', 'Business'],
  bold: ['Streetwear', 'Formal'],
  athleisure: ['Athletic', 'Casual'],
};

function normItemStyle(style: string | null | undefined): string {

  return (style || 'Casual').trim();

}

/** Same eligibility as outfit_recommender.generate_outfits (clean, not lent, packed split). */
function itemsEligibleForOutfits(

  items: ClothingItem[],

  outfitSource: OutfitSource,

  activeClosetLocationId: number | null,

): ClothingItem[] {

  return items.filter((item) => {

    if (item.lent_to) return false;

    if (

      activeClosetLocationId != null &&

      item.closet_location_id !== activeClosetLocationId

    )

      return false;

    if (item.washed === false) return false;

    if (item.is_bulk && (item.clean_count ?? 0) <= 0) return false;

    if (outfitSource === 'packed') {

      if (!item.packed_for_trip) return false;

    } else if (item.packed_for_trip) {

      return false;

    }

    return true;

  });

}

function poolSupportsSeason(pool: ClothingItem[], seasonValue: string): boolean {

  return pool.some((item) => {

    const s = item.season?.trim();

    return s === seasonValue || s === 'All-Season';

  });

}

function poolSupportsOccasion(pool: ClothingItem[], occasionValue: string): boolean {

  const preferred = OCCASION_STYLES[occasionValue];

  if (!preferred) return true;

  return pool.some((item) => preferred.includes(normItemStyle(item.style)));

}

function poolSupportsVibe(pool: ClothingItem[], vibeValue: string): boolean {

  const preferred = VIBE_STYLES[vibeValue];

  if (!preferred) return true;

  return pool.some((item) => preferred.includes(normItemStyle(item.style)));

}

function locationHasAnyItems(
  items: ClothingItem[],
  locationId: number,
): boolean {
  return items.some(
    (item) => !item.lent_to && item.closet_location_id === locationId,
  );
}



function Chip({ label, active, onPress }: ChipProps) {

  const { colors, surface, mode } = useTheme();

  const lightChip = mode === 'light';

  return (

    <Pressable

      onPress={onPress}

      style={({ pressed }) => [

        chipStyles.chip,

        { transform: [{ scale: pressed ? 0.96 : 1 }] },

      ]}

    >

      {!lightChip ? (
        <BlurView
          intensity={active ? 0 : 40}
          tint={surface.blurTint}
          style={[StyleSheet.absoluteFill, { borderRadius: radii.pill }]}
        />
      ) : null}

      <View

        style={[

          StyleSheet.absoluteFill,

          {

            backgroundColor: active ? colors.accent : surface.chipInactive,

            borderRadius: radii.pill,

            borderWidth: lightChip ? 0 : StyleSheet.hairlineWidth,

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



export function OutfitsScreen() {

  const insets = useSafeAreaInsets();

  const scrollTop = tabScrollContentPaddingTop(insets);

  const { colors, surface, mode } = useTheme();

  const styles = useThemedStyles(makeStyles);

  const [occasion, setOccasion] = useState('');

  const [season, setSeason] = useState('');

  const [vibe, setVibe] = useState('');

  const [outfitSource, setOutfitSource] = useState<OutfitSource>('home');

  const [packCounts, setPackCounts] = useState({ packed: 0, home: 0 });

  const [outfits, setOutfits] = useState<OutfitRecommendation[]>([]);

  const [closetItems, setClosetItems] = useState<ClothingItem[]>([]);

  const [closetLocations, setClosetLocations] = useState<ClosetLocation[]>([]);

  const [activeClosetLocationId, setActiveClosetLocationId] = useState<number | null>(null);

  const [weatherSync, setWeatherSync] = useState(false);

  const [weather, setWeather] = useState<WeatherContext | null>(null);

  const [weatherBusy, setWeatherBusy] = useState(false);

  const [loading, setLoading] = useState(false);

  const [refreshing, setRefreshing] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [stylistPrompt, setStylistPrompt] = useState('What should I wear today?');

  const [stylistResponse, setStylistResponse] = useState<AiStylistResponse | null>(null);

  const [stylistLoading, setStylistLoading] = useState(false);

  const [stylistError, setStylistError] = useState<string | null>(null);

  const [selectedStylistItemId, setSelectedStylistItemId] = useState<number | null>(null);

  const [feedbackBySignature, setFeedbackBySignature] = useState<Record<string, string>>({});

  const [aiStylistEnabled, setAiStylistEnabled] = useOutfitsAiStylistEnabled();

  const [extrasMenuOpen, setExtrasMenuOpen] = useState(false);



  const outfitPoolItems = useMemo(

    () =>

      itemsEligibleForOutfits(

        closetItems,

        outfitSource,

        activeClosetLocationId,

      ),

    [closetItems, outfitSource, activeClosetLocationId],

  );



  const filterChipsReady = closetItems.length > 0;



  const visibleOccasions = useMemo(() => {

    if (!filterChipsReady) return OCCASIONS;

    return OCCASIONS.filter(

      (o) =>

        !o.value || poolSupportsOccasion(outfitPoolItems, o.value),

    );

  }, [filterChipsReady, outfitPoolItems]);



  const visibleSeasons = useMemo(() => {

    if (!filterChipsReady) return SEASONS;

    return SEASONS.filter(

      (s) => !s.value || poolSupportsSeason(outfitPoolItems, s.value),

    );

  }, [filterChipsReady, outfitPoolItems]);



  const visibleVibes = useMemo(() => {

    if (!filterChipsReady) return VIBES;

    return VIBES.filter(

      (v) => !v.value || poolSupportsVibe(outfitPoolItems, v.value),

    );

  }, [filterChipsReady, outfitPoolItems]);



  const visibleClosetLocations = useMemo(() => {

    return closetLocations.filter((loc) =>

      locationHasAnyItems(closetItems, loc.id),

    );

  }, [closetLocations, closetItems]);



  const showClosetLocationPicker = visibleClosetLocations.length > 1;



  const visibleOutfitSources = useMemo(() => {

    if (!filterChipsReady) return OUTFIT_SOURCES;

    if (packCounts.packed > 0) return OUTFIT_SOURCES;

    return OUTFIT_SOURCES.filter((s) => s.value === 'home');

  }, [filterChipsReady, packCounts.packed]);



  useEffect(() => {

    if (occasion && !visibleOccasions.some((o) => o.value === occasion)) {

      setOccasion('');

    }

  }, [occasion, visibleOccasions]);



  useEffect(() => {

    if (season && !visibleSeasons.some((s) => s.value === season)) {

      setSeason('');

    }

  }, [season, visibleSeasons]);



  useEffect(() => {

    if (vibe && !visibleVibes.some((v) => v.value === vibe)) {

      setVibe('');

    }

  }, [vibe, visibleVibes]);



  useEffect(() => {

    if (

      activeClosetLocationId != null &&

      !visibleClosetLocations.some((l) => l.id === activeClosetLocationId)

    ) {

      setActiveClosetLocationId(null);

    }

  }, [activeClosetLocationId, visibleClosetLocations]);



  useEffect(() => {

    if (outfitSource === 'packed' && packCounts.packed === 0) {

      setOutfitSource('home');

    }

  }, [outfitSource, packCounts.packed]);



  const generate = useCallback(async () => {

    setError(null);

    setLoading(true);

    try {

      const [closet, locs, settings] = await Promise.all([

        api.fetchCloset(),

        api.fetchClosetLocations(),

        api.fetchSettings(),

      ]);

      setClosetLocations(locs.locations);

      const defaultLoc = settings.default_closet_location_id ?? null;

      /** Resolve in-flight (state updates are async; avoids stale closure + empty-closet loops). */
      const effectiveClosetLocationId =

        activeClosetLocationId != null

          ? activeClosetLocationId

          : defaultLoc != null && locationHasAnyItems(closet.items, defaultLoc)

            ? defaultLoc

            : null;

      setActiveClosetLocationId((prev) => {

        if (prev != null) return prev;

        if (defaultLoc != null && locationHasAnyItems(closet.items, defaultLoc))

          return defaultLoc;

        return null;

      });

      const locationScoped =

        effectiveClosetLocationId == null

          ? closet.items

          : closet.items.filter(

              (item) => item.closet_location_id === effectiveClosetLocationId,

            );

      setClosetItems(locationScoped.filter((item) => !item.lent_to));

      const packedIds = locationScoped

        .filter((item) => item.packed_for_trip)

        .map((item) => item.id);

      const homeIds = locationScoped

        .filter((item) => !item.packed_for_trip)

        .map((item) => item.id);

      setPackCounts({ packed: packedIds.length, home: homeIds.length });



      if (outfitSource === 'packed' && packedIds.length === 0) {

        setOutfits([]);

        setError('Pack a few clean items first, then Travel bag can suggest outfits.');

        return;

      }



      let weatherParams:

        | { lat: number; lon: number; locationName: string }

        | undefined;

      if (weatherSync) {

        setWeatherBusy(true);

        try {

          const coords = await requestCurrentCoordinates();

          weatherParams = {

            lat: coords.latitude,

            lon: coords.longitude,

            locationName: 'Current location',

          };

        } catch (e) {

          setWeather(null);

          setError(

            e instanceof Error

              ? e.message

              : 'Could not access location for weather sync.'

          );

        }

      }



      const data = await api.fetchOutfitRecommendations({

        occasion: occasion || undefined,

        season: season || undefined,

        seed: Date.now(),

        vibe: vibe || undefined,

        includePacked: outfitSource === 'packed',

        excludeItemIds: outfitSource === 'packed' ? homeIds : packedIds,

        closetLocationId: effectiveClosetLocationId,

        ...weatherParams,

      });

      setOutfits(data.outfits);

      setWeather(data.weather ?? null);

    } catch (e) {

      setError(e instanceof Error ? e.message : 'Could not load outfits');

      setOutfits([]);

    } finally {

      setLoading(false);

      setRefreshing(false);

      setWeatherBusy(false);

    }

  }, [activeClosetLocationId, occasion, outfitSource, season, vibe, weatherSync]);



  const onRefresh = useCallback(() => {

    setRefreshing(true);

    if (aiStylistEnabled) {

      void (async () => {

        try {

          await askStylist();

        } finally {

          setRefreshing(false);

        }

      })();

      return;

    }

    void generate();

  }, [aiStylistEnabled, generate]);



  useEffect(() => {

    if (aiStylistEnabled) return;

    generate();

  }, [aiStylistEnabled, generate]);



  useEffect(() => {

    getWeatherSyncEnabled().then(setWeatherSync);

  }, []);



  async function askStylist(promptOverride?: string) {

    const message = (promptOverride ?? stylistPrompt).trim();

    if (!message) {

      setStylistError('Ask the stylist what you need help with first.');

      return;

    }



    setStylistPrompt(message);

    setStylistError(null);

    setStylistLoading(true);

    try {

      const [closet, locs, settings] = await Promise.all([

        api.fetchCloset(),

        api.fetchClosetLocations(),

        api.fetchSettings(),

      ]);

      setClosetLocations(locs.locations);

      const defaultLoc = settings.default_closet_location_id ?? null;

      const resolvedLocationId =

        activeClosetLocationId != null

          ? activeClosetLocationId

          : defaultLoc != null && locationHasAnyItems(closet.items, defaultLoc)

            ? defaultLoc

            : null;

      if (activeClosetLocationId === null && resolvedLocationId !== null) {

        setActiveClosetLocationId(resolvedLocationId);

      }

      const locationScoped =

        resolvedLocationId == null

          ? closet.items

          : closet.items.filter((item) => item.closet_location_id === resolvedLocationId);

      setClosetItems(locationScoped.filter((item) => !item.lent_to));

      const packedIds = locationScoped

        .filter((item) => item.packed_for_trip)

        .map((item) => item.id);

      const homeIds = locationScoped

        .filter((item) => !item.packed_for_trip)

        .map((item) => item.id);

      setPackCounts({ packed: packedIds.length, home: homeIds.length });



      let weatherParams:

        | { lat: number; lon: number; location_name: string }

        | undefined;

      if (weatherSync) {

        setWeatherBusy(true);

        const coords = await requestCurrentCoordinates();

        weatherParams = {

          lat: coords.latitude,

          lon: coords.longitude,

          location_name: 'Current location',

        };

      }



      const data = await api.postAiStylist({

        message,

        closet_location_id: resolvedLocationId,

        include_packed: outfitSource === 'packed',

        exclude_item_ids: outfitSource === 'packed' ? homeIds : packedIds,

        pin_item_ids: selectedStylistItemId ? [selectedStylistItemId] : undefined,

        ...weatherParams,

      });

      setStylistResponse(data);

      setWeather(data.weather ?? weather);

    } catch (e) {

      setStylistError(e instanceof Error ? e.message : 'Could not ask the stylist');

    } finally {

      setStylistLoading(false);

      setWeatherBusy(false);

    }

  }



  async function sendStylistFeedback(signature: string, useful: boolean) {

    setFeedbackBySignature((prev) => ({

      ...prev,

      [signature]: useful ? 'Saving...' : 'Noted...',

    }));

    try {

      await api.postAiStylistFeedback({

        item_signature: signature,

        useful,

        message: stylistPrompt,

      });

      setFeedbackBySignature((prev) => ({

        ...prev,

        [signature]: useful ? 'Marked useful' : 'Marked not useful',

      }));

    } catch (e) {

      setFeedbackBySignature((prev) => ({

        ...prev,

        [signature]: e instanceof Error ? e.message : 'Could not save feedback',

      }));

    }

  }



  const stylistGroundingItems = closetItems

    .filter((item) =>

      outfitSource === 'packed' ? item.packed_for_trip : !item.packed_for_trip

    )

    .slice(0, 16);



  function renderAiStylistMainPanel() {

    return (

      <GlassCard padded style={styles.stylistMainCard}>

        <View style={styles.stylistHeader}>

          <View style={{ flex: 1 }}>

            <Text style={styles.stylistTitle}>AI Stylist</Text>

            <Text style={styles.stylistSub}>

              Ask in your own words. The stylist only considers items and tags already in your closet — not photos.

            </Text>

          </View>

          <View style={styles.stylistHeaderAside}>

            <View style={styles.sourceBadge}>

              <Text style={styles.sourceText}>

                {stylistResponse?.source === 'claude' ? 'Claude' : 'Local'}

              </Text>

            </View>

          </View>

        </View>

        <GlassInputContainer style={styles.promptShellAi}>

          <TextInput

            value={stylistPrompt}

            onChangeText={setStylistPrompt}

            placeholder="What should I wear today?"

            placeholderTextColor={colors.textMuted}

            style={styles.promptInputAi}

            multiline

            returnKeyType="send"

            onSubmitEditing={() => askStylist()}

          />

        </GlassInputContainer>

        {stylistGroundingItems.length > 0 ? (

          <>

            <Text style={styles.groundingLabel}>Ground with an item</Text>

            <View style={styles.quickPrompts}>

              <Chip

                label="No specific item"

                active={selectedStylistItemId === null}

                onPress={() => setSelectedStylistItemId(null)}

              />

              {stylistGroundingItems.map((item) => (

                <Chip

                  key={item.id}

                  label={itemChipLabel(item)}

                  active={selectedStylistItemId === item.id}

                  onPress={() => setSelectedStylistItemId(item.id)}

                />

              ))}

            </View>

          </>

        ) : null}

        <GlassButton

          title="Ask stylist"

          onPress={() => askStylist()}

          loading={stylistLoading}

          style={styles.stylistButton}

        />

        {stylistError ? <Text style={styles.error}>{stylistError}</Text> : null}

        {stylistResponse ? (

          <View style={styles.stylistResponse}>

            <Text style={styles.stylistMessage}>{stylistResponse.message}</Text>

            {stylistResponse.suggestions.map((suggestion, idx) => (

              <View key={`${suggestion.title}-${idx}`} style={styles.stylistSuggestion}>

                <View style={styles.cardHeader}>

                  <Text style={styles.cardTitle}>{suggestion.title}</Text>

                  <View style={styles.scoreBadge}>

                    <Text style={styles.scoreText}>

                      {Math.round(suggestion.outfit.score)}

                    </Text>

                  </View>

                </View>

                <Text style={styles.rationale}>{suggestion.rationale}</Text>

                <ScrollView

                  horizontal

                  showsHorizontalScrollIndicator={false}

                  contentContainerStyle={styles.outfitRow}

                >

                  {suggestion.outfit.items.map((item) => {

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

                          <View

                            style={[

                              styles.miniImg,

                              { backgroundColor: surface.thumbBg },

                            ]}

                          />

                        )}

                        <Text style={styles.miniLabel} numberOfLines={1}>

                          {item.subcategory}

                        </Text>

                      </View>

                    );

                  })}

                </ScrollView>

                <View style={styles.feedbackRow}>

                  <GlassButton

                    title="Useful"

                    variant="secondary"

                    fullWidth={false}

                    onPress={() => sendStylistFeedback(suggestion.signature, true)}

                  />

                  <GlassButton

                    title="Not useful"

                    variant="secondary"

                    fullWidth={false}

                    onPress={() => sendStylistFeedback(suggestion.signature, false)}

                  />

                  {feedbackBySignature[suggestion.signature] ? (

                    <Text style={styles.feedbackText}>

                      {feedbackBySignature[suggestion.signature]}

                    </Text>

                  ) : null}

                </View>

              </View>

            ))}

          </View>

        ) : null}

      </GlassCard>

    );

  }



  return (

    <View style={{ flex: 1 }}>

      <ScreenBackground />

      <ScrollView

        contentContainerStyle={[styles.container, { paddingTop: scrollTop }]}

        showsVerticalScrollIndicator={false}

        refreshControl={

          <RefreshControl

            refreshing={refreshing}

            onRefresh={onRefresh}

            tintColor={colors.accent}

            progressViewOffset={scrollTop}

          />

        }

      >

        <View style={styles.titleRow}>

          <Text style={[styles.heading, styles.titleRowHeading]}>Outfits</Text>

          <Pressable

            onPress={() => setExtrasMenuOpen(true)}

            hitSlop={10}

            style={({ pressed }) => [

              styles.extrasMenuButton,

              { opacity: pressed ? 0.65 : 1 },

            ]}

            accessibilityRole="button"

            accessibilityLabel="Open outfit options"

          >

            <Ionicons name="menu-outline" size={26} color={colors.text} />

            {(weatherSync || aiStylistEnabled) ? (

              <View style={styles.extrasMenuBadgeDot} />

            ) : null}

          </Pressable>

        </View>

        <Text style={[styles.blurb, aiStylistEnabled && styles.blurbAiMode]}>

          {aiStylistEnabled

            ? 'Ask the stylist for outfit ideas — it uses your closet metadata, not photos.'

            : 'Curated combinations from your closet.'}

        </Text>





        <Text style={[styles.sectionLabel, aiStylistEnabled && styles.sectionLabelAiMode]}>Suggestion mode</Text>

        <View style={styles.chips}>

          {visibleOutfitSources.map((source) => (

            <Chip

              key={source.value}

              label={

                source.value === 'packed'

                  ? `${source.label} (${packCounts.packed})`

                  : `${source.label} (${packCounts.home})`

              }

              active={outfitSource === source.value}

              onPress={() => setOutfitSource(source.value)}

            />

          ))}

        </View>



        {showClosetLocationPicker ? (

          <>

            <Text style={[styles.sectionLabel, aiStylistEnabled && styles.sectionLabelAiMode]}>Closet location</Text>

            <View style={styles.chips}>

              <Chip

                label="All closets"

                active={activeClosetLocationId === null}

                onPress={() => setActiveClosetLocationId(null)}

              />

              {visibleClosetLocations.map((loc) => (

                <Chip

                  key={loc.id}

                  label={loc.name}

                  active={activeClosetLocationId === loc.id}

                  onPress={() => setActiveClosetLocationId(loc.id)}

                />

              ))}

            </View>

          </>

        ) : null}



        {aiStylistEnabled ? renderAiStylistMainPanel() : null}



        {!aiStylistEnabled ? (

        <>



        <Text style={styles.sectionLabel}>Occasion</Text>

        <View style={styles.chips}>

          {visibleOccasions.map((o) => (

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

          {visibleSeasons.map((s) => (

            <Chip

              key={s.value || 'any-s'}

              label={s.label}

              active={season === s.value}

              onPress={() => setSeason(s.value)}

            />

          ))}

        </View>



        <Text style={styles.sectionLabel}>Vibe</Text>

        <View style={styles.chips}>

          {visibleVibes.map((v) => (

            <Chip

              key={v.value || 'any-v'}

              label={v.label}

              active={vibe === v.value}

              onPress={() => setVibe(v.value)}

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

          <View style={styles.outfitSkeletonStack}>

            {[0, 1, 2].map((i) => (

              <View key={i} style={[styles.outfitSkeletonCard, { borderColor: surface.cardBorder }]}>

                <View

                  style={[

                    styles.outfitSkeletonHeading,

                    { backgroundColor: surface.secondaryOverlay },

                  ]}

                />

                <View style={styles.outfitSkeletonRow}>

                  {[0, 1, 2, 3].map((j) => (

                    <View

                      key={j}

                      style={[

                        styles.outfitSkeletonThumb,

                        { backgroundColor: surface.thumbBg },

                      ]}

                    />

                  ))}

                </View>

              </View>

            ))}

          </View>

        ) : null}



        {outfits.map((outfit, idx) => (

          <GlassCard key={idx} padded style={styles.card}>

            <View style={styles.cardHeader}>

              <Text style={styles.cardTitle}>Outfit {idx + 1}</Text>

              <View style={styles.scoreBadge}>

                <Text style={styles.scoreText}>

                  {Math.round(outfit.score)}

                </Text>

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

                      <View

                        style={[

                          styles.miniImg,

                          { backgroundColor: surface.thumbBg },

                        ]}

                      />

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

        </>

        ) : null}

      </ScrollView>

      <Modal
        visible={extrasMenuOpen}
        animationType="slide"
        transparent
        statusBarTranslucent={Platform.OS === 'android'}
        onRequestClose={() => setExtrasMenuOpen(false)}
      >
        <View style={styles.extrasModalWrap}>
          <Pressable
            style={styles.extrasSheetBackdrop}
            onPress={() => setExtrasMenuOpen(false)}
          />
          <View
            style={[
              styles.extrasSheet,
              { paddingBottom: Math.max(insets.bottom, spacing.md) + spacing.sm },
            ]}
          >
            <BlurView
              intensity={Platform.OS === 'ios' ? blur.intensity : 48}
              tint={surface.blurTint}
              style={styles.extrasSheetFrost}
            />
            <View
              style={[
                StyleSheet.absoluteFill,
                styles.extrasSheetFrost,
                {
                  backgroundColor:
                    mode === 'light'
                      ? 'rgba(255, 255, 255, 0.76)'
                      : 'rgba(26, 26, 36, 0.72)',
                },
              ]}
            />
            <View style={styles.extrasSheetHandlePad}>
              <View style={[styles.extrasSheetHandle, { backgroundColor: colors.textMuted }]} />
            </View>
            <View style={styles.extrasSheetHeader}>
              <View style={styles.extrasSheetHeaderSide} />
              <Text style={styles.extrasSheetTitle}>Outfit options</Text>
              <Pressable
                onPress={() => setExtrasMenuOpen(false)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Close menu"
                style={({ pressed }) => [
                  styles.extrasSheetClose,
                  { backgroundColor: surface.secondaryOverlay, opacity: pressed ? 0.75 : 1 },
                ]}
              >
                <Ionicons name="close" size={22} color={colors.text} />
              </Pressable>
            </View>
            <Text style={styles.extrasSheetHint}>These apply to outfit suggestions on this tab.</Text>
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              style={styles.extrasSheetScroll}
              contentContainerStyle={styles.extrasSheetInner}
            >
              <GlassCard
                padded={false}
                radius={radii.lg}
                variant="solid"
                style={styles.extrasMenuGroup}
              >
                <View style={styles.extrasMenuRow}>
                  <View style={[styles.extrasMenuIconWrap, { backgroundColor: colors.accentSoft }]}>
                    <Ionicons name="partly-sunny-outline" size={22} color={colors.accent} />
                  </View>
                  <View style={styles.toggleRowText}>
                    <Text style={styles.toggleLabel}>Weather-aware outfits</Text>
                    <Text style={styles.toggleCaption} numberOfLines={3}>
                      {weatherBusy
                        ? 'Syncing forecast…'
                        : weatherSync
                          ? weather
                            ? weatherDetail(weather)
                            : 'On — forecast loads with your next suggestion.'
                          : 'Off — suggestions ignore the forecast.'}
                    </Text>
                  </View>
                  <Switch
                    accessibilityLabel="Use weather in outfit suggestions"
                    value={weatherSync}
                    onValueChange={(on) => {
                      void (async () => {
                        setWeatherSync(on);
                        await setWeatherSyncEnabled(on);
                        if (!on) setWeather(null);
                      })();
                    }}
                    trackColor={{ false: colors.hairline, true: colors.accentSoft }}
                    thumbColor={Platform.OS === 'android' ? (weatherSync ? colors.accent : colors.surfaceSolid) : undefined}
                  />
                </View>
                <View style={[styles.extrasMenuDivider, { backgroundColor: surface.cardBorder }]} />
                <View style={styles.extrasMenuRow}>
                  <View style={[styles.extrasMenuIconWrap, { backgroundColor: colors.accentSoft }]}>
                    <Ionicons name="sparkles" size={22} color={colors.accent} />
                  </View>
                  <View style={styles.toggleRowText}>
                    <Text style={styles.toggleLabel}>AI stylist</Text>
                    <Text style={styles.toggleCaption} numberOfLines={3}>
                      {aiStylistEnabled
                        ? 'Stylist replaces occasion / season / vibe filters on the main screen.'
                        : 'Classic filters and scored outfits on the main screen.'}
                    </Text>
                  </View>
                  <Switch
                    accessibilityLabel="Use AI stylist on the main outfit screen"
                    value={aiStylistEnabled}
                    onValueChange={(on) => {
                      setAiStylistEnabled(on);
                    }}
                    trackColor={{ false: colors.hairline, true: colors.accentSoft }}
                    thumbColor={Platform.OS === 'android' ? (aiStylistEnabled ? colors.accent : colors.surfaceSolid) : undefined}
                  />
                </View>
              </GlassCard>
            </ScrollView>
          </View>
        </View>
      </Modal>

    </View>

  );

}



const chipStyles = StyleSheet.create({

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

});



function makeStyles({

  colors,

  surface,

}: {

  colors: ThemeColors;

  surface: ThemeSurface;

}) {

  return StyleSheet.create({

    container: {

      paddingHorizontal: spacing.xl,

      paddingBottom: TAB_SCREEN_SCROLL_BOTTOM,

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

    blurbAiMode: {

      marginBottom: spacing.md,

    },

    sectionLabelAiMode: {

      marginTop: spacing.xs,

    },

    titleRow: {

      flexDirection: 'row',

      alignItems: 'center',

      gap: spacing.sm,

      marginBottom: 6,

    },

    titleRowHeading: {

      flex: 1,

      marginBottom: 0,

    },

    extrasMenuButton: {

      position: 'relative',

      padding: spacing.xs,

    },

    extrasMenuBadgeDot: {

      position: 'absolute',

      top: 4,

      right: 2,

      width: 8,

      height: 8,

      borderRadius: 4,

      backgroundColor: colors.accent,

    },

    extrasModalWrap: {

      ...StyleSheet.absoluteFillObject,

      justifyContent: 'flex-end',

    },

    extrasSheetBackdrop: {

      ...StyleSheet.absoluteFillObject,

      backgroundColor: 'rgba(0,0,0,0.38)',

    },

    extrasSheet: {

      width: '100%',

      overflow: 'hidden',

      borderTopLeftRadius: radii.xl,

      borderTopRightRadius: radii.xl,

      paddingHorizontal: spacing.lg,

      paddingTop: 0,

      maxHeight: Dimensions.get('screen').height * 0.92,

      borderTopWidth: StyleSheet.hairlineWidth,

      borderLeftWidth: StyleSheet.hairlineWidth,

      borderRightWidth: StyleSheet.hairlineWidth,

      borderColor: surface.tabBarTopLine,

    },

    extrasSheetFrost: {

      borderTopLeftRadius: radii.xl,

      borderTopRightRadius: radii.xl,

    },

    extrasSheetHandlePad: {

      paddingTop: spacing.sm,

      paddingBottom: spacing.xs,

      alignItems: 'center',

    },

    extrasSheetHandle: {

      width: 40,

      height: 5,

      borderRadius: radii.pill,

      opacity: 0.35,

    },

    extrasSheetHeader: {

      flexDirection: 'row',

      alignItems: 'center',

      marginBottom: spacing.xs,

    },

    extrasSheetHeaderSide: {

      width: 40,

      height: 40,

    },

    extrasSheetTitle: {

      ...typography.headline,

      flex: 1,

      textAlign: 'center',

      color: colors.text,

    },

    extrasSheetClose: {

      width: 40,

      height: 40,

      borderRadius: 20,

      alignItems: 'center',

      justifyContent: 'center',

    },

    extrasSheetHint: {

      ...typography.caption,

      color: colors.textMuted,

      textAlign: 'center',

      marginBottom: spacing.lg,

      paddingHorizontal: spacing.md,

      lineHeight: 18,

    },

    extrasSheetScroll: {

      flexGrow: 0,

      maxHeight: Dimensions.get('window').height * 0.45,

    },

    extrasSheetInner: {

      paddingBottom: spacing.sm,

    },

    extrasMenuGroup: {

      overflow: 'hidden',

    },

    extrasMenuRow: {

      flexDirection: 'row',

      alignItems: 'center',

      gap: spacing.md,

      paddingVertical: spacing.lg,

      paddingHorizontal: spacing.lg,

    },

    extrasMenuDivider: {

      height: StyleSheet.hairlineWidth,

      marginLeft: spacing.lg + 44 + spacing.md,

    },

    extrasMenuIconWrap: {

      width: 44,

      height: 44,

      borderRadius: radii.md,

      alignItems: 'center',

      justifyContent: 'center',

    },

    toggleRowText: {

      flex: 1,

      minWidth: 0,

    },

    toggleLabel: {

      ...typography.bodyMedium,

      fontSize: 16,

      color: colors.text,

    },

    toggleCaption: {

      ...typography.caption,

      color: colors.textSecondary,

      marginTop: 4,

      lineHeight: 18,

    },

    stylistMainCard: {

      marginTop: spacing.lg,

      marginBottom: spacing.lg,

    },

    assistantPanelsWrap: {

      marginBottom: spacing.lg,

    },

    assistantCardTightGap: {

      marginBottom: spacing.sm,

    },

    assistantStylistPairLast: {

      marginBottom: 0,

    },

    assistantWidgetInset: {

      paddingVertical: spacing.sm,

      paddingHorizontal: spacing.md,

    },

    assistantWidgetRowStretch: {

      alignSelf: 'stretch',

    },

    assistantHeaderActions: {

      flexDirection: 'row',

      alignItems: 'center',

      gap: spacing.sm,

    },

    assistantWidgetRowInner: {

      flexDirection: 'row',

      alignItems: 'center',

      gap: spacing.sm,

    },

    assistantWidgetTap: {

      flexDirection: 'row',

      alignItems: 'center',

      gap: spacing.sm,

      minWidth: 0,

      flex: 1,

    },

    assistantWidgetTextCol: {

      flex: 1,

      minWidth: 0,

    },

    widgetHeadline: {

      ...typography.bodyMedium,

      color: colors.text,

    },

    widgetCaption: {

      ...typography.caption,

      color: colors.textSecondary,

      marginTop: 2,

    },

    stylistHeaderAside: {

      alignItems: 'flex-end',

      gap: spacing.xs,

    },

    weatherCard: {

      marginBottom: spacing.lg,

    },

    weatherHeader: {

      flexDirection: 'row',

      alignItems: 'center',

      gap: spacing.md,

    },

    weatherTitle: {

      ...typography.bodyMedium,

      color: colors.text,

    },

    weatherSub: {

      ...typography.caption,

      color: colors.textSecondary,

      marginTop: 3,

    },

    stylistCard: {

      marginBottom: spacing.lg,

    },

    stylistHeader: {

      flexDirection: 'row',

      alignItems: 'flex-start',

      gap: spacing.md,

      marginBottom: spacing.sm,

    },

    stylistTitle: {

      ...typography.headline,

      color: colors.text,

    },

    stylistSub: {

      ...typography.caption,

      color: colors.textSecondary,

      marginTop: 4,

    },

    sourceBadge: {

      paddingHorizontal: 10,

      paddingVertical: 5,

      borderRadius: radii.pill,

      backgroundColor: colors.accentSoft,

    },

    sourceText: {

      color: colors.accent,

      fontSize: 12,

      fontWeight: '700',

    },

    quickPrompts: {

      flexDirection: 'row',

      flexWrap: 'wrap',

      gap: 8,

      marginTop: spacing.sm,

    },

    groundingLabel: {

      ...typography.micro,

      color: colors.textSecondary,

      marginTop: spacing.sm,

    },

    promptShellAi: {

      minHeight: 72,

      justifyContent: 'flex-start',

      marginBottom: spacing.xs,

    },

    promptInputAi: {

      color: colors.text,

      minHeight: 72,

      paddingHorizontal: spacing.md,

      paddingVertical: spacing.sm,

      textAlignVertical: 'top',

    },

    stylistButton: {

      marginTop: spacing.md,

    },

    stylistResponse: {

      marginTop: spacing.lg,

      gap: spacing.md,

    },

    stylistMessage: {

      ...typography.body,

      color: colors.text,

    },

    stylistSuggestion: {

      paddingTop: spacing.md,

      borderTopWidth: StyleSheet.hairlineWidth,

      borderTopColor: surface.cardBorder,

    },

    rationale: {

      ...typography.callout,

      color: colors.textSecondary,

      marginBottom: spacing.md,

    },

    feedbackRow: {

      flexDirection: 'row',

      alignItems: 'center',

      flexWrap: 'wrap',

      gap: spacing.sm,

      marginTop: spacing.md,

    },

    feedbackText: {

      ...typography.caption,

      color: colors.textSecondary,

    },

    sectionLabel: {

      ...typography.micro,

      color: colors.textSecondary,

      marginBottom: spacing.sm,

      marginTop: spacing.md,

    },

    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

    plannedHint: {

      ...typography.caption,

      color: colors.textSecondary,

      marginBottom: spacing.sm,

    },

    plannedShell: { marginBottom: spacing.sm },

    plannedInput: {

      ...typography.body,

      paddingVertical: spacing.sm,

      paddingHorizontal: spacing.sm,

      minHeight: 44,

    },

    plannedBtns: {

      flexDirection: 'row',

      gap: spacing.md,

      marginBottom: spacing.sm,

      flexWrap: 'wrap',

    },

    plannedBtnHalf: {

      flex: 1,

      minWidth: 120,

      marginBottom: spacing.xs,

    },

    plannedStatus: {

      ...typography.caption,

      color: colors.accent,

      marginBottom: spacing.md,

    },

    outfitSkeletonStack: {

      marginTop: spacing.xl,

      gap: spacing.lg,

    },

    outfitSkeletonCard: {

      borderRadius: radii.md,

      borderWidth: StyleSheet.hairlineWidth,

      padding: spacing.md,

      backgroundColor: surface.cardOverlay,

    },

    outfitSkeletonHeading: {

      height: 18,

      width: '40%',

      borderRadius: radii.sm,

      marginBottom: spacing.md,

    },

    outfitSkeletonRow: {

      flexDirection: 'row',

      gap: spacing.sm,

    },

    outfitSkeletonThumb: {

      width: 64,

      height: 76,

      borderRadius: radii.sm,

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

      backgroundColor: surface.thumbBg,

    },

    miniLabel: {

      fontSize: 12,

      color: colors.textSecondary,

      marginTop: 6,

      textAlign: 'center',

    },

  });

}

