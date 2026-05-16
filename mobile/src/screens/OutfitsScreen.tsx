import React, { useCallback, useEffect, useState } from 'react';

import {

  ActivityIndicator,

  Image,

  Pressable,

  RefreshControl,

  ScrollView,

  StyleSheet,

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

  weatherHeadline,

} from '../weather';

import { useTheme, useThemedStyles } from '../context/ThemeContext';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { tabTopPadding } from '../utils/screenSpacing';

import {

  radii,

  spacing,

  typography,

  type ThemeColors,

  type ThemeSurface,

} from '../theme';



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



const QUICK_PROMPTS = [

  'What should I wear today?',

  'What goes with my green jacket?',

  "I'm bored of my usual.",

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



function Chip({ label, active, onPress }: ChipProps) {

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

        intensity={active ? 0 : 40}

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



export function OutfitsScreen() {

  const insets = useSafeAreaInsets();

  const headerPad = tabTopPadding(insets);

  const { colors, surface } = useTheme();

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

      setActiveClosetLocationId((prev) =>

        prev === null ? settings.default_closet_location_id ?? null : prev

      );

      const locationScoped =

        activeClosetLocationId == null

          ? closet.items

          : closet.items.filter((item) => item.closet_location_id === activeClosetLocationId);

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

        closetLocationId: activeClosetLocationId,

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

    generate();

  }, [generate]);



  useEffect(() => {

    generate();

  }, [generate]);



  useEffect(() => {

    getWeatherSyncEnabled().then(setWeatherSync);

  }, []);



  async function toggleWeatherSync() {

    const next = !weatherSync;

    setWeatherSync(next);

    await setWeatherSyncEnabled(next);

    if (!next) setWeather(null);

  }



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

      const resolvedLocationId =

        activeClosetLocationId === null

          ? settings.default_closet_location_id ?? null

          : activeClosetLocationId;

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



  return (

    <View style={{ flex: 1 }}>

      <ScreenBackground />

      <ScrollView

        contentContainerStyle={[styles.container, { paddingTop: headerPad }]}

        showsVerticalScrollIndicator={false}

        refreshControl={

          <RefreshControl

            refreshing={refreshing}

            onRefresh={onRefresh}

            tintColor={colors.accent}

            progressViewOffset={headerPad}

          />

        }

      >

        <Text style={styles.heading}>Outfits</Text>

        <Text style={styles.blurb}>

          Curated combinations from your closet.

        </Text>



        <GlassCard padded style={styles.weatherCard}>

          <View style={styles.weatherHeader}>

            <View style={{ flex: 1 }}>

              <Text style={styles.weatherTitle}>

                {weatherHeadline(weather)}

              </Text>

              <Text style={styles.weatherSub}>

                {weatherBusy ? 'Syncing forecast...' : weatherDetail(weather)}

              </Text>

            </View>

            <GlassButton

              title={weatherSync ? 'Weather on' : 'Use weather'}

              variant={weatherSync ? 'secondary' : 'primary'}

              onPress={toggleWeatherSync}

              fullWidth={false}

            />

          </View>

        </GlassCard>



        <GlassCard padded style={styles.stylistCard}>

          <View style={styles.stylistHeader}>

            <View style={{ flex: 1 }}>

              <Text style={styles.stylistTitle}>AI Stylist</Text>

              <Text style={styles.stylistSub}>

                Ask for a mood, item, or occasion. It uses your closet metadata, not photos.

              </Text>

            </View>

            <View style={styles.sourceBadge}>

              <Text style={styles.sourceText}>

                {stylistResponse?.source === 'claude' ? 'Claude' : 'Local'}

              </Text>

            </View>

          </View>

          <GlassInputContainer style={styles.promptShell}>

            <TextInput

              value={stylistPrompt}

              onChangeText={setStylistPrompt}

              placeholder="Ask what to wear..."

              placeholderTextColor={colors.textMuted}

              style={styles.promptInput}

              multiline

              returnKeyType="send"

              onSubmitEditing={() => askStylist()}

            />

          </GlassInputContainer>

          <View style={styles.quickPrompts}>

            {QUICK_PROMPTS.map((prompt) => (

              <Chip

                key={prompt}

                label={prompt}

                active={stylistPrompt === prompt}

                onPress={() => askStylist(prompt)}

              />

            ))}

          </View>

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



        <Text style={styles.sectionLabel}>Suggestion mode</Text>

        <View style={styles.chips}>

          {OUTFIT_SOURCES.map((source) => (

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



        {closetLocations.length > 0 ? (

          <>

            <Text style={styles.sectionLabel}>Closet location</Text>

            <View style={styles.chips}>

              <Chip

                label="All closets"

                active={activeClosetLocationId === null}

                onPress={() => setActiveClosetLocationId(null)}

              />

              {closetLocations.map((loc) => (

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



        <Text style={styles.sectionLabel}>Vibe</Text>

        <View style={styles.chips}>

          {VIBES.map((v) => (

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

          <ActivityIndicator

            color={colors.accent}

            style={{ marginTop: 32 }}

          />

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

      </ScrollView>

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

      marginBottom: spacing.md,

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

    promptShell: {

      minHeight: 88,

      justifyContent: 'flex-start',

    },

    promptInput: {

      color: colors.text,

      minHeight: 88,

      paddingHorizontal: spacing.md,

      paddingVertical: spacing.sm,

      textAlignVertical: 'top',

    },

    quickPrompts: {

      flexDirection: 'row',

      flexWrap: 'wrap',

      gap: 8,

      marginTop: spacing.md,

    },

    groundingLabel: {

      ...typography.micro,

      color: colors.textSecondary,

      marginTop: spacing.md,

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

