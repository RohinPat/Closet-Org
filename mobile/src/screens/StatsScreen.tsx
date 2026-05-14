import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as api from '../api/client';

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
        <ActivityIndicator size="large" color="#4f46e5" />
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

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            load();
          }}
        />
      }
    >
      <View style={styles.grid}>
        <View style={styles.tile}>
          <Text style={styles.tileValue}>{stats.total_items}</Text>
          <Text style={styles.tileLabel}>Total items</Text>
        </View>
        <View style={styles.tile}>
          <Text style={styles.tileValue}>{stats.clean_items}</Text>
          <Text style={styles.tileLabel}>Clean</Text>
        </View>
        <View style={styles.tile}>
          <Text style={styles.tileValue}>{stats.dirty_items}</Text>
          <Text style={styles.tileLabel}>Needs wash</Text>
        </View>
        <View style={styles.tile}>
          <Text style={styles.tileValue}>{stats.recently_added}</Text>
          <Text style={styles.tileLabel}>New (7d)</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>By category</Text>
      {entries.length === 0 ? (
        <Text style={styles.muted}>No items yet.</Text>
      ) : (
        entries.map(([name, count]) => (
          <View key={name} style={styles.row}>
            <Text style={styles.rowName}>{name}</Text>
            <Text style={styles.rowCount}>{count}</Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f9fafb' },
  container: { padding: 16, paddingBottom: 40 },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
  },
  error: { color: '#dc2626', padding: 24 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  tile: {
    width: '47%',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  tileValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
  },
  tileLabel: { fontSize: 14, color: '#6b7280', marginTop: 4 },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  rowName: { fontSize: 16, color: '#374151' },
  rowCount: { fontSize: 16, fontWeight: '600', color: '#4f46e5' },
  muted: { color: '#9ca3af', fontSize: 15 },
});
