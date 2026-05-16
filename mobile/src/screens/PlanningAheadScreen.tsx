import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
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
  PlannedOutfit,
  PlannedOutfitPatch,
  PlannedOutfitStatus,
} from '../api/types';
import { GlassButton, GlassCard, ScreenBackground } from '../components/Glass';
import { itemThumbnailUrl } from '../config';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import type { AppStackParamList } from '../navigation/RootNavigator';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  stackScrollContentPaddingTop,
  STACK_SCREEN_SCROLL_BOTTOM,
} from '../utils/screenSpacing';
import {
  radii,
  shadow,
  spacing,
  typography,
  type ThemeColors,
  type ThemeSurface,
} from '../theme';

type Props = NativeStackScreenProps<AppStackParamList, 'PlanningAhead'>;

const STATUS_OPTIONS: { label: string; value: PlannedOutfitStatus }[] = [
  { label: 'Draft', value: 'draft' },
  { label: 'Confirmed', value: 'confirmed' },
  { label: 'Worn', value: 'worn' },
  { label: 'Skipped', value: 'skipped' },
];

const PREP_ITEMS: {
  key: 'prep_clean' | 'prep_packed' | 'prep_steamed' | 'prep_accessories';
  label: string;
}[] = [
  { key: 'prep_clean', label: 'Clean' },
  { key: 'prep_packed', label: 'Packed' },
  { key: 'prep_steamed', label: 'Steamed' },
  { key: 'prep_accessories', label: 'Accessories' },
];

function todayIso() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDate(raw: string) {
  const d = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function PlanningAheadScreen({}: Props) {
  const insets = useSafeAreaInsets();
  const scrollTop = stackScrollContentPaddingTop(insets);
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [plans, setPlans] = useState<PlannedOutfit[]>([]);
  const [items, setItems] = useState<ClothingItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [title, setTitle] = useState('');
  const [plannedFor, setPlannedFor] = useState(todayIso());
  const [occasion, setOccasion] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<PlannedOutfitStatus>('draft');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [planData, closetData] = await Promise.all([
        api.fetchPlannedOutfits(true),
        api.fetchCloset(),
      ]);
      setPlans(planData.plans);
      setItems(closetData.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load plans');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load])
  );

  const upcomingCount = useMemo(
    () =>
      plans.filter(
        (plan) => plan.planned_for >= todayIso() && plan.status !== 'skipped'
      ).length,
    [plans]
  );

  const selectedList = useMemo(() => [...selectedIds], [selectedIds]);

  function toggleItem(itemId: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  async function createPlan() {
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setError('Add a title for this plan.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(plannedFor.trim())) {
      setError('Use YYYY-MM-DD for the date.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await api.createPlannedOutfit({
        title: cleanTitle,
        planned_for: plannedFor.trim(),
        occasion: occasion.trim() || null,
        notes: notes.trim() || null,
        status,
        item_ids: selectedList,
      });
      setPlans((prev) => [result.plan, ...prev]);
      setTitle('');
      setOccasion('');
      setNotes('');
      setStatus('draft');
      setSelectedIds(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create plan');
    } finally {
      setSaving(false);
    }
  }

  async function patchPlan(planId: number, patch: PlannedOutfitPatch) {
    setError(null);
    try {
      const result = await api.updatePlannedOutfit(planId, patch);
      setPlans((prev) =>
        prev.map((plan) => (plan.id === planId ? result.plan : plan))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update plan');
    }
  }

  function deletePlan(planId: number) {
    Alert.alert('Delete plan?', 'This planned outfit will be removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deletePlannedOutfit(planId);
            setPlans((prev) => prev.filter((plan) => plan.id !== planId));
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not delete plan');
          }
        },
      },
    ]);
  }

  if (loading && plans.length === 0 && items.length === 0) {
    return (
      <View style={{ flex: 1 }}>
        <ScreenBackground />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <ScreenBackground />
      <ScrollView
        contentContainerStyle={[styles.container, { paddingTop: scrollTop }]}
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
      >
        <Text style={styles.heading}>Planning Ahead</Text>
        <Text style={styles.blurb}>
          Reserve outfits for future days, catch conflicts, and prep laundry before
          it becomes tomorrow morning's problem.
        </Text>

        <GlassCard padded style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.summaryTitle}>{upcomingCount} upcoming plans</Text>
              <Text style={styles.summaryText}>
                Confirmed plans reserve items from regular outfit suggestions.
              </Text>
            </View>
            <Ionicons name="calendar-outline" size={24} color={colors.accent} />
          </View>
        </GlassCard>

        <GlassCard padded style={styles.formCard}>
          <Text style={styles.sectionTitle}>New plan</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Friday wedding, Monday interview..."
            placeholderTextColor={colors.placeholder}
            style={styles.input}
          />
          <View style={styles.inlineFields}>
            <TextInput
              value={plannedFor}
              onChangeText={setPlannedFor}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.placeholder}
              autoCapitalize="none"
              style={[styles.input, styles.inlineInput]}
            />
            <TextInput
              value={occasion}
              onChangeText={setOccasion}
              placeholder="Occasion"
              placeholderTextColor={colors.placeholder}
              style={[styles.input, styles.inlineInput]}
            />
          </View>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Prep notes"
            placeholderTextColor={colors.placeholder}
            multiline
            style={[styles.input, styles.notesInput]}
          />
          <Text style={styles.fieldLabel}>Status</Text>
          <View style={styles.chipRow}>
            {STATUS_OPTIONS.slice(0, 2).map((opt) => (
              <Pressable
                key={opt.value}
                onPress={() => setStatus(opt.value)}
                style={({ pressed }) => [
                  styles.chip,
                  status === opt.value && styles.chipActive,
                  { opacity: pressed ? 0.75 : 1 },
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    status === opt.value && styles.chipTextActive,
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.fieldLabel}>Items</Text>
          <View style={styles.itemGrid}>
            {items.slice(0, 36).map((item) => {
              const selected = selectedIds.has(item.id);
              const uri = itemThumbnailUrl(item);
              return (
                <Pressable
                  key={item.id}
                  onPress={() => toggleItem(item.id)}
                  style={({ pressed }) => [
                    styles.itemPick,
                    selected && styles.itemPickSelected,
                    { opacity: pressed ? 0.75 : 1 },
                  ]}
                >
                  {uri ? (
                    <Image source={{ uri }} style={styles.itemThumb} resizeMode="contain" />
                  ) : (
                    <View style={[styles.itemThumb, styles.thumbPlaceholder]} />
                  )}
                  <Text style={styles.itemLabel} numberOfLines={1}>
                    {item.subcategory}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <GlassButton
            title={
              selectedIds.size
                ? `Save plan with ${selectedIds.size} items`
                : 'Save empty draft'
            }
            onPress={createPlan}
            loading={saving}
          />
        </GlassCard>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Text style={styles.sectionTitle}>Plans</Text>
        {plans.length === 0 ? (
          <GlassCard padded style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No outfits planned yet</Text>
            <Text style={styles.emptyText}>
              Save a draft for a future date, then confirm it once the fit feels right.
            </Text>
          </GlassCard>
        ) : (
          plans.map((plan) => (
            <GlassCard key={plan.id} padded style={styles.planCard}>
              <View style={styles.planHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.planDate}>{formatDate(plan.planned_for)}</Text>
                  <Text style={styles.planTitle}>{plan.title}</Text>
                  <Text style={styles.planMeta}>
                    {plan.occasion || 'Any occasion'} · {plan.status}
                  </Text>
                </View>
                <Pressable onPress={() => deletePlan(plan.id)} hitSlop={8}>
                  <Ionicons name="trash-outline" size={20} color={colors.textMuted} />
                </Pressable>
              </View>
              {plan.notes ? <Text style={styles.notes}>{plan.notes}</Text> : null}
              <View style={styles.planItems}>
                {plan.items.length === 0 ? (
                  <Text style={styles.emptyText}>No items picked yet.</Text>
                ) : (
                  plan.items.map((item) => {
                    const uri = itemThumbnailUrl(item);
                    return (
                      <View key={item.id} style={styles.planItem}>
                        {uri ? (
                          <Image
                            source={{ uri }}
                            style={styles.planThumb}
                            resizeMode="contain"
                          />
                        ) : (
                          <View style={[styles.planThumb, styles.thumbPlaceholder]} />
                        )}
                        <Text style={styles.planItemLabel} numberOfLines={1}>
                          {item.subcategory}
                        </Text>
                      </View>
                    );
                  })
                )}
              </View>
              {plan.conflicts.length > 0 ? (
                <View style={styles.conflictBox}>
                  {plan.conflicts.slice(0, 4).map((conflict, index) => (
                    <Text key={`${conflict.kind}-${index}`} style={styles.conflictText}>
                      {conflict.message}
                    </Text>
                  ))}
                </View>
              ) : null}
              <Text style={styles.fieldLabel}>Prep checklist</Text>
              <View style={styles.chipRow}>
                {PREP_ITEMS.map((prep) => {
                  const active = Boolean(plan[prep.key]);
                  return (
                    <Pressable
                      key={prep.key}
                      onPress={() => patchPlan(plan.id, { [prep.key]: !active })}
                      style={({ pressed }) => [
                        styles.chip,
                        active && styles.chipActive,
                        { opacity: pressed ? 0.75 : 1 },
                      ]}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          active && styles.chipTextActive,
                        ]}
                      >
                        {prep.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <View style={styles.statusRow}>
                {STATUS_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt.value}
                    onPress={() => patchPlan(plan.id, { status: opt.value })}
                    style={({ pressed }) => [
                      styles.statusChip,
                      plan.status === opt.value && styles.statusChipActive,
                      { opacity: pressed ? 0.75 : 1 },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusText,
                        plan.status === opt.value && styles.statusTextActive,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </GlassCard>
          ))
        )}
      </ScrollView>
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
    container: {
      paddingHorizontal: spacing.lg,
      paddingBottom: STACK_SCREEN_SCROLL_BOTTOM,
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
    formCard: {
      marginBottom: spacing.lg,
    },
    sectionTitle: {
      ...typography.headline,
      color: colors.text,
      marginBottom: spacing.sm,
    },
    input: {
      marginTop: spacing.sm,
      borderRadius: radii.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: surface.inputBorder,
      backgroundColor: surface.inputOverlay,
      color: colors.text,
      paddingHorizontal: spacing.md,
      paddingVertical: 11,
      fontSize: 15,
    },
    inlineFields: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    inlineInput: {
      flex: 1,
    },
    notesInput: {
      minHeight: 72,
      textAlignVertical: 'top',
    },
    fieldLabel: {
      ...typography.caption,
      color: colors.text,
      fontWeight: '800',
      marginTop: spacing.md,
      marginBottom: spacing.sm,
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: radii.pill,
      backgroundColor: surface.chipInactive,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: surface.chipInactiveBorder,
    },
    chipActive: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    chipText: {
      ...typography.caption,
      color: colors.text,
      fontWeight: '800',
    },
    chipTextActive: {
      color: '#fff',
    },
    itemGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    itemPick: {
      width: 78,
      padding: spacing.xs,
      borderRadius: radii.md,
      backgroundColor: colors.surfaceSolid,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: surface.cardBorder,
      ...shadow.card,
    },
    itemPickSelected: {
      borderWidth: 2,
      borderColor: colors.accent,
      backgroundColor: colors.accentSoft,
    },
    itemThumb: {
      width: '100%',
      aspectRatio: 1,
      borderRadius: radii.sm,
      backgroundColor: surface.thumbBg,
    },
    thumbPlaceholder: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    itemLabel: {
      ...typography.caption,
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: 4,
    },
    error: {
      color: colors.danger,
      textAlign: 'center',
      marginBottom: spacing.md,
    },
    emptyCard: {
      marginBottom: spacing.md,
    },
    emptyTitle: {
      ...typography.headline,
      color: colors.text,
    },
    emptyText: {
      ...typography.callout,
      color: colors.textSecondary,
      marginTop: 4,
      lineHeight: 20,
    },
    planCard: {
      marginBottom: spacing.md,
    },
    planHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
    },
    planDate: {
      ...typography.caption,
      color: colors.accent,
      fontWeight: '800',
      marginBottom: 2,
    },
    planTitle: {
      ...typography.headline,
      color: colors.text,
    },
    planMeta: {
      ...typography.caption,
      color: colors.textSecondary,
      marginTop: 2,
      textTransform: 'capitalize',
    },
    notes: {
      ...typography.callout,
      color: colors.textSecondary,
      marginTop: spacing.sm,
      lineHeight: 20,
    },
    planItems: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    planItem: {
      width: 64,
    },
    planThumb: {
      width: 64,
      height: 64,
      borderRadius: radii.md,
      backgroundColor: surface.thumbBg,
    },
    planItemLabel: {
      ...typography.caption,
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: 4,
    },
    conflictBox: {
      marginTop: spacing.md,
      padding: spacing.md,
      borderRadius: radii.md,
      backgroundColor: colors.dangerSoft,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.danger,
      gap: 4,
    },
    conflictText: {
      ...typography.caption,
      color: colors.danger,
      fontWeight: '700',
    },
    statusRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    statusChip: {
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: radii.pill,
      backgroundColor: surface.chipInactive,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: surface.chipInactiveBorder,
    },
    statusChipActive: {
      backgroundColor: colors.accentSoft,
      borderColor: colors.accent,
    },
    statusText: {
      ...typography.caption,
      color: colors.text,
      fontWeight: '700',
    },
    statusTextActive: {
      color: colors.accent,
    },
  });
}
