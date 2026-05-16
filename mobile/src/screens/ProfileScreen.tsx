import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as api from '../api/client';
import type { FitPost, PublicProfile } from '../api/types';
import { API_ORIGIN, absoluteUrl } from '../config';
import { useAuth } from '../context/AuthContext';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import {
  GlassButton,
  GlassCard,
  GlassInputContainer,
  ScreenBackground,
} from '../components/Glass';
import { Avatar } from '../components/Avatar';
import type { AppStackParamList } from '../navigation/RootNavigator';
import { imagePickerAssetToUpload } from '../utils/imageUpload';
import {
  getLocationPermissionLabel,
  getWeatherSyncEnabled,
  requestCurrentCoordinates,
  setWeatherSyncEnabled,
} from '../weather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tabTopPadding } from '../utils/screenSpacing';
import {
  radii,
  shadow,
  spacing,
  typography,
  type ThemeColors,
  type ThemeSurface,
  type ThemePref,
} from '../theme';

type Nav = NativeStackNavigationProp<AppStackParamList>;

type ThemeOption = {
  value: ThemePref;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
};

const THEME_OPTIONS: ThemeOption[] = [
  { value: 'system', label: 'System', icon: 'phone-portrait-outline' },
  { value: 'light', label: 'Light', icon: 'sunny-outline' },
  { value: 'dark', label: 'Dark', icon: 'moon-outline' },
];

export function ProfileScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const headerPad = tabTopPadding(insets);
  const { user, signOut, refreshUser } = useAuth();
  const { colors, surface, pref, mode, setPref } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [posts, setPosts] = useState<FitPost[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(true);

  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftBio, setDraftBio] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [weatherSync, setWeatherSync] = useState(false);
  const [weatherPermission, setWeatherPermission] = useState('Unknown');

  const loadProfileAndPosts = useCallback(async () => {
    if (!user) return;
    try {
      const [p, postsRes] = await Promise.all([
        api.fetchPublicProfile(user.id),
        api.fetchUserPosts(user.id),
      ]);
      setProfile(p);
      setPosts(postsRes.posts);
    } catch {
      // Best-effort — profile counts are decorative.
    } finally {
      setLoadingPosts(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      setLoadingPosts(true);
      loadProfileAndPosts();
      getWeatherSyncEnabled().then(setWeatherSync);
      getLocationPermissionLabel().then(setWeatherPermission);
    }, [loadProfileAndPosts])
  );

  async function toggleWeatherSync() {
    const next = !weatherSync;
    if (next) {
      try {
        await requestCurrentCoordinates();
      } catch (e) {
        Alert.alert(
          'Location not enabled',
          e instanceof Error ? e.message : 'Could not access your location.'
        );
        setWeatherPermission(await getLocationPermissionLabel());
        return;
      }
    }
    setWeatherSync(next);
    await setWeatherSyncEnabled(next);
    setWeatherPermission(await getLocationPermissionLabel());
  }

  function beginEdit() {
    setDraftName(user?.full_name ?? '');
    setDraftBio(user?.bio ?? '');
    setEditing(true);
  }

  async function saveEdit() {
    if (savingEdit) return;
    setSavingEdit(true);
    try {
      await api.updateProfile({
        full_name: draftName.trim() || null,
        bio: draftBio.trim() || null,
      });
      await refreshUser();
      setEditing(false);
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Error');
    } finally {
      setSavingEdit(false);
    }
  }

  async function changeAvatar() {
    if (uploadingAvatar) return;
    const lib = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!lib.granted) {
      Alert.alert('Permission needed', 'Allow photo library access first.');
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      preferredAssetRepresentationMode:
        ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (picked.canceled || !picked.assets?.[0]) return;
    setUploadingAvatar(true);
    try {
      const photo = await imagePickerAssetToUpload(picked.assets[0], 'avatar');
      await api.uploadAvatar(photo);
      await refreshUser();
      await loadProfileAndPosts();
    } catch (e) {
      Alert.alert(
        'Could not update photo',
        e instanceof Error ? e.message : 'Error'
      );
    } finally {
      setUploadingAvatar(false);
    }
  }

  if (!user) return null;
  const socialEnabled = user.social_enabled !== false;

  return (
    <View style={{ flex: 1 }}>
      <ScreenBackground />
      <ScrollView
        contentContainerStyle={[styles.container, { paddingTop: headerPad }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headerRow}>
          <Text style={styles.heading}>Profile</Text>
          {socialEnabled ? (
            <Pressable
              onPress={() => navigation.navigate('Friends')}
              style={({ pressed }) => [
                styles.headerBtn,
                { opacity: pressed ? 0.7 : 1 },
              ]}
              accessibilityLabel="Friends"
            >
              <Ionicons name="people-outline" size={20} color={colors.text} />
            </Pressable>
          ) : null}
        </View>

        <GlassCard padded style={styles.card}>
          <View style={styles.identityRow}>
            <Pressable
              onPress={changeAvatar}
              disabled={uploadingAvatar}
              style={styles.avatarWrap}
            >
              <Avatar
                url={user.avatar_url}
                name={user.full_name}
                username={user.username}
                size={68}
              />
              <View style={styles.cameraBadge}>
                {uploadingAvatar ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="camera" size={12} color="#fff" />
                )}
              </View>
            </Pressable>
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <Text style={styles.name}>
                {user.full_name || user.username}
              </Text>
              <Text style={styles.handle}>@{user.username}</Text>
              <Text style={styles.meta}>{user.email}</Text>
            </View>
          </View>

          {!editing && user.bio ? (
            <Text style={styles.bio}>{user.bio}</Text>
          ) : null}

          {editing ? (
            <View style={styles.editBlock}>
              <Text style={styles.fieldLabel}>Name</Text>
              <GlassInputContainer style={styles.fieldShell}>
                <TextInput
                  value={draftName}
                  onChangeText={setDraftName}
                  placeholder="Display name"
                  placeholderTextColor={colors.placeholder}
                  style={styles.fieldInput}
                  maxLength={80}
                />
              </GlassInputContainer>

              <Text style={styles.fieldLabel}>Bio</Text>
              <GlassInputContainer
                style={[styles.fieldShell, { minHeight: 90 }]}
              >
                <TextInput
                  value={draftBio}
                  onChangeText={setDraftBio}
                  placeholder="A line about you"
                  placeholderTextColor={colors.placeholder}
                  style={[styles.fieldInput, { minHeight: 90 }]}
                  multiline
                  maxLength={400}
                  textAlignVertical="top"
                />
              </GlassInputContainer>

              <View style={styles.editActions}>
                <GlassButton
                  title="Save"
                  onPress={saveEdit}
                  loading={savingEdit}
                  style={{ flex: 1 }}
                />
                <GlassButton
                  title="Cancel"
                  onPress={() => setEditing(false)}
                  variant="ghost"
                  style={{ flex: 1 }}
                />
              </View>
            </View>
          ) : (
            <View style={styles.statsRow}>
              <Stat
                value={profile?.post_count ?? 0}
                label="Fits"
                styles={styles}
              />
              {socialEnabled ? (
                <Stat
                  value={profile?.friend_count ?? 0}
                  label="Friends"
                  styles={styles}
                  onPress={() => navigation.navigate('Friends')}
                />
              ) : null}
              <Stat
                value={profile?.item_count ?? 0}
                label="Items"
                styles={styles}
              />
            </View>
          )}

          {!editing ? (
            <View style={styles.profileActions}>
              <GlassButton
                title="Edit profile"
                onPress={beginEdit}
                variant="ghost"
                style={{ flex: 1 }}
              />
              {socialEnabled ? (
                <GlassButton
                  title="Post fit"
                  onPress={() => navigation.navigate('CreateFit')}
                  style={{ flex: 1 }}
                />
              ) : null}
            </View>
          ) : null}
        </GlassCard>

        {socialEnabled ? (
          <>
            <Text style={styles.sectionLabel}>Your fits</Text>
            {loadingPosts ? (
              <View style={{ paddingVertical: spacing.lg }}>
                <ActivityIndicator color={colors.accent} />
              </View>
            ) : posts.length === 0 ? (
              <Text style={styles.emptyHint}>
                You haven't posted yet. Tap Post fit to share today's look.
              </Text>
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
                        <Image source={{ uri }} style={styles.gridImage} />
                      ) : (
                        <View style={[styles.gridImage, styles.gridPlaceholder]} />
                      )}
                    </Pressable>
                  );
                })}
              </View>
            )}
          </>
        ) : null}

        <Text style={styles.sectionLabel}>Closet</Text>
        <Pressable
          onPress={() => navigation.navigate('PersonalSettings')}
          style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
        >
          <GlassCard padded style={styles.card}>
            <View style={styles.rowHeader}>
              <Ionicons
                name="settings-outline"
                size={18}
                color={colors.accent}
                style={{ marginRight: 8 }}
              />
              <Text style={styles.rowTitle}>Personal settings</Text>
              <View style={{ flex: 1 }} />
              <Ionicons
                name="chevron-forward"
                size={16}
                color={colors.textMuted}
              />
            </View>
            <Text style={styles.hint}>
              Account, layout, weather, social mode, and closet locations.
            </Text>
          </GlassCard>
        </Pressable>
        <Pressable
          onPress={() => navigation.navigate('PackMode')}
          style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
        >
          <GlassCard padded style={styles.card}>
            <View style={styles.rowHeader}>
              <Ionicons
                name="airplane-outline"
                size={18}
                color={colors.accent}
                style={{ marginRight: 8 }}
              />
              <Text style={styles.rowTitle}>Pack Mode</Text>
              <View style={{ flex: 1 }} />
              <Ionicons
                name="chevron-forward"
                size={16}
                color={colors.textMuted}
              />
            </View>
            <Text style={styles.hint}>
              Build a travel bag, bulk pack or unpack items, and use it for trip
              outfit ideas.
            </Text>
          </GlassCard>
        </Pressable>
        <Pressable
          onPress={() => navigation.navigate('Wishlist')}
          style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
        >
          <GlassCard padded style={styles.card}>
            <View style={styles.rowHeader}>
              <Ionicons
                name="bookmark-outline"
                size={18}
                color={colors.accent}
                style={{ marginRight: 8 }}
              />
              <Text style={styles.rowTitle}>Wishlist</Text>
              <View style={{ flex: 1 }} />
              <Ionicons
                name="chevron-forward"
                size={16}
                color={colors.textMuted}
              />
            </View>
            <Text style={styles.hint}>
              Things you want — kept out of your closet, outfits, and stats
              until you promote them.
            </Text>
          </GlassCard>
        </Pressable>
        <Pressable
          onPress={() => navigation.navigate('Stats')}
          style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
        >
          <GlassCard padded style={styles.card}>
            <View style={styles.rowHeader}>
              <Ionicons
                name="stats-chart-outline"
                size={18}
                color={colors.accent}
                style={{ marginRight: 8 }}
              />
              <Text style={styles.rowTitle}>Closet stats</Text>
              <View style={{ flex: 1 }} />
              <Ionicons
                name="chevron-forward"
                size={16}
                color={colors.textMuted}
              />
            </View>
            <Text style={styles.hint}>
              Wear counts, category breakdown, most-loved items.
            </Text>
          </GlassCard>
        </Pressable>

        <Text style={styles.sectionLabel}>Weather</Text>
        <GlassCard padded style={styles.card}>
          <View style={styles.rowHeader}>
            <Ionicons
              name="partly-sunny-outline"
              size={18}
              color={colors.accent}
              style={{ marginRight: 8 }}
            />
            <Text style={styles.rowTitle}>Weather sync</Text>
          </View>
          <Text style={styles.hint}>
            {weatherSync
              ? `On - location ${weatherPermission.toLowerCase()}`
              : `Off - location ${weatherPermission.toLowerCase()}`}
          </Text>
          <GlassButton
            title={weatherSync ? 'Turn off weather sync' : 'Turn on weather sync'}
            variant={weatherSync ? 'secondary' : 'primary'}
            onPress={toggleWeatherSync}
            style={{ marginTop: spacing.md }}
          />
        </GlassCard>

        <Text style={styles.sectionLabel}>Appearance</Text>
        <GlassCard padded style={styles.card}>
          <View style={styles.rowHeader}>
            <Ionicons
              name="color-palette-outline"
              size={18}
              color={colors.accent}
              style={{ marginRight: 8 }}
            />
            <Text style={styles.rowTitle}>Theme</Text>
          </View>
          <Text style={styles.hint}>
            {pref === 'system'
              ? `Following system · currently ${mode}`
              : `Always ${pref}`}
          </Text>

          <View style={styles.segment}>
            {THEME_OPTIONS.map((opt) => {
              const active = pref === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => setPref(opt.value)}
                  style={({ pressed }) => [
                    styles.segmentBtn,
                    {
                      backgroundColor: active
                        ? colors.accent
                        : surface.chipInactive,
                      borderColor: active
                        ? colors.accent
                        : surface.chipInactiveBorder,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}
                >
                  <Ionicons
                    name={opt.icon}
                    size={16}
                    color={active ? '#fff' : colors.text}
                    style={{ marginRight: 6 }}
                  />
                  <Text
                    style={[
                      styles.segmentText,
                      { color: active ? '#fff' : colors.text },
                    ]}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </GlassCard>

        <Text style={styles.sectionLabel}>Connection</Text>
        <GlassCard padded style={styles.card}>
          <View style={styles.rowHeader}>
            <Ionicons
              name="cloud-outline"
              size={18}
              color={colors.accent}
              style={{ marginRight: 8 }}
            />
            <Text style={styles.rowTitle}>API server</Text>
          </View>
          <Text style={styles.api}>{API_ORIGIN}</Text>
          <Text style={styles.hint}>
            Set EXPO_PUBLIC_API_URL when starting Expo if this device cannot
            reach localhost (e.g. http://192.168.x.x:8000).
          </Text>
        </GlassCard>

        <GlassButton
          title="Sign out"
          onPress={signOut}
          variant="danger"
          style={styles.signOut}
        />
      </ScrollView>
    </View>
  );
}

function Stat({
  value,
  label,
  styles,
  onPress,
}: {
  value: number;
  label: string;
  styles: ReturnType<typeof makeStyles>;
  onPress?: () => void;
}) {
  const inner = (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        hitSlop={6}
        style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, flex: 1 })}
      >
        {inner}
      </Pressable>
    );
  }
  return <View style={{ flex: 1 }}>{inner}</View>;
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
      paddingHorizontal: spacing.xl,
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
      flex: 1,
    },
    headerBtn: {
      width: 40,
      height: 40,
      borderRadius: radii.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: surface.chipInactive,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: surface.chipInactiveBorder,
    },
    card: {
      padding: spacing.lg,
      marginBottom: spacing.md,
    },
    identityRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    avatarWrap: {
      position: 'relative',
      ...shadow.card,
    },
    cameraBadge: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: colors.bg,
    },
    name: {
      ...typography.headline,
      color: colors.text,
    },
    handle: {
      fontSize: 14,
      color: colors.textSecondary,
      marginTop: 2,
    },
    meta: {
      fontSize: 13,
      color: colors.textMuted,
      marginTop: 2,
    },
    bio: {
      ...typography.body,
      color: colors.text,
      marginTop: spacing.md,
      lineHeight: 22,
    },
    statsRow: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      marginTop: spacing.lg,
      paddingVertical: spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
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
    profileActions: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    editBlock: {
      marginTop: spacing.md,
    },
    fieldLabel: {
      ...typography.micro,
      color: colors.textSecondary,
      marginBottom: 6,
      marginLeft: 4,
    },
    fieldShell: {
      marginBottom: spacing.md,
      minHeight: 48,
    },
    fieldInput: {
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: colors.text,
      fontSize: 15,
    },
    editActions: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.sm,
    },
    sectionLabel: {
      ...typography.micro,
      color: colors.textSecondary,
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
      marginLeft: 4,
    },
    emptyHint: {
      color: colors.textMuted,
      textAlign: 'center',
      paddingVertical: spacing.xl,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginBottom: spacing.md,
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
    gridPlaceholder: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 8,
    },
    rowTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text,
    },
    api: {
      fontSize: 14,
      color: colors.textSecondary,
      fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
      marginBottom: spacing.sm,
    },
    hint: {
      fontSize: 13,
      color: colors.textMuted,
      lineHeight: 18,
    },
    segment: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    segmentBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
      paddingHorizontal: 8,
      borderRadius: radii.md,
      borderWidth: StyleSheet.hairlineWidth,
    },
    segmentText: {
      fontSize: 14,
      fontWeight: '600',
    },
    signOut: {
      marginTop: spacing.xl,
    },
  });
}
