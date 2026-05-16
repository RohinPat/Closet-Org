import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
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
import { API_ORIGIN } from '../config';
import { GlassButton, ScreenBackground } from '../components/Glass';
import { PostCard } from '../components/PostCard';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  TAB_SCREEN_SCROLL_BOTTOM,
  tabScrollContentPaddingTop,
} from '../utils/screenSpacing';
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

const PAGE_SIZE = 30;

export function FeedScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const scrollTop = tabScrollContentPaddingTop(insets);
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const [posts, setPosts] = useState<FitPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reachedEnd, setReachedEnd] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enrichFeedError = useCallback(async (message: string) => {
    if (!/not\s*found/i.test(message)) return message;
    try {
      const r = await fetch(`${API_ORIGIN}/healthz`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (r.ok) {
        return (
          message +
          '\n\nDiagnostic: /healthz succeeded - this host is your Closet-Org server, but GET /api/feed returned 404. Fix a double /api in your API URL, or restart uvicorn from the current backend (old processes may lack /api/feed).'
        );
      }
      return (
        message +
        `\n\nDiagnostic: /healthz returned HTTP ${r.status} — ${API_ORIGIN} may not be this API (wrong host/port).`
      );
    } catch {
      return (
        message +
        `\n\nDiagnostic: no response from ${API_ORIGIN}/healthz — API not running, wrong IP, or firewall.`
      );
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.fetchFeed();
      setPosts(data.posts);
      setReachedEnd(data.posts.length < PAGE_SIZE);
    } catch (e) {
      let msg = e instanceof Error ? e.message : 'Could not load feed';
      msg = await enrichFeedError(msg);
      setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [enrichFeedError]);

  useFocusEffect(
    useCallback(() => {
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

  if (error && posts.length === 0 && !loading) {
    return (
      <View style={{ flex: 1 }}>
        <ScreenBackground />
        <View style={styles.centered}>
          <Text style={styles.errorTitle}>Could not load feed</Text>
          <Text style={styles.errorDetail}>{error}</Text>
          <Text style={styles.errorHint}>
            {
              'When there are no posts yet, the feed still loads and shows “No fits yet”—that is normal. “Not found” means the app could not reach your API (wrong address, tunnel mode, or backend not running).'
            }
          </Text>
          {__DEV__ ? (
            <Text style={[styles.errorHint, { marginBottom: spacing.md }]}>
              {`Dev API base: ${API_ORIGIN} → ${API_ORIGIN}/api/feed`}
            </Text>
          ) : null}
          {/not\s*found/i.test(error) ? (
            <Text style={[styles.errorHint, { marginBottom: spacing.md }]}>
              {`Try: same Wi-Fi as your PC, uvicorn on the port shown above, LAN mode in Expo (not tunnel), or set EXPO_PUBLIC_API_URL to ${API_ORIGIN} (no /api) and restart Metro.`}
            </Text>
          ) : null}
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
        contentContainerStyle={[styles.list, { paddingTop: scrollTop }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
            progressViewOffset={scrollTop}
          />
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>Your feed is ready</Text>
            <Text style={styles.empty}>
              Posts from you and your friends show here. Until then, this stays
              quiet—that is the default, not an error.
            </Text>
            <View style={styles.emptyActions}>
              <GlassButton
                title="Post a fit"
                onPress={() => navigation.navigate('CreateFit')}
                fullWidth={false}
              />
              <GlassButton
                title="Find friends"
                variant="secondary"
                onPress={() => navigation.navigate('Friends')}
                fullWidth={false}
              />
            </View>
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
    errorTitle: {
      ...typography.headline,
      color: colors.text,
      textAlign: 'center',
      marginBottom: spacing.sm,
    },
    errorDetail: {
      color: colors.danger,
      textAlign: 'center',
      marginBottom: spacing.md,
      fontSize: 15,
    },
    errorHint: {
      color: colors.textSecondary,
      textAlign: 'center',
      fontSize: 13,
      lineHeight: 19,
      marginBottom: spacing.lg,
    },
    list: {
      paddingHorizontal: spacing.lg,
      paddingBottom: TAB_SCREEN_SCROLL_BOTTOM,
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
    emptyActions: {
      marginTop: spacing.lg,
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: spacing.sm,
    },
  });
}
