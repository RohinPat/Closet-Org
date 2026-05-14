import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as api from '../api/client';
import { GlassCard } from '../components/Glass';
import { colors, radii, spacing, typography } from '../theme';

type TileProps = {
  value: number;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  tint?: string;
};

function Tile({ value, label, icon, tint }: TileProps) {
  return (
    <GlassCard padded style={styles.tile}>
      <View style={[styles.iconWrap, { backgroundColor: tint || colors.accentSoft }]}>
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
  const [stats, setStats] = useState<Awaited<
    ReturnType<typeof api.fetchStats>
  > | null>(null);
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
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (error && !stats) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  if (!stats) return null;

  const entries = Object.entries(stats.by_category || {}).sort(
    (a, b) => b[1] - a[1]
  );
  const maxCount = entries.reduce((m, [, c]) => Math.max(m, c), 1);

  return (
    <ScrollView
      contentContainerStyle={styles.container}
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
                style={[styles.row, i === entries.length - 1 && styles.rowLast]}
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
    </ScrollView>
  );
}

const HEADER_PAD = Platform.OS === 'ios' ? 64 : 32;

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  error: { color: colors.danger, padding: spacing.xl },
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  tile: {
    width: '47.5%',
    padding: spacing.lg,
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
});
