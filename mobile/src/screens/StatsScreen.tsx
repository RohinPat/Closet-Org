import React, { useCallback, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as api from '../api/client';
import type { ClosetGap, ClosetInsights } from '../api/types';
import { GlassButton, GlassCard, ScreenBackground } from '../components/Glass';
import type { AppStackParamList } from '../navigation/RootNavigator';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  stackScrollContentPaddingTop,
  STACK_SCREEN_SCROLL_BOTTOM,
} from '../utils/screenSpacing';
import {
  radii,
  spacing,
  typography,
  type ThemeColors,
} from '../theme';

type TileProps = {
  value: number;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  tint?: string;
};

function gapWishlistSeed(gap: ClosetGap) {
  const map: Record<string, { category: string; subcategory: string }> = {
    outer_layer: { category: 'Jacket', subcategory: 'Top' },
    neutral_outer: { category: 'Jacket', subcategory: 'Top' },
    dressy_shoes: { category: 'Shoes', subcategory: 'Footwear' },
    bottoms_or_dress: { category: 'Bottom', subcategory: 'Bottom' },
    accessories: { category: 'Accessory', subcategory: 'Accessory' },
    color_variety: { category: 'Other', subcategory: 'Wishlist' },
  };
  return map[gap.id] ?? { category: 'Other', subcategory: 'Wishlist' };
}

function Tile({ value, label, icon, tint }: TileProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <GlassCard padded style={styles.tile}>
      <View
        style={[
          styles.iconWrap,
          { backgroundColor: tint || colors.accentSoft },
        ]}
      >
        <Ionicons
          name={icon}
          size={18}
          color={tint ? colors.text : colors.accent}
        />
      </View>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </GlassCard>
  );
}

export function StatsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const scrollTop = stackScrollContentPaddingTop(insets);
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [stats, setStats] = useState<Awaited<
    ReturnType<typeof api.fetchStats>
  > | null>(null);
  const [insights, setInsights] = useState<ClosetInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api.fetchStats();
      setStats(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load stats');
    }
    try {
      const insightData = await api.fetchClosetInsights();
      setInsights(insightData);
    } catch {
      setInsights(null);
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

  if (loading && !stats) {
    return (
      <View style={{ flex: 1 }}>
        <ScreenBackground />
        <View style={[styles.container, { paddingTop: scrollTop }]}>
          <View style={styles.skeletonTitle} />
          <View style={styles.grid}>
            {[0, 1, 2, 3].map((idx) => (
              <View key={idx} style={styles.skeletonTile} />
            ))}
          </View>
        </View>
      </View>
    );
  }

  if (error && !stats) {
    return (
      <View style={{ flex: 1 }}>
        <ScreenBackground />
        <View style={styles.centered}>
          <Text style={styles.error}>{error}</Text>
        </View>
      </View>
    );
  }

  if (!stats) return null;

  const entries = Object.entries(stats.by_category || {}).sort(
    (a, b) => b[1] - a[1]
  );
  const maxCount = entries.reduce((m, [, c]) => Math.max(m, c), 1);

  return (
    <View style={{ flex: 1 }}>
      <ScreenBackground />
      <ScrollView
        contentContainerStyle={[styles.container, { paddingTop: scrollTop }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={colors.accent}
          />
        }
      >
        <Text style={styles.heading}>Stats</Text>
        <Text style={styles.blurb}>An overview of your closet.</Text>

        <View style={styles.grid}>
          <Tile
            value={stats.total_items}
            label="Total items"
            icon="cube-outline"
          />
          <Tile
            value={stats.clean_items}
            label="Clean"
            icon="checkmark-circle-outline"
            tint="rgba(48, 209, 88, 0.18)"
          />
          <Tile
            value={stats.dirty_items}
            label="Needs wash"
            icon="water-outline"
            tint="rgba(255, 159, 10, 0.18)"
          />
          <Tile
            value={stats.recently_added}
            label="New (7d)"
            icon="sparkles-outline"
          />
        </View>

        <Text style={styles.sectionTitle}>By category</Text>
        <GlassCard padded style={styles.listCard}>
          {entries.length === 0 ? (
            <Text style={styles.muted}>No items yet.</Text>
          ) : (
            entries.map(([name, count], i) => {
              const ratio = count / maxCount;
              return (
                <View
                  key={name}
                  style={[
                    styles.row,
                    i === entries.length - 1 && styles.rowLast,
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <View style={styles.rowHead}>
                      <Text style={styles.rowName}>{name}</Text>
                      <Text style={styles.rowCount}>{count}</Text>
                    </View>
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.barFill,
                          { width: `${Math.max(6, ratio * 100)}%` },
                        ]}
                      />
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </GlassCard>

        <Text style={styles.sectionTitle}>Best cost-per-wear</Text>
        <GlassCard padded style={styles.listCard}>
          {!stats.best_cpw?.length ? (
            <Text style={styles.muted}>
              Log a price on items and wear them — your best CPW pieces show up
              here.
            </Text>
          ) : (
            stats.best_cpw.map((row, i) => (
              <View
                key={row.id}
                style={[
                  styles.gapRow,
                  i === (stats.best_cpw?.length ?? 0) - 1 && styles.rowLast,
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.gapTitle}>
                    {row.subcategory} · {row.category}
                  </Text>
                  <Text style={styles.gapDetail}>
                    ${row.cost_per_wear?.toFixed(2) ?? '—'} per wear · worn{' '}
                    {row.times_worn}×
                  </Text>
                </View>
              </View>
            ))
          )}
        </GlassCard>

        <Text style={styles.sectionTitle}>Spring-clean candidates</Text>
        <GlassCard padded style={styles.listCard}>
          {!insights?.retirement_candidates?.length ? (
            <Text style={styles.muted}>
              {insights
                ? 'No obvious audit flags — your closet looks balanced.'
                : 'Loading…'}
            </Text>
          ) : (
            insights.retirement_candidates.map((r, i) => (
              <View
                key={r.item_id}
                style={[
                  styles.gapRow,
                  i === insights.retirement_candidates!.length - 1 &&
                    styles.rowLast,
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.gapTitle}>
                    {r.subcategory} · #{r.item_id}
                  </Text>
                  <Text style={styles.gapDetail}>
                    {r.reasons.join(' · ')}
                  </Text>
                </View>
              </View>
            ))
          )}
        </GlassCard>

        <Text style={styles.sectionTitle}>Duplicate watch</Text>
        <GlassCard padded style={styles.listCard}>
          {!insights?.duplicate_candidates?.length ? (
            <Text style={styles.muted}>No near-duplicates found from visual embeddings.</Text>
          ) : (
            insights.duplicate_candidates.slice(0, 5).map((dupe, i) => (
              <View
                key={`${dupe.items[0]?.id}-${dupe.items[1]?.id}`}
                style={[
                  styles.gapRow,
                  i === Math.min(4, insights.duplicate_candidates!.length - 1) &&
                    styles.rowLast,
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.gapTitle}>
                    {Math.round(dupe.score * 100)}% similar
                  </Text>
                  <Text style={styles.gapDetail}>
                    {dupe.items.map((item) => `${item.subcategory} #${item.id}`).join(' · ')}
                  </Text>
                </View>
              </View>
            ))
          )}
        </GlassCard>

        <Text style={styles.sectionTitle}>Capsule gaps</Text>
        <GlassCard padded style={styles.listCard}>
          {!insights || insights.gaps.length === 0 ? (
            <Text style={styles.muted}>
              {insights
                ? 'No major gaps detected — nice work.'
                : 'Loading…'}
            </Text>
          ) : (
            insights.gaps.map((g, i) => {
              const seed = gapWishlistSeed(g);
              return (
                <View
                  key={g.id}
                  style={[
                    styles.gapRow,
                    i === insights!.gaps.length - 1 && styles.rowLast,
                  ]}
                >
                  <View
                    style={[
                      styles.gapDot,
                      g.priority === 'high' && { backgroundColor: colors.danger },
                      g.priority === 'medium' && {
                        backgroundColor: 'rgba(255, 159, 10, 0.9)',
                      },
                      g.priority === 'low' && {
                        backgroundColor: colors.textMuted,
                      },
                    ]}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.gapTitle}>{g.title}</Text>
                    <Text style={styles.gapDetail}>{g.detail}</Text>
                    <GlassButton
                      title="Add wishlist target"
                      variant="ghost"
                      onPress={() =>
                        navigation.navigate('Wishlist', {
                          openAdd: true,
                          initialName: g.title,
                          initialIntent: 'want',
                          initialNotes: g.detail,
                          initialCategory: seed.category,
                          initialSubcategory: seed.subcategory,
                        })
                      }
                      style={styles.gapButton}
                    />
                  </View>
                </View>
              );
            })
          )}
        </GlassCard>

        <Text style={styles.sectionTitle}>Wardrobe mix</Text>
        <GlassCard padded style={styles.listCard}>
          {!insights ? (
            <Text style={styles.muted}>Loading…</Text>
          ) : (
            <>
              <Text style={styles.mixCaption}>
                Subcategories · {insights.composition.item_count} items
              </Text>
              {Object.entries(insights.composition.by_subcategory)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 8)
                .map(([name, count]) => (
                  <Text key={name} style={styles.mixLine}>
                    <Text style={styles.mixName}>{name}</Text>
                    <Text style={styles.mixCount}> {count}</Text>
                  </Text>
                ))}
              {Object.keys(insights.composition.color_buckets).length > 0 ? (
                <>
                  <Text style={[styles.mixCaption, { marginTop: spacing.md }]}>
                    Top colors
                  </Text>
                  {Object.entries(insights.composition.color_buckets)
                    .slice(0, 8)
                    .map(([name, count]) => (
                      <Text key={name} style={styles.mixLine}>
                        <Text style={styles.mixName}>{name}</Text>
                        <Text style={styles.mixCount}> {count}</Text>
                      </Text>
                    ))}
                </>
              ) : null}
              {insights.composition.by_season ? (
                <>
                  <Text style={[styles.mixCaption, { marginTop: spacing.md }]}>
                    Season balance
                  </Text>
                  {Object.entries(insights.composition.by_season)
                    .slice(0, 6)
                    .map(([name, count]) => (
                      <Text key={name} style={styles.mixLine}>
                        <Text style={styles.mixName}>{name}</Text>
                        <Text style={styles.mixCount}> {count}</Text>
                      </Text>
                    ))}
                </>
              ) : null}
              {insights.composition.by_pattern ? (
                <>
                  <Text style={[styles.mixCaption, { marginTop: spacing.md }]}>
                    Patterns
                  </Text>
                  {Object.entries(insights.composition.by_pattern)
                    .slice(0, 6)
                    .map(([name, count]) => (
                      <Text key={name} style={styles.mixLine}>
                        <Text style={styles.mixName}>{name}</Text>
                        <Text style={styles.mixCount}> {count}</Text>
                      </Text>
                    ))}
                </>
              ) : null}
            </>
          )}
        </GlassCard>
      </ScrollView>
    </View>
  );
}

function makeStyles({ colors }: { colors: ThemeColors }) {
  return StyleSheet.create({
    centered: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: spacing.xl,
    },
    error: { color: colors.danger, padding: spacing.xl },
    container: {
      paddingHorizontal: spacing.xl,
      paddingBottom: STACK_SCREEN_SCROLL_BOTTOM,
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
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.md,
      marginBottom: spacing.xl,
    },
    tile: {
      width: '47.5%',
    },
    skeletonTitle: {
      width: 160,
      height: 30,
      borderRadius: radii.md,
      backgroundColor: colors.surfaceSolid,
      marginBottom: spacing.xl,
    },
    skeletonTile: {
      width: '47.5%',
      height: 112,
      borderRadius: radii.lg,
      backgroundColor: colors.surfaceSolid,
    },
    iconWrap: {
      width: 36,
      height: 36,
      borderRadius: radii.md,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.md,
    },
    tileValue: {
      fontSize: 30,
      fontWeight: '700',
      color: colors.text,
      letterSpacing: -0.5,
    },
    tileLabel: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 2,
    },
    sectionTitle: {
      ...typography.headline,
      color: colors.text,
      marginBottom: spacing.md,
    },
    listCard: { padding: spacing.lg },
    row: {
      paddingVertical: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.divider,
    },
    rowLast: { borderBottomWidth: 0 },
    rowHead: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    rowName: { fontSize: 15, color: colors.text, fontWeight: '500' },
    rowCount: { fontSize: 15, fontWeight: '700', color: colors.accent },
    barTrack: {
      height: 6,
      borderRadius: radii.pill,
      backgroundColor: colors.divider,
      overflow: 'hidden',
    },
    barFill: {
      height: '100%',
      backgroundColor: colors.accent,
      borderRadius: radii.pill,
    },
    muted: { color: colors.textMuted, fontSize: 15 },
    gapRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      paddingVertical: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.divider,
    },
    gapDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      marginTop: 6,
      backgroundColor: colors.textMuted,
    },
    gapTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 4,
    },
    gapDetail: {
      fontSize: 14,
      color: colors.textSecondary,
      lineHeight: 20,
    },
    gapButton: {
      marginTop: spacing.sm,
      alignSelf: 'flex-start',
      minWidth: 180,
    },
    mixCaption: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
      marginBottom: spacing.sm,
    },
    mixLine: {
      fontSize: 14,
      paddingVertical: 4,
    },
    mixName: { color: colors.text },
    mixCount: { color: colors.accent, fontWeight: '600' },
  });
}
