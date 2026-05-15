import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { CompositeNavigationProp } from '@react-navigation/native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type {
  AppStackParamList,
  MainTabParamList,
} from '../navigation/RootNavigator';
import * as api from '../api/client';
import type { FitPost } from '../api/types';
import { GlassButton, ScreenBackground } from '../components/Glass';
import { PostCard } from '../components/PostCard';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import {
  radii,
  spacing,
  typography,
  type ThemeColors,
  type ThemeSurface,
} from '../theme';

type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'FeedTab'>,
  NativeStackNavigationProp<AppStackParamList>
>;

const HEADER_PAD = Platform.OS === 'ios' ? 64 : 32;
const PAGE_SIZE = 30;

export function FeedScreen() {
  const navigation = useNavigation<Nav>();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const [posts, setPosts] = useState<FitPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reachedEnd, setReachedEnd] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api.fetchFeed();
      setPosts(data.posts);
      setReachedEnd(data.posts.length < PAGE_SIZE);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load feed');
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

  function onRefresh() {
    setRefreshing(true);
    setReachedEnd(false);
    load();
  }

  async function loadMore() {
    if (loadingMore || reachedEnd || posts.length === 0) return;
    const oldest = posts[posts.length - 1]?.created_at;
    if (!oldest) return;
    setLoadingMore(true);
    try {
      const data = await api.fetchFeed(oldest);
      if (data.posts.length === 0) {
        setReachedEnd(true);
      } else {
        setPosts((prev) => [...prev, ...data.posts]);
        if (data.posts.length < PAGE_SIZE) setReachedEnd(true);
      }
    } catch {
      // Silent — pagination errors shouldn't block the existing list.
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleReact(postId: number, emoji: string) {
    // Optimistic flip: toggle the emoji + count locally.
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id !== postId) return p;
        const existing = p.reactions.find((r) => r.emoji === emoji);
        let next = p.reactions;
        if (existing) {
          const newCount = existing.count + (existing.mine ? -1 : 1);
          const mineNext = !existing.mine;
          if (newCount <= 0 && !mineNext) {
            next = p.reactions.filter((r) => r.emoji !== emoji);
          } else {
            next = p.reactions.map((r) =>
              r.emoji === emoji ? { ...r, count: newCount, mine: mineNext } : r
            );
          }
        } else {
          next = [...p.reactions, { emoji, count: 1, mine: true }];
        }
        return { ...p, reactions: next };
      })
    );
    try {
      await api.toggleReaction(postId, emoji);
    } catch {
      // Roll back by refetching the single post.
      try {
        const fresh = await api.fetchFitPost(postId);
        setPosts((prev) => prev.map((p) => (p.id === postId ? fresh : p)));
      } catch {
        // Give up silently — next refresh will fix it.
      }
    }
  }

  if (loading && posts.length === 0) {
    return (
      <View style={{ flex: 1 }}>
        <ScreenBackground />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </View>
    );
  }

  if (error && posts.length === 0) {
    return (
      <View style={{ flex: 1 }}>
        <ScreenBackground />
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <GlassButton title="Retry" onPress={load} fullWidth={false} />
        </View>
      </View>
    );
  }

  const header = (
    <View style={styles.headerRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.heading}>Feed</Text>
        <Text style={styles.sub}>Daily fits from your circle</Text>
      </View>
      <Pressable
        onPress={() => navigation.navigate('Friends')}
        style={({ pressed }) => [
          styles.iconBtn,
          { opacity: pressed ? 0.7 : 1 },
        ]}
        accessibilityLabel="Friends"
      >
        <Ionicons name="people-outline" size={20} color={colors.text} />
      </Pressable>
      <Pressable
        onPress={() => navigation.navigate('CreateFit')}
        style={({ pressed }) => [
          styles.postBtn,
          { opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <Ionicons name="add" size={18} color="#fff" />
        <Text style={styles.postBtnText}>Post</Text>
      </Pressable>
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <ScreenBackground />
      <FlatList
        data={posts}
        keyExtractor={(p) => String(p.id)}
        ListHeaderComponent={header}
        renderItem={({ item }) => (
          <PostCard
            post={item}
            onPress={() =>
              navigation.navigate('FitDetail', { postId: item.id })
            }
            onPressAuthor={() =>
              item.author
                ? navigation.navigate('PublicProfile', {
                    userId: item.author.id,
                  })
                : undefined
            }
            onReact={(emoji) => handleReact(item.id, emoji)}
            onComment={() =>
              navigation.navigate('FitDetail', { postId: item.id })
            }
          />
        )}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
            progressViewOffset={HEADER_PAD}
          />
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>No fits yet</Text>
            <Text style={styles.empty}>
              Add some friends or post your first daily fit check.
            </Text>
            <GlassButton
              title="Find friends"
              onPress={() => navigation.navigate('Friends')}
              fullWidth={false}
              style={{ marginTop: spacing.lg }}
            />
          </View>
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={{ paddingVertical: spacing.lg }}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : null
        }
      />
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
      justifyContent: 'center',
      alignItems: 'center',
      padding: spacing.xl,
    },
    errorText: {
      color: colors.danger,
      textAlign: 'center',
      marginBottom: spacing.lg,
      fontSize: 15,
    },
    list: {
      paddingTop: HEADER_PAD,
      paddingHorizontal: spacing.lg,
      paddingBottom: 120,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.lg,
    },
    heading: {
      ...typography.title,
      color: colors.text,
    },
    sub: {
      ...typography.callout,
      color: colors.textSecondary,
      marginTop: 2,
    },
    iconBtn: {
      width: 40,
      height: 40,
      borderRadius: radii.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: surface.chipInactive,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: surface.chipInactiveBorder,
    },
    postBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 14,
      height: 40,
      borderRadius: radii.md,
      backgroundColor: colors.accent,
    },
    postBtnText: {
      color: '#fff',
      fontWeight: '700',
      fontSize: 14,
    },
    emptyWrap: {
      alignItems: 'center',
      marginTop: 80,
      paddingHorizontal: spacing.xl,
    },
    emptyTitle: {
      ...typography.headline,
      color: colors.text,
      marginBottom: 6,
    },
    empty: {
      textAlign: 'center',
      color: colors.textSecondary,
      fontSize: 15,
    },
  });
}
