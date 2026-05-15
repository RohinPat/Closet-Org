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
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AppStackParamList } from '../navigation/RootNavigator';
import * as api from '../api/client';
import type { ClothingItem, ItemDetailsPatch } from '../api/types';
import { itemImageUrl } from '../config';
import {
  GlassButton,
  GlassCard,
  GlassInputContainer,
  ScreenBackground,
} from '../components/Glass';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
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
  const { colors, surface } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { item: initial } = route.params;
  const [item, setItem] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<FieldConfig | null>(null);

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

  const galleryUris = useGalleryUris(item);
  const { width: winWidth } = useWindowDimensions();
  const pageWidth = winWidth - spacing.xl * 2;
  const [pageIndex, setPageIndex] = useState(0);
  const [lendModalOpen, setLendModalOpen] = useState(false);
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

  return (
    <View style={{ flex: 1 }}>
      <ScreenBackground />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.imageWrap}>
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
          <Pressable onPress={onToggleFavorite} style={styles.favBtn}>
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
                <Text
                  style={[
                    styles.statValue,
                    { color: item.washed ? colors.success : colors.warning },
                  ]}
                >
                  {item.washed ? 'Clean' : 'Wash'}
                </Text>
                <Text style={styles.statLabel}>status</Text>
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
            <Text style={styles.detailsHeader}>Details</Text>
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
            <GlassButton
              title={item.lent_to ? 'Mark returned' : 'Lend out'}
              onPress={
                item.lent_to ? onReturn : () => setLendModalOpen(true)
              }
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

      <LendModal
        visible={lendModalOpen}
        onCancel={() => setLendModalOpen(false)}
        onSave={onLendSave}
      />
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

const HEADER_PAD = Platform.OS === 'ios' ? 96 : 80;

function makeStyles({
  colors,
  surface,
}: {
  colors: ThemeColors;
  surface: ThemeSurface;
}) {
  return StyleSheet.create({
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
      top: HEADER_PAD + 12,
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
      backgroundColor: surface.chipInactive,
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
    detailsHeader: {
      ...typography.micro,
      color: colors.textMuted,
      marginBottom: spacing.sm,
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
  });
}
