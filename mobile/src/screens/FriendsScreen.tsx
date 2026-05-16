import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AppStackParamList } from '../navigation/RootNavigator';
import * as api from '../api/client';
import type { Friend, FriendRequest, PublicUser } from '../api/types';
import {
  GlassButton,
  GlassCard,
  GlassInputContainer,
  ScreenBackground,
} from '../components/Glass';
import { Avatar } from '../components/Avatar';
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
  type ThemeSurface,
} from '../theme';

type Nav = NativeStackNavigationProp<AppStackParamList>;

type TabKey = 'friends' | 'requests' | 'search';

export function FriendsScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const scrollTop = stackScrollContentPaddingTop(insets);
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const [tab, setTab] = useState<TabKey>('friends');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [incoming, setIncoming] = useState<FriendRequest[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<PublicUser[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceTimer = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const [f, r] = await Promise.all([
        api.fetchFriends(),
        api.fetchFriendRequests(),
      ]);
      setFriends(f.friends);
      setIncoming(r.incoming);
      setOutgoing(r.outgoing);
    } catch (e) {
      Alert.alert('Could not load', e instanceof Error ? e.message : 'Error');
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

  useEffect(() => {
    if (debounceTimer.current !== null) {
      clearTimeout(debounceTimer.current);
    }
    const q = search.trim();
    if (q.length === 0) {
      setSearchResults([]);
      return;
    }
    debounceTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await api.searchUsers(q);
        setSearchResults(res.users);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 250) as unknown as number;
    return () => {
      if (debounceTimer.current !== null) clearTimeout(debounceTimer.current);
    };
  }, [search]);

  function onRefresh() {
    setRefreshing(true);
    load();
  }

  async function sendRequest(userId: number) {
    try {
      await api.sendFriendRequest(userId);
      Alert.alert('Sent', 'Friend request sent.');
      load();
    } catch (e) {
      Alert.alert('Could not send', e instanceof Error ? e.message : 'Error');
    }
  }

  async function accept(friendshipId: number) {
    try {
      await api.acceptFriendRequest(friendshipId);
      load();
    } catch (e) {
      Alert.alert('Could not accept', e instanceof Error ? e.message : 'Error');
    }
  }

  async function reject(friendshipId: number) {
    try {
      await api.rejectFriendRequest(friendshipId);
      load();
    } catch (e) {
      Alert.alert('Could not reject', e instanceof Error ? e.message : 'Error');
    }
  }

  async function unfriend(userId: number) {
    Alert.alert('Remove friend?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.removeFriend(userId);
            load();
          } catch (e) {
            Alert.alert('Could not remove', e instanceof Error ? e.message : 'Error');
          }
        },
      },
    ]);
  }

  const TABS: { key: TabKey; label: string; badge?: number }[] = [
    { key: 'friends', label: 'Friends', badge: friends.length },
    {
      key: 'requests',
      label: 'Requests',
      badge: incoming.length || undefined,
    },
    { key: 'search', label: 'Find' },
  ];

  return (
    <View style={{ flex: 1 }}>
      <ScreenBackground />
      <ScrollView
        contentContainerStyle={[styles.container, { paddingTop: scrollTop }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
          />
        }
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.heading}>Friends</Text>

        <View style={styles.tabsRow}>
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <Pressable
                key={t.key}
                onPress={() => setTab(t.key)}
                style={({ pressed }) => [
                  styles.tabBtn,
                  active && styles.tabBtnActive,
                  { opacity: pressed ? 0.85 : 1 },
                ]}
              >
                <Text
                  style={[
                    styles.tabText,
                    { color: active ? '#fff' : colors.text },
                  ]}
                >
                  {t.label}
                  {t.badge ? ` · ${t.badge}` : ''}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : tab === 'friends' ? (
          friends.length === 0 ? (
            <Text style={styles.emptyHint}>
              No friends yet. Use Find to look someone up.
            </Text>
          ) : (
            friends.map((f) => (
              <UserRow
                key={f.id}
                user={f}
                styles={styles}
                onPress={() =>
                  navigation.navigate('PublicProfile', { userId: f.id })
                }
                trailing={
                  <Pressable
                    onPress={() => unfriend(f.id)}
                    hitSlop={6}
                    style={({ pressed }) => [
                      styles.smallBtn,
                      { opacity: pressed ? 0.6 : 1, backgroundColor: 'transparent' },
                    ]}
                  >
                    <Ionicons
                      name="person-remove-outline"
                      size={18}
                      color={colors.danger}
                    />
                  </Pressable>
                }
              />
            ))
          )
        ) : tab === 'requests' ? (
          <View>
            <Text style={styles.sectionLabel}>
              Incoming · {incoming.length}
            </Text>
            {incoming.length === 0 ? (
              <Text style={styles.emptyHint}>No incoming requests.</Text>
            ) : (
              incoming.map((req) => (
                <UserRow
                  key={req.friendship_id}
                  user={req.user}
                  styles={styles}
                  onPress={() =>
                    navigation.navigate('PublicProfile', {
                      userId: req.user.id,
                    })
                  }
                  trailing={
                    <View style={styles.actionGroup}>
                      <Pressable
                        onPress={() => accept(req.friendship_id)}
                        style={({ pressed }) => [
                          styles.smallBtn,
                          styles.acceptBtn,
                          { opacity: pressed ? 0.85 : 1 },
                        ]}
                      >
                        <Text style={styles.acceptText}>Accept</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => reject(req.friendship_id)}
                        style={({ pressed }) => [
                          styles.smallBtn,
                          { opacity: pressed ? 0.6 : 1 },
                        ]}
                      >
                        <Text style={styles.rejectText}>Decline</Text>
                      </Pressable>
                    </View>
                  }
                />
              ))
            )}
            <Text style={[styles.sectionLabel, { marginTop: spacing.lg }]}>
              Outgoing · {outgoing.length}
            </Text>
            {outgoing.length === 0 ? (
              <Text style={styles.emptyHint}>No outgoing requests.</Text>
            ) : (
              outgoing.map((req) => (
                <UserRow
                  key={req.friendship_id}
                  user={req.user}
                  styles={styles}
                  onPress={() =>
                    navigation.navigate('PublicProfile', {
                      userId: req.user.id,
                    })
                  }
                  trailing={
                    <Pressable
                      onPress={() => unfriend(req.user.id)}
                      style={({ pressed }) => [
                        styles.smallBtn,
                        { opacity: pressed ? 0.6 : 1 },
                      ]}
                    >
                      <Text style={styles.rejectText}>Cancel</Text>
                    </Pressable>
                  }
                />
              ))
            )}
          </View>
        ) : (
          <View>
            <GlassInputContainer style={styles.searchShell}>
              <View style={styles.searchInner}>
                <Ionicons
                  name="search-outline"
                  size={18}
                  color={colors.textMuted}
                  style={{ marginLeft: 12, marginRight: 8 }}
                />
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search by username or name"
                  placeholderTextColor={colors.placeholder}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.searchInput}
                />
                {search.length > 0 ? (
                  <Pressable
                    onPress={() => setSearch('')}
                    hitSlop={8}
                    style={{ paddingHorizontal: 12 }}
                  >
                    <Ionicons
                      name="close-circle"
                      size={18}
                      color={colors.textMuted}
                    />
                  </Pressable>
                ) : null}
              </View>
            </GlassInputContainer>

            {searching ? (
              <ActivityIndicator
                color={colors.accent}
                style={{ marginTop: spacing.md }}
              />
            ) : search.trim().length === 0 ? (
              <Text style={styles.emptyHint}>
                Find people by their username or name.
              </Text>
            ) : searchResults.length === 0 ? (
              <Text style={styles.emptyHint}>No one matches that.</Text>
            ) : (
              searchResults.map((u) => (
                <UserRow
                  key={u.id}
                  user={u}
                  styles={styles}
                  onPress={() =>
                    navigation.navigate('PublicProfile', { userId: u.id })
                  }
                  trailing={
                    <Pressable
                      onPress={() => sendRequest(u.id)}
                      style={({ pressed }) => [
                        styles.smallBtn,
                        styles.acceptBtn,
                        { opacity: pressed ? 0.85 : 1 },
                      ]}
                    >
                      <Text style={styles.acceptText}>Add</Text>
                    </Pressable>
                  }
                />
              ))
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

type UserRowProps = {
  user: PublicUser;
  styles: ReturnType<typeof makeStyles>;
  onPress?: () => void;
  trailing?: React.ReactNode;
};

function UserRow({ user, styles, onPress, trailing }: UserRowProps) {
  return (
    <GlassCard padded={false} style={styles.userCard}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.userRow,
          { opacity: pressed && onPress ? 0.7 : 1 },
        ]}
      >
        <Avatar
          url={user.avatar_url}
          name={user.full_name}
          username={user.username}
          size={42}
        />
        <View style={styles.userText}>
          <Text style={styles.userName} numberOfLines={1}>
            {user.full_name || user.username}
          </Text>
          <Text style={styles.userHandle} numberOfLines={1}>
            @{user.username}
          </Text>
        </View>
        <View style={styles.trailing}>{trailing}</View>
      </Pressable>
    </GlassCard>
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
      paddingBottom: STACK_SCREEN_SCROLL_BOTTOM,
    },
    heading: {
      ...typography.title,
      color: colors.text,
      marginBottom: spacing.lg,
    },
    tabsRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: spacing.lg,
    },
    tabBtn: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: radii.pill,
      backgroundColor: surface.chipInactive,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: surface.chipInactiveBorder,
    },
    tabBtnActive: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    tabText: {
      fontSize: 13,
      fontWeight: '600',
    },
    centered: {
      paddingVertical: 40,
      alignItems: 'center',
    },
    sectionLabel: {
      ...typography.micro,
      color: colors.textSecondary,
      marginBottom: spacing.sm,
      marginLeft: 4,
    },
    emptyHint: {
      color: colors.textMuted,
      marginVertical: spacing.md,
      textAlign: 'center',
    },
    userCard: {
      marginBottom: spacing.sm,
      overflow: 'hidden',
    },
    userRow: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: spacing.md,
    },
    userText: {
      flex: 1,
      marginLeft: spacing.md,
    },
    userName: {
      ...typography.bodyMedium,
      color: colors.text,
    },
    userHandle: {
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 2,
    },
    trailing: {
      marginLeft: spacing.sm,
    },
    actionGroup: {
      flexDirection: 'row',
      gap: 6,
    },
    smallBtn: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: radii.pill,
      backgroundColor: surface.chipInactive,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: surface.chipInactiveBorder,
    },
    acceptBtn: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    acceptText: {
      color: '#fff',
      fontWeight: '700',
      fontSize: 13,
    },
    rejectText: {
      color: colors.textSecondary,
      fontWeight: '600',
      fontSize: 13,
    },
    searchShell: {
      marginBottom: spacing.md,
    },
    searchInner: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    searchInput: {
      flex: 1,
      paddingVertical: 12,
      paddingRight: 12,
      fontSize: 15,
      color: colors.text,
    },
  });
}
