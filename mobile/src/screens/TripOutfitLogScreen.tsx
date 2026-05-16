import React, { useCallback, useState } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as api from '../api/client';
import type { TripLog } from '../api/types';
import { absoluteUrl } from '../config';
import { GlassButton, GlassCard, ScreenBackground } from '../components/Glass';
import { PostCard } from '../components/PostCard';
import type { AppStackParamList } from '../navigation/RootNavigator';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { stackTopPadding } from '../utils/screenSpacing';
import {
  radii,
  shadow,
  spacing,
  typography,
  type ThemeColors,
  type ThemeSurface,
} from '../theme';

type Props = NativeStackScreenProps<AppStackParamList, 'TripOutfitLog'>;

function defaultTripName(destination: string): string {
  const trimmed = destination.trim();
  const month = new Date().toLocaleString(undefined, {
    month: 'long',
    year: 'numeric',
  });
  return trimmed ? `${trimmed}, ${month}` : '';
}

function tripDateLabel(log: TripLog): string {
  if (log.start_date && log.end_date && log.start_date !== log.end_date) {
    return `${log.start_date} to ${log.end_date}`;
  }
  return log.start_date || log.end_date || 'No dates';
}

export function TripOutfitLogScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const headerPad = stackTopPadding(insets);
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [logs, setLogs] = useState<TripLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [tripName, setTripName] = useState('');
  const [destination, setDestination] = useState('');
  const [tripStart, setTripStart] = useState('');
  const [tripEnd, setTripEnd] = useState('');

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api.fetchTripLogs();
      setLogs(data.trips);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load trip logs');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const startLog = useCallback(() => {
    const name = tripName.trim() || defaultTripName(destination);
    if (!name) {
      setError('Name the trip or add a destination first.');
      return;
    }
    navigation.navigate('CreateFit', {
      tripName: name,
      tripDestination: destination.trim() || undefined,
      tripStart: tripStart.trim() || undefined,
      tripEnd: tripEnd.trim() || undefined,
      packedOnly: true,
    });
  }, [destination, navigation, tripEnd, tripName, tripStart]);

  return (
    <View style={{ flex: 1 }}>
      <ScreenBackground />
      <ScrollView
        contentContainerStyle={[styles.container, { paddingTop: headerPad }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.accent}
            progressViewOffset={headerPad}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.heading}>Trip outfit log</Text>
        <Text style={styles.blurb}>
          Group trip fit pics into albums. New trip posts reuse the regular fit
          flow and put packed items first for tagging.
        </Text>

        <GlassCard padded style={styles.formCard}>
          <View style={styles.formHeader}>
            <Ionicons name="images-outline" size={22} color={colors.accent} />
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Start or continue a trip</Text>
              <Text style={styles.cardHint}>
                Reuse the same trip name to add photos to that album.
              </Text>
            </View>
          </View>
          <TextInput
            value={tripName}
            onChangeText={setTripName}
            placeholder="Trip name, e.g. Lisbon, April 2026"
            placeholderTextColor={colors.placeholder}
            style={styles.input}
          />
          <TextInput
            value={destination}
            onChangeText={setDestination}
            placeholder="Destination"
            placeholderTextColor={colors.placeholder}
            autoCapitalize="words"
            style={styles.input}
          />
          <View style={styles.dateRow}>
            <TextInput
              value={tripStart}
              onChangeText={setTripStart}
              placeholder="Start YYYY-MM-DD"
              placeholderTextColor={colors.placeholder}
              autoCapitalize="none"
              style={[styles.input, styles.dateInput]}
            />
            <TextInput
              value={tripEnd}
              onChangeText={setTripEnd}
              placeholder="End YYYY-MM-DD"
              placeholderTextColor={colors.placeholder}
              autoCapitalize="none"
              style={[styles.input, styles.dateInput]}
            />
          </View>
          <GlassButton title="Add trip fit pic" onPress={startLog} />
        </GlassCard>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {loading ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />
        ) : logs.length === 0 ? (
          <GlassCard padded style={styles.emptyCard}>
            <Ionicons name="airplane-outline" size={28} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>No trip albums yet</Text>
            <Text style={styles.emptyText}>
              Add your first trip fit pic and it will show up here as an album.
            </Text>
          </GlassCard>
        ) : (
          logs.map((log) => {
            const key = `${log.name}-${log.destination || ''}-${log.start_date || ''}`;
            const isExpanded = expanded === key;
            const coverUri = absoluteUrl(log.cover_image_path || undefined);
            return (
              <View key={key}>
                <Pressable
                  onPress={() => setExpanded(isExpanded ? null : key)}
                  style={({ pressed }) => [{ opacity: pressed ? 0.82 : 1 }]}
                >
                  <GlassCard padded={false} style={styles.albumCard}>
                    <View style={styles.albumRow}>
                      {coverUri ? (
                        <Image source={{ uri: coverUri }} style={styles.cover} />
                      ) : (
                        <View style={[styles.cover, styles.coverPlaceholder]}>
                          <Ionicons
                            name="image-outline"
                            size={24}
                            color={colors.textMuted}
                          />
                        </View>
                      )}
                      <View style={styles.albumText}>
                        <Text style={styles.albumTitle} numberOfLines={1}>
                          {log.name}
                        </Text>
                        <Text style={styles.albumMeta} numberOfLines={1}>
                          {[log.destination, tripDateLabel(log)]
                            .filter(Boolean)
                            .join(' · ')}
                        </Text>
                        <Text style={styles.albumCount}>
                          {log.post_count} fit pic{log.post_count === 1 ? '' : 's'}
                        </Text>
                      </View>
                      <Ionicons
                        name={isExpanded ? 'chevron-up' : 'chevron-down'}
                        size={18}
                        color={colors.textMuted}
                      />
                    </View>
                  </GlassCard>
                </Pressable>

                {isExpanded ? (
                  <View style={styles.postList}>
                    <GlassButton
                      title="Add another fit"
                      variant="secondary"
                      onPress={() =>
                        navigation.navigate('CreateFit', {
                          tripName: log.name,
                          tripDestination: log.destination || undefined,
                          tripStart: log.start_date || undefined,
                          tripEnd: log.end_date || undefined,
                          packedOnly: true,
                        })
                      }
                      style={styles.addAnother}
                    />
                    {log.posts.map((post) => (
                      <PostCard
                        key={post.id}
                        post={post}
                        compact
                        onPress={() =>
                          navigation.navigate('FitDetail', { postId: post.id })
                        }
                        onComment={() =>
                          navigation.navigate('FitDetail', { postId: post.id })
                        }
                      />
                    ))}
                  </View>
                ) : null}
              </View>
            );
          })
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
    container: {
      paddingHorizontal: spacing.lg,
      paddingBottom: 110,
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
    formCard: {
      marginBottom: spacing.lg,
    },
    formHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.sm,
    },
    cardTitle: {
      ...typography.headline,
      color: colors.text,
    },
    cardHint: {
      ...typography.caption,
      color: colors.textSecondary,
      marginTop: 2,
    },
    input: {
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
      marginBottom: spacing.md,
    },
    dateInput: {
      flex: 1,
    },
    error: {
      color: colors.danger,
      textAlign: 'center',
      marginBottom: spacing.md,
    },
    emptyCard: {
      alignItems: 'center',
      gap: spacing.sm,
    },
    emptyTitle: {
      ...typography.headline,
      color: colors.text,
    },
    emptyText: {
      ...typography.callout,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    albumCard: {
      marginBottom: spacing.md,
      overflow: 'hidden',
      ...shadow.card,
    },
    albumRow: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: spacing.md,
      gap: spacing.md,
    },
    cover: {
      width: 72,
      height: 90,
      borderRadius: radii.md,
      backgroundColor: surface.thumbBg,
    },
    coverPlaceholder: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    albumText: {
      flex: 1,
    },
    albumTitle: {
      ...typography.bodyMedium,
      color: colors.text,
    },
    albumMeta: {
      ...typography.caption,
      color: colors.textSecondary,
      marginTop: 4,
    },
    albumCount: {
      ...typography.caption,
      color: colors.accent,
      fontWeight: '800',
      marginTop: 8,
    },
    postList: {
      marginBottom: spacing.lg,
    },
    addAnother: {
      marginBottom: spacing.md,
    },
  });
}
