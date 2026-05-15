import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AppStackParamList } from '../navigation/RootNavigator';
import * as api from '../api/client';
import type { FitPost, PublicProfile, Relationship } from '../api/types';
import { absoluteUrl } from '../config';
import {
  GlassButton,
  GlassCard,
  ScreenBackground,
} from '../components/Glass';
import { Avatar } from '../components/Avatar';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import {
  radii,
  shadow,
  spacing,
  typography,
  type ThemeColors,
  type ThemeSurface,
} from '../theme';

type Props = NativeStackScreenProps<AppStackParamList, 'PublicProfile'>;

export function PublicProfileScreen({ route, navigation }: Props) {
  const { userId } = route.params;
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [posts, setPosts] = useState<FitPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const p = await api.fetchPublicProfile(userId);
      setProfile(p);
      // Only fetch posts if we'd be allowed to see them.
      if (p.relationship === 'self' || p.relationship === 'friends') {
        const r = await api.fetchUserPosts(userId);
        setPosts(r.posts);
      } else {
        setPosts([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  async function doAction(action: () => Promise<unknown>, errLabel: string) {
    if (acting) return;
    setActing(true);
    try {
      await action();
      await load();
    } catch (e) {
      Alert.alert(errLabel, e instanceof Error ? e.message : 'Error');
    } finally {
      setActing(false);
    }
  }

  function actionButton(relationship: Relationship, friendshipId?: number | null) {
    if (relationship === 'self') return null;
    if (relationship === 'friends') {
      return (
        <View style={styles.actionRow}>
          <View style={styles.statusPill}>
            <Ionicons name="checkmark" size={14} color={colors.accent} />
            <Text style={styles.statusText}>Friends</Text>
          </View>
          <Pressable
            onPress={() =>
              Alert.alert('Remove friend?', undefined, [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Remove',
                  style: 'destructive',
                  onPress: () =>
                    doAction(() => api.removeFriend(userId), 'Could not remove'),
                },
              ])
            }
            style={({ pressed }) => [
              styles.outlineBtn,
              { opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <Text style={styles.outlineBtnText}>Remove</Text>
          </Pressable>
        </View>
      );
    }
    if (relationship === 'request_sent') {
      return (
        <View style={styles.actionRow}>
          <View style={styles.statusPill}>
            <Text style={styles.statusText}>Request sent</Text>
          </View>
          <Pressable
            onPress={() =>
              doAction(() => api.removeFriend(userId), 'Could not cancel')
            }
            style={({ pressed }) => [
              styles.outlineBtn,
              { opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <Text style={styles.outlineBtnText}>Cancel</Text>
          </Pressable>
        </View>
      );
    }
    if (relationship === 'request_received' && friendshipId) {
      return (
        <View style={styles.actionRow}>
          <Pressable
            onPress={() =>
              doAction(
                () => api.acceptFriendRequest(friendshipId),
                'Could not accept'
              )
            }
            style={({ pressed }) => [
              styles.primaryBtn,
              { opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Text style={styles.primaryBtnText}>Accept</Text>
          </Pressable>
          <Pressable
            onPress={() =>
              doAction(
                () => api.rejectFriendRequest(friendshipId),
                'Could not reject'
              )
            }
            style={({ pressed }) => [
              styles.outlineBtn,
              { opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <Text style={styles.outlineBtnText}>Decline</Text>
          </Pressable>
        </View>
      );
    }
    return (
      <View style={styles.actionRow}>
        <Pressable
          onPress={() =>
            doAction(() => api.sendFriendRequest(userId), 'Could not send')
          }
          style={({ pressed }) => [
            styles.primaryBtn,
            { opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Ionicons name="person-add" size={16} color="#fff" />
          <Text style={styles.primaryBtnText}>Add friend</Text>
        </Pressable>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={{ flex: 1 }}>
        <ScreenBackground />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </View>
    );
  }

  if (error || !profile) {
    return (
      <View style={{ flex: 1 }}>
        <ScreenBackground />
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error || 'Profile unavailable'}</Text>
          <GlassButton
            title="Back"
            onPress={() => navigation.goBack()}
            fullWidth={false}
          />
        </View>
      </View>
    );
  }

  const canSeePosts =
    profile.relationship === 'self' || profile.relationship === 'friends';

  return (
    <View style={{ flex: 1 }}>
      <ScreenBackground />
      <ScrollView contentContainerStyle={styles.container}>
        <GlassCard padded style={styles.headerCard}>
          <View style={styles.headerTop}>
            <Avatar
              url={profile.avatar_url}
              name={profile.full_name}
              username={profile.username}
              size={76}
            />
            <View style={{ flex: 1, marginLeft: spacing.lg }}>
              <Text style={styles.name}>
                {profile.full_name || profile.username}
              </Text>
              <Text style={styles.handle}>@{profile.username}</Text>
            </View>
          </View>

          {profile.bio ? (
            <Text style={styles.bio}>{profile.bio}</Text>
          ) : null}

          <View style={styles.statsRow}>
            <Stat value={profile.post_count} label="Fits" styles={styles} />
            <Stat value={profile.friend_count} label="Friends" styles={styles} />
            <Stat value={profile.item_count} label="Items" styles={styles} />
          </View>

          {actionButton(profile.relationship, profile.friendship_id)}
        </GlassCard>

        <Text style={styles.sectionLabel}>Fits</Text>

        {!canSeePosts ? (
          <Text style={styles.lockedHint}>
            Become friends to see {profile.full_name || profile.username}'s
            posts.
          </Text>
        ) : posts.length === 0 ? (
          <Text style={styles.lockedHint}>No fits yet.</Text>
        ) : (
          <View style={styles.grid}>
            {posts.map((p) => {
              const uri = absoluteUrl(p.image_path);
              return (
                <Pressable
                  key={p.id}
                  onPress={() =>
                    navigation.navigate('FitDetail', { postId: p.id })
                  }
                  style={({ pressed }) => [
                    styles.gridItem,
                    { transform: [{ scale: pressed ? 0.97 : 1 }] },
                  ]}
                >
                  {uri ? (
                    <Image
                      source={{ uri }}
                      style={styles.gridImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={[styles.gridImage, styles.placeholder]} />
                  )}
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function Stat({
  value,
  label,
  styles,
}: {
  value: number;
  label: string;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const HEADER_PAD = Platform.OS === 'ios' ? 96 : 60;

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
      marginBottom: spacing.lg,
      fontSize: 15,
    },
    container: {
      paddingTop: HEADER_PAD,
      paddingHorizontal: spacing.lg,
      paddingBottom: 100,
    },
    headerCard: {
      padding: spacing.lg,
      marginBottom: spacing.lg,
    },
    headerTop: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    name: {
      ...typography.headline,
      color: colors.text,
    },
    handle: {
      fontSize: 14,
      color: colors.textSecondary,
      marginTop: 4,
    },
    bio: {
      ...typography.body,
      color: colors.textSecondary,
      marginTop: spacing.md,
      lineHeight: 22,
    },
    statsRow: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      marginTop: spacing.lg,
      paddingVertical: spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: colors.hairline,
    },
    stat: {
      alignItems: 'center',
    },
    statValue: {
      ...typography.headline,
      color: colors.text,
    },
    statLabel: {
      ...typography.micro,
      color: colors.textSecondary,
      marginTop: 4,
    },
    actionRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.lg,
    },
    primaryBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 12,
      borderRadius: radii.md,
      backgroundColor: colors.accent,
      ...shadow.button,
    },
    primaryBtnText: {
      color: '#fff',
      fontWeight: '700',
      fontSize: 15,
    },
    outlineBtn: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
      borderRadius: radii.md,
      backgroundColor: surface.chipInactive,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: surface.chipInactiveBorder,
    },
    outlineBtnText: {
      color: colors.text,
      fontWeight: '600',
      fontSize: 14,
    },
    statusPill: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      paddingVertical: 12,
      borderRadius: radii.md,
      backgroundColor: colors.accentSoft,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.accent,
    },
    statusText: {
      color: colors.accent,
      fontWeight: '700',
      fontSize: 13,
    },
    sectionLabel: {
      ...typography.micro,
      color: colors.textSecondary,
      marginBottom: spacing.sm,
      marginLeft: 4,
    },
    lockedHint: {
      color: colors.textMuted,
      textAlign: 'center',
      paddingVertical: spacing.xl,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    gridItem: {
      width: '32%',
      aspectRatio: 4 / 5,
      borderRadius: radii.sm,
      overflow: 'hidden',
    },
    gridImage: {
      width: '100%',
      height: '100%',
      backgroundColor: surface.thumbBg,
    },
    placeholder: {
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
