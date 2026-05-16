import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  Vibration,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as ImagePicker from 'expo-image-picker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AppStackParamList } from '../navigation/RootNavigator';
import * as api from '../api/client';
import type {
  ClothingItem,
  ClosetLocation,
  FitPost,
  ItemDetailsPatch,
  OutfitRecommendation,
  WearHistoryEntry,
} from '../api/types';
import { itemImageUrl } from '../config';
import {
  GlassButton,
  GlassCard,
  GlassInputContainer,
  ScreenBackground,
} from '../components/Glass';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import {
  CLOTHING_CATEGORIES,
  CLOTHING_COLORS,
  CLOTHING_SEASONS,
  CLOTHING_STYLES,
  CLOTHING_SUBCATEGORIES,
} from '../constants/classification';
import { MAX_USER_TAG_LENGTH, MAX_USER_TAGS } from '../constants/tags';
import { imagePickerAssetToUpload } from '../utils/imageUpload';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { stackScrollContentPaddingTop, STACK_SCREEN_SCROLL_BOTTOM } from '../utils/screenSpacing';
import {
  radii,
  shadow,
  spacing,
  typography,
  type ThemeColors,
  type ThemeSurface,
} from '../theme';

type Props = NativeStackScreenProps<AppStackParamList, 'ItemDetail'>;

type EditableField =
  | 'brand'
  | 'size'
  | 'purchase_price'
  | 'purchase_date'
  | 'purchase_location'
  | 'storage_location'
  | 'care_summary'
  | 'notes';

type FieldConfig = {
  key: EditableField;
  label: string;
  placeholder: string;
  keyboard?: 'default' | 'decimal-pad';
  multiline?: boolean;
};

const FIELDS: FieldConfig[] = [
  { key: 'brand', label: 'Brand', placeholder: 'Add brand' },
  { key: 'size', label: 'Size', placeholder: 'Add size' },
  {
    key: 'purchase_price',
    label: 'Price',
    placeholder: 'Add price',
    keyboard: 'decimal-pad',
  },
  {
    key: 'purchase_date',
    label: 'Purchased',
    placeholder: 'YYYY-MM-DD',
  },
  {
    key: 'purchase_location',
    label: 'Where',
    placeholder: 'Add store',
  },
  {
    key: 'storage_location',
    label: 'Location',
    placeholder: 'e.g. front rack, left',
  },
  {
    key: 'care_summary',
    label: 'Care',
    placeholder: 'Scan a care tag or add washing notes',
    multiline: true,
  },
  {
    key: 'notes',
    label: 'Notes',
    placeholder: 'Add a note',
    multiline: true,
  },
];

function useGalleryUris(item: ClothingItem): string[] {
  return useMemo(() => {
    const list = item.image_paths && item.image_paths.length > 0
      ? item.image_paths
      : [item.image_path];
    return list
      .map((p) => itemImageUrl(p))
      .filter((u): u is string => !!u);
  }, [item.image_path, item.image_paths]);
}

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

function formatFieldValue(
  field: EditableField,
  value: string | number | null | undefined
): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (field === 'purchase_price') {
    const n = typeof value === 'number' ? value : parseFloat(String(value));
    if (Number.isNaN(n)) return String(value);
    return `$${n.toFixed(2)}`;
  }
  return String(value);
}

export function ItemDetailScreen({ route, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const scrollTop = stackScrollContentPaddingTop(insets);
  const { colors, surface } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { item: initial } = route.params;
  const [item, setItem] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [closetLocations, setClosetLocations] = useState<ClosetLocation[]>([]);
  const [editing, setEditing] = useState<FieldConfig | null>(null);
  const [tagsModalOpen, setTagsModalOpen] = useState(false);
  const [wearHistory, setWearHistory] = useState<WearHistoryEntry[]>([]);
  const [wornPosts, setWornPosts] = useState<FitPost[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [full, locs, history, posts] = await Promise.all([
        api.fetchItem(initial.id),
        api.fetchClosetLocations(),
        api.fetchItemWearHistory(initial.id),
        api.fetchItemWornOutfits(initial.id),
      ]);
      setItem(full);
      setClosetLocations(locs.locations);
      setWearHistory(history.history);
      setWornPosts(posts.posts);
    } catch {
      /* keep existing */
    } finally {
      setLoading(false);
    }
  }, [initial.id]);

  async function saveClosetLocation(locationId: number | null) {
    setLoading(true);
    try {
      await api.updateItemDetails(item.id, { closet_location_id: locationId });
      const full = await api.fetchItem(item.id);
      setItem(full);
    } catch (e) {
      Alert.alert('Could not update closet', e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [refresh]);

  const galleryUris = useGalleryUris(item);
  const { width: winWidth } = useWindowDimensions();
  const pageWidth = winWidth - spacing.xl * 2;
  const [pageIndex, setPageIndex] = useState(0);
  const [lendModalOpen, setLendModalOpen] = useState(false);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [promoteCount, setPromoteCount] = useState('1');
  const [outfitsModalOpen, setOutfitsModalOpen] = useState(false);
  const [itemOutfits, setItemOutfits] = useState<OutfitRecommendation[]>([]);
  const [itemOutfitsLoading, setItemOutfitsLoading] = useState(false);
  const onPageChange = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const idx = Math.round(e.nativeEvent.contentOffset.x / pageWidth);
      setPageIndex(idx);
    },
    [pageWidth]
  );
  const carouselRef = useRef<FlatList<string>>(null);
  useEffect(() => {
    // Reset to first page if the item or photo list changes (e.g. after refresh).
    setPageIndex(0);
    carouselRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [item.id, galleryUris.length]);

  const cpw = item.cost_per_wear;
  const worn = item.times_worn ?? 0;
  const hasCpw = worn > 0 && typeof cpw === 'number';
  const cpwDisplay = hasCpw ? `$${(cpw as number).toFixed(2)}` : '';

  async function onToggleFavorite() {
    Vibration.vibrate(10);
    try {
      await api.toggleFavorite(item.id);
      await refresh();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed');
    }
  }

  async function onTogglePackedForTrip() {
    try {
      await api.updateItemDetails(item.id, {
        packed_for_trip: !item.packed_for_trip,
      });
      await refresh();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed');
    }
  }

  async function openSuggestedOutfits() {
    setOutfitsModalOpen(true);
    setItemOutfitsLoading(true);
    try {
      const data = await api.fetchItemOutfits(item.id, { seed: Date.now() });
      setItemOutfits(data.outfits);
    } catch {
      setItemOutfits([]);
    } finally {
      setItemOutfitsLoading(false);
    }
  }

  async function onDelete() {
    Vibration.vibrate(10);
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
    Vibration.vibrate(10);
    try {
      await api.updateItemStatus(item.id, { washed: clean });
      await refresh();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed');
    }
  }

  async function setLaundryState(laundryState: string) {
    try {
      if (laundryState === 'clean' || laundryState === 'in_hamper') {
        await api.updateItemStatus(item.id, { washed: laundryState === 'clean' });
      }
      await api.updateItemDetails(item.id, { laundry_state: laundryState });
      await refresh();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed');
    }
  }

  async function onBulkWoreOne() {
    try {
      await api.updateItemStatus(item.id, { worn: true });
      await refresh();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed');
    }
  }

  async function submitPromoteBulk() {
    if (!item.is_bulk) return;
    const maxPull = Math.min(item.quantity ?? 1, item.clean_count ?? 0);
    const n = parseInt(promoteCount, 10);
    if (!Number.isFinite(n) || n < 1) {
      Alert.alert('Invalid', 'Enter a positive number.');
      return;
    }
    if (n > maxPull) {
      Alert.alert(
        'Too many',
        `You can promote at most ${maxPull} clean units right now.`,
      );
      return;
    }
    try {
      const res = await api.promoteBulkItem(item.id, n);
      setPromoteOpen(false);
      if (res.bulk_removed) {
        navigation.goBack();
        return;
      }
      await refresh();
      Alert.alert(
        'Promoted',
        `Created ${res.created_ids.length} individual item(s).`,
      );
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed');
    }
  }

  async function onLendSave(lent_to: string, lent_until: string | null) {
    try {
      await api.lendItem(item.id, { lent_to, lent_until });
      setLendModalOpen(false);
      await refresh();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed');
    }
  }

  async function onReturn() {
    try {
      await api.returnItem(item.id);
      await refresh();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed');
    }
  }

  async function saveTags(patch: ItemDetailsPatch) {
    try {
      await api.updateItemDetails(item.id, patch);
      await api.saveClassificationCorrection(item.id, patch as Record<string, unknown>);
      setTagsModalOpen(false);
      await refresh();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed');
    }
  }

  async function saveField(field: FieldConfig, raw: string) {
    const trimmed = raw.trim();
    const patch: ItemDetailsPatch = {};
    if (field.key === 'purchase_price') {
      if (trimmed === '') {
        patch.purchase_price = null;
      } else {
        const n = parseFloat(trimmed);
        if (Number.isNaN(n)) {
          Alert.alert('Invalid price', 'Enter a number, e.g. 49.99');
          return;
        }
        patch.purchase_price = n;
      }
    } else {
      patch[field.key] = trimmed === '' ? null : trimmed;
    }

    try {
      await api.updateItemDetails(item.id, patch);
      setEditing(null);
      await refresh();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed');
    }
  }

  async function scanCareLabel() {
    const cam = await ImagePicker.requestCameraPermissionsAsync();
    if (!cam.granted) {
      Alert.alert('Camera needed', 'Camera permission is required to scan a care tag.');
      return;
    }
    const picked = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.9,
    });
    if (picked.canceled || !picked.assets?.[0]) return;
    setLoading(true);
    try {
      const photo = await imagePickerAssetToUpload(picked.assets[0], 'carelabel');
      const scanned = await api.scanCareLabel(item.id, photo);
      setItem((prev) => ({
        ...prev,
        care_label_text: scanned.care_label_text,
        care_summary: scanned.care_summary,
      }));
      Alert.alert('Care label saved', scanned.care_summary || 'Care text was saved.');
    } catch (e) {
      Alert.alert('Could not scan label', e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <ScreenBackground />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: STACK_SCREEN_SCROLL_BOTTOM }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.imageWrap, { paddingTop: scrollTop }]}>
          {galleryUris.length > 0 ? (
            <FlatList
              ref={carouselRef}
              data={galleryUris}
              keyExtractor={(uri, idx) => `${idx}-${uri}`}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={onPageChange}
              renderItem={({ item: u }) => (
                <Image
                  source={{ uri: u }}
                  style={[styles.image, { width: pageWidth }]}
                  resizeMode="contain"
                />
              )}
              scrollEnabled={galleryUris.length > 1}
            />
          ) : (
            <View
              style={[styles.image, styles.imagePlaceholder, { width: pageWidth }]}
            />
          )}
          <Pressable
            onPress={onToggleFavorite}
            style={[styles.favBtn, { top: scrollTop + 12 }]}
          >
            <View
              style={[
                StyleSheet.absoluteFillObject,
                {
                  backgroundColor: surface.favBadgeBg,
                  borderRadius: radii.pill,
                },
              ]}
            />
            <Ionicons
              name={item.is_favorite ? 'heart' : 'heart-outline'}
              size={20}
              color={item.is_favorite ? colors.danger : colors.text}
            />
          </Pressable>
          {galleryUris.length > 1 ? (
            <View style={styles.pageDots} pointerEvents="none">
              {galleryUris.map((_, idx) => (
                <View
                  key={idx}
                  style={[
                    styles.pageDot,
                    idx === pageIndex && styles.pageDotActive,
                  ]}
                />
              ))}
            </View>
          ) : null}
        </View>

        {loading ? (
          <ActivityIndicator style={styles.loader} color={colors.accent} />
        ) : null}

        <View style={styles.body}>
          <Pressable
            onPress={() => setTagsModalOpen(true)}
            style={({ pressed }) => [
              styles.tagsSection,
              pressed && { opacity: 0.85 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Edit tags"
          >
            <View style={styles.tagsHeader}>
              <Text style={styles.title}>{item.category}</Text>
              <View style={styles.editTagsBtn}>
                <Text style={styles.editTagsText}>Edit tags</Text>
                <Ionicons
                  name="chevron-forward"
                  size={14}
                  color={colors.textMuted}
                />
              </View>
            </View>
            <Text style={styles.sub}>{item.subcategory}</Text>

            {item.is_bulk ? (
              <View style={styles.bulkBanner}>
                <Ionicons name="layers-outline" size={16} color={colors.accent} />
                <Text style={styles.bulkBannerText}>
                  Bulk item — wears use clean count instead of the wear-again meter.
                </Text>
              </View>
            ) : null}

            {item.packed_for_trip ? (
              <View style={styles.tripBanner}>
                <Ionicons
                  name="airplane-outline"
                  size={16}
                  color={colors.accent}
                  style={{ marginRight: 8 }}
                />
                <Text style={styles.tripBannerText}>
                  Marked packed for a trip — not used in outfit suggestions until
                  you turn this off.
                </Text>
              </View>
            ) : null}

            <View style={styles.tagRow}>
              {item.subcategory?.trim() ? (
                <View style={[styles.tag, styles.slotTag]} accessibilityLabel="Group">
                  <Text style={styles.tagText}>{item.subcategory.trim()}</Text>
                </View>
              ) : null}
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
              {(item.color_hexes || []).map((hex) => (
                <View
                  key={hex}
                  style={[styles.hexDot, { backgroundColor: hex }]}
                />
              ))}
              {item.pattern ? (
                <View style={styles.tag}>
                  <Text style={styles.tagText}>{item.pattern}</Text>
                </View>
              ) : null}
              {(item.user_tags || []).map((t) => (
                <View key={t} style={[styles.tag, styles.userTag]}>
                  <Text style={styles.tagText}>{t}</Text>
                </View>
              ))}
              {!item.subcategory?.trim() &&
              !item.style &&
              !item.season &&
              (item.colors || []).length === 0 &&
              (item.user_tags || []).length === 0 &&
              !item.pattern ? (
                <Text style={styles.tagsEmptyHint}>
                  Tap to edit tags or add your own
                </Text>
              ) : null}
            </View>
          </Pressable>

          {item.lent_to ? (
            <GlassCard
              padded
              style={[
                styles.lendBanner,
                isLentOverdue(item) && styles.lendBannerOverdue,
              ]}
            >
              <View style={styles.lendBannerRow}>
                <Ionicons
                  name="paper-plane-outline"
                  size={18}
                  color={
                    isLentOverdue(item) ? colors.danger : colors.warning
                  }
                  style={{ marginRight: 8 }}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.lendBannerTitle}>
                    Lent to {item.lent_to}
                  </Text>
                  <Text style={styles.lendBannerSub}>
                    {formatLentSubtitle(item)}
                  </Text>
                </View>
              </View>
            </GlassCard>
          ) : null}

          <GlassCard padded style={styles.statsCard}>
            <View style={styles.statRow}>
              <View style={styles.statCol}>
                <Text style={styles.statValue}>{item.times_worn ?? 0}</Text>
                <Text style={styles.statLabel}>times worn</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statCol}>
                {item.is_bulk ? (
                  <>
                    <Text
                      style={[
                        styles.statValue,
                        {
                          color:
                            (item.clean_count ?? 0) > 0 ? colors.success : colors.warning,
                        },
                      ]}
                    >
                      {item.clean_count ?? 0}/{item.quantity ?? 1}
                    </Text>
                    <Text style={styles.statLabel}>clean / total</Text>
                  </>
                ) : (
                  <>
                    <Text
                      style={[
                        styles.statValue,
                        { color: item.washed ? colors.success : colors.warning },
                      ]}
                    >
                      {item.washed ? 'Clean' : 'Wash'}
                    </Text>
                    <Text style={styles.statLabel}>status</Text>
                  </>
                )}
              </View>
              {hasCpw ? (
                <>
                  <View style={styles.statDivider} />
                  <View style={styles.statCol}>
                    <Text style={styles.statValue}>{cpwDisplay}</Text>
                    <Text style={styles.statLabel}>$ / wear</Text>
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.statDivider} />
                  <View style={styles.statCol}>
                    <Text style={styles.statValue}>
                      {item.is_favorite ? '★' : '—'}
                    </Text>
                    <Text style={styles.statLabel}>favorite</Text>
                  </View>
                </>
              )}
            </View>
          </GlassCard>

          <GlassCard padded style={styles.detailsCard}>
            <Text style={styles.detailsHeader}>Lifecycle</Text>
            <Text style={styles.detailValue}>
              Laundry state: {item.laundry_state || (item.washed ? 'clean' : 'worn')}
            </Text>
            <View style={styles.quickStateRow}>
              {['clean', 'worn', 'in_hamper', 'washing', 'drying'].map((state) => (
                <Pressable
                  key={state}
                  onPress={() => setLaundryState(state)}
                  style={[
                    styles.stateChip,
                    (item.laundry_state || (item.washed ? 'clean' : 'worn')) === state &&
                      styles.stateChipActive,
                  ]}
                >
                  <Text style={styles.stateChipText}>{state.replace('_', ' ')}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.detailLabel}>Wear history</Text>
            <View style={styles.heatmapRow}>
              {wearHistory.slice(0, 28).map((entry) => (
                <View key={entry.id} style={styles.heatmapDot} />
              ))}
              {wearHistory.length === 0 ? (
                <Text style={styles.detailValueEmpty}>No wears logged yet.</Text>
              ) : null}
            </View>
            <Text style={styles.detailLabel}>
              Worn outfits containing this item: {wornPosts.length}
            </Text>
          </GlassCard>

          <GlassCard padded style={styles.detailsCard}>
            <View style={styles.detailsHeaderRow}>
              <Text style={styles.detailsHeader}>Details</Text>
              <Pressable
                onPress={scanCareLabel}
                disabled={loading}
                style={({ pressed }) => [
                  styles.scanCareBtn,
                  { opacity: pressed || loading ? 0.65 : 1 },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Scan care label"
              >
                <Ionicons name="scan-outline" size={15} color={colors.accent} />
                <Text style={styles.scanCareText}>Scan care</Text>
              </Pressable>
            </View>
            {closetLocations.length > 0 ? (
              <View style={styles.closetPicker}>
                <Text style={styles.detailLabel}>Closet</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.closetPickerRow}
                >
                  {closetLocations.map((loc) => {
                    const active = item.closet_location_id === loc.id;
                    return (
                      <Pressable
                        key={loc.id}
                        onPress={() => saveClosetLocation(loc.id)}
                        style={[
                          styles.closetChip,
                          active && styles.closetChipActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.closetChipText,
                            active && styles.closetChipTextActive,
                          ]}
                        >
                          {loc.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            ) : null}
            {FIELDS.map((field, idx) => {
              const raw = (item as Record<string, unknown>)[
                field.key
              ] as string | number | null | undefined;
              const formatted = formatFieldValue(field.key, raw);
              const isLast = idx === FIELDS.length - 1;
              return (
                <Pressable
                  key={field.key}
                  onPress={() => setEditing(field)}
                  style={({ pressed }) => [
                    styles.detailRow,
                    !isLast && styles.detailRowDivider,
                    { opacity: pressed ? 0.6 : 1 },
                  ]}
                >
                  <Text style={styles.detailLabel}>{field.label}</Text>
                  <View style={styles.detailValueWrap}>
                    <Text
                      style={[
                        styles.detailValue,
                        !formatted && styles.detailValueEmpty,
                      ]}
                      numberOfLines={field.multiline ? 2 : 1}
                    >
                      {formatted ?? field.placeholder}
                    </Text>
                    <Ionicons
                      name="chevron-forward"
                      size={16}
                      color={colors.textMuted}
                      style={{ marginLeft: 6 }}
                    />
                  </View>
                </Pressable>
              );
            })}
          </GlassCard>

          <View style={styles.actions}>
            {item.is_bulk ? (
              <GlassButton
                title="Wore one unit"
                onPress={onBulkWoreOne}
                variant="ghost"
              />
            ) : null}
            {item.is_bulk ? (
              <>
                <GlassButton
                  title="All in hamper (0 clean)"
                  onPress={() => setWashed(false)}
                  variant="ghost"
                />
                <GlassButton
                  title="Fresh from laundry (all clean)"
                  onPress={() => setWashed(true)}
                  variant="ghost"
                />
              </>
            ) : (
              <GlassButton
                title={item.washed ? 'Mark needs wash' : 'Mark clean'}
                onPress={() => setWashed(!item.washed)}
                variant="ghost"
              />
            )}
            {item.is_bulk && (item.clean_count ?? 0) > 0 ? (
              <GlassButton
                title="Promote to individual items…"
                onPress={() => {
                  setPromoteCount('1');
                  setPromoteOpen(true);
                }}
                variant="ghost"
              />
            ) : null}
            <GlassButton
              title={item.is_favorite ? 'Remove favorite' : 'Mark favorite'}
              onPress={onToggleFavorite}
              variant="ghost"
            />
            {item.is_bulk ? null : (
              <GlassButton
                title={item.lent_to ? 'Mark returned' : 'Lend out'}
                onPress={
                  item.lent_to ? onReturn : () => setLendModalOpen(true)
                }
                variant="ghost"
              />
            )}
            <GlassButton
              title={
                item.packed_for_trip
                  ? 'Mark back home (unpack)'
                  : 'Packed for trip / away'
              }
              onPress={onTogglePackedForTrip}
              variant="ghost"
            />
            <GlassButton
              title="Suggested outfits with this item"
              onPress={openSuggestedOutfits}
              variant="ghost"
            />
            <GlassButton title="Delete item" onPress={onDelete} variant="danger" />
          </View>
        </View>
      </ScrollView>

      <EditFieldModal
        field={editing}
        item={item}
        onCancel={() => setEditing(null)}
        onSave={saveField}
      />

      <EditTagsModal
        visible={tagsModalOpen}
        item={item}
        onCancel={() => setTagsModalOpen(false)}
        onSave={saveTags}
      />

      <LendModal
        visible={lendModalOpen}
        onCancel={() => setLendModalOpen(false)}
        onSave={onLendSave}
      />

      <Modal
        visible={promoteOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setPromoteOpen(false)}
      >
        <View style={styles.modalWrap}>
          <Pressable
            style={styles.sheetBackdrop}
            onPress={() => setPromoteOpen(false)}
          />
          <View
            style={[
              styles.outfitsModalSheet,
              { backgroundColor: colors.surfaceSolid },
            ]}
          >
            <Text style={styles.modalSheetTitle}>Promote to individuals</Text>
            <Text style={styles.modalSheetMuted}>
              Pulls from your clean count (max{' '}
              {Math.min(item.quantity ?? 1, item.clean_count ?? 0)}). Each new
              row is a normal item you can track separately.
            </Text>
            <GlassInputContainer style={styles.modalInputShell}>
              <TextInput
                value={promoteCount}
                onChangeText={setPromoteCount}
                keyboardType="number-pad"
                placeholder="How many?"
                placeholderTextColor={colors.placeholder}
                style={styles.modalInput}
              />
            </GlassInputContainer>
            <View style={styles.modalActions}>
              <GlassButton
                title="Cancel"
                variant="ghost"
                onPress={() => setPromoteOpen(false)}
                style={{ flex: 1 }}
              />
              <GlassButton
                title="Promote"
                onPress={submitPromoteBulk}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={outfitsModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setOutfitsModalOpen(false)}
      >
        <View style={styles.modalWrap}>
          <Pressable
            style={styles.sheetBackdrop}
            onPress={() => setOutfitsModalOpen(false)}
          />
          <View
            style={[
              styles.outfitsModalSheet,
              { backgroundColor: colors.surfaceSolid },
            ]}
          >
          <Text style={styles.modalSheetTitle}>Outfits including this piece</Text>
          {itemOutfitsLoading ? (
            <ActivityIndicator color={colors.accent} style={{ marginVertical: 20 }} />
          ) : itemOutfits.length === 0 ? (
            <Text style={styles.modalSheetMuted}>
              No combinations found — try marking the item clean or adding pairs.
            </Text>
          ) : (
            <ScrollView
              style={{ maxHeight: 400 }}
              showsVerticalScrollIndicator={false}
            >
              {itemOutfits.map((o, idx) => (
                <View key={idx} style={styles.outfitPreviewBlock}>
                  <Text style={styles.outfitPreviewTitle}>
                    Option {idx + 1} · score {Math.round(o.score)}
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {o.items.map((it) => {
                        const uri = itemImageUrl(it.image_path);
                        return (
                          <View key={it.id} style={{ width: 64 }}>
                            {uri ? (
                              <Image
                                source={{ uri }}
                                style={styles.outfitThumb}
                                resizeMode="cover"
                              />
                            ) : (
                              <View
                                style={[
                                  styles.outfitThumb,
                                  { backgroundColor: surface.thumbBg },
                                ]}
                              />
                            )}
                            <Text style={styles.outfitThumbLabel} numberOfLines={1}>
                              {it.subcategory}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  </ScrollView>
                </View>
              ))}
            </ScrollView>
          )}
          <GlassButton
            title="Close"
            onPress={() => setOutfitsModalOpen(false)}
            style={{ marginTop: spacing.md }}
          />
        </View>
        </View>
      </Modal>
    </View>
  );
}

function isLentOverdue(item: ClothingItem): boolean {
  if (!item.lent_until) return false;
  const today = new Date().toISOString().slice(0, 10);
  return item.lent_until < today;
}

function formatLentSubtitle(item: ClothingItem): string {
  if (item.lent_until) {
    return isLentOverdue(item)
      ? `Overdue · was due ${item.lent_until}`
      : `Returns ${item.lent_until}`;
  }
  return 'No return date';
}

type LendModalProps = {
  visible: boolean;
  onCancel: () => void;
  onSave: (lent_to: string, lent_until: string | null) => void | Promise<void>;
};

type EditTagsModalProps = {
  visible: boolean;
  item: ClothingItem;
  onCancel: () => void;
  onSave: (patch: ItemDetailsPatch) => void | Promise<void>;
};

function EditTagsModal({ visible, item, onCancel, onSave }: EditTagsModalProps) {
  const { colors, surface } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [category, setCategory] = useState(item.category);
  const [subcategory, setSubcategory] = useState(item.subcategory);
  const [style, setStyle] = useState(item.style ?? '');
  const [season, setSeason] = useState(item.season ?? '');
  const [selectedColors, setSelectedColors] = useState<Set<string>>(
    () => new Set(item.colors || [])
  );
  const [userTags, setUserTags] = useState<string[]>(item.user_tags || []);
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setCategory(item.category);
    setSubcategory(item.subcategory);
    setStyle(item.style ?? '');
    setSeason(item.season ?? '');
    setSelectedColors(new Set(item.colors || []));
    setUserTags(item.user_tags || []);
    setTagInput('');
    setSaving(false);
  }, [visible, item]);

  function addUserTag() {
    const trimmed = tagInput.trim();
    if (!trimmed) return;
    if (trimmed.length > MAX_USER_TAG_LENGTH) {
      Alert.alert(
        'Tag too long',
        `Keep tags under ${MAX_USER_TAG_LENGTH} characters.`
      );
      return;
    }
    if (userTags.length >= MAX_USER_TAGS) {
      Alert.alert('Limit reached', `You can add up to ${MAX_USER_TAGS} tags.`);
      return;
    }
    const lower = trimmed.toLowerCase();
    if (userTags.some((t) => t.toLowerCase() === lower)) {
      setTagInput('');
      return;
    }
    setUserTags((prev) => [...prev, trimmed]);
    setTagInput('');
  }

  function removeUserTag(tag: string) {
    setUserTags((prev) => prev.filter((t) => t !== tag));
  }

  function toggleColor(name: string) {
    setSelectedColors((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        if (next.size <= 1) return prev;
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }

  async function handleSave() {
    if (!category.trim() || !subcategory.trim()) {
      Alert.alert('Type required', 'Pick a type and group for this item.');
      return;
    }
    if (selectedColors.size === 0) {
      Alert.alert('Color required', 'Pick at least one color.');
      return;
    }
    const patch: ItemDetailsPatch = {
      category: category.trim(),
      subcategory: subcategory.trim(),
      colors: [...selectedColors],
      style: style.trim() === '' ? null : style,
      season: season.trim() === '' ? null : season,
      user_tags: userTags,
    };
    setSaving(true);
    try {
      await onSave(patch);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalBackdrop}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel}>
          <BlurView
            intensity={30}
            tint={surface.blurTint}
            style={StyleSheet.absoluteFill}
          />
          <View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: 'rgba(0,0,0,0.35)' },
            ]}
          />
        </Pressable>
        <GlassCard padded style={[styles.modalCard, styles.tagsModalCard]}>
          <Text style={styles.modalTitle}>Edit tags</Text>
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            style={styles.tagsModalScroll}
          >
            <Text style={styles.tagsModalLabel}>Type</Text>
            <View style={styles.tagsChipRow}>
              {CLOTHING_CATEGORIES.map((c) => (
                <TagChip
                  key={c}
                  label={c}
                  active={category === c}
                  onPress={() => setCategory(c)}
                />
              ))}
            </View>

            <Text style={styles.tagsModalLabel}>Group</Text>
            <View style={styles.tagsChipRow}>
              {CLOTHING_SUBCATEGORIES.map((s) => (
                <TagChip
                  key={s}
                  label={s}
                  active={subcategory === s}
                  onPress={() => setSubcategory(s)}
                />
              ))}
            </View>

            <Text style={styles.tagsModalLabel}>Style</Text>
            <View style={styles.tagsChipRow}>
              <TagChip
                label="None"
                active={style === ''}
                onPress={() => setStyle('')}
              />
              {CLOTHING_STYLES.map((s) => (
                <TagChip
                  key={s}
                  label={s}
                  active={style === s}
                  onPress={() => setStyle(s)}
                />
              ))}
            </View>

            <Text style={styles.tagsModalLabel}>Season</Text>
            <View style={styles.tagsChipRow}>
              <TagChip
                label="None"
                active={season === ''}
                onPress={() => setSeason('')}
              />
              {CLOTHING_SEASONS.map((s) => (
                <TagChip
                  key={s}
                  label={s}
                  active={season === s}
                  onPress={() => setSeason(s)}
                />
              ))}
            </View>

            <Text style={styles.tagsModalLabel}>Colors</Text>
            <View style={styles.tagsChipRow}>
              {CLOTHING_COLORS.map((c) => (
                <TagChip
                  key={c}
                  label={c}
                  active={selectedColors.has(c)}
                  onPress={() => toggleColor(c)}
                />
              ))}
            </View>

            <Text style={styles.tagsModalLabel}>Your tags</Text>
            <Text style={styles.tagsModalHint}>
              Add labels like work, vintage, or gift — up to {MAX_USER_TAGS}.
            </Text>
            <View style={styles.customTagInputRow}>
              <GlassInputContainer style={styles.customTagInputShell}>
                <TextInput
                  value={tagInput}
                  onChangeText={setTagInput}
                  placeholder="New tag"
                  placeholderTextColor={colors.placeholder}
                  maxLength={MAX_USER_TAG_LENGTH}
                  returnKeyType="done"
                  onSubmitEditing={addUserTag}
                  style={styles.customTagInput}
                />
              </GlassInputContainer>
              <GlassButton
                title="Add"
                onPress={addUserTag}
                disabled={!tagInput.trim()}
                style={styles.customTagAddBtn}
              />
            </View>
            {userTags.length > 0 ? (
              <View style={styles.tagsChipRow}>
                {userTags.map((t) => (
                  <RemovableTagChip
                    key={t}
                    label={t}
                    onRemove={() => removeUserTag(t)}
                  />
                ))}
              </View>
            ) : (
              <Text style={styles.tagsModalHint}>No custom tags yet.</Text>
            )}
          </ScrollView>
          <View style={styles.modalActions}>
            <GlassButton
              title="Cancel"
              variant="ghost"
              onPress={onCancel}
              style={{ flex: 1 }}
            />
            <GlassButton
              title="Save"
              onPress={handleSave}
              loading={saving}
              style={{ flex: 1 }}
            />
          </View>
        </GlassCard>
      </KeyboardAvoidingView>
    </Modal>
  );
}

type TagChipProps = {
  label: string;
  active: boolean;
  onPress: () => void;
};

type RemovableTagChipProps = {
  label: string;
  onRemove: () => void;
};

function RemovableTagChip({ label, onRemove }: RemovableTagChipProps) {
  const { colors, surface } = useTheme();
  return (
    <Pressable
      onPress={onRemove}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          paddingLeft: 12,
          paddingRight: 8,
          paddingVertical: 7,
          borderRadius: radii.pill,
          backgroundColor: surface.chipInactive,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.accent,
          transform: [{ scale: pressed ? 0.96 : 1 }],
        },
      ]}
      accessibilityLabel={`Remove tag ${label}`}
    >
      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>
        {label}
      </Text>
      <Ionicons
        name="close-circle"
        size={16}
        color={colors.textMuted}
        style={{ marginLeft: 4 }}
      />
    </Pressable>
  );
}

function TagChip({ label, active, onPress }: TagChipProps) {
  const { colors, surface } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          paddingHorizontal: 12,
          paddingVertical: 7,
          borderRadius: radii.pill,
          backgroundColor: active ? colors.accent : surface.chipInactive,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: active ? colors.accent : surface.chipInactiveBorder,
          transform: [{ scale: pressed ? 0.96 : 1 }],
        },
      ]}
    >
      <Text
        style={{
          fontSize: 13,
          fontWeight: '600',
          color: active ? '#fff' : colors.text,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function LendModal({ visible, onCancel, onSave }: LendModalProps) {
  const { colors, surface } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [name, setName] = useState('');
  const [due, setDue] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) {
      setName('');
      setDue('');
      setSaving(false);
    }
  }, [visible]);

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert('Name required', 'Who are you lending it to?');
      return;
    }
    const dueTrim = due.trim();
    if (dueTrim && !/^\d{4}-\d{2}-\d{2}$/.test(dueTrim)) {
      Alert.alert('Invalid date', 'Use YYYY-MM-DD format, e.g. 2026-06-01');
      return;
    }
    setSaving(true);
    try {
      await onSave(trimmed, dueTrim || null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalBackdrop}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel}>
          <BlurView
            intensity={30}
            tint={surface.blurTint}
            style={StyleSheet.absoluteFill}
          />
          <View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: 'rgba(0,0,0,0.35)' },
            ]}
          />
        </Pressable>
        <GlassCard padded style={styles.modalCard}>
          <Text style={styles.modalTitle}>Lend out</Text>
          <GlassInputContainer style={styles.modalInputShell}>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Who's borrowing it?"
              placeholderTextColor={colors.placeholder}
              autoFocus
              style={styles.modalInput}
            />
          </GlassInputContainer>
          <GlassInputContainer style={styles.modalInputShell}>
            <TextInput
              value={due}
              onChangeText={setDue}
              placeholder="Return by (YYYY-MM-DD) — optional"
              placeholderTextColor={colors.placeholder}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.modalInput}
            />
          </GlassInputContainer>
          <View style={styles.modalActions}>
            <GlassButton
              title="Cancel"
              variant="ghost"
              onPress={onCancel}
              style={{ flex: 1 }}
            />
            <GlassButton
              title="Lend"
              onPress={handleSave}
              loading={saving}
              style={{ flex: 1 }}
            />
          </View>
        </GlassCard>
      </KeyboardAvoidingView>
    </Modal>
  );
}

type EditModalProps = {
  field: FieldConfig | null;
  item: Record<string, unknown>;
  onCancel: () => void;
  onSave: (field: FieldConfig, value: string) => void | Promise<void>;
};

function EditFieldModal({ field, item, onCancel, onSave }: EditModalProps) {
  const { colors, surface } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const initial = useMemo(() => {
    if (!field) return '';
    const v = item[field.key];
    if (v === null || v === undefined) return '';
    return String(v);
  }, [field, item]);
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(initial);
    setSaving(false);
  }, [initial, field]);

  if (!field) return null;

  async function handleSave() {
    if (!field) return;
    setSaving(true);
    try {
      await onSave(field, value);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalBackdrop}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel}>
          <BlurView
            intensity={30}
            tint={surface.blurTint}
            style={StyleSheet.absoluteFill}
          />
          <View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: 'rgba(0,0,0,0.35)' },
            ]}
          />
        </Pressable>
        <GlassCard padded style={styles.modalCard}>
          <Text style={styles.modalTitle}>{field.label}</Text>
          <GlassInputContainer style={styles.modalInputShell}>
            <TextInput
              value={value}
              onChangeText={setValue}
              placeholder={field.placeholder}
              placeholderTextColor={colors.placeholder}
              keyboardType={field.keyboard ?? 'default'}
              autoFocus
              multiline={field.multiline}
              style={[
                styles.modalInput,
                field.multiline && styles.modalInputMultiline,
              ]}
            />
          </GlassInputContainer>
          <View style={styles.modalActions}>
            <GlassButton
              title="Cancel"
              variant="ghost"
              onPress={onCancel}
              style={{ flex: 1 }}
            />
            <GlassButton
              title="Save"
              onPress={handleSave}
              loading={saving}
              style={{ flex: 1 }}
            />
          </View>
        </GlassCard>
      </KeyboardAvoidingView>
    </Modal>
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
    content: {},
    imageWrap: {
      paddingHorizontal: spacing.xl,
    },
    image: {
      width: '100%',
      aspectRatio: 1,
      borderRadius: radii.xl,
      backgroundColor: surface.thumbBg,
      ...shadow.card,
    },
    imagePlaceholder: { justifyContent: 'center', alignItems: 'center' },
    pageDots: {
      position: 'absolute',
      bottom: 12,
      left: 0,
      right: 0,
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 6,
    },
    pageDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: 'rgba(255,255,255,0.5)',
    },
    pageDotActive: {
      backgroundColor: '#fff',
      width: 18,
    },
    favBtn: {
      position: 'absolute',
      right: spacing.xl + 12,
      width: 40,
      height: 40,
      borderRadius: radii.pill,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    loader: { marginVertical: spacing.md },
    body: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
    tagsSection: {
      marginBottom: spacing.lg,
    },
    tagsHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    editTagsBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingTop: 4,
    },
    editTagsText: {
      fontSize: 13,
      color: colors.textMuted,
      marginRight: 2,
    },
    tagsEmptyHint: {
      fontSize: 13,
      color: colors.textMuted,
      fontStyle: 'italic',
    },
    title: {
      ...typography.title,
      color: colors.text,
      flex: 1,
    },
    sub: {
      fontSize: 16,
      color: colors.textSecondary,
      marginTop: 4,
      marginBottom: spacing.md,
    },
    tripBanner: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      padding: spacing.md,
      borderRadius: radii.md,
      backgroundColor: colors.accentSoft,
      marginBottom: spacing.md,
    },
    tripBannerText: {
      flex: 1,
      fontSize: 13,
      color: colors.textSecondary,
      lineHeight: 18,
    },
    bulkBanner: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      padding: spacing.md,
      borderRadius: radii.md,
      backgroundColor: surface.chipInactive,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: surface.chipInactiveBorder,
      marginBottom: spacing.md,
    },
    bulkBannerText: {
      flex: 1,
      fontSize: 13,
      color: colors.textSecondary,
      lineHeight: 18,
    },
    tagRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    tag: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: radii.pill,
      backgroundColor: colors.accentSoft,
    },
    colorTag: {
      backgroundColor: surface.chipInactive,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.hairline,
    },
    userTag: {
      backgroundColor: colors.accentSoft,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.accent,
    },
    slotTag: {
      backgroundColor: surface.chipInactive,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: surface.chipInactiveBorder,
    },
    tagText: {
      fontSize: 13,
      color: colors.text,
      fontWeight: '600',
    },
    hexDot: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.hairline,
    },
    statsCard: {
      padding: spacing.lg,
      marginBottom: spacing.lg,
    },
    lendBanner: {
      padding: spacing.md,
      marginBottom: spacing.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.warning,
    },
    lendBannerOverdue: {
      borderColor: colors.danger,
      backgroundColor: colors.dangerSoft,
    },
    lendBannerRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    lendBannerTitle: {
      ...typography.bodyMedium,
      color: colors.text,
    },
    lendBannerSub: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 2,
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
    detailsCard: {
      padding: spacing.lg,
      marginBottom: spacing.lg,
    },
    detailsHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.sm,
      gap: spacing.sm,
    },
    detailsHeader: {
      ...typography.micro,
      color: colors.textMuted,
    },
    scanCareBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      borderRadius: radii.pill,
      backgroundColor: colors.accentSoft,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    scanCareText: {
      ...typography.caption,
      color: colors.accent,
      fontWeight: '700',
    },
    closetPicker: {
      paddingVertical: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.divider,
    },
    closetPickerRow: {
      gap: spacing.sm,
      paddingTop: spacing.sm,
    },
    closetChip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: radii.pill,
      backgroundColor: surface.chipInactive,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: surface.chipInactiveBorder,
    },
    closetChipActive: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    closetChipText: {
      ...typography.caption,
      color: colors.text,
      fontWeight: '700',
    },
    closetChipTextActive: {
      color: '#fff',
    },
    detailRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      minHeight: 40,
    },
    detailRowDivider: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.divider,
    },
    detailLabel: {
      fontSize: 14,
      color: colors.textSecondary,
      width: 96,
    },
    detailValueWrap: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
    },
    detailValue: {
      fontSize: 15,
      color: colors.text,
      fontWeight: '500',
      textAlign: 'right',
      flexShrink: 1,
    },
    detailValueEmpty: {
      color: colors.placeholder,
      fontWeight: '400',
    },
    quickStateRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginTop: spacing.md,
      marginBottom: spacing.md,
    },
    stateChip: {
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: radii.pill,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.hairline,
      backgroundColor: surface.chipInactive,
    },
    stateChipActive: {
      borderColor: colors.accent,
      backgroundColor: colors.accentSoft,
    },
    stateChipText: {
      color: colors.text,
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'capitalize',
    },
    heatmapRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 5,
      marginTop: spacing.xs,
      marginBottom: spacing.md,
    },
    heatmapDot: {
      width: 12,
      height: 12,
      borderRadius: 3,
      backgroundColor: colors.accent,
    },
    actions: {
      gap: spacing.md,
    },
    modalBackdrop: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: spacing.xl,
    },
    modalCard: {
      width: '100%',
      maxWidth: 420,
      padding: spacing.lg,
    },
    tagsModalCard: {
      maxHeight: '85%',
    },
    tagsModalScroll: {
      maxHeight: 360,
      marginBottom: spacing.md,
    },
    tagsModalLabel: {
      ...typography.micro,
      color: colors.textMuted,
      marginTop: spacing.sm,
      marginBottom: spacing.xs,
    },
    tagsModalHint: {
      fontSize: 12,
      color: colors.textMuted,
      marginBottom: spacing.sm,
    },
    customTagInputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.sm,
    },
    customTagInputShell: {
      flex: 1,
    },
    customTagInput: {
      fontSize: 16,
      color: colors.text,
      paddingVertical: 10,
      paddingHorizontal: spacing.md,
    },
    customTagAddBtn: {
      minWidth: 72,
    },
    tagsChipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: spacing.sm,
    },
    modalTitle: {
      ...typography.headline,
      color: colors.text,
      marginBottom: spacing.md,
    },
    modalInputShell: {
      minHeight: 52,
      marginBottom: spacing.md,
    },
    modalInput: {
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      color: colors.text,
    },
    modalInputMultiline: {
      minHeight: 96,
      textAlignVertical: 'top',
    },
    modalActions: {
      flexDirection: 'row',
      gap: spacing.md,
    },
    modalWrap: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    sheetBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.45)',
    },
    outfitsModalSheet: {
      borderTopLeftRadius: radii.xl,
      borderTopRightRadius: radii.xl,
      padding: spacing.xl,
      paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    },
    modalSheetTitle: {
      ...typography.headline,
      color: colors.text,
      marginBottom: spacing.sm,
    },
    modalSheetMuted: {
      color: colors.textSecondary,
      marginVertical: spacing.md,
      fontSize: 14,
    },
    outfitPreviewBlock: {
      marginBottom: spacing.lg,
    },
    outfitPreviewTitle: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
      marginBottom: spacing.sm,
    },
    outfitThumb: {
      width: 64,
      height: 64,
      borderRadius: radii.md,
    },
    outfitThumbLabel: {
      fontSize: 11,
      color: colors.textMuted,
      marginTop: 4,
    },
  });
}
